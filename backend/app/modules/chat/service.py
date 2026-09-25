"""Chat module business logic: project channels, DMs, threads, reactions,
read cursors and @mention parsing."""

from __future__ import annotations

import re
from typing import List, Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.events import event_bus
from app.core.exceptions import ForbiddenError, NotFoundError, ValidationAppError
from app.modules.chat import repository as repo
from app.modules.chat.models import Channel, ChannelMember, Message, MessageReaction
from app.modules.chat.schemas import (
    ChannelListItem,
    ChannelMemberRead,
    ChannelRead,
    MessageRead,
    SendMessageRequest,
)
from app.shared.base_model import utcnow
from app.shared.events import ChatMessageSent, NotificationRequested

_MENTION_RE = re.compile(r"@([A-Za-z0-9_.-]+)")


async def _require_member(
    db: AsyncSession, channel_id: UUID, user_id: UUID
) -> Channel:
    channel = await repo.get_channel(db, channel_id)
    if channel is None:
        raise NotFoundError("Channel", channel_id)
    member = await repo.get_member(db, channel_id, user_id)
    if member is None:
        raise ForbiddenError("You are not a member of this channel.")
    return channel


async def is_member(db: AsyncSession, channel_id: UUID, user_id: UUID) -> bool:
    """Cross-module/websocket contract: cheap membership check."""
    return await repo.get_member(db, channel_id, user_id) is not None


async def _to_message_read(db: AsyncSession, messages: List[Message]) -> List[MessageRead]:
    counts = await repo.reply_counts(db, [m.id for m in messages])
    out = []
    for m in messages:
        read = MessageRead.model_validate(m)
        read.reply_count = counts.get(m.id, 0)
        out.append(read)
    return out


# ---------- Channels ----------
async def list_my_channels(
    db: AsyncSession, user_id: UUID
) -> List[ChannelListItem]:
    channels = await repo.list_channels_for_user(db, user_id)
    items: List[ChannelListItem] = []
    for channel in channels:
        unread = await repo.unread_count(db, channel.id, user_id)
        last = await repo.last_message(db, channel.id)
        dm_user_id = None
        if channel.type == "dm":
            others = [m.user_id for m in channel.members if m.user_id != user_id]
            dm_user_id = others[0] if others else user_id
        items.append(
            ChannelListItem(
                channel=ChannelRead.model_validate(channel),
                unread_count=unread,
                last_message_preview=(
                    (last.body[:80] if last.body else f"[{last.message_type}]")
                    if last
                    else None
                ),
                last_message_at=last.created_at if last else None,
                dm_user_id=dm_user_id,
            )
        )
    items.sort(
        key=lambda i: (i.last_message_at or i.channel.created_at), reverse=True
    )
    return items


async def get_or_create_dm(
    db: AsyncSession, user_id: UUID, other_user_id: UUID
) -> ChannelRead:
    existing = await repo.find_dm_channel(db, user_id, other_user_id)
    if existing is not None:
        return ChannelRead.model_validate(existing)

    channel = Channel(type="dm", name="Direct message", created_by_user_id=user_id)
    db.add(channel)
    await db.flush()
    db.add(ChannelMember(channel_id=channel.id, user_id=user_id))
    if other_user_id != user_id:
        db.add(ChannelMember(channel_id=channel.id, user_id=other_user_id))
    await db.commit()
    await db.refresh(channel)
    return ChannelRead.model_validate(channel)


async def create_project_channel(
    db: AsyncSession,
    *,
    project_id: UUID,
    name: str,
    created_by_user_id: Optional[UUID],
    member_user_ids: List[UUID],
) -> Channel:
    """Called by the ProjectCreated event handler (idempotent)."""
    existing = await repo.get_channel_by_project(db, project_id)
    if existing is not None:
        return existing
    channel = Channel(
        type="project",
        project_id=project_id,
        name=name,
        created_by_user_id=created_by_user_id,
    )
    db.add(channel)
    await db.flush()
    for user_id in set(member_user_ids):
        db.add(ChannelMember(channel_id=channel.id, user_id=user_id))
    await db.commit()
    return channel


async def sync_project_member(
    db: AsyncSession, project_id: UUID, user_id: UUID, *, added: bool
) -> None:
    channel = await repo.get_channel_by_project(db, project_id)
    if channel is None:
        return
    member = await repo.get_member(db, channel.id, user_id)
    if added and member is None:
        db.add(ChannelMember(channel_id=channel.id, user_id=user_id))
        await db.commit()
    elif not added and member is not None:
        await db.delete(member)
        await db.commit()


async def list_channel_members(
    db: AsyncSession, channel_id: UUID, user_id: UUID
) -> List[ChannelMemberRead]:
    await _require_member(db, channel_id, user_id)
    members = await repo.list_members(db, channel_id)
    return [ChannelMemberRead.model_validate(m) for m in members]


# ---------- Messages ----------
async def _resolve_mentions(db: AsyncSession, body: str) -> List[UUID]:
    """Resolve @username tokens to user ids via Identity's public service."""
    handles = set(_MENTION_RE.findall(body or ""))
    if not handles:
        return []
    from app.modules.identity import repository as identity_repo

    ids = []
    for handle in handles:
        user = await identity_repo.get_user_by_username(db, handle.lower())
        if user is not None:
            ids.append(user.id)
    return ids


