"""Collaboration module ORM models -- schema `collaboration`.

Generic, entity-agnostic comments/reactions/files/notifications that attach
to any other module's aggregate via a polymorphic (`entity_type`, `entity_id`)
pair rather than a real foreign key, so Collaboration never needs to import
Projects/Blockers models directly.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import List, Optional

from sqlalchemy import ARRAY, Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.shared.base_model import AuditableMixin, TimestampMixin, UUIDPKMixin

SCHEMA = "collaboration"


class Comment(Base, UUIDPKMixin, TimestampMixin, AuditableMixin):
    __tablename__ = "comments"
    __table_args__ = {"schema": SCHEMA}

    entity_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    entity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    author_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False
    )
    parent_comment_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.comments.id", ondelete="CASCADE"),
        nullable=True,
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    mentioned_user_ids: Mapped[List[uuid.UUID]] = mapped_column(
        ARRAY(UUID(as_uuid=True)), default=list, nullable=False
    )
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    replies: Mapped[List["Comment"]] = relationship(cascade="all, delete-orphan")
    reactions: Mapped[List["Reaction"]] = relationship(
        back_populates="comment", cascade="all, delete-orphan"
    )


class Reaction(Base, UUIDPKMixin):
    __tablename__ = "reactions"
    __table_args__ = {"schema": SCHEMA}

    comment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.comments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    emoji: Mapped[str] = mapped_column(String(10), nullable=False)

    comment: Mapped["Comment"] = relationship(back_populates="reactions")


class FileAttachment(Base, UUIDPKMixin, TimestampMixin, AuditableMixin):
    __tablename__ = "file_attachments"
    __table_args__ = {"schema": SCHEMA}

    entity_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    entity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    file_name: Mapped[str] = mapped_column(String(300), nullable=False)
    content_type: Mapped[str] = mapped_column(String(150), nullable=False)
    size_bytes: Mapped[int] = mapped_column(nullable=False)
    storage_key: Mapped[str] = mapped_column(String(500), nullable=False)
    uploaded_by_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False
    )
    version: Mapped[int] = mapped_column(default=1, nullable=False)


class Notification(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "notifications"
    __table_args__ = {"schema": SCHEMA}

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    link: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Source entity the notification points back at (reply routing).
    entity_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    entity_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    # Actionable items ("waiting on you") surface in the notification center's
    # action-required section until resolved.
    requires_action: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    resolved_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class UserDevice(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "user_devices"
    __table_args__ = {"schema": SCHEMA}

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    device_token: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    platform: Mapped[str] = mapped_column(String(20), nullable=False)  # "ios" | "android"
    device_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    app_version: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
