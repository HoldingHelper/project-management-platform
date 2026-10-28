"""Product-line details and permissions must respect the membership boundary."""
import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.current_user import CurrentUser
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.exceptions import ForbiddenError
from app.core.permissions import Permissions, permissions_for_roles
from app.modules.projects import product_access, service
from app.modules.projects.router import products_router


def actor(roles=(), permissions=(), bypass=True):
    return CurrentUser(user_id=uuid4(), email="test@example.com", full_name="Test", roles=list(roles), permissions=list(permissions), allow_role_bypass=bypass)


@pytest.mark.parametrize("user,allowed", [
    (actor(["SuperAdmin"]), True), (actor(["CLevel"]), True),
    (actor(["CompanyManager"], [Permissions.PRODUCTS_VIEW_ALL]), False),
    (actor(["Developer"]), False), (actor(["CLevel"], bypass=False), False),
    (actor([], [Permissions.PRODUCTS_MANAGE_ALL]), True),
])
def test_product_visibility_bypasses_are_limited(user, allowed):
    assert product_access.can_view_all_product_lines(user) == allowed


def test_non_member_cannot_read_product_details_even_with_view_all_permission():
    with patch.object(product_access, "visible_product_ids", AsyncMock(return_value=[])):
        with pytest.raises(ForbiddenError):
            asyncio.run(product_access.require_product_access(AsyncMock(), actor(["CompanyManager"], [Permissions.PRODUCTS_VIEW_ALL]), uuid4()))


def test_member_can_read_its_own_product():
    product_id = uuid4()
    with patch.object(product_access, "visible_product_ids", AsyncMock(return_value=[product_id])):
        asyncio.run(product_access.require_product_access(AsyncMock(), actor(), product_id))


@pytest.mark.parametrize("roles,permissions,allowed", [
    (["SuperAdmin"], [], True), (["CLevel"], [Permissions.PRODUCTS_UPDATE], True),
    (["CompanyManager"], [], False), (["Developer"], [], False),
])
def test_edit_endpoint_requires_management_permission(monkeypatch, roles, permissions, allowed):
    app = FastAPI()
    app.include_router(products_router)
    user = actor(roles, permissions)
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: AsyncMock()
    update = AsyncMock(side_effect=RuntimeError("Authorized handler reached"))
    monkeypatch.setattr(service, "update_product", update)
    with TestClient(app) as client:
        with pytest.raises(RuntimeError if allowed else ForbiddenError):
            client.put(f"/products/{uuid4()}", json={"description": "Updated details"})
    assert update.await_count == int(allowed)


def test_edit_defaults_exclude_company_manager():
    assert Permissions.PRODUCTS_UPDATE in permissions_for_roles(["CLevel"])
    assert Permissions.PRODUCTS_UPDATE in permissions_for_roles(["SuperAdmin"])
    assert Permissions.PRODUCTS_UPDATE not in permissions_for_roles(["CompanyManager"])
