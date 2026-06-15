import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt

from backend.config import settings
from backend.models.meeting import Meeting


PUBLIC_INVITE_USER_ID = "public"
PUBLIC_INVITE_EXPIRE_HOURS = 4


class InviteService:
    """
    Tiered invite service.

    - Per-user invite tokens: secure default for smaller/private meetings.
    - Public invite links: shareable, time-limited, revocable, versioned.
    """

    @staticmethod
    def create_invite_token(
        meeting_id: uuid.UUID,
        user_id: uuid.UUID,
        role: str = "participant",
        expire_minutes: Optional[int] = None,
    ) -> str:
        """Create a per-user invite token."""
        exp_mins = expire_minutes or settings.JWT_INVITE_EXPIRE_MINUTES
        payload = {
            "type": "invite",
            "meeting_id": str(meeting_id),
            "user_id": str(user_id),
            "role": role,
            "is_public": False,
            "exp": datetime.now(timezone.utc) + timedelta(minutes=exp_mins),
            "iat": datetime.now(timezone.utc),
            "jti": str(uuid.uuid4()),
        }
        return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)

    @staticmethod
    def create_public_invite_token(meeting: Meeting, role: str = "participant") -> tuple[str, datetime]:
        """
        Create a shareable public invite token.

        JWT payload includes:
          {meeting_id, user_id:"public", token_version, exp:+4h}

        The host can revoke all outstanding public links instantly by incrementing
        `meeting.public_invite_token_version`.
        """
        expires_at = datetime.now(timezone.utc) + timedelta(hours=PUBLIC_INVITE_EXPIRE_HOURS)
        payload = {
            "type": "invite",
            "meeting_id": str(meeting.id),
            "user_id": PUBLIC_INVITE_USER_ID,
            "role": role,
            "is_public": True,
            "token_version": meeting.public_invite_token_version,
            "exp": expires_at,
            "iat": datetime.now(timezone.utc),
            "jti": str(uuid.uuid4()),
        }
        token = jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
        return token, expires_at

    @staticmethod
    def validate_invite_token(token: str) -> dict:
        """Validate and decode an invite token."""
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
        )

        if payload.get("type") != "invite":
            raise jwt.InvalidTokenError("Token is not an invite token")

        required_fields = ["meeting_id", "user_id", "role"]
        for field in required_fields:
            if field not in payload:
                raise jwt.InvalidTokenError(f"Missing field: {field}")

        if "is_public" not in payload:
            payload["is_public"] = payload["user_id"] == PUBLIC_INVITE_USER_ID

        return payload

    @staticmethod
    def is_public_token(invite_data: dict) -> bool:
        return (
            invite_data.get("is_public", False)
            or invite_data.get("user_id") == PUBLIC_INVITE_USER_ID
        )
