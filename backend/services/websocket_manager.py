"""WebSocket connection manager for engagement channels.

Tracks WebSocket connections per meeting (and per user within a meeting),
so the engagement engine can push low-engagement alerts to a host's socket.
"""
from collections import defaultdict
from typing import Dict, Set
from fastapi import WebSocket


class WebSocketManager:
    """Manages active WebSocket connections grouped by meeting.

    Structure:
        connections[meeting_id][user_id] = {websocket, ...}
    """

    def __init__(self) -> None:
        # meeting_id -> user_id -> set of sockets
        self._connections: Dict[str, Dict[str, Set[WebSocket]]] = defaultdict(
            lambda: defaultdict(set)
        )

    async def connect(self, meeting_id: str, user_id: str, ws: WebSocket) -> None:
        await ws.accept()
        self._connections[meeting_id][user_id].add(ws)

    def disconnect(self, meeting_id: str, user_id: str, ws: WebSocket) -> None:
        user_sockets = self._connections.get(meeting_id, {}).get(user_id)
        if user_sockets and ws in user_sockets:
            user_sockets.discard(ws)
            if not user_sockets:
                del self._connections[meeting_id][user_id]
        if meeting_id in self._connections and not self._connections[meeting_id]:
            del self._connections[meeting_id]

    async def send_to_user(self, meeting_id: str, user_id: str, message: dict) -> None:
        """Send a JSON message to every socket owned by a specific user."""
        user_sockets = self._connections.get(meeting_id, {}).get(user_id, set())
        dead: list[WebSocket] = []
        for ws in user_sockets:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(meeting_id, user_id, ws)

    async def broadcast(self, meeting_id: str, message: dict) -> None:
        """Send a JSON message to every socket in a meeting."""
        meeting = self._connections.get(meeting_id, {})
        for user_id, sockets in list(meeting.items()):
            await self.send_to_user(meeting_id, user_id, message)

    def get_participants(self, meeting_id: str) -> Set[str]:
        """Return the set of user_ids currently connected to a meeting."""
        return set(self._connections.get(meeting_id, {}).keys())


# Shared singleton
ws_manager = WebSocketManager()
