"""Data-access functions for the Collaboration module."""

from __future__ import annotations

from typing import Optional, Sequence
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.collaboration.models import (
    Comment,
    FileAttachment,
    Notification,
    Reaction,
    UserDevice,
)


async def create_comment(db: AsyncSession, comment: Comment) -> Comment:
    db.add(comment)
    await db.commit()
    await db.refresh(comment)
    return comment


async def get_comment(db: AsyncSession, comment_id: UUID) -> Optional[Comment]:
    result = await db.execute(select(Comment).where(Comment.id == comment_id))
    return result.scalar_one_or_none()


async def list_comments(
    db: AsyncSession, entity_type: str, entity_id: UUID
) -> Sequence[Comment]:
    result = await db.execute(
        select(Comment)
        .where(
            Comment.entity_type == entity_type,
            Comment.entity_id == entity_id,
            Comment.is_deleted.is_(False),
        )
        .order_by(Comment.created_at)
    )
    return result.scalars().all()


async def add_reaction(db: AsyncSession, reaction: Reaction) -> Reaction:
    db.add(reaction)
    await db.commit()
    return reaction


async def create_file_attachment(
    db: AsyncSession, attachment: FileAttachment
) -> FileAttachment:
    db.add(attachment)
    await db.commit()
    await db.refresh(attachment)
    return attachment


async def list_file_attachments(
    db: AsyncSession, entity_type: str, entity_id: UUID
) -> Sequence[FileAttachment]:
    result = await db.execute(
        select(FileAttachment)
        .where(
            FileAttachment.entity_type == entity_type,
            FileAttachment.entity_id == entity_id,
        )
        .order_by(FileAttachment.created_at.desc())
    )
    return result.scalars().all()


async def get_file_attachment(
    db: AsyncSession, attachment_id: UUID
) -> Optional[FileAttachment]:
    result = await db.execute(
        select(FileAttachment).where(FileAttachment.id == attachment_id)
    )
    return result.scalar_one_or_none()


async def create_notification(
    db: AsyncSession, notification: Notification
) -> Notification:
    db.add(notification)
    await db.commit()
    await db.refresh(notification)
    return notification


async def list_notifications(
    db: AsyncSession,
    user_id: UUID,
    unread_only: bool = False,
    action_required_only: bool = False,
    limit: int = 200,
) -> Sequence[Notification]:
    stmt = select(Notification).where(Notification.user_id == user_id)
    if unread_only:
        stmt = stmt.where(Notification.is_read.is_(False))
    if action_required_only:
        stmt = stmt.where(
            Notification.requires_action.is_(True),
            Notification.resolved_at.is_(None),
        )
    result = await db.execute(
        stmt.order_by(Notification.created_at.desc()).limit(limit)
    )
    return result.scalars().all()


async def mark_all_notifications_read(db: AsyncSession, user_id: UUID) -> int:
    result = await db.execute(
        select(Notification).where(
            Notification.user_id == user_id, Notification.is_read.is_(False)
        )
    )
    rows = result.scalars().all()
    for n in rows:
        n.is_read = True
    await db.commit()
    return len(rows)


async def get_notification(
    db: AsyncSession, notification_id: UUID
) -> Optional[Notification]:
    result = await db.execute(
        select(Notification).where(Notification.id == notification_id)
    )
    return result.scalar_one_or_none()


async def count_unread_notifications(db: AsyncSession, user_id: UUID) -> int:
    result = await db.execute(
        select(Notification).where(
            Notification.user_id == user_id, Notification.is_read.is_(False)
        )
    )
    return len(result.scalars().all())


async def get_device_by_token(
    db: AsyncSession, device_token: str
) -> Optional[UserDevice]:
    result = await db.execute(
        select(UserDevice).where(UserDevice.device_token == device_token)
    )
    return result.scalar_one_or_none()


async def save_device(
    db: AsyncSession, device: UserDevice
) -> UserDevice:
    db.add(device)
    await db.commit()
    await db.refresh(device)
    return device


async def list_user_devices(
    db: AsyncSession, user_id: UUID
) -> Sequence[UserDevice]:
    result = await db.execute(
        select(UserDevice).where(
            UserDevice.user_id == user_id, UserDevice.is_active.is_(True)
        )
    )
    return result.scalars().all()


async def unregister_device(
    db: AsyncSession, device_token: str, user_id: UUID
) -> bool:
    device = await get_device_by_token(db, device_token)
    if device and device.user_id == user_id:
        device.is_active = False
        await db.commit()
        return True
    return False
