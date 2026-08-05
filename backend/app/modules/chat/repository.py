"""Data-access functions for the Chat module."""

from __future__ import annotations

from typing import List, Optional, Sequence
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.chat.models import Channel, ChannelMember, Message, MessageReaction


async def get_channel(db: AsyncSession, channel_id: UUID) -> Optional[Channel]:
    result = await db.execute(select(Channel).where(Channel.id == channel_id))
    return result.scalar_one_or_none()


async def get_channel_by_project(
    db: AsyncSession, project_id: UUID
) -> Optional[Channel]:
    result = await db.execute(
        select(Channel).where(
            Channel.project_id == project_id, Channel.type == "project"
        )
    )
    return result.scalars().first()


async def get_member(
    db: AsyncSession, channel_id: UUID, user_id: UUID
) -> Optional[ChannelMember]:
    result = await db.execute(
        select(ChannelMember).where(
            ChannelMember.channel_id == channel_id,
            ChannelMember.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()


async def list_members(
    db: AsyncSession, channel_id: UUID
) -> Sequence[ChannelMember]:
    result = await db.execute(
        select(ChannelMember).where(ChannelMember.channel_id == channel_id)
    )
    return result.scalars().all()


async def list_channels_for_user(
    db: AsyncSession, user_id: UUID
) -> Sequence[Channel]:
    result = await db.execute(
        select(Channel)
        .join(ChannelMember, ChannelMember.channel_id == Channel.id)
        .options(selectinload(Channel.members))
        .where(ChannelMember.user_id == user_id, Channel.archived_at.is_(None))
        .order_by(Channel.created_at)
    )
    return result.scalars().unique().all()


async def find_dm_channel(
    db: AsyncSession, user_a: UUID, user_b: UUID
) -> Optional[Channel]:
    """DM channel that has exactly these two members."""
    channels = await db.execute(
        select(Channel)
        .join(ChannelMember, ChannelMember.channel_id == Channel.id)
        .options(selectinload(Channel.members))
        .where(Channel.type == "dm", ChannelMember.user_id == user_a)
    )
    for channel in channels.scalars().unique().all():
        member_ids = {m.user_id for m in channel.members}
        if member_ids == {user_a, user_b} or (
            user_a == user_b and member_ids == {user_a}
        ):
            return channel
    return None


async def get_message(db: AsyncSession, message_id: UUID) -> Optional[Message]:
    result = await db.execute(
        select(Message)
        .options(selectinload(Message.reactions))
        .where(Message.id == message_id)
    )
    return result.scalar_one_or_none()


async def list_messages(
    db: AsyncSession,
    channel_id: UUID,
    *,
    before: Optional[Message] = None,
    thread_of: Optional[UUID] = None,
    limit: int = 50,
) -> Sequence[Message]:
    """Newest-first cursor pagination. Top-level view excludes thread replies."""
    stmt = (
        select(Message)
        .options(selectinload(Message.reactions))
        .where(Message.channel_id == channel_id)
    )
    if thread_of is not None:
        stmt = stmt.where(Message.parent_message_id == thread_of)
    else:
        stmt = stmt.where(Message.parent_message_id.is_(None))
    if before is not None:
        stmt = stmt.where(Message.created_at < before.created_at)
    stmt = stmt.order_by(Message.created_at.desc()).limit(limit)
    result = await db.execute(stmt)
    return result.scalars().unique().all()


async def reply_counts(
    db: AsyncSession, message_ids: List[UUID]
) -> dict[UUID, int]:
    if not message_ids:
        return {}
    result = await db.execute(
        select(Message.parent_message_id, func.count(Message.id))
        .where(Message.parent_message_id.in_(message_ids))
        .group_by(Message.parent_message_id)
    )
    return {row[0]: row[1] for row in result.all()}


async def unread_count(
    db: AsyncSession, channel_id: UUID, user_id: UUID
) -> int:
    member = await get_member(db, channel_id, user_id)
    if member is None:
        return 0
    stmt = (
        select(func.count(Message.id))
        .where(
            Message.channel_id == channel_id,
            Message.sender_user_id != user_id,
            Message.deleted_at.is_(None),
        )
    )
    if member.last_read_message_id is not None:
        last_read = await db.get(Message, member.last_read_message_id)
        if last_read is not None:
            stmt = stmt.where(Message.created_at > last_read.created_at)
    result = await db.execute(stmt)
    return result.scalar_one()


async def last_message(
    db: AsyncSession, channel_id: UUID
) -> Optional[Message]:
    result = await db.execute(
        select(Message)
        .where(Message.channel_id == channel_id, Message.deleted_at.is_(None))
        .order_by(Message.created_at.desc())
        .limit(1)
    )
    return result.scalars().first()


async def get_reaction(
    db: AsyncSession, message_id: UUID, user_id: UUID, emoji: str
) -> Optional[MessageReaction]:
    result = await db.execute(
        select(MessageReaction).where(
            MessageReaction.message_id == message_id,
            MessageReaction.user_id == user_id,
            MessageReaction.emoji == emoji,
        )
    )
    return result.scalar_one_or_none()
