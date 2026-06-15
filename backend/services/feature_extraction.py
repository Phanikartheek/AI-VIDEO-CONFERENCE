"""
Feature extraction — SINGLE SOURCE OF TRUTH for FocusMeet engagement scoring.

Used by BOTH:
  1. Live engagement WebSocket aggregation (inference)
  2. Training data export (CSV for fusion model)

12 features covering vision, audio, chat, and interaction signals.
"""
from __future__ import annotations

import json
import logging
import math
import time
import uuid
from typing import Dict, List, Optional

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.redis_client import redis_client

logger = logging.getLogger("focusmeet.features")

EAR_THRESHOLD = 0.18
POSE_LIMIT_DEG = 20.0

# ─── Lazy-loaded sentiment singleton ──────────────────────
_sentiment_pipeline = None


def _get_sentiment_pipeline():
    global _sentiment_pipeline
    if _sentiment_pipeline is not None:
        return _sentiment_pipeline
    try:
        from transformers import pipeline as hf_pipeline
        _sentiment_pipeline = hf_pipeline(
            "sentiment-analysis",
            model="cardiffnlp/twitter-roberta-base-sentiment-latest",
            top_k=None,
            truncation=True,
            max_length=512,
        )
        logger.info("Loaded sentiment pipeline")
    except Exception as exc:
        logger.warning("Sentiment pipeline unavailable: %s", exc)
        _sentiment_pipeline = None
    return _sentiment_pipeline


def _sentiment_score(text: str) -> float:
    """Map sentiment model output to -1..1 score."""
    pipe = _get_sentiment_pipeline()
    if pipe is None or not text.strip():
        return 0.0
    try:
        results = pipe(text[:512])
        items = results[0] if isinstance(results, list) and results and isinstance(results[0], list) else results
        score = 0.0
        for item in items:
            label = item.get("label", "").lower()
            conf = float(item.get("score", 0))
            if "positive" in label:
                score += conf
            elif "negative" in label:
                score -= conf
        return max(-1.0, min(1.0, score))
    except Exception:
        return 0.0


def _variance(values: List[float]) -> float:
    if len(values) < 2:
        return 0.0
    mean = sum(values) / len(values)
    return sum((v - mean) ** 2 for v in values) / len(values)


# ─── Redis helpers ────────────────────────────────────────

async def _get_redis_list(key: str, window_start: float, window_end: float) -> List[dict]:
    """Fetch entries from a Redis list, filtering by timestamp in [start, end]."""
    raw = await redis_client.lrange(key, 0, -1)
    entries: List[dict] = []
    for item in raw:
        try:
            d = json.loads(item) if isinstance(item, str) else item
            ts = float(d.get("timestamp", 0))
            if window_start <= ts <= window_end:
                entries.append(d)
        except (json.JSONDecodeError, TypeError, ValueError):
            continue
    return entries


# ═══════════════════════════════════════════════════════════
# MAIN EXTRACTION FUNCTION — 12 features
# ═══════════════════════════════════════════════════════════

