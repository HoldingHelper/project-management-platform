"""Add collaboration.user_devices table for iOS and Android push notifications

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-08-20
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "user_devices",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("device_token", sa.String(length=255), nullable=False),
        sa.Column("platform", sa.String(length=20), nullable=False),
        sa.Column("device_name", sa.String(length=100), nullable=True),
        sa.Column("app_version", sa.String(length=50), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        schema="collaboration",
    )
    op.create_index(
        op.f("ix_collaboration_user_devices_user_id"),
        "user_devices",
        ["user_id"],
        unique=False,
        schema="collaboration",
    )
    op.create_index(
        op.f("ix_collaboration_user_devices_device_token"),
        "user_devices",
        ["device_token"],
        unique=True,
        schema="collaboration",
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_collaboration_user_devices_device_token"),
        table_name="user_devices",
        schema="collaboration",
    )
    op.drop_index(
        op.f("ix_collaboration_user_devices_user_id"),
        table_name="user_devices",
        schema="collaboration",
    )
    op.drop_table("user_devices", schema="collaboration")
