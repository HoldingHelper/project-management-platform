"""music timestamp defaults

Revision ID: d8b2f4c6a9e1
Revises: c4e8a1d7f2b9
Create Date: 2026-07-07

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d8b2f4c6a9e1"
down_revision: Union[str, None] = "c4e8a1d7f2b9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    for table in ("channels", "channel_members"):
        op.alter_column(
            table,
            "created_at",
            schema="music",
            server_default=sa.text("now()"),
            existing_type=sa.DateTime(timezone=True),
            existing_nullable=False,
        )
        op.alter_column(
            table,
            "updated_at",
            schema="music",
            server_default=sa.text("now()"),
            existing_type=sa.DateTime(timezone=True),
            existing_nullable=False,
        )


def downgrade() -> None:
    for table in ("channels", "channel_members"):
        op.alter_column(
            table,
            "updated_at",
            schema="music",
            server_default=None,
            existing_type=sa.DateTime(timezone=True),
            existing_nullable=False,
        )
        op.alter_column(
            table,
            "created_at",
            schema="music",
            server_default=None,
            existing_type=sa.DateTime(timezone=True),
            existing_nullable=False,
        )
