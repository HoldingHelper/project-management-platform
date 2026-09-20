"""Pydantic schemas for the Collaboration module."""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class CommentCreate(BaseModel):
    entity_type: str = Field(min_length=1, max_length=50)
    entity_id: UUID
    body: str = Field(min_length=1)
    parent_comment_id: Optional[UUID] = None
    mentioned_user_ids: List[UUID] = Field(default_factory=list)


class CommentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    entity_type: str
    entity_id: UUID
    author_user_id: UUID
    parent_comment_id: Optional[UUID] = None
    body: str
    mentioned_user_ids: List[UUID]
    is_deleted: bool
    created_at: datetime
    updated_at: datetime


class ReactionCreate(BaseModel):
    emoji: str = Field(min_length=1, max_length=10)


class FileAttachmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    entity_type: str
    entity_id: UUID
    file_name: str
    content_type: str
    size_bytes: int
    uploaded_by_user_id: UUID
    version: int
    created_at: datetime


class NotificationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    user_id: UUID
    type: str
    title: str
    body: str
    link: Optional[str] = None
    is_read: bool
    entity_type: Optional[str] = None
    entity_id: Optional[UUID] = None
    requires_action: bool = False
    resolved_at: Optional[datetime] = None
    created_at: datetime


class NotificationReplyRequest(BaseModel):
    """Reply directly from the notification center. Routed back to the source
    entity: chat channel -> chat message; task/blocker/etc. -> comment.
    A voice reply is an uploaded audio FileAttachment referenced by id."""

    body: Optional[str] = None
    attachment_id: Optional[UUID] = None


class DeviceRegisterRequest(BaseModel):
    device_token: str = Field(min_length=5, max_length=255)
    platform: str = Field(pattern="^(ios|android)$")
    device_name: Optional[str] = Field(None, max_length=100)
    app_version: Optional[str] = Field(None, max_length=50)


class DeviceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    user_id: UUID
    device_token: str
    platform: str
    device_name: Optional[str] = None
    app_version: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime
