"""Service layer for Google Calendar integration, meeting sync, and smart reminders."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID

import structlog
from dateutil import parser as date_parser
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.events import event_bus
from app.core.exceptions import NotFoundError, UnauthorizedError, ValidationAppError
from app.core.google_calendar import (
    exchange_calendar_code,
    extract_meeting_url,
    fetch_calendar_events,
    get_calendar_auth_url,
    get_valid_calendar_access_token,
)
from app.core.google_drive import decrypt_refresh_token, encrypt_refresh_token
from app.modules.calendar import repository as repo
from app.modules.calendar.models import CalendarConnection, CalendarEvent
from app.modules.calendar.schemas import (
    CalendarConnectionStatus,
    CalendarEventRead,
    UpcomingMeetingsResponse,
)
from app.shared.base_model import utcnow
from app.shared.events import NotificationRequested

logger = structlog.get_logger(__name__)


def generate_calendar_auth_url(user_id: UUID) -> str:
    """Return Google OAuth consent URL with random CSRF state (H-10)."""
    from app.core.security import create_oauth_state_sync
    state = create_oauth_state_sync(user_id, "calendar")
    return get_calendar_auth_url(state)


async def get_calendar_status(
    db: AsyncSession, user_id: UUID
) -> CalendarConnectionStatus:
    """Retrieve connection status for a user."""
    conn = await repo.get_connection(db, user_id)
    if conn is None or not conn.is_active:
        return CalendarConnectionStatus(connected=False, is_active=False)
    return CalendarConnectionStatus(
        connected=True,
        google_email=conn.google_email,
        last_synced_at=conn.last_synced_at,
        is_active=conn.is_active,
    )


async def connect_calendar(
    db: AsyncSession, user_id: UUID, code: str, state: Optional[str] = None
) -> CalendarConnectionStatus:
    """Complete OAuth handshake, encrypt refresh token, and run initial sync."""
    if state is not None:
        from app.core.exceptions import UnauthorizedError
        from app.core.security import verify_oauth_state
        if not await verify_oauth_state(user_id, "calendar", state):
            raise UnauthorizedError("Invalid or expired OAuth state parameter.")

    token_data = await exchange_calendar_code(code)
    refresh_token = token_data["refresh_token"]
    google_email = token_data.get("email")

    encrypted_token = encrypt_refresh_token(refresh_token)

    conn = await repo.get_connection(db, user_id)
    if conn is None:
        conn = CalendarConnection(
            user_id=user_id,
            encrypted_refresh_token=encrypted_token,
            google_email=google_email,
            is_active=True,
        )
    else:
        conn.encrypted_refresh_token = encrypted_token
        conn.google_email = google_email
        conn.is_active = True

    await repo.save_connection(db, conn)

    # Initial sync for next 14 days
    try:
        await sync_user_calendar(db, user_id)
    except Exception as exc:
        logger.warning(
            "Initial calendar sync failed after connection",
            user_id=str(user_id),
            error=str(exc),
        )

    return await get_calendar_status(db, user_id)


async def disconnect_calendar(db: AsyncSession, user_id: UUID) -> None:
    """Remove Google Calendar connection and cached events."""
    await repo.delete_connection(db, user_id)


async def sync_user_calendar(db: AsyncSession, user_id: UUID) -> int:
    """Fetch upcoming meetings from Google Calendar API and sync to database."""
    conn = await repo.get_connection(db, user_id)
    if conn is None or not conn.is_active:
        return 0

    refresh_token = decrypt_refresh_token(conn.encrypted_refresh_token)
    access_token = await get_valid_calendar_access_token(refresh_token)

    now = utcnow()
    time_min = now - timedelta(hours=2)
    time_max = now + timedelta(days=14)

    raw_events = await fetch_calendar_events(access_token, time_min, time_max)

    synced_count = 0
    for raw in raw_events:
        # Ignore cancelled events
        if raw.get("status") == "cancelled":
            continue

        google_event_id = raw.get("id")
        if not google_event_id:
            continue

        title = raw.get("summary") or "(No title)"
        description = raw.get("description")
        location = raw.get("location")
        html_link = raw.get("htmlLink")
        meet_url = extract_meeting_url(raw)

        # Parse start and end times (could be dateTime or all-day date)
        start_obj = raw.get("start") or {}
        end_obj = raw.get("end") or {}

        is_all_day = False
        if "dateTime" in start_obj:
            start_time = date_parser.isoparse(start_obj["dateTime"])
        elif "date" in start_obj:
            start_time = date_parser.isoparse(start_obj["date"]).replace(
                tzinfo=timezone.utc
            )
            is_all_day = True
        else:
            continue

        if "dateTime" in end_obj:
            end_time = date_parser.isoparse(end_obj["dateTime"])
        elif "date" in end_obj:
            end_time = date_parser.isoparse(end_obj["date"]).replace(
                tzinfo=timezone.utc
            )
        else:
            end_time = start_time + timedelta(hours=1)

        # Ensure UTC timezone awareness
        if start_time.tzinfo is None:
            start_time = start_time.replace(tzinfo=timezone.utc)
        else:
            start_time = start_time.astimezone(timezone.utc)

        if end_time.tzinfo is None:
            end_time = end_time.replace(tzinfo=timezone.utc)
        else:
            end_time = end_time.astimezone(timezone.utc)

        # Process attendees
        attendees = []
        for att in raw.get("attendees") or []:
            attendees.append(
                {
                    "email": att.get("email", ""),
                    "displayName": att.get("displayName"),
                    "responseStatus": att.get("responseStatus"),
                    "self": att.get("self", False),
                }
            )

        await repo.upsert_calendar_event(
            db,
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
        synced_count += 1

    conn.last_synced_at = utcnow()
    await db.commit()
    return synced_count


async def get_upcoming_meetings(
    db: AsyncSession, user_id: UUID, hours_ahead: int = 24
) -> UpcomingMeetingsResponse:
    """Return upcoming meetings formatted with countdown timers and conference links."""
    conn_status = await get_calendar_status(db, user_id)
    if not conn_status.connected:
        return UpcomingMeetingsResponse(connected=False)

    now = utcnow()
    to_time = now + timedelta(hours=hours_ahead)

    events = await repo.list_upcoming_events(db, user_id, now, to_time)

    meeting_reads: List[CalendarEventRead] = []
    for ev in events:
        diff_seconds = (ev.start_time - now).total_seconds()
        starts_in_minutes = max(0, int(diff_seconds // 60))
        is_now = ev.start_time <= now <= ev.end_time

        read = CalendarEventRead(
            id=ev.id,
            google_event_id=ev.google_event_id,
            title=ev.title,
            description=ev.description,
            start_time=ev.start_time,
            end_time=ev.end_time,
            meet_url=ev.meet_url,
            html_link=ev.html_link,
            location=ev.location,
            attendees=ev.attendees,
            is_all_day=ev.is_all_day,
            starts_in_minutes=starts_in_minutes,
            is_now=is_now,
        )
        meeting_reads.append(read)

    next_meeting = meeting_reads[0] if meeting_reads else None

    return UpcomingMeetingsResponse(
        connected=True,
        meetings=meeting_reads,
        next_meeting=next_meeting,
    )


async def check_and_dispatch_meeting_reminders(db: AsyncSession) -> Dict[str, int]:
    """Scan upcoming meetings across all users and trigger 10m and 2m advance alerts."""
    now = utcnow()

    # 1. 10-minute reminders window: events starting in [8.5 min, 11.5 min]
    start_10m = now + timedelta(minutes=8, seconds=30)
    end_10m = now + timedelta(minutes=11, seconds=30)
    pending_10m = await repo.get_pending_10m_reminders(db, start_10m, end_10m)

    count_10m = 0
    for ev in pending_10m:
        meet_text = f" [Join: {ev.meet_url}]" if ev.meet_url else ""
        link_url = ev.meet_url or ev.html_link or "/settings"

        event_bus.publish(
            NotificationRequested(
                user_id=ev.user_id,
                type="meeting_reminder_10m",
                title=f"Upcoming Meeting in 10 min: {ev.title}",
                body=f"Starting at {ev.start_time.strftime('%H:%M UTC')}.{meet_text}",
                link=link_url,
            )
        )
        await repo.mark_event_reminded_10m(db, ev.id)
        count_10m += 1

    # 2. 2-minute reminders window: events starting in [0.5 min, 3.0 min]
    start_2m = now + timedelta(seconds=30)
    end_2m = now + timedelta(minutes=3, seconds=0)
    pending_2m = await repo.get_pending_2m_reminders(db, start_2m, end_2m)

    count_2m = 0
    for ev in pending_2m:
        meet_text = f" Click to join: {ev.meet_url}" if ev.meet_url else ""
        link_url = ev.meet_url or ev.html_link or "/settings"

        event_bus.publish(
            NotificationRequested(
                user_id=ev.user_id,
                type="meeting_reminder_2m",
                title=f"Meeting starting now: {ev.title}",
                body=f"Your meeting is starting in 2 minutes!{meet_text}",
                link=link_url,
                requires_action=bool(ev.meet_url),
            )
        )
        await repo.mark_event_reminded_2m(db, ev.id)
        count_2m += 1

    return {"dispatched_10m": count_10m, "dispatched_2m": count_2m}
