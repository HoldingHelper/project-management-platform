"""Projects module ORM models -- schema `projects`.

This is the core domain: Product -> Project -> Phase -> Task, plus the
TaskDependency edges that form the DAG used for critical-path scheduling.
Enums are stored as validated strings (CHECK constraints) rather than native
Postgres ENUM types to keep Alembic migrations additive-friendly.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import List, Optional

from sqlalchemy import (
    ARRAY,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.modules.projects.enums import (
    DependencyType,
    Environment,
    HealthStatus,
    PhaseStatus,
    PhaseType,
    Priority,
    ProductStatus,
    ProjectMemberRole,
    ProjectStatus,
    RiskLevel,
    TaskStatus,
    TaskType,
)
from app.shared.base_model import AuditableMixin, TimestampMixin, UUIDPKMixin

SCHEMA = "projects"


def _check(column: str, enum_cls) -> CheckConstraint:
    values = ", ".join(f"'{v.value}'" for v in enum_cls)
    return CheckConstraint(f"{column} IN ({values})", name=f"ck_{column}")


class TaskPartition(Base, UUIDPKMixin, TimestampMixin, AuditableMixin):
    """Administrator-managed task/project partition vocabulary.

    Tasks and project taxonomy tags keep the stable ``slug`` while admins can
    rename the human-facing label without rewriting every work item.
    """

    __tablename__ = "task_partitions"
    __table_args__ = (
        UniqueConstraint("name", name="uq_task_partitions_name"),
        UniqueConstraint("slug", name="uq_task_partitions_slug"),
        {"schema": SCHEMA},
    )

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    slug: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class Product(Base, UUIDPKMixin, TimestampMixin, AuditableMixin):
    __tablename__ = "products"
    __table_args__ = (
        _check("status", ProductStatus),
        _check("environment", Environment),
        _check("priority", Priority),
        {"schema": SCHEMA},
    )

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    owner_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    status: Mapped[str] = mapped_column(
        String(30), default=ProductStatus.PLANNING.value, nullable=False
    )
    technology_stack: Mapped[List[str]] = mapped_column(
        ARRAY(String), default=list, nullable=False
    )
    repository_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    documentation_link: Mapped[Optional[str]] = mapped_column(
        String(500), nullable=True
    )
    environment: Mapped[str] = mapped_column(
        String(30), default=Environment.DEVELOPMENT.value, nullable=False
    )
    priority: Mapped[str] = mapped_column(
        String(10), default=Priority.P2.value, nullable=False
    )

    projects: Mapped[List["Project"]] = relationship(
        back_populates="product", cascade="all, delete-orphan"
    )


class Project(Base, UUIDPKMixin, TimestampMixin, AuditableMixin):
    __tablename__ = "projects"
    __table_args__ = (
        _check("priority", Priority),
        _check("risk_level", RiskLevel),
        _check("health_status", HealthStatus),
        _check("status", ProjectStatus),
        {"schema": SCHEMA},
    )

    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.products.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    budget: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    priority: Mapped[str] = mapped_column(
        String(10), default=Priority.P2.value, nullable=False
    )
    risk_level: Mapped[str] = mapped_column(
        String(10), default=RiskLevel.MEDIUM.value, nullable=False
    )
    start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    estimated_completion_date: Mapped[Optional[date]] = mapped_column(
        Date, nullable=True
    )
    actual_completion_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    health_status: Mapped[str] = mapped_column(
        String(20), default=HealthStatus.ON_TRACK.value, nullable=False
    )
    status: Mapped[str] = mapped_column(
        String(20), default=ProjectStatus.NOT_STARTED.value, nullable=False
    )
    tags: Mapped[List[str]] = mapped_column(ARRAY(String), default=list, nullable=False)
    progress_percentage: Mapped[float] = mapped_column(
        Numeric(5, 2), default=0, nullable=False
    )
    created_by: Mapped[str] = mapped_column(
        String(20), default="manual", nullable=False
    )
    last_modified_by: Mapped[str] = mapped_column(
        String(20), default="manual", nullable=False
    )
    generation_run_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.generation_runs.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    ai_prompt_storage_key: Mapped[Optional[str]] = mapped_column(
        String(500), nullable=True
    )
    ai_summary_storage_key: Mapped[Optional[str]] = mapped_column(
        String(500), nullable=True
    )
    planning_mode: Mapped[str] = mapped_column(
        String(20), default="sprints", nullable=False
    )

    product: Mapped["Product"] = relationship(back_populates="projects")
    phases: Mapped[List["Phase"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    members: Mapped[List["ProjectMember"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )


class ProjectMember(Base, TimestampMixin):
    __tablename__ = "project_members"
    __table_args__ = (_check("role", ProjectMemberRole), {"schema": SCHEMA})

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.projects.id", ondelete="CASCADE"),
        primary_key=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    role: Mapped[str] = mapped_column(String(30), nullable=False)

    project: Mapped["Project"] = relationship(back_populates="members")


class Phase(Base, UUIDPKMixin, TimestampMixin, AuditableMixin):
    __tablename__ = "phases"
    __table_args__ = (
        _check("phase_type", PhaseType),
        _check("status", PhaseStatus),
        {"schema": SCHEMA},
    )

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    phase_type: Mapped[str] = mapped_column(
        String(30), default=PhaseType.DEVELOPMENT.value, nullable=False
    )
    sequence: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), default=PhaseStatus.NOT_STARTED.value, nullable=False
    )
    progress_percentage: Mapped[float] = mapped_column(
        Numeric(5, 2), default=0, nullable=False
    )
    lead_assignee_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    is_sprint: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    project: Mapped["Project"] = relationship(back_populates="phases")
    tasks: Mapped[List["TaskItem"]] = relationship(
        back_populates="phase", cascade="all, delete-orphan"
    )
    team_assignments: Mapped[List["PhaseTeamAssignment"]] = relationship(
        back_populates="phase", cascade="all, delete-orphan"
    )


class PhaseTeamAssignment(Base):
    __tablename__ = "phase_team_assignments"
    __table_args__ = {"schema": SCHEMA}

    phase_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.phases.id", ondelete="CASCADE"),
        primary_key=True,
    )
    team_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)

    phase: Mapped["Phase"] = relationship(back_populates="team_assignments")


class TaskItem(Base, UUIDPKMixin, TimestampMixin, AuditableMixin):
    __tablename__ = "tasks"
    __table_args__ = (
        _check("task_type", TaskType),
        _check("priority", Priority),
        _check("status", TaskStatus),
        UniqueConstraint("github_url", name="uq_tasks_github_url"),
        {"schema": SCHEMA},
    )

    # Nullable: imported / backlog tasks live outside any project until an
    # admin attaches them to a phase.
    phase_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.phases.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    parent_task_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.tasks.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    task_type: Mapped[str] = mapped_column(
        String(30), default=TaskType.FEATURE.value, nullable=False
    )
    priority: Mapped[str] = mapped_column(
        String(10), default=Priority.P2.value, nullable=False
    )
    status: Mapped[str] = mapped_column(
        String(20), default=TaskStatus.NOT_STARTED.value, nullable=False
    )
    board_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    story_points: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    estimated_hours: Mapped[Optional[float]] = mapped_column(
        Numeric(8, 2), nullable=True
    )
    actual_hours: Mapped[Optional[float]] = mapped_column(Numeric(8, 2), nullable=True)
    reviewer_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    github_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    partition: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Critical-path scheduling fields (recomputed by app.modules.projects.critical_path)
    earliest_start: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    earliest_finish: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    latest_start: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    latest_finish: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    total_slack: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    is_critical: Mapped[bool] = mapped_column(default=False, nullable=False)
    is_ticket: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    ticket_requested_by_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True, index=True
    )
    created_by: Mapped[str] = mapped_column(
        String(20), default="manual", nullable=False
    )
    last_modified_by: Mapped[str] = mapped_column(
        String(20), default="manual", nullable=False
    )
    generation_run_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.generation_runs.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    phase: Mapped["Phase"] = relationship(back_populates="tasks")
    subtasks: Mapped[List["TaskItem"]] = relationship(
        back_populates="parent_task", cascade="all, delete-orphan"
    )
    parent_task: Mapped[Optional["TaskItem"]] = relationship(
        remote_side="TaskItem.id", back_populates="subtasks"
    )
    assignees: Mapped[List["TaskAssignee"]] = relationship(
        back_populates="task", cascade="all, delete-orphan"
    )
    checklist_items: Mapped[List["ChecklistItem"]] = relationship(
        back_populates="task", cascade="all, delete-orphan"
    )
    label_assignments: Mapped[List["TaskLabelAssignment"]] = relationship(
        back_populates="task", cascade="all, delete-orphan"
    )


class TaskAssignee(Base):
    __tablename__ = "task_assignees"
    __table_args__ = {"schema": SCHEMA}

    task_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.tasks.id", ondelete="CASCADE"),
        primary_key=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)

    task: Mapped["TaskItem"] = relationship(back_populates="assignees")


class TaskLabel(Base, UUIDPKMixin):
    __tablename__ = "task_labels"
    __table_args__ = (
        UniqueConstraint("name", name="uq_task_labels_name"),
        {"schema": SCHEMA},
    )

    name: Mapped[str] = mapped_column(String(60), nullable=False)
    color: Mapped[str] = mapped_column(String(20), default="#6B7684", nullable=False)


class TaskLabelAssignment(Base):
    __tablename__ = "task_label_assignments"
    __table_args__ = {"schema": SCHEMA}

    task_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.tasks.id", ondelete="CASCADE"),
        primary_key=True,
    )
    label_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.task_labels.id", ondelete="CASCADE"),
        primary_key=True,
    )

    task: Mapped["TaskItem"] = relationship(back_populates="label_assignments")
    label: Mapped["TaskLabel"] = relationship()


class ChecklistItem(Base, UUIDPKMixin):
    __tablename__ = "checklist_items"
    __table_args__ = {"schema": SCHEMA}

    task_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.tasks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    text: Mapped[str] = mapped_column(String(500), nullable=False)
    is_done: Mapped[bool] = mapped_column(default=False, nullable=False)
    order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    task: Mapped["TaskItem"] = relationship(back_populates="checklist_items")


class Milestone(Base, UUIDPKMixin, TimestampMixin, AuditableMixin):
    __tablename__ = "milestones"
    __table_args__ = {"schema": SCHEMA}

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    sequence: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False
    )


class ProjectDependency(Base, UUIDPKMixin, TimestampMixin):
    """Cross-project dependency edge for the portfolio-level Gantt."""

    __tablename__ = "project_dependencies"
    __table_args__ = (
        _check("dependency_type", DependencyType),
        UniqueConstraint(
            "predecessor_project_id",
            "successor_project_id",
            name="uq_project_dependency_pair",
        ),
        {"schema": SCHEMA},
    )

    predecessor_project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    successor_project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    dependency_type: Mapped[str] = mapped_column(
        String(30), default=DependencyType.FINISH_TO_START.value, nullable=False
    )
    lag_days: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class TaskStatusTransition(Base, UUIDPKMixin):
    """Append-only status history powering burndown/velocity/CFD analytics.
    Written by the task service on every status change; never updated."""

    __tablename__ = "task_status_transitions"
    __table_args__ = {"schema": SCHEMA}

    task_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.tasks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    from_status: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    to_status: Mapped[str] = mapped_column(String(20), nullable=False)
    changed_by_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )


class TaskDependency(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "task_dependencies"
    __table_args__ = (
        _check("dependency_type", DependencyType),
        UniqueConstraint(
            "predecessor_task_id", "successor_task_id", name="uq_task_dependency_pair"
        ),
        {"schema": SCHEMA},
    )

    predecessor_task_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.tasks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    successor_task_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.tasks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    dependency_type: Mapped[str] = mapped_column(
        String(30), default=DependencyType.FINISH_TO_START.value, nullable=False
    )
    lag_days: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class GenerationRun(Base, UUIDPKMixin, TimestampMixin):
    """Audit record for one AI project/task generation workflow run."""

    __tablename__ = "generation_runs"
    __table_args__ = {"schema": SCHEMA}

    triggered_by_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    existing_project_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.projects.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    status: Mapped[str] = mapped_column(String(30), default="draft", nullable=False)
    operation: Mapped[str] = mapped_column(
        String(30), default="generate", nullable=False
    )
    model: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    input_storage_key: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    input_filename: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    prompt_storage_key: Mapped[Optional[str]] = mapped_column(
        String(500), nullable=True
    )
    summary_storage_key: Mapped[Optional[str]] = mapped_column(
        String(500), nullable=True
    )
    draft_json: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    change_set_json: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    resolved_assignees_json: Mapped[dict] = mapped_column(
        JSONB, default=dict, nullable=False
    )
    metrics_json: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    validation_errors_json: Mapped[list] = mapped_column(
        JSONB, default=list, nullable=False
    )
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    resulting_project_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True, index=True
    )
    resulting_task_ids: Mapped[List[str]] = mapped_column(
        ARRAY(String), default=list, nullable=False
    )
