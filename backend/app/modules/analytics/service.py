"""Analytics module business logic: audit log queries and the Executive /
Personal dashboard aggregations. Cross-module data is pulled via direct
in-process calls into each owning module's `service` layer (never via direct
SQL against another module's schema, per the modular-monolith rule)."""

from __future__ import annotations

from datetime import date, timedelta
from typing import List
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.analytics import repository as repo
from app.modules.analytics.schemas import (
    AuditLogRead,
    BottleneckItem,
    BurndownReport,
    CompletionTrends,
    ContributionRow,
    ExecutiveDashboard,
    HeatmapCell,
    PersonalDashboard,
    ProjectHealthReport,
    SeriesPoint,
    VelocityReport,
    WorkloadRow,
)
from app.modules.projects import repository as projects_repo
from app.modules.projects.enums import HealthStatus, TaskStatus
from app.modules.projects.service import (
    get_all_tasks_snapshot,
    get_status_transitions,
    list_all_projects,
)

DONE_STATUSES = {"Done", "Archived"}
OPEN_EXCLUDED = {"Done", "Archived", "Cancelled"}


def _week_start(d: date) -> date:
    return d - timedelta(days=d.weekday())


async def list_recent_audit_logs(
    db: AsyncSession, limit: int = 20
) -> List[AuditLogRead]:
    logs = await repo.list_recent_audit_logs(db, limit)
    return [AuditLogRead.model_validate(entry) for entry in logs]


async def list_audit_logs_for_entity(
    db: AsyncSession, entity_type: str, entity_id: str
) -> List[AuditLogRead]:
    logs = await repo.list_audit_logs_for_entity(db, entity_type, entity_id)
    return [AuditLogRead.model_validate(entry) for entry in logs]


async def get_executive_dashboard(db: AsyncSession) -> ExecutiveDashboard:
    projects, _ = await list_all_projects(db, page=1, page_size=1000)

    active = sum(1 for p in projects if p.status == "in-progress")
    completed = sum(1 for p in projects if p.status == "completed")
    delayed = sum(1 for p in projects if p.health_status == HealthStatus.DELAYED.value)
    blocked = sum(1 for p in projects if p.health_status == HealthStatus.BLOCKED.value)

    department_progress: List[dict] = []
    recent_activity = await list_recent_audit_logs(db, limit=15)

    return ExecutiveDashboard(
        active_projects=active,
        completed_projects=completed,
        delayed_projects=delayed,
        blocked_projects=blocked,
        department_progress=department_progress,
        recent_activity=recent_activity,
    )


async def get_velocity(
    db: AsyncSession, *, weeks: int = 8, project_id: UUID | None = None
) -> VelocityReport:
    since = date.today() - timedelta(weeks=weeks)
    transitions = await get_status_transitions(db, since=None, project_id=project_id)
    tasks = {t.id: t for t in await get_all_tasks_snapshot(db)}

    points: dict[date, float] = {}
    counts: dict[date, float] = {}
    for tr in transitions:
        if tr["to_status"] not in DONE_STATUSES:
            continue
        day = tr["changed_at"].date()
        if day < since:
            continue
        week = _week_start(day)
        task = tasks.get(tr["task_id"])
        points[week] = points.get(week, 0) + float(task.story_points or 1 if task else 1)
        counts[week] = counts.get(week, 0) + 1

    weeks_axis = [_week_start(date.today()) - timedelta(weeks=i) for i in range(weeks - 1, -1, -1)]
    return VelocityReport(
        weeks=[SeriesPoint(label=w.isoformat(), value=points.get(w, 0)) for w in weeks_axis],
        tasks_done=[SeriesPoint(label=w.isoformat(), value=counts.get(w, 0)) for w in weeks_axis],
    )


async def get_burndown(
    db: AsyncSession, *, days: int = 30, project_id: UUID | None = None
) -> BurndownReport:
    """Remaining-open-task count per day, reconstructed from the transition log."""
    transitions = await get_status_transitions(db, project_id=project_id)
    start = date.today() - timedelta(days=days - 1)

    # State per task over time: created (first transition) opens it; Done/
    # Cancelled/Archived closes it; reopening reopens it.
    events: list[tuple[date, int]] = []
    open_before_start = 0
    task_state: dict[UUID, bool] = {}
    for tr in transitions:
        day = tr["changed_at"].date()
        was_open = task_state.get(tr["task_id"], None)
        now_open = tr["to_status"] not in OPEN_EXCLUDED
        delta = 0
        if was_open is None:
            delta = 1 if now_open else 0
        elif was_open and not now_open:
            delta = -1
        elif not was_open and now_open:
            delta = 1
        task_state[tr["task_id"]] = now_open
        if delta:
            if day < start:
                open_before_start += delta
            else:
                events.append((day, delta))

    per_day: dict[date, int] = {}
    for day, delta in events:
        per_day[day] = per_day.get(day, 0) + delta

    series = []
    running = open_before_start
    for i in range(days):
        d = start + timedelta(days=i)
        running += per_day.get(d, 0)
        series.append(SeriesPoint(label=d.isoformat(), value=float(running)))
    return BurndownReport(project_id=project_id, days=series)


