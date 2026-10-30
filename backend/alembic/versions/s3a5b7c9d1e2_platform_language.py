"""Platform language default independent of personal choices."""
from alembic import op
import sqlalchemy as sa
revision = "s3a5b7c9d1e2"
down_revision = "r2f4a6b8c0d1"
branch_labels = None
depends_on = None

def upgrade():
    op.create_table("platform_language", sa.Column("key", sa.String(20), primary_key=True), sa.Column("locale", sa.String(2), nullable=True), sa.CheckConstraint("key = 'default'", name="ck_platform_language_singleton"), sa.CheckConstraint("locale IS NULL OR locale IN ('en', 'fa')", name="ck_platform_language_locale"), schema="identity")
    op.execute("INSERT INTO identity.platform_language (key, locale) VALUES ('default', NULL)")

def downgrade():
    op.drop_table("platform_language", schema="identity")
