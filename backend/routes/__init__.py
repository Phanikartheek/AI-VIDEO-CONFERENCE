from backend.routes.auth import router as auth_router
from backend.routes.meetings import router as meetings_router
from backend.routes.health import router as health_router
from backend.routes.reports import router as reports_router
from backend.routes.engagement_ws import router as engagement_ws_router
from backend.routes.waiting_room_ws import router as waiting_room_ws_router
from backend.routes.summary import router as summary_router
from backend.routes.chat_ws import router as chat_ws_router
from backend.routes.polls import router as polls_router

__all__ = [
    "auth_router", "meetings_router", "health_router", "reports_router",
    "engagement_ws_router", "waiting_room_ws_router", "summary_router",
    "chat_ws_router", "polls_router",
]
