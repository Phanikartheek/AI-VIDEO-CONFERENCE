"""Meeting routes: create, invite, join, settings, waiting room.

Tiered access model:
  - Per-user invite tokens (default, secure, zero-link)
  - Optional public invite links (time-limited, revocable, participant-capped,
    optionally host-approved)
"""

import uuid

import jwt
from fastapi import APIRouter, HTTPException, status

from backend.routes.dependencies import CurrentUser, DbSession
from backend.routes.schemas import (
    CreateMeetingRequest,
    InviteRequest,
    InviteResponse,
    JoinMeetingRequest,
    JoinMeetingResponse,
    MeetingListResponse,
    MeetingResponse,
    MeetingSettingsResponse,
    MeetingSettingsUpdateRequest,
    RevokePublicInviteResponse,
    WaitingRoomDecisionResponse,
    WaitingRoomEntryResponse,
    WaitingRoomListResponse,
)
from backend.services.engagement_service import EngagementService
from backend.services.invite_service import InviteService
from backend.services.livekit_service import LiveKitService
from backend.services.meeting_service import MeetingService
from backend.services.waiting_room_ws_manager import waiting_room_ws_manager

router = APIRouter(prefix="/meetings", tags=["meetings"])


def _issue_livekit_token(meeting_id: uuid.UUID, current_user, role: str) -> tuple[str, str]:
    room_name = f"meeting-{meeting_id}"
    livekit_token = LiveKitService.create_access_token(
        room_name=room_name,
        participant_identity=str(current_user.id),
        participant_name=current_user.username,
        can_publish=role != "viewer",
        can_subscribe=True,
    )
    return livekit_token, room_name


@router.post("/create", response_model=MeetingResponse, status_code=status.HTTP_201_CREATED)
async def create_meeting(body: CreateMeetingRequest, current_user: CurrentUser, db: DbSession):
    meeting = await MeetingService.create_meeting(db, host_id=current_user.id, title=body.title)
    return MeetingResponse.model_validate(meeting)


@router.post("/{meeting_id}/invite", response_model=InviteResponse)
async def invite_to_meeting(
    meeting_id: uuid.UUID,
    body: InviteRequest,
    current_user: CurrentUser,
    db: DbSession,
):
    """
    Generate either:
      - a per-user token (body.user_id provided), or
      - a public shareable token (body.user_id omitted/null).
    """
    meeting = await MeetingService.get_meeting(db, meeting_id)
    if not meeting:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")
    if meeting.host_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the host can invite participants")
    if not meeting.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Meeting has ended")

    # Public mode
    if body.user_id is None:
        token, expires_at = InviteService.create_public_invite_token(meeting, role=body.role)
        await MeetingService.activate_public_invite(db, meeting)
        return InviteResponse(
            invite_token=token,
            meeting_id=meeting.id,
            user_id=None,
            role=body.role,
            expires_in_minutes=None,
            expires_at=expires_at,
            is_public=True,
        )

    # Per-user mode
    token = InviteService.create_invite_token(
        meeting_id=meeting.id,
        user_id=body.user_id,
        role=body.role,
    )
    return InviteResponse(
        invite_token=token,
        meeting_id=meeting.id,
        user_id=body.user_id,
        role=body.role,
        expires_in_minutes=15,
        is_public=False,
    )


@router.post("/{meeting_id}/revoke-public-invite", response_model=RevokePublicInviteResponse)
async def revoke_public_invite(meeting_id: uuid.UUID, current_user: CurrentUser, db: DbSession):
    """Host-only kill switch for all previously issued public invite links."""
    meeting = await MeetingService.get_meeting(db, meeting_id)
    if not meeting:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")
    if meeting.host_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the host can revoke public invites")

    meeting = await MeetingService.revoke_public_invite(db, meeting)
    return RevokePublicInviteResponse(
        meeting_id=meeting.id,
        public_invite_active=meeting.public_invite_active,
        public_invite_token_version=meeting.public_invite_token_version,
        message="Public invite revoked successfully",
    )


