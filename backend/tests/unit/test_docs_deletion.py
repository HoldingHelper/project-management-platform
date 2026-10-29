import asyncio
from contextlib import ExitStack
from types import SimpleNamespace as NS
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from app.core.current_user import CurrentUser
from app.core.exceptions import ForbiddenError
from app.modules.docs import deletion
from app.modules.collaboration import document_deletion


def user(role="Developer"):
    return CurrentUser(user_id=uuid4(), email="test@example.com", full_name="Test", roles=[role], permissions=["docs.manage", "projects.manage_all"])


def native_page(owner):
    return NS(id=uuid4(), space_id=uuid4(), parent_page_id=None, source_attachment_id=None, source_entity_type=None, created_by=owner, responsible_user_id=None)


def page_policy(actor, page, links=(), manager_error=None):
    with ExitStack() as stack:
        stack.enter_context(patch("app.modules.docs.service.get_page", AsyncMock()))
        stack.enter_context(patch.object(deletion.repo, "list_links", AsyncMock(return_value=list(links))))
        stack.enter_context(patch.object(deletion.repo, "get_space", AsyncMock(return_value=NS(product_id=None, task_id=None, node_id=None))))
        stack.enter_context(patch("app.modules.collaboration.authorization.authorize_entity_access", AsyncMock()))
        stack.enter_context(patch("app.modules.docs.upload_library.resolve_location", AsyncMock(return_value=(NS(owner_user_id=uuid4()), NS(id=uuid4()), None))))
        manager = stack.enter_context(patch.object(document_deletion, "require_project_document_manager", AsyncMock(side_effect=manager_error)))
        asyncio.run(deletion.require_page_delete_access(AsyncMock(), actor, page))
        return manager


@pytest.mark.parametrize("role", ["Developer", "SuperAdmin", "CLevel"])
def test_native_owner_and_executives_can_delete(role):
    actor = user(role)
    page_policy(actor, native_page(actor.user_id if role == "Developer" else uuid4()))


def test_global_docs_manage_does_not_grant_deletion_of_someone_elses_doc():
    with pytest.raises(ForbiddenError):
        page_policy(user(), native_page(uuid4()))


def test_project_manager_can_delete_native_doc_linked_to_managed_project():
    actor = user("ProjectManager")
    manager = page_policy(actor, native_page(uuid4()), [NS(entity_type="project", entity_id=uuid4())])
    manager.assert_awaited_once()


def test_project_manager_creator_cannot_delete_other_project_doc():
    actor = user("ProjectManager")
    with pytest.raises(ForbiddenError):
        page_policy(actor, native_page(actor.user_id), [NS(entity_type="project", entity_id=uuid4())], ForbiddenError())


def test_shared_native_doc_requires_every_linked_project_to_be_managed():
    actor = user("ProjectManager")
    with pytest.raises(ForbiddenError):
        page_policy(actor, native_page(uuid4()), [NS(entity_type="project", entity_id=uuid4()), NS(entity_type="project", entity_id=uuid4())], [None, ForbiddenError()])


def test_project_manager_cannot_delete_other_users_unassigned_doc():
    with pytest.raises(ForbiddenError):
        page_policy(user("ProjectManager"), native_page(uuid4()))


def test_upload_ownership_does_not_bypass_project_manager_boundary():
    actor = user("ProjectManager")
    file = NS(entity_type="project", entity_id=uuid4(), uploaded_by_user_id=actor.user_id)
    with patch.object(document_deletion, "authorize_entity_access", AsyncMock()), patch.object(document_deletion, "resolve_location", AsyncMock(return_value=(NS(owner_user_id=actor.user_id), NS(id=file.entity_id), None))), patch.object(document_deletion, "require_project_document_manager", AsyncMock(side_effect=ForbiddenError())):
        with pytest.raises(ForbiddenError):
            asyncio.run(document_deletion.require_delete_access(AsyncMock(), actor, file))


@pytest.mark.parametrize("role,allowed", [("ProjectManager", True), ("Developer", False), (None, False)])
def test_broad_project_permission_still_requires_manager_assignment(role, allowed):
    actor = user("ProjectManager")
    with patch("app.modules.projects.repository.get_project_member_role", AsyncMock(return_value=role)):
        if allowed:
            asyncio.run(document_deletion.require_project_document_manager(AsyncMock(), actor, NS(id=uuid4(), org_node_id=None)))
        else:
            with pytest.raises(ForbiddenError):
                asyncio.run(document_deletion.require_project_document_manager(AsyncMock(), actor, NS(id=uuid4(), org_node_id=None)))


def test_upload_folder_cannot_be_deleted_as_a_document():
    actor = user("SuperAdmin")
    page = native_page(actor.user_id); page.source_entity_type = "project"
    with pytest.raises(ForbiddenError):
        page_policy(actor, page)


def test_native_doc_creation_accepts_default_tags_and_current_relation_signatures():
    from app.modules.docs import service
    from app.modules.docs.schemas import PageCreate
    db = MagicMock(); db.commit = AsyncMock(); db.refresh = AsyncMock()
    actor = user("SuperAdmin")
    with patch.object(service.repo, "get_space", AsyncMock(return_value=NS(visibility="workspace"))), patch.object(service, "_unique_page_slug", AsyncMock(return_value="new-document")), patch.object(service, "resolve_stubs_for_new_page", autospec=True), patch.object(service, "sync_page_relations", autospec=True), patch.object(service.PageRead, "model_validate", return_value=NS(title="New document")):
        result = asyncio.run(service.create_page(db, actor, uuid4(), PageCreate(title="New document")))
    assert result.title == "New document"
