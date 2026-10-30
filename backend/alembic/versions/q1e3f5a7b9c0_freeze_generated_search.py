"""Exclude PostgreSQL's generated search column from immutable row comparison."""
from alembic import op

revision = "q1e3f5a7b9c0"
down_revision = "p0d2e4f6a8b9"
branch_labels = None
depends_on = None

def upgrade():
    op.execute("""
        CREATE OR REPLACE FUNCTION docs.freeze_published_page() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            IF OLD.status IN ('published', 'archived') THEN
                -- Generated columns are NULL in NEW during BEFORE triggers.
                IF (to_jsonb(NEW) - ARRAY['status','updated_at','updated_by','archived_from_status','search_vector']) IS DISTINCT FROM
                   (to_jsonb(OLD) - ARRAY['status','updated_at','updated_by','archived_from_status','search_vector']) THEN
                    RAISE EXCEPTION 'Published and archived documents are immutable.' USING ERRCODE='42501';
                END IF;
                IF OLD.status='published' THEN
                    IF NEW.status NOT IN ('published','archived') OR
                       (NEW.status='archived' AND NEW.archived_from_status IS DISTINCT FROM 'published') OR
                       (NEW.status='published' AND NEW.archived_from_status IS DISTINCT FROM OLD.archived_from_status) THEN
                        RAISE EXCEPTION 'Published documents cannot return to draft.' USING ERRCODE='42501';
                    END IF;
                END IF;
                IF OLD.status='archived' THEN
                    IF (NEW.status='archived' AND NEW.archived_from_status IS DISTINCT FROM OLD.archived_from_status) OR
                       (NEW.status <> 'archived' AND NEW.status <> COALESCE(OLD.archived_from_status,'published')) THEN
                        RAISE EXCEPTION 'Restore must preserve publication state.' USING ERRCODE='42501';
                    END IF;
                END IF;
            END IF;
            RETURN NEW;
        END $$;
    """)

def downgrade():
    # The retention invariant remains valid when this correction is rolled back.
    pass
