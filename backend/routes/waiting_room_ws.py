"""Waiting-room notification WebSocket.

Clients that are waiting for host approval connect here and receive:
  - {type: "join_approved", livekit_token, meeting_id, room_name, role}
  - {type: "join_rejected", reason}
"""
import jwt
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from backend.config import settings
from backend.services.waiting_room_ws_manager import waiting_room_ws_manager

router = APIRouter(tags=["waiting-room"])


async def _verify_ws_token(token: str) -> dict:
    return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])


@router.websocket("/ws/meetings/{meeting_id}/waiting-room")
async def waiting_room_ws(websocket: WebSocket, meeting_id: str, token: str = Query(...)):
    try:
        payload = await _verify_ws_token(token)
    except jwt.PyJWTError:
        await websocket.close(code=4401)
        return

    user_id = str(payload.get("sub") or payload.get("user_id") or "anonymous")
    await waiting_room_ws_manager.connect(meeting_id, user_id, websocket)
    try:
        while True:
            # Keep socket alive; clients don't need to send anything.
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        waiting_room_ws_manager.disconnect(meeting_id, user_id, websocket)
