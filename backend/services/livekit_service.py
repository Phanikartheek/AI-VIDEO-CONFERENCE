"""
LiveKit token generation service.

In production, uses the livekit-api SDK to generate access tokens.
Falls back to a manual JWT approach for dev environments.
"""

import uuid
from datetime import datetime, timedelta, timezone

import jwt

from backend.config import settings


class LiveKitService:
    """Generates LiveKit-compatible access tokens for meeting rooms."""

    @staticmethod
    def create_access_token(
        room_name: str,
        participant_identity: str,
        participant_name: str = "",
        can_publish: bool = True,
        can_subscribe: bool = True,
    ) -> str:
        """
        Generate a LiveKit access token.
        Uses manual JWT generation compatible with LiveKit protocol.
        """
        now = datetime.now(timezone.utc)
        grant = {
            "roomJoin": True,
            "room": room_name,
            "canPublish": can_publish,
            "canSubscribe": can_subscribe,
        }

        payload = {
            "iss": settings.LIVEKIT_API_KEY,
            "sub": participant_identity,
            "name": participant_name or participant_identity,
            "nbf": int(now.timestamp()),
            "exp": int((now + timedelta(hours=6)).timestamp()),
            "iat": int(now.timestamp()),
            "jti": str(uuid.uuid4()),
            "video": grant,
        }

        return jwt.encode(
            payload,
            settings.LIVEKIT_API_SECRET,
            algorithm="HS256",
        )
