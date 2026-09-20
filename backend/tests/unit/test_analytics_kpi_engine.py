"""Unit tests for Enhanced KPI Analytics Engine (DORA, Flow, Predictability, Executive AI Summary)."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from uuid import uuid4
import pytest

from app.modules.analytics import service as analytics_service
from app.modules.analytics.schemas import (
    DORAMetricsReport,
    EnhancedExecutiveKPIReport,
    FlowMetricsReport,
    PredictabilityReport,
)
from app.modules.projects.models import TaskItem, Project
from app.modules.blockers.models import Blocker


class MockAsyncSession:
    def __init__(self, data=None):
        self.data = data

    async def execute(self, stmt):
        class MockResult:
            def __init__(self, d):
                self.d = d

            def scalar_one_or_none(self):
                return self.d

            def scalar_one(self):
                return 0 if self.d is None else self.d

            def scalars(self):
                class MockScalars:
                    def __init__(self, d):
                        self.d = d or []

                    def all(self):
                        return self.d
                return MockScalars(self.d if isinstance(self.d, list) else ([self.d] if self.d else []))

        return MockResult(self.data)


@pytest.mark.asyncio
async def test_dora_metrics_calculation(monkeypatch):
    mock_db = MockAsyncSession()

    now = datetime.now(timezone.utc)
    # Mock status transitions to simulate completed items
    mock_transitions = [
        {"task_id": uuid4(), "to_status": "Done", "changed_at": now - timedelta(days=2)},
        {"task_id": uuid4(), "to_status": "Done", "changed_at": now - timedelta(days=5)},
        {"task_id": uuid4(), "to_status": "Done", "changed_at": now - timedelta(days=8)},
        {"task_id": uuid4(), "to_status": "Done", "changed_at": now - timedelta(days=12)},
    ]

    async def mock_get_transitions(db, since=None, project_id=None):
        return mock_transitions

    async def mock_get_tasks(db):
        return [
            TaskItem(title="Task A", created_at=now - timedelta(days=4), completed_at=now - timedelta(days=2), status="Done"),
            TaskItem(title="Task B", created_at=now - timedelta(days=7), completed_at=now - timedelta(days=5), status="Done"),
        ]

    monkeypatch.setattr(analytics_service, "get_status_transitions", mock_get_transitions)
    monkeypatch.setattr(analytics_service, "get_all_tasks_snapshot", mock_get_tasks)

    dora = await analytics_service.get_dora_metrics(mock_db, range_days=30)  # type: ignore

    assert isinstance(dora, DORAMetricsReport)
    assert dora.deployment_frequency.value > 0
    assert dora.deployment_frequency.rating in ("Elite", "High", "Medium", "Low")
    assert dora.lead_time_for_changes.value > 0
    assert dora.change_failure_rate.unit == "percent"
    assert dora.mean_time_to_recovery.rating in ("Elite", "High", "Medium", "Low")
    assert len(dora.lead_time_breakdown_hours) == 3


@pytest.mark.asyncio
async def test_flow_metrics_and_category_distribution(monkeypatch):
    mock_db = MockAsyncSession()

    async def mock_get_tasks(db):
        t1 = TaskItem(title="Build Auth", task_type="Feature", story_points=5, partition="Technical", status="Done")
        t2 = TaskItem(title="Fix Bug", task_type="Bug", story_points=3, partition="Platform", status="Done")
        t3 = TaskItem(title="Refactor DB", task_type="TechDebt", story_points=2, partition="Technical", status="Done")
        t4 = TaskItem(title="Landing Page", task_type="Feature", story_points=8, partition="Marketing", status="In Progress")
        return [t1, t2, t3, t4]

    monkeypatch.setattr(analytics_service, "get_all_tasks_snapshot", mock_get_tasks)

    flow = await analytics_service.get_flow_metrics(mock_db, range_days=30)  # type: ignore

    assert isinstance(flow, FlowMetricsReport)
    assert flow.velocity_total_points >= 10.0
    assert flow.velocity_by_type.features_percent > 0
    assert len(flow.category_distribution) == 6
    assert any(c.category == "Technical" for c in flow.category_distribution)
    assert flow.flow_efficiency_percentage > 0


@pytest.mark.asyncio
async def test_predictability_and_cfd(monkeypatch):
    mock_db = MockAsyncSession()
    now = datetime.now(timezone.utc)

    async def mock_get_tasks(db):
        t1 = TaskItem(
            title="Task A",
            story_points=5,
            status="Done",
            due_date=date.today(),
            completed_at=now,
        )
        t2 = TaskItem(
            title="Task B",
            story_points=3,
            status="In Progress",
            due_date=date.today() + timedelta(days=5),
        )
        return [t1, t2]

    monkeypatch.setattr(analytics_service, "get_all_tasks_snapshot", mock_get_tasks)

    predictability = await analytics_service.get_predictability_and_cfd(mock_db, range_days=30)  # type: ignore

    assert isinstance(predictability, PredictabilityReport)
    assert predictability.predictability_score_percent > 0
    assert len(predictability.cfd_series) > 0
    assert predictability.on_time_delivery_rate_percent >= 50.0


@pytest.mark.asyncio
async def test_enhanced_kpi_executive_summary(monkeypatch):
    mock_db = MockAsyncSession()
    now = datetime.now(timezone.utc)

    async def mock_get_tasks(db):
        return [
            TaskItem(
                title="Task A",
                task_type="Feature",
                story_points=5,
                partition="Technical",
                status="Done",
                created_at=now - timedelta(days=5),
                completed_at=now - timedelta(days=2),
                due_date=date.today(),
            ),
            TaskItem(
                title="Task B",
                task_type="Bug",
                story_points=3,
                partition="Platform",
                status="In Progress",
                created_at=now - timedelta(days=2),
            ),
        ]

    async def mock_get_transitions(db, since=None, project_id=None):
        return [
            {"task_id": uuid4(), "to_status": "Done", "changed_at": now - timedelta(days=2)}
        ]

    monkeypatch.setattr(analytics_service, "get_all_tasks_snapshot", mock_get_tasks)
    monkeypatch.setattr(analytics_service, "get_status_transitions", mock_get_transitions)

    report = await analytics_service.get_enhanced_kpi_dashboard(mock_db, range_days=30)  # type: ignore

    assert isinstance(report, EnhancedExecutiveKPIReport)
    assert len(report.summary.headline) > 10
    assert len(report.summary.recommendations) == 3
    assert "DORA" in report.summary.dora_performance_summary
