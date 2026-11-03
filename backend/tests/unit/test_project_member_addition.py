"""Regression checks for the post-creation member setup endpoint."""
import asyncio
import pytest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from app.core.exceptions import NotFoundError
from app.modules.projects import service
from app.modules.projects.schemas import ProjectMemberCreate


@pytest.fixture(autouse=True)
def membership_guards(monkeypatch):
    monkeypatch.setattr(service, "record_audit_change", MagicMock())
    # Audit capture has real database coverage in test_entity_history.
    # These tests isolate insert/event idempotency; real eligibility is covered
    # by the database-backed product membership regression test.
    monkeypatch.setattr(service.membership, "lock_project", AsyncMock(return_value=SimpleNamespace(name="Project", product_id=uuid4())))
    monkeypatch.setattr(service.membership, "active_users", AsyncMock())
    monkeypatch.setattr(service.membership, "require_product_members", AsyncMock())

def test_add_project_member_publishes_once_after_insert():
    user_id, project_id = uuid4(), uuid4()
    db = AsyncMock()
    db.get.return_value = SimpleNamespace(id=user_id)
    result = MagicMock()
    result.scalar_one_or_none.return_value = user_id
    db.execute.return_value = result
    with patch.object(service.repo, "get_project", AsyncMock(return_value=SimpleNamespace(name="Project"))), patch.object(service.event_bus, "publish", AsyncMock()) as publish:
        asyncio.run(service.add_project_member(db, project_id, ProjectMemberCreate(user_id=user_id, role="Developer")))
        db.commit.assert_awaited_once()
        publish.assert_awaited_once()
        assert publish.await_args.args[0].user_id == user_id


def test_readding_member_does_not_publish_or_change_role():
    db = AsyncMock()
    db.get.return_value = SimpleNamespace(id=uuid4())
    result = MagicMock()
    result.scalar_one_or_none.return_value = None
    db.execute.return_value = result
    with patch.object(service.repo, "get_project", AsyncMock(return_value=SimpleNamespace(name="Project"))), patch.object(service.event_bus, "publish", AsyncMock()) as publish:
        asyncio.run(service.add_project_member(db, uuid4(), ProjectMemberCreate(user_id=uuid4(), role="Developer")))
        db.commit.assert_awaited_once()
        publish.assert_not_awaited()
        statement = db.execute.await_args.args[0]
        assert "ON CONFLICT (project_id, user_id) DO NOTHING" in str(statement)


def test_nonexistent_user_cannot_be_added():
    db = AsyncMock()
    db.get.return_value = None
    with patch.object(service.repo, "get_project", AsyncMock(return_value=SimpleNamespace(name="Project"))):
        try:
            asyncio.run(service.add_project_member(db, uuid4(), ProjectMemberCreate(user_id=uuid4(), role="Developer")))
        except NotFoundError:
            pass
        else:
            raise AssertionError("Missing user was accepted")
        db.execute.assert_not_awaited()
        db.commit.assert_not_awaited()