async def send_message(
    db: AsyncSession,
    channel_id: UUID,
    sender_user_id: UUID,
    payload: SendMessageRequest,
) -> MessageRead:
    channel = await _require_member(db, channel_id, sender_user_id)

    if not payload.body and payload.attachment_id is None:
        raise ValidationAppError("Message needs a body or an attachment.")
    if payload.parent_message_id is not None:
        parent = await repo.get_message(db, payload.parent_message_id)
        if parent is None or parent.channel_id != channel_id:
            raise NotFoundError("Message", payload.parent_message_id)
        if parent.parent_message_id is not None:
            # Keep threads one level deep (Slack model).
            payload.parent_message_id = parent.parent_message_id

    if payload.attachment_id is not None:
        from app.modules.collaboration.models import FileAttachment
        attachment = await db.get(FileAttachment, payload.attachment_id)
        if attachment is None:
            raise NotFoundError("Attachment", payload.attachment_id)
        if attachment.uploaded_by_user_id != sender_user_id and (
            attachment.entity_id != channel_id or attachment.entity_type != "channel"
        ):
            raise ForbiddenError("You may only attach files that you uploaded or belong to this channel.")

    channel_members = await repo.list_members(db, channel_id)
    channel_member_ids = {m.user_id for m in channel_members}

    # Mentions stay in-channel (H-9)
    mentioned = (
        set(payload.mentioned_user_ids) | set(await _resolve_mentions(db, payload.body))
    ) & channel_member_ids

    message = Message(
        channel_id=channel_id,
        sender_user_id=sender_user_id,
        parent_message_id=payload.parent_message_id,
        body=payload.body,
        message_type=payload.message_type,
        attachment_id=payload.attachment_id,
        mentioned_user_ids=sorted(mentioned),
    )
    db.add(message)
    await db.commit()
    await db.refresh(message, attribute_names=["reactions"])

    await event_bus.publish(
        ChatMessageSent(
            message_id=message.id,
            channel_id=channel_id,
            sender_user_id=sender_user_id,
            mentioned_user_ids=list(mentioned),
        )
    )
    for user_id in mentioned:
        if user_id == sender_user_id:
            continue
        await event_bus.publish(
            NotificationRequested(
                user_id=user_id,
                type="chat_mention",
                title=f"You were mentioned in #{channel.name}",
                body=(payload.body or "")[:200],
                link=f"/chat/{channel_id}",
                entity_type="channel",
                entity_id=channel_id,
            )
        )
    if channel.type == "dm":
        for member in await repo.list_members(db, channel_id):
            if member.user_id != sender_user_id and member.user_id not in mentioned:
                await event_bus.publish(
                    NotificationRequested(
                        user_id=member.user_id,
                        type="dm",
                        title="New direct message",
                        body=(payload.body or "[voice message]")[:200],
                        link=f"/chat/{channel_id}",
                        entity_type="channel",
                        entity_id=channel_id,
                    )
                )

    return (await _to_message_read(db, [message]))[0]


async def list_messages(
    db: AsyncSession,
    channel_id: UUID,
    user_id: UUID,
    *,
    before_message_id: Optional[UUID] = None,
    thread_of: Optional[UUID] = None,
    limit: int = 50,
) -> List[MessageRead]:
    await _require_member(db, channel_id, user_id)
    before = None
    if before_message_id is not None:
        before = await repo.get_message(db, before_message_id)
    messages = await repo.list_messages(
        db, channel_id, before=before, thread_of=thread_of, limit=min(limit, 100)
    )
    return await _to_message_read(db, list(messages))


async def mark_read(
    db: AsyncSession, channel_id: UUID, user_id: UUID, message_id: UUID
) -> None:
    await _require_member(db, channel_id, user_id)
    member = await repo.get_member(db, channel_id, user_id)
    message = await repo.get_message(db, message_id)
    if message is None or message.channel_id != channel_id:
        raise NotFoundError("Message", message_id)
    member.last_read_message_id = message_id
    await db.commit()
    from app.core.websocket_manager import connection_manager

    await connection_manager.broadcast_to_group(
        f"chat:{channel_id}",
        "chat.read",
        {
            "channelId": str(channel_id),
            "userId": str(user_id),
            "messageId": str(message_id),
        },
    )


async def delete_message(
    db: AsyncSession, message_id: UUID, user_id: UUID
) -> None:
    message = await repo.get_message(db, message_id)
    if message is None:
        raise NotFoundError("Message", message_id)
    if message.sender_user_id != user_id:
        raise ForbiddenError("Only the author can delete a message.")
    message.deleted_at = utcnow()
    message.body = ""
    await db.commit()


async def add_reaction(
    db: AsyncSession, message_id: UUID, user_id: UUID, emoji: str
) -> None:
    message = await repo.get_message(db, message_id)
    if message is None:
        raise NotFoundError("Message", message_id)
    await _require_member(db, message.channel_id, user_id)
    if await repo.get_reaction(db, message_id, user_id, emoji) is not None:
        return
    db.add(MessageReaction(message_id=message_id, user_id=user_id, emoji=emoji))
    await db.commit()
    from app.core.websocket_manager import connection_manager

    await connection_manager.broadcast_to_group(
        f"chat:{message.channel_id}",
        "chat.reaction",
        {"messageId": str(message_id), "userId": str(user_id), "emoji": emoji},
    )


async def remove_reaction(
    db: AsyncSession, message_id: UUID, user_id: UUID, emoji: str
) -> None:
    reaction = await repo.get_reaction(db, message_id, user_id, emoji)
    if reaction is None:
        return
    await db.delete(reaction)
    await db.commit()
