"""Pydantic schemas for the Analytics module, including DORA, Flow Framework, and Predictability."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


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
    assigned_tasks_total: int
    open_tasks: int
    in_progress_tasks: int
    completed_tasks: int
    blocked_tasks: int
    attention_required_tasks: int
    unscheduled_open_tasks: int
    completion_rate_percent: float
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
    task_id: UUID | None = None
    project_id: UUID | None = None


class ProjectHealthReport(BaseModel):
    active: int
    completed: int
    on_hold: int
    not_started: int
    delayed: List[Dict[str, Any]]
    blocked: List[Dict[str, Any]]


# ============================================================================
# Enhanced KPI, DORA, Flow & Predictability Schemas
# ============================================================================

class DORAMetricItem(BaseModel):
    name: str
    value: float
    display_value: str
    unit: str
    rating: str  # "Elite" | "High" | "Medium" | "Low"
    benchmark: str
    trend_percentage: float = 0.0


class DORAMetricsReport(BaseModel):
    deployment_frequency: DORAMetricItem
    lead_time_for_changes: DORAMetricItem
    change_failure_rate: DORAMetricItem
    mean_time_to_recovery: DORAMetricItem
    overall_rating: str  # "Elite" | "High" | "Medium" | "Low"
    lead_time_breakdown_hours: Dict[str, float] = Field(default_factory=dict)  # {"coding": X, "review": Y, "deploy": Z}
    history: List[SeriesPoint] = Field(default_factory=list)


class FlowItemTypeDistribution(BaseModel):
    features_percent: float
    defects_percent: float
    tech_debt_percent: float
    infra_percent: float
    features_points: float
    defects_points: float
    tech_debt_points: float
    infra_points: float


class CategoryDistributionItem(BaseModel):
    category: str
    points: float
    percentage: float
    tasks_count: int
    active_projects: int = 0


class FlowMetricsReport(BaseModel):
    velocity_total_points: float
    velocity_tasks_completed: int
    velocity_by_type: FlowItemTypeDistribution
    category_distribution: List[CategoryDistributionItem]
    wip_active_tasks: int
    flow_load_status: str  # "Optimal" | "High" | "Overloaded"
    flow_efficiency_percentage: float  # (Active time / Lead time) * 100
    active_working_hours: float
    wait_hours: float


class CFDPoint(BaseModel):
    date: str  # YYYY-MM-DD
    backlog: int
    in_progress: int
    in_review: int
    done: int


class PredictabilityReport(BaseModel):
    predictability_score_percent: float
    on_time_delivery_rate_percent: float
    committed_points: float
    completed_points: float
    overdue_tasks_count: int
    on_schedule_tasks_count: int
    cfd_series: List[CFDPoint]


class KPIExecutiveSummary(BaseModel):
    headline: str
    velocity_trend: str
    bottlenecks_summary: str
    investment_mix_summary: str
    dora_performance_summary: str
    recommendations: List[str]


class EnhancedExecutiveKPIReport(BaseModel):
    range_days: int
    project_id: Optional[UUID] = None
    category: Optional[str] = None
    dora: DORAMetricsReport
    flow: FlowMetricsReport
    predictability: PredictabilityReport
    summary: KPIExecutiveSummary
