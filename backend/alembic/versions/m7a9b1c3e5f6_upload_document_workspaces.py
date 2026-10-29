"""Organize entity uploads in private, resource-scoped Docs workspaces."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
revision = "m7a9b1c3e5f6"
down_revision = "l6f8a0b2d4e5"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("spaces", sa.Column("product_id", UUID(), nullable=True), schema="docs")
    op.add_column("spaces", sa.Column("task_id", UUID(), nullable=True), schema="docs")
    op.create_foreign_key("fk_doc_space_product", "spaces", "products", ["product_id"], ["id"], source_schema="docs", referent_schema="projects", ondelete="CASCADE")
    op.create_foreign_key("fk_doc_space_task", "spaces", "tasks", ["task_id"], ["id"], source_schema="docs", referent_schema="projects", ondelete="CASCADE")
    op.create_unique_constraint("uq_doc_space_product", "spaces", ["product_id"], schema="docs")
    op.create_unique_constraint("uq_doc_space_task", "spaces", ["task_id"], schema="docs")
    op.add_column("pages", sa.Column("source_attachment_id", UUID(), nullable=True), schema="docs")
    op.add_column("pages", sa.Column("source_entity_type", sa.String(24), nullable=True), schema="docs")
    op.add_column("pages", sa.Column("source_entity_id", UUID(), nullable=True), schema="docs")
    op.create_foreign_key("fk_doc_page_upload", "pages", "file_attachments", ["source_attachment_id"], ["id"], source_schema="docs", referent_schema="collaboration", ondelete="CASCADE")
    op.create_unique_constraint("uq_doc_page_upload", "pages", ["source_attachment_id"], schema="docs")


def downgrade():
    for name in ("source_attachment_id", "source_entity_type", "source_entity_id"):
        op.drop_column("pages", name, schema="docs")
    for name in ("product_id", "task_id"):
        op.drop_column("spaces", name, schema="docs")