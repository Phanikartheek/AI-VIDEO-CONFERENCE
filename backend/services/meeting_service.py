import uuid
from datetime import datetime, timezone
from typing import Optional, List

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.meeting import Meeting
from backend.models.participant import Participant, ParticipantRole
from backend.models.waiting_room_entry import WaitingRoomEntry, WaitingRoomStatus


class MeetingService:
    """Handles meeting creation, settings, invites, and waiting room."""

    @staticmethod
    async def create_meeting(
        db: AsyncSession, host_id: uuid.UUID, title: str = "Untitled Meeting"
    ) -> Meeting:
        meeting = Meeting(host_id=host_id, title=title)
        db.add(meeting)
        await db.flush()

        # Add host as first participant
        participant = Participant(
            meeting_id=meeting.id,
            user_id=host_id,
            role=ParticipantRole.HOST,
        )
        db.add(participant)

        await db.commit()
        await db.refresh(meeting)
        return meeting

    @staticmethod
    async def get_meeting(db: AsyncSession, meeting_id: uuid.UUID) -> Optional[Meeting]:
        stmt = select(Meeting).where(Meeting.id == meeting_id)
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    async def add_participant(
        db: AsyncSession,
        meeting_id: uuid.UUID,
        user_id: uuid.UUID,
        role: ParticipantRole = ParticipantRole.PARTICIPANT,
    ) -> Participant:
        stmt = select(Participant).where(
            Participant.meeting_id == meeting_id,
            Participant.user_id == user_id,
        )
        result = await db.execute(stmt)
        existing = result.scalar_one_or_none()
        if existing:
            return existing

        participant = Participant(
            meeting_id=meeting_id,
            user_id=user_id,
            role=role,
        )
        db.add(participant)
        await db.commit()
        await db.refresh(participant)
        return participant

    @staticmethod
    async def get_user_meetings(db: AsyncSession, user_id: uuid.UUID) -> List[Meeting]:
        stmt = select(Meeting).where(Meeting.host_id == user_id).order_by(Meeting.created_at.desc())
        result = await db.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def get_participant_count(db: AsyncSession, meeting_id: uuid.UUID) -> int:
        stmt = select(func.count(Participant.id)).where(Participant.meeting_id == meeting_id)
        result = await db.execute(stmt)
        return int(result.scalar() or 0)

    @staticmethod
    async def update_settings(
        db: AsyncSession,
        meeting_id: uuid.UUID,
        *,
        max_participants: Optional[int] = None,
        require_host_approval: Optional[bool] = None,
    ) -> Optional[Meeting]:
        meeting = await MeetingService.get_meeting(db, meeting_id)
        if not meeting:
            return None

        meeting.max_participants = max_participants
        if require_host_approval is not None:
            meeting.require_host_approval = require_host_approval

        await db.commit()
        await db.refresh(meeting)
        return meeting

    @staticmethod
    async def activate_public_invite(db: AsyncSession, meeting: Meeting) -> Meeting:
        meeting.public_invite_active = True
        await db.commit()
        await db.refresh(meeting)
        return meeting

    @staticmethod
    async def revoke_public_invite(db: AsyncSession, meeting: Meeting) -> Meeting:
        meeting.public_invite_token_version += 1
        meeting.public_invite_active = False
        await db.commit()
        await db.refresh(meeting)
        return meeting

    @staticmethod
    async def get_waiting_entry(
        db: AsyncSession,
        meeting_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> Optional[WaitingRoomEntry]:
        stmt = select(WaitingRoomEntry).where(
            WaitingRoomEntry.meeting_id == meeting_id,
            WaitingRoomEntry.user_id == user_id,
            WaitingRoomEntry.status == WaitingRoomStatus.PENDING,
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    async def create_waiting_room_entry(
        db: AsyncSession,
        meeting_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> WaitingRoomEntry:
        existing = await MeetingService.get_waiting_entry(db, meeting_id, user_id)
        if existing:
            return existing

        entry = WaitingRoomEntry(
            meeting_id=meeting_id,
            user_id=user_id,
            status=WaitingRoomStatus.PENDING,
        )
        db.add(entry)
        await db.commit()
        await db.refresh(entry)
        return entry

    @staticmethod
    async def list_pending_waiting_room_entries(
        db: AsyncSession,
        meeting_id: uuid.UUID,
    ) -> List[WaitingRoomEntry]:
        stmt = (
            select(WaitingRoomEntry)
            .where(
                WaitingRoomEntry.meeting_id == meeting_id,
                WaitingRoomEntry.status == WaitingRoomStatus.PENDING,
            )
            .order_by(WaitingRoomEntry.requested_at.asc())
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def get_waiting_room_entry_by_id(
        db: AsyncSession,
        meeting_id: uuid.UUID,
        entry_id: uuid.UUID,
    ) -> Optional[WaitingRoomEntry]:
        stmt = select(WaitingRoomEntry).where(
            WaitingRoomEntry.meeting_id == meeting_id,
            WaitingRoomEntry.id == entry_id,
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    async def approve_waiting_room_entry(
        db: AsyncSession,
        entry: WaitingRoomEntry,
    ) -> WaitingRoomEntry:
        entry.status = WaitingRoomStatus.APPROVED
        await db.commit()
        await db.refresh(entry)
        return entry

    @staticmethod
    async def reject_waiting_room_entry(
        db: AsyncSession,
        entry: WaitingRoomEntry,
    ) -> WaitingRoomEntry:
        entry.status = WaitingRoomStatus.REJECTED
        await db.commit()
        await db.refresh(entry)
        return entry

    @staticmethod
    async def end_meeting(db: AsyncSession, meeting_id: uuid.UUID) -> Optional[Meeting]:
        meeting = await MeetingService.get_meeting(db, meeting_id)
        if meeting:
            meeting.is_active = False
            meeting.ended_at = datetime.now(timezone.utc)
            meeting.public_invite_active = False
            await db.commit()
            await db.refresh(meeting)
        return meeting
