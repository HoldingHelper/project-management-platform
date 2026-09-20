"""Add revocable per-user MCP access tokens.

Revision ID: e6a3c8f1b4d7
Revises: d4f8b2c6a1e9
"""

from typing import Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "e6a3c8f1b4d7"
down_revision: Union[str, None] = "d4f8b2c6a1e9"
branch_labels: Union[str, tuple[str, ...], None] = None
depends_on: Union[str, tuple[str, ...], None] = None


def upgrade() -> None:
    op.create_table(
        "mcp_access_tokens",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("token_prefix", sa.String(length=24), nullable=False),
        sa.Column("token_hash", sa.String(length=128), nullable=False),
        sa.Column("permission_codes", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"], ["identity.users.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash", name="uq_mcp_access_tokens_token_hash"),
        schema="identity",
    )
    op.create_index(
        "ix_identity_mcp_access_tokens_user_id",
        "mcp_access_tokens",
        ["user_id"],
        unique=False,
        schema="identity",
    )
    op.create_index(
        "ix_identity_mcp_access_tokens_token_hash",
        "mcp_access_tokens",
        ["token_hash"],
        unique=False,
        schema="identity",
    )


def downgrade() -> None:
    op.drop_index(
        "ix_identity_mcp_access_tokens_token_hash",
        table_name="mcp_access_tokens",
        schema="identity",
    )
    op.drop_index(
        "ix_identity_mcp_access_tokens_user_id",
        table_name="mcp_access_tokens",
        schema="identity",
    )
    op.drop_table("mcp_access_tokens", schema="identity")
