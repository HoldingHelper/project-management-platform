"""Explicit product-line membership, preserving existing project access."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "o9c1d3e5f7a8"
down_revision = "n8b0c2d4e6f7"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "product_members",
        sa.Column("product_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.products.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("identity.users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        schema="projects",
    )
    op.execute("""
        INSERT INTO projects.product_members (product_id, user_id)
        SELECT DISTINCT p.product_id, pm.user_id FROM projects.projects p
        JOIN projects.project_members pm ON pm.project_id = p.id
        JOIN identity.users u ON u.id = pm.user_id
        ON CONFLICT DO NOTHING
    """)


def downgrade():
    op.drop_table("product_members", schema="projects")
