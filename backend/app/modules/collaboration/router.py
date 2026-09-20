"""Collaboration module REST endpoints."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, File, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.current_user import CurrentUser
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.permissions import Permissions
from app.modules.collaboration import service
from app.modules.collaboration.schemas import (
    CommentCreate,
    CommentRead,
    DeviceRead,
    DeviceRegisterRequest,
    FileAttachmentRead,
    NotificationRead,
    NotificationReplyRequest,
    ReactionCreate,
)

# Entity types whose uploads are audio recordings (voice messages); they get
# content-type + size validation.
_VOICE_ENTITY_TYPES = {"chat_message", "notification_reply"}
_VOICE_MAX_BYTES = 5 * 1024 * 1024

comments_router = APIRouter(prefix="/comments", tags=["Collaboration - Comments"])
files_router = APIRouter(prefix="/files", tags=["Collaboration - Files"])
notifications_router = APIRouter(
    prefix="/notifications", tags=["Collaboration - Notifications"]
)
devices_router = APIRouter(
    prefix="/devices", tags=["Collaboration - Mobile Devices"]
)


@comments_router.post(
    "", response_model=CommentRead, status_code=status.HTTP_201_CREATED
)
async def create_comment(
    payload: CommentCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CommentRead:
    return await service.create_comment(db, current_user, payload)


@comments_router.get("", response_model=list[CommentRead])
async def list_comments(
    entity_type: str = Query(...),
    entity_id: UUID = Query(...),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[CommentRead]:
    return await service.list_comments(db, current_user, entity_type, entity_id)


@comments_router.post(
    "/{comment_id}/reactions",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def add_reaction(
    comment_id: UUID,
    payload: ReactionCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await service.add_reaction(db, comment_id, current_user, payload)


@files_router.post(
    "", response_model=FileAttachmentRead, status_code=status.HTTP_201_CREATED
)
async def upload_file(
    entity_type: str = Query(...),
    entity_id: UUID = Query(...),
    file: UploadFile = File(...),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> FileAttachmentRead:
    content = await file.read()
    import io

    if entity_type in _VOICE_ENTITY_TYPES:
        from app.core.exceptions import ValidationAppError

        content_type = file.content_type or ""
        if not content_type.startswith("audio/"):
            raise ValidationAppError("Voice messages must be audio files.")
        if len(content) > _VOICE_MAX_BYTES:
            raise ValidationAppError("Voice messages are limited to 5 MB.")

    return await service.upload_file(
        db,
        entity_type=entity_type,
        entity_id=entity_id,
        file_name=file.filename or "unnamed",
        content_type=file.content_type or "application/octet-stream",
        content=io.BytesIO(content),
        size_bytes=len(content),
        current_user=current_user,
    )


@files_router.get("", response_model=list[FileAttachmentRead])
async def list_files(
    entity_type: str = Query(...),
    entity_id: UUID = Query(...),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[FileAttachmentRead]:
    return await service.list_files(db, current_user, entity_type, entity_id)


@files_router.get("/{attachment_id}/download-url")
async def get_download_url(
    attachment_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    url = await service.get_file_download_url(db, current_user, attachment_id)
    return {"url": url}


@notifications_router.get("", response_model=list[NotificationRead])
async def list_notifications(
    unread_only: bool = Query(default=False),
    filter: str = Query(default="all", pattern="^(all|unread|action_required)$"),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[NotificationRead]:
    return await service.list_notifications(
        db,
        current_user.user_id,
        unread_only=unread_only or filter == "unread",
        action_required_only=filter == "action_required",
    )


@notifications_router.put("/read-all", response_model=dict)
async def mark_all_read(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    count = await service.mark_all_notifications_read(db, current_user.user_id)
    return {"marked_read": count}


@notifications_router.post(
    "/{notification_id}/reply", response_model=NotificationRead
)
async def reply_to_notification(
    notification_id: UUID,
    payload: NotificationReplyRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> NotificationRead:
    return await service.reply_to_notification(
        db,
        notification_id,
        current_user,
        body=payload.body,
        attachment_id=payload.attachment_id,
    )


@notifications_router.post(
    "/{notification_id}/resolve", response_model=NotificationRead
)
async def resolve_notification(
    notification_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> NotificationRead:
    return await service.resolve_notification(
        db, notification_id, current_user.user_id
    )


@notifications_router.put("/{notification_id}/read", response_model=NotificationRead)
async def mark_notification_read(
    notification_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> NotificationRead:
    return await service.mark_notification_read(
        db, notification_id, current_user.user_id
    )


@devices_router.post(
    "/register", response_model=DeviceRead, status_code=status.HTTP_201_CREATED
)
async def register_device(
    payload: DeviceRegisterRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DeviceRead:
    return await service.register_device(db, current_user.user_id, payload)


@devices_router.delete(
    "/{device_token}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def unregister_device(
    device_token: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await service.unregister_device(db, current_user.user_id, device_token)


@devices_router.get("", response_model=list[DeviceRead])
async def list_devices(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[DeviceRead]:
    return await service.list_user_devices(db, current_user.user_id)
