"""Database repository for Google Calendar connections and synchronized events."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, List, Optional, Sequence
from uuid import UUID

from sqlalchemy import delete, func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.calendar.models import CalendarConnection, CalendarEvent


async def get_connection(
    db: AsyncSession, user_id: UUID
) -> Optional[CalendarConnection]:
    """Retrieve user's Google Calendar connection profile."""
    result = await db.execute(
        select(CalendarConnection).where(CalendarConnection.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def list_active_connections(
    db: AsyncSession,
) -> Sequence[CalendarConnection]:
    """List all active calendar connections for periodic sync."""
    result = await db.execute(
        select(CalendarConnection).where(CalendarConnection.is_active.is_(True))
    )
    return result.scalars().all()


async def save_connection(
    db: AsyncSession, connection: CalendarConnection
) -> CalendarConnection:
    """Insert or update calendar connection."""
    db.add(connection)
    await db.commit()
    await db.refresh(connection)
    return connection


async def delete_connection(db: AsyncSession, user_id: UUID) -> None:
    """Remove user's calendar connection and synchronized events."""
    await db.execute(
        delete(CalendarEvent).where(CalendarEvent.user_id == user_id)
    )
    await db.execute(
        delete(CalendarConnection).where(CalendarConnection.user_id == user_id)
    )
    await db.commit()


async def upsert_calendar_event(
    db: AsyncSession,
    *,
    user_id: UUID,
    google_event_id: str,
    title: str,
    description: Optional[str],
    start_time: datetime,
    end_time: datetime,
    meet_url: Optional[str],
    html_link: Optional[str],
    location: Optional[str],
    attendees: List[dict[str, Any]],
    is_all_day: bool,
) -> None:
    """Upsert calendar event matching user_id and google_event_id."""
    existing = await db.execute(
        select(CalendarEvent).where(
            CalendarEvent.user_id == user_id,
            CalendarEvent.google_event_id == google_event_id,
        )
    )
    event = existing.scalar_one_or_none()
    if event is None:
        event = CalendarEvent(
            user_id=user_id,
            google_event_id=google_event_id,
            title=title,
            description=description,
            start_time=start_time,
            end_time=end_time,
            meet_url=meet_url,
            html_link=html_link,
            location=location,
            attendees=attendees,
            is_all_day=is_all_day,
        )
        db.add(event)
    else:
        event.title = title
        event.description = description
        # If start_time changed significantly, reset reminder flags
        if abs((event.start_time - start_time).total_seconds()) > 60:
            event.reminded_10m = False
            event.reminded_2m = False
        event.start_time = start_time
        event.end_time = end_time
        event.meet_url = meet_url
        event.html_link = html_link
        event.location = location
        event.attendees = attendees
        event.is_all_day = is_all_day


async def list_upcoming_events(
    db: AsyncSession,
    user_id: UUID,
    from_time: datetime,
    to_time: datetime,
) -> Sequence[CalendarEvent]:
    """Fetch events for a user in ascending start order."""
    result = await db.execute(
        select(CalendarEvent)
        .where(
            CalendarEvent.user_id == user_id,
            CalendarEvent.end_time >= from_time,
            CalendarEvent.start_time <= to_time,
        )
        .order_by(CalendarEvent.start_time.asc())
    )
    return result.scalars().all()


async def get_pending_10m_reminders(
    db: AsyncSession,
    window_start: datetime,
    window_end: datetime,
) -> Sequence[CalendarEvent]:
    """Find events starting in [window_start, window_end] that haven't sent 10m reminder."""
    result = await db.execute(
        select(CalendarEvent).where(
            CalendarEvent.reminded_10m.is_(False),
            CalendarEvent.is_all_day.is_(False),
            CalendarEvent.start_time >= window_start,
            CalendarEvent.start_time <= window_end,
        )
    )
    return result.scalars().all()


async def get_pending_2m_reminders(
    db: AsyncSession,
    window_start: datetime,
    window_end: datetime,
) -> Sequence[CalendarEvent]:
    """Find events starting in [window_start, window_end] that haven't sent 2m reminder."""
    result = await db.execute(
        select(CalendarEvent).where(
            CalendarEvent.reminded_2m.is_(False),
            CalendarEvent.is_all_day.is_(False),
            CalendarEvent.start_time >= window_start,
            CalendarEvent.start_time <= window_end,
        )
    )
    return result.scalars().all()


async def mark_event_reminded_10m(db: AsyncSession, event_id: UUID) -> None:
    await db.execute(
        update(CalendarEvent)
        .where(CalendarEvent.id == event_id)
        .values(reminded_10m=True)
    )
    await db.commit()


async def mark_event_reminded_2m(db: AsyncSession, event_id: UUID) -> None:
    await db.execute(
        update(CalendarEvent)
        .where(CalendarEvent.id == event_id)
        .values(reminded_2m=True)
    )
    await db.commit()
