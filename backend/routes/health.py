"""Health check endpoint."""

from fastapi import APIRouter
from backend.routes.schemas import SuccessResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=SuccessResponse)
async def health_check():
    return SuccessResponse(message="FocusMeet API is running")
