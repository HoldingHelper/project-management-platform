"""Chat module ORM models -- schema `chat`.

Channels are a distinct bounded context from Collaboration's entity-anchored
comments: a project channel is auto-created per Project (membership synced
from ProjectMember), and DM channels connect exactly two users. Attachments
reuse collaboration's FileAttachment by UUID value (`entity_type` =
'chat_message'), never via a cross-schema foreign key.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import List, Optional

from sqlalchemy import (
    ARRAY,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.shared.base_model import TimestampMixin, UUIDPKMixin

SCHEMA = "chat"

CHANNEL_TYPE_VALUES = ["project", "dm"]
MESSAGE_TYPE_VALUES = ["text", "voice", "file"]


class Channel(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "channels"
    __table_args__ = (
        CheckConstraint(
            f"type IN ({', '.join(repr(v) for v in CHANNEL_TYPE_VALUES)})",
            name="ck_channel_type",
        ),
        {"schema": SCHEMA},
    )

    type: Mapped[str] = mapped_column(String(16), nullable=False)
    # Set for type='project'; references projects.projects.id by UUID value.
    project_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    created_by_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    archived_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    members: Mapped[List["ChannelMember"]] = relationship(
        back_populates="channel", cascade="all, delete-orphan"
    )
    messages: Mapped[List["Message"]] = relationship(
        back_populates="channel", cascade="all, delete-orphan"
    )


class ChannelMember(Base, TimestampMixin):
    __tablename__ = "channel_members"
    __table_args__ = {"schema": SCHEMA}

    channel_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.channels.id", ondelete="CASCADE"),
        primary_key=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, index=True
    )
    # Read-status cursor: everything at or before this message counts as read.
    last_read_message_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    muted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    channel: Mapped["Channel"] = relationship(back_populates="members")


class Message(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "messages"
    __table_args__ = (
        CheckConstraint(
            f"message_type IN ({', '.join(repr(v) for v in MESSAGE_TYPE_VALUES)})",
            name="ck_message_type",
        ),
        {"schema": SCHEMA},
    )

    channel_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.channels.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sender_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False
    )
    parent_message_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.messages.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    body: Mapped[str] = mapped_column(Text, default="", nullable=False)
    message_type: Mapped[str] = mapped_column(
        String(16), default="text", nullable=False
    )
    # collaboration.file_attachments.id by UUID value (voice/file messages).
    attachment_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    mentioned_user_ids: Mapped[List[uuid.UUID]] = mapped_column(
        ARRAY(UUID(as_uuid=True)), default=list, nullable=False
    )
    edited_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    channel: Mapped["Channel"] = relationship(back_populates="messages")
    replies: Mapped[List["Message"]] = relationship(
        back_populates="parent_message", cascade="all, delete-orphan"
    )
    parent_message: Mapped[Optional["Message"]] = relationship(
        remote_side="Message.id", back_populates="replies"
    )
    reactions: Mapped[List["MessageReaction"]] = relationship(
        back_populates="message", cascade="all, delete-orphan"
    )


class MessageReaction(Base, UUIDPKMixin):
    __tablename__ = "message_reactions"
    __table_args__ = (
        UniqueConstraint(
            "message_id", "user_id", "emoji", name="uq_message_reaction"
        ),
        {"schema": SCHEMA},
    )

    message_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.messages.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    emoji: Mapped[str] = mapped_column(String(10), nullable=False)

    message: Mapped["Message"] = relationship(back_populates="reactions")
