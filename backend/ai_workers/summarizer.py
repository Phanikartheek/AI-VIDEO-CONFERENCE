"""
AI Meeting Summarizer for FocusMeet (Local Ollama version).

1. During a meeting, transcript chunks produced by Whisper (moderation pipeline)
   are persisted to the TranscriptSegment table.

2. On meeting end (or manual trigger), generate_meeting_summary():
   - Fetches all TranscriptSegment rows for the meeting, ordered by timestamp
   - Concatenates into a formatted transcript: "[HH:MM] SpeakerName: text"
   - Calls a local Ollama model (e.g. qwen3:4b) with a structured prompt
   - Parses the JSON response
   - Stores the result in MeetingSummary
"""
from __future__ import annotations

import json
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Optional

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import settings
from backend.models.transcript_segment import TranscriptSegment
from backend.models.meeting_summary import MeetingSummary

logger = logging.getLogger("focusmeet.summarizer")

# ─── Prompt template ───────────────────────────────────────
SUMMARY_PROMPT = """You are summarizing a meeting transcript. Given the transcript below, produce a JSON object with:
- summary: 2-3 sentence overview of what was discussed
- key_points: array of 3-6 bullet points of main discussion topics
- action_items: array of objects {{assignee: speaker_name or "Unassigned", task: string}}
- decisions: array of strings, any decisions made

Transcript:
{transcript_text}

Respond ONLY with valid JSON, no markdown formatting, no explanations, no <think> reasoning."""


def _format_timestamp(ts: float) -> str:
    """Convert a float timestamp (seconds since meeting start) to [HH:MM]."""
    total_seconds = int(max(0, ts))
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    return f"[{hours:02d}:{minutes:02d}]"


def _build_transcript_text(segments: list[TranscriptSegment]) -> str:
    """Format transcript segments into a human-readable string."""
    lines: list[str] = []
    for seg in segments:
        ts = _format_timestamp(seg.timestamp)
        speaker = seg.speaker_name or "Unknown"
        lines.append(f"{ts} {speaker}: {seg.text}")
    return "\n".join(lines)


def _strip_markdown_fences(text: str) -> str:
    """Strip ```json ... ``` fences from LLM output."""
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*\n?", "", text)
    text = re.sub(r"\n?```\s*$", "", text)
    return text.strip()


def _strip_think_tags(text: str) -> str:
    """Strip <think>...</think> reasoning blocks some local models emit."""
    return re.sub(r"<think>[\s\S]*?</think>", "", text, flags=re.IGNORECASE).strip()


def _parse_summary_response(raw: str) -> dict:
    """Parse the LLM JSON response, with fallbacks for common issues."""
    cleaned = _strip_think_tags(raw)
    cleaned = _strip_markdown_fences(cleaned)

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        logger.warning("Failed to parse LLM JSON, attempting repair")
        # Attempt to extract JSON object with regex
        match = re.search(r"\{[\s\S]*\}", cleaned)
        if match:
            try:
                return json.loads(match.group(0))
            except json.JSONDecodeError:
                pass
        # Return a fallback structure
        return {
            "summary": cleaned[:500] if cleaned else "Summary generation failed.",
            "key_points": [],
            "action_items": [],
            "decisions": [],
        }


# ─── Transcript accumulation ──────────────────────────────
async def store_transcript_segment(
    db: AsyncSession,
    meeting_id: uuid.UUID,
    user_id: Optional[uuid.UUID],
    speaker_name: Optional[str],
    timestamp: float,
    text: str,
) -> TranscriptSegment:
    """Store a single transcript chunk (called by moderation/audio pipeline)."""
    segment = TranscriptSegment(
        meeting_id=meeting_id,
        user_id=user_id,
        speaker_name=speaker_name,
        timestamp=timestamp,
        text=text.strip(),
    )
    db.add(segment)
    await db.commit()
    await db.refresh(segment)
    return segment


