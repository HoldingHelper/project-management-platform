"""File sharing permissions against real PostgreSQL; all writes are rolled back."""
import json
import os
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import register_audit_listeners
from app.core.current_user import CurrentUser
from app.core.database import engine
from app.core.events import event_bus
from app.core.exceptions import ForbiddenError
from app.core.request_context import current_user_id_var
from app.core.storage import file_storage_service
from app.modules.identity.models import User
from app.modules.collaboration.models import FileAttachment
from app.modules.collaboration import sharing, service as files
from app.modules.collaboration.router import download_file
from app.modules.docs import service as docs, upload_library
from app.modules.docs.models import DocSpace
from app.modules.docs.schemas import AttachmentCreate, PageCreate
from app.modules.projects.models import TaskItem

pytestmark = pytest.mark.skipif(os.getenv("PMP_MEMBERSHIP_DB_TESTS") != "1", reason="Local PostgreSQL opt-in")


@pytest.mark.asyncio
async def test_owner_and_admin_control_file_and_mirrored_document_download(monkeypatch):
    register_audit_listeners()
    events = []
    monkeypatch.setattr(event_bus, "publish_sync_fire_and_forget", events.append)
    monkeypatch.setattr(docs, "_notify_lifecycle", AsyncMock())
    monkeypatch.setattr(file_storage_service, "download_async", AsyncMock(return_value=b"file"))
    async with engine.connect() as connection:
        root = await connection.begin()
        async with AsyncSession(bind=connection, expire_on_commit=False, join_transaction_mode="create_savepoint") as db:
            ids = list((await db.execute(select(User.id).where(User.is_active.is_(True)).limit(2))).scalars())
            owner = CurrentUser(ids[0], "owner@example.com", "Owner", ["Developer"], ["tasks.view", "docs.edit", "docs.view", "docs.publish"])
            other = CurrentUser(ids[1], "other@example.com", "Other", ["Developer"], ["tasks.view", "docs.view"])
            admin = CurrentUser(ids[1], "admin@example.com", "Admin", ["SuperAdmin"], [])
            token = current_user_id_var.set(owner.user_id)
            try:
                task = TaskItem(title="Sharing test", status="Ready")
                db.add(task); await db.flush()
                file = FileAttachment(entity_type="task", entity_id=task.id, file_name="private.txt", content_type="text/plain", size_bytes=1, storage_key=f"test/{uuid4()}", uploaded_by_user_id=owner.user_id)
                db.add(file); await db.flush()
                page = await upload_library.index_upload(db, file)
                await db.commit()
                mirror = (await docs.list_attachments(db, owner, page.id))[0]
                assert not (await sharing.file_permission(db, owner, file.id))["enabled"]
                for actor in (owner, admin):
                    with pytest.raises(ForbiddenError):
                        await files.get_file_download_url(db, actor, file.id)
                    with pytest.raises(ForbiddenError):
                        await download_file(file.id, actor, db)
                    with pytest.raises(ForbiddenError):
                        await docs.attachment_download_url(db, actor, mirror.id)
                with pytest.raises(ForbiddenError):
                    await sharing.set_file_permission(db, other, file.id, True)
                events.clear()
                await sharing.set_file_permission(db, owner, file.id, True)
                assert (await sharing.doc_permission(db, other, mirror.id))["enabled"]
                assert (await files.get_file_download_url(db, other, file.id)).endswith("/download")
                assert (await download_file(file.id, other, db)).body == b"file"
                assert (await docs.attachment_download_url(db, other, mirror.id)).endswith("/download")
                assert any(e.user_id == owner.user_id and json.loads(e.changes_json).get("download_share_enabled", {}).get("new") is True for e in events)
                await sharing.set_doc_permission(db, admin, mirror.id, False)
                with pytest.raises(ForbiddenError):
                    await files.get_file_download_url(db, other, file.id)

                space = DocSpace(name=f"Sharing {uuid4()}", slug=f"sharing-{uuid4()}", visibility="workspace", created_by=owner.user_id)
                db.add(space); await db.flush()
                authored = await docs.create_page(db, owner, space.id, PageCreate(title="Authored doc", visibility="inherit"))
                linked = await docs.add_attachment(db, owner, authored.id, AttachmentCreate(file_name="link.txt", file_url="https://example.com/file", mime_type="text/plain"))
                assert (await docs.list_attachments(db, owner, authored.id))[0].file_url is None
                await docs.set_published(db, owner, authored.id, True)
                with pytest.raises(ForbiddenError):
                    await sharing.set_doc_permission(db, other, linked.id, True)
                await sharing.set_doc_permission(db, owner, linked.id, True)
                assert await docs.attachment_download_url(db, other, linked.id) == "https://example.com/file"
                await docs.set_archived(db, owner, authored.id)
                await sharing.set_doc_permission(db, admin, linked.id, False)
                assert not (await sharing.doc_permission(db, admin, linked.id))["enabled"]
            finally:
                current_user_id_var.reset(token)
                await db.close(); await root.rollback()
    await engine.dispose()
