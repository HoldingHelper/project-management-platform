"""Unit tests for Telegram CommandExecutor and PMP service dispatching."""

from __future__ import annotations

from datetime import date, datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4
import pytest

from app.core.current_user import CurrentUser
from app.core.exceptions import ForbiddenError, BusinessRuleError
from app.core.permissions import Permissions
from app.modules.projects.enums import Priority, TaskStatus
from app.modules.projects.models import Project, TaskItem, Phase
from app.modules.telegram.executor import CommandExecutor
from app.modules.telegram.resolver import ResolvedEntity
from app.modules.telegram.schemas import (
    AddCommentIntent,
    AssignTaskIntent,
    CreateProjectIntent,
    CreateSprintBatchIntent,
    CreateTaskIntent,
    CreateTicketIntent,
    ListProjectMembersIntent,
    UpdateTaskStatusIntent,
    UpdateTaskDetailsIntent,
    MoveTaskIntent,
    ViewAnalyticsIntent,
    ViewTaskIntent,
)


@pytest.fixture
def current_user():
    return CurrentUser(
        user_id=uuid4(),
        email="developer@example.test",
        full_name="Ali Rezaei",
        roles=["Developer"],
        permissions=[
            Permissions.TASKS_MANAGE_ALL,
            Permissions.TASKS_ASSIGN,
            Permissions.TASKS_COMMENT,
            Permissions.PROJECTS_MANAGE_ALL,
            Permissions.PHASES_MANAGE_ALL,
        ],
    )


@pytest.fixture
def mock_db():
    session = AsyncMock()
    return session


@pytest.mark.asyncio
async def test_executor_create_task_success(mock_db, current_user, monkeypatch):
    executor = CommandExecutor(db=mock_db, current_user=current_user, chat_id=12345678)

    project_id = uuid4()
    mock_project = SimpleNamespace(id=project_id, name="Atlas", key="ATL")
    task_id = uuid4()
    created_task = SimpleNamespace(
        id=task_id,
        project_id=project_id,
        title="Fix login redirect",
        status=TaskStatus.READY,
        priority=Priority.P1,
        phase_id=None,
        due_date=None,
        assignees=[],
        labels=[],
    )

    # Mock resolver returning ResolvedEntity
    monkeypatch.setattr(
        "app.modules.telegram.executor.EntityResolver.resolve_project",
        AsyncMock(return_value=ResolvedEntity(status="exact", entity=mock_project, candidates=[mock_project])),
    )
    # Mock projects_service.create_task and projects_repo.get_task
    monkeypatch.setattr(
        "app.modules.telegram.executor.projects_service.create_task",
        AsyncMock(return_value=created_task),
    )
    monkeypatch.setattr(
        "app.modules.telegram.executor.projects_repo.get_task",
        AsyncMock(return_value=created_task),
    )

    intent = CreateTaskIntent(
        title="Fix login redirect",
        project_name="Atlas",
        language="en",
    )

    result = await executor.execute(intent)
    assert "Fix login redirect" in result.text
    assert result.reply_markup is not None


@pytest.mark.asyncio
async def test_executor_sprint_batch_validates_duration(mock_db, current_user, monkeypatch):
    executor = CommandExecutor(db=mock_db, current_user=current_user, chat_id=12345678)

    # 1. Invalid duration (e.g. 5 days) must be rejected
    invalid_intent = CreateSprintBatchIntent(
        project_name="Atlas",
        count=3,
        duration_days=5,
        language="en",
    )
    res_invalid = await executor.execute(invalid_intent)
    assert "Invalid sprint duration" in res_invalid.text or "3, 7" in res_invalid.text

    # 2. Valid duration (7 days) should succeed
    project_id = uuid4()
    mock_project = SimpleNamespace(id=project_id, name="Atlas", key="ATL")
    monkeypatch.setattr(
        "app.modules.telegram.executor.EntityResolver.resolve_project",
        AsyncMock(return_value=ResolvedEntity(status="exact", entity=mock_project, candidates=[mock_project])),
    )

    mock_sprints = [
        SimpleNamespace(id=uuid4(), name="Sprint 1", start_date=date(2026, 11, 2), end_date=date(2026, 11, 8)),
        SimpleNamespace(id=uuid4(), name="Sprint 2", start_date=date(2026, 11, 9), end_date=date(2026, 11, 15)),
    ]
    monkeypatch.setattr(
        "app.modules.telegram.executor.projects_service.create_sprint_batch",
        AsyncMock(return_value=mock_sprints),
    )

    valid_intent = CreateSprintBatchIntent(
        project_name="Atlas",
        count=2,
        duration_days=7,
        start_date=date(2026, 11, 2),
        language="en",
    )
    res_valid = await executor.execute(valid_intent)
    assert "Created 2 sprints" in res_valid.text
    assert "Sprint 1" in res_valid.text


