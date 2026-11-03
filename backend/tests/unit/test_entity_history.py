"""Entity history uses normal entity visibility, without organization-wide audit access."""
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4
from datetime import datetime, timezone

import pytest

from app.core.exceptions import ForbiddenError
from app.modules.projects import router
from app.modules.analytics import service


@pytest.mark.asyncio
@pytest.mark.parametrize("entity", ["project", "task"])
async def test_history_requires_entity_access_before_reading_logs(monkeypatch, entity):
    guard = AsyncMock(side_effect=ForbiddenError("Not a member"))
    read = AsyncMock()
    monkeypatch.setattr(router, f"_require_{entity}_access", guard)
    monkeypatch.setattr(router, "get_entity_history", read)
    with pytest.raises(ForbiddenError):
        await getattr(router, f"get_{entity}_history")(uuid4(), SimpleNamespace(), AsyncMock())
    read.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("entity, model", [("project", "projects.Project"), ("task", "projects.TaskItem")])
async def test_history_is_filtered_to_the_authorized_entity(monkeypatch, entity, model):
    guard = AsyncMock()
    read = AsyncMock(return_value=[])
    monkeypatch.setattr(router, f"_require_{entity}_access", guard)
    monkeypatch.setattr(router, "get_entity_history", read)
    db, user, entity_id = AsyncMock(), SimpleNamespace(), uuid4()
    assert await getattr(router, f"get_{entity}_history")(entity_id, user, db) == []
    guard.assert_awaited_once_with(db, user, entity_id)
    read.assert_awaited_once_with(db, model, entity_id)


@pytest.mark.asyncio
async def test_history_includes_names_without_exposing_request_metadata(monkeypatch):
    from app.modules.identity import service as identity
    actor, entity = uuid4(), uuid4()
    row = SimpleNamespace(id=uuid4(), user_id=actor, entity_type="projects.TaskItem", entity_id=str(entity), action_type="Update", changes_json='{"title":{"old":"a","new":"b"}}', occurred_at=datetime.now(timezone.utc), ip_address="127.0.0.1", correlation_id="internal")
    monkeypatch.setattr(service.repo, "list_audit_logs_for_entity", AsyncMock(return_value=[row]))
    monkeypatch.setattr(identity, "get_user_summaries", AsyncMock(return_value=[SimpleNamespace(user_id=actor, full_name="Editor")]))
    logs = await service.get_entity_history(AsyncMock(), "projects.TaskItem", entity)
    assert logs[0].user_name == "Editor"
    assert "ip_address" not in logs[0].model_dump()
    assert "correlation_id" not in logs[0].model_dump()
