from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.core.exceptions import ValidationAppError
from app.modules.projects import repository, service


class FakeSession:
    def __init__(self) -> None:
        self.commits = 0

    async def commit(self) -> None:
        self.commits += 1


@pytest.mark.asyncio
async def test_reorder_tasks_persists_the_supplied_order(monkeypatch):
    task_ids = [uuid4(), uuid4(), uuid4()]
    tasks = [
        SimpleNamespace(id=task_id, board_order=99) for task_id in reversed(task_ids)
    ]

    async def get_tasks_by_ids(_db, _task_ids):
        return tasks

    monkeypatch.setattr(repository, "get_tasks_by_ids", get_tasks_by_ids)
    db = FakeSession()

    await service.reorder_tasks(db, task_ids)  # type: ignore[arg-type]

    positions = {task.id: task.board_order for task in tasks}
    assert positions == {task_id: position for position, task_id in enumerate(task_ids)}
    assert db.commits == 1


@pytest.mark.asyncio
async def test_reorder_tasks_rejects_duplicate_ids():
    task_id = uuid4()
    db = FakeSession()

    with pytest.raises(ValidationAppError):
        await service.reorder_tasks(db, [task_id, task_id])  # type: ignore[arg-type]

    assert db.commits == 0
