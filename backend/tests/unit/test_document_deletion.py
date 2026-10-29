import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch
from uuid import uuid4

import pytest
from app.core.current_user import CurrentUser
from app.core.exceptions import ForbiddenError
from app.modules.collaboration import document_deletion as service


def actor(roles=()):
    return CurrentUser(user_id=uuid4(), email="test@example.com", full_name="Test", roles=list(roles))


@pytest.mark.parametrize("role", ["SuperAdmin", "CLevel", "CompanyManager", "ProjectManager", "owner", "product-owner"])
def test_authorized_document_deletion(role):
    user = actor([role])
    file = SimpleNamespace(entity_type="project", entity_id=uuid4(), uploaded_by_user_id=user.user_id if role == "owner" else uuid4())
    product = SimpleNamespace(owner_user_id=user.user_id if role == "product-owner" else uuid4())
    project = SimpleNamespace(id=file.entity_id)
    with patch.object(service, "authorize_entity_access", AsyncMock()), patch.object(service, "resolve_location", AsyncMock(return_value=(product, project, None))), patch("app.modules.projects.service.require_project_manage_access", AsyncMock()) as manage, patch.object(service, "require_project_document_manager", AsyncMock()) as project_manager:
        asyncio.run(service.require_delete_access(AsyncMock(), user, file))
        if role == "CompanyManager":
            manage.assert_awaited_once()
        if role == "ProjectManager":
            project_manager.assert_awaited_once()


@pytest.mark.parametrize("role", ["Developer", "ProjectManager", "CompanyManager", "SuperAdmin", "owner"])
def test_no_role_or_ownership_bypasses_original_resource_access(role):
    user = actor([role])
    file = SimpleNamespace(entity_type="task", entity_id=uuid4(), uploaded_by_user_id=user.user_id)
    with patch.object(service, "authorize_entity_access", AsyncMock(side_effect=ForbiddenError())):
        with pytest.raises(ForbiddenError):
            asyncio.run(service.require_delete_access(AsyncMock(), user, file))


@pytest.mark.parametrize("role", ["Developer", "ProjectManager"])
def test_member_or_unassigned_manager_cannot_delete(role):
    user = actor([role])
    file = SimpleNamespace(entity_type="project", entity_id=uuid4(), uploaded_by_user_id=uuid4())
    with patch.object(service, "authorize_entity_access", AsyncMock()), patch.object(service, "resolve_location", AsyncMock(return_value=(SimpleNamespace(owner_user_id=uuid4()), SimpleNamespace(id=file.entity_id), None))), patch("app.modules.projects.service.require_project_manage_access", AsyncMock(side_effect=ForbiddenError())), patch.object(service, "require_project_document_manager", AsyncMock(side_effect=ForbiddenError())):
        with pytest.raises(ForbiddenError):
            asyncio.run(service.require_delete_access(AsyncMock(), user, file))


def test_delete_clears_current_product_pointer_and_removes_storage_after_commit():
    user = actor(["SuperAdmin"])
    file = SimpleNamespace(id=uuid4(), entity_type="product", entity_id=uuid4(), storage_key="test-key")
    product = SimpleNamespace(documentation_link=f"attachment:{file.id}")
    db = AsyncMock()
    db.execute.return_value = Mock(scalar_one=Mock(return_value=product))
    with patch.object(service, "get_attachment", AsyncMock(return_value=file)), patch.object(service, "require_delete_access", AsyncMock()), patch.object(service.file_storage_service, "delete", Mock()) as remove:
        asyncio.run(service.delete_document(db, user, file.id))
    assert product.documentation_link is None
    db.delete.assert_awaited_once_with(file)
    db.commit.assert_awaited_once()
    remove.assert_called_once_with("test-key")


def test_database_failure_does_not_remove_file_bytes():
    db = AsyncMock(); db.commit.side_effect = RuntimeError("database failure")
    file = SimpleNamespace(id=uuid4(), entity_type="task", storage_key="test-key")
    with patch.object(service, "get_attachment", AsyncMock(return_value=file)), patch.object(service, "require_delete_access", AsyncMock()), patch.object(service.file_storage_service, "delete", Mock()) as remove:
        with pytest.raises(RuntimeError):
            asyncio.run(service.delete_document(db, actor(), file.id))
    remove.assert_not_called()


def test_read_only_token_does_not_inherit_owner_delete_access():
    user = CurrentUser(user_id=uuid4(), email="test@example.com", full_name="Test", roles=["SuperAdmin"], permissions=["tasks.view"], allow_role_bypass=False)
    file = SimpleNamespace(entity_type="task", entity_id=uuid4(), uploaded_by_user_id=user.user_id)
    with patch.object(service, "authorize_entity_access", AsyncMock()):
        with pytest.raises(ForbiddenError):
            asyncio.run(service.require_delete_access(AsyncMock(), user, file))