@pytest.mark.asyncio
async def test_executor_sprint_batch_no_project_single_project(mock_db, current_user, monkeypatch):
    executor = CommandExecutor(db=mock_db, current_user=current_user, chat_id=12345678)

    project_id = uuid4()
    mock_project = SimpleNamespace(id=project_id, name="AutoProject", key="AP")

    monkeypatch.setattr(
        "app.modules.telegram.executor.conversation_state_manager.get_context",
        AsyncMock(return_value=None),
    )
    monkeypatch.setattr(
        "app.modules.telegram.executor.projects_service.list_all_projects",
        AsyncMock(return_value=([mock_project], 1)),
    )
    monkeypatch.setattr(
        "app.modules.telegram.executor.projects_repo.get_project",
        AsyncMock(return_value=mock_project),
    )
    monkeypatch.setattr(
        "app.modules.telegram.executor.projects_service.require_project_manage_access",
        AsyncMock(return_value=None),
    )
    mock_sprints = [
        SimpleNamespace(id=uuid4(), name="Sprint 1", start_date=date(2026, 11, 2), end_date=date(2026, 11, 15)),
    ]
    monkeypatch.setattr(
        "app.modules.telegram.executor.projects_service.create_sprint_batch",
        AsyncMock(return_value=mock_sprints),
    )

    intent = CreateSprintBatchIntent(
        count=1,
        duration_days=14,
        language="en",
    )
    res = await executor.execute(intent)
    assert "Created 1 sprints" in res.text
    assert "AutoProject" in res.text


@pytest.mark.asyncio
async def test_executor_update_task_status(mock_db, current_user, monkeypatch):
    executor = CommandExecutor(db=mock_db, current_user=current_user, chat_id=12345678)

    task_id = uuid4()
    mock_task = SimpleNamespace(
        id=task_id,
        project_id=uuid4(),
        title="Check DB connection",
        status=TaskStatus.READY,
        priority=Priority.P2,
        phase_id=None,
        due_date=None,
        assignees=[],
        labels=[],
    )
    updated_task = SimpleNamespace(
        id=task_id,
        project_id=mock_task.project_id,
        title="Check DB connection",
        status=TaskStatus.IN_PROGRESS,
        priority=Priority.P2,
        phase_id=None,
        due_date=None,
        assignees=[],
        labels=[],
    )

    monkeypatch.setattr(
        "app.modules.telegram.executor.EntityResolver.resolve_task",
        AsyncMock(return_value=ResolvedEntity(status="exact", entity=mock_task, candidates=[mock_task])),
    )
    monkeypatch.setattr(
        "app.modules.telegram.executor.projects_service.update_task_status",
        AsyncMock(return_value=updated_task),
    )

    intent = UpdateTaskStatusIntent(
        task_id_or_title="Check DB connection",
        status="InProgress",
        language="fa",
    )
    res = await executor.execute(intent)
    assert "InProgress" in res.text or "در حال انجام" in res.text


