"""music playback state_version

Adds a monotonic `state_version` to music.playback_states. Clients ignore any
websocket frame whose version is not strictly greater than the last applied,
so stale/reordered frames can never move playback backward.

Revision ID: b1c3e5d7f9a2
Revises: a6d4e7f8c9b0
Create Date: 2026-07-09

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b1c3e5d7f9a2"
down_revision: Union[str, None] = "a6d4e7f8c9b0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "playback_states",
        sa.Column(
            "state_version",
            sa.BigInteger(),
            nullable=False,
            server_default="0",
        ),
        schema="music",
    )


def downgrade() -> None:
    op.drop_column("playback_states", "state_version", schema="music")
