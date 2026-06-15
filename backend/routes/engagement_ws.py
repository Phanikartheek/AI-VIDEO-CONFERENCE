"""WebSocket endpoint for real-time engagement.

Client flow:
    connect  ws://host/ws/meetings/{meeting_id}/engagement?token=JWT
    send     {"user_id": "...", "engagement_score": 72, "timestamp": 1234.5,
              "breakdown": {"video":.,"mic":.,"typing":.,"chat":..}}
    receive  {"type": "low_engagement_alert", "avg_score": ...}       (host only)
    receive  {"type": "dropoff_risk_alert", "user_id": ..., ...}      (host only)

The server:
  1. validates the Bearer/invite JWT
  2. stores each sample in a Redis sorted set (per user, per meeting)
  3. every 30s:
     a) computes group average; if < 40 for 2 consecutive checks → low_engagement_alert
     b) runs per-participant drop-off prediction → dropoff_risk_alert for newly flagged
"""
import asyncio
import uuid

import jwt
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query

from backend.config import settings
from backend.services.engagement_service import EngagementService
from backend.services.dropoff_predictor import check_and_flag_dropoffs
from backend.services.websocket_manager import ws_manager

router = APIRouter(tags=["engagement"])


async def _verify_ws_token(token: str) -> dict:
    payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    return payload


@router.websocket("/ws/meetings/{meeting_id}/engagement")
async def engagement_ws(
    websocket: WebSocket,
    meeting_id: str,
    token: str = Query(...),
):
    try:
        payload = await _verify_ws_token(token)
    except jwt.PyJWTError:
        await websocket.close(code=4401)
        return

    user_id = str(payload.get("sub") or payload.get("user_id") or "anonymous")
    await ws_manager.connect(meeting_id, user_id, websocket)

    checker_task = _ensure_checker(meeting_id)

    try:
        while True:
            data = await websocket.receive_json()
            try:
                uid = str(data.get("user_id", user_id))
                score = float(data.get("engagement_score", 0))
                breakdown = data.get("breakdown")
                display_name = data.get("name")
                await EngagementService.record_sample(
                    meeting_id, uid, score, breakdown, display_name
                )
            except (TypeError, ValueError):
                continue
    except WebSocketDisconnect:
        pass
    finally:
        ws_manager.disconnect(meeting_id, user_id, websocket)
        _maybe_cancel_checker(meeting_id, checker_task)


# ── Per-meeting background checker registry ─────────────────
_checkers: dict[str, asyncio.Task] = {}


def _ensure_checker(meeting_id: str) -> asyncio.Task:
    existing = _checkers.get(meeting_id)
    if existing and not existing.done():
        return existing
    task = asyncio.create_task(_alert_loop(meeting_id))
    _checkers[meeting_id] = task
    return task


def _maybe_cancel_checker(meeting_id: str, task: asyncio.Task) -> None:
    if not ws_manager.get_participants(meeting_id):
        t = _checkers.pop(meeting_id, None)
        if t and not t.done():
            t.cancel()


async def _alert_loop(meeting_id: str) -> None:
    """Every check interval, evaluate group avg + per-user drop-off and alert host."""
    from backend.db.session import AsyncSessionLocal
    from backend.models.meeting import Meeting
    from sqlalchemy import select

    await asyncio.sleep(settings.ENGAGEMENT_CHECK_INTERVAL_SEC)
    while ws_manager.get_participants(meeting_id):
        host_id = None
        async with AsyncSessionLocal() as db:
            res = await db.execute(
                select(Meeting.host_id).where(Meeting.id == uuid.UUID(meeting_id))
            )
            row = res.first()
            if row:
                host_id = str(row[0])

        if host_id:
            # 1. Group-level low-engagement alert
            alert = await EngagementService.check_low_engagement(meeting_id, host_id)
            if alert:
                await ws_manager.send_to_user(meeting_id, host_id, alert)

            # 2. Per-participant drop-off prediction
            dropoff_alerts = await check_and_flag_dropoffs(meeting_id, host_id)
            for da in dropoff_alerts:
                await ws_manager.send_to_user(meeting_id, host_id, da)

        await asyncio.sleep(settings.ENGAGEMENT_CHECK_INTERVAL_SEC)

    _checkers.pop(meeting_id, None)
