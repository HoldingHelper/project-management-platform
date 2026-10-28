"""Product-line creation uses its own permission and honors scoped tokens."""
from datetime import datetime, timezone
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.current_user import CurrentUser
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.exceptions import ForbiddenError
from app.core.permissions import Permissions, permissions_for_roles
from app.modules.projects.router import products_router
from app.modules.projects import service


@pytest.mark.parametrize("roles,permissions,bypass,allowed", [
    (["SuperAdmin"], [], True, True),
    (["CLevel"], [Permissions.PRODUCTS_CREATE], True, True),
    (["CompanyManager"], [], True, False),
    (["Developer"], [], True, False),
    (["CLevel"], [], True, False),
    (["SuperAdmin"], [], False, False),
    ([], [Permissions.PRODUCTS_MANAGE_ALL], False, True),
])
def test_product_creation_authorization(monkeypatch, roles, permissions, bypass, allowed):
    app = FastAPI()
    app.include_router(products_router)
    user_id = uuid4()
    user = CurrentUser(user_id=user_id, email="test@example.com", full_name="Test", roles=roles, permissions=permissions, allow_role_bypass=bypass)
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: AsyncMock()
    now = datetime.now(timezone.utc)
    create = AsyncMock(return_value=dict(id=uuid4(), name="Example", owner_user_id=user_id, status="Planning", technology_stack=[], environment="Development", priority="P2", created_at=now, updated_at=now))
    monkeypatch.setattr(service, "create_product", create)
    with TestClient(app) as client:
        if allowed:
            response = client.post("/products", json={"name": "Example", "owner_user_id": str(user_id)})
            assert response.status_code == 201
            create.assert_awaited_once()
        else:
            with pytest.raises(ForbiddenError):
                client.post("/products", json={"name": "Example", "owner_user_id": str(user_id)})
            create.assert_not_awaited()


def test_product_creation_defaults_are_limited_to_executives():
    assert Permissions.PRODUCTS_CREATE in permissions_for_roles(["CLevel"])
    assert Permissions.PRODUCTS_CREATE in permissions_for_roles(["SuperAdmin"])
    assert Permissions.PRODUCTS_CREATE not in permissions_for_roles(["CompanyManager"])
    assert Permissions.PRODUCTS_MANAGE_ALL not in permissions_for_roles(["CLevel"])
