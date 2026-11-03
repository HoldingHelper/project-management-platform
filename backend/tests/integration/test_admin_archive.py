"""Archive permissions and restoration against PostgreSQL; all writes roll back."""
import os
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.current_user import CurrentUser
from app.core.database import engine
from app.core.exceptions import ForbiddenError
from app.modules.identity.models import User
from app.modules.projects import router, service
from app.modules.projects.enums import TaskStatus
from app.modules.projects.models import Product, Project, TaskItem
from app.modules.projects.schemas import ProjectUpdate

pytestmark = pytest.mark.skipif(os.getenv("PMP_MEMBERSHIP_DB_TESTS") != "1", reason="Local PostgreSQL opt-in")


@pytest.mark.asyncio
async def test_archive_list_and_restore_require_super_admin(monkeypatch):
    monkeypatch.setattr(service.event_bus, "publish", AsyncMock())
    async with engine.connect() as connection:
        root = await connection.begin()
        async with AsyncSession(bind=connection, expire_on_commit=False, join_transaction_mode="create_savepoint") as db:
            try:
                user_id = (await db.execute(select(User.id).where(User.is_active.is_(True)).limit(1))).scalar_one()
                admin = CurrentUser(user_id, "admin@example.com", "Admin", ["SuperAdmin"], [])
                regular = CurrentUser(user_id, "user@example.com", "User", ["ProjectManager"], ["projects.manage_all"])
                scoped = CurrentUser(user_id, "admin@example.com", "Scoped", ["SuperAdmin"], ["projects.manage_all"], allow_role_bypass=False)
                product = Product(name=f"Archive test {uuid4()}", owner_user_id=user_id)
                db.add(product); await db.flush()
                project = Project(product_id=product.id, name="Archive test project", status="on-hold")
                task = TaskItem(title="Archive test task", status="InProgress")
                db.add_all([project, task]); await db.flush()
                await service.archive_project(db, project.id)
                await service.update_task_status(db, task.id, TaskStatus.ARCHIVED, user_id, regular)
                assert project.archived_from_status == "on-hold"
                assert task.archived_from_status == "InProgress"
                for actor in (regular, scoped):
                    with pytest.raises(ForbiddenError):
                        await service.update_project(db, project.id, ProjectUpdate(status="in-progress"), actor)
                    with pytest.raises(ForbiddenError):
                        await service.update_task_status(db, task.id, TaskStatus.READY, user_id, actor)
                    with pytest.raises(ForbiddenError):
                        await router.archive_items(actor, db)
                    with pytest.raises(ForbiddenError):
                        await router.restore_archived_item("projects", project.id, actor, db)
                result = await router.archive_items(admin, db)
                assert project.id in {item["id"] for item in result["projects"]}
                assert task.id in {item["id"] for item in result["tasks"]}
                await router.restore_archived_item("projects", project.id, admin, db)
                await router.restore_archived_item("tasks", task.id, admin, db)
                assert project.status == "on-hold" and project.archived_from_status is None
                assert task.status == "InProgress" and task.archived_from_status is None
            finally:
                await db.close()
                await root.rollback()
    await engine.dispose()