async def extract_features(
    meeting_id: uuid.UUID,
    user_id: uuid.UUID,
    window_start: float,
    window_end: float,
    db: Optional[AsyncSession] = None,
) -> Dict[str, object]:
    """Extract 12 engagement features for a single user in a time window.

    Returns a flat dict usable by both live scoring and training export.
    """
    mid = str(meeting_id)
    uid = str(user_id)
    window_dur = max(window_end - window_start, 0.001)
    window_dur_min = window_dur / 60.0

    # ── 1-4: Visual signals (landmarks) ────────────────────
    landmarks = await _get_redis_list(f"landmarks:{mid}:{uid}", window_start, window_end)
    # Downsample if > 300 samples (5fps × 60s)
    if len(landmarks) > 300:
        landmarks = landmarks[::2]

    face_detected = len(landmarks) > 0
    focus_count = 0
    yaw_vals: List[float] = []
    pitch_vals: List[float] = []
    ear_vals: List[float] = []

    for lm in landmarks:
        yaw = float(lm.get("yaw", 0))
        pitch = float(lm.get("pitch", 0))
        ear = float(lm.get("ear", 0))
        yaw_vals.append(yaw)
        pitch_vals.append(pitch)
        ear_vals.append(ear)
        if abs(yaw) < POSE_LIMIT_DEG and abs(pitch) < POSE_LIMIT_DEG and ear > EAR_THRESHOLD:
            focus_count += 1

    focus_score = (focus_count / len(landmarks) * 100) if landmarks else 0.0
    gaze_variance = (_variance(yaw_vals) + _variance(pitch_vals)) if len(landmarks) >= 2 else 0.0

    # Blink rate: count EAR threshold crossings (drop below then rise above)
    blink_count = 0
    if len(ear_vals) >= 2:
        was_below = ear_vals[0] < EAR_THRESHOLD
        for e in ear_vals[1:]:
            is_below = e < EAR_THRESHOLD
            if was_below and not is_below:
                blink_count += 1
            was_below = is_below
    blink_rate = (blink_count / window_dur) * 60 if landmarks else 0.0

    # ── 5-7: Audio signals ─────────────────────────────────
    mic_entries = await _get_redis_list(f"mic_activity:{mid}:{uid}", window_start, window_end)
    speaking_count = sum(1 for m in mic_entries if m.get("is_speaking"))
    mic_active_pct = (speaking_count / len(mic_entries) * 100) if mic_entries else 0.0

    speaking_turns = 0
    if len(mic_entries) >= 2:
        was_speaking = bool(mic_entries[0].get("is_speaking"))
        for m in mic_entries[1:]:
            is_sp = bool(m.get("is_speaking"))
            if not was_speaking and is_sp:
                speaking_turns += 1
            was_speaking = is_sp

    # Words per minute from TranscriptSegments
    words_per_min = 0.0
    if db is not None:
        from backend.models.transcript_segment import TranscriptSegment
        stmt = select(TranscriptSegment).where(
            TranscriptSegment.meeting_id == meeting_id,
            TranscriptSegment.user_id == user_id,
            TranscriptSegment.timestamp >= window_start,
            TranscriptSegment.timestamp <= window_end,
        )
        result = await db.execute(stmt)
        segments = list(result.scalars().all())
        total_words = sum(len((s.text or "").split()) for s in segments)
        words_per_min = total_words / window_dur_min if window_dur_min > 0 else 0.0

    # ── 8-10: Chat signals ─────────────────────────────────
    typing_entries = await _get_redis_list(f"typing:{mid}:{uid}", window_start, window_end)
    typing_events_per_min = (len(typing_entries) / window_dur) * 60

    chat_messages_in_window = 0
    chat_texts: List[str] = []
    if db is not None:
        from backend.models.chat_message import ChatMessage
        stmt = select(ChatMessage).where(
            ChatMessage.meeting_id == meeting_id,
            ChatMessage.user_id == user_id,
            ChatMessage.timestamp >= window_start,
            ChatMessage.timestamp <= window_end,
        )
        result = await db.execute(stmt)
        msgs = list(result.scalars().all())
        chat_messages_in_window = len(msgs)
        chat_texts = [m.text for m in msgs if m.text]

    chat_sentiment_avg = 0.0
    if chat_texts:
        sentiments = [_sentiment_score(t) for t in chat_texts]
        chat_sentiment_avg = sum(sentiments) / len(sentiments)

    # ── 11-12: Interaction signals ─────────────────────────
    reaction_entries = await _get_redis_list(f"reactions:{mid}:{uid}", window_start, window_end)
    reaction_count_in_window = len(reaction_entries)

    poll_participation = -1  # sentinel: no polls active
    if db is not None:
        from backend.models.poll import Poll, PollVote
        poll_stmt = select(Poll.id).where(
            Poll.meeting_id == meeting_id,
            Poll.created_at >= str(window_start),  # approximate filter
        )
        poll_result = await db.execute(poll_stmt)
        poll_ids = [row[0] for row in poll_result.all()]
        if poll_ids:
            vote_stmt = select(PollVote).where(
                PollVote.poll_id.in_(poll_ids),
                PollVote.user_id == user_id,
            )
            vote_result = await db.execute(vote_stmt)
            has_voted = vote_result.scalar_one_or_none() is not None
            poll_participation = 1 if has_voted else 0

    return {
        "focus_score": round(focus_score, 2),
        "face_detected": face_detected,
        "gaze_variance": round(gaze_variance, 4),
        "blink_rate": round(blink_rate, 2),
        "mic_active_pct": round(mic_active_pct, 2),
        "speaking_turns": speaking_turns,
        "words_per_min": round(words_per_min, 2),
        "typing_events_per_min": round(typing_events_per_min, 2),
        "chat_messages_in_window": chat_messages_in_window,
        "chat_sentiment_avg": round(chat_sentiment_avg, 4),
        "reaction_count_in_window": reaction_count_in_window,
        "poll_participation": poll_participation,
    }


# ═══════════════════════════════════════════════════════════
# ENGAGEMENT SCORE — inference or fallback
# ═══════════════════════════════════════════════════════════

FEATURE_ORDER = [
    "focus_score", "face_detected", "gaze_variance", "blink_rate",
    "mic_active_pct", "speaking_turns", "words_per_min",
    "typing_events_per_min", "chat_messages_in_window",
    "chat_sentiment_avg", "reaction_count_in_window", "poll_participation",
]


def compute_engagement_score(features: Dict[str, object], model=None) -> float:
    """Compute 0-100 engagement score from the 12-feature dict.

    If `model` is a trained sklearn/xgboost model with .predict(),
    builds the feature vector in FEATURE_ORDER and calls model.predict().
    Otherwise uses a hand-tuned weighted formula (v1 fallback).
    """
    if model is not None:
        import numpy as np
        vec = []
        for key in FEATURE_ORDER:
            val = features.get(key, 0)
            if isinstance(val, bool):
                val = 1.0 if val else 0.0
            vec.append(float(val))
        pred = model.predict([vec])[0]
        return max(0.0, min(100.0, float(pred)))

    # ── v1 fallback: weighted formula ──────────────────────
    focus = float(features.get("focus_score", 0))
    face = bool(features.get("face_detected", False))
    mic = float(features.get("mic_active_pct", 0))
    wpm = float(features.get("words_per_min", 0))
    typing = float(features.get("typing_events_per_min", 0))
    chat_n = int(features.get("chat_messages_in_window", 0))
    reactions = int(features.get("reaction_count_in_window", 0))

    chat_signal = min(chat_n * 25, 100)
    reaction_signal = min(reactions * 20, 100)
    wpm_norm = min(wpm / 2.0, 100)  # ~200 wpm normal speech → 100
    typing_norm = min(typing / 0.5, 100)  # ~30 keystrokes/min → 100

    if face:
        score = 0.6 * focus + 0.2 * mic + 0.1 * chat_signal + 0.1 * reaction_signal
    else:
        score = (0.4 * mic + 0.2 * wpm_norm + 0.2 * chat_signal
                 + 0.1 * typing_norm + 0.1 * reaction_signal)

    return max(0.0, min(100.0, round(score, 2)))
