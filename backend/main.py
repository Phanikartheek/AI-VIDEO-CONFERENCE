"""FocusMeet API — FastAPI entry point."""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.config import settings
from backend.db import async_engine, redis_client
from backend.models.base import Base
from backend.routes import (
    auth_router, meetings_router, health_router, reports_router,
    engagement_ws_router, waiting_room_ws_router, summary_router,
    chat_ws_router, polls_router,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    if settings.MODERATION_ENABLED:
        from backend.services.moderation_consumer import start_moderation_consumer
        try:
            await start_moderation_consumer()
        except Exception:
            pass
    yield
    await async_engine.dispose()
    await redis_client.aclose()


app = FastAPI(title="FocusMeet API", version="0.2.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins_list,
                   allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

app.include_router(health_router)
app.include_router(auth_router, prefix="/api")
app.include_router(meetings_router, prefix="/api")
app.include_router(reports_router, prefix="/api")
app.include_router(summary_router, prefix="/api")
app.include_router(polls_router, prefix="/api")

app.include_router(engagement_ws_router)
app.include_router(waiting_room_ws_router)
app.include_router(chat_ws_router)
