"""Require explicit permission to download or send files."""
from alembic import op
import sqlalchemy as sa

revision = "w7e9f1a3b5c7"
down_revision = "v6d8e0f2a4b5"
branch_labels = None
depends_on = None


def upgrade():
    for schema, table in (("collaboration", "file_attachments"), ("docs", "attachments")):
        op.add_column(table, sa.Column("download_share_enabled", sa.Boolean(), nullable=False, server_default=sa.false()), schema=schema)
    op.execute("""
        CREATE OR REPLACE FUNCTION docs.guard_document_attachment() RETURNS trigger LANGUAGE plpgsql AS $$
        DECLARE page_state text;
        BEGIN
            SELECT status INTO page_state FROM docs.pages WHERE id=NEW.page_id FOR UPDATE;
            IF page_state IN ('published','archived') AND
                (TG_OP = 'INSERT' OR (to_jsonb(NEW) - 'download_share_enabled' - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'download_share_enabled' - 'updated_at')) THEN
                RAISE EXCEPTION 'Published document attachments are immutable.' USING ERRCODE='42501';
            END IF;
            RETURN NEW;
        END $$;
    """)


def downgrade():
    op.execute("""
        CREATE OR REPLACE FUNCTION docs.guard_document_attachment() RETURNS trigger LANGUAGE plpgsql AS $$
        DECLARE page_state text;
        BEGIN
            SELECT status INTO page_state FROM docs.pages WHERE id=NEW.page_id FOR UPDATE;
            IF page_state IN ('published','archived') THEN
                RAISE EXCEPTION 'Published document attachments are immutable.' USING ERRCODE='42501';
            END IF;
            RETURN NEW;
        END $$;
    """)
    for schema, table in (("docs", "attachments"), ("collaboration", "file_attachments")):
        op.drop_column(table, "download_share_enabled", schema=schema)
