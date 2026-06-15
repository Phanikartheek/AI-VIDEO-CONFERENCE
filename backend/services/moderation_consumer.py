"""
Moderation consumer: subscribes to `moderation:{meeting_id}` channels and
acts on `auto_remove` events by removing the participant from the LiveKit room.

This runs in the FastAPI process (started on app startup). The heavy
moderation worker (toxic-bert + whisper) can run in this same process or as
a separate process — both communicate purely through Redis pub/sub.
"""
import asyncio
import json
import logging

from backend.config import settings
from backend.db.redis_client import redis_client

logger = logging.getLogger("focusmeet.moderation_consumer")

_consumer_task: "asyncio.Task | None" = None


async def start_moderation_consumer() -> asyncio.Task:
    """Start (or reuse) the single moderation consumer task."""
    global _consumer_task
    if _consumer_task and not _consumer_task.done():
        return _consumer_task

    # Optionally also start the heavy moderation worker in-process.
    try:
        from backend.ai_workers.moderation import ModerationWorker

        worker = ModerationWorker()
        asyncio.create_task(worker.run())
        logger.info("In-process ModerationWorker started")
    except Exception as exc:  # noqa: BLE001
        logger.warning("Could not start in-process ModerationWorker: %s", exc)

    _consumer_task = asyncio.create_task(_moderation_loop())
    return _consumer_task


async def _moderation_loop() -> None:
    """Subscribe to moderation:* and remove flagged participants."""
    pubsub = redis_client.pubsub()
    await pubsub.psubscribe("moderation:*")
    logger.info("Moderation consumer listening on moderation:*")

    try:
        async for message in pubsub.listen():
            if message.get("type") != "pmessage":
                continue
            channel = message.get("channel", "")
            data = message.get("data")
            try:
                await _on_moderation_event(channel, data)
            except Exception:  # noqa: BLE001
                logger.exception("error handling moderation event")
    finally:
        await pubsub.unsubscribe("moderation:*")
        await pubsub.aclose()


async def _on_moderation_event(channel: str | bytes, raw: object) -> None:
    if isinstance(channel, bytes):
        channel = channel.decode("utf-8", errors="ignore")
    meeting_id = channel.split(":", 1)[1] if ":" in channel else None
    if not meeting_id:
        return

    try:
        event = json.loads(raw) if isinstance(raw, str) else raw
    except (json.JSONDecodeError, TypeError):
        return
    if not isinstance(event, dict):
        return

    if event.get("type") != "auto_remove":
        return

    user_id = event.get("user_id")
    reason = event.get("reason", "moderation")
    if not user_id:
        return

    room_name = f"meeting-{meeting_id}"
    logger.warning(
        "Auto-removing participant user=%s from room=%s reason=%s score=%s",
        user_id, room_name, reason, event.get("score"),
    )

    # Remove from LiveKit via the Server API.
    await _livekit_remove_participant(room_name, str(user_id))

    # Notify the room (e.g. host UI) about the removal.
    await redis_client.publish(
        f"room_events:{meeting_id}",
        json.dumps({
            "type": "participant_removed",
            "user_id": user_id,
            "reason": reason,
        }),
    )


async def _livekit_remove_participant(room_name: str, identity: str) -> None:
    """Call the LiveKit Server API to remove a participant.

    Uses the livekit-api SDK when available; logs a warning otherwise so the
    rest of the moderation flow still works in dev without a LiveKit server.
    """
    try:
        from livekit import api as livekit_api  # type: ignore

        lk = livekit_api.LiveKitAPI(
            url=settings.LIVEKIT_URL.replace("ws", "http", 1)
            if settings.LIVEKIT_URL.startswith("ws")
            else settings.LIVEKIT_URL,
            api_key=settings.LIVEKIT_API_KEY,
            api_secret=settings.LIVEKIT_API_SECRET,
        )
        await lk.room.remove_participant(
            livekit_api.RemoveParticipantRequest(room=room_name, identity=identity)
        )
        logger.info("Removed participant %s from %s", identity, room_name)
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "LiveKit removal skipped (no server / SDK): %s — would remove %s from %s",
            exc, identity, room_name,
        )
