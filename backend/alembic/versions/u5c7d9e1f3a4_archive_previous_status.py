"""Keep the pre-archive state for project and task restoration."""
from alembic import op
import sqlalchemy as sa

revision = "u5c7d9e1f3a4"
down_revision = "t4b6c8d0e2f3"
branch_labels = None
depends_on = None


def upgrade():
    for table in ("projects", "tasks"):
        op.add_column(table, sa.Column("archived_from_status", sa.String(20), nullable=True), schema="projects")


def downgrade():
    for table in ("tasks", "projects"):
        op.drop_column(table, "archived_from_status", schema="projects")
