"""Unit tests for WhatsApp integration, preferences gating, and bot commands."""

from __future__ import annotations

import pytest
from uuid import uuid4

from app.modules.integrations.models import WhatsAppUserSettings
from app.modules.integrations.whatsapp import service as whatsapp_service


@pytest.mark.asyncio
async def test_whatsapp_notification_respects_user_preferences(monkeypatch):
    user_id = uuid4()

    # User with meeting alerts disabled
    mock_settings = WhatsAppUserSettings(
        user_id=user_id,
        phone_number="+14155552671",
        notify_meetings=False,
        notify_mentions=True,
        notify_blockers=True,
        notify_dms=True,
        is_verified=True,
    )

    class MockAsyncSession:
        async def execute(self, stmt):
            class MockResult:
                def scalar_one_or_none(self):
                    return mock_settings
            return MockResult()

    mock_db = MockAsyncSession()

    # Meeting reminder should be skipped
    meeting_result = await whatsapp_service.notify_user_via_whatsapp(
        mock_db, user_id, "meeting_reminder_10m", "Sprint Review", "Starting soon", "https://meet.google.com/abc"  # type: ignore[arg-type]
    )
    assert meeting_result is False

    # Mention alert should proceed
    dispatched = []

    async def mock_send(phone, text):
        dispatched.append((phone, text))
        return True

    monkeypatch.setattr(
        whatsapp_service,
        "send_whatsapp_text_message",
        mock_send,
    )

    mention_result = await whatsapp_service.notify_user_via_whatsapp(
        mock_db, user_id, "mention", "New Mention", "@john mentioned you in Task", "https://localhost:3000"  # type: ignore[arg-type]
    )
    assert mention_result is True
    assert len(dispatched) == 1
    assert dispatched[0][0] == "+14155552671"
    assert "New Mention" in dispatched[0][1]


@pytest.mark.asyncio
async def test_handle_inbound_whatsapp_help_command():
    class MockAsyncSession:
        async def execute(self, stmt):
            class MockResult:
                def scalar_one_or_none(self):
                    return WhatsAppUserSettings(user_id=uuid4(), phone_number="+14155552671")
            return MockResult()

    reply = await whatsapp_service.handle_inbound_whatsapp_message(
        MockAsyncSession(), "+14155552671", "help"  # type: ignore[arg-type]
    )
    assert "Project Management Platform Assistant" in reply
    assert "• *tasks*" in reply
