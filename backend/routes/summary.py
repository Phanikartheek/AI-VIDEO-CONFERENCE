"""Meeting summary routes.

POST /meetings/{id}/generate-summary  — host-only, starts background generation
GET  /meetings/{id}/summary           — returns summary or {status: "pending"}
"""
import asyncio
import uuid
from typing import Dict, Set

from fastapi import APIRouter, HTTPException, status

from backend.routes.dependencies import CurrentUser, DbSession
from backend.routes.schemas import (
    GenerateSummaryResponse,
    MeetingSummaryResponse,
    ActionItemSchema,
)
from backend.services.meeting_service import MeetingService
from backend.ai_workers.summarizer import generate_meeting_summary, get_meeting_summary

router = APIRouter(prefix="/meetings", tags=["summary"])

# Track meetings currently being summarised so we don't double-trigger.
_pending: Set[str] = set()


def _format_summary(summary) -> MeetingSummaryResponse:
    action_items_raw = summary.action_items or []
    action_items = []
    for item in action_items_raw:
        if isinstance(item, dict):
            action_items.append(ActionItemSchema(
                assignee=item.get("assignee", "Unassigned"),
                task=item.get("task", ""),
            ))
        elif isinstance(item, str):
            action_items.append(ActionItemSchema(assignee="Unassigned", task=item))

    return MeetingSummaryResponse(
        meeting_id=summary.meeting_id,
        summary=summary.summary,
        key_points=summary.key_points or [],
        action_items=action_items,
        decisions=summary.decisions or [],
        generated_at=summary.generated_at,
    )


async def _background_generate(meeting_id: uuid.UUID) -> None:
    """Run the LLM pipeline in a background task, then clear the pending flag."""
    from backend.db.session import AsyncSessionLocal

    mid = str(meeting_id)
    try:
        async with AsyncSessionLocal() as db:
            await generate_meeting_summary(db, meeting_id)
    except Exception as exc:
        import logging
        logging.getLogger("focusmeet.summarizer").error("Background summary failed: %s", exc)
    finally:
        _pending.discard(mid)


@router.post("/{meeting_id}/generate-summary", response_model=GenerateSummaryResponse)
async def trigger_generate_summary(
    meeting_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
):
    """Host-only trigger for AI meeting summarisation.

    Launches the LLM call as a background task (Ollama can take 10-30 s).
    The client should poll GET /summary every 3 s until it resolves.
    """
    meeting = await MeetingService.get_meeting(db, meeting_id)
    if not meeting:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")
    if meeting.host_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the host can generate summaries")

    mid = str(meeting_id)
    if mid in _pending:
        return GenerateSummaryResponse(
            meeting_id=meeting_id,
            status="pending",
            detail="Summary generation is already in progress",
        )

    _pending.add(mid)
    asyncio.create_task(_background_generate(meeting_id))

    return GenerateSummaryResponse(
        meeting_id=meeting_id,
        status="pending",
        detail="Summary generation started — poll GET /summary",
    )


@router.get("/{meeting_id}/summary", response_model=GenerateSummaryResponse)
async def get_summary(
    meeting_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
):
    """Fetch summary.  Returns status="pending" while generating,
    status="completed" with the summary once ready, or status="not_found"
    if none exists.
    """
    meeting = await MeetingService.get_meeting(db, meeting_id)
    if not meeting:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")

    mid = str(meeting_id)
    if mid in _pending:
        return GenerateSummaryResponse(
            meeting_id=meeting_id,
            status="pending",
            detail="Summary is being generated…",
        )

    summary = await get_meeting_summary(db, meeting_id)
    if not summary:
        return GenerateSummaryResponse(
            meeting_id=meeting_id,
            status="not_found",
            detail="No summary available. Click Generate Summary to create one.",
        )

    return GenerateSummaryResponse(
        meeting_id=meeting_id,
        status="completed",
        summary=_format_summary(summary),
    )
