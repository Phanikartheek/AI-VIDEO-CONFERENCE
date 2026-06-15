"""Waiting-room WebSocket manager.

Keeps lightweight sockets open for users who are waiting for host approval.
When the host approves/rejects a waiting-room entry, the backend sends a
message directly to that user's socket.
"""
from collections import defaultdict
from typing import Dict, Set
from fastapi import WebSocket


class WaitingRoomWebSocketManager:
    def __init__(self) -> None:
        self._connections: Dict[str, Dict[str, Set[WebSocket]]] = defaultdict(
            lambda: defaultdict(set)
        )

    async def connect(self, meeting_id: str, user_id: str, ws: WebSocket) -> None:
        await ws.accept()
        self._connections[meeting_id][user_id].add(ws)

    def disconnect(self, meeting_id: str, user_id: str, ws: WebSocket) -> None:
        meeting = self._connections.get(meeting_id, {})
        sockets = meeting.get(user_id)
        if sockets and ws in sockets:
            sockets.discard(ws)
            if not sockets:
                del meeting[user_id]
        if meeting_id in self._connections and not self._connections[meeting_id]:
            del self._connections[meeting_id]

    async def send_to_user(self, meeting_id: str, user_id: str, message: dict) -> None:
        sockets = self._connections.get(meeting_id, {}).get(user_id, set())
        dead: list[WebSocket] = []
        for ws in sockets:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(meeting_id, user_id, ws)


waiting_room_ws_manager = WaitingRoomWebSocketManager()
