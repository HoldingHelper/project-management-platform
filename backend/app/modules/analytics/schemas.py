"""Pydantic schemas for the Analytics module."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class AuditLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    user_id: Optional[UUID] = None
    ip_address: Optional[str] = None
    entity_type: str
    entity_id: str
    action_type: str
    changes_json: str
    correlation_id: Optional[str] = None
    occurred_at: datetime


class ExecutiveDashboard(BaseModel):
    active_projects: int
    completed_projects: int
    delayed_projects: int
    blocked_projects: int
    department_progress: List[Dict[str, Any]]
    recent_activity: List[AuditLogRead]


class PersonalDashboard(BaseModel):
    upcoming_deadlines: List[Dict[str, Any]]
    late_tasks: List[Dict[str, Any]]
    velocity_points_completed: float
    hours_logged: float


class SeriesPoint(BaseModel):
    label: str  # ISO date or week start
    value: float


class VelocityReport(BaseModel):
    weeks: List[SeriesPoint]  # story points completed per week
    tasks_done: List[SeriesPoint]  # tasks completed per week


class BurndownReport(BaseModel):
    project_id: Optional[UUID] = None
    days: List[SeriesPoint]  # remaining open tasks per day


class CompletionTrends(BaseModel):
    created: List[SeriesPoint]
    completed: List[SeriesPoint]


class WorkloadRow(BaseModel):
    user_id: UUID
    open_tasks: int
    in_progress: int
    estimated_hours: float
    open_blockers: int


class ContributionRow(BaseModel):
    user_id: UUID
    status_changes: int
    tasks_completed: int


class HeatmapCell(BaseModel):
    user_id: UUID
    weekday: int  # 0=Mon
    count: int


class BottleneckItem(BaseModel):
    kind: str  # blocker | overdue_project | stale_task
    id: UUID
    title: str
    detail: str
    age_days: int
    # Routing context so the UI can deep-link to the exact entity:
    # - task_id: the task page to open (stale_task, and the blocker's task if known)
    # - project_id: the owning project (overdue_project sets id==project_id)
    task_id: UUID | None = None
    project_id: UUID | None = None


class ProjectHealthReport(BaseModel):
    active: int
    completed: int
    on_hold: int
    not_started: int
    delayed: List[Dict[str, Any]]
    blocked: List[Dict[str, Any]]
