"""docs collaboration anchors and object storage

Revision ID: a9c4e7f2b6d1
Revises: f5a6b7c8d9e0
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a9c4e7f2b6d1"
down_revision: Union[str, None] = "f5a6b7c8d9e0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("attachments", sa.Column("storage_key", sa.String(1000), nullable=True), schema="docs")
    op.add_column("attachments", sa.Column("size_bytes", sa.BigInteger(), nullable=True), schema="docs")
    op.add_column("comments", sa.Column("selection_start", sa.Integer(), nullable=True), schema="docs")
    op.add_column("comments", sa.Column("selection_end", sa.Integer(), nullable=True), schema="docs")
    op.add_column("comments", sa.Column("selected_text", sa.String(1000), nullable=True), schema="docs")


def downgrade() -> None:
    op.drop_column("comments", "selected_text", schema="docs")
    op.drop_column("comments", "selection_end", schema="docs")
    op.drop_column("comments", "selection_start", schema="docs")
    op.drop_column("attachments", "size_bytes", schema="docs")
    op.drop_column("attachments", "storage_key", schema="docs")
