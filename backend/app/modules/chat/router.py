"""Chat module REST endpoints."""

from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.current_user import CurrentUser
from app.core.database import get_db
from app.core.deps import require_permission
from app.core.permissions import Permissions
from app.modules.chat import service
from app.modules.chat.schemas import (
    ChannelListItem,
    ChannelMemberRead,
    ChannelRead,
    CreateDmRequest,
    MarkReadRequest,
    MessageRead,
    ReactionRequest,
    SendMessageRequest,
)

chat_router = APIRouter(prefix="/chat", tags=["Chat"])

_chat_access = require_permission(Permissions.CHAT_ACCESS)


@chat_router.get("/channels", response_model=list[ChannelListItem])
async def list_channels(
    current_user: CurrentUser = Depends(_chat_access),
    db: AsyncSession = Depends(get_db),
) -> list[ChannelListItem]:
    return await service.list_my_channels(db, current_user.user_id)


@chat_router.post(
    "/dms", response_model=ChannelRead, status_code=status.HTTP_201_CREATED
)
async def create_dm(
    payload: CreateDmRequest,
    current_user: CurrentUser = Depends(_chat_access),
    db: AsyncSession = Depends(get_db),
) -> ChannelRead:
    return await service.get_or_create_dm(db, current_user.user_id, payload.user_id)


@chat_router.get(
    "/channels/{channel_id}/members", response_model=list[ChannelMemberRead]
)
async def list_channel_members(
    channel_id: UUID,
    current_user: CurrentUser = Depends(_chat_access),
    db: AsyncSession = Depends(get_db),
) -> list[ChannelMemberRead]:
    return await service.list_channel_members(db, channel_id, current_user.user_id)


@chat_router.get("/channels/{channel_id}/messages", response_model=list[MessageRead])
async def list_messages(
    channel_id: UUID,
    before: Optional[UUID] = Query(default=None),
    thread_of: Optional[UUID] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
    current_user: CurrentUser = Depends(_chat_access),
    db: AsyncSession = Depends(get_db),
) -> list[MessageRead]:
    return await service.list_messages(
        db,
        channel_id,
        current_user.user_id,
        before_message_id=before,
        thread_of=thread_of,
        limit=limit,
    )


@chat_router.post(
    "/channels/{channel_id}/messages",
    response_model=MessageRead,
    status_code=status.HTTP_201_CREATED,
)
async def send_message(
    channel_id: UUID,
    payload: SendMessageRequest,
    current_user: CurrentUser = Depends(_chat_access),
    db: AsyncSession = Depends(get_db),
) -> MessageRead:
    return await service.send_message(db, channel_id, current_user.user_id, payload)


@chat_router.post(
    "/channels/{channel_id}/read",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def mark_read(
    channel_id: UUID,
    payload: MarkReadRequest,
    current_user: CurrentUser = Depends(_chat_access),
    db: AsyncSession = Depends(get_db),
) -> Response:
    await service.mark_read(db, channel_id, current_user.user_id, payload.message_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@chat_router.delete(
    "/messages/{message_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def delete_message(
    message_id: UUID,
    current_user: CurrentUser = Depends(_chat_access),
    db: AsyncSession = Depends(get_db),
) -> Response:
    await service.delete_message(db, message_id, current_user.user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@chat_router.post(
    "/messages/{message_id}/reactions",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def add_reaction(
    message_id: UUID,
    payload: ReactionRequest,
    current_user: CurrentUser = Depends(_chat_access),
    db: AsyncSession = Depends(get_db),
) -> Response:
    await service.add_reaction(db, message_id, current_user.user_id, payload.emoji)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@chat_router.delete(
    "/messages/{message_id}/reactions/{emoji}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def remove_reaction(
    message_id: UUID,
    emoji: str,
    current_user: CurrentUser = Depends(_chat_access),
    db: AsyncSession = Depends(get_db),
) -> Response:
    await service.remove_reaction(db, message_id, current_user.user_id, emoji)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
