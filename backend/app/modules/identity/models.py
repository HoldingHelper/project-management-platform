"""Identity module ORM models -- schema `identity`.

Owns authentication (Users, credentials, tokens) and RBAC (Roles,
Permissions). Organisational/HR data (Department/Team/Employee/Manager) lives
in the `organization` module and references a `User.id` only by UUID value,
never via a cross-schema foreign key or ORM relationship.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import List, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.shared.base_model import AuditableMixin, TimestampMixin, UUIDPKMixin

SCHEMA = "identity"


class User(Base, UUIDPKMixin, TimestampMixin, AuditableMixin):
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("email", name="uq_users_email"),
        UniqueConstraint("username", name="uq_users_username"),
        {"schema": SCHEMA},
    )

    email: Mapped[str] = mapped_column(String(320), nullable=False, index=True)
    username: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    job_title: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    avatar_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    bio: Mapped[Optional[str]] = mapped_column(String(2000), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    location: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    presence_status: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    status_text: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    status_emoji: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    status_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    mfa_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    mfa_secret: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    home_function_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    manager_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    employment_type: Mapped[str] = mapped_column(String(24), default="employee", nullable=False)

    roles: Mapped[List["UserRole"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    refresh_tokens: Mapped[List["RefreshToken"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    mcp_access_tokens: Mapped[List["McpAccessToken"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )

    @property
    def full_name(self) -> str:
        parts = [
            part.strip()
            for part in (self.first_name, self.last_name)
            if part and part.strip() not in {"-", "—"}
        ]
        return " ".join(parts).strip()


class Role(Base, UUIDPKMixin):
    __tablename__ = "roles"
    __table_args__ = (
        UniqueConstraint("name", name="uq_roles_name"),
        {"schema": SCHEMA},
    )

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    permissions: Mapped[List["RolePermission"]] = relationship(
        back_populates="role", cascade="all, delete-orphan"
    )

    @property
    def permission_codes(self) -> List[str]:
        return sorted(
            role_permission.permission.code
            for role_permission in self.permissions
            if role_permission.permission is not None
        )


class Permission(Base, UUIDPKMixin):
    __tablename__ = "permissions"
    __table_args__ = (
        UniqueConstraint("code", name="uq_permissions_code"),
        {"schema": SCHEMA},
    )

    code: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)


class RolePermission(Base):
    __tablename__ = "role_permissions"
    __table_args__ = {"schema": SCHEMA}

    role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.roles.id", ondelete="CASCADE"),
        primary_key=True,
    )
    permission_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.permissions.id", ondelete="CASCADE"),
        primary_key=True,
    )

    role: Mapped["Role"] = relationship(back_populates="permissions")
    permission: Mapped["Permission"] = relationship()


class UserRole(Base):
    __tablename__ = "user_roles"
    __table_args__ = {"schema": SCHEMA}

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.roles.id", ondelete="CASCADE"),
        primary_key=True,
    )

    user: Mapped["User"] = relationship(back_populates="roles")
    role: Mapped["Role"] = relationship()


class RefreshToken(Base, UUIDPKMixin):
    __tablename__ = "refresh_tokens"
    __table_args__ = {"schema": SCHEMA}

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    token_hash: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    created_by_ip: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    replaced_by_token_hash: Mapped[Optional[str]] = mapped_column(
        String(128), nullable=True
    )

    user: Mapped["User"] = relationship(back_populates="refresh_tokens")

    @property
    def is_active(self) -> bool:
        from app.shared.base_model import utcnow

        return self.revoked_at is None and self.expires_at > utcnow()


class McpAccessToken(Base, UUIDPKMixin):
    """Revocable personal token used by remote MCP clients.

    Only a SHA-256 digest is persisted. ``permission_codes`` is an upper bound;
    effective permissions are intersected with the user's live RBAC grants on
    every MCP request.
    """

    __tablename__ = "mcp_access_tokens"
    __table_args__ = (
        UniqueConstraint("token_hash", name="uq_mcp_access_tokens_token_hash"),
        {"schema": SCHEMA},
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    token_prefix: Mapped[str] = mapped_column(String(24), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    permission_codes: Mapped[list[str]] = mapped_column(JSONB, default=list, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_used_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped["User"] = relationship(back_populates="mcp_access_tokens")

    @property
    def is_active(self) -> bool:
        from app.shared.base_model import utcnow

        return self.revoked_at is None and self.expires_at > utcnow()


class Invitation(Base, UUIDPKMixin, TimestampMixin, AuditableMixin):
    """Pending invitation to join the platform. The opaque token is stored
    hashed, mirroring PasswordResetToken."""

    __tablename__ = "invitations"
    __table_args__ = {"schema": SCHEMA}

    email: Mapped[str] = mapped_column(String(320), nullable=False, index=True)
    role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.roles.id", ondelete="CASCADE"),
        nullable=False,
    )
    invited_by_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False
    )
    department_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    team_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    manager_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    token_hash: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    accepted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    revoked_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    @property
    def is_pending(self) -> bool:
        from app.shared.base_model import utcnow

        return (
            self.accepted_at is None
            and self.revoked_at is None
            and self.expires_at > utcnow()
        )


class UserSettings(Base, TimestampMixin):
    """Per-user preferences. One row per user, created lazily on first write."""

    __tablename__ = "user_settings"
    __table_args__ = {"schema": SCHEMA}

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    notification_prefs: Mapped[dict] = mapped_column(
        JSONB, default=dict, nullable=False
    )
    theme: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    github_username: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)


class PasswordResetToken(Base, UUIDPKMixin):
    __tablename__ = "password_reset_tokens"
    __table_args__ = {"schema": SCHEMA}

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    token_hash: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    used_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
