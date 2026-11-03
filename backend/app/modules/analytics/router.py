"""Analytics module REST endpoints."""

from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.current_user import CurrentUser
from app.core.database import get_db
from app.core.deps import get_current_user, require_permission
from app.core.exporting import maybe_export
from app.core.permissions import Permissions
from app.modules.analytics import service
from app.modules.analytics.schemas import (
    AuditLogRead,
    BottleneckItem,
    BurndownReport,
    CompletionTrends,
    ContributionRow,
    DORAMetricsReport,
    EnhancedExecutiveKPIReport,
    ExecutiveDashboard,
    FlowMetricsReport,
    HeatmapCell,
    PersonalDashboard,
    PredictabilityReport,
    ProjectHealthReport,
    VelocityReport,
    WorkloadRow,
)

router = APIRouter(prefix="/analytics", tags=["Analytics"])

_view_analytics = require_permission(
    Permissions.ANALYTICS_VIEW_ORG, Permissions.REPORTS_VIEW_EXECUTIVE
)
_fmt = Query(default=None, pattern="^(csv|xlsx)$")


@router.get("/executive-dashboard", response_model=ExecutiveDashboard)
async def get_executive_dashboard(
    current_user: CurrentUser = Depends(
        require_permission(Permissions.REPORTS_VIEW_EXECUTIVE)
    ),
    db: AsyncSession = Depends(get_db),
) -> ExecutiveDashboard:
    return await service.get_executive_dashboard(db)


