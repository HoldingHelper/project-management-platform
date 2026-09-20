"""Integrations module ORM models -- schema `integrations`.

Stores GitHub organization repository/PR linkages and user WhatsApp notification profiles.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.shared.base_model import TimestampMixin, UUIDPKMixin, utcnow

SCHEMA = "integrations"


class GitHubRepositoryLink(Base, UUIDPKMixin, TimestampMixin):
    """Configuration mapping a GitHub repository to default Platform projects/phases."""

    __tablename__ = "github_repos"
    __table_args__ = (
        Index("ix_github_repos_owner_repo", "repo_owner", "repo_name", unique=True),
        {"schema": SCHEMA},
    )

    repo_owner: Mapped[str] = mapped_column(String(100), nullable=False)
    repo_name: Mapped[str] = mapped_column(String(100), nullable=False)
    default_project_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    default_phase_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    auto_create_tasks: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    auto_close_tasks_on_merge: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )


class GitHubPullRequestLink(Base, UUIDPKMixin, TimestampMixin):
    """Linkage between an active or merged GitHub PR and a Platform task."""

    __tablename__ = "github_pull_requests"
    __table_args__ = (
        Index("ix_github_prs_repo_number", "repo_owner", "repo_name", "pr_number", unique=True),
        Index("ix_github_prs_task_id", "task_id"),
        {"schema": SCHEMA},
    )

    repo_owner: Mapped[str] = mapped_column(String(100), nullable=False)
    repo_name: Mapped[str] = mapped_column(String(100), nullable=False)
    pr_number: Mapped[int] = mapped_column(Integer, nullable=False)
    pr_title: Mapped[str] = mapped_column(String(500), nullable=False)
    pr_url: Mapped[str] = mapped_column(String(1000), nullable=False)
    pr_author: Mapped[str] = mapped_column(String(100), nullable=False)
    pr_status: Mapped[str] = mapped_column(
        String(32), default="open", nullable=False
    )  # open, closed, merged, review_requested
    task_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    merged_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class WhatsAppUserSettings(Base):
    """User profile WhatsApp notification preferences and verified mobile numbers."""

    __tablename__ = "whatsapp_users"
    __table_args__ = ({"schema": SCHEMA},)

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True
    )
    phone_number: Mapped[str] = mapped_column(
        String(32), nullable=False, index=True
    )  # E.164 format: e.g. +14155552671
    notify_meetings: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    notify_mentions: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    notify_blockers: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    notify_dms: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    is_verified: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )


class UserGitHubConnection(Base):
    """User personal GitHub OAuth connection for private repo access & issue/PR mentions."""

    __tablename__ = "user_github_connections"
    __table_args__ = ({"schema": SCHEMA},)

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True
    )
    github_username: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    github_user_id: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    avatar_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    encrypted_access_token: Mapped[str] = mapped_column(Text, nullable=False)
    scopes: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    connected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )


class UserTelegramConnection(Base):
    """User personal Telegram bot connection for push notifications and interactive bot queries."""

    __tablename__ = "user_telegram_connections"
    __table_args__ = ({"schema": SCHEMA},)

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True
    )
    telegram_chat_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    telegram_username: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    auth_link_code: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    auth_link_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    is_connected: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    notify_mentions: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    notify_tasks: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    notify_blockers: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    connected_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class UserDriveConnection(Base):
    """User personal Google Drive OAuth connection for document attachments."""

    __tablename__ = "user_drive_connections"
    __table_args__ = ({"schema": SCHEMA},)

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True
    )
    google_email: Mapped[Optional[str]] = mapped_column(String(320), nullable=True)
    encrypted_refresh_token: Mapped[str] = mapped_column(Text, nullable=False)
    is_connected: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    connected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
