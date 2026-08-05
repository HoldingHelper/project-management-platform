"""ai project generation audit and provenance

Revision ID: e2f1a9b8c7d6
Revises: d8b2f4c6a9e1
Create Date: 2026-07-08
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "e2f1a9b8c7d6"
down_revision: Union[str, None] = "d8b2f4c6a9e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "generation_runs",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("triggered_by_user_id", sa.UUID(), nullable=False),
        sa.Column("existing_project_id", sa.UUID(), nullable=True),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="draft"),
        sa.Column("operation", sa.String(length=30), nullable=False, server_default="generate"),
        sa.Column("model", sa.String(length=80), nullable=True),
        sa.Column("prompt_storage_key", sa.String(length=500), nullable=True),
        sa.Column("summary_storage_key", sa.String(length=500), nullable=True),
        sa.Column("draft_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("change_set_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("resolved_assignees_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("metrics_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("validation_errors_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("resulting_project_id", sa.UUID(), nullable=True),
        sa.Column("resulting_task_ids", postgresql.ARRAY(sa.String()), nullable=False, server_default=sa.text("'{}'::text[]")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["existing_project_id"], ["projects.projects.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        schema="projects",
    )
    op.create_index(op.f("ix_projects_generation_runs_triggered_by_user_id"), "generation_runs", ["triggered_by_user_id"], unique=False, schema="projects")
    op.create_index(op.f("ix_projects_generation_runs_existing_project_id"), "generation_runs", ["existing_project_id"], unique=False, schema="projects")
    op.create_index(op.f("ix_projects_generation_runs_resulting_project_id"), "generation_runs", ["resulting_project_id"], unique=False, schema="projects")

    for table in ("projects", "tasks"):
        op.add_column(table, sa.Column("created_by", sa.String(length=20), nullable=False, server_default="manual"), schema="projects")
        op.add_column(table, sa.Column("last_modified_by", sa.String(length=20), nullable=False, server_default="manual"), schema="projects")
        op.add_column(table, sa.Column("generation_run_id", sa.UUID(), nullable=True), schema="projects")
        op.create_index(op.f(f"ix_projects_{table}_generation_run_id"), table, ["generation_run_id"], unique=False, schema="projects")
        op.create_foreign_key(
            f"fk_{table}_generation_run_id_generation_runs",
            table,
            "generation_runs",
            ["generation_run_id"],
            ["id"],
            source_schema="projects",
            referent_schema="projects",
            ondelete="SET NULL",
        )

    op.add_column("projects", sa.Column("ai_prompt_storage_key", sa.String(length=500), nullable=True), schema="projects")
    op.add_column("projects", sa.Column("ai_summary_storage_key", sa.String(length=500), nullable=True), schema="projects")


def downgrade() -> None:
    op.drop_column("projects", "ai_summary_storage_key", schema="projects")
    op.drop_column("projects", "ai_prompt_storage_key", schema="projects")
    for table in ("tasks", "projects"):
        op.drop_constraint(f"fk_{table}_generation_run_id_generation_runs", table, schema="projects", type_="foreignkey")
        op.drop_index(op.f(f"ix_projects_{table}_generation_run_id"), table_name=table, schema="projects")
        op.drop_column(table, "generation_run_id", schema="projects")
        op.drop_column(table, "last_modified_by", schema="projects")
        op.drop_column(table, "created_by", schema="projects")
    op.drop_index(op.f("ix_projects_generation_runs_resulting_project_id"), table_name="generation_runs", schema="projects")
    op.drop_index(op.f("ix_projects_generation_runs_existing_project_id"), table_name="generation_runs", schema="projects")
    op.drop_index(op.f("ix_projects_generation_runs_triggered_by_user_id"), table_name="generation_runs", schema="projects")
    op.drop_table("generation_runs", schema="projects")