@router.post("/{meeting_id}/settings", response_model=MeetingSettingsResponse)
async def update_meeting_settings(
    meeting_id: uuid.UUID,
    body: MeetingSettingsUpdateRequest,
    current_user: CurrentUser,
    db: DbSession,
):
    """Host-only settings for capped public admission + host approval."""
    meeting = await MeetingService.get_meeting(db, meeting_id)
    if not meeting:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")
    if meeting.host_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the host can update settings")

    meeting = await MeetingService.update_settings(
        db,
        meeting_id,
        max_participants=body.max_participants,
        require_host_approval=body.require_host_approval,
    )
    return MeetingSettingsResponse(
        meeting_id=meeting.id,
        max_participants=meeting.max_participants,
        require_host_approval=meeting.require_host_approval,
        public_invite_active=meeting.public_invite_active,
        public_invite_token_version=meeting.public_invite_token_version,
    )


@router.post("/join", response_model=JoinMeetingResponse)
async def join_meeting(body: JoinMeetingRequest, current_user: CurrentUser, db: DbSession):
    """
    Join a meeting using either a per-user invite or a public shareable link.

    Public-token checks:
      - meeting.public_invite_active must be True
      - token_version must match meeting.public_invite_token_version
      - participant cap must not be exceeded
      - if host approval is required -> create WaitingRoomEntry and return
        status=waiting_for_approval instead of issuing a LiveKit token
    """
    try:
        invite_data = InviteService.validate_invite_token(body.invite_token)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invite token has expired")
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid invite token: {e}")

    meeting_id = uuid.UUID(invite_data["meeting_id"])
    meeting = await MeetingService.get_meeting(db, meeting_id)
    if not meeting:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")
    if not meeting.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Meeting has ended")

    is_public = InviteService.is_public_token(invite_data)

    if is_public:
        if not meeting.public_invite_active:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invite revoked")

        token_version = invite_data.get("token_version")
        if token_version != meeting.public_invite_token_version:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invite expired/revoked")
    else:
        invite_user_id = uuid.UUID(invite_data["user_id"])
        if invite_user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invite token was not issued for this user",
            )

    participant_count = await MeetingService.get_participant_count(db, meeting_id)
    if meeting.max_participants is not None and participant_count >= meeting.max_participants:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Meeting full")

    # Public links can be host-approved via waiting room.
    if is_public and meeting.require_host_approval:
        entry = await MeetingService.create_waiting_room_entry(db, meeting_id, current_user.id)
        return JoinMeetingResponse(
            status="waiting_for_approval",
            livekit_token=None,
            meeting_id=meeting_id,
            room_name=None,
            role=invite_data["role"],
            waiting_room_entry_id=entry.id,
            detail="Waiting for host approval",
        )

    from backend.models.participant import ParticipantRole

    role_enum = ParticipantRole(invite_data["role"])
    await MeetingService.add_participant(db, meeting_id, current_user.id, role_enum)
    livekit_token, room_name = _issue_livekit_token(meeting_id, current_user, invite_data["role"])

    return JoinMeetingResponse(
        status="joined",
        livekit_token=livekit_token,
        meeting_id=meeting_id,
        room_name=room_name,
        role=invite_data["role"],
    )


@router.get("/{meeting_id}/waiting-room", response_model=WaitingRoomListResponse)
async def get_waiting_room(meeting_id: uuid.UUID, current_user: CurrentUser, db: DbSession):
    """Host-only list of pending waiting-room requests."""
    meeting = await MeetingService.get_meeting(db, meeting_id)
    if not meeting:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")
    if meeting.host_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the host can view the waiting room")

    entries = await MeetingService.list_pending_waiting_room_entries(db, meeting_id)
    return WaitingRoomListResponse(
        entries=[
            WaitingRoomEntryResponse(
                id=e.id,
                meeting_id=e.meeting_id,
                user_id=e.user_id,
                requested_at=e.requested_at,
                status=e.status.value if hasattr(e.status, "value") else str(e.status),
                username=getattr(e.user, "username", None),
                email=getattr(e.user, "email", None),
            )
            for e in entries
        ]
    )