@router.get("/personal-dashboard", response_model=PersonalDashboard)
async def get_personal_dashboard(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PersonalDashboard:
    return await service.get_personal_dashboard(db, current_user.user_id)


@router.get("/audit-logs", response_model=list[AuditLogRead])
async def list_audit_logs(
    limit: int = Query(default=50, ge=1, le=500),
    current_user: CurrentUser = Depends(
        require_permission(Permissions.VIEW_AUDIT_LOGS)
    ),
    db: AsyncSession = Depends(get_db),
) -> list[AuditLogRead]:
    return await service.list_recent_audit_logs(db, limit)


@router.get("/velocity", response_model=None)
async def get_velocity(
    weeks: int = Query(default=8, ge=2, le=52),
    project_id: Optional[UUID] = Query(default=None),
    format: Optional[str] = _fmt,
    current_user: CurrentUser = Depends(_view_analytics),
    db: AsyncSession = Depends(get_db),
):
    report = await service.get_velocity(db, weeks=weeks, project_id=project_id)
    rows = [
        {"week": w.label, "story_points": w.value, "tasks_done": t.value}
        for w, t in zip(report.weeks, report.tasks_done)
    ]
    return maybe_export(rows, format, "velocity") or report


@router.get("/burndown", response_model=None)
async def get_burndown(
    days: int = Query(default=30, ge=7, le=180),
    project_id: Optional[UUID] = Query(default=None),
    format: Optional[str] = _fmt,
    current_user: CurrentUser = Depends(_view_analytics),
    db: AsyncSession = Depends(get_db),
):
    report = await service.get_burndown(db, days=days, project_id=project_id)
    rows = [{"date": p.label, "open_tasks": p.value} for p in report.days]
    return maybe_export(rows, format, "burndown") or report


@router.get("/completion-trends", response_model=None)
async def get_completion_trends(
    weeks: int = Query(default=12, ge=2, le=52),
    project_id: Optional[UUID] = Query(default=None),
    format: Optional[str] = _fmt,
    current_user: CurrentUser = Depends(_view_analytics),
    db: AsyncSession = Depends(get_db),
):
    report = await service.get_completion_trends(db, weeks=weeks, project_id=project_id)
    rows = [
        {"week": c.label, "created": c.value, "completed": d.value}
        for c, d in zip(report.created, report.completed)
    ]
    return maybe_export(rows, format, "completion-trends") or report


@router.get("/workload", response_model=None)
async def get_workload(
    partition: Optional[str] = Query(default=None),
    format: Optional[str] = _fmt,
    current_user: CurrentUser = Depends(_view_analytics),
    db: AsyncSession = Depends(get_db),
):
    report = await service.get_workload(db, partition=partition)
    rows = [r.model_dump(mode="json") for r in report]
    return maybe_export(rows, format, "workload") or report


@router.get("/contributions", response_model=None)
async def get_contributions(
    weeks: int = Query(default=4, ge=1, le=52),
    format: Optional[str] = _fmt,
    current_user: CurrentUser = Depends(_view_analytics),
    db: AsyncSession = Depends(get_db),
):
    report = await service.get_contributions(db, weeks=weeks)
    rows = [r.model_dump(mode="json") for r in report]
    return maybe_export(rows, format, "contributions") or report


@router.get("/heatmap", response_model=list[HeatmapCell])
async def get_heatmap(
    weeks: int = Query(default=4, ge=1, le=52),
    current_user: CurrentUser = Depends(_view_analytics),
    db: AsyncSession = Depends(get_db),
) -> list[HeatmapCell]:
    return await service.get_heatmap(db, weeks=weeks)


@router.get("/bottlenecks", response_model=None)
async def get_bottlenecks(
    project_id: Optional[UUID] = Query(default=None),
    format: Optional[str] = _fmt,
    current_user: CurrentUser = Depends(_view_analytics),
    db: AsyncSession = Depends(get_db),
):
    report = await service.get_bottlenecks(db, project_id=project_id)
    rows = [r.model_dump(mode="json") for r in report]
    return maybe_export(rows, format, "bottlenecks") or report


@router.get("/project-health", response_model=ProjectHealthReport)
async def get_project_health(
    current_user: CurrentUser = Depends(_view_analytics),
    db: AsyncSession = Depends(get_db),
) -> ProjectHealthReport:
    return await service.get_project_health(db)


search_router = APIRouter(tags=["Search"])


@search_router.get("/search", response_model=dict)
async def global_search(
    q: str = Query(min_length=2, max_length=100),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Pragmatic cross-module search for the header search box."""
    from app.modules.identity.service import list_users as list_users_service
    from app.modules.projects.service import list_all_projects as _projects
    from app.modules.projects.service import list_tasks as _tasks

    tasks, _total = await _tasks(
        db, search=q, page=1, page_size=10, current_user=current_user
    )
    projects, _t2 = await _projects(
        db, page=1, page_size=200, current_user=current_user
    )
    users, _t3 = await list_users_service(db, search=q, page=1, page_size=10)
    ql = q.lower()

    can_see_emails = current_user.is_super_admin() or current_user.has_any_permission(
        Permissions.MANAGE_USERS, Permissions.USERS_VIEW
    )
    users_list = []
    for u in users:
        u_data = {"id": str(u.id), "name": u.full_name}
        if can_see_emails:
            u_data["email"] = u.email
        users_list.append(u_data)

    return {
        "tasks": [
            {"id": str(t.id), "title": t.title, "status": t.status} for t in tasks
        ],
        "projects": [
            {"id": str(p.id), "name": p.name, "status": p.status}
            for p in projects
            if ql in p.name.lower()
        ][:10],
        "users": users_list,
    }


@router.post("/planning/uploads", response_model=None, status_code=501)
async def upload_long_term_planning(
    current_user: CurrentUser = Depends(
        require_permission(Permissions.PLANNING_UPLOAD)
    ),
) -> dict:
    """Future-ready stub: executive long-term planning (Excel) upload."""
    raise HTTPException(
        status_code=501,
        detail="Long-term planning upload is planned but not implemented yet.",
    )


# --- Enhanced KPI, DORA, Flow & Predictability Endpoints --------------------

@router.get("/kpis/dora", response_model=DORAMetricsReport)
async def get_dora_kpis(
    range_days: int = Query(default=30, ge=7, le=365),
    project_id: Optional[UUID] = Query(default=None),
    current_user: CurrentUser = Depends(_view_analytics),
    db: AsyncSession = Depends(get_db),
) -> DORAMetricsReport:
    """Return Google Cloud DORA metrics (Deployment Frequency, Lead Time, CFR, MTTR)."""
    return await service.get_dora_metrics(
        db, range_days=range_days, project_id=project_id
    )


@router.get("/kpis/flow", response_model=FlowMetricsReport)
async def get_flow_kpis(
    range_days: int = Query(default=30, ge=7, le=365),
    project_id: Optional[UUID] = Query(default=None),
    current_user: CurrentUser = Depends(_view_analytics),
    db: AsyncSession = Depends(get_db),
) -> FlowMetricsReport:
    """Return Flow Framework value stream metrics (Velocity by Type, Investment Distribution, Load, Efficiency)."""
    return await service.get_flow_metrics(
        db, range_days=range_days, project_id=project_id
    )


@router.get("/kpis/predictability", response_model=PredictabilityReport)
async def get_predictability_kpis(
    range_days: int = Query(default=30, ge=7, le=365),
    project_id: Optional[UUID] = Query(default=None),
    current_user: CurrentUser = Depends(_view_analytics),
    db: AsyncSession = Depends(get_db),
) -> PredictabilityReport:
    """Return project predictability score, on-time delivery rate, and Cumulative Flow Diagram (CFD)."""
    return await service.get_predictability_and_cfd(
        db, range_days=range_days, project_id=project_id
    )


@router.get("/kpis/executive-summary", response_model=EnhancedExecutiveKPIReport)
async def get_enhanced_kpi_summary(
    range_days: int = Query(default=30, ge=7, le=365),
    project_id: Optional[UUID] = Query(default=None),
    category: Optional[str] = Query(default=None),
    current_user: CurrentUser = Depends(_view_analytics),
    db: AsyncSession = Depends(get_db),
) -> EnhancedExecutiveKPIReport:
    """Return consolidated executive KPI dashboard with DORA, Flow, Predictability, and AI Executive Insights."""
    return await service.get_enhanced_kpi_dashboard(
        db, range_days=range_days, project_id=project_id, category=category
    )
