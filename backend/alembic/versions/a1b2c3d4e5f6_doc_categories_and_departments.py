"""Add doc categories, responsible users, and employee department_id

Revision ID: a1b2c3d4e5f6
Revises: f9a1c3e5d7b2
Create Date: 2026-08-20
"""

from typing import Sequence, Union
import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "f9a1c3e5d7b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Update docs.spaces
    op.add_column(
        "spaces",
        sa.Column("category", sa.String(length=50), server_default="Platform", nullable=False),
        schema="docs",
    )
    op.add_column(
        "spaces",
        sa.Column("responsible_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        schema="docs",
    )
    op.create_index(
        op.f("ix_docs_spaces_category"),
        "spaces",
        ["category"],
        unique=False,
        schema="docs",
    )
    op.create_index(
        op.f("ix_docs_spaces_responsible_user_id"),
        "spaces",
        ["responsible_user_id"],
        unique=False,
        schema="docs",
    )

    # 2. Update docs.pages
    op.add_column(
        "pages",
        sa.Column("responsible_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        schema="docs",
    )
    op.create_index(
        op.f("ix_docs_pages_responsible_user_id"),
        "pages",
        ["responsible_user_id"],
        unique=False,
        schema="docs",
    )

    # 3. Update organization.employees
    op.add_column(
        "employees",
        sa.Column("department_id", postgresql.UUID(as_uuid=True), nullable=True),
        schema="organization",
    )
    op.create_foreign_key(
        "fk_employees_department_id_departments",
        "employees",
        "departments",
        ["department_id"],
        ["id"],
        source_schema="organization",
        referent_schema="organization",
        ondelete="SET NULL",
    )
    op.create_index(
        op.f("ix_organization_employees_department_id"),
        "employees",
        ["department_id"],
        unique=False,
        schema="organization",
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_organization_employees_department_id"),
        table_name="employees",
        schema="organization",
    )
    op.drop_constraint(
        "fk_employees_department_id_departments",
        "employees",
        schema="organization",
        type_="foreignkey",
    )
    op.drop_column("employees", "department_id", schema="organization")

    op.drop_index(
        op.f("ix_docs_pages_responsible_user_id"),
        table_name="pages",
        schema="docs",
    )
    op.drop_column("pages", "responsible_user_id", schema="docs")

    op.drop_index(
        op.f("ix_docs_spaces_responsible_user_id"),
        table_name="spaces",
        schema="docs",
    )
    op.drop_index(
        op.f("ix_docs_spaces_category"),
        table_name="spaces",
        schema="docs",
    )
    op.drop_column("spaces", "responsible_user_id", schema="docs")
    op.drop_column("spaces", "category", schema="docs")
