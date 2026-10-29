"""Persist project checklists independently of task progress."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "l6f8a0b2d4e5"
down_revision = "k5e7a9b1d3f4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("checklist_items", JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")), schema="projects")


def downgrade() -> None:
    op.drop_column("projects", "checklist_items", schema="projects")