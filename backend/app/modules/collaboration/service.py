"""Collaboration module business logic: comments, reactions, file
attachments and notifications."""

from __future__ import annotations

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
)
from app.modules.collaboration.schemas import (
    CommentCreate,
    CommentRead,
    FileAttachmentRead,
    NotificationRead,
    ReactionCreate,
)
from app.shared.events import CommentAdded, NotificationRequested


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
    comment = Comment(
        entity_type=payload.entity_type,
        entity_id=payload.entity_id,
        author_user_id=current_user.user_id,
        parent_comment_id=payload.parent_comment_id,
        body=payload.body,
        mentioned_user_ids=payload.mentioned_user_ids,
    )
    comment = await repo.create_comment(db, comment)

    await event_bus.publish(
        CommentAdded(
            entity_type=payload.entity_type,
            entity_id=payload.entity_id,
            author_user_id=current_user.user_id,
            mentioned_user_ids=payload.mentioned_user_ids,
        )
    )
    for mentioned_user_id in payload.mentioned_user_ids:
        await event_bus.publish(
            NotificationRequested(
                user_id=mentioned_user_id,
                type="mention",
                title="You were mentioned in a comment",
                body=payload.body[:200],
                link=f"/{payload.entity_type.lower()}/{payload.entity_id}",
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
    storage_key = f"{entity_type.lower()}/{entity_id}/{uuid4()}-{file_name}"
    file_storage_service.upload(storage_key, content, content_type)

    attachment = FileAttachment(
        entity_type=entity_type,
        entity_id=entity_id,
        file_name=file_name,
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
    return file_storage_service.presigned_url(attachment.storage_key)


async def create_notification_from_event(
    db: AsyncSession, event: NotificationRequested
) -> Notification:
    notification = Notification(
        user_id=event.user_id,
        type=event.type,
        title=event.title,
        body=event.body,
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
    return [NotificationRead.model_validate(n) for n in notifications]


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
