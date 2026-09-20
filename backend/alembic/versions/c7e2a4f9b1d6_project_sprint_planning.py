"""Add sprint planning compatibility markers.

Revision ID: c7e2a4f9b1d6
Revises: a9c4e7f2b6d1
"""

from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "c7e2a4f9b1d6"
down_revision: Union[str, None] = "a9c4e7f2b6d1"
branch_labels: Union[str, tuple[str, ...], None] = None
depends_on: Union[str, tuple[str, ...], None] = None


def upgrade() -> None:
    op.add_column(
        "projects",
        sa.Column(
            "planning_mode",
            sa.String(length=20),
            nullable=False,
            server_default="legacy",
        ),
        schema="projects",
    )
    op.add_column(
        "phases",
        sa.Column(
            "is_sprint",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        schema="projects",
    )

    # Existing records remain readable as legacy plans. New ORM writes use the
    # sprint defaults after this migration.
    op.alter_column(
        "projects", "planning_mode", server_default="sprints", schema="projects"
    )
    op.alter_column(
        "phases", "is_sprint", server_default=sa.true(), schema="projects"
    )

    # Correct obviously active legacy projects without overriding terminal or
    # deliberately paused states.
    op.execute(
        """
        UPDATE projects.projects AS project
        SET status = 'in-progress'
        WHERE project.status = 'not-started'
          AND (
            project.progress_percentage > 0
            OR (project.start_date IS NOT NULL AND project.start_date <= CURRENT_DATE)
            OR EXISTS (
              SELECT 1
              FROM projects.phases AS phase
              JOIN projects.tasks AS task ON task.phase_id = phase.id
              WHERE phase.project_id = project.id
                AND task.status NOT IN ('NotStarted', 'Ready', 'Cancelled', 'Archived')
            )
          )
        """
    )


def downgrade() -> None:
    op.drop_column("phases", "is_sprint", schema="projects")
    op.drop_column("projects", "planning_mode", schema="projects")
