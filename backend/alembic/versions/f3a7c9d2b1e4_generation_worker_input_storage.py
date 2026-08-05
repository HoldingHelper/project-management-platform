"""generation worker input storage

Revision ID: f3a7c9d2b1e4
Revises: e2f1a9b8c7d6
Create Date: 2026-07-08
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f3a7c9d2b1e4"
down_revision: Union[str, None] = "e2f1a9b8c7d6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "generation_runs",
        sa.Column("input_storage_key", sa.String(length=500), nullable=True),
        schema="projects",
    )
    op.add_column(
        "generation_runs",
        sa.Column("input_filename", sa.String(length=255), nullable=True),
        schema="projects",
    )


def downgrade() -> None:
    op.drop_column("generation_runs", "input_filename", schema="projects")
    op.drop_column("generation_runs", "input_storage_key", schema="projects")
