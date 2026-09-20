"""Add user_github_connections, user_telegram_connections, and user_drive_connections tables

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-08-20
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, None] = "b2c3d4e5f6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. User GitHub Connections
    op.create_table(
        "user_github_connections",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("github_username", sa.String(length=100), nullable=False),
        sa.Column("github_user_id", sa.String(length=50), nullable=True),
        sa.Column("avatar_url", sa.String(length=500), nullable=True),
        sa.Column("encrypted_access_token", sa.Text(), nullable=False),
        sa.Column("scopes", sa.String(length=255), nullable=True),
        sa.Column("connected_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        schema="integrations",
    )
    op.create_index(
        op.f("ix_integrations_user_github_connections_github_username"),
        "user_github_connections",
        ["github_username"],
        unique=False,
        schema="integrations",
    )

    # 2. User Telegram Connections
    op.create_table(
        "user_telegram_connections",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("telegram_chat_id", sa.String(length=64), nullable=True),
        sa.Column("telegram_username", sa.String(length=100), nullable=True),
        sa.Column("auth_link_code", sa.String(length=64), nullable=False),
        sa.Column("auth_link_expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_connected", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("notify_mentions", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("notify_tasks", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("notify_blockers", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("connected_at", sa.DateTime(timezone=True), nullable=True),
        schema="integrations",
    )
    op.create_index(
        op.f("ix_integrations_user_telegram_connections_auth_link_code"),
        "user_telegram_connections",
        ["auth_link_code"],
        unique=True,
        schema="integrations",
    )
    op.create_index(
        op.f("ix_integrations_user_telegram_connections_telegram_chat_id"),
        "user_telegram_connections",
        ["telegram_chat_id"],
        unique=False,
        schema="integrations",
    )

    # 3. User Google Drive Connections
    op.create_table(
        "user_drive_connections",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("google_email", sa.String(length=320), nullable=True),
        sa.Column("encrypted_refresh_token", sa.Text(), nullable=False),
        sa.Column("is_connected", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("connected_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        schema="integrations",
    )


def downgrade() -> None:
    op.drop_table("user_drive_connections", schema="integrations")
    op.drop_index(
        op.f("ix_integrations_user_telegram_connections_telegram_chat_id"),
        table_name="user_telegram_connections",
        schema="integrations",
    )
    op.drop_index(
        op.f("ix_integrations_user_telegram_connections_auth_link_code"),
        table_name="user_telegram_connections",
        schema="integrations",
    )
    op.drop_table("user_telegram_connections", schema="integrations")
    op.drop_index(
        op.f("ix_integrations_user_github_connections_github_username"),
        table_name="user_github_connections",
        schema="integrations",
    )
    op.drop_table("user_github_connections", schema="integrations")
