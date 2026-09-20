"""Knowledge workspace tables for connected knowledge, sources, search, and AI

Revision ID: g1a2b3c4d5e6
Revises: a5c7d9e1f2b3
Create Date: 2026-09-20
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "g1a2b3c4d5e6"
down_revision: Union[str, None] = "a5c7d9e1f2b3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    uuid = postgresql.UUID(as_uuid=True)

    # 1. Add doc_type column to docs.pages
    op.add_column(
        "pages",
        sa.Column("doc_type", sa.String(32), nullable=False, server_default="document"),
        schema="docs",
    )

    # 2. Add search_vector generated column & GIN index to docs.pages
    op.execute(
        """
        ALTER TABLE docs.pages 
        ADD COLUMN IF NOT EXISTS search_vector tsvector 
        GENERATED ALWAYS AS (
            setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
            setweight(to_tsvector('english', coalesce(excerpt, '')), 'B') ||
            setweight(to_tsvector('english', coalesce(content, '')), 'C')
        ) STORED;
        """
    )
    op.create_index(
        "ix_doc_pages_search_vector",
        "pages",
        ["search_vector"],
        schema="docs",
        postgresql_using="gin",
    )

    # 3. Create docs.relations
    op.create_table(
        "relations",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("source_page_id", uuid, sa.ForeignKey("docs.pages.id", ondelete="CASCADE"), nullable=False),
        sa.Column("target_page_id", uuid, sa.ForeignKey("docs.pages.id", ondelete="CASCADE"), nullable=True),
        sa.Column("target_title", sa.String(240), nullable=False),
        sa.Column("relation_type", sa.String(32), nullable=False, server_default="links_to"),
        sa.Column("anchor_text", sa.String(240), nullable=True),
        sa.Column("confidence", sa.String(16), nullable=False, server_default="EXTRACTED"),
        sa.Column("confidence_score", sa.Float(), nullable=False, server_default="1.0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        schema="docs",
    )
    op.create_index("ix_doc_relations_source_page_id", "relations", ["source_page_id"], schema="docs")
    op.create_index("ix_doc_relations_target_page_id", "relations", ["target_page_id"], schema="docs")
    op.create_index("ix_doc_relations_target_title", "relations", ["target_title"], schema="docs")

    # 4. Create docs.tags & docs.page_tags
    op.create_table(
        "tags",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("name", sa.String(64), nullable=False),
        sa.Column("color", sa.String(32), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("name", name="uq_doc_tags_name"),
        schema="docs",
    )
    op.create_index("ix_doc_tags_name", "tags", ["name"], schema="docs")

    op.create_table(
        "page_tags",
        sa.Column("page_id", uuid, sa.ForeignKey("docs.pages.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("tag_id", uuid, sa.ForeignKey("docs.tags.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        schema="docs",
    )

    # 5. Create docs.sources & docs.source_chunks
    op.create_table(
        "sources",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("space_id", uuid, sa.ForeignKey("docs.spaces.id", ondelete="SET NULL"), nullable=True),
        sa.Column("page_id", uuid, sa.ForeignKey("docs.pages.id", ondelete="SET NULL"), nullable=True),
        sa.Column("title", sa.String(240), nullable=False),
        sa.Column("source_type", sa.String(32), nullable=False),
        sa.Column("source_url", sa.String(1000), nullable=True),
        sa.Column("storage_key", sa.String(1000), nullable=True),
        sa.Column("content_text", sa.Text(), nullable=False, server_default=""),
        sa.Column("metadata_json", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("status", sa.String(24), nullable=False, server_default="ready"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_by", uuid, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        schema="docs",
    )
    op.create_index("ix_doc_sources_space_id", "sources", ["space_id"], schema="docs")
    op.create_index("ix_doc_sources_page_id", "sources", ["page_id"], schema="docs")

    op.create_table(
        "source_chunks",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("source_id", uuid, sa.ForeignKey("docs.sources.id", ondelete="CASCADE"), nullable=False),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("token_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        schema="docs",
    )
    op.create_index("ix_doc_source_chunks_source_id", "source_chunks", ["source_id"], schema="docs")

    # 6. Create docs.chat_sessions, docs.chat_messages, docs.citations
    op.create_table(
        "chat_sessions",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("user_id", uuid, nullable=False),
        sa.Column("page_id", uuid, sa.ForeignKey("docs.pages.id", ondelete="SET NULL"), nullable=True),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("context_config", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        schema="docs",
    )
    op.create_index("ix_doc_chat_sessions_user_id", "chat_sessions", ["user_id"], schema="docs")

    op.create_table(
        "chat_messages",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("session_id", uuid, sa.ForeignKey("docs.chat_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(16), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("model", sa.String(64), nullable=False, server_default="gpt-5.5"),
        sa.Column("tokens_used", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        schema="docs",
    )
    op.create_index("ix_doc_chat_messages_session_id", "chat_messages", ["session_id"], schema="docs")

    op.create_table(
        "citations",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("message_id", uuid, sa.ForeignKey("docs.chat_messages.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source_type", sa.String(24), nullable=False),
        sa.Column("source_id", uuid, nullable=False),
        sa.Column("chunk_id", uuid, nullable=True),
        sa.Column("title", sa.String(240), nullable=False),
        sa.Column("excerpt", sa.Text(), nullable=False),
        sa.Column("location_anchor", sa.String(100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        schema="docs",
    )
    op.create_index("ix_doc_citations_message_id", "citations", ["message_id"], schema="docs")


def downgrade() -> None:
    for table in (
        "citations",
        "chat_messages",
        "chat_sessions",
        "source_chunks",
        "sources",
        "page_tags",
        "tags",
        "relations",
    ):
        op.drop_table(table, schema="docs")

    op.drop_index("ix_doc_pages_search_vector", table_name="pages", schema="docs")
    op.drop_column("pages", "search_vector", schema="docs")
    op.drop_column("pages", "doc_type", schema="docs")
