"""Local PostgreSQL lifecycle/retention tests. All writes roll back."""
import os
from uuid import uuid4
from sqlalchemy import select, delete, update
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession
import pytest

from app.core.database import engine
from app.core.current_user import CurrentUser
from app.core.exceptions import ForbiddenError, NotFoundError
from app.modules.identity.models import User
from app.modules.docs import service, repository, search_service, graph_service, upload_library
from app.modules.docs.models import DocPage, DocSpace, DocAttachment, DocRevision
from app.modules.docs.schemas import PageCreate, PageUpdate, PageMove, AttachmentCreate, LinkCreate
from app.modules.docs.lifecycle import visible_upload, require_visible_upload
from app.modules.collaboration.models import FileAttachment, Comment
from app.modules.chat.models import Channel, Message
from app.modules.projects.models import TaskItem

pytestmark = pytest.mark.skipif(os.getenv("PMP_MEMBERSHIP_DB_TESTS") != "1", reason="Local PostgreSQL opt-in")


@pytest.mark.asyncio
async def test_uploaded_files_publish_after_indexing_and_existing_drafts_stay_drafts():
    async with engine.connect() as connection:
        root = await connection.begin()
        async with AsyncSession(bind=connection, expire_on_commit=False, join_transaction_mode="create_savepoint") as db:
            try:
                actor_id = (await db.execute(select(User.id).where(User.is_active.is_(True)).limit(1))).scalar_one()
                task = (await db.execute(select(TaskItem).limit(1))).scalars().first()
                assert task is not None
                attachment = FileAttachment(entity_type="task", entity_id=task.id, file_name="telegram-voice.ogg", content_type="audio/ogg", size_bytes=1, storage_key=f"test/{uuid4()}", uploaded_by_user_id=actor_id)
                db.add(attachment)
                await db.flush()
                page = await upload_library.index_upload(db, attachment)
                assert page.status == "published"
                assert page.visibility == "inherit"
                assert (await db.execute(select(DocSpace.visibility).where(DocSpace.id == page.space_id))).scalar_one() == "private"
                assert (await db.execute(select(DocAttachment).where(DocAttachment.page_id == page.id))).scalars().one().storage_key == attachment.storage_key
                assert (await upload_library.index_upload(db, attachment)).id == page.id
                async with db.begin_nested() as nested:
                    with pytest.raises(DBAPIError):
                        await db.execute(DocAttachment.__table__.insert().values(id=uuid4(), page_id=page.id, file_name="extra.txt", file_url="", mime_type="text/plain", uploaded_by=actor_id))
                    await nested.rollback()

                old_attachment = FileAttachment(entity_type="task", entity_id=task.id, file_name="old-draft.txt", content_type="text/plain", size_bytes=1, storage_key=f"test/{uuid4()}", uploaded_by_user_id=actor_id)
                db.add(old_attachment)
                await db.flush()
                old_page = DocPage(space_id=page.space_id, parent_page_id=page.parent_page_id, title="Existing draft", slug=f"existing-{uuid4()}", content="", content_json={}, status="draft", visibility="inherit", created_by=actor_id, updated_by=actor_id, source_attachment_id=old_attachment.id, source_entity_type="task", source_entity_id=task.id)
                db.add(old_page)
                await db.flush()
                assert (await upload_library.index_upload(db, old_attachment)).status == "draft"
            finally:
                await db.close()
                await root.rollback()
    await engine.dispose()

