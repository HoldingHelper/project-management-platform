"""persisted task board order

Revision ID: c9e2a4f6b8d1
Revises: b1c3e5d7f9a2
Create Date: 2026-08-05
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c9e2a4f6b8d1"
down_revision: Union[str, None] = "b1c3e5d7f9a2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "tasks",
        sa.Column("board_order", sa.Integer(), nullable=False, server_default="0"),
        schema="projects",
    )
    op.execute(
        """
        WITH ordered AS (
            SELECT id,
                   ROW_NUMBER() OVER (
                       PARTITION BY phase_id, status
                       ORDER BY created_at, id
                   ) - 1 AS position
            FROM projects.tasks
        )
        UPDATE projects.tasks AS task
        SET board_order = ordered.position
        FROM ordered
        WHERE task.id = ordered.id
        """
    )
    op.alter_column("tasks", "board_order", server_default=None, schema="projects")


def downgrade() -> None:
    op.drop_column("tasks", "board_order", schema="projects")
