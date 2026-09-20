"""FastAPI router for Google Calendar integration and meeting reminders."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.current_user import CurrentUser
from app.core.database import get_db
from app.core.deps import get_current_user
from app.modules.calendar import service
from app.modules.calendar.schemas import (
    CalendarAuthUrlResponse,
    CalendarConnectionStatus,
    CalendarConnectRequest,
    UpcomingMeetingsResponse,
)

calendar_router = APIRouter(prefix="/calendar", tags=["Google Calendar"])


@calendar_router.get("/auth-url", response_model=CalendarAuthUrlResponse)
async def get_auth_url(
    current_user: CurrentUser = Depends(get_current_user),
) -> CalendarAuthUrlResponse:
    """Return the Google OAuth consent URL for the authenticated user."""
    url = service.generate_calendar_auth_url(current_user.user_id)
    return CalendarAuthUrlResponse(auth_url=url)


@calendar_router.get("/status", response_model=CalendarConnectionStatus)
async def get_connection_status(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CalendarConnectionStatus:
    """Return current user's Google Calendar connection status."""
    return await service.get_calendar_status(db, current_user.user_id)


@calendar_router.post("/connect", response_model=CalendarConnectionStatus)
async def connect_calendar(
    payload: CalendarConnectRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CalendarConnectionStatus:
    """Exchange authorization code and link Google Calendar."""
    return await service.connect_calendar(
        db, user_id=current_user.user_id, code=payload.code
    )


@calendar_router.delete("/disconnect", status_code=status.HTTP_204_NO_CONTENT)
async def disconnect_calendar(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Unlink Google Calendar and delete cached meeting records."""
    await service.disconnect_calendar(db, current_user.user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@calendar_router.get("/upcoming", response_model=UpcomingMeetingsResponse)
async def get_upcoming_meetings(
    hours_ahead: int = 24,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UpcomingMeetingsResponse:
    """Get upcoming meetings formatted for the header widget and agenda."""
    return await service.get_upcoming_meetings(
        db, current_user.user_id, hours_ahead=hours_ahead
    )


@calendar_router.post("/sync", response_model=CalendarConnectionStatus)
async def sync_calendar(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CalendarConnectionStatus:
    """Force synchronization with Google Calendar API."""
    await service.sync_user_calendar(db, current_user.user_id)
    return await service.get_calendar_status(db, current_user.user_id)