async def get_completion_trends(
    db: AsyncSession, *, weeks: int = 12, project_id: UUID | None = None
) -> CompletionTrends:
    transitions = await get_status_transitions(db, project_id=project_id)
    created: dict[date, int] = {}
    completed: dict[date, int] = {}
    for tr in transitions:
        week = _week_start(tr["changed_at"].date())
        if tr["from_status"] is None:
            created[week] = created.get(week, 0) + 1
        if tr["to_status"] in DONE_STATUSES:
            completed[week] = completed.get(week, 0) + 1
    axis = [_week_start(date.today()) - timedelta(weeks=i) for i in range(weeks - 1, -1, -1)]
    return CompletionTrends(
        created=[SeriesPoint(label=w.isoformat(), value=created.get(w, 0)) for w in axis],
        completed=[SeriesPoint(label=w.isoformat(), value=completed.get(w, 0)) for w in axis],
    )


async def get_workload(
    db: AsyncSession, *, partition: str | None = None
) -> List[WorkloadRow]:
    from app.modules.blockers.service import count_open_blockers_by_user

    tasks = await get_all_tasks_snapshot(db)
    if partition:
        tasks = [t for t in tasks if t.partition == partition]
    blockers = await count_open_blockers_by_user(db)

    rows: dict[UUID, WorkloadRow] = {}
    for t in tasks:
        if t.status in OPEN_EXCLUDED:
            continue
        for uid in t.assignee_user_ids:
            row = rows.get(uid) or WorkloadRow(
                user_id=uid, open_tasks=0, in_progress=0, estimated_hours=0, open_blockers=0
            )
            row.open_tasks += 1
            if t.status == TaskStatus.IN_PROGRESS.value:
                row.in_progress += 1
            row.estimated_hours += float(t.estimated_hours or 0)
            rows[uid] = row
    for uid, count in blockers.items():
        # When scoped to a partition, only annotate blockers for users who
        # already have tasks in that partition (blocker counts aren't partitioned).
        if partition and uid not in rows:
            continue
        row = rows.get(uid) or WorkloadRow(
            user_id=uid, open_tasks=0, in_progress=0, estimated_hours=0, open_blockers=0
        )
        row.open_blockers = count
        rows[uid] = row
    return sorted(rows.values(), key=lambda r: r.open_tasks, reverse=True)


async def get_contributions(
    db: AsyncSession, *, weeks: int = 4
) -> List[ContributionRow]:
    since = date.today() - timedelta(weeks=weeks)
    transitions = await get_status_transitions(db)
    rows: dict[UUID, ContributionRow] = {}
    for tr in transitions:
        uid = tr["changed_by_user_id"]
        if uid is None or tr["changed_at"].date() < since:
            continue
        row = rows.get(uid) or ContributionRow(user_id=uid, status_changes=0, tasks_completed=0)
        row.status_changes += 1
        if tr["to_status"] in DONE_STATUSES:
            row.tasks_completed += 1
        rows[uid] = row
    return sorted(rows.values(), key=lambda r: r.status_changes, reverse=True)


async def get_heatmap(db: AsyncSession, *, weeks: int = 4) -> List[HeatmapCell]:
    since = date.today() - timedelta(weeks=weeks)
    transitions = await get_status_transitions(db)
    cells: dict[tuple[UUID, int], int] = {}
    for tr in transitions:
        uid = tr["changed_by_user_id"]
        if uid is None or tr["changed_at"].date() < since:
            continue
        key = (uid, tr["changed_at"].weekday())
        cells[key] = cells.get(key, 0) + 1
    return [
        HeatmapCell(user_id=uid, weekday=weekday, count=count)
        for (uid, weekday), count in cells.items()
    ]


