"""documentation platform

Revision ID: f7a2d4c6b8e0
Revises: c9e2a4f6b8d1
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "f7a2d4c6b8e0"
down_revision = "c9e2a4f6b8d1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute('CREATE SCHEMA IF NOT EXISTS "docs"')
    uuid = postgresql.UUID(as_uuid=True)
    def timestamps():
        return [
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        ]
    op.create_table("spaces", sa.Column("id", uuid, nullable=False), sa.Column("name", sa.String(160), nullable=False), sa.Column("slug", sa.String(180), nullable=False), sa.Column("description", sa.String(1000)), sa.Column("icon", sa.String(64)), sa.Column("visibility", sa.String(24), nullable=False, server_default="workspace"), sa.Column("position", sa.Integer(), nullable=False, server_default="0"), sa.Column("created_by", uuid, nullable=False), *timestamps(), sa.PrimaryKeyConstraint("id"), sa.UniqueConstraint("slug", name="uq_doc_spaces_slug"), schema="docs")
    op.create_index("ix_doc_spaces_slug", "spaces", ["slug"], schema="docs")
    op.create_table("pages", sa.Column("id", uuid, nullable=False), sa.Column("space_id", uuid, nullable=False), sa.Column("parent_page_id", uuid), sa.Column("title", sa.String(240), nullable=False), sa.Column("slug", sa.String(260), nullable=False), sa.Column("excerpt", sa.String(500)), sa.Column("content", sa.Text(), nullable=False, server_default=""), sa.Column("content_json", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")), sa.Column("status", sa.String(24), nullable=False, server_default="draft"), sa.Column("visibility", sa.String(24), nullable=False, server_default="inherit"), sa.Column("position", sa.Integer(), nullable=False, server_default="0"), sa.Column("youtube_url", sa.String(500)), sa.Column("seo_title", sa.String(240)), sa.Column("seo_description", sa.String(500)), sa.Column("created_by", uuid, nullable=False), sa.Column("updated_by", uuid, nullable=False), *timestamps(), sa.ForeignKeyConstraint(["space_id"], ["docs.spaces.id"], ondelete="CASCADE"), sa.ForeignKeyConstraint(["parent_page_id"], ["docs.pages.id"], ondelete="SET NULL"), sa.PrimaryKeyConstraint("id"), sa.UniqueConstraint("space_id", "slug", name="uq_doc_pages_space_slug"), schema="docs")
    op.create_index("ix_doc_pages_space_id", "pages", ["space_id"], schema="docs")
    op.create_index("ix_doc_pages_slug", "pages", ["slug"], schema="docs")
    op.create_table("permissions", sa.Column("id", uuid, nullable=False), sa.Column("resource_type", sa.String(24), nullable=False), sa.Column("resource_id", uuid, nullable=False), sa.Column("subject_type", sa.String(24), nullable=False), sa.Column("subject_id", sa.String(160), nullable=False), sa.Column("permission", sa.String(24), nullable=False), *timestamps(), sa.PrimaryKeyConstraint("id"), sa.UniqueConstraint("resource_type", "resource_id", "subject_type", "subject_id", "permission", name="uq_doc_permission"), schema="docs")
    op.create_table("revisions", sa.Column("id", uuid, nullable=False), sa.Column("page_id", uuid, nullable=False), sa.Column("revision_number", sa.Integer(), nullable=False), sa.Column("title", sa.String(240), nullable=False), sa.Column("content", sa.Text(), nullable=False), sa.Column("content_json", postgresql.JSONB(), nullable=False), sa.Column("created_by", uuid, nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False), sa.ForeignKeyConstraint(["page_id"], ["docs.pages.id"], ondelete="CASCADE"), sa.PrimaryKeyConstraint("id"), sa.UniqueConstraint("page_id", "revision_number", name="uq_doc_revision_number"), schema="docs")
    op.create_table("favorites", sa.Column("user_id", uuid, nullable=False), sa.Column("page_id", uuid, nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False), sa.ForeignKeyConstraint(["page_id"], ["docs.pages.id"], ondelete="CASCADE"), sa.PrimaryKeyConstraint("user_id", "page_id"), schema="docs")
    op.create_table("views", sa.Column("user_id", uuid, nullable=False), sa.Column("page_id", uuid, nullable=False), sa.Column("viewed_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False), sa.ForeignKeyConstraint(["page_id"], ["docs.pages.id"], ondelete="CASCADE"), sa.PrimaryKeyConstraint("user_id", "page_id"), schema="docs")
    for table, columns in {
        "attachments": [sa.Column("file_name", sa.String(255), nullable=False), sa.Column("file_url", sa.String(1000), nullable=False), sa.Column("mime_type", sa.String(160), nullable=False), sa.Column("uploaded_by", uuid, nullable=False)],
        "links": [sa.Column("entity_type", sa.String(24), nullable=False), sa.Column("entity_id", uuid, nullable=False)],
        "comments": [sa.Column("author_user_id", uuid, nullable=False), sa.Column("body", sa.String(4000), nullable=False)],
    }.items():
        op.create_table(table, sa.Column("id", uuid, nullable=False), sa.Column("page_id", uuid, nullable=False), *columns, *timestamps(), sa.ForeignKeyConstraint(["page_id"], ["docs.pages.id"], ondelete="CASCADE"), sa.PrimaryKeyConstraint("id"), schema="docs")
    op.create_unique_constraint("uq_doc_link", "links", ["page_id", "entity_type", "entity_id"], schema="docs")


def downgrade() -> None:
    for table in ("comments", "links", "attachments", "views", "favorites", "revisions", "permissions", "pages", "spaces"):
        op.drop_table(table, schema="docs")
    op.execute('DROP SCHEMA IF EXISTS "docs"')
