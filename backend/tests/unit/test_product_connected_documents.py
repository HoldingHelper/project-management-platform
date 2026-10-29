import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from app.core.current_user import CurrentUser
from app.core.exceptions import ForbiddenError
from app.modules.docs import service
from app.modules.docs.schemas import LinkCreate


def test_product_is_supported_as_document_link_target():
    assert LinkCreate(entity_type="product", entity_id=uuid4()).entity_type == "product"


def test_nonmembers_cannot_list_product_document_links():
    db = AsyncMock()
    with patch("app.modules.projects.product_access.require_product_access", AsyncMock(side_effect=ForbiddenError())), patch.object(service.repo, "list_links_by_entity", AsyncMock()) as links:
        with pytest.raises(ForbiddenError):
            asyncio.run(service.list_entity_links(db, SimpleNamespace(), "product", uuid4()))
        links.assert_not_awaited()


@pytest.mark.parametrize("roles,permissions,allowed", [(["SuperAdmin"], [], True), (["CLevel"], ["products.update"], True), (["Developer"], [], False)])
def test_modifying_connections_requires_product_edit_permission(roles, permissions, allowed):
    actor = CurrentUser(user_id=uuid4(), email="test@example.com", full_name="Test", roles=roles, permissions=permissions)
    with patch("app.modules.projects.product_access.require_product_access", AsyncMock()):
        if allowed:
            asyncio.run(service._authorize_product_link(AsyncMock(), actor, uuid4(), manage=True))
        else:
            with pytest.raises(ForbiddenError):
                asyncio.run(service._authorize_product_link(AsyncMock(), actor, uuid4(), manage=True))