async def get_bottlenecks(
    db: AsyncSession, *, project_id: UUID | None = None
) -> List[BottleneckItem]:
    """Org-wide bottlenecks, or scoped to one project when project_id is given.

    Each item carries routing context (task_id / project_id) so the UI can
    deep-link to the exact task or project instead of a generic list.
    """
    from app.modules.blockers.service import list_blockers

    items: List[BottleneckItem] = []
    today = date.today()

    # phase_id -> project_id, to attribute tasks/blockers to their project.
    phase_project = await projects_repo.get_phase_project_map(db)
    tasks = await get_all_tasks_snapshot(db)
    task_by_id = {t.id: t for t in tasks}

    def task_project(task) -> UUID | None:
        return phase_project.get(task.phase_id) if task and task.phase_id else None

    for b in await list_blockers(db):
        if b.status not in ("Open", "InProgress"):
            continue
        task = task_by_id.get(b.blocked_task_id)
        pid = task_project(task)
        if project_id and pid != project_id:
            continue
        age = (today - b.created_at.date()).days
        items.append(
            BottleneckItem(
                kind="blocker",
                id=b.id,
                title=b.title,
                detail=f"{b.severity} blocker · pending {age} day(s)",
                age_days=age,
                task_id=b.blocked_task_id,
                project_id=pid,
            )
        )

    if not project_id:
        projects, _ = await list_all_projects(db, page=1, page_size=1000)
        for p in projects:
            if p.end_date and p.end_date < today and p.status not in ("completed", "cancelled"):
                age = (today - p.end_date).days
                items.append(
                    BottleneckItem(
                        kind="overdue_project",
                        id=p.id,
                        title=p.name,
                        detail=f"Past its end date by {age} day(s)",
                        age_days=age,
                        project_id=p.id,
                    )
                )

    for t in tasks:
        if t.status == TaskStatus.BLOCKED.value:
            pid = task_project(t)
            if project_id and pid != project_id:
                continue
            age = (today - t.updated_at.date()).days
            if age >= 3:
                items.append(
                    BottleneckItem(
                        kind="stale_task",
                        id=t.id,
                        title=t.title,
                        detail=f"Blocked with no movement for {age} day(s)",
                        age_days=age,
                        task_id=t.id,
                        project_id=pid,
                    )
                )

    return sorted(items, key=lambda i: i.age_days, reverse=True)[:50]


async def get_project_health(db: AsyncSession) -> ProjectHealthReport:
    projects, _ = await list_all_projects(db, page=1, page_size=1000)
    return ProjectHealthReport(
        active=sum(1 for p in projects if p.status == "in-progress"),
        completed=sum(1 for p in projects if p.status == "completed"),
        on_hold=sum(1 for p in projects if p.status == "on-hold"),
        not_started=sum(1 for p in projects if p.status == "not-started"),
        delayed=[
            {"id": str(p.id), "name": p.name, "progress": float(p.progress_percentage)}
            for p in projects
            if p.health_status == HealthStatus.DELAYED.value
        ],
        blocked=[
            {"id": str(p.id), "name": p.name, "progress": float(p.progress_percentage)}
            for p in projects
            if p.health_status == HealthStatus.BLOCKED.value
        ],
    )


async def get_personal_dashboard(db: AsyncSession, user_id: UUID) -> PersonalDashboard:
    from app.modules.projects.service import get_tasks_by_assignee

    tasks = await get_tasks_by_assignee(db, user_id)
    today = date.today()
    upcoming_cutoff = today + timedelta(days=7)

    full_tasks = await projects_repo.get_tasks_by_ids(db, [t.task_id for t in tasks])
    upcoming_deadlines = [
        {"task_id": str(t.id), "title": t.title, "due_date": t.due_date.isoformat()}
        for t in full_tasks
        if t.due_date
        and today <= t.due_date <= upcoming_cutoff
        and t.status not in ("Done", "Cancelled", "Archived")
    ]
    late_tasks = [
        {"task_id": str(t.id), "title": t.title, "due_date": t.due_date.isoformat()}
        for t in full_tasks
        if t.due_date
        and t.due_date < today
        and t.status not in ("Done", "Cancelled", "Archived")
    ]
    velocity_points = sum(
        t.story_points or 0 for t in full_tasks if t.status in ("Done", "Archived")
    )
    hours_logged = sum(float(t.actual_hours or 0) for t in full_tasks)

    return PersonalDashboard(
        upcoming_deadlines=upcoming_deadlines,
        late_tasks=late_tasks,
        velocity_points_completed=float(velocity_points),
        hours_logged=hours_logged,
    )
