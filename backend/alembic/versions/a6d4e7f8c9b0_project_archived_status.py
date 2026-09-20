"""project archived status

Revision ID: a6d4e7f8c9b0
Revises: f3a7c9d2b1e4
Create Date: 2026-07-08
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a6d4e7f8c9b0"
down_revision: Union[str, None] = "f3a7c9d2b1e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint("ck_status", "projects", schema="projects", type_="check")
    op.create_check_constraint(
        "ck_status",
        "projects",
        "status IN ('not-started', 'in-progress', 'on-hold', 'completed', 'cancelled', 'archived')",
        schema="projects",
    )


def downgrade() -> None:
    op.execute(
        "UPDATE projects.projects SET status = 'cancelled' WHERE status = 'archived'"
    )
    op.drop_constraint("ck_status", "projects", schema="projects", type_="check")
    op.create_check_constraint(
        "ck_status",
        "projects",
        "status IN ('not-started', 'in-progress', 'on-hold', 'completed', 'cancelled')",
        schema="projects",
    )
