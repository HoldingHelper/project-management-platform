import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, Mock, patch
from uuid import uuid4
import pytest
from app.core.current_user import CurrentUser
from app.core.exceptions import ForbiddenError
from app.modules.docs import upload_library as library
from app.modules.docs.models import DocSpace, DocPage
from app.modules.projects.models import Product, Project, Phase, TaskItem


def test_task_upload_resolves_its_product_and_project():
    product = Product(id=uuid4(), name="PMP")
    project = Project(id=uuid4(), name="Delivery", product_id=product.id)
    phase = Phase(id=uuid4(), project_id=project.id)
    task = TaskItem(id=uuid4(), title="Review", phase_id=phase.id)
    objects = {Product: product, Project: project, Phase: phase, TaskItem: task}
    db = AsyncMock()
    db.get.side_effect = lambda model, key: objects.get(model)
    assert asyncio.run(library.resolve_location(db, "task", task.id)) == (product, project, task)


def test_standalone_task_retains_its_own_workspace_scope():
    task = TaskItem(id=uuid4(), title="Backlog", phase_id=None)
    db = AsyncMock(); db.get.return_value = task
    assert asyncio.run(library.resolve_location(db, "task", task.id)) == (None, None, task)


@pytest.mark.parametrize("roles,permissions", [(["SuperAdmin"], []), (["Developer"], ["docs.manage", "docs.view"])])
def test_docs_privileges_never_bypass_source_resource_access(roles, permissions):
    space = DocSpace(id=uuid4(), product_id=uuid4(), task_id=None)
    page = DocPage(id=uuid4(), space_id=space.id, source_entity_type="project", source_entity_id=uuid4())
    actor = CurrentUser(user_id=uuid4(), email="test@example.com", full_name="Test", roles=roles, permissions=permissions)
    db = AsyncMock(); db.get.side_effect = [page, space]
    with patch("app.modules.collaboration.authorization.authorize_entity_access", AsyncMock(side_effect=ForbiddenError())):
        assert asyncio.run(library.managed_access(db, actor, "page", page.id)) is False


def test_project_page_requires_project_access_in_addition_to_product_membership():
    space = DocSpace(id=uuid4(), product_id=uuid4(), task_id=None)
    page = DocPage(id=uuid4(), space_id=space.id, source_entity_type="project", source_entity_id=uuid4())
    db = AsyncMock(); db.get.side_effect = [page, space]
    with patch("app.modules.collaboration.authorization.authorize_entity_access", AsyncMock(side_effect=[None, ForbiddenError()])) as authorize:
        assert asyncio.run(library.managed_access(db, SimpleNamespace(), "page", page.id)) is False
        assert authorize.await_count == 2


def test_index_failure_rolls_back_upload_and_removes_only_new_object():
    import io
    from app.modules.collaboration import service
    db = MagicMock(); db.flush=AsyncMock(); db.rollback=AsyncMock(); db.commit=AsyncMock()
    actor = SimpleNamespace(user_id=uuid4())
    with patch.object(service, "authorize_entity_access", AsyncMock()), patch.object(service.file_storage_service, "upload_async", AsyncMock()), patch.object(service.file_storage_service, "delete", Mock()) as remove, patch.object(library, "index_upload", AsyncMock(side_effect=RuntimeError("index failure"))):
        with pytest.raises(RuntimeError):
            asyncio.run(service.upload_file(db, entity_type="project", entity_id=uuid4(), file_name="guide.txt", content_type="text/plain", content=io.BytesIO(b"guide"), size_bytes=5, current_user=actor))
    db.rollback.assert_awaited_once(); db.commit.assert_not_awaited(); remove.assert_called_once()