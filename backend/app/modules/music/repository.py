"""Data-access functions for the Music module."""

from __future__ import annotations

from typing import Dict, List, Optional
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.music.models import (
    DriveConnection,
    MusicChannel,
    MusicChannelMember,
    MusicPlaybackState,
)


# ---------- channels ----------


async def get_channel(
    db: AsyncSession, channel_id: UUID
) -> Optional[MusicChannel]:
    result = await db.execute(
        select(MusicChannel).where(MusicChannel.id == channel_id)
    )
    return result.scalar_one_or_none()


async def list_channels(db: AsyncSession) -> List[MusicChannel]:
    result = await db.execute(
        select(MusicChannel)
        .where(MusicChannel.archived_at.is_(None))
        .order_by(MusicChannel.created_at)
    )
    return list(result.scalars().all())


async def member_counts(db: AsyncSession) -> Dict[UUID, int]:
    result = await db.execute(
        select(
            MusicChannelMember.channel_id,
            func.count(MusicChannelMember.user_id),
        ).group_by(MusicChannelMember.channel_id)
    )
    return {row[0]: row[1] for row in result.all()}


# ---------- members ----------


async def get_member(
    db: AsyncSession, channel_id: UUID, user_id: UUID
) -> Optional[MusicChannelMember]:
    result = await db.execute(
        select(MusicChannelMember).where(
            MusicChannelMember.channel_id == channel_id,
            MusicChannelMember.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()


async def list_members(
    db: AsyncSession, channel_id: UUID
) -> List[MusicChannelMember]:
    result = await db.execute(
        select(MusicChannelMember).where(
            MusicChannelMember.channel_id == channel_id
        )
    )
    return list(result.scalars().all())


async def memberships_for_user(
    db: AsyncSession, user_id: UUID
) -> Dict[UUID, MusicChannelMember]:
    result = await db.execute(
        select(MusicChannelMember).where(MusicChannelMember.user_id == user_id)
    )
    return {m.channel_id: m for m in result.scalars().all()}


# ---------- playback state ----------


async def get_state(
    db: AsyncSession, channel_id: UUID
) -> Optional[MusicPlaybackState]:
    result = await db.execute(
        select(MusicPlaybackState).where(
            MusicPlaybackState.channel_id == channel_id
        )
    )
    return result.scalar_one_or_none()


async def get_state_for_update(
    db: AsyncSession, channel_id: UUID
) -> Optional[MusicPlaybackState]:
    """Same row, but `SELECT ... FOR UPDATE`. Two playback commands on the same
    channel serialize on this lock so one never clobbers the other's version
    bump (read-modify-write on the single state row)."""
    result = await db.execute(
        select(MusicPlaybackState)
        .where(MusicPlaybackState.channel_id == channel_id)
        .with_for_update()
    )
    return result.scalar_one_or_none()


async def states_by_channel(
    db: AsyncSession,
) -> Dict[UUID, MusicPlaybackState]:
    result = await db.execute(select(MusicPlaybackState))
    return {s.channel_id: s for s in result.scalars().all()}


# ---------- Drive connections ----------


async def get_connection(
    db: AsyncSession, user_id: UUID
) -> Optional[DriveConnection]:
    result = await db.execute(
        select(DriveConnection).where(DriveConnection.user_id == user_id)
    )
    return result.scalar_one_or_none()
