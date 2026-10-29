import asyncio
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from app.core.exceptions import ValidationAppError
from app.modules.projects.models import ChecklistItem
from app.modules.projects.repository import set_task_checklist
from app.modules.projects.schemas import TaskUpdate


def database(existing):
    db = MagicMock()
    result = MagicMock()
    result.scalars.return_value.all.return_value = existing
    db.execute = AsyncMock(return_value=result)
    db.delete = AsyncMock()
    return db


def test_remove_first_item_preserves_other_identity_and_completion():
    task_id = uuid4()
    first = ChecklistItem(id=uuid4(), task_id=task_id, text="First", order=0, is_done=False)
    second = ChecklistItem(id=uuid4(), task_id=task_id, text="Second", order=1, is_done=True)
    db = database([first, second])
    asyncio.run(set_task_checklist(db, task_id, [ChecklistItem(id=second.id, text="Renamed second", order=0)], match_by_id=True))
    assert second.text == "Renamed second" and second.order == 0 and second.is_done is True
    db.delete.assert_awaited_once_with(first)
    db.add.assert_not_called()


def test_adding_item_keeps_existing_completed_items():
    task_id = uuid4()
    existing = ChecklistItem(id=uuid4(), task_id=task_id, text="Complete", order=0, is_done=True)
    new = ChecklistItem(text="Next step", order=1)
    db = database([existing])
    asyncio.run(set_task_checklist(db, task_id, [ChecklistItem(id=existing.id, text="Complete", order=0), new], match_by_id=True))
    assert existing.is_done is True
    assert new.task_id == task_id
    db.add.assert_called_once_with(new)
    db.delete.assert_not_awaited()


@pytest.mark.parametrize("duplicate", [False, True])
def test_foreign_or_duplicate_item_ids_rejected_before_mutation(duplicate):
    task_id = uuid4()
    existing = ChecklistItem(id=uuid4(), task_id=task_id, text="Original", order=0, is_done=True)
    items = [ChecklistItem(id=existing.id, text="Changed", order=0), ChecklistItem(id=existing.id if duplicate else uuid4(), text="Invalid", order=1)]
    db = database([existing])
    with pytest.raises(ValidationAppError):
        asyncio.run(set_task_checklist(db, task_id, items, match_by_id=True))
    assert existing.text == "Original"
    db.add.assert_not_called()
    db.delete.assert_not_awaited()


def test_update_distinguishes_new_items_from_legacy_position_updates():
    payload = TaskUpdate(checklist_items=[{"id": None, "text": "New", "order": 0}])
    assert "id" in payload.checklist_items[0].model_fields_set
    legacy = TaskUpdate(checklist_items=[{"text": "Legacy", "order": 0}])
    assert "id" not in legacy.checklist_items[0].model_fields_set