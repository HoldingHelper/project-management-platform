"""Audit regression checks against local PostgreSQL, with test data rolled back."""
from contextlib import asynccontextmanager
import json
import os
from datetime import date
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.main import app  # Registers all model mappings, without starting services.
from app.core.audit import register_audit_listeners
from app.core.database import engine
from app.core.events import event_bus
from app.core.request_context import current_user_id_var
from app.modules.identity.models import User
from app.modules.projects.models import ChecklistItem, Product, ProductMember, Project, ProjectMember, TaskItem
from app.modules.projects import repository, service
from app.modules.projects.schemas import ProjectMemberCreate, ProjectUpdate
from app.modules.analytics import event_handlers as audit_handlers, service as analytics_service

pytestmark = pytest.mark.skipif(os.getenv("PMP_HISTORY_DB_TESTS") != "1", reason="Local PostgreSQL opt-in")


@pytest.fixture(scope="module", autouse=True)
def audit_listeners():
    register_audit_listeners()


@pytest.mark.asyncio
async def test_project_date_edits_are_recorded(monkeypatch):
    events = []
    monkeypatch.setattr(event_bus, "publish_sync_fire_and_forget", events.append)
    async with engine.connect() as connection:
        transaction = await connection.begin()
        async with AsyncSession(bind=connection, expire_on_commit=False, join_transaction_mode="create_savepoint") as db:
            actor = (await db.execute(select(User.id).limit(1))).scalar_one()
            token = current_user_id_var.set(actor)
            try:
                product = Product(name=f"Date history {uuid4()}", owner_user_id=actor)
                db.add(product); await db.flush()
                project = Project(product_id=product.id, name="Date history", status="in-progress", start_date=date(2028, 1, 1), end_date=date(2028, 1, 31))
                db.add(project); await db.commit()
                events.clear()
                await service.update_project(db, project.id, ProjectUpdate(start_date=date(2028, 1, 5), end_date=date(2028, 2, 5)))
                change = next(event for event in events if event.entity_id == str(project.id))
                values = json.loads(change.changes_json)
                assert values["start_date"] == {"old": "2028-01-01", "new": "2028-01-05"}
                assert values["end_date"] == {"old": "2028-01-31", "new": "2028-02-05"}
                assert change.user_id == actor
            finally:
                current_user_id_var.reset(token)
                await db.close(); await transaction.rollback()
    await engine.dispose()


@pytest.mark.asyncio
async def test_project_and_task_fields_include_actor_and_old_new_values(monkeypatch):
    events = []
    monkeypatch.setattr(event_bus, "publish_sync_fire_and_forget", events.append)
    async with engine.connect() as connection:
        transaction = await connection.begin()
        async with AsyncSession(bind=connection, expire_on_commit=False, join_transaction_mode="create_savepoint") as db:
            actor = (await db.execute(select(User.id).limit(1))).scalar_one()
            token = current_user_id_var.set(actor)
            try:
                product = Product(name="History regression", owner_user_id=actor)
                db.add(product); await db.flush()
                project = Project(product_id=product.id, name="Before project")
                task = TaskItem(title="Before task", task_type="Feature")
                db.add_all([project, task]); await db.commit()
                events.clear()
                project.name = "After project"
                task.title = "After task"
                await db.commit()
                for entity, field, before, after in [(project, "name", "Before project", "After project"), (task, "title", "Before task", "After task")]:
                    log = next(event for event in events if event.entity_id == str(entity.id))
                    assert log.user_id == actor
                    assert json.loads(log.changes_json)[field] == {"old": before, "new": after}
                @asynccontextmanager
                async def audit_session():
                    yield db
                monkeypatch.setattr(audit_handlers, "AsyncSessionLocal", audit_session)
                for change in list(events):
                    await audit_handlers._handle_audit_event(change)
                stored = await analytics_service.get_entity_history(db, "projects.TaskItem", task.id)
                assert len(stored) == 1
                assert stored[0].user_name
                assert json.loads(stored[0].changes_json)["title"]["new"] == "After task"
                events.clear()
                task.title = "After task"
                await db.commit()
                assert not events, "Saving unchanged fields must not invent history"
                task.priority = "invalid"
                with pytest.raises(IntegrityError):
                    await db.commit()
                await db.rollback()
                assert not events, "Rolled-back edits must never appear in history"
            finally:
                current_user_id_var.reset(token)
                await db.close(); await transaction.rollback()
    await engine.dispose()


