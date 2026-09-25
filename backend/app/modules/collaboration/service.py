"""Collaboration module business logic: comments, reactions, file
attachments and notifications."""

from __future__ import annotations

import re
from typing import BinaryIO, List
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.current_user import CurrentUser
from app.core.events import event_bus
from app.core.exceptions import NotFoundError, ValidationAppError
from app.core.storage import file_storage_service
from app.modules.collaboration import repository as repo
from app.modules.collaboration.authorization import authorize_entity_access
from app.modules.collaboration.models import (
    Comment,
    FileAttachment,
    Notification,
    Reaction,
    UserDevice,
)
from app.modules.collaboration.schemas import (
    CommentCreate,
    CommentRead,
    DeviceRead,
    DeviceRegisterRequest,
    FileAttachmentRead,
    NotificationRead,
    ReactionCreate,
)
from app.shared.events import CommentAdded, NotificationRequested

_MENTION_RE = re.compile(r"@([A-Za-z0-9_.-]+)")


async def _resolve_mentions(db: AsyncSession, body: str) -> List[UUID]:
    """Resolve @username tokens in comment body to user IDs."""
    handles = set(_MENTION_RE.findall(body or ""))
    if not handles:
        return []
    from app.modules.identity import repository as identity_repo

    ids: List[UUID] = []
    for handle in handles:
        cleaned = handle.lower().strip()
        user = await identity_repo.get_user_by_username(db, cleaned)
        if user is None:
            user = await identity_repo.get_user_by_email(db, cleaned)
        if user is not None and user.id not in ids:
            ids.append(user.id)
    return ids


async def create_comment(
    db: AsyncSession,
    current_user: CurrentUser,
    payload: CommentCreate,
) -> CommentRead:
    await authorize_entity_access(
        db, current_user, payload.entity_type, payload.entity_id
    )
    if payload.parent_comment_id is not None:
        parent = await repo.get_comment(db, payload.parent_comment_id)
        if parent is None:
            raise NotFoundError("Comment", payload.parent_comment_id)
        if (
            parent.entity_type != payload.entity_type
            or parent.entity_id != payload.entity_id
        ):
            raise ValidationAppError(
                "Parent comment must belong to the same entity."
            )

    resolved_ids = await _resolve_mentions(db, payload.body)
    all_mentioned_ids = list(
        set(payload.mentioned_user_ids or []) | set(resolved_ids)
    )

    comment = Comment(
        entity_type=payload.entity_type,
        entity_id=payload.entity_id,
        author_user_id=current_user.user_id,
        parent_comment_id=payload.parent_comment_id,
        body=payload.body,
        mentioned_user_ids=all_mentioned_ids,
    )
    comment = await repo.create_comment(db, comment)

    # Persistence is authoritative. Realtime fan-out and notification delivery
    # must never keep the HTTP request open when Redis/WebSocket infrastructure
    # is unavailable or slow.
    event_bus.publish_sync_fire_and_forget(
        CommentAdded(
            entity_type=payload.entity_type,
            entity_id=payload.entity_id,
            author_user_id=current_user.user_id,
            mentioned_user_ids=all_mentioned_ids,
        )
    )

    entity_type_lower = payload.entity_type.lower()
    if entity_type_lower == "task":
        link = f"/tasks/{payload.entity_id}"
    elif entity_type_lower == "project":
        link = f"/projects/{payload.entity_id}"
    else:
        link = f"/{entity_type_lower}s/{payload.entity_id}"

    sender_name = current_user.full_name or "A team member"

    for mentioned_user_id in all_mentioned_ids:
        if mentioned_user_id == current_user.user_id:
            continue
        event_bus.publish_sync_fire_and_forget(
            NotificationRequested(
                user_id=mentioned_user_id,
                type="mention",
                title=f"{sender_name} mentioned you in a comment",
                body=payload.body[:200],
                link=link,
                entity_type=payload.entity_type,
                entity_id=payload.entity_id,
            )
        )
    return CommentRead.model_validate(comment)


async def list_comments(
    db: AsyncSession,
    current_user: CurrentUser,
    entity_type: str,
    entity_id: UUID,
) -> List[CommentRead]:
    await authorize_entity_access(db, current_user, entity_type, entity_id)
    comments = await repo.list_comments(db, entity_type, entity_id)
    return [CommentRead.model_validate(c) for c in comments]


