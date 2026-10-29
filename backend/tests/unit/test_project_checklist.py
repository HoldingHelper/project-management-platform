import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from pydantic import ValidationError
from app.core.exceptions import ValidationAppError
from app.modules.projects import service
from app.modules.projects.schemas import ProjectChecklistItem, ProjectUpdate


def test_item_ids_and_completion_survive_json_storage_roundtrip():
    original = ProjectChecklistItem(text="Release review", is_done=True, order=2)
    stored = original.model_dump(mode="json")
    assert isinstance(stored["id"], str)
    restored = ProjectChecklistItem.model_validate(stored)
    assert restored.id == original.id and restored.is_done is True
    assert restored.text == original.text and restored.order == 2


@pytest.mark.parametrize("text", ["", "   ", "x" * 501])
def test_invalid_item_text_rejected(text):
    with pytest.raises(ValidationError):
        ProjectChecklistItem(text=text)


def test_duplicate_item_ids_rejected_before_project_mutation():
    item_id = uuid4()
    payload = ProjectUpdate(checklist_items=[{"id": item_id, "text": "First"}, {"id": item_id, "text": "Duplicate"}])
    db = AsyncMock()
    with patch.object(service.repo, "get_project", AsyncMock(return_value=SimpleNamespace())):
        with pytest.raises(ValidationAppError):
            asyncio.run(service.update_project(db, uuid4(), payload))
    db.commit.assert_not_awaited()