@pytest.mark.asyncio
async def test_executor_assign_task(mock_db, current_user, monkeypatch):
    executor = CommandExecutor(db=mock_db, current_user=current_user, chat_id=12345678)

    task_id = uuid4()
    user_id = uuid4()
    mock_task = SimpleNamespace(
        id=task_id,
        project_id=uuid4(),
        title="Refactor auth",
        status=TaskStatus.READY,
        priority=Priority.P1,
        phase_id=None,
        due_date=None,
        assignees=[],
        labels=[],
    )
    mock_user = SimpleNamespace(id=user_id, full_name="Reza", email="reza@example.test")

    monkeypatch.setattr(
        "app.modules.telegram.executor.EntityResolver.resolve_task",
        AsyncMock(return_value=ResolvedEntity(status="exact", entity=mock_task, candidates=[mock_task])),
    )
    monkeypatch.setattr(
        "app.modules.telegram.executor.EntityResolver.resolve_user",
        AsyncMock(return_value=ResolvedEntity(status="exact", entity=mock_user, candidates=[mock_user])),
    )
    monkeypatch.setattr(
        "app.modules.telegram.executor.projects_service.update_task",
        AsyncMock(return_value=mock_task),
    )

    intent = AssignTaskIntent(
        task_id_or_title="Refactor auth",
        assignee_names=["Reza"],
        language="en",
    )
    res = await executor.execute(intent)
    assert "Assigned task" in res.text or "Reza" in res.text


@pytest.mark.asyncio
async def test_executor_handles_forbidden_error(mock_db, current_user, monkeypatch):
    executor = CommandExecutor(db=mock_db, current_user=current_user, chat_id=12345678)

    task_id = uuid4()
    mock_task = SimpleNamespace(
        id=task_id,
        project_id=uuid4(),
        title="Admin only task",
        status=TaskStatus.READY,
        priority=Priority.P1,
        phase_id=None,
        due_date=None,
        assignees=[],
        labels=[],
    )

    monkeypatch.setattr(
        "app.modules.telegram.executor.EntityResolver.resolve_task",
        AsyncMock(return_value=ResolvedEntity(status="exact", entity=mock_task, candidates=[mock_task])),
    )
    # Simulate permission denied from PMP service
    monkeypatch.setattr(
        "app.modules.telegram.executor.projects_service.update_task_status",
        AsyncMock(side_effect=ForbiddenError("You do not have permission to edit this task.")),
    )

    intent = UpdateTaskStatusIntent(
        task_id_or_title="Admin only task",
        status="Done",
        language="fa",
    )
    res = await executor.execute(intent)
    # Should catch gracefully and return friendly message
    assert "دسترسی" in res.text or "اجازه" in res.text or "Forbidden" in res.text


@pytest.mark.asyncio
async def test_executor_add_comment(mock_db, current_user, monkeypatch):
    executor = CommandExecutor(db=mock_db, current_user=current_user, chat_id=12345678)

    task_id = uuid4()
    mock_task = SimpleNamespace(
        id=task_id,
        project_id=uuid4(),
        title="Task 142",
        status=TaskStatus.READY,
        priority=Priority.P1,
        phase_id=None,
        due_date=None,
        assignees=[],
        labels=[],
    )
    mock_comment = SimpleNamespace(id=uuid4(), content="Checked and verified.")

    monkeypatch.setattr(
        "app.modules.telegram.executor.EntityResolver.resolve_task",
        AsyncMock(return_value=ResolvedEntity(status="exact", entity=mock_task, candidates=[mock_task])),
    )
    monkeypatch.setattr(
        "app.modules.telegram.executor.collaboration_service.create_comment",
        AsyncMock(return_value=mock_comment),
    )

    intent = AddCommentIntent(
        task_id_or_title="Task 142",
        comment_text="Checked and verified.",
        language="en",
    )
    res = await executor.execute(intent)
    assert "Comment added" in res.text or "ثبت شد" in res.text


