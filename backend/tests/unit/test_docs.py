from datetime import datetime, timezone
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.core.current_user import CurrentUser
from app.core.exceptions import ForbiddenError, ValidationAppError
from app.modules.docs.models import DocLink, DocPage, DocSpace
from app.modules.docs.schemas import AttachmentCreate, CommentCreate, PageCreate, PageMove, PermissionGrant
from app.modules.docs import service


def user(*permissions: str, user_id=None) -> CurrentUser:
    return CurrentUser(user_id=user_id or uuid4(), email="person@example.com", full_name="Person", permissions=list(permissions))


def test_safe_slug_is_stable_and_rejects_symbol_only_titles():
    assert service.safe_slug("Backend Architecture 2027") == "backend-architecture-2027"
    with pytest.raises(ValidationAppError):
        service.safe_slug("---")


def test_youtube_urls_are_allowlisted():
    PageCreate(title="Guide", youtube_url="https://www.youtube.com/watch?v=abc")
    with pytest.raises(ValidationError):
        PageCreate(title="Guide", youtube_url="https://attacker.example/embed")


def test_attachment_urls_reject_executable_and_insecure_origins():
    AttachmentCreate(file_name="guide.pdf", file_url="https://files.example/guide.pdf", mime_type="application/pdf")
    with pytest.raises(ValidationError):
        AttachmentCreate(file_name="bad.html", file_url="javascript:alert(1)", mime_type="text/html")


def test_pages_are_private_by_default_and_department_grants_are_supported():
    assert PageCreate(title="Personal draft").visibility == "private"
    grant = PermissionGrant(subject_type="department", subject_id=str(uuid4()), permission="view")
    assert grant.subject_type == "department"


def test_inline_comment_anchor_requires_a_complete_forward_selection():
    CommentCreate(body="Looks good", selection_start=0, selection_end=4, selected_text="Docs")
    with pytest.raises(ValidationError):
        CommentCreate(body="Incomplete", selection_start=0)
    with pytest.raises(ValidationError):
        CommentCreate(body="Backwards", selection_start=4, selection_end=2, selected_text="no")


@pytest.mark.asyncio
async def test_only_creator_or_publisher_can_publish(monkeypatch):
    owner_id = uuid4()
    page = DocPage(
        id=uuid4(),
        space_id=uuid4(),
        title="Launch guide",
        slug="launch-guide",
        content="Ready",
        content_json={},
        status="draft",
        visibility="private",
        position=0,
        created_by=owner_id,
        updated_by=owner_id,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )

    async def get_page(_db, _page_id):
        return page

    async def editable(*_args):
        return True

    class MockSession:
        async def commit(self):
            pass

        async def refresh(self, _value):
            pass

    monkeypatch.setattr(service.repo, "get_page", get_page)
    monkeypatch.setattr(service, "_page_editable", editable)
    with pytest.raises(ForbiddenError):
        await service.set_published(MockSession(), user("docs.edit"), page.id, True)  # type: ignore[arg-type]

    with pytest.raises(ForbiddenError):
        # Even the creator cannot publish without docs.publish (H-2)
        await service.set_published(MockSession(), user("docs.edit", user_id=owner_id), page.id, True)  # type: ignore[arg-type]

    result = await service.set_published(MockSession(), user("docs.publish", user_id=owner_id), page.id, True)  # type: ignore[arg-type]
    assert result.status == "published"
    assert result.visibility == "public"


@pytest.mark.asyncio
async def test_hierarchy_move_rejects_nesting_a_page_in_its_child(monkeypatch):
    owner = user("docs.edit")
    parent = DocPage(id=uuid4(), space_id=uuid4(), title="Parent", slug="parent", visibility="workspace", created_by=owner.user_id, updated_by=owner.user_id)
    child = DocPage(id=uuid4(), space_id=parent.space_id, parent_page_id=parent.id, title="Child", slug="child", visibility="workspace", created_by=owner.user_id, updated_by=owner.user_id)
    pages = {parent.id: parent, child.id: child}

    async def get_page(_db, page_id):
        return pages.get(page_id)

    async def editable(*_args):
        return True

    monkeypatch.setattr(service.repo, "get_page", get_page)
    monkeypatch.setattr(service, "_page_editable", editable)
    with pytest.raises(ValidationAppError):
        await service.move_page(None, owner, parent.id, PageMove(parent_page_id=child.id))  # type: ignore[arg-type]


