"""Pydantic request/response schemas for the Projects module."""

from __future__ import annotations

from datetime import date, datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

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


# ---------- Product ----------
class ProductCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: Optional[str] = None
    owner_user_id: UUID
    status: ProductStatus = ProductStatus.PLANNING
    technology_stack: List[str] = Field(default_factory=list)
    repository_url: Optional[str] = None
    documentation_link: Optional[str] = None
    environment: Environment = Environment.DEVELOPMENT
    priority: Priority = Priority.P2


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[ProductStatus] = None
    technology_stack: Optional[List[str]] = None
    repository_url: Optional[str] = None
    documentation_link: Optional[str] = None
    environment: Optional[Environment] = None
    priority: Optional[Priority] = None


class ProductRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    description: Optional[str] = None
    owner_user_id: UUID
    status: str
    technology_stack: List[str]
    repository_url: Optional[str] = None
    documentation_link: Optional[str] = None
    environment: str
    priority: str
    created_at: datetime
    updated_at: datetime


# ---------- Project ----------
class ProjectSprintCreate(BaseModel):
    """A new delivery sprint. Sprint dates are inclusive and span 14 days."""

    name: str = Field(min_length=1, max_length=200)
    start_date: date
    end_date: date
    lead_assignee_user_id: Optional[UUID] = None

    @model_validator(mode="after")
    def validate_two_week_window(self) -> "ProjectSprintCreate":
        if (self.end_date - self.start_date).days != 13:
            raise ValueError("A sprint must span exactly 14 calendar days.")
        return self


class ProjectCreate(BaseModel):
    product_id: UUID
    name: str = Field(min_length=1, max_length=200)
    description: Optional[str] = None
    budget: Optional[float] = None
    priority: Priority = Priority.P2
    risk_level: RiskLevel = RiskLevel.MEDIUM
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    estimated_completion_date: Optional[date] = None
    actual_completion_date: Optional[date] = None
    health_status: HealthStatus = HealthStatus.ON_TRACK
    status: ProjectStatus = ProjectStatus.NOT_STARTED
    tags: List[str] = Field(default_factory=list)
    sprints: List[ProjectSprintCreate] = Field(default_factory=list, max_length=52)

    @model_validator(mode="after")
    def validate_project_dates(self) -> "ProjectCreate":
        if (self.start_date is None) != (self.end_date is None):
            raise ValueError("Project start and end dates must be set together.")
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("Project end date cannot be before its start date.")
        if self.actual_completion_date and not (self.start_date and self.end_date):
            raise ValueError(
                "Actual end date requires planned project start and end dates."
            )
        return self


class ProjectUpdate(BaseModel):
    product_id: Optional[UUID] = None
    name: Optional[str] = None
    description: Optional[str] = None
    budget: Optional[float] = None
    priority: Optional[Priority] = None
    risk_level: Optional[RiskLevel] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    estimated_completion_date: Optional[date] = None
    actual_completion_date: Optional[date] = None
    health_status: Optional[HealthStatus] = None
    status: Optional[ProjectStatus] = None
    tags: Optional[List[str]] = None


class ProjectRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    product_id: UUID
    name: str
    description: Optional[str] = None
    budget: Optional[float] = None
    priority: str
    risk_level: str
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    estimated_completion_date: Optional[date] = None
    actual_completion_date: Optional[date] = None
    health_status: str
    status: str
    tags: List[str]
    progress_percentage: float
    created_by: str = "manual"
    last_modified_by: str = "manual"
    generation_run_id: Optional[UUID] = None
    ai_prompt_storage_key: Optional[str] = None
    ai_summary_storage_key: Optional[str] = None
    planning_mode: str = "sprints"
    created_at: datetime
    updated_at: datetime


class ProjectSummary(BaseModel):
    """Cross-module contract (mirrors `ProjectSummaryDto`)."""

    project_id: UUID
    name: str
    product_id: UUID
    health_status: str
    progress_percentage: float


class ProjectMemberCreate(BaseModel):
    user_id: UUID
    role: ProjectMemberRole


class ProjectMemberRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    project_id: UUID
    user_id: UUID
    role: str


class ProjectAdminTransfer(BaseModel):
    new_admin_user_id: UUID
    previous_admin_role: ProjectMemberRole = ProjectMemberRole.TEAM_LEAD

    @model_validator(mode="after")
    def validate_previous_admin_role(self) -> "ProjectAdminTransfer":
        if self.previous_admin_role == ProjectMemberRole.PROJECT_MANAGER:
            raise ValueError("Previous project admins must receive a non-admin role.")
        return self


