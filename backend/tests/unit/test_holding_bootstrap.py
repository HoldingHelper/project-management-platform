"""Holding initialization must follow identity seeding and preserve existing ACLs."""
import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

from app.modules.org.bootstrap import bootstrap_holding
from app.modules.org.models import Membership, OrgNode


def result(*, first=None, rows=()):
    value = MagicMock()
    value.scalars.return_value.first.return_value = first
    value.scalars.return_value.all.return_value = rows
    return value


def database(*results):
    db = MagicMock()
    db.execute = AsyncMock(side_effect=results)
    db.flush = AsyncMock()
    return db


def test_bootstrap_creates_root_and_owner_memberships_after_admin_exists():
    admins = [SimpleNamespace(id=uuid4()), SimpleNamespace(id=uuid4())]
    db = database(result(), result(), result(rows=admins))
    asyncio.run(bootstrap_holding(db))
    added = [call.args[0] for call in db.add.call_args_list]
    root = added[0]
    assert isinstance(root, OrgNode)
    assert root.type == "holding" and root.slug == "holding"
    assert root.created_by == admins[0].id
    memberships = added[1:]
    assert len(memberships) == 2
    assert all(isinstance(m, Membership) and m.role == "holding_owner" and m.node_id == root.id for m in memberships)
    assert {m.person_id for m in memberships} == {admin.id for admin in admins}


def test_bootstrap_does_not_duplicate_root_or_restore_existing_memberships():
    db = database(result(), result(first=SimpleNamespace(id=uuid4())))
    asyncio.run(bootstrap_holding(db))
    db.add.assert_not_called()
    assert db.execute.await_count == 2


def test_bootstrap_waits_for_an_admin_instead_of_creating_unowned_root():
    db = database(result(), result(), result())
    asyncio.run(bootstrap_holding(db))
    db.add.assert_not_called()
