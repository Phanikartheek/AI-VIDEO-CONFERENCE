"""Engagement engine service.

Stores per-participant engagement samples in Redis sorted sets keyed by
meeting + user, computes rolling group averages on a schedule, emits
low-engagement alerts to the host, and persists MeetingReport rows on end.

Redis layout:
    engagement:{meeting_id}:{user_id}   ZSET  score=timestamp  member=score
    engagement_meta:{meeting_id}        HASH  per-user breakdown snapshots
"""
import json
import time
import uuid
from typing import Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import settings
from backend.db.redis_client import redis_client
from backend.models.meeting_report import MeetingReport
from backend.models.participant import Participant
from backend.services.websocket_manager import ws_manager


def _now() -> float:
    return time.time()


def _user_key(meeting_id: str, user_id: str) -> str:
    return f"engagement:{meeting_id}:{user_id}"


def _meta_key(meeting_id: str) -> str:
    return f"engagement_meta:{meeting_id}"


def _name_key(meeting_id: str, user_id: str) -> str:
    return f"engagement_name:{meeting_id}:{user_id}"


class EngagementService:
    """Per-meeting engagement storage, aggregation, and alerting."""

    # ── 1. Store an incoming sample ─────────────────────────
    @staticmethod
    async def record_sample(
        meeting_id: str,
        user_id: str,
        score: float,
        breakdown: Optional[Dict[str, float]] = None,
        display_name: Optional[str] = None,
    ) -> None:
        """Add an engagement sample to the user's sorted set.

        Sorted set member = score, scored by timestamp so we can do
        time-range queries (rolling 30s windows).
        """
        now = _now()
        member = f"{score:.4f}:{now}"
        # ZADD with the timestamp as the score lets us prune by time.
        await redis_client.zadd(_user_key(meeting_id, user_id), {member: now})

        # Store latest breakdown snapshot for reporting flexibility.
        if breakdown is not None:
            await redis_client.hset(
                _meta_key(meeting_id),
                user_id,
                json.dumps({
                    "breakdown": breakdown,
                    "last_score": score,
                    "ts": now,
                }),
            )

        if display_name:
            await redis_client.set(_name_key(meeting_id, user_id), display_name, ex=86400)

    # ── 2. Windowed read ────────────────────────────────────
    @staticmethod
    async def _samples_since(meeting_id: str, user_id: str, since: float) -> List[float]:
        """Return all sample scores newer than `since` for a user."""
        raw = await redis_client.zrangebyscore(
            _user_key(meeting_id, user_id), since, "+inf"
        )
        scores: List[float] = []
        for entry in raw:
            # member format: "<score>:<ts>"
            try:
                score_str = entry.split(":", 1)[0]
                scores.append(float(score_str))
            except (ValueError, IndexError):
                continue
        return scores

    @staticmethod
    async def _read_meta(meeting_id: str, user_id: str) -> Optional[dict]:
        raw = await redis_client.hget(_meta_key(meeting_id), user_id)
        if not raw:
            return None
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return None

    @staticmethod
    async def _read_name(meeting_id: str, user_id: str) -> Optional[str]:
        return await redis_client.get(_name_key(meeting_id, user_id))

    @staticmethod
    async def _all_users(meeting_id: str) -> List[str]:
        """Users that have ever reported samples for this meeting."""
        idx = f"engagement:{meeting_id}"
        # Scan keys matching the user pattern for this meeting.
        users: List[str] = []
        prefix = f"engagement:{meeting_id}:"
        async for key in redis_client.scan_iter(match=f"{prefix}*", count=200):
            user_id = key[len(prefix):]
            users.append(user_id)
        return users

    # ── 3. Group average (last window) ──────────────────────
    @staticmethod
    async def group_average(meeting_id: str, window_sec: int) -> Dict:
        """Compute the average engagement across all participants in window."""
        since = _now() - window_sec
        users = await EngagementService._all_users(meeting_id)

        per_user: Dict[str, float] = {}
        all_scores: List[float] = []
        for uid in users:
            scores = await EngagementService._samples_since(meeting_id, uid, since)
            if scores:
                avg = sum(scores) / len(scores)
                per_user[uid] = avg
                all_scores.extend(scores)

        group_avg = (sum(all_scores) / len(all_scores)) if all_scores else 0.0
        return {
            "meeting_id": meeting_id,
            "window_sec": window_sec,
            "participant_count": len(per_user),
            "group_average": round(group_avg, 2),
            "per_user": {uid: round(v, 2) for uid, v in per_user.items()},
        }

    # ── 4. Low-engagement alert loop state ──────────────────
    @staticmethod
    async def check_low_engagement(meeting_id: str, host_id: str) -> Optional[dict]:
        """Compute group average; track consecutive low checks in Redis.

        Returns an alert dict if the threshold is breached for N consecutive
        checks, else None. Alert is meant to be sent to the host's socket.
        """
        stats = await EngagementService.group_average(
            meeting_id, settings.ENGAGEMENT_WINDOW_SEC
        )
        is_low = stats["group_average"] < settings.LOW_ENGAGEMENT_THRESHOLD

        consec_key = f"engagement_low_streak:{meeting_id}"
        if is_low:
            streak = await redis_client.incr(consec_key)
            await redis_client.expire(consec_key, settings.ENGAGEMENT_CHECK_INTERVAL_SEC * 3)
        else:
            await redis_client.delete(consec_key)
            return None

        if streak >= settings.LOW_ENGAGEMENT_CONSECUTIVE:
            return {
                "type": "low_engagement_alert",
                "avg_score": stats["group_average"],
                "participant_count": stats["participant_count"],
                "meeting_id": meeting_id,
                "consecutive_checks": streak,
            }
        return None

    # ── 5. Persist reports on meeting end ───────────────────
    @staticmethod
    async def finalize_reports(db: AsyncSession, meeting_id: str) -> List[MeetingReport]:
        """Compute per-participant averages from Redis and persist MeetingReport rows."""
        users = await EngagementService._all_users(meeting_id)
        if not users:
            return []

        # Map of participants for display names / roles.
        part_map: Dict[str, Participant] = {}
        res = await db.execute(
            select(Participant).where(Participant.meeting_id == uuid.UUID(meeting_id))
        )
        for p in res.scalars().all():
            part_map[str(p.user_id)] = p

        reports: List[MeetingReport] = []
        for uid in users:
            scores = await EngagementService._samples_since(meeting_id, uid, 0)
            if not scores:
                continue

            avg = sum(scores) / len(scores)
            # Pull the latest breakdown snapshot if present.
            breakdown = None
            raw_meta = await redis_client.hget(_meta_key(meeting_id), uid)
            video_score = mic_score = typing_score = chat_score = 0.0
            if raw_meta:
                try:
                    meta = json.loads(raw_meta)
                    breakdown = meta.get("breakdown")
                    if breakdown:
                        video_score = float(breakdown.get("video", 0))
                        mic_score = float(breakdown.get("mic", 0))
                        typing_score = float(breakdown.get("typing", 0))
                        chat_score = float(breakdown.get("chat", 0))
                except (json.JSONDecodeError, ValueError):
                    pass

            part = part_map.get(uid)
            name = None
            if part is not None:
                # Participant has no name column; use cached display name.
                cached = await redis_client.get(_name_key(meeting_id, uid))
                name = cached or uid

            report = MeetingReport(
                meeting_id=uuid.UUID(meeting_id),
                user_id=uuid.UUID(uid),
                participant_name=name,
                avg_score=round(avg, 2),
                video_score=round(video_score, 2),
                mic_score=round(mic_score, 2),
                typing_score=round(typing_score, 2),
                chat_score=round(chat_score, 2),
                sample_count=len(scores),
                breakdown=breakdown,
            )
            db.add(report)
            reports.append(report)

        await db.commit()

        # Clean up Redis keys for this meeting.
        await EngagementService._cleanup_meeting(meeting_id)

        for r in reports:
            await db.refresh(r)
        return reports

    @staticmethod
    async def _cleanup_meeting(meeting_id: str) -> None:
        """Remove engagement keys for a finished meeting."""
        patterns = [
            f"engagement:{meeting_id}:*",
            f"engagement_meta:{meeting_id}",
            f"engagement_name:{meeting_id}:*",
            f"engagement_low_streak:{meeting_id}",
        ]
        for pattern in patterns:
            async for key in redis_client.scan_iter(match=pattern, count=200):
                await redis_client.delete(key)
