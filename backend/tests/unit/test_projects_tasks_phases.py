"""Unit tests for Projects, Tasks, Phases, Checklists, and Task Lifecycle."""

from __future__ import annotations

from datetime import date, datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4
import pytest
from pydantic import ValidationError

from app.modules.collaboration.schemas import CommentCreate
from app.core.current_user import CurrentUser
from app.core.exceptions import BusinessRuleError, ForbiddenError, ValidationAppError
from app.core.permissions import Permissions, ROLE_PERMISSIONS
from app.modules.projects.models import Project, TaskItem
from app.modules.projects import service
from app.modules.projects.schemas import (
    ProjectCreate,
    ProjectSprintCreate,
    ProjectUpdate,
    TaskCreate,
    TaskUpdate,
    UpdateTaskStatusRequest,
)


def test_project_create_schema_defaults_and_validation():
    product_id = uuid4()
    req = ProjectCreate(
        product_id=product_id,
        name="Apollo Platform",
        description="Core infrastructure project",
        priority="P1",
        budget=150000.0,
    )
    assert req.name == "Apollo Platform"
    assert req.priority == "P1"
    assert req.budget == 150000.0


def test_project_dates_are_a_single_immutable_baseline_contract():
    with pytest.raises(ValidationError, match="set together"):
        ProjectCreate(product_id=uuid4(), name="Partial dates", start_date=date(2026, 9, 1))
    with pytest.raises(ValidationError, match="Actual end date"):
        ProjectCreate(
            product_id=uuid4(),
            name="No baseline",
            actual_completion_date=date(2026, 9, 14),
        )


def test_new_sprints_are_exactly_fourteen_calendar_days():
    sprint = ProjectSprintCreate(
        name="Sprint 1",
        start_date=date(2026, 9, 1),
        end_date=date(2026, 9, 14),
    )
    assert (sprint.end_date - sprint.start_date).days + 1 == 14
    with pytest.raises(ValidationError, match="exactly 14"):
        ProjectSprintCreate(
            name="Too long",
            start_date=date(2026, 9, 1),
            end_date=date(2026, 9, 15),
        )


@pytest.mark.asyncio
async def test_planned_project_dates_cannot_change_after_first_baseline(monkeypatch):
    project = Project(
        id=uuid4(),
        product_id=uuid4(),
        name="Locked plan",
        start_date=date(2026, 9, 1),
        end_date=date(2026, 9, 30),
    )
    monkeypatch.setattr(service.repo, "get_project", AsyncMock(return_value=project))
    with pytest.raises(BusinessRuleError, match="locked"):
        await service.update_project(
            AsyncMock(),
            project.id,
            ProjectUpdate(start_date=date(2026, 9, 2), end_date=date(2026, 9, 30)),
        )


@pytest.mark.asyncio
async def test_actual_end_requires_a_planned_baseline(monkeypatch):
    project = Project(id=uuid4(), product_id=uuid4(), name="Unscheduled")
    monkeypatch.setattr(service.repo, "get_project", AsyncMock(return_value=project))
    with pytest.raises(BusinessRuleError, match="Actual end date"):
        await service.update_project(
            AsyncMock(),
            project.id,
            ProjectUpdate(actual_completion_date=date(2026, 9, 14)),
        )


def test_project_status_tracks_started_and_completed_work():
    project = Project(
        id=uuid4(),
        product_id=uuid4(),
        name="Status sync",
        status="not-started",
        start_date=date(2026, 1, 1),
        end_date=date(2026, 12, 31),
        progress_percentage=0,
    )
    task = TaskItem(id=uuid4(), title="Delivery", status="InProgress")
    assert service._derived_project_status(project, []) == "in-progress"
    assert service._derived_project_status(project, [task]) == "in-progress"
    task.status = "Done"
    assert service._derived_project_status(project, [task]) == "completed"


@pytest.mark.asyncio
async def test_project_creation_always_persists_a_two_week_sprint(monkeypatch):
    class Session:
        def __init__(self):
            self.added = []

        def add(self, value):
            self.added.append(value)

        async def flush(self):
            for value in self.added:
                if isinstance(value, Project) and value.id is None:
                    value.id = uuid4()
                    value.priority = value.priority or "P2"
                    value.risk_level = value.risk_level or "Medium"
                    value.health_status = value.health_status or "on-track"
                    value.status = value.status or "not-started"
                    value.tags = value.tags or []
                    value.progress_percentage = value.progress_percentage or 0
                    value.created_by = value.created_by or "manual"
                    value.last_modified_by = value.last_modified_by or "manual"

        async def commit(self):
            pass

        async def refresh(self, _value):
            now = datetime.now(timezone.utc)
            _value.created_at = now
            _value.updated_at = now

    db = Session()
    monkeypatch.setattr(service.repo, "get_product", AsyncMock(return_value=object()))
    monkeypatch.setattr(service.event_bus, "publish", AsyncMock())
    result = await service.create_project(
        db,  # type: ignore[arg-type]
        ProjectCreate(product_id=uuid4(), name="Sprint planned"),
    )
    sprints = [value for value in db.added if value.__class__.__name__ == "Phase"]
    assert result.planning_mode == "sprints"
    assert len(sprints) == 1
    assert sprints[0].is_sprint is True
    assert (sprints[0].end_date - sprints[0].start_date).days + 1 == 14


