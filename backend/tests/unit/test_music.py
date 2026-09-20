from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.core.exceptions import ForbiddenError
from app.modules.music import service


class MockSession:
    def __init__(self) -> None:
        self.deleted = []
        self.committed = False

    async def delete(self, value):
        self.deleted.append(value)

    async def commit(self):
        self.committed = True


@pytest.mark.asyncio
async def test_only_music_channel_creator_can_delete(monkeypatch):
    owner_id = uuid4()
    channel_id = uuid4()
    channel = SimpleNamespace(id=channel_id, owner_user_id=owner_id)

    async def require_channel(_db, _channel_id):
        return channel

    async def broadcast(*_args, **_kwargs):
        pass

    monkeypatch.setattr(service, "_require_channel", require_channel)
    monkeypatch.setattr(service.connection_manager, "broadcast_to_group", broadcast)

    denied_session = MockSession()
    with pytest.raises(ForbiddenError):
        await service.delete_channel(denied_session, channel_id, uuid4())  # type: ignore[arg-type]
    assert denied_session.deleted == []

    owner_session = MockSession()
    await service.delete_channel(owner_session, channel_id, owner_id)  # type: ignore[arg-type]
    assert owner_session.deleted == [channel]
    assert owner_session.committed is True
