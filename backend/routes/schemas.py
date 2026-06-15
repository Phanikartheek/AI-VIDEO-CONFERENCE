"""Pydantic schemas for request/response validation."""

from datetime import datetime
from typing import Optional, List, Literal
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


# ─── Auth ────────────────────────────────────────────────────
class RegisterRequest(BaseModel):
    email: EmailStr
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=8)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserResponse"


class UserResponse(BaseModel):
    id: UUID
    email: str
    username: str
    is_active: bool

    class Config:
        from_attributes = True


# ─── Meeting ────────────────────────────────────────────────
class CreateMeetingRequest(BaseModel):
    title: str = Field(default="Untitled Meeting", max_length=255)


class MeetingResponse(BaseModel):
    id: UUID
    title: str
    host_id: UUID
    is_active: bool
    created_at: datetime
    ended_at: Optional[datetime] = None
    public_invite_token_version: int = 1
    public_invite_active: bool = False
    max_participants: Optional[int] = None
    require_host_approval: bool = False

    class Config:
        from_attributes = True


class MeetingListResponse(BaseModel):
    meetings: List[MeetingResponse]


# ─── Invite ─────────────────────────────────────────────────
class InviteRequest(BaseModel):
    user_id: Optional[UUID] = None
    role: str = Field(default="participant", pattern="^(co_host|participant|viewer)$")


class InviteResponse(BaseModel):
    invite_token: str
    meeting_id: UUID
    user_id: Optional[UUID] = None
    role: str
    expires_in_minutes: Optional[int] = 15
    expires_at: Optional[datetime] = None
    is_public: bool = False


class RevokePublicInviteResponse(BaseModel):
    meeting_id: UUID
    public_invite_active: bool
    public_invite_token_version: int
    message: str


# ─── Join ────────────────────────────────────────────────────
class JoinMeetingRequest(BaseModel):
    invite_token: str


class JoinMeetingResponse(BaseModel):
    status: Literal["joined", "waiting_for_approval"] = "joined"
    livekit_token: Optional[str] = None
    meeting_id: UUID
    room_name: Optional[str] = None
    role: str
    waiting_room_entry_id: Optional[UUID] = None
    detail: Optional[str] = None


# ─── Settings ────────────────────────────────────────────────
class MeetingSettingsUpdateRequest(BaseModel):
    max_participants: Optional[int] = Field(default=None, ge=1, le=10000)
    require_host_approval: bool = False


class MeetingSettingsResponse(BaseModel):
    meeting_id: UUID
    max_participants: Optional[int] = None
    require_host_approval: bool = False
    public_invite_active: bool = False
    public_invite_token_version: int = 1


# ─── Waiting Room ───────────────────────────────────────────
class WaitingRoomEntryResponse(BaseModel):
    id: UUID
    meeting_id: UUID
    user_id: UUID
    requested_at: datetime
    status: str
    username: Optional[str] = None
    email: Optional[str] = None

    class Config:
        from_attributes = True


class WaitingRoomListResponse(BaseModel):
    entries: List[WaitingRoomEntryResponse]


class WaitingRoomDecisionResponse(BaseModel):
    id: UUID
    meeting_id: UUID
    user_id: UUID
    status: str
    message: str


# ─── Generic ────────────────────────────────────────────────
class ErrorResponse(BaseModel):
    detail: str


class SuccessResponse(BaseModel):
    message: str


# ─── Engagement ─────────────────────────────────────────────
class EngagementSample(BaseModel):
    """Inbound sample from a client WebSocket (every ~10s)."""
    user_id: UUID
    engagement_score: float = Field(..., ge=0, le=100)
    timestamp: Optional[float] = None
    breakdown: Optional[dict] = None


class EngagementBreakdown(BaseModel):
    video: float = 0.0
    mic: float = 0.0
    typing: float = 0.0
    chat: float = 0.0


# ─── Reports ────────────────────────────────────────────────
class ParticipantReportRow(BaseModel):
    name: str
    score: float
    breakdown: EngagementBreakdown


class MeetingReportResponse(BaseModel):
    meeting_id: UUID
    participants: List[ParticipantReportRow]


# ─── Meeting Summary ────────────────────────────────────────
class ActionItemSchema(BaseModel):
    assignee: str = "Unassigned"
    task: str


class MeetingSummaryResponse(BaseModel):
    meeting_id: UUID
    summary: str
    key_points: List[str] = []
    action_items: List[ActionItemSchema] = []
    decisions: List[str] = []
    generated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class GenerateSummaryResponse(BaseModel):
    meeting_id: UUID
    status: str
    summary: Optional[MeetingSummaryResponse] = None


# ─── Chat ────────────────────────────────────────────────────
class ChatMessageResponse(BaseModel):
    id: UUID
    meeting_id: UUID
    user_id: Optional[UUID] = None
    sender_name: Optional[str] = None
    text: str
    timestamp: float

    class Config:
        from_attributes = True


# ─── Polls ───────────────────────────────────────────────────
class CreatePollRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=500)
    options: List[str] = Field(..., min_length=2, max_length=6)


class PollResponse(BaseModel):
    id: UUID
    meeting_id: UUID
    question: str
    options: List[str]
    is_active: bool = True


class PollVoteRequest(BaseModel):
    option_index: int = Field(..., ge=0)


class PollResultsResponse(BaseModel):
    poll_id: UUID
    question: str
    options: List[str]
    vote_counts: List[int]
    total_votes: int
    is_active: bool = True
    detail: Optional[str] = None
