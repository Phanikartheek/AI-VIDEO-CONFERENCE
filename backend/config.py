from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://focusmeet:focusmeet@postgres:5432/focusmeet"
    DATABASE_URL_SYNC: str = "postgresql://focusmeet:focusmeet@postgres:5432/focusmeet"

    # Redis
    REDIS_URL: str = "redis://redis:6379/0"

    # JWT
    JWT_SECRET: str = "change-me-to-a-long-random-string"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    JWT_INVITE_EXPIRE_MINUTES: int = 15

    # LiveKit
    LIVEKIT_API_KEY: str = "devkey"
    LIVEKIT_API_SECRET: str = "devsecret"
    LIVEKIT_URL: str = "ws://localhost:7880"

    # CORS
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    DEBUG: bool = True

    # ─── Engagement Engine ──────────────────────────────────
    # How often (seconds) participants send engagement samples
    ENGAGEMENT_SAMPLE_INTERVAL_SEC: int = 10
    # Rolling window length (seconds)
    ENGAGEMENT_WINDOW_SEC: int = 30
    # Group average check interval (seconds)
    ENGAGEMENT_CHECK_INTERVAL_SEC: int = 30
    # Threshold for low-engagement alerts
    LOW_ENGAGEMENT_THRESHOLD: float = 40.0
    # Consecutive low checks required before alerting
    LOW_ENGAGEMENT_CONSECUTIVE: int = 2

    # ─── AI Moderation ──────────────────────────────────────
    MODERATION_TOXIC_THRESHOLD: float = 0.7
    MODERATION_WHISPER_MODEL: str = "base"
    MODERATION_WHISPER_DEVICE: str = "cpu"  # "cpu" | "cuda"
    MODERATION_WHISPER_COMPUTE_TYPE: str = "int8"
    # Enable moderation consumer loop (heavy deps); off by default
    MODERATION_ENABLED: bool = True

    # ─── AI Meeting Summarizer (Local Ollama) ────────────────
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "qwen3:4b"
    OLLAMA_TIMEOUT_SECONDS: float = 180.0  # local inference can be slow for long transcripts

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",")]

    class Config:
        env_file = ".env"


settings = Settings()
