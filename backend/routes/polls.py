"""Live polls for FocusMeet — host-only creation, real-time voting.

POST /meetings/{id}/polls        — create poll (host only)
POST /polls/{poll_id}/vote       — cast/change vote
POST /polls/{poll_id}/close      — close poll (host only)
GET  /polls/{poll_id}/results    — get results
"""
import uuid
from typing import List

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select, func

from backend.routes.dependencies import CurrentUser, DbSession
from backend.routes.schemas import (
    CreatePollRequest, PollResponse, PollVoteRequest,
    PollResultsResponse, SuccessResponse,
)
from backend.models.poll import Poll, PollVote
from backend.models.meeting import Meeting
from backend.routes.chat_ws import chat_ws_manager

router = APIRouter(tags=["polls"])


async def _build_results(db, poll: Poll) -> dict:
    vote_counts = [0] * len(poll.options)
    stmt = select(PollVote).where(PollVote.poll_id == poll.id)
    result = await db.execute(stmt)
    total = 0
    for v in result.scalars().all():
        idx = int(v.option_index)
        if 0 <= idx < len(vote_counts):
            vote_counts[idx] += 1
            total += 1
    return {"question": poll.question, "options": poll.options,
            "vote_counts": vote_counts, "total_votes": total, "is_active": poll.is_active}


@router.post("/meetings/{meeting_id}/polls", response_model=PollResponse,
             status_code=status.HTTP_201_CREATED)
async def create_poll(meeting_id: uuid.UUID, body: CreatePollRequest,
                      current_user: CurrentUser, db: DbSession):
    meeting = await db.get(Meeting, meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    if meeting.host_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the host can create polls")

    poll = Poll(meeting_id=meeting_id, question=body.question,
                options=body.options, created_by=current_user.id)
    db.add(poll)
    await db.commit()
    await db.refresh(poll)

    # Broadcast to all participants via chat WS
    await chat_ws_manager.broadcast(str(meeting_id), {
        "type": "new_poll",
        "poll_id": str(poll.id), "question": poll.question,
        "options": poll.options, "is_active": True,
    })

    return PollResponse(id=poll.id, meeting_id=meeting_id, question=poll.question,
                        options=poll.options, is_active=True)


@router.post("/polls/{poll_id}/vote", response_model=SuccessResponse)
async def vote_poll(poll_id: uuid.UUID, body: PollVoteRequest,
                    current_user: CurrentUser, db: DbSession):
    poll = await db.get(Poll, poll_id)
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")
    if not poll.is_active:
        raise HTTPException(status_code=400, detail="Poll is closed")
    if body.option_index < 0 or body.option_index >= len(poll.options):
        raise HTTPException(status_code=400, detail="Invalid option index")

    # Upsert vote
    stmt = select(PollVote).where(PollVote.poll_id == poll_id,
                                  PollVote.user_id == current_user.id)
    result = await db.execute(stmt)
    existing = result.scalar_one_or_none()
    if existing:
        existing.option_index = str(body.option_index)
    else:
        db.add(PollVote(poll_id=poll_id, user_id=current_user.id,
                        option_index=str(body.option_index)))
    await db.commit()

    # Broadcast updated results
    results = await _build_results(db, poll)
    await chat_ws_manager.broadcast(str(poll.meeting_id), {
        "type": "poll_update", "poll_id": str(poll_id), **results,
    })

    return SuccessResponse(message="Vote recorded")


@router.post("/polls/{poll_id}/close", response_model=PollResultsResponse)
async def close_poll(poll_id: uuid.UUID, current_user: CurrentUser, db: DbSession):
    poll = await db.get(Poll, poll_id)
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")
    meeting = await db.get(Meeting, poll.meeting_id)
    if not meeting or meeting.host_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the host can close polls")

    poll.is_active = False
    await db.commit()
    results = await _build_results(db, poll)
    await chat_ws_manager.broadcast(str(poll.meeting_id), {
        "type": "poll_closed", "poll_id": str(poll_id), **results,
    })
    return PollResultsResponse(poll_id=poll_id, **results)


@router.get("/polls/{poll_id}/results", response_model=PollResultsResponse)
async def poll_results(poll_id: uuid.UUID, current_user: CurrentUser, db: DbSession):
    poll = await db.get(Poll, poll_id)
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")
    results = await _build_results(db, poll)
    return PollResultsResponse(poll_id=poll_id, **results)
