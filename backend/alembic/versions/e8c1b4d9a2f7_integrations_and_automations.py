"""integrations and automations schemas

Revision ID: e8c1b4d9a2f7
Revises: d5f9b2e8a1c3
Create Date: 2026-08-20
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "e8c1b4d9a2f7"
down_revision: Union[str, None] = "d5f9b2e8a1c3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute('CREATE SCHEMA IF NOT EXISTS "integrations"')
    op.execute('CREATE SCHEMA IF NOT EXISTS "automations"')
    uuid_type = postgresql.UUID(as_uuid=True)

    # 1. integrations.github_repos
    op.create_table(
        "github_repos",
        sa.Column("id", uuid_type, nullable=False),
        sa.Column("repo_owner", sa.String(length=100), nullable=False),
        sa.Column("repo_name", sa.String(length=100), nullable=False),
        sa.Column("default_project_id", uuid_type, nullable=True),
        sa.Column("default_phase_id", uuid_type, nullable=True),
        sa.Column("auto_create_tasks", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("auto_close_tasks_on_merge", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        schema="integrations",
    )
    op.create_index("ix_github_repos_owner_repo", "github_repos", ["repo_owner", "repo_name"], unique=True, schema="integrations")

    # 2. integrations.github_pull_requests
    op.create_table(
        "github_pull_requests",
        sa.Column("id", uuid_type, nullable=False),
        sa.Column("repo_owner", sa.String(length=100), nullable=False),
        sa.Column("repo_name", sa.String(length=100), nullable=False),
        sa.Column("pr_number", sa.Integer(), nullable=False),
        sa.Column("pr_title", sa.String(length=500), nullable=False),
        sa.Column("pr_url", sa.String(length=1000), nullable=False),
        sa.Column("pr_author", sa.String(length=100), nullable=False),
        sa.Column("pr_status", sa.String(length=32), server_default="open", nullable=False),
        sa.Column("task_id", uuid_type, nullable=False),
        sa.Column("merged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        schema="integrations",
    )
    op.create_index("ix_github_prs_repo_number", "github_pull_requests", ["repo_owner", "repo_name", "pr_number"], unique=True, schema="integrations")
    op.create_index("ix_github_prs_task_id", "github_pull_requests", ["task_id"], schema="integrations")

    # 3. integrations.whatsapp_users
    op.create_table(
        "whatsapp_users",
        sa.Column("user_id", uuid_type, nullable=False),
        sa.Column("phone_number", sa.String(length=32), nullable=False),
        sa.Column("notify_meetings", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("notify_mentions", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("notify_blockers", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("notify_dms", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("is_verified", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("user_id"),
        schema="integrations",
    )
    op.create_index("ix_whatsapp_users_phone", "whatsapp_users", ["phone_number"], schema="integrations")

    # 4. automations.rules
    op.create_table(
        "rules",
        sa.Column("id", uuid_type, nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column("trigger_type", sa.String(length=64), nullable=False),
        sa.Column("condition_json", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("action_type", sa.String(length=64), nullable=False),
        sa.Column("action_config", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_by_user_id", uuid_type, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        schema="automations",
    )
    op.create_index("ix_automations_rules_trigger", "rules", ["trigger_type", "is_active"], schema="automations")

    # 5. automations.execution_logs
    op.create_table(
        "execution_logs",
        sa.Column("id", uuid_type, nullable=False),
        sa.Column("rule_id", uuid_type, nullable=True),
        sa.Column("rule_name", sa.String(length=200), nullable=False),
        sa.Column("trigger_event", sa.String(length=64), nullable=False),
        sa.Column("payload_json", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("result_summary", sa.String(length=1000), nullable=False),
        sa.Column("executed_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        schema="automations",
    )
    op.create_index("ix_automations_logs_rule", "execution_logs", ["rule_id", "executed_at"], schema="automations")


def downgrade() -> None:
    op.drop_table("execution_logs", schema="automations")
    op.drop_table("rules", schema="automations")
    op.drop_table("whatsapp_users", schema="integrations")
    op.drop_table("github_pull_requests", schema="integrations")
    op.drop_table("github_repos", schema="integrations")
    op.execute('DROP SCHEMA IF EXISTS "automations" CASCADE')
    op.execute('DROP SCHEMA IF EXISTS "integrations" CASCADE')