async def get_transcript_segments(
    db: AsyncSession,
    meeting_id: uuid.UUID,
) -> list[TranscriptSegment]:
    """Fetch all transcript segments for a meeting, ordered by timestamp."""
    stmt = (
        select(TranscriptSegment)
        .where(TranscriptSegment.meeting_id == meeting_id)
        .order_by(TranscriptSegment.timestamp.asc())
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


# ─── LLM call (local Ollama) ──────────────────────────────
async def _call_ollama(transcript_text: str) -> str:
    """
    Call a local Ollama model to generate a structured meeting summary.

    Notes on qwen3 behaviour:
    - With format="json", Ollama forces valid JSON syntax in whichever field
      the model writes its final answer to.
    - qwen3 sometimes places its (already-JSON) output inside the "thinking"
      field instead of "response", especially for short/simple prompts.
      For longer real transcripts it usually fills "response" correctly,
      but we check both fields defensively.
    """
    prompt = SUMMARY_PROMPT.format(transcript_text=transcript_text)

    timeout = httpx.Timeout(settings.OLLAMA_TIMEOUT_SECONDS, connect=10.0)

    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            resp = await client.post(
                f"{settings.OLLAMA_BASE_URL}/api/generate",
                json={
                    "model": settings.OLLAMA_MODEL,
                    "prompt": prompt,
                    "stream": False,
                    "format": "json",
                },
            )
            resp.raise_for_status()
        except httpx.ConnectError as exc:
            raise RuntimeError(
                f"Could not connect to Ollama at {settings.OLLAMA_BASE_URL}. "
                f"Is 'ollama serve' running? ({exc})"
            ) from exc
        except httpx.HTTPStatusError as exc:
            raise RuntimeError(
                f"Ollama returned an error: {exc.response.status_code} "
                f"{exc.response.text}"
            ) from exc

        data = resp.json()

    # Prefer "response"; fall back to "thinking" if response is empty
    # (observed with qwen3:4b on short prompts).
    text = (data.get("response") or "").strip()
    if not text:
        thinking = (data.get("thinking") or "").strip()
        if thinking:
            logger.info(
                "Ollama returned empty 'response'; using 'thinking' field instead"
            )
            text = thinking

    if not text:
        raise RuntimeError("Ollama returned an empty response and empty thinking field")

    return text


# ─── Main summarization pipeline ──────────────────────────
async def generate_meeting_summary(
    db: AsyncSession,
    meeting_id: uuid.UUID,
) -> MeetingSummary:
    """
    End-to-end pipeline:
      1. Fetch transcript segments from Postgres
      2. Format into readable transcript
      3. Call local Ollama for structured summary
      4. Parse and store MeetingSummary row

    Raises RuntimeError if no transcript exists or Ollama is unavailable.
    """
    # 1. Fetch segments
    segments = await get_transcript_segments(db, meeting_id)

    if not segments:
        raise RuntimeError(f"No transcript segments found for meeting {meeting_id}")

    # 2. Format transcript
    transcript_text = _build_transcript_text(segments)
    logger.info(
        "Generating summary for meeting %s (%d segments, %d chars) using model %s",
        meeting_id, len(segments), len(transcript_text), settings.OLLAMA_MODEL,
    )

    # 3. Call LLM
    raw_response = await _call_ollama(transcript_text)

    # 4. Parse
    parsed = _parse_summary_response(raw_response)

    summary_text = parsed.get("summary", "")
    key_points = parsed.get("key_points", [])
    action_items = parsed.get("action_items", [])
    decisions = parsed.get("decisions", [])

    # Upsert: if a summary already exists for this meeting, update it
    stmt = select(MeetingSummary).where(MeetingSummary.meeting_id == meeting_id)
    result = await db.execute(stmt)
    existing = result.scalar_one_or_none()

    if existing:
        existing.summary = summary_text
        existing.key_points = key_points
        existing.action_items = action_items
        existing.decisions = decisions
        existing.generated_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(existing)
        return existing

    summary = MeetingSummary(
        meeting_id=meeting_id,
        summary=summary_text,
        key_points=key_points,
        action_items=action_items,
        decisions=decisions,
    )
    db.add(summary)
    await db.commit()
    await db.refresh(summary)
    return summary


async def get_meeting_summary(
    db: AsyncSession,
    meeting_id: uuid.UUID,
) -> Optional[MeetingSummary]:
    """Fetch the existing summary for a meeting, or None."""
    stmt = select(MeetingSummary).where(MeetingSummary.meeting_id == meeting_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()
