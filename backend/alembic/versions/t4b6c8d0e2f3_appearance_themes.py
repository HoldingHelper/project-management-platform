"""Persist independent theme styles and accent colors per account."""
from alembic import op
import sqlalchemy as sa
revision = "t4b6c8d0e2f3"
down_revision = "s3a5b7c9d1e2"
branch_labels = None
depends_on = None

def upgrade():
    op.add_column("user_settings", sa.Column("theme_variant", sa.String(16), nullable=True), schema="identity")
    op.add_column("user_settings", sa.Column("accent_color", sa.String(16), nullable=True), schema="identity")
    op.create_check_constraint("ck_settings_theme_variant", "user_settings", "theme_variant IS NULL OR theme_variant IN ('classic','frosted','clinical','sprint','study','minimal')", schema="identity")
    op.create_check_constraint("ck_settings_accent_color", "user_settings", "accent_color IS NULL OR accent_color IN ('blue','purple','emerald','teal','rose','amber')", schema="identity")

def downgrade():
    op.drop_constraint("ck_settings_accent_color", "user_settings", schema="identity", type_="check")
    op.drop_constraint("ck_settings_theme_variant", "user_settings", schema="identity", type_="check")
    op.drop_column("user_settings", "accent_color", schema="identity")
    op.drop_column("user_settings", "theme_variant", schema="identity")
