"""Pydantic schemas for the Chat module."""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ChannelRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    type: str
    project_id: Optional[UUID] = None
    name: str
    archived_at: Optional[datetime] = None
    created_at: datetime


class ChannelListItem(BaseModel):
    """Channel + per-viewer context for the sidebar list."""

    channel: ChannelRead
    unread_count: int
    last_message_preview: Optional[str] = None
    last_message_at: Optional[datetime] = None
    # For DMs: the other participant.
    dm_user_id: Optional[UUID] = None


class CreateDmRequest(BaseModel):
    user_id: UUID


class SendMessageRequest(BaseModel):
    body: str = Field(default="", max_length=8000)
    message_type: str = Field(default="text", pattern="^(text|voice|file)$")
    attachment_id: Optional[UUID] = None
    parent_message_id: Optional[UUID] = None
    mentioned_user_ids: List[UUID] = Field(default_factory=list)


class ReactionRequest(BaseModel):
    emoji: str = Field(min_length=1, max_length=10)


class MessageReactionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: UUID
    emoji: str


class MessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    channel_id: UUID
    sender_user_id: UUID
    parent_message_id: Optional[UUID] = None
    body: str
    message_type: str
    attachment_id: Optional[UUID] = None
    mentioned_user_ids: List[UUID] = Field(default_factory=list)
    edited_at: Optional[datetime] = None
    deleted_at: Optional[datetime] = None
    created_at: datetime
    reactions: List[MessageReactionRead] = Field(default_factory=list)
    reply_count: int = 0


class MarkReadRequest(BaseModel):
    message_id: UUID


class ChannelMemberRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: UUID
    last_read_message_id: Optional[UUID] = None
    muted: bool
