"""Reports routes: per-meeting engagement report.

GET /meetings/{id}/report -> [{name, score, breakdown:{video,mic,typing,chat}}]

If the meeting has ended, returns persisted MeetingReport rows.
If the meeting is live, returns a live snapshot from Redis.
"""
import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db import get_db
from backend.models.meeting import Meeting
from backend.models.meeting_report import MeetingReport
from backend.routes.dependencies import CurrentUser
from backend.routes.schemas import (
    MeetingReportResponse,
    ParticipantReportRow,
    EngagementBreakdown,
)
from backend.services.engagement_service import EngagementService

router = APIRouter(prefix="/meetings", tags=["reports"])


@router.get("/{meeting_id}/report", response_model=MeetingReportResponse)
async def get_meeting_report(
    meeting_id: uuid.UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Return the engagement report for a meeting.

    - Ended meetings: rows persisted in Postgres (MeetingReport).
    - Live meetings: rolling-window snapshot from Redis.
    """
    meeting = await db.get(Meeting, meeting_id)
    if not meeting:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")

    # Hosts see full report; participants see their own row too (read-only).
    rows: List[ParticipantReportRow] = []

    if not meeting.is_active:
        # Persisted reports from Postgres.
        res = await db.execute(
            select(MeetingReport).where(MeetingReport.meeting_id == meeting_id)
        )
        reports = res.scalars().all()
        if not reports:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No report available for this meeting",
            )
        for r in reports:
            rows.append(
                ParticipantReportRow(
                    name=r.participant_name or str(r.user_id),
                    score=r.avg_score,
                    breakdown=EngagementBreakdown(
                        video=r.video_score,
                        mic=r.mic_score,
                        typing=r.typing_score,
                        chat=r.chat_score,
                    ),
                )
            )
    else:
        # Live snapshot from Redis sorted sets.
        users = await EngagementService._all_users(str(meeting_id))
        for uid in users:
            scores = await EngagementService._samples_since(str(meeting_id), uid, 0)
            if not scores:
                continue
            avg = sum(scores) / len(scores)
            # Latest breakdown snapshot.
            bk = EngagementBreakdown()
            raw_meta = await EngagementService._read_meta(str(meeting_id), uid)
            if raw_meta and raw_meta.get("breakdown"):
                b = raw_meta["breakdown"]
                bk = EngagementBreakdown(
                    video=b.get("video", 0),
                    mic=b.get("mic", 0),
                    typing=b.get("typing", 0),
                    chat=b.get("chat", 0),
                )
            name = await EngagementService._read_name(str(meeting_id), uid) or uid
            rows.append(
                ParticipantReportRow(name=name, score=round(avg, 2), breakdown=bk)
            )

    rows.sort(key=lambda r: r.score, reverse=True)
    return MeetingReportResponse(meeting_id=meeting_id, participants=rows)
