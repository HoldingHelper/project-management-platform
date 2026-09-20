"""google calendar integration

Revision ID: d5f9b2e8a1c3
Revises: f7a2d4c6b8e0
Create Date: 2026-08-20
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "d5f9b2e8a1c3"
down_revision: Union[str, None] = "f7a2d4c6b8e0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute('CREATE SCHEMA IF NOT EXISTS "calendar"')
    uuid_type = postgresql.UUID(as_uuid=True)

    op.create_table(
        "connections",
        sa.Column("user_id", uuid_type, nullable=False),
        sa.Column("encrypted_refresh_token", sa.Text(), nullable=False),
        sa.Column("google_email", sa.String(length=320), nullable=True),
        sa.Column("sync_token", sa.String(length=512), nullable=True),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("connected_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("user_id"),
        schema="calendar",
    )

    op.create_table(
        "events",
        sa.Column("id", uuid_type, nullable=False),
        sa.Column("user_id", uuid_type, nullable=False),
        sa.Column("google_event_id", sa.String(length=255), nullable=False),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("start_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("meet_url", sa.String(length=1024), nullable=True),
        sa.Column("html_link", sa.String(length=1024), nullable=True),
        sa.Column("location", sa.String(length=500), nullable=True),
        sa.Column("attendees", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("is_all_day", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("reminded_10m", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("reminded_2m", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        schema="calendar",
    )
    op.create_index("ix_calendar_events_user_start", "events", ["user_id", "start_time"], schema="calendar")
    op.create_index("ix_calendar_events_remind_10m", "events", ["reminded_10m", "start_time"], schema="calendar")
    op.create_index("ix_calendar_events_remind_2m", "events", ["reminded_2m", "start_time"], schema="calendar")
    op.create_index("ix_calendar_events_user_id", "events", ["user_id"], schema="calendar")
    op.create_index("ix_calendar_events_google_event_id", "events", ["google_event_id"], schema="calendar")


def downgrade() -> None:
    op.drop_index("ix_calendar_events_google_event_id", table_name="events", schema="calendar")
    op.drop_index("ix_calendar_events_user_id", table_name="events", schema="calendar")
    op.drop_index("ix_calendar_events_remind_2m", table_name="events", schema="calendar")
    op.drop_index("ix_calendar_events_remind_10m", table_name="events", schema="calendar")
    op.drop_index("ix_calendar_events_user_start", table_name="events", schema="calendar")
    op.drop_table("events", schema="calendar")
    op.drop_table("connections", schema="calendar")
    op.execute('DROP SCHEMA IF EXISTS "calendar" CASCADE')
