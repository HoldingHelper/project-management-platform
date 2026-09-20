from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.core.current_user import CurrentUser
from app.core.deps import get_current_user
from app.core.exceptions import BusinessRuleError, ForbiddenError
from app.core.permissions import (
    ROLE_C_LEVEL,
    ROLE_COMPANY_MANAGER,
    ROLE_PERMISSIONS,
    ROLE_PROJECT_MANAGER,
    ROLE_TEAM_LEAD,
    Permissions,
)
from app.modules.projects import service
from app.modules.projects.router import tasks_router
from app.modules.projects.schemas import ProjectAdminTransfer


def current_user(*, user_id=None, permissions=None) -> CurrentUser:
    return CurrentUser(
        user_id=user_id or uuid4(),
        email="member@example.com",
        full_name="Project Member",
        permissions=permissions or [],
    )


def test_manual_project_creation_is_granted_to_requested_roles():
    for role in (
        ROLE_C_LEVEL,
        ROLE_COMPANY_MANAGER,
        ROLE_PROJECT_MANAGER,
        ROLE_TEAM_LEAD,
    ):
        assert Permissions.PROJECTS_CREATE in ROLE_PERMISSIONS[role]


def test_task_creation_requires_authentication_without_a_role_permission():
    route = next(
        route
        for route in tasks_router.routes
        if route.path == "/tasks" and "POST" in route.methods
    )
    current_user_dependency = next(
        dependency
        for dependency in route.dependant.dependencies
        if dependency.name == "current_user"
    )

    assert current_user_dependency.call is get_current_user


def test_project_admin_transfer_rejects_an_admin_fallback_role():
    with pytest.raises(ValidationError, match="non-admin role"):
        ProjectAdminTransfer(
            new_admin_user_id=uuid4(),
            previous_admin_role="ProjectManager",
        )


@pytest.mark.asyncio
async def test_project_admin_can_transfer_admin_role(monkeypatch):
    project_id = uuid4()
    old_admin_id = uuid4()
    new_admin_id = uuid4()
    members = [
        SimpleNamespace(
            project_id=project_id,
            user_id=old_admin_id,
            role="ProjectManager",
        ),
        SimpleNamespace(
            project_id=project_id,
            user_id=new_admin_id,
            role="Developer",
        ),
    ]
    monkeypatch.setattr(service.repo, "get_project", AsyncMock(return_value=object()))
    monkeypatch.setattr(
        service.repo, "list_project_members", AsyncMock(return_value=members)
    )
    db = AsyncMock()

    result = await service.transfer_project_admin(
        db,
        project_id,
        ProjectAdminTransfer(
            new_admin_user_id=new_admin_id,
            previous_admin_role="TeamLead",
        ),
    )

    assert members[0].role == "TeamLead"
    assert members[1].role == "ProjectManager"
    assert result.user_id == new_admin_id
    assert result.role == "ProjectManager"
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_last_project_admin_must_be_transferred_before_removal(monkeypatch):
    project_id = uuid4()
    admin_id = uuid4()
    monkeypatch.setattr(
        service.repo,
        "list_project_members",
        AsyncMock(
            return_value=[
                SimpleNamespace(
                    project_id=project_id,
                    user_id=admin_id,
                    role="ProjectManager",
                )
            ]
        ),
    )
    remove = AsyncMock()
    monkeypatch.setattr(service.repo, "remove_project_member", remove)

    with pytest.raises(BusinessRuleError, match="Transfer project admin"):
        await service.remove_project_member(AsyncMock(), project_id, admin_id)

    remove.assert_not_awaited()


@pytest.mark.asyncio
async def test_project_member_without_global_task_permissions_can_move_board_tasks(
    monkeypatch,
):
    user = current_user()
    project_id = uuid4()
    phase_id = uuid4()
    task_id = uuid4()
    monkeypatch.setattr(
        service.repo,
        "get_task",
        AsyncMock(return_value=SimpleNamespace(id=task_id, phase_id=phase_id)),
    )
    monkeypatch.setattr(
        service.repo,
        "get_phase",
        AsyncMock(return_value=SimpleNamespace(id=phase_id, project_id=project_id)),
    )
    monkeypatch.setattr(
        service.repo,
        "get_project_member_role",
        AsyncMock(return_value="Observer"),
    )

    await service.require_task_board_access(AsyncMock(), user, [task_id])


@pytest.mark.asyncio
async def test_non_member_without_task_permissions_cannot_move_board_tasks(monkeypatch):
    user = current_user()
    phase_id = uuid4()
    task_id = uuid4()
    monkeypatch.setattr(
        service.repo,
        "get_task",
        AsyncMock(return_value=SimpleNamespace(id=task_id, phase_id=phase_id)),
    )
    monkeypatch.setattr(
        service.repo,
        "get_phase",
        AsyncMock(return_value=SimpleNamespace(id=phase_id, project_id=uuid4())),
    )
    monkeypatch.setattr(
        service.repo,
        "get_project_member_role",
        AsyncMock(return_value=None),
    )

    with pytest.raises(ForbiddenError, match="Only project members"):
        await service.require_task_board_access(AsyncMock(), user, [task_id])
