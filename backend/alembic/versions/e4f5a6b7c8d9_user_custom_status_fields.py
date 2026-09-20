"""Add status_text, status_emoji, status_expires_at to identity.users

Revision ID: e4f5a6b7c8d9
Revises: c3d4e5f6a7b8
Create Date: 2026-08-21
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "e4f5a6b7c8d9"
down_revision: Union[str, None] = "c3d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("status_text", sa.String(length=255), nullable=True),
        schema="identity",
    )
    op.add_column(
        "users",
        sa.Column("status_emoji", sa.String(length=32), nullable=True),
        schema="identity",
    )
    op.add_column(
        "users",
        sa.Column("status_expires_at", sa.DateTime(timezone=True), nullable=True),
        schema="identity",
    )


def downgrade() -> None:
    op.drop_column("users", "status_expires_at", schema="identity")
    op.drop_column("users", "status_emoji", schema="identity")
    op.drop_column("users", "status_text", schema="identity")
