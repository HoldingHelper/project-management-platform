"""Unit tests for chat channels, messaging, notifications, and mentions."""

from __future__ import annotations

from uuid import uuid4
from unittest.mock import AsyncMock
import pytest
from pydantic import ValidationError

from app.modules.chat.schemas import (
    ChannelListItem,
    ChannelRead,
    CreateDmRequest,
    MessageRead,
    SendMessageRequest,
)
from app.modules.collaboration.schemas import (
    NotificationRead,
)


def test_channel_models():
    ch_id = uuid4()
    channel = ChannelRead(
        id=ch_id,
        type="public",
        name="frontend-architecture",
        created_at="2026-08-20T00:00:00Z",
    )
    assert channel.name == "frontend-architecture"
    assert channel.type == "public"

    dm = CreateDmRequest(user_id=uuid4())
    assert dm.user_id is not None


def test_message_create_with_attachments_and_mentions():
    mentioned_user_1 = uuid4()
    mentioned_user_2 = uuid4()
    msg = SendMessageRequest(
        body="Deployed release v2.4.0 @john @sarah please check.",
        mentioned_user_ids=[mentioned_user_1, mentioned_user_2],
    )
    assert len(msg.mentioned_user_ids) == 2
    assert "@john" in msg.body


def test_notification_types_and_unread_state():
    notif = NotificationRead(
        id=uuid4(),
        user_id=uuid4(),
        type="mention",
        title="Mentioned in Task TASK-0042",
        body="John mentioned you in a comment",
        entity_type="task",
        entity_id=uuid4(),
        is_read=False,
        created_at="2026-08-20T00:00:00Z",
    )
    assert notif.type == "mention"
    assert notif.is_read is False
    assert notif.entity_type == "task"


def test_humanize_notification_body():
    from app.modules.collaboration.service import humanize_notification_body

    sample_raw = "Task 4bf1c810-06d7-4fde-8a87-cc611bc345b0 was assigned to you."
    cleaned = humanize_notification_body(sample_raw)
    assert "4bf1c810" not in cleaned
    assert "assigned" in cleaned

    sample_blocker = "Task c34be159-eb42-4138-bc2a-2ca9e829752e is blocked and pending your action."
    cleaned_blocker = humanize_notification_body(sample_blocker)
    assert "c34be159" not in cleaned_blocker
    assert "blocked" in cleaned_blocker


def test_device_registration_schemas():
    from app.modules.collaboration.schemas import DeviceRegisterRequest, DeviceRead
    from datetime import datetime, timezone

    req = DeviceRegisterRequest(
        device_token="fcm-token-xyz-1234567890",
        platform="ios",
        device_name="iPhone 16 Pro",
        app_version="1.0.0",
    )
    assert req.platform == "ios"
    assert req.device_token == "fcm-token-xyz-1234567890"

    device_id = uuid4()
    user_id = uuid4()
    read = DeviceRead(
        id=device_id,
        user_id=user_id,
        device_token="fcm-token-xyz-1234567890",
        platform="ios",
        device_name="iPhone 16 Pro",
        app_version="1.0.0",
        is_active=True,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    assert read.is_active is True


@pytest.mark.asyncio
async def test_ticket_assignment_creates_action_required_notification(monkeypatch):
    from app.modules.collaboration import event_handlers
    from app.shared.events import NotificationRequested, TaskAssigned

    recipient_id = uuid4()
    publish = AsyncMock()
    monkeypatch.setattr(event_handlers.event_bus, "publish", publish)

    await event_handlers._handle_task_assigned(
        TaskAssigned(
            task_id=uuid4(),
            assignee_user_ids=[recipient_id],
            task_title="Restore production access",
            is_ticket=True,
            requested_by_user_id=uuid4(),
        )
    )

    published = publish.await_args.args[0]
    assert isinstance(published, NotificationRequested)
    assert published.user_id == recipient_id
    assert published.type == "ticket_assigned"
    assert published.requires_action is True
    assert published.link.startswith("/tasks/")
