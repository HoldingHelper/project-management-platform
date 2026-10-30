"""Product removal is permission checked and never cascades into projects."""
import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.current_user import CurrentUser
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.exceptions import BusinessRuleError, ForbiddenError, NotFoundError
from app.core.permissions import Permissions, permissions_for_roles
from app.modules.projects.router import products_router
from app.modules.projects import service


@pytest.mark.parametrize("roles,permissions,bypass,allowed", [
    (["SuperAdmin"], [], True, True),
    (["CLevel"], [Permissions.PRODUCTS_DELETE], True, True),
    (["CompanyManager"], [], True, False),
    (["Developer"], [], True, False),
    (["CLevel"], [Permissions.PRODUCTS_CREATE], True, False),
    (["SuperAdmin"], [], False, False),
    ([], [Permissions.PRODUCTS_MANAGE_ALL], False, True),
])
def test_product_removal_authorization(monkeypatch, roles, permissions, bypass, allowed):
    app = FastAPI()
    app.include_router(products_router)
    actor = CurrentUser(user_id=uuid4(), email="test@example.com", full_name="Test", roles=roles, permissions=permissions, allow_role_bypass=bypass)
    app.dependency_overrides[get_current_user] = lambda: actor
    app.dependency_overrides[get_db] = lambda: AsyncMock()
    remove = AsyncMock()
    monkeypatch.setattr(service, "delete_product", remove)
    with TestClient(app) as client:
        if allowed:
            response = client.delete(f"/products/{uuid4()}")
            assert response.status_code == 204 and response.content == b""
            remove.assert_awaited_once()
        else:
            with pytest.raises(ForbiddenError):
                client.delete(f"/products/{uuid4()}")
            remove.assert_not_awaited()


def result(value):
    mocked = MagicMock()
    mocked.scalar_one_or_none.return_value = value
    return mocked


def test_product_with_projects_cannot_be_removed():
    db = AsyncMock()
    db.execute.side_effect = [result(SimpleNamespace(id=uuid4())), result(uuid4())]
    with pytest.raises(BusinessRuleError, match="has projects"):
        asyncio.run(service.delete_product(db, uuid4()))
    db.commit.assert_not_awaited()
    assert db.execute.await_count == 2


def test_empty_product_can_be_removed():
    db = AsyncMock()
    files = MagicMock(); files.scalars.return_value.all.return_value = []
    db.execute.side_effect = [result(SimpleNamespace(id=uuid4())), result(None), files, result(None), MagicMock(), MagicMock()]
    asyncio.run(service.delete_product(db, uuid4()))
    db.commit.assert_awaited_once()
    assert db.execute.await_count == 6


def test_missing_product_returns_not_found():
    db = AsyncMock()
    db.execute.return_value = result(None)
    with pytest.raises(NotFoundError):
        asyncio.run(service.delete_product(db, uuid4()))
    db.commit.assert_not_awaited()


def test_product_removal_default_roles():
    assert Permissions.PRODUCTS_DELETE in permissions_for_roles(["CLevel"])
    assert Permissions.PRODUCTS_DELETE in permissions_for_roles(["SuperAdmin"])
    assert Permissions.PRODUCTS_DELETE not in permissions_for_roles(["CompanyManager"])


def test_product_with_retained_documents_cannot_be_removed():
    db = AsyncMock()
    files = MagicMock(); files.scalars.return_value.all.return_value = [SimpleNamespace(id=uuid4())]
    db.execute.side_effect = [result(SimpleNamespace(id=uuid4())), result(None), files]
    with pytest.raises(BusinessRuleError, match="retains documents"):
        asyncio.run(service.delete_product(db, uuid4()))
    db.commit.assert_not_awaited()
