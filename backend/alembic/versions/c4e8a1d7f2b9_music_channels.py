"""music channels: listening rooms, synced playback state, Drive connections

Revision ID: c4e8a1d7f2b9
Revises: b7d2f4a9c1e3
Create Date: 2026-07-06

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'c4e8a1d7f2b9'
down_revision: Union[str, None] = 'b7d2f4a9c1e3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Schema creation is handled by alembic/env.py (_create_schemas), which
    # runs CREATE SCHEMA IF NOT EXISTS for every MODULE_SCHEMAS entry.

    op.create_table(
        'channels',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column(
            'color', sa.String(length=32), nullable=False,
            server_default='violet',
        ),
        sa.Column('owner_user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('drive_folder_id', sa.String(length=128), nullable=True),
        sa.Column('drive_folder_name', sa.String(length=300), nullable=True),
        sa.Column('archived_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        schema='music',
    )
    op.create_index(
        'ix_music_channels_owner_user_id', 'channels', ['owner_user_id'],
        schema='music',
    )

    op.create_table(
        'channel_members',
        sa.Column(
            'channel_id', postgresql.UUID(as_uuid=True),
            sa.ForeignKey('music.channels.id', ondelete='CASCADE'),
            primary_key=True,
        ),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            'can_control', sa.Boolean(), nullable=False,
            server_default=sa.text('false'),
        ),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        schema='music',
    )
    op.create_index(
        'ix_music_channel_members_user_id', 'channel_members', ['user_id'],
        schema='music',
    )

    op.create_table(
        'playback_states',
        sa.Column(
            'channel_id', postgresql.UUID(as_uuid=True),
            sa.ForeignKey('music.channels.id', ondelete='CASCADE'),
            primary_key=True,
        ),
        sa.Column(
            'playlist', postgresql.JSONB(), nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            'track_index', sa.Integer(), nullable=False,
            server_default=sa.text('0'),
        ),
        sa.Column(
            'is_playing', sa.Boolean(), nullable=False,
            server_default=sa.text('false'),
        ),
        sa.Column(
            'position_seconds', sa.Float(), nullable=False,
            server_default=sa.text('0'),
        ),
        sa.Column(
            'server_epoch_ms', sa.BigInteger(), nullable=False,
            server_default=sa.text('0'),
        ),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        schema='music',
    )

    op.create_table(
        'drive_connections',
        sa.Column('user_id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('encrypted_refresh_token', sa.Text(), nullable=False),
        sa.Column('google_email', sa.String(length=320), nullable=True),
        sa.Column('connected_at', sa.DateTime(timezone=True), nullable=False),
        schema='music',
    )


def downgrade() -> None:
    op.drop_table('drive_connections', schema='music')
    op.drop_table('playback_states', schema='music')
    op.drop_index(
        'ix_music_channel_members_user_id', table_name='channel_members',
        schema='music',
    )
    op.drop_table('channel_members', schema='music')
    op.drop_index(
        'ix_music_channels_owner_user_id', table_name='channels', schema='music'
    )
    op.drop_table('channels', schema='music')
