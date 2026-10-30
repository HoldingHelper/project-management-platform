"""Non-admin creation and draft ownership, using rollback-only PostgreSQL."""
import os
from uuid import uuid4
from unittest.mock import AsyncMock
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import engine
from app.core.current_user import CurrentUser
from app.core.permissions import permissions_for_roles
from app.core.exceptions import ForbiddenError
from app.modules.identity.models import User
from app.modules.docs import service
from app.modules.docs.models import DocSpace
from app.modules.docs.schemas import PageCreate, PageUpdate, CommentCreate

pytestmark = pytest.mark.skipif(os.getenv("PMP_MEMBERSHIP_DB_TESTS") != "1", reason="Local PostgreSQL opt-in")

@pytest.mark.asyncio
async def test_regular_staff_create_and_edit_own_drafts_without_global_edit(monkeypatch):
    monkeypatch.setattr(service, "_notify_lifecycle", AsyncMock())
    async with engine.connect() as connection:
        root = await connection.begin()
        try:
            async with AsyncSession(bind=connection, expire_on_commit=False, join_transaction_mode="create_savepoint") as db:
                ids = list((await db.execute(select(User.id).where(User.is_active.is_(True)).limit(3))).scalars())
                owner = CurrentUser(ids[0], "owner@example.com", "Owner", ["CompanyManager"], permissions_for_roles(["CompanyManager"]))
                space = DocSpace(name="Creation test", slug=f"creation-{uuid4()}", visibility="workspace", created_by=owner.user_id)
                private = DocSpace(name="Private", slug=f"private-{uuid4()}", visibility="private", created_by=owner.user_id)
                db.add_all([space, private]); await db.flush()
                original = await service.create_page(db, owner, space.id, PageCreate(title="Owner draft", visibility="inherit"))
                for role in ("Developer", "QA", "CLevel", "ProjectManager"):
                    actor = CurrentUser(ids[1], "staff@example.com", "Staff", [role], permissions_for_roles([role]))
                    assert await service.can_create_page(db, actor, space)
                    assert not await service.can_create_page(db, actor, private)
                    visible = {s.id: s for s in await service.list_spaces(db, actor)}
                    assert visible[space.id].can_create_pages
                    page = await service.create_page(db, actor, space.id, PageCreate(title=f"{role} draft", visibility="inherit"))
                    assert page.status == "draft"
                    assert (await service.lifecycle_permissions(db, actor, page.id))["can_edit"]
                    assert (await service.update_page(db, actor, page.id, PageUpdate(content="Saved draft"))).content == "Saved draft"
                    if role != "ProjectManager":
                        with pytest.raises(ForbiddenError):
                            await service.update_page(db, actor, original.id, PageUpdate(content="Unauthorized edit"))
                    with pytest.raises(ForbiddenError):
                        await service.create_page(db, actor, private.id, PageCreate(title="Denied"))
                    assert (await service.lifecycle_permissions(db, actor, page.id))["can_publish"]
                    with pytest.raises(ForbiddenError):
                        await service.set_published(db, actor, original.id, True)
                    published = await service.set_published(db, actor, page.id, True)
                    assert published.status == "published" and published.visibility == "inherit"
                    assert (await service.lifecycle_permissions(db, actor, page.id))["can_comment"]
                    comment = await service.add_comment(db, actor, page.id, CommentCreate(body="Published document feedback"))
                    assert comment.author_user_id == actor.user_id
                    assert comment.id in {item.id for item in await service.list_comments(db, actor, page.id)}
                    assert not (await service.lifecycle_permissions(db, actor, page.id))["can_publish"]
                    with pytest.raises(ForbiddenError):
                        await service.update_page(db, actor, page.id, PageUpdate(content="Published edit denied"))
                for permissions in (["docs.view"], ["docs.view", "docs.comment"]):
                    viewer = CurrentUser(ids[2], "viewer@example.com", "Viewer", permissions=permissions)
                    with pytest.raises(ForbiddenError):
                        await service.create_page(db, viewer, space.id, PageCreate(title="Denied"))
                # Scoped tokens cannot inherit a role's new creation grant.
                token = CurrentUser(ids[2], "token@example.com", "Token", ["Developer"], ["docs.view"], allow_role_bypass=False)
                assert not await service.can_create_page(db, token, space)
        finally:
            await root.rollback()
    await engine.dispose()
