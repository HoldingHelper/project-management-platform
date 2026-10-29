"""Eligibility applies at the shared service boundary, independent of role."""
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.core.exceptions import ForbiddenError, NotFoundError, ValidationAppError
from app.core.current_user import CurrentUser
from app.modules.projects import membership, router


@pytest.mark.asyncio
async def test_owner_is_implicit_product_member_and_outsider_is_rejected(monkeypatch):
    owner, outsider, product_id = uuid4(), uuid4(), uuid4()
    monkeypatch.setattr(membership, "lock_product", AsyncMock(return_value=SimpleNamespace(owner_user_id=owner)))
    result = MagicMock()
    result.scalars.return_value.all.return_value = []
    db = AsyncMock()
    db.execute.return_value = result
    await membership.require_product_members(db, product_id, [owner])
    with pytest.raises(ValidationAppError):
        await membership.require_product_members(db, product_id, [outsider])


@pytest.mark.asyncio
async def test_backlog_requires_no_assignees():
    db = AsyncMock()
    await membership.require_project_assignees(db, None, [])
    with pytest.raises(ValidationAppError, match="project and sprint"):
        await membership.require_project_assignees(db, None, [uuid4()])
    db.execute.assert_not_awaited()


@pytest.mark.asyncio
async def test_missing_sprint_cannot_be_used_for_assignment():
    db = AsyncMock()
    db.get.return_value = None
    with pytest.raises(NotFoundError):
        await membership.require_project_assignees(db, uuid4(), [uuid4()])


@pytest.mark.asyncio
@pytest.mark.parametrize("target,guard,reader", [
    (router.get_product_members, "require_product_access", "product_people"),
    (router.get_assignment_candidates, "_require_project_access", "project_people"),
    (router.get_task_assignment_candidates, "_require_task_access", "project_people"),
])
async def test_roster_endpoints_do_not_disclose_inaccessible_people(monkeypatch, target, guard, reader):
    monkeypatch.setattr(router, guard, AsyncMock(side_effect=ForbiddenError("No access")))
    read = AsyncMock()
    monkeypatch.setattr(membership, reader, read)
    actor = CurrentUser(user_id=uuid4(), email="test@example.com", full_name="Test")
    with pytest.raises(ForbiddenError):
        await target(uuid4(), actor, AsyncMock())
    read.assert_not_awaited()