@pytest.mark.asyncio
async def test_executor_view_analytics_my_work(mock_db, current_user, monkeypatch):
    """Analytics personal dashboard aligns with My Work page (velocity, pending, KPI pulse)."""
    executor = CommandExecutor(db=mock_db, current_user=current_user, chat_id=12345678)

    sample_dash = SimpleNamespace(
        assigned_tasks_total=12,
        open_tasks=5,
        in_progress_tasks=3,
        completed_tasks=7,
        blocked_tasks=1,
        attention_required_tasks=2,
        unscheduled_open_tasks=1,
        completion_rate_percent=58.3,
        upcoming_deadlines=[{"task_id": str(uuid4()), "title": "API Docs", "due_date": "2026-11-05"}],
        late_tasks=[{"task_id": str(uuid4()), "title": "Fix Auth Leak", "due_date": "2026-10-28"}],
        velocity_points_completed=24.0,
        hours_logged=36.5,
    )
    sample_pending_work = SimpleNamespace(
        pending_on_me=[
            SimpleNamespace(kind="blocker", id=uuid4(), title="DB Migration Lock", priority="P0", detail="Needs review"),
            SimpleNamespace(kind="review_task", id=uuid4(), title="PR 123", priority="P1", detail="Code review waiting"),
        ],
        pending_on_others=[],
    )

    monkeypatch.setattr("app.modules.telegram.executor.analytics_service.get_personal_dashboard", AsyncMock(return_value=sample_dash))
    monkeypatch.setattr("app.modules.telegram.executor.blockers_service.get_user_pending_work", AsyncMock(return_value=sample_pending_work))

    intent = ViewAnalyticsIntent(report_type="personal", language="fa")
    res = await executor.execute(intent)

    assert "کارهای من (My Work Hub)" in res.text
    assert "سرعت من (My Velocity):</b> <b>24</b>" in res.text
    assert "نیاز به اقدام من:</b> <b>2</b>" in res.text
    assert "کارهای دارای تاخیر:</b> <b>1</b>" in res.text
    assert "مهلت‌های ۷ روز آینده:</b> <b>1</b>" in res.text
    assert "نبض تمرکز و کارایی (KPI Pulse)" in res.text

    # Verify buttons
    all_cb_data = [btn.callback_data for row in res.reply_markup.inline_keyboard for btn in row]
    assert "an:pending" in all_cb_data
    assert "an:late" in all_cb_data
    assert "an:upcoming" in all_cb_data
    assert "an:sprint" in all_cb_data
    assert "an:health" in all_cb_data


@pytest.mark.asyncio
async def test_executor_view_analytics_pending_and_late_views(mock_db, current_user, monkeypatch):
    """Sub-views for Pending On Me and Late Tasks render items and action buttons."""
    executor = CommandExecutor(db=mock_db, current_user=current_user, chat_id=12345678)
    tid = uuid4()

    sample_dash = SimpleNamespace(
        assigned_tasks_total=5,
        open_tasks=2,
        in_progress_tasks=1,
        completed_tasks=3,
        blocked_tasks=0,
        attention_required_tasks=1,
        unscheduled_open_tasks=0,
        completion_rate_percent=60.0,
        upcoming_deadlines=[],
        late_tasks=[{"task_id": str(tid), "title": "Upgrade PostgreSQL", "due_date": "2026-10-25"}],
        velocity_points_completed=10.0,
        hours_logged=15.0,
    )
    sample_pending_work = SimpleNamespace(
        pending_on_me=[
            SimpleNamespace(kind="blocker", id=uuid4(), title="Staging SSL Expired", priority="P0", detail="Cert renewal pending"),
        ],
        pending_on_others=[],
    )

    monkeypatch.setattr("app.modules.telegram.executor.analytics_service.get_personal_dashboard", AsyncMock(return_value=sample_dash))
    monkeypatch.setattr("app.modules.telegram.executor.blockers_service.get_user_pending_work", AsyncMock(return_value=sample_pending_work))

    # Test Pending sub-view
    res_pending = await executor.execute(ViewAnalyticsIntent(report_type="pending", language="fa"))
    assert "کارهای در انتظار اقدام شما" in res_pending.text
    assert "Staging SSL Expired" in res_pending.text

    # Test Late sub-view
    res_late = await executor.execute(ViewAnalyticsIntent(report_type="late", language="fa"))
    assert "کارهای دارای تاخیر شما" in res_late.text
    assert "Upgrade PostgreSQL" in res_late.text
    all_cb_data = [btn.callback_data for row in res_late.reply_markup.inline_keyboard for btn in row]
    assert any(f"task_act:view:{tid}" in cb for cb in all_cb_data)


