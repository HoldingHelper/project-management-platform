"""Unit tests for Google Calendar integration, meeting sync, and smart reminders."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest

from app.core.config import get_settings
from app.core.google_calendar import (
    extract_meeting_url,
    get_calendar_auth_url,
)
from app.modules.calendar import service
from app.modules.calendar.models import CalendarConnection, CalendarEvent
from app.modules.calendar.schemas import CalendarConnectionStatus
from app.shared.base_model import utcnow


def test_calendar_auth_url_construction(monkeypatch):
    monkeypatch.setattr(get_settings(), "google_oauth_client_id", "test-client-id.apps.googleusercontent.com")
    monkeypatch.setattr(get_settings(), "google_calendar_redirect_uri", "http://localhost:3000/calendar/callback")

    url = get_calendar_auth_url("state-12345")
    assert "https://accounts.google.com/o/oauth2/v2/auth?" in url
    assert "client_id=test-client-id.apps.googleusercontent.com" in url
    assert "state=state-12345" in url
    assert "calendar.readonly" in url


def test_extract_meeting_url_from_hangout_link():
    event = {
        "summary": "Sprint Planning",
        "hangoutLink": "https://meet.google.com/abc-defg-hij",
    }
    assert extract_meeting_url(event) == "https://meet.google.com/abc-defg-hij"


def test_extract_meeting_url_from_conference_data():
    event = {
        "summary": "Design Critique",
        "conferenceData": {
            "entryPoints": [
                {"entryPointType": "video", "uri": "https://meet.google.com/xyz-uvwx-rst"}
            ]
        },
    }
    assert extract_meeting_url(event) == "https://meet.google.com/xyz-uvwx-rst"


def test_extract_meeting_url_from_description_zoom():
    event = {
        "summary": "Client Demo",
        "description": "Join our Zoom room here: https://company.zoom.us/j/123456789 with passcode 123",
    }
    assert extract_meeting_url(event) == "https://company.zoom.us/j/123456789"


@pytest.mark.asyncio
async def test_get_calendar_status_connected_and_disconnected(monkeypatch):
    user_id = uuid4()

    async def mock_get_conn_none(_db, _uid):
        return None

    monkeypatch.setattr(service.repo, "get_connection", mock_get_conn_none)
    status_disconnected = await service.get_calendar_status(None, user_id)  # type: ignore[arg-type]
    assert status_disconnected.connected is False

    mock_conn = CalendarConnection(
        user_id=user_id,
        encrypted_refresh_token="encrypted-token",
        google_email="engineer@example.com",
        is_active=True,
    )

    async def mock_get_conn_active(_db, _uid):
        return mock_conn

    monkeypatch.setattr(service.repo, "get_connection", mock_get_conn_active)
    status_connected = await service.get_calendar_status(None, user_id)  # type: ignore[arg-type]
    assert status_connected.connected is True
    assert status_connected.google_email == "engineer@example.com"


@pytest.mark.asyncio
async def test_dispatch_meeting_reminders(monkeypatch):
    now = utcnow()
    user_id = uuid4()

    event_10m = CalendarEvent(
        id=uuid4(),
        user_id=user_id,
        google_event_id="google-1",
        title="10m Sprint Kickoff",
        start_time=now + timedelta(minutes=10),
        end_time=now + timedelta(minutes=40),
        meet_url="https://meet.google.com/abc-defg-hij",
        reminded_10m=False,
        reminded_2m=False,
    )

    event_2m = CalendarEvent(
        id=uuid4(),
        user_id=user_id,
        google_event_id="google-2",
        title="2m Standup Call",
        start_time=now + timedelta(minutes=2),
        end_time=now + timedelta(minutes=17),
        meet_url="https://meet.google.com/xyz-uvwx-rst",
        reminded_10m=True,
        reminded_2m=False,
    )

    dispatched_events = []
    reminded_10m_ids = []
    reminded_2m_ids = []

    async def mock_get_10m(_db, _start, _end):
        return [event_10m]

    async def mock_get_2m(_db, _start, _end):
        return [event_2m]

    async def mock_mark_10m(_db, eid):
        reminded_10m_ids.append(eid)

    async def mock_mark_2m(_db, eid):
        reminded_2m_ids.append(eid)

    monkeypatch.setattr(service.repo, "get_pending_10m_reminders", mock_get_10m)
    monkeypatch.setattr(service.repo, "get_pending_2m_reminders", mock_get_2m)
    monkeypatch.setattr(service.repo, "mark_event_reminded_10m", mock_mark_10m)
    monkeypatch.setattr(service.repo, "mark_event_reminded_2m", mock_mark_2m)
    monkeypatch.setattr(service.event_bus, "publish", lambda ev: dispatched_events.append(ev))

    result = await service.check_and_dispatch_meeting_reminders(None)  # type: ignore[arg-type]

    assert result["dispatched_10m"] == 1
    assert result["dispatched_2m"] == 1
    assert len(dispatched_events) == 2
    assert "10 min: 10m Sprint Kickoff" in dispatched_events[0].title
    assert "starting now: 2m Standup Call" in dispatched_events[1].title
    assert reminded_10m_ids == [event_10m.id]
    assert reminded_2m_ids == [event_2m.id]
