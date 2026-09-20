"""Add task ticket mode.

Revision ID: d4f8b2c6a1e9
Revises: c7e2a4f9b1d6
"""

from typing import Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "d4f8b2c6a1e9"
down_revision: Union[str, None] = "c7e2a4f9b1d6"
branch_labels: Union[str, tuple[str, ...], None] = None
depends_on: Union[str, tuple[str, ...], None] = None


def upgrade() -> None:
    op.add_column(
        "tasks",
        sa.Column("is_ticket", sa.Boolean(), nullable=False, server_default=sa.false()),
        schema="projects",
    )
    op.add_column(
        "tasks",
        sa.Column("ticket_requested_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        schema="projects",
    )
    op.create_index(
        "ix_projects_tasks_ticket_requested_by_user_id",
        "tasks",
        ["ticket_requested_by_user_id"],
        unique=False,
        schema="projects",
    )


def downgrade() -> None:
    op.drop_index(
        "ix_projects_tasks_ticket_requested_by_user_id",
        table_name="tasks",
        schema="projects",
    )
    op.drop_column("tasks", "ticket_requested_by_user_id", schema="projects")
    op.drop_column("tasks", "is_ticket", schema="projects")
