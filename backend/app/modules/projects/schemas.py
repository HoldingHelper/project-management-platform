"""Pydantic request/response schemas for the Projects module."""

from __future__ import annotations

from datetime import date, datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

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
    created_at: datetime
    updated_at: datetime


# ---------- Task ----------
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
    label_ids: List[UUID] = Field(default_factory=list)
    label_names: List[str] = Field(default_factory=list)
    checklist_items: List[ChecklistItemCreate] = Field(default_factory=list)


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    task_type: Optional[TaskType] = None
    priority: Optional[Priority] = None
    story_points: Optional[int] = None
    estimated_hours: Optional[float] = None
    actual_hours: Optional[float] = None
    reviewer_user_id: Optional[UUID] = None
    partition: Optional[str] = None
    start_date: Optional[date] = None
    due_date: Optional[date] = None
    assignee_user_ids: Optional[List[UUID]] = None


class UpdateTaskStatusRequest(BaseModel):
    status: TaskStatus


class UpdateChecklistItemRequest(BaseModel):
    is_done: bool


class AttachTaskRequest(BaseModel):
    """Attach a standalone task to a project phase (admin flow)."""

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
    current_phase: Optional[PhaseRead] = None
    members: List[ProjectMemberRead]
    milestones: List[MilestoneRead]
    task_stats: TaskStats
    open_blockers: int
    upcoming_deadlines: List[UpcomingDeadline]
