"""Persist account language and display-format preferences."""
from alembic import op
import sqlalchemy as sa

revision = "n8b0c2d4e6f7"
down_revision = "m7a9b1c3e5f6"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("locale", sa.String(2), nullable=True), schema="identity")
    op.add_column("users", sa.Column("calendar", sa.String(8), server_default="gregory", nullable=False), schema="identity")
    op.add_column("users", sa.Column("numbering_system", sa.String(8), server_default="latn", nullable=False), schema="identity")
    op.create_check_constraint("ck_users_locale", "users", "locale IS NULL OR locale IN ('en', 'fa')", schema="identity")
    op.create_check_constraint("ck_users_calendar", "users", "calendar IN ('gregory', 'persian')", schema="identity")
    op.create_check_constraint("ck_users_numbering_system", "users", "numbering_system IN ('latn', 'arabext')", schema="identity")


def downgrade():
    for constraint in ["ck_users_locale", "ck_users_calendar", "ck_users_numbering_system"]:
        op.drop_constraint(constraint, "users", schema="identity", type_="check")
    for column in ["numbering_system", "calendar", "locale"]:
        op.drop_column("users", column, schema="identity")
