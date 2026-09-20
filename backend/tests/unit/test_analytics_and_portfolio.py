"""Unit tests for Analytics, Metrics, and Executive Portfolio rollups."""

from __future__ import annotations

from datetime import date, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from app.modules.analytics import service as analytics_service
from app.modules.analytics.schemas import (
    ExecutiveDashboard,
    SeriesPoint,
    VelocityReport,
)
from app.modules.projects import service as projects_service
from app.modules.projects.enums import TaskStatus


def test_series_point_model():
    point = SeriesPoint(
        label="Sprint 24",
        value=42.0,
    )
    assert point.label == "Sprint 24"
    assert point.value == 42.0


def test_velocity_report_aggregate():
    report = VelocityReport(
        weeks=[SeriesPoint(label="Week 1", value=30.0), SeriesPoint(label="Week 2", value=45.0)],
        tasks_done=[SeriesPoint(label="Week 1", value=12.0), SeriesPoint(label="Week 2", value=18.0)],
    )
    assert len(report.weeks) == 2
    assert len(report.tasks_done) == 2


def test_executive_dashboard_aggregate():
    dash = ExecutiveDashboard(
        active_projects=12,
        completed_projects=8,
        delayed_projects=1,
        blocked_projects=0,
        department_progress=[{"department": "Engineering", "progress": 82.5}],
        recent_activity=[],
    )
    assert dash.active_projects == 12
    assert dash.completed_projects == 8
    assert dash.delayed_projects == 1


@pytest.mark.asyncio
async def test_personal_dashboard_reports_task_counts_and_metadata(monkeypatch):
    user_id = uuid4()
    today = date.today()
    task_ids = [uuid4() for _ in range(6)]
    summaries = [SimpleNamespace(task_id=task_id) for task_id in task_ids]
    tasks = [
        SimpleNamespace(
            id=task_ids[0], title="Done without points", status=TaskStatus.DONE.value,
            story_points=None, actual_hours=None, due_date=None,
        ),
        SimpleNamespace(
            id=task_ids[1], title="Archived with points", status=TaskStatus.ARCHIVED.value,
            story_points=3, actual_hours=1.5, due_date=None,
        ),
        SimpleNamespace(
            id=task_ids[2], title="Active this week", status=TaskStatus.IN_PROGRESS.value,
            story_points=5, actual_hours=2, due_date=today + timedelta(days=3),
        ),
        SimpleNamespace(
            id=task_ids[3], title="Late blocker", status=TaskStatus.BLOCKED.value,
            story_points=None, actual_hours=None, due_date=today - timedelta(days=1),
        ),
        SimpleNamespace(
            id=task_ids[4], title="Unscheduled", status=TaskStatus.READY.value,
            story_points=None, actual_hours=None, due_date=None,
        ),
        SimpleNamespace(
            id=task_ids[5], title="Cancelled", status=TaskStatus.CANCELLED.value,
            story_points=None, actual_hours=None, due_date=None,
        ),
    ]
    monkeypatch.setattr(
        projects_service,
        "get_tasks_by_assignee",
        AsyncMock(return_value=summaries),
    )
    monkeypatch.setattr(
        analytics_service.projects_repo,
        "get_tasks_by_ids",
        AsyncMock(return_value=tasks),
    )

    result = await analytics_service.get_personal_dashboard(object(), user_id)

    assert result.assigned_tasks_total == 6
    assert result.open_tasks == 3
    assert result.in_progress_tasks == 1
    assert result.completed_tasks == 2
    assert result.blocked_tasks == 1
    assert result.attention_required_tasks == 1
    assert result.unscheduled_open_tasks == 1
    assert result.completion_rate_percent == 40.0
    assert result.velocity_points_completed == 3.0
    assert result.hours_logged == 3.5
    assert [item["title"] for item in result.upcoming_deadlines] == ["Active this week"]
    assert [item["title"] for item in result.late_tasks] == ["Late blocker"]
