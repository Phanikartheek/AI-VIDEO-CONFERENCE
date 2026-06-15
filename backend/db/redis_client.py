"""Async Redis client (shared across services)."""
import redis.asyncio as redis
from backend.config import settings

# Single shared async connection pool
redis_client: redis.Redis = redis.from_url(
    settings.REDIS_URL,
    decode_responses=True,
    encoding="utf-8",
)


async def get_redis() -> redis.Redis:
    """Dependency that yields the shared Redis client."""
    return redis_client