@pytest.mark.asyncio
async def test_members_assignees_and_checklist_changes_reach_parent_history(monkeypatch):
    events = []
    monkeypatch.setattr(event_bus, "publish_sync_fire_and_forget", events.append)
    async with engine.connect() as connection:
        transaction = await connection.begin()
        async with AsyncSession(bind=connection, expire_on_commit=False, join_transaction_mode="create_savepoint") as db:
            try:
                actor = (await db.execute(select(User.id).where(User.is_active.is_(True)).limit(1))).scalar_one()
                product = Product(name=f"History {uuid4()}", owner_user_id=actor)
                db.add(product); await db.flush()
                project = Project(product_id=product.id, name="Related changes")
                task = TaskItem(title="Checklist task", task_type="Feature")
                db.add_all([project, task]); await db.flush()
                db.add(ProductMember(product_id=product.id, user_id=actor))
                item = ChecklistItem(task_id=task.id, text="Verify history", order=0)
                db.add(item); await db.commit()
                created = next(event for event in events if event.entity_type == "projects.TaskItem" and event.entity_id == str(task.id) and "checklist_items" in json.loads(event.changes_json))
                snapshot = json.loads(created.changes_json)["checklist_items"]["new"]
                assert snapshot["id"] == str(item.id)
                assert snapshot["is_done"] is False
                events.clear()
                await service.add_project_member(db, project.id, ProjectMemberCreate(user_id=actor, role="Developer"))
                assert any(event.entity_type == "projects.Project" and event.entity_id == str(project.id) and "members" in json.loads(event.changes_json) for event in events), "Adding a member must appear in project history"
                events.clear()
                item.is_done = True
                await db.commit()
                assert any(event.entity_type == "projects.TaskItem" and event.entity_id == str(task.id) and "checklist_items" in json.loads(event.changes_json) for event in events), "Checklist completion must appear in task history"
                events.clear()
                await repository.set_task_assignees(db, task.id, [actor]); await db.commit()
                assert any(event.entity_id == str(task.id) and "assignee_user_ids" in json.loads(event.changes_json) for event in events), "Assignee edits must appear in task history"
                events.clear()
                await repository.set_task_assignees(db, task.id, [actor]); await db.commit()
                assert not events, "Saving unchanged assignees must not invent history"
                events.clear()
                await repository.remove_project_member(db, project.id, actor)
                assert any(event.entity_id == str(project.id) and "members" in json.loads(event.changes_json) for event in events), "Removing a member must appear in project history"
            finally:
                await db.close(); await transaction.rollback()
    await engine.dispose()


@pytest.mark.asyncio
async def test_document_unlink_and_attachment_versions_are_logged_without_storage_keys(monkeypatch):
    from app.modules.collaboration.models import FileAttachment
    from app.modules.docs.models import DocLink, DocPage, DocSpace

    events = []
    monkeypatch.setattr(event_bus, "publish_sync_fire_and_forget", events.append)
    async with engine.connect() as connection:
        transaction = await connection.begin()
        async with AsyncSession(bind=connection, expire_on_commit=False, join_transaction_mode="create_savepoint") as db:
            try:
                actor = (await db.execute(select(User.id).limit(1))).scalar_one()
                task = TaskItem(title="Document history", task_type="Feature")
                space = DocSpace(name="History", slug=f"history-{uuid4()}", created_by=actor)
                db.add_all([task, space]); await db.flush()
                page = DocPage(space_id=space.id, title="Guide", slug="guide", content="# Guide", created_by=actor, updated_by=actor)
                db.add(page); await db.flush()
                attachment = FileAttachment(entity_type="task", entity_id=task.id, file_name="history.md", content_type="text/markdown", size_bytes=10, storage_key="private/history.md", uploaded_by_user_id=actor)
                link = DocLink(page_id=page.id, entity_type="task", entity_id=task.id)
                db.add_all([attachment, link]); await db.commit()
                parent_logs = [json.loads(event.changes_json) for event in events if event.entity_type == "projects.TaskItem" and event.entity_id == str(task.id)]
                assert any("documents" in log for log in parent_logs)
                files = next(log["attachments"]["new"] for log in parent_logs if "attachments" in log)
                assert files["file_name"] == "history.md" and files["version"] == 1
                assert files["id"] == str(attachment.id)
                assert "storage_key" not in files
                events.clear()
                await db.delete(link)
                attachment.version = 2
                await db.commit()
                changes = [json.loads(event.changes_json) for event in events if event.entity_id == str(task.id)]
                assert any(log.get("documents", {}).get("old") and log["documents"]["new"] is None for log in changes)
                changed_file = next(log["attachments"] for log in changes if "attachments" in log)
                assert changed_file["old"]["version"] == 1
                assert changed_file["new"]["version"] == 2
            finally:
                await db.close(); await transaction.rollback()
    await engine.dispose()

@pytest.mark.asyncio
async def test_archiving_project_task_and_product_records_status_changes(monkeypatch):
    from unittest.mock import AsyncMock
    from app.core.current_user import CurrentUser
    from app.modules.projects.enums import TaskStatus
    events = []
    monkeypatch.setattr(event_bus, "publish_sync_fire_and_forget", events.append)
    monkeypatch.setattr(event_bus, "publish", AsyncMock())
    async with engine.connect() as connection:
        transaction = await connection.begin()
        async with AsyncSession(bind=connection, expire_on_commit=False, join_transaction_mode="create_savepoint") as db:
            actor = (await db.execute(select(User.id).limit(1))).scalar_one()
            token = current_user_id_var.set(actor)
            try:
                product = Product(name=f"Archive history {uuid4()}", owner_user_id=actor, status="Active")
                db.add(product); await db.flush()
                project = Project(product_id=product.id, name="History project", status="on-hold")
                task = TaskItem(title="History task", status="Ready")
                db.add_all([project, task]); await db.commit()
                events.clear()
                user = CurrentUser(actor, "user@example.com", "User", ["Developer"], [])
                await service.archive_project(db, project.id)
                await service.update_task_status(db, task.id, TaskStatus.ARCHIVED, actor, user)
                await service.archive_product(db, product.id)
                for entity, expected in ((project, "archived"), (task, "Archived"), (product, "Archived")):
                    log = next(event for event in events if event.entity_id == str(entity.id) and json.loads(event.changes_json).get("status", {}).get("new") == expected)
                    assert log.user_id == actor
            finally:
                current_user_id_var.reset(token)
                await db.close(); await transaction.rollback()
    await engine.dispose()