def test_task_create_and_priority_types():
    task = TaskCreate(
        title="Implement OAuth2 Token Introspection",
        description="RFC 7662 token introspection endpoint",
        task_type="Feature",
        priority="P0",
        story_points=5,
        estimated_hours=12.5,
    )
    assert task.title == "Implement OAuth2 Token Introspection"
    assert task.priority == "P0"
    assert task.story_points == 5
    assert task.estimated_hours == 12.5


def test_leads_managers_and_clevel_can_assign_while_developers_cannot():
    for role in ("CLevel", "CompanyManager", "ProjectManager", "TeamLead"):
        assert Permissions.TASKS_ASSIGN in ROLE_PERMISSIONS[role]
    assert Permissions.TASKS_ASSIGN not in ROLE_PERMISSIONS["Developer"]


@pytest.mark.asyncio
async def test_developer_can_self_assign_but_only_edit_when_assigned(monkeypatch):
    developer_id = uuid4()
    other_id = uuid4()
    task = SimpleNamespace(id=uuid4(), assignees=[])
    monkeypatch.setattr(service.repo, "get_task", AsyncMock(return_value=task))
    developer = CurrentUser(
        user_id=developer_id,
        email="developer@example.test",
        full_name="Developer",
        permissions=[Permissions.TASKS_EDIT_ASSIGNED],
    )
    allowed = await service.require_task_edit_access(
        AsyncMock(), developer, task.id, TaskUpdate(assignee_user_ids=[developer_id])
    )
    assert allowed is task
    with pytest.raises(ForbiddenError):
        await service.require_task_edit_access(
            AsyncMock(), developer, task.id, TaskUpdate(title="Not assigned yet")
        )
    with pytest.raises(ForbiddenError):
        await service.require_task_edit_access(
            AsyncMock(), developer, task.id, TaskUpdate(assignee_user_ids=[other_id])
        )


@pytest.mark.asyncio
async def test_any_assignee_can_edit_and_change_status_without_role_task_permission(monkeypatch):
    assignee_id = uuid4()
    task = SimpleNamespace(
        id=uuid4(),
        phase_id=None,
        assignees=[SimpleNamespace(user_id=assignee_id)],
    )
    monkeypatch.setattr(service.repo, "get_task", AsyncMock(return_value=task))
    assignee = CurrentUser(
        user_id=assignee_id,
        email="assignee@example.test",
        full_name="Assigned user",
        permissions=[],
    )

    allowed = await service.require_task_edit_access(
        AsyncMock(), assignee, task.id, TaskUpdate(title="Updated by assignee")
    )
    assert allowed is task
    await service.require_task_board_access(AsyncMock(), assignee, [task.id])


@pytest.mark.asyncio
async def test_ticket_recipients_expand_team_dedupe_and_exclude_creator(monkeypatch):
    from app.modules.identity import service as identity_service
    from app.modules.organization import service as organization_service

    creator_id = uuid4()
    direct_user_id = uuid4()
    team_user_id = uuid4()
    team_id = uuid4()
    validate = AsyncMock(side_effect=lambda _db, user_ids: user_ids)
    monkeypatch.setattr(identity_service, "require_active_user_ids", validate)
    monkeypatch.setattr(
        organization_service,
        "resolve_active_team_user_ids",
        AsyncMock(return_value=[team_user_id, direct_user_id, creator_id]),
    )

    recipients = await service._resolve_ticket_assignee_ids(
        AsyncMock(),
        TaskCreate(
            title="Production access request",
            is_ticket=True,
            ticket_recipient_user_ids=[direct_user_id],
            ticket_recipient_team_ids=[team_id],
        ),
        creator_id,
    )

    assert recipients == [direct_user_id, team_user_id]
    validate.assert_awaited_once()


@pytest.mark.asyncio
async def test_ticket_requires_another_person_or_team():
    with pytest.raises(ValidationAppError, match="at least one person or team"):
        await service._resolve_ticket_assignee_ids(
            AsyncMock(),
            TaskCreate(title="Empty ticket", is_ticket=True),
            uuid4(),
        )


def test_task_status_updates():
    valid_statuses = [
        "NotStarted",
        "Ready",
        "InProgress",
        "Waiting",
        "Blocked",
        "Review",
        "Testing",
        "Done",
        "Cancelled",
    ]
    for status in valid_statuses:
        update = UpdateTaskStatusRequest(status=status)
        assert update.status == status


def test_checklist_progress_math():
    items = [
        {"is_done": True, "title": "Setup database migrations"},
        {"is_done": True, "title": "Write unit tests"},
        {"is_done": False, "title": "Deploy to staging"},
        {"is_done": True, "title": "Perform smoke verification"},
    ]
    done_count = sum(1 for item in items if item["is_done"])
    total_count = len(items)
    progress_pct = round((done_count / total_count) * 100) if total_count > 0 else 0

    assert done_count == 3
    assert total_count == 4
    assert progress_pct == 75


def test_task_comment_creation_with_mentions():
    mentioned_id = uuid4()
    task_id = uuid4()
    comment = CommentCreate(
        entity_type="task",
        entity_id=task_id,
        body="Hey @alice please review the pull request for this task.",
        mentioned_user_ids=[mentioned_id],
    )
    assert "@alice" in comment.body
    assert comment.mentioned_user_ids == [mentioned_id]
    assert comment.entity_type == "task"


def test_subtask_hierarchy_assignment():
    parent_id = uuid4()
    subtask = TaskCreate(
        title="Subtask: Write unit test for serializer",
        parent_task_id=parent_id,
        task_type="Testing",
        priority="P2",
    )
    assert subtask.parent_task_id == parent_id
    assert subtask.task_type == "Testing"