@pytest.mark.asyncio
async def test_private_page_is_not_exposed_by_global_view_permission(monkeypatch):
    owner_id = uuid4()
    viewer = user("docs.view")
    space = DocSpace(id=uuid4(), name="HR", slug="hr", visibility="workspace", created_by=owner_id)
    page = DocPage(id=uuid4(), space_id=space.id, title="Salaries", slug="salaries", visibility="private", created_by=owner_id, updated_by=owner_id)

    async def denied(*_args, **_kwargs):
        return False

    monkeypatch.setattr(service, "can_access", denied)
    assert await service._page_visible(None, viewer, page, space) is False  # type: ignore[arg-type]


@pytest.mark.asyncio
async def test_private_page_owner_retains_access(monkeypatch):
    owner_id = uuid4()
    owner = user("docs.view", user_id=owner_id)
    space = DocSpace(id=uuid4(), name="Personal", slug="personal", visibility="workspace", created_by=owner_id)
    page = DocPage(id=uuid4(), space_id=space.id, title="Draft", slug="draft", visibility="private", created_by=owner_id, updated_by=owner_id)
    assert await service._page_visible(None, owner, page, space) is True  # type: ignore[arg-type]


@pytest.mark.asyncio
async def test_reverse_entity_links_only_return_visible_documents(monkeypatch):
    viewer = user("docs.view")
    entity_id = uuid4()
    visible_space = DocSpace(id=uuid4(), name="Public team", slug="team", visibility="workspace", created_by=uuid4())
    private_space = DocSpace(id=uuid4(), name="Private", slug="private", visibility="workspace", created_by=uuid4())
    visible_page = DocPage(id=uuid4(), space_id=visible_space.id, title="Runbook", slug="runbook", visibility="workspace", created_by=uuid4(), updated_by=uuid4())
    private_page = DocPage(id=uuid4(), space_id=private_space.id, title="Secret", slug="secret", visibility="private", created_by=uuid4(), updated_by=uuid4())
    links = [
        (DocLink(id=uuid4(), page_id=visible_page.id, entity_type="project", entity_id=entity_id, created_at=datetime.now(timezone.utc)), visible_page),
        (DocLink(id=uuid4(), page_id=private_page.id, entity_type="project", entity_id=entity_id, created_at=datetime.now(timezone.utc)), private_page),
    ]
    spaces = {visible_space.id: visible_space, private_space.id: private_space}

    monkeypatch.setattr(service.repo, "list_links_by_entity", AsyncMock(return_value=links))
    monkeypatch.setattr(service.repo, "get_space", AsyncMock(side_effect=lambda _db, space_id: spaces[space_id]))
    monkeypatch.setattr(service, "_page_visible", AsyncMock(side_effect=lambda _db, _user, page, _space: page.id == visible_page.id))

    result = await service.list_entity_links(None, viewer, "project", entity_id)  # type: ignore[arg-type]
    assert [item.title for item in result] == ["Runbook"]


@pytest.mark.asyncio
async def test_seed_internal_documentation():
    from app.modules.docs.seed import seed_internal_documentation, DOC_SPACES_DATA

    class MockDocSeedSession:
        def __init__(self):
            self.added = []
            self.committed = False

        async def execute(self, stmt):
            class MockResult:
                def scalar_one_or_none(self):
                    return None
            return MockResult()

        def add(self, obj):
            self.added.append(obj)

        async def flush(self):
            pass

        async def commit(self):
            self.committed = True

    mock_db = MockDocSeedSession()
    await seed_internal_documentation(mock_db)  # type: ignore[arg-type]

    assert len(mock_db.added) > 0
    assert mock_db.committed is True
    # Verify spaces and pages were seeded
    space_count = sum(1 for item in mock_db.added if isinstance(item, DocSpace))
    page_count = sum(1 for item in mock_db.added if isinstance(item, DocPage))
    assert space_count == len(DOC_SPACES_DATA)
    assert page_count > 0
