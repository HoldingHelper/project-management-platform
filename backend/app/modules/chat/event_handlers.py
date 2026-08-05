"""Subscribes Chat's handlers to cross-module integration events.

- ProjectCreated            -> auto-create the project channel
- ProjectMemberAdded/Removed-> keep channel membership in sync
- ChatMessageSent           -> realtime push to the channel's websocket group
"""

from __future__ import annotations

import structlog

from app.core.database import AsyncSessionLocal
from app.core.events import event_bus
from app.core.websocket_manager import connection_manager
from app.modules.chat import repository as repo
from app.modules.chat import service
from app.shared.events import (
    ChatMessageSent,
    ProjectCreated,
    ProjectMemberAdded,
    ProjectMemberRemoved,
)

logger = structlog.get_logger(__name__)


async def _handle_project_created(event: ProjectCreated) -> None:
    async with AsyncSessionLocal() as db:
        await service.create_project_channel(
            db,
            project_id=event.project_id,
            name=event.name,
            created_by_user_id=event.created_by_user_id,
            member_user_ids=list(event.member_user_ids),
        )


async def _handle_member_added(event: ProjectMemberAdded) -> None:
    async with AsyncSessionLocal() as db:
        await service.sync_project_member(
            db, event.project_id, event.user_id, added=True
        )


async def _handle_member_removed(event: ProjectMemberRemoved) -> None:
    async with AsyncSessionLocal() as db:
        await service.sync_project_member(
            db, event.project_id, event.user_id, added=False
        )


async def _handle_message_sent(event: ChatMessageSent) -> None:
    async with AsyncSessionLocal() as db:
        message = await repo.get_message(db, event.message_id)
        if message is None:
            return
        payload = {
            "id": str(message.id),
            "channelId": str(message.channel_id),
            "senderUserId": str(message.sender_user_id),
            "parentMessageId": (
                str(message.parent_message_id) if message.parent_message_id else None
            ),
            "body": message.body,
            "messageType": message.message_type,
            "attachmentId": (
                str(message.attachment_id) if message.attachment_id else None
            ),
            "createdAt": message.created_at.isoformat(),
        }
        members = await repo.list_members(db, event.channel_id)

    await connection_manager.broadcast_to_group(
        f"chat:{event.channel_id}", "chat.message", payload
    )
    # Per-user push so the sidebar unread badge updates even when the
    # conversation isn't open (the group broadcast only reaches joiners).
    for member in members:
        if member.user_id != event.sender_user_id:
            await connection_manager.send_to_user(
                member.user_id, "chat.channel_activity", payload
            )


def register_chat_event_handlers() -> None:
    event_bus.subscribe(ProjectCreated, _handle_project_created)
    event_bus.subscribe(ProjectMemberAdded, _handle_member_added)
    event_bus.subscribe(ProjectMemberRemoved, _handle_member_removed)
    event_bus.subscribe(ChatMessageSent, _handle_message_sent)
    logger.info("chat_event_handlers_registered")
