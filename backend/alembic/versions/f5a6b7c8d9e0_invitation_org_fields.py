"""Add department_id, team_id, manager_id to identity.invitations

Revision ID: f5a6b7c8d9e0
Revises: e4f5a6b7c8d9
Create Date: 2026-08-21
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "f5a6b7c8d9e0"
down_revision: Union[str, None] = "e4f5a6b7c8d9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "invitations",
        sa.Column("department_id", UUID(as_uuid=True), nullable=True),
        schema="identity",
    )
    op.add_column(
        "invitations",
        sa.Column("team_id", UUID(as_uuid=True), nullable=True),
        schema="identity",
    )
    op.add_column(
        "invitations",
        sa.Column("manager_id", UUID(as_uuid=True), nullable=True),
        schema="identity",
    )


def downgrade() -> None:
    op.drop_column("invitations", "manager_id", schema="identity")
    op.drop_column("invitations", "team_id", schema="identity")
    op.drop_column("invitations", "department_id", schema="identity")
