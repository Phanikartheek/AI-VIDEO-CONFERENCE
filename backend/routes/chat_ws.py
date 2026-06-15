"""Chat + Reactions WebSocket for FocusMeet.

/ws/meetings/{id}/chat — real-time chat + emoji reactions + typing indicators.

On connect: sends last 50 messages as {type:"history", messages:[...]}.
On receive {type:"message", text}: persist ChatMessage, broadcast to all.
On receive {type:"typing"}: broadcast typing indicator to others (no persist).
On receive {type:"reaction", emoji}: broadcast to all, log to Redis for features.
"""
import json
import time
import uuid

import jwt
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from sqlalchemy import select

from backend.config import settings
from backend.db.redis_client import redis_client
from backend.db.session import AsyncSessionLocal
from backend.models.chat_message import ChatMessage
from backend.services.websocket_manager import WebSocketManager

router = APIRouter(tags=["chat"])

chat_ws_manager = WebSocketManager()


async def _verify(token: str) -> dict:
    return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])


async def _load_history(meeting_id: str, limit: int = 50) -> list[dict]:
    async with AsyncSessionLocal() as db:
        stmt = (
            select(ChatMessage)
            .where(ChatMessage.meeting_id == uuid.UUID(meeting_id))
            .order_by(ChatMessage.created_at.desc())
            .limit(limit)
        )
        result = await db.execute(stmt)
        rows = list(result.scalars().all())
    rows.reverse()
    return [
        {
            "id": str(r.id), "user_id": str(r.user_id) if r.user_id else None,
            "sender_name": r.sender_name, "text": r.text,
            "timestamp": r.timestamp,
        }
        for r in rows
    ]


async def _persist_message(meeting_id: str, user_id: str, sender_name: str, text: str) -> dict:
    ts = time.time()
    msg_id = uuid.uuid4()
    async with AsyncSessionLocal() as db:
        msg = ChatMessage(
            id=msg_id,
            meeting_id=uuid.UUID(meeting_id),
            user_id=uuid.UUID(user_id) if user_id else None,
            sender_name=sender_name,
            text=text,
            timestamp=ts,
        )
        db.add(msg)
        await db.commit()
    return {
        "id": str(msg_id), "user_id": user_id,
        "sender_name": sender_name, "text": text, "timestamp": ts,
    }


@router.websocket("/ws/meetings/{meeting_id}/chat")
async def chat_ws(websocket: WebSocket, meeting_id: str, token: str = Query(...)):
    try:
        payload = await _verify(token)
    except jwt.PyJWTError:
        await websocket.close(code=4401)
        return

    user_id = str(payload.get("sub") or payload.get("user_id") or "anon")
    user_name = str(payload.get("name") or payload.get("email") or user_id)

    await chat_ws_manager.connect(meeting_id, user_id, websocket)

    # Send history
    history = await _load_history(meeting_id)
    try:
        await websocket.send_json({"type": "history", "messages": history})
    except Exception:
        pass

    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type", "message")

            if msg_type == "message":
                text = (data.get("text") or "").strip()
                if not text:
                    continue
                name = data.get("sender_name") or user_name
                saved = await _persist_message(meeting_id, user_id, name, text)
                await chat_ws_manager.broadcast(meeting_id, {"type": "message", **saved})
                # Push typing event to Redis for feature extraction
                await redis_client.rpush(
                    f"typing:{meeting_id}:{user_id}",
                    json.dumps({"timestamp": time.time()}),
                )

            elif msg_type == "typing":
                await chat_ws_manager.broadcast(meeting_id, {
                    "type": "typing_indicator",
                    "user_id": user_id,
                    "sender_name": data.get("sender_name") or user_name,
                })
                # Log typing event for feature extraction
                await redis_client.rpush(
                    f"typing:{meeting_id}:{user_id}",
                    json.dumps({"timestamp": time.time()}),
                )

            elif msg_type == "reaction":
                emoji = data.get("emoji", "👍")
                payload_out = {
                    "type": "reaction",
                    "user_id": user_id,
                    "sender_name": data.get("sender_name") or user_name,
                    "emoji": emoji,
                    "timestamp": time.time(),
                }
                await chat_ws_manager.broadcast(meeting_id, payload_out)
                # Log reaction to Redis for feature extraction
                await redis_client.rpush(
                    f"reactions:{meeting_id}:{user_id}",
                    json.dumps({"timestamp": time.time(), "emoji": emoji}),
                )

    except WebSocketDisconnect:
        pass
    finally:
        chat_ws_manager.disconnect(meeting_id, user_id, websocket)
