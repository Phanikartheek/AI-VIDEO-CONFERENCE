"""
AI moderation worker for FocusMeet.

Provides:
  - check_text_toxicity(text)   -> HF pipeline "unitary/toxic-bert"
  - process_audio_chunk(bytes)  -> faster-whisper (base) -> text -> toxicity
  - ModerationWorker.run()      -> Redis pub/sub loop over chat + audio channels

Models are loaded lazily and once so the worker module can be imported even
when the heavy ML dependencies aren't installed (graceful degradation).
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Optional

from backend.config import settings
from backend.db.redis_client import redis_client

logger = logging.getLogger("focusmeet.moderation")

# Model label set produced by unitary/toxic-bert
TOXIC_LABELS = {
    "toxic",
    "severe_toxic",
    "obscene",
    "identity_attack",
    "insult",
    "threat",
    "sexual_explicit",
}


class ModerationModels:
    """Holds lazily-loaded, singleton ML models (loaded once at startup)."""

    _toxic_pipeline = None
    _whisper_model = None
    _loaded = False

    @classmethod
    def load(cls) -> None:
        if cls._loaded:
            return
        # 1) Toxicity classifier (unitary/toxic-bert)
        try:
            from transformers import pipeline  # type: ignore

            cls._toxic_pipeline = pipeline(
                "text-classification",
                model="unitary/toxic-bert",
                top_k=None,  # return all labels
                function_to_apply="sigmoid",
            )
            logger.info("Loaded toxicity pipeline (unitary/toxic-bert)")
        except Exception as exc:  # noqa: BLE001
            logger.warning("Toxicity pipeline unavailable: %s", exc)
            cls._toxic_pipeline = None

        # 2) Speech-to-text (faster-whisper base, loaded once)
        try:
            from faster_whisper import WhisperModel  # type: ignore

            cls._whisper_model = WhisperModel(
                settings.MODERATION_WHISPER_MODEL,
                device=settings.MODERATION_WHISPER_DEVICE,
                compute_type=settings.MODERATION_WHISPER_COMPUTE_TYPE,
            )
            logger.info("Loaded faster-whisper (%s)", settings.MODERATION_WHISPER_MODEL)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Whisper model unavailable: %s", exc)
            cls._whisper_model = None

        cls._loaded = True


def check_text_toxicity(text: str) -> dict:
    """Classify text toxicity with unitary/toxic-bert.

    Returns:
        {"is_toxic": bool, "score": float, "categories": {label: score}}
        is_toxic is True when the max toxic-label score > threshold.
    """
    if not text or not text.strip():
        return {"is_toxic": False, "score": 0.0, "categories": {}}

    if ModerationModels._toxic_pipeline is None:
        ModerationModels.load()
    pipe = ModerationModels._toxic_pipeline

    if pipe is None:
        logger.debug("toxicity pipeline not loaded; skipping")
        return {"is_toxic": False, "score": 0.0, "categories": {}}

    try:
        results = pipe(text[:512])  # cap length for the model
    except Exception as exc:  # noqa: BLE001
        logger.error("toxicity inference failed: %s", exc)
        return {"is_toxic": False, "score": 0.0, "categories": {}}

    # `results` is a list of dicts (single text input -> list of label scores).
    scores = {}
    if isinstance(results, list) and results and isinstance(results[0], list):
        items = results[0]
    elif isinstance(results, list):
        items = results
    else:
        items = results

    max_toxic = 0.0
    for item in items:
        label = item.get("label", "").lower()
        score = float(item.get("score", 0.0))
        scores[label] = round(score, 4)
        if label in TOXIC_LABELS and score > max_toxic:
            max_toxic = score

    is_toxic = max_toxic > settings.MODERATION_TOXIC_THRESHOLD
    return {"is_toxic": is_toxic, "score": round(max_toxic, 4), "categories": scores}


def process_audio_chunk(audio_bytes: bytes, sample_rate: int = 16000) -> dict:
    """Transcribe an audio chunk with faster-whisper, then check toxicity.

    Args:
        audio_bytes: raw PCM/encoded audio bytes (~5s chunk expected).
        sample_rate: expected sample rate (informational for whisper).

    Returns:
        {"transcript": str, "is_toxic": bool, "score": float}
    """
    if ModerationModels._whisper_model is None:
        ModerationModels.load()
    whisper = ModerationModels._whisper_model

    if whisper is None or not audio_bytes:
        return {"transcript": "", "is_toxic": False, "score": 0.0}

    transcript = ""
    try:
        # faster-whisper can transcribe a file-like / np array. We decode raw
        # PCM into a numpy array at the expected sample rate.
        import io
        import numpy as np

        try:
            audio = np.frombuffer(audio_bytes, dtype=np.int16).astype(np.float32) / 32768.0
        except ValueError:
            # Not raw PCM — write to a buffer and let ffmpeg decode.
            buf = io.BytesIO(audio_bytes)
            segments, _info = whisper.transcribe(buf, language="en")
            transcript = " ".join(seg.text for seg in segments).strip()
            toxic = check_text_toxicity(transcript)
            return {
                "transcript": transcript,
                "is_toxic": toxic["is_toxic"],
                "score": toxic["score"],
            }

        segments, _info = whisper.transcribe(audio, language="en")
        transcript = " ".join(seg.text for seg in segments).strip()
    except Exception as exc:  # noqa: BLE001
        logger.error("whisper transcription failed: %s", exc)
        return {"transcript": "", "is_toxic": False, "score": 0.0}

    toxic = check_text_toxicity(transcript)
    return {
        "transcript": transcript,
        "is_toxic": toxic["is_toxic"],
        "score": toxic["score"],
    }


class ModerationWorker:
    """Redis pub/sub worker: moderates chat + audio streams per meeting."""

    def __init__(self) -> None:
        self._tasks: list[asyncio.Task] = []
        self._running = False

    async def run(self) -> None:
        """Start two long-running subscriber loops (chat + audio)."""
        ModerationModels.load()
        self._running = True
        self._tasks = [
            asyncio.create_task(self._channel_loop("chat")),
            asyncio.create_task(self._channel_loop("audio")),
        ]
        await asyncio.gather(*self._tasks, return_exceptions=True)

    async def stop(self) -> None:
        self._running = False
        for t in self._tasks:
            t.cancel()

    async def _channel_loop(self, kind: str) -> None:
        """Subscribe to all channels of one kind (chat:* or audio:*) and moderate."""
        pubsub = redis_client.pubsub()
        await pubsub.psubscribe(f"{kind}:*")
        logger.info("Moderation worker listening on %s:*", kind)
        try:
            async for message in pubsub.listen():
                if not self._running:
                    break
                if message.get("type") != "pmessage":
                    continue
                channel = message.get("channel", "")
                data = message.get("data")
                try:
                    await self._handle(kind, channel, data)
                except Exception:  # noqa: BLE001
                    logger.exception("error moderating %s message", kind)
        finally:
            await pubsub.unsubscribe(f"{kind}:*")
            await pubsub.aclose()

    async def _handle(self, kind: str, channel: str, raw: object) -> None:
        """Process one pub/sub message and emit moderation events if toxic."""
        try:
            payload = json.loads(raw) if isinstance(raw, str) else raw
        except (json.JSONDecodeError, TypeError):
            return

        meeting_id = _extract_meeting_id(channel)
        if not meeting_id or not isinstance(payload, dict):
            return

        user_id = payload.get("user_id")
        if kind == "chat":
            content = payload.get("content") or payload.get("text") or ""
            result = check_text_toxicity(content)
            reason = "toxic_chat"
            flagged_content = content
        else:  # audio
            audio_bytes = payload.get("audio")
            sample_rate = int(payload.get("sample_rate", 16000))
            if isinstance(audio_bytes, str):
                # Allow base64-encoded payloads.
                import base64

                try:
                    audio_bytes = base64.b64decode(audio_bytes)
                except Exception:  # noqa: BLE001
                    return
            if not isinstance(audio_bytes, (bytes, bytearray)):
                return
            result = process_audio_chunk(bytes(audio_bytes), sample_rate)
            reason = "toxic_speech"
            flagged_content = result.get("transcript", "")

        # ── Persist transcript segment for the meeting summarizer ──
        # Both chat text and audio transcripts are accumulated so the
        # post-meeting summarization pipeline has a complete log.
        transcript_text = flagged_content.strip() if flagged_content else ""
        if transcript_text and meeting_id:
            try:
                await _persist_transcript_segment(
                    meeting_id=meeting_id,
                    user_id=user_id,
                    speaker_name=payload.get("speaker_name") or payload.get("username") or user_id,
                    timestamp=float(payload.get("timestamp", 0)),
                    text=transcript_text,
                )
            except Exception:  # noqa: BLE001
                logger.debug("transcript persist skipped (non-critical)")

        if result.get("is_toxic"):
            await redis_client.publish(
                f"moderation:{meeting_id}",
                json.dumps({
                    "type": "auto_remove",
                    "user_id": user_id,
                    "reason": reason,
                    "content": flagged_content,
                    "score": result.get("score"),
                    "categories": result.get("categories"),
                }),
            )
            logger.warning(
                "moderation auto_remove meeting=%s user=%s reason=%s score=%.2f",
                meeting_id, user_id, reason, result.get("score", 0),
            )


def _extract_meeting_id(channel: str | bytes) -> Optional[str]:
    """Extract the meeting id from a channel name like 'chat:{meeting_id}'."""
    if isinstance(channel, bytes):
        channel = channel.decode("utf-8", errors="ignore")
    parts = channel.split(":", 1)
    return parts[1] if len(parts) == 2 else None


async def _persist_transcript_segment(
    meeting_id: str,
    user_id: Optional[str],
    speaker_name: Optional[str],
    timestamp: float,
    text: str,
) -> None:
    """Store a transcript chunk into Postgres via the summarizer module.

    Uses a short-lived session so it doesn't interfere with the pub/sub
    event loop. Failures are silently logged — transcript accumulation is
    best-effort and should never block moderation.
    """
    import uuid as _uuid
    from backend.db.session import AsyncSessionLocal
    from backend.ai_workers.summarizer import store_transcript_segment

    uid = None
    if user_id and user_id != "public":
        try:
            uid = _uuid.UUID(user_id)
        except (ValueError, AttributeError):
            pass

    async with AsyncSessionLocal() as db:
        await store_transcript_segment(
            db=db,
            meeting_id=_uuid.UUID(meeting_id),
            user_id=uid,
            speaker_name=speaker_name,
            timestamp=timestamp,
            text=text,
        )