async def add_reaction(
    db: AsyncSession,
    comment_id: UUID,
    current_user: CurrentUser,
    payload: ReactionCreate,
) -> None:
    comment = await repo.get_comment(db, comment_id)
    if comment is None:
        raise NotFoundError("Comment", comment_id)
    await authorize_entity_access(
        db, current_user, comment.entity_type, comment.entity_id
    )
    await repo.add_reaction(
        db,
        Reaction(
            comment_id=comment_id,
            user_id=current_user.user_id,
            emoji=payload.emoji,
        ),
    )


async def upload_file(
    db: AsyncSession,
    *,
    entity_type: str,
    entity_id: UUID,
    file_name: str,
    content_type: str,
    content: BinaryIO,
    size_bytes: int,
    current_user: CurrentUser,
) -> FileAttachmentRead:
    await authorize_entity_access(db, current_user, entity_type, entity_id)

    # Bound uploads (H-6): 25 MB max limit
    MAX_UPLOAD_SIZE = 25 * 1024 * 1024
    if size_bytes > MAX_UPLOAD_SIZE:
        raise ValidationAppError("File exceeds maximum allowed size (25MB)")

    # Sanitize filename (H-6)
    import os
    clean_name = re.sub(r"[^\w.\-_]", "_", os.path.basename(file_name))[:128] or "attachment"
    storage_key = f"{entity_type.lower()}/{entity_id}/{uuid4()}-{clean_name}"

    await file_storage_service.upload_async(storage_key, content, content_type)

    attachment = FileAttachment(
        entity_type=entity_type,
        entity_id=entity_id,
        file_name=clean_name,
        content_type=content_type,
        size_bytes=size_bytes,
        storage_key=storage_key,
        uploaded_by_user_id=current_user.user_id,
    )
    attachment = await repo.create_file_attachment(db, attachment)
    return FileAttachmentRead.model_validate(attachment)


async def list_files(
    db: AsyncSession,
    current_user: CurrentUser,
    entity_type: str,
    entity_id: UUID,
) -> List[FileAttachmentRead]:
    await authorize_entity_access(db, current_user, entity_type, entity_id)
    files = await repo.list_file_attachments(db, entity_type, entity_id)
    return [FileAttachmentRead.model_validate(f) for f in files]


async def get_file_download_url(
    db: AsyncSession, current_user: CurrentUser, attachment_id: UUID
) -> str:
    attachment = await repo.get_file_attachment(db, attachment_id)
    if attachment is None:
        raise NotFoundError("FileAttachment", attachment_id)
    await authorize_entity_access(
        db, current_user, attachment.entity_type, attachment.entity_id
    )
    return file_storage_service.presigned_url(
        attachment.storage_key, filename=attachment.file_name
    )



UUID_PATTERN = re.compile(
    r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
    re.IGNORECASE,
)


