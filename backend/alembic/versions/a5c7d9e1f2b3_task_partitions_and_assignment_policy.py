"""Add managed task partitions and assignment capability.

Revision ID: a5c7d9e1f2b3
Revises: e6a3c8f1b4d7
Create Date: 2026-08-31
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "a5c7d9e1f2b3"
down_revision: Union[str, None] = "e6a3c8f1b4d7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


PARTITIONS = [
    ("10000000-0000-4000-8000-000000000001", "Tech", "tech", "Engineering, platform, data, DevOps, and technical delivery.", 10),
    ("10000000-0000-4000-8000-000000000002", "Operations", "operations", "Operational workflows, service delivery, and process execution.", 20),
    ("10000000-0000-4000-8000-000000000003", "Business", "business", "Strategy, planning, finance, partnerships, and commercial work.", 30),
    ("10000000-0000-4000-8000-000000000004", "Marketing", "marketing", "Campaigns, growth, content, and go-to-market work.", 40),
    ("10000000-0000-4000-8000-000000000005", "Sales", "sales", "Sales pipeline, customer outreach, and account work.", 50),
    ("10000000-0000-4000-8000-000000000006", "Design", "design", "Product design, UI/UX, visual systems, and creative work.", 60),
]
TASKS_ASSIGN_PERMISSION_ID = "20000000-0000-4000-8000-000000000001"


def upgrade() -> None:
    op.create_table(
        "task_partitions",
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("slug", sa.String(length=32), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name", name="uq_task_partitions_name"),
        sa.UniqueConstraint("slug", name="uq_task_partitions_slug"),
        schema="projects",
    )
    op.create_index(
        op.f("ix_projects_task_partitions_slug"),
        "task_partitions",
        ["slug"],
        unique=False,
        schema="projects",
    )

    partitions_table = sa.table(
        "task_partitions",
        sa.column("id", sa.UUID()),
        sa.column("name", sa.String()),
        sa.column("slug", sa.String()),
        sa.column("description", sa.String()),
        sa.column("display_order", sa.Integer()),
        schema="projects",
    )
    op.bulk_insert(
        partitions_table,
        [
            {
                "id": partition_id,
                "name": name,
                "slug": slug,
                "description": description,
                "display_order": display_order,
            }
            for partition_id, name, slug, description, display_order in PARTITIONS
        ],
    )

    # Normalize values that pre-date the managed vocabulary while preserving
    # every task. Projects that relied on the former UI fallback are explicitly
    # tagged as tech so they remain visible if another partition is deleted.
    op.execute(
        """
        UPDATE projects.tasks
        SET partition = CASE lower(partition)
            WHEN 'technical' THEN 'tech'
            WHEN 'platform' THEN 'tech'
            WHEN 'operations' THEN 'operations'
            WHEN 'operation' THEN 'operations'
            WHEN 'business' THEN 'business'
            WHEN 'marketing' THEN 'marketing'
            WHEN 'sales' THEN 'sales'
            WHEN 'design' THEN 'design'
            WHEN 'designs' THEN 'design'
            ELSE lower(partition)
        END
        WHERE partition IS NOT NULL
        """
    )
    op.execute(
        """
        UPDATE projects.projects
        SET tags = array_append(COALESCE(tags, ARRAY[]::varchar[]), 'partition:tech')
        WHERE NOT EXISTS (
            SELECT 1 FROM unnest(COALESCE(tags, ARRAY[]::varchar[])) AS tag
            WHERE tag LIKE 'partition:%'
        )
        """
    )

    op.execute(
        f"""
        INSERT INTO identity.permissions (id, code, description)
        VALUES ('{TASKS_ASSIGN_PERMISSION_ID}', 'tasks.assign', 'Assign or reassign task contributors')
        ON CONFLICT (code) DO NOTHING
        """
    )
    op.execute(
        """
        INSERT INTO identity.role_permissions (role_id, permission_id)
        SELECT role.id, permission.id
        FROM identity.roles AS role
        JOIN identity.permissions AS permission ON permission.code = 'tasks.assign'
        WHERE role.name IN ('SuperAdmin', 'CLevel', 'CompanyManager', 'ProjectManager', 'TeamLead')
        ON CONFLICT DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DELETE FROM identity.role_permissions
        WHERE permission_id IN (
            SELECT id FROM identity.permissions WHERE code = 'tasks.assign'
        )
        """
    )
    op.execute("DELETE FROM identity.permissions WHERE code = 'tasks.assign'")
    op.drop_index(op.f("ix_projects_task_partitions_slug"), table_name="task_partitions", schema="projects")
    op.drop_table("task_partitions", schema="projects")