@pytest.mark.asyncio
async def test_executor_view_analytics_executive_dashboard(mock_db, current_user, monkeypatch):
    """Executive dashboard with at-risk projects."""
    executor = CommandExecutor(db=mock_db, current_user=current_user, chat_id=12345678)

    from app.modules.analytics.schemas import ExecutiveDashboard
    sample_exec = ExecutiveDashboard(
        active_projects=8,
        completed_projects=14,
        delayed_projects=2,
        blocked_projects=1,
        department_progress=[],
        recent_activity=[],
    )
    delayed_p = {"name": "Payment V2", "progress": 45.0}
    blocked_p = {"name": "KYC Service", "progress": 10.0}
    sample_health = SimpleNamespace(
        active=8,
        completed=14,
        on_hold=1,
        not_started=2,
        delayed=[delayed_p],
        blocked=[blocked_p],
    )

    monkeypatch.setattr("app.modules.telegram.executor.analytics_service.get_executive_dashboard", AsyncMock(return_value=sample_exec))
    monkeypatch.setattr("app.modules.telegram.executor.analytics_service.get_project_health", AsyncMock(return_value=sample_health))

    # User with manage_all permission can view executive dash
    current_user.permissions.append(Permissions.REPORTS_VIEW_EXECUTIVE)

    res = await executor.execute(ViewAnalyticsIntent(report_type="exec", language="fa"))
    assert "داشبورد سازمانی" in res.text
    assert "Payment V2" in res.text
    assert "KYC Service" in res.text

    # Also test English
    res_en = await executor.execute(ViewAnalyticsIntent(report_type="exec", language="en"))
    assert "Executive Dashboard" in res_en.text
    assert "Payment V2" in res_en.text
    assert "KYC Service" in res_en.text


@pytest.mark.asyncio
async def test_executor_list_project_members_success(mock_db, current_user, monkeypatch):
    executor = CommandExecutor(db=mock_db, current_user=current_user, chat_id=12345678)
    current_user.permissions.append(Permissions.PROJECTS_VIEW_ALL)

    project_id = uuid4()
    mock_project = SimpleNamespace(id=project_id, name="Project Apollo")
    monkeypatch.setattr(
        "app.modules.telegram.executor.EntityResolver.resolve_project",
        AsyncMock(return_value=ResolvedEntity(status="exact", entity=mock_project, candidates=[mock_project])),
    )

    from app.modules.projects.schemas import ProjectMemberRead
    user_id = uuid4()
    # ProjectMemberRead has NO full_name or email - only project_id, user_id, role
    mock_members = [
        ProjectMemberRead(project_id=project_id, user_id=user_id, role="Lead")
    ]
    monkeypatch.setattr(
        "app.modules.telegram.executor.projects_service.list_project_members",
        AsyncMock(return_value=mock_members),
    )

    mock_user = SimpleNamespace(
        id=user_id,
        first_name="Hassan",
        last_name="Tehrani",
        full_name="Hassan Tehrani",
        email="hassan@example.com",
    )
    monkeypatch.setattr(
        "app.modules.projects.membership.project_people",
        AsyncMock(return_value=[mock_user]),
    )

    # Test English
    res_en = await executor.execute(ListProjectMembersIntent(project_name="Project Apollo", language="en"))
    assert "Members of project 'Project Apollo':" in res_en.text
    assert "Hassan Tehrani" in res_en.text
    assert "Role: Lead" in res_en.text

    # Test Persian
    res_fa = await executor.execute(ListProjectMembersIntent(project_name="Project Apollo", language="fa"))
    assert "اعضای پروژه «Project Apollo»:" in res_fa.text
    assert "Hassan Tehrani" in res_fa.text
    assert "نقش: Lead" in res_fa.text