@router.post("/{meeting_id}/waiting-room/{entry_id}/approve", response_model=WaitingRoomDecisionResponse)
async def approve_waiting_room_entry(
    meeting_id: uuid.UUID,
    entry_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
):
    """Host-only approval path; notifies the user via waiting-room WebSocket."""
    meeting = await MeetingService.get_meeting(db, meeting_id)
    if not meeting:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")
    if meeting.host_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the host can approve requests")

    entry = await MeetingService.get_waiting_room_entry_by_id(db, meeting_id, entry_id)
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Waiting room entry not found")

    participant_count = await MeetingService.get_participant_count(db, meeting_id)
    if meeting.max_participants is not None and participant_count >= meeting.max_participants:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Meeting full")

    await MeetingService.approve_waiting_room_entry(db, entry)

    from backend.models.participant import ParticipantRole

    await MeetingService.add_participant(
        db,
        meeting_id,
        entry.user_id,
        ParticipantRole.PARTICIPANT,
    )

    user = entry.user
    room_name = f"meeting-{meeting_id}"
    livekit_token = LiveKitService.create_access_token(
        room_name=room_name,
        participant_identity=str(entry.user_id),
        participant_name=getattr(user, "username", str(entry.user_id)),
        can_publish=True,
        can_subscribe=True,
    )

    await waiting_room_ws_manager.send_to_user(
        str(meeting_id),
        str(entry.user_id),
        {
            "type": "join_approved",
            "livekit_token": livekit_token,
            "meeting_id": str(meeting_id),
            "room_name": room_name,
            "role": "participant",
        },
    )

    return WaitingRoomDecisionResponse(
        id=entry.id,
        meeting_id=meeting_id,
        user_id=entry.user_id,
        status="approved",
        message="Participant approved and notified",
    )


@router.post("/{meeting_id}/waiting-room/{entry_id}/reject", response_model=WaitingRoomDecisionResponse)
async def reject_waiting_room_entry(
    meeting_id: uuid.UUID,
    entry_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
):
    """Host-only rejection path; notifies the user via waiting-room WebSocket."""
    meeting = await MeetingService.get_meeting(db, meeting_id)
    if not meeting:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")
    if meeting.host_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the host can reject requests")

    entry = await MeetingService.get_waiting_room_entry_by_id(db, meeting_id, entry_id)
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Waiting room entry not found")

    await MeetingService.reject_waiting_room_entry(db, entry)
    await waiting_room_ws_manager.send_to_user(
        str(meeting_id),
        str(entry.user_id),
        {
            "type": "join_rejected",
            "meeting_id": str(meeting_id),
            "reason": "Host rejected your join request",
        },
    )

    return WaitingRoomDecisionResponse(
        id=entry.id,
        meeting_id=meeting_id,
        user_id=entry.user_id,
        status="rejected",
        message="Participant rejected and notified",
    )


@router.get("/", response_model=MeetingListResponse)
async def list_meetings(current_user: CurrentUser, db: DbSession):
    meetings = await MeetingService.get_user_meetings(db, current_user.id)
    return MeetingListResponse(meetings=[MeetingResponse.model_validate(m) for m in meetings])


@router.post("/{meeting_id}/end", response_model=MeetingResponse)
async def end_meeting(meeting_id: uuid.UUID, current_user: CurrentUser, db: DbSession):
    meeting = await MeetingService.get_meeting(db, meeting_id)
    if not meeting:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")
    if meeting.host_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the host can end the meeting")

    try:
        await EngagementService.finalize_reports(db, str(meeting_id))
    except Exception as exc:  # noqa: BLE001
        print(f"[engagement] finalize_reports failed: {exc}")

    meeting = await MeetingService.end_meeting(db, meeting_id)
    return MeetingResponse.model_validate(meeting)