def humanize_notification_body(body: str | None) -> str:
    if not body:
        return ""
    # Strip raw UUIDs if present in the text
    cleaned = UUID_PATTERN.sub("", body)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    cleaned = re.sub(r"Task\s+was assigned to you", "You have been assigned to this task", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"Task\s+is blocked", "This task is blocked", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"Task\s+now depends on task", "Your task now depends on a predecessor task", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s+\.", ".", cleaned)
    return cleaned or body


async def create_notification_from_event(
    db: AsyncSession, event: NotificationRequested
) -> Notification:
    notification = Notification(
        user_id=event.user_id,
        type=event.type,
        title=event.title,
        body=humanize_notification_body(event.body),
        link=event.link,
        entity_type=event.entity_type,
        entity_id=event.entity_id,
        requires_action=event.requires_action,
    )
    return await repo.create_notification(db, notification)


async def list_notifications(
    db: AsyncSession,
    user_id: UUID,
    unread_only: bool = False,
    action_required_only: bool = False,
) -> List[NotificationRead]:
    notifications = await repo.list_notifications(
        db, user_id, unread_only, action_required_only
    )
    result = []
    for n in notifications:
        item = NotificationRead.model_validate(n)
        item.body = humanize_notification_body(item.body)
        result.append(item)
    return result


async def _get_own_notification(
    db: AsyncSession, notification_id: UUID, user_id: UUID
) -> Notification:
    notification = await repo.get_notification(db, notification_id)
    if notification is None or notification.user_id != user_id:
        raise NotFoundError("Notification", notification_id)
    return notification


async def mark_notification_read(
    db: AsyncSession, notification_id: UUID, user_id: UUID
) -> NotificationRead:
    notification = await _get_own_notification(db, notification_id, user_id)
    notification.is_read = True
    await db.commit()
    await db.refresh(notification)
    return NotificationRead.model_validate(notification)


async def mark_all_notifications_read(db: AsyncSession, user_id: UUID) -> int:
    return await repo.mark_all_notifications_read(db, user_id)


async def resolve_notification(
    db: AsyncSession, notification_id: UUID, user_id: UUID
) -> NotificationRead:
    from app.shared.base_model import utcnow

    notification = await _get_own_notification(db, notification_id, user_id)
    notification.resolved_at = utcnow()
    notification.is_read = True
    await db.commit()
    await db.refresh(notification)
    return NotificationRead.model_validate(notification)


async def reply_to_notification(
    db: AsyncSession,
    notification_id: UUID,
    current_user: CurrentUser,
    *,
    body: str | None,
    attachment_id: UUID | None,
) -> NotificationRead:
    """Route a reply (text and/or voice attachment) back to the notification's
    source entity: chat channel -> chat message, anything else -> comment."""
    notification = await _get_own_notification(
        db, notification_id, current_user.user_id
    )
    if not body and attachment_id is None:
        raise ValidationAppError("Reply needs text or a voice attachment.")
    if notification.entity_type is None or notification.entity_id is None:
        raise ValidationAppError("This notification cannot be replied to.")

    if notification.entity_type == "channel":
        if attachment_id is not None:
            attachment = await repo.get_file_attachment(db, attachment_id)
            if attachment is not None:
                attachment.entity_type = "chat_message"
                attachment.entity_id = notification.entity_id
                await db.flush()

        from app.modules.chat.schemas import SendMessageRequest
        from app.modules.chat.service import send_message

        await send_message(
            db,
            notification.entity_id,
            current_user.user_id,
            SendMessageRequest(
                body=body or "",
                message_type="voice" if attachment_id and not body else "text",
                attachment_id=attachment_id,
            ),
        )
    else:
        comment = await create_comment(
            db,
            current_user,
            CommentCreate(
                entity_type=notification.entity_type,
                entity_id=notification.entity_id,
                body=body or "🎤 Voice message",
            ),
        )
        if attachment_id is not None:
            attachment = await repo.get_file_attachment(db, attachment_id)
            if attachment is not None:
                attachment.entity_type = "comment"
                attachment.entity_id = comment.id
                await db.commit()

    notification.is_read = True
    await db.commit()
    await db.refresh(notification)
    return NotificationRead.model_validate(notification)


async def count_unread_notifications(db: AsyncSession, user_id: UUID) -> int:
    return await repo.count_unread_notifications(db, user_id)


async def register_device(
    db: AsyncSession, user_id: UUID, payload: DeviceRegisterRequest
) -> DeviceRead:
    existing = await repo.get_device_by_token(db, payload.device_token)
    if existing:
        existing.user_id = user_id
        existing.platform = payload.platform
        existing.device_name = payload.device_name
        existing.app_version = payload.app_version
        existing.is_active = True
        await db.commit()
        await db.refresh(existing)
        return DeviceRead.model_validate(existing)

    device = UserDevice(
        user_id=user_id,
        device_token=payload.device_token,
        platform=payload.platform,
        device_name=payload.device_name,
        app_version=payload.app_version,
        is_active=True,
    )
    saved = await repo.save_device(db, device)
    return DeviceRead.model_validate(saved)


async def unregister_device(
    db: AsyncSession, user_id: UUID, device_token: str
) -> bool:
    return await repo.unregister_device(db, device_token, user_id)


async def list_user_devices(
    db: AsyncSession, user_id: UUID
) -> List[DeviceRead]:
    devices = await repo.list_user_devices(db, user_id)
    return [DeviceRead.model_validate(d) for d in devices]