@pytest.mark.asyncio
async def test_document_lifecycle_visibility_and_database_retention(monkeypatch):
    from unittest.mock import AsyncMock
    monkeypatch.setattr(service, "_notify_lifecycle", AsyncMock())
    async with engine.connect() as connection:
        root = await connection.begin()
        async with AsyncSession(bind=connection, expire_on_commit=False, join_transaction_mode="create_savepoint") as db:
            try:
                ids = list((await db.execute(select(User.id).where(User.is_active.is_(True)).limit(3))).scalars())
                assert len(ids) == 3
                author = CurrentUser(ids[0], "author@example.com", "Author", ["Developer"], ["docs.edit","docs.publish","docs.view"])
                other = CurrentUser(ids[1], "other@example.com", "Other", ["CLevel"], ["docs.manage","docs.edit","docs.publish","docs.view"])
                admin = CurrentUser(ids[2], "admin@example.com", "Admin", ["SuperAdmin"], [])
                space = DocSpace(name=f"Lifecycle {uuid4()}", slug=f"lifecycle-{uuid4()}", visibility="workspace", created_by=author.user_id)
                db.add(space); await db.flush()
                page = await service.create_page(db, author, space.id, PageCreate(title=f"Lifecycle {uuid4()}", content="Original content", visibility="inherit"))
                assert page.status == "draft"
                assert (await service.lifecycle_permissions(db, author, page.id))["can_edit"]
                await service.update_page(db, author, page.id, PageUpdate(content="Final content"))
                attachment = await service.add_attachment(db, author, page.id, AttachmentCreate(file_name="guide.txt", file_url="https://example.com/guide", mime_type="text/plain"))
                revision = (await repository.list_revisions(db, page.id))[0]
                published = await service.set_published(db, author, page.id, True)
                assert published.status == "published" and published.visibility == "inherit"
                assert (await service.get_page(db, other, page.id)).content == "Final content"
                for actor in (author, other, admin):
                    assert not (await service.lifecycle_permissions(db, actor, page.id))["can_edit"]
                    with pytest.raises(ForbiddenError):
                        await service.update_page(db, actor, page.id, PageUpdate(content="Tampered"))
                    with pytest.raises(ForbiddenError):
                        await service.restore_revision(db, actor, page.id, revision.id)
                    with pytest.raises(ForbiddenError):
                        await service.move_page(db, actor, page.id, PageMove())
                    with pytest.raises(ForbiddenError):
                        await service.set_published(db, actor, page.id, False)
                    with pytest.raises(ForbiddenError):
                        await service.add_attachment(db, actor, page.id, AttachmentCreate(file_name="new.txt", file_url="https://example.com/new", mime_type="text/plain"))
                    with pytest.raises(ForbiddenError):
                        await service.add_page_tag(db, actor, page.id, "tampered")
                with pytest.raises(ForbiddenError):
                    await service.set_archived(db, other, page.id)
                archived = await service.set_archived(db, author, page.id)
                assert archived.status == "archived"
                for actor in (author, other):
                    with pytest.raises(NotFoundError):
                        await service.get_page(db, actor, page.id)
                    with pytest.raises(NotFoundError):
                        await service.list_revisions(db, actor, page.id)
                    with pytest.raises(NotFoundError):
                        await service.attachment_download_url(db, actor, attachment.id)
                    with pytest.raises(ForbiddenError):
                        await service.set_archived(db, actor, page.id, False)
                    assert page.id not in {p.id for p in await service.list_pages(db, actor, space.id)}
                    assert page.id not in {p.id for p in await service.search_pages(db, actor, "Lifecycle")}
                    assert not (await search_service.search_pages_v2(db, actor, str(page.title))).results
                    assert await service.get_wikilink_autocomplete(db, actor, str(page.title)) == []
                    assert not (await graph_service.get_global_graph(db, actor, space.id)).nodes
                assert (await service.get_page(db, admin, page.id)).status == "archived"
                restored = await service.set_archived(db, admin, page.id, False)
                assert restored.status == "published" and restored.content == "Final content"
                public = await service.create_page(db, author, space.id, PageCreate(title="Public retention guide", content="Public text", visibility="public"))
                await service.set_published(db, author, public.id, True)
                assert (await service.get_public_page_by_id(db, public.id)).content == "Public text"
                await service.set_archived(db, author, public.id)
                with pytest.raises(NotFoundError):
                    await service.get_public_page_by_id(db, public.id)
                assert public.id not in {p["id"] for entry in await service.public_navigation(db) for p in entry["pages"]}
                # Independent DB protection blocks bypasses and cascade deletes.
                for statement in (
                    delete(DocPage).where(DocPage.id == page.id),
                    delete(DocSpace).where(DocSpace.id == space.id),
                    delete(DocAttachment).where(DocAttachment.id == attachment.id),
                    DocAttachment.__table__.insert().values(id=uuid4(), page_id=page.id, file_name="bypass.txt", file_url="https://example.com/bypass", mime_type="text/plain", uploaded_by=author.user_id),
                    update(DocPage).where(DocPage.id == page.id).values(content="Bypass"),
                    update(DocPage).where(DocPage.id == page.id).values(status="draft"),
                    update(DocPage).where(DocPage.id == page.id).values(status="archived", archived_from_status="draft"),
                ):
                    async with db.begin_nested() as nested:
                        with pytest.raises(DBAPIError):
                            await db.execute(statement)
                        await nested.rollback()
                # Uploaded documents use the same page lifecycle and hide file access.
                file = FileAttachment(entity_type="project", entity_id=uuid4(), file_name="retained.txt", content_type="text/plain", size_bytes=1, storage_key=f"lifecycle/{uuid4()}", uploaded_by_user_id=author.user_id)
                db.add(file); await db.flush()
                upload = DocPage(space_id=space.id, title="Uploaded guide", slug=f"upload-{uuid4()}", content="Guide", status="draft", visibility="inherit", created_by=author.user_id, updated_by=author.user_id, source_attachment_id=file.id, source_entity_type="project", source_entity_id=file.entity_id)
                db.add(upload); await db.flush()
                await service.set_archived(db, author, upload.id)
                assert not await visible_upload(db, author, file.id)
                assert await visible_upload(db, admin, file.id)
                with pytest.raises(NotFoundError):
                    await require_visible_upload(db, other, file.id)
                async with db.begin_nested() as nested:
                    with pytest.raises(DBAPIError):
                        await db.execute(delete(FileAttachment).where(FileAttachment.id == file.id))
                    await nested.rollback()
                # Draft archival/restoration never makes a previously published page editable.
                draft = await service.create_page(db, author, space.id, PageCreate(title="Restore draft"))
                await service.set_archived(db, author, draft.id)
                assert (await service.set_archived(db, admin, draft.id, False)).status == "draft"
                channel = Channel(type="dm", name="Retention test")
                db.add(channel); await db.flush()
                message = Message(channel_id=channel.id, sender_user_id=author.user_id, body="Retained message", message_type="text")
                comment = Comment(entity_type="task", entity_id=uuid4(), author_user_id=author.user_id, body="Retained comment")
                db.add_all([message, comment]); await db.flush()
                for statement in (delete(Message).where(Message.id == message.id), update(Message).where(Message.id == message.id).values(deleted_at=__import__("datetime").datetime.now(__import__("datetime").timezone.utc)), delete(Comment).where(Comment.id == comment.id), update(Comment).where(Comment.id == comment.id).values(is_deleted=True)):
                    async with db.begin_nested() as nested:
                        with pytest.raises(DBAPIError):
                            await db.execute(statement)
                        await nested.rollback()
            finally:
                await db.close()
                await root.rollback()
    await engine.dispose()