# ---------- Phase ----------
class PhaseCreate(BaseModel):
    project_id: UUID
    name: str = Field(min_length=1, max_length=200)
    phase_type: PhaseType = PhaseType.DEVELOPMENT
    sequence: int = 0
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    lead_assignee_user_id: Optional[UUID] = None
    team_ids: List[UUID] = Field(default_factory=list)


class PhaseUpdate(BaseModel):
    name: Optional[str] = None
    phase_type: Optional[PhaseType] = None
    sequence: Optional[int] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    status: Optional[PhaseStatus] = None
    lead_assignee_user_id: Optional[UUID] = None


class PhaseRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    project_id: UUID
    name: str
    phase_type: str
    sequence: int
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    status: str
    progress_percentage: float
    lead_assignee_user_id: Optional[UUID] = None
    is_sprint: bool = True
    created_at: datetime
    updated_at: datetime


# ---------- Task ----------
class TaskPartitionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=500)
    display_order: int = Field(default=0, ge=0, le=10_000)


class TaskPartitionUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=500)
    display_order: Optional[int] = Field(default=None, ge=0, le=10_000)


class TaskPartitionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    slug: str
    description: Optional[str] = None
    display_order: int
    task_count: int = 0
    project_count: int = 0
    created_at: datetime
    updated_at: datetime


class ChecklistItemCreate(BaseModel):
    text: str = Field(min_length=1, max_length=500)
    order: int = 0


class ChecklistItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    text: str
    is_done: bool
    order: int


class TaskCreate(BaseModel):
    # None = standalone/backlog task not yet attached to any project phase.
    phase_id: Optional[UUID] = None
    parent_task_id: Optional[UUID] = None
    title: str = Field(min_length=1, max_length=300)
    description: Optional[str] = None
    task_type: TaskType = TaskType.FEATURE
    priority: Priority = Priority.P2
    status: Optional[TaskStatus] = None
    story_points: Optional[int] = Field(default=None, ge=0)
    estimated_hours: Optional[float] = Field(default=None, ge=0)
    reviewer_user_id: Optional[UUID] = None
    github_url: Optional[str] = Field(default=None, max_length=512)
    partition: Optional[str] = Field(default=None, max_length=32)
    start_date: Optional[date] = None
    due_date: Optional[date] = None
    assignee_user_ids: List[UUID] = Field(default_factory=list)
    is_ticket: bool = False
    ticket_recipient_user_ids: List[UUID] = Field(default_factory=list)
    ticket_recipient_team_ids: List[UUID] = Field(default_factory=list)
    label_ids: List[UUID] = Field(default_factory=list)
    label_names: List[str] = Field(default_factory=list, max_length=20)
    checklist_items: List[ChecklistItemCreate] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_task_create(self) -> "TaskCreate":
        if self.start_date and self.due_date and self.start_date > self.due_date:
            raise ValueError("Task start_date cannot be after due_date.")
        if self.github_url:
            url = self.github_url.strip()
            if not url.startswith("https://"):
                raise ValueError("github_url must start with https://")
        return self


class TaskUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=300)
    description: Optional[str] = None
    task_type: Optional[TaskType] = None
    priority: Optional[Priority] = None
    story_points: Optional[int] = Field(default=None, ge=0)
    estimated_hours: Optional[float] = Field(default=None, ge=0)
    actual_hours: Optional[float] = Field(default=None, ge=0)
    reviewer_user_id: Optional[UUID] = None
    github_url: Optional[str] = Field(default=None, max_length=512)
    partition: Optional[str] = Field(default=None, max_length=32)
    start_date: Optional[date] = None
    due_date: Optional[date] = None
    assignee_user_ids: Optional[List[UUID]] = None
    label_ids: Optional[List[UUID]] = None
    label_names: Optional[List[str]] = Field(default=None, max_length=20)
    checklist_items: Optional[List[ChecklistItemCreate]] = None

    @model_validator(mode="after")
    def validate_task_update(self) -> "TaskUpdate":
        if self.start_date and self.due_date and self.start_date > self.due_date:
            raise ValueError("Task start_date cannot be after due_date.")
        if self.github_url:
            url = self.github_url.strip()
            if not url.startswith("https://"):
                raise ValueError("github_url must start with https://")
        return self


class UpdateTaskStatusRequest(BaseModel):
    status: TaskStatus


class ReorderTasksRequest(BaseModel):
    task_ids: List[UUID] = Field(min_length=1, max_length=500)


class UpdateChecklistItemRequest(BaseModel):
    is_done: bool


class AttachTaskRequest(BaseModel):
    """Attach a standalone task to a project sprint (legacy field name)."""

    phase_id: UUID


class TaskRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    phase_id: Optional[UUID] = None
    parent_task_id: Optional[UUID] = None
    title: str
    description: Optional[str] = None
    task_type: str
    priority: str
    status: str
    board_order: int = 0
    story_points: Optional[int] = None
    estimated_hours: Optional[float] = None
    actual_hours: Optional[float] = None
    reviewer_user_id: Optional[UUID] = None
    github_url: Optional[str] = None
    partition: Optional[str] = None
    start_date: Optional[date] = None
    due_date: Optional[date] = None
    completed_at: Optional[datetime] = None
    assignee_user_ids: List[UUID] = Field(default_factory=list)
    labels: List[str] = Field(default_factory=list)
    checklist_items: List[ChecklistItemRead] = Field(default_factory=list)
    earliest_start: Optional[float] = None
    earliest_finish: Optional[float] = None
    latest_start: Optional[float] = None
    latest_finish: Optional[float] = None
    total_slack: Optional[float] = None
    is_critical: bool = False
    is_ticket: bool = False
    ticket_requested_by_user_id: Optional[UUID] = None
    created_by: str = "manual"
    last_modified_by: str = "manual"
    generation_run_id: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime


class TaskSummary(BaseModel):
    """Cross-module contract (mirrors `TaskSummaryDto`)."""

    task_id: UUID
    title: str
    phase_id: Optional[UUID] = None
    project_id: Optional[UUID] = None
    status: str
    assignee_user_ids: List[UUID]


# ---------- Dependencies ----------
class TaskDependencyCreate(BaseModel):
    predecessor_task_id: UUID
    successor_task_id: UUID
    dependency_type: DependencyType = DependencyType.FINISH_TO_START
    lag_days: int = 0


class TaskDependencyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    predecessor_task_id: UUID
    successor_task_id: UUID
    dependency_type: str
    lag_days: int


# ---------- Gantt / Timeline ----------
class GanttTaskRow(BaseModel):
    id: UUID
    text: str
    start_date: Optional[date]
    due_date: Optional[date] = None
    duration_days: float
    progress: float
    parent: Optional[UUID] = None
    status: str
    is_critical: bool
    done_late: bool = False


class GanttLinkRow(BaseModel):
    id: str
    source: UUID
    target: UUID
    type: str


class ProjectTimeline(BaseModel):
    project_id: UUID
    tasks: List[GanttTaskRow]
    links: List[GanttLinkRow]


class ProgressBreakdown(BaseModel):
    completed: float
    in_progress: float
    blocked: float
    overdue: float
    pending: float
    percentage: float
    blocks: str


# ---------- Milestones ----------
class MilestoneCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: Optional[str] = None
    due_date: Optional[date] = None
    sequence: int = 0


class MilestoneUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    due_date: Optional[date] = None
    sequence: Optional[int] = None
    completed: Optional[bool] = None


class MilestoneRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    project_id: UUID
    name: str
    description: Optional[str] = None
    due_date: Optional[date] = None
    completed_at: Optional[datetime] = None
    sequence: int
    created_by_user_id: UUID
    created_at: datetime


# ---------- Project dependencies ----------
class ProjectDependencyCreate(BaseModel):
    predecessor_project_id: UUID
    successor_project_id: UUID
    dependency_type: DependencyType = DependencyType.FINISH_TO_START
    lag_days: int = 0


class ProjectDependencyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    predecessor_project_id: UUID
    successor_project_id: UUID
    dependency_type: str
    lag_days: int


# ---------- Portfolio Gantt ----------
class PortfolioGanttProject(BaseModel):
    id: UUID
    product_id: UUID
    name: str
    status: str
    health_status: str
    priority: str
    progress_percentage: float
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    current_phase: Optional[str] = None
    current_sprint: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    milestones: List[MilestoneRead] = Field(default_factory=list)


class PortfolioGantt(BaseModel):
    projects: List[PortfolioGanttProject]
    links: List[ProjectDependencyRead]


# ---------- Project overview aggregate ----------
class TaskStats(BaseModel):
    total: int
    done: int
    in_progress: int
    blocked: int
    overdue: int
    unassigned: int


class UpcomingDeadline(BaseModel):
    task_id: UUID
    title: str
    due_date: date
    status: str
    assignee_user_ids: List[UUID] = Field(default_factory=list)


class ProjectOverview(BaseModel):
    project: ProjectRead
    phases: List[PhaseRead]
    sprints: List[PhaseRead]
    current_phase: Optional[PhaseRead] = None
    current_sprint: Optional[PhaseRead] = None
    members: List[ProjectMemberRead]
    milestones: List[MilestoneRead]
    task_stats: TaskStats
    open_blockers: int
    upcoming_deadlines: List[UpcomingDeadline]
