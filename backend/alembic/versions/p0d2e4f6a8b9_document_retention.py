"""Retain documents/messages and freeze published document content."""
from alembic import op
import sqlalchemy as sa

revision = "p0d2e4f6a8b9"
down_revision = "o9c1d3e5f7a8"
branch_labels = None
depends_on = None

RETAINED = ["docs.pages", "docs.attachments", "docs.sources", "docs.revisions",
            "docs.comments", "docs.chat_messages", "chat.messages",
            "collaboration.comments", "collaboration.file_attachments"]

def upgrade():
    op.add_column("pages", sa.Column("archived_from_status", sa.String(24), nullable=True), schema="docs")
    op.execute("UPDATE docs.pages SET status='draft' WHERE status='internal'")
    op.execute("UPDATE docs.pages SET archived_from_status='published' WHERE status='archived'")
    op.execute("""
        CREATE FUNCTION docs.prevent_retained_delete() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            RAISE EXCEPTION 'Documents and messages cannot be deleted; archive documents instead.' USING ERRCODE='42501';
        END $$;
    """)
    for table in RETAINED:
        op.execute(f"CREATE TRIGGER retain_record BEFORE DELETE ON {table} FOR EACH ROW EXECUTE FUNCTION docs.prevent_retained_delete()")
    op.execute("""
        CREATE FUNCTION docs.freeze_published_page() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            IF OLD.status IN ('published', 'archived') THEN
                IF (to_jsonb(NEW) - ARRAY['status','updated_at','updated_by','archived_from_status']) IS DISTINCT FROM
                   (to_jsonb(OLD) - ARRAY['status','updated_at','updated_by','archived_from_status']) THEN
                    RAISE EXCEPTION 'Published and archived documents are immutable.' USING ERRCODE='42501';
                END IF;
                IF OLD.status='published' AND NEW.status NOT IN ('published','archived') THEN
                    RAISE EXCEPTION 'Published documents cannot return to draft.' USING ERRCODE='42501';
                END IF;
                IF OLD.status='archived' AND NEW.status <> 'archived' AND NEW.status <> COALESCE(OLD.archived_from_status,'published') THEN
                    RAISE EXCEPTION 'Restore must preserve the document publication state.' USING ERRCODE='42501';
                END IF;
            END IF;
            RETURN NEW;
        END $$;
    """)
    op.execute("""
        CREATE TRIGGER freeze_published_page BEFORE UPDATE ON docs.pages FOR EACH ROW EXECUTE FUNCTION docs.freeze_published_page();
    """)
    op.execute("""
        CREATE FUNCTION docs.prevent_message_removal() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            IF TG_TABLE_SCHEMA='chat' AND TG_TABLE_NAME='messages' THEN
                IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
                    RAISE EXCEPTION 'Messages cannot be deleted.' USING ERRCODE='42501';
                END IF;
            ELSIF TG_TABLE_SCHEMA='collaboration' AND TG_TABLE_NAME='comments' THEN
                IF NEW.is_deleted IS DISTINCT FROM OLD.is_deleted THEN
                    RAISE EXCEPTION 'Messages cannot be deleted.' USING ERRCODE='42501';
                END IF;
            END IF;
            RETURN NEW;
        END $$;
    """)
    op.execute("""
        CREATE TRIGGER retain_message BEFORE UPDATE ON chat.messages FOR EACH ROW EXECUTE FUNCTION docs.prevent_message_removal();
    """)
    op.execute("""
        CREATE TRIGGER retain_comment BEFORE UPDATE ON collaboration.comments FOR EACH ROW EXECUTE FUNCTION docs.prevent_message_removal();
    """)

    op.execute("""
        CREATE FUNCTION docs.guard_document_attachment() RETURNS trigger LANGUAGE plpgsql AS $$
        DECLARE page_state text;
        BEGIN
            SELECT status INTO page_state FROM docs.pages WHERE id=NEW.page_id FOR UPDATE;
            IF page_state IN ('published','archived') THEN
                RAISE EXCEPTION 'Published document attachments are immutable.' USING ERRCODE='42501';
            END IF;
            RETURN NEW;
        END $$;
    """)
    op.execute("""
        CREATE TRIGGER immutable_attachment BEFORE INSERT OR UPDATE ON docs.attachments FOR EACH ROW EXECUTE FUNCTION docs.guard_document_attachment();
    """)

def downgrade():
    op.execute("DROP TRIGGER immutable_attachment ON docs.attachments")
    op.execute("DROP FUNCTION docs.guard_document_attachment()")
    op.execute("DROP TRIGGER retain_comment ON collaboration.comments")
    op.execute("DROP TRIGGER retain_message ON chat.messages")
    op.execute("DROP FUNCTION docs.prevent_message_removal()")
    op.execute("DROP TRIGGER freeze_published_page ON docs.pages")
    op.execute("DROP FUNCTION docs.freeze_published_page()")
    for table in RETAINED:
        op.execute(f"DROP TRIGGER retain_record ON {table}")
    op.execute("DROP FUNCTION docs.prevent_retained_delete()")
    op.drop_column("pages", "archived_from_status", schema="docs")
