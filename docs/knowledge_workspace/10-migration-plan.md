# 10 - Migration & Legacy Compatibility Plan

## 1. Zero-Regression Migration Principles

1. **100% Document Preservation**: Every existing `DocSpace`, `DocPage`, `DocRevision`, `DocComment`, `DocAttachment`, and `DocLink` remains completely intact and accessible.
2. **Route Invariance**:
   - `/app/docs`: Upgraded to the new Knowledge Workspace Shell. Legacy query params (`?view=recent`, `?category=Technical`) are honored and populate the active explorer filter.
   - `/app/docs/spaces/[spaceId]/[pageId]`: Automatically mounts the Knowledge Workspace with `pageId` opened as the active tab.
   - `/docs/[category]/[slug]`: Public published document rendering remains fully compatible with existing static export and server-side fetching.
   - `/docs/shared/[pageId]`: Preserved for shared public document viewing.
3. **Additive Schema Only**: No existing columns or tables in `docs` are deleted or renamed. All new capabilities (`relations`, `tags`, `sources`, `chunks`, `search_vector`) are purely additive.

---

## 2. Alembic Migration Strategy

A new Alembic migration `g1a2b3c4d5e6_knowledge_workspace_tables.py` will be created:

```python
"""knowledge workspace tables

Revision ID: g1a2b3c4d5e6
Revises: f9a1c3e5d7b2
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

def upgrade() -> None:
    uuid = postgresql.UUID(as_uuid=True)
    
    # 1. Add doc_type and search_vector to docs.pages
    op.add_column("pages", sa.Column("doc_type", sa.String(32), nullable=False, server_default="document"), schema="docs")
    
    # 2. Add search_vector column and GIN index
    op.execute("""
        ALTER TABLE docs.pages 
        ADD COLUMN IF NOT EXISTS search_vector tsvector 
        GENERATED ALWAYS AS (
            setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
            setweight(to_tsvector('english', coalesce(excerpt, '')), 'B') ||
            setweight(to_tsvector('english', coalesce(content, '')), 'C')
        ) STORED;
    """)
    op.create_index("ix_doc_pages_search_vector", "pages", ["search_vector"], schema="docs", postgresql_using="gin")
    
    # 3. Create docs.relations
    op.create_table(
        "relations",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("source_page_id", uuid, sa.ForeignKey("docs.pages.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("target_page_id", uuid, sa.ForeignKey("docs.pages.id", ondelete="CASCADE"), nullable=True, index=True),
        sa.Column("target_title", sa.String(240), nullable=False, index=True),
        sa.Column("relation_type", sa.String(32), nullable=False, server_default="links_to"),
        sa.Column("anchor_text", sa.String(240), nullable=True),
        sa.Column("confidence", sa.String(16), nullable=False, server_default="EXTRACTED"),
        sa.Column("confidence_score", sa.Float(), nullable=False, server_default="1.0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        schema="docs",
    )
    
    # 4. Create docs.tags and docs.page_tags
    op.create_table(
        "tags",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("name", sa.String(64), nullable=False, unique=True, index=True),
        sa.Column("color", sa.String(32), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        schema="docs",
    )
    op.create_table(
        "page_tags",
        sa.Column("page_id", uuid, sa.ForeignKey("docs.pages.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("tag_id", uuid, sa.ForeignKey("docs.tags.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        schema="docs",
    )

    # 5. Create docs.sources and docs.source_chunks
    op.create_table(
        "sources",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("space_id", uuid, sa.ForeignKey("docs.spaces.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("page_id", uuid, sa.ForeignKey("docs.pages.id", ondelete="SET NULL"), nullable=True, index=True),
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
    op.create_table(
        "source_chunks",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("source_id", uuid, sa.ForeignKey("docs.sources.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("token_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        schema="docs",
    )

    # 6. Create docs.chat_sessions, docs.chat_messages, docs.citations
    op.create_table(
        "chat_sessions",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("user_id", uuid, nullable=False, index=True),
        sa.Column("page_id", uuid, sa.ForeignKey("docs.pages.id", ondelete="SET NULL"), nullable=True),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("context_config", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        schema="docs",
    )
    op.create_table(
        "chat_messages",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("session_id", uuid, sa.ForeignKey("docs.chat_sessions.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("role", sa.String(16), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("model", sa.String(64), nullable=False, server_default="gpt-5.5"),
        sa.Column("tokens_used", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        schema="docs",
    )
    op.create_table(
        "citations",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("message_id", uuid, sa.ForeignKey("docs.chat_messages.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("source_type", sa.String(24), nullable=False),
        sa.Column("source_id", uuid, nullable=False),
        sa.Column("chunk_id", uuid, nullable=True),
        sa.Column("title", sa.String(240), nullable=False),
        sa.Column("excerpt", sa.Text(), nullable=False),
        sa.Column("location_anchor", sa.String(100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        schema="docs",
    )
```

---

## 3. Data Backfill Script

A backfill script `backend/scripts/backfill_knowledge_relations.py` will:
1. Scan all existing `DocPage` rows in `docs.pages`.
2. Parse any markdown links or `[[WikiLinks]]` present in their content.
3. Resolve targets to existing pages by title or slug.
4. Populate `docs.relations` idempotently.
5. Provide a `--dry-run` flag to audit links before writing:
   ```bash
   python scripts/backfill_knowledge_relations.py --dry-run
   ```