@pytest.mark.asyncio
async def test_archived_entities_are_hidden_and_deletion_is_forbidden(monkeypatch):
    from app.core.exceptions import NotFoundError
    from app.modules.collaboration.authorization import _require_project_access, _require_task_access
    from app.modules.projects.product_access import require_product_access
    monkeypatch.setattr(service.event_bus, "publish", AsyncMock())
    async with engine.connect() as connection:
        root = await connection.begin()
        async with AsyncSession(bind=connection, expire_on_commit=False, join_transaction_mode="create_savepoint") as db:
            try:
                user_id = (await db.execute(select(User.id).where(User.is_active.is_(True)).limit(1))).scalar_one()
                regular = CurrentUser(user_id, "user@example.com", "User", ["CLevel"], ["projects.manage_all", "tasks.view", "products.manage_all"])
                admin = CurrentUser(user_id, "admin@example.com", "Admin", ["SuperAdmin"], [])
                product = Product(name=f"Visibility test {uuid4()}", owner_user_id=user_id, status="Active")
                db.add(product); await db.flush()
                project = Project(product_id=product.id, name="Hidden project", status="in-progress")
                task = TaskItem(title="Hidden task", status="Ready")
                db.add_all([project, task]); await db.flush()
                for fn, item_id in ((service.delete_product, product.id), (service.delete_project, project.id), (service.delete_task, task.id)):
                    with pytest.raises(ForbiddenError):
                        await fn(db, item_id)
                await service.update_task_status(db, task.id, TaskStatus.ARCHIVED, user_id, regular)
                await service.archive_project(db, project.id)
                with pytest.raises(NotFoundError):
                    await _require_project_access(db, regular, project.id)
                with pytest.raises(NotFoundError):
                    await _require_task_access(db, regular, task.id)
                rows, _ = await service.list_all_projects(db, 1, 1000, regular)
                assert project.id not in {row.id for row in rows}
                rows, _ = await service.list_tasks(db, current_user=regular, page_size=1000)
                assert task.id not in {row.id for row in rows}
                await service.archive_product(db, product.id)
                with pytest.raises(NotFoundError):
                    await require_product_access(db, regular, product.id)
                rows, _ = await service.list_products(db, 1, 1000, regular)
                assert product.id not in {row.id for row in rows}
                assert product.id in {row["id"] for row in (await router.archive_items(admin, db))["products"]}
                await router.restore_archived_item("products", product.id, admin, db)
                assert product.status == "Active"
            finally:
                await db.close(); await root.rollback()
    await engine.dispose()

@pytest.mark.asyncio
async def test_archived_file_download_is_denied_to_owner_and_allowed_to_admin(monkeypatch):
    from app.core.exceptions import NotFoundError
    from app.core.storage import file_storage_service
    from app.modules.collaboration.models import FileAttachment
    from app.modules.collaboration.router import download_file
    from app.modules.docs.models import DocPage, DocSpace
    monkeypatch.setattr(file_storage_service, "download_async", AsyncMock(return_value=b"private file"))
    async with engine.connect() as connection:
        root = await connection.begin()
        async with AsyncSession(bind=connection, expire_on_commit=False, join_transaction_mode="create_savepoint") as db:
            try:
                user_id = (await db.execute(select(User.id).where(User.is_active.is_(True)).limit(1))).scalar_one()
                owner = CurrentUser(user_id, "owner@example.com", "Owner", ["Developer"], ["tasks.view"])
                admin = CurrentUser(user_id, "admin@example.com", "Admin", ["SuperAdmin"], [])
                task = TaskItem(title="File visibility task", status="Ready")
                db.add(task); await db.flush()
                attachment = FileAttachment(entity_type="task", entity_id=task.id, file_name="private.txt", content_type="text/plain", size_bytes=12, storage_key=f"test/{uuid4()}", uploaded_by_user_id=user_id)
                space = DocSpace(name=f"File test {uuid4()}", slug=f"file-test-{uuid4()}", visibility="workspace", created_by=user_id)
                db.add_all([attachment, space]); await db.flush()
                page = DocPage(space_id=space.id, title="Private file", slug=f"file-{uuid4()}", content="", content_json={}, status="archived", archived_from_status="published", visibility="inherit", created_by=user_id, updated_by=user_id, source_attachment_id=attachment.id, source_entity_type="task", source_entity_id=task.id)
                db.add(page); await db.flush()
                with pytest.raises(NotFoundError):
                    await download_file(attachment.id, owner, db)
                assert (await download_file(attachment.id, admin, db)).body == b"private file"
            finally:
                await db.close(); await root.rollback()
    await engine.dispose()
