"""Per-participant drop-off risk predictor.

Uses the last 3 engagement scores from the Redis sorted set to compute a
simple linear-regression slope.  If the slope is negative (declining trend)
AND the most recent score is below 50 the participant is flagged as at-risk.

A Redis set ``flagged:{meeting_id}`` with per-member TTL (5 min) prevents
repeat alerts for the same participant within a short window.
"""
from __future__ import annotations

import logging
import time
from typing import Dict, List, Optional

from backend.db.redis_client import redis_client

logger = logging.getLogger("focusmeet.dropoff")

RISK_SCORE_THRESHOLD = 50.0
FLAG_TTL_SEC = 300  # 5-minute cooldown per user


def _user_key(meeting_id: str, user_id: str) -> str:
    return f"engagement:{meeting_id}:{user_id}"


def _flag_key(meeting_id: str) -> str:
    return f"flagged:{meeting_id}"


def _linear_slope(scores: List[float]) -> float:
    """Compute the slope of a simple OLS regression over equally-spaced samples.

    scores is ordered chronologically: [oldest, …, newest].
    Positive slope = improving, negative = declining.
    """
    n = len(scores)
    if n < 2:
        return 0.0
    x_mean = (n - 1) / 2.0
    y_mean = sum(scores) / n

    num = 0.0
    den = 0.0
    for i, y in enumerate(scores):
        dx = i - x_mean
        num += dx * (y - y_mean)
        den += dx * dx

    return num / den if den != 0 else 0.0


async def predict_dropoff_risk(
    meeting_id: str,
    user_id: str,
) -> Dict:
    """Analyse the most recent 3 engagement scores for *user_id*.

    Returns
    -------
    dict with keys:
      at_risk       – True when declining + current < threshold
      current_score – the most recent score
      trend_slope   – linear-regression slope (neg = declining)
      previous_scores – list of the scores used
    """
    # Fetch latest 3 members from the sorted set (highest timestamps = newest)
    raw = await redis_client.zrevrangebyscore(
        _user_key(meeting_id, user_id),
        "+inf",
        "-inf",
        start=0,
        num=3,
    )

    scores: List[float] = []
    for entry in raw:
        try:
            score_str = entry.split(":", 1)[0]
            scores.append(float(score_str))
        except (ValueError, IndexError):
            continue

    if len(scores) < 3:
        return {"at_risk": False, "current_score": scores[0] if scores else 0, "trend_slope": 0, "previous_scores": scores}

    # raw is newest-first → reverse for chronological order
    scores.reverse()

    slope = _linear_slope(scores)
    current = scores[-1]
    at_risk = slope < 0 and current < RISK_SCORE_THRESHOLD

    return {
        "at_risk": at_risk,
        "current_score": round(current, 2),
        "trend_slope": round(slope, 4),
        "previous_scores": [round(s, 2) for s in scores],
    }


async def check_and_flag_dropoffs(
    meeting_id: str,
    host_id: str,
) -> List[Dict]:
    """Run drop-off prediction for every participant in the meeting.

    Returns a list of alert payloads for participants that are newly at risk
    (i.e. not already flagged within the cooldown window).
    """
    from backend.services.engagement_service import EngagementService

    users = await EngagementService._all_users(meeting_id)
    alerts: List[Dict] = []

    for uid in users:
        if uid == host_id:
            continue  # don't alert the host about themselves

        prediction = await predict_dropoff_risk(meeting_id, uid)
        if not prediction["at_risk"]:
            continue

        # Check if already flagged (cooldown)
        flag_key = _flag_key(meeting_id)
        already_flagged = await redis_client.sismember(flag_key, uid)
        if already_flagged:
            continue

        # Flag this user for FLAG_TTL_SEC
        await redis_client.sadd(flag_key, uid)
        await redis_client.expire(flag_key, FLAG_TTL_SEC)

        # Resolve display name
        display_name = await EngagementService._read_name(meeting_id, uid) or uid

        alerts.append({
            "type": "dropoff_risk_alert",
            "user_id": uid,
            "user_name": display_name,
            "current_score": prediction["current_score"],
            "trend_slope": prediction["trend_slope"],
            "trend": "declining",
        })

    return alerts
