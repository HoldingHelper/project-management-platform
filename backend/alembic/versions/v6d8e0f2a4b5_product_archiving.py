"""Retain product lines and their state when archived."""
from alembic import op
import sqlalchemy as sa

revision = "v6d8e0f2a4b5"
down_revision = "u5c7d9e1f3a4"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("products", sa.Column("archived_from_status", sa.String(30), nullable=True), schema="projects")
    op.drop_constraint("ck_status", "products", schema="projects", type_="check")
    op.create_check_constraint("ck_status", "products", "status IN ('Planning','Active','Maintenance','Sunset','Archived')", schema="projects")


def downgrade():
    op.execute("UPDATE projects.products SET status = COALESCE(archived_from_status, 'Planning') WHERE status = 'Archived'")
    op.drop_constraint("ck_status", "products", schema="projects", type_="check")
    op.create_check_constraint("ck_status", "products", "status IN ('Planning','Active','Maintenance','Sunset')", schema="projects")
    op.drop_column("products", "archived_from_status", schema="projects")
