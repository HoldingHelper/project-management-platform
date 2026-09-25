from __future__ import annotations

import re
from pathlib import Path
from typing import BinaryIO
from uuid import UUID, uuid4

from slugify import slugify
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.current_user import CurrentUser
from app.core.exceptions import ForbiddenError, NotFoundError, ValidationAppError
from app.core.storage import file_storage_service
from app.modules.docs import repository as repo
from app.modules.docs.models import DocAttachment, DocComment, DocLink, DocPage, DocPageTag, DocPermission, DocRevision, DocSpace, DocTag
from app.modules.docs.relations import list_backlinks, resolve_stubs_for_new_page, sync_page_relations, wikilink_suggestions
from app.modules.docs.schemas import AttachmentCreate, AttachmentRead, CommentCreate, CommentRead, EntityDocLinkRead, LinkCreate, LinkRead, PageCreate, PageMove, PageRead, PageSummary, PageUpdate, PermissionGrant, PermissionRead, PublicPageRead, RelationRead, RevisionRead, SearchResult, SpaceCreate, SpaceRead, SpaceUpdate, TagRead
from app.shared.base_model import utcnow


def safe_slug(value: str) -> str:
    result = slugify(value, lowercase=True, separator="-")[:180].strip("-")
    if not result or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", result):
        raise ValidationAppError("Use a title containing letters or numbers.")
    return result


async def _unique_space_slug(db: AsyncSession, title: str) -> str:
    root = safe_slug(title)
    candidate = root
    suffix = 2
    while await repo.get_space_by_slug(db, candidate):
        candidate, suffix = f"{root}-{suffix}", suffix + 1
    return candidate


async def _unique_page_slug(db: AsyncSession, space_id: UUID, title: str, current_id: UUID | None = None) -> str:
    root = safe_slug(title)
    candidate = root
    suffix = 2
    while True:
        page = await repo.get_page_by_slug(db, space_id, candidate)
        if not page or page.id == current_id:
            return candidate
        candidate, suffix = f"{root}-{suffix}", suffix + 1


def has_global_docs_access(user: CurrentUser, action: str) -> bool:
    if user.is_super_admin() or user.has_permission("*"):
        return True
    code = {
        "view": "docs.view",
        "comment": "docs.comment",
        "edit": "docs.edit",
        "manage": "docs.manage",
        "publish": "docs.publish",
    }[action]
    return user.has_permission(code)


async def can_access(db: AsyncSession, user: CurrentUser, resource_type: str, resource_id: UUID, action: str) -> bool:
    if user.is_super_admin() or user.has_permission("docs.manage") or user.has_permission("*"):
        return True

    # Responsible user or creator has full access to the resource
    if resource_type == "space":
        space = await repo.get_space(db, resource_id)
        if space and (space.responsible_user_id == user.user_id or space.created_by == user.user_id):
            return True
    elif resource_type == "page":
        page = await repo.get_page(db, resource_id)
        if page:
            if page.responsible_user_id == user.user_id or page.created_by == user.user_id:
                return True

    permissions = await repo.list_permissions(db, resource_type, resource_id)
    allowed = {"view": {"view", "comment", "edit", "manage"}, "comment": {"comment", "edit", "manage"}, "edit": {"edit", "manage"}, "manage": {"manage"}}[action]
    team_id = None
    department_id = None
    if any(p.subject_type in {"team", "department"} for p in permissions):
        from app.modules.organization.service import get_employee_context
        context = await get_employee_context(db, user.user_id)
        if context:
            team_id = str(context.team_id) if context.team_id else None
            department_id = str(context.department_id) if context.department_id else None

    return any(p.permission in allowed and (
        (p.subject_type == "user" and p.subject_id == str(user.user_id))
        or (p.subject_type == "role" and p.subject_id in user.roles)
        or (p.subject_type == "team" and p.subject_id == team_id)
        or (p.subject_type == "department" and p.subject_id == department_id)
    ) for p in permissions)


async def _page_visible(db: AsyncSession, user: CurrentUser, page: DocPage, space: DocSpace) -> bool:
    if user.is_super_admin() or user.has_permission("docs.manage"):
        return True
    if page.created_by == user.user_id or page.responsible_user_id == user.user_id:
        return True
    visibility = space.visibility if page.visibility == "inherit" else page.visibility
    if visibility == "public":
        return True
    if visibility == "workspace":
        return has_global_docs_access(user, "view")
    if visibility == "private":
        return False
    if visibility == "admins":
        return user.is_super_admin() or user.has_permission("docs.manage")
    if visibility == "selected":
        return await can_access(db, user, "page", page.id, "view")
    return await can_access(db, user, "page", page.id, "view") or await can_access(db, user, "space", space.id, "view")


async def _page_editable(db: AsyncSession, user: CurrentUser, page: DocPage) -> bool:
    space = await repo.get_space(db, page.space_id)
    if page.responsible_user_id == user.user_id or (space and space.responsible_user_id == user.user_id):
        return True
    visibility = space.visibility if space and page.visibility == "inherit" else page.visibility
    return bool(
        (visibility in {"public", "workspace"} and has_global_docs_access(user, "edit"))
        or (page.created_by == user.user_id and has_global_docs_access(user, "edit"))
        or await can_access(db, user, "page", page.id, "edit")
        or (space and await can_access(db, user, "space", space.id, "edit"))
    )


async def create_space(db: AsyncSession, user: CurrentUser, payload: SpaceCreate) -> SpaceRead:
    space = DocSpace(**payload.model_dump(), slug=await _unique_space_slug(db, payload.name), created_by=user.user_id)
    if not space.responsible_user_id:
        space.responsible_user_id = user.user_id
    db.add(space)
    await db.commit()
    await db.refresh(space)
    return SpaceRead.model_validate(space)


async def update_space(db: AsyncSession, user: CurrentUser, space_id: UUID, payload: SpaceUpdate) -> SpaceRead:
    space = await repo.get_space(db, space_id)
    if not space:
        raise NotFoundError("Documentation space", space_id)
    if not await can_access(db, user, "space", space_id, "manage"):
        raise ForbiddenError("You do not have permission to modify this space.")
    changes = payload.model_dump(exclude_unset=True)
    if "name" in changes and changes["name"]:
        changes["slug"] = await _unique_space_slug(db, changes["name"])
    for field, value in changes.items():
        setattr(space, field, value)
    await db.commit()
    await db.refresh(space)
    return SpaceRead.model_validate(space)


async def list_spaces(db: AsyncSession, user: CurrentUser, category: str | None = None) -> list[SpaceRead]:
    spaces = await repo.list_spaces(db, category=category)
    visible = [
        s for s in spaces
        if s.visibility == "public"
        or (s.visibility == "workspace" and has_global_docs_access(user, "view"))
        or s.responsible_user_id == user.user_id
        or await can_access(db, user, "space", s.id, "view")
    ]
    return [SpaceRead.model_validate(s) for s in visible]


async def create_page(db: AsyncSession, user: CurrentUser, space_id: UUID, payload: PageCreate) -> PageRead:
    space = await repo.get_space(db, space_id)
    if not space:
        raise NotFoundError("Documentation space", space_id)
    if not (
        (space.visibility in {"workspace", "public"} and has_global_docs_access(user, "edit"))
        or await can_access(db, user, "space", space_id, "edit")
    ):
        raise ForbiddenError("You do not have permission to create pages in this space.")
    if payload.parent_page_id:
        parent = await repo.get_page(db, payload.parent_page_id)
        if not parent or parent.space_id != space_id:
            raise ValidationAppError("Parent page must belong to the same space.")
    page = DocPage(**payload.model_dump(), space_id=space_id, slug=await _unique_page_slug(db, space_id, payload.title), created_by=user.user_id, updated_by=user.user_id)
    db.add(page)
    await db.commit()
    await db.refresh(page)
    await resolve_stubs_for_new_page(db, page.id, page.space_id, page.title, page.slug)
    await sync_page_relations(db, page.id, page.space_id, page.content)
    return PageRead.model_validate(page)


async def list_pages(db: AsyncSession, user: CurrentUser, space_id: UUID | None = None, category: str | None = None) -> list[PageSummary]:
    pages = await repo.list_pages(db, space_id=space_id, category=category)
    result = []
    for page in pages:
        space = await repo.get_space(db, page.space_id)
        if space and await _page_visible(db, user, page, space):
            result.append(PageSummary.model_validate(page, from_attributes=True))
    return result


async def search_pages(db: AsyncSession, user: CurrentUser, query: str, category: str | None = None) -> list[PageSummary]:
    result: list[PageSummary] = []
    for page in await repo.search_pages(db, query, category=category):
        space = await repo.get_space(db, page.space_id)
        if space and await _page_visible(db, user, page, space):
            result.append(PageSummary.model_validate(page, from_attributes=True))
    return result


async def list_personal_pages(db: AsyncSession, user: CurrentUser, kind: str, category: str | None = None) -> list[PageSummary]:
    pages = await (repo.list_recent_pages(db, user.user_id, category=category) if kind == "recent" else repo.list_favorite_pages(db, user.user_id, category=category))
    result: list[PageSummary] = []
    for page in pages:
        space = await repo.get_space(db, page.space_id)
        if space and await _page_visible(db, user, page, space):
            result.append(PageSummary.model_validate(page, from_attributes=True))
    return result


async def set_favorite(db: AsyncSession, user: CurrentUser, page_id: UUID, enabled: bool) -> None:
    await get_page(db, user, page_id)
    await repo.set_favorite(db, user.user_id, page_id, enabled)
    await db.commit()


async def get_page(db: AsyncSession, user: CurrentUser, page_id: UUID) -> PageRead:
    page = await repo.get_page(db, page_id)
    if not page:
        raise NotFoundError("Documentation page", page_id)
    space = await repo.get_space(db, page.space_id)
    if not space or not await _page_visible(db, user, page, space):
        raise NotFoundError("Documentation page", page_id)
    await repo.touch_view(db, user.user_id, page.id)
    await db.commit()
    return PageRead.model_validate(page)


async def update_page(db: AsyncSession, user: CurrentUser, page_id: UUID, payload: PageUpdate) -> PageRead:
    page = await repo.get_page(db, page_id)
    if not page:
        raise NotFoundError("Documentation page", page_id)
    if not await _page_editable(db, user, page):
        raise ForbiddenError("You do not have permission to edit this page.")
    revision = DocRevision(page_id=page.id, revision_number=await repo.next_revision_number(db, page.id), title=page.title, content=page.content, content_json=page.content_json, created_by=user.user_id, created_at=utcnow())
    db.add(revision)
    changes = payload.model_dump(exclude_unset=True)
    requested_visibility = changes.get("visibility")
    if requested_visibility == "public":
        if not (user.is_super_admin() or has_global_docs_access(user, "publish") or await can_access(db, user, "page", page.id, "manage")):
            raise ForbiddenError("Only a documentation publisher or manager can make this page public.")
        page.status = "published"
    elif requested_visibility is not None and page.status == "published":
        page.status = "internal"

    if "responsible_user_id" in changes and changes["responsible_user_id"] != page.responsible_user_id:
        if not (user.is_super_admin() or user.has_permission("docs.manage") or await can_access(db, user, "page", page.id, "manage") or (page.responsible_user_id == user.user_id)):
            raise ForbiddenError("Only the current page owner or documentation manager can reassign page responsibility.")

    if "parent_page_id" in changes and changes["parent_page_id"]:
        parent = await repo.get_page(db, changes["parent_page_id"])
        if not parent or parent.space_id != page.space_id or parent.id == page.id:
            raise ValidationAppError("Parent page must be a different page in the same space.")
    if "title" in changes:
        changes["slug"] = await _unique_page_slug(db, page.space_id, changes["title"], page.id)
    for field, value in changes.items():
        setattr(page, field, value)
    page.updated_by = user.user_id
    await db.commit()
    await db.refresh(page)
    if "content" in changes:
        await sync_page_relations(db, page.id, page.space_id, page.content)
    return PageRead.model_validate(page)


async def move_page(db: AsyncSession, user: CurrentUser, page_id: UUID, payload: PageMove) -> PageRead:
    page = await repo.get_page(db, page_id)
    if not page:
        raise NotFoundError("Documentation page", page_id)
    if not await _page_editable(db, user, page):
        raise ForbiddenError("You do not have permission to reorder this page.")
    parent = await repo.get_page(db, payload.parent_page_id) if payload.parent_page_id else None
    if payload.parent_page_id and (not parent or parent.space_id != page.space_id):
        raise ValidationAppError("Parent page must belong to the same space.")
    cursor = parent
    while cursor:
        if cursor.id == page.id:
            raise ValidationAppError("A page cannot be nested inside itself or one of its children.")
        cursor = await repo.get_page(db, cursor.parent_page_id) if cursor.parent_page_id else None
    before = await repo.get_page(db, payload.before_page_id) if payload.before_page_id else None
    if before and (before.space_id != page.space_id or before.parent_page_id != payload.parent_page_id or before.id == page.id):
        raise ValidationAppError("The target page must be a sibling in the destination.")
    siblings = [item for item in await repo.list_pages(db, page.space_id) if item.parent_page_id == payload.parent_page_id and item.id != page.id]
    insertion = siblings.index(before) if before in siblings else len(siblings)
    siblings.insert(insertion, page)
    page.parent_page_id = payload.parent_page_id
    for index, sibling in enumerate(siblings):
        sibling.position = index * 10
    page.updated_by = user.user_id
    await db.commit()
    await db.refresh(page)
    return PageRead.model_validate(page)


async def delete_page(db: AsyncSession, user: CurrentUser, page_id: UUID) -> None:
    page = await repo.get_page(db, page_id)
    if not page:
        raise NotFoundError("Documentation page", page_id)
    if not (page.created_by == user.user_id or await can_access(db, user, "page", page_id, "manage")):
        raise ForbiddenError("You do not have permission to delete this page.")
    await db.delete(page)
    await db.commit()


async def list_revisions(db: AsyncSession, user: CurrentUser, page_id: UUID) -> list[RevisionRead]:
    await get_page(db, user, page_id)
    return [RevisionRead.model_validate(revision) for revision in await repo.list_revisions(db, page_id)]


async def restore_revision(db: AsyncSession, user: CurrentUser, page_id: UUID, revision_id: UUID) -> PageRead:
    page = await repo.get_page(db, page_id)
    revision = await repo.get_revision(db, revision_id)
    if not page or not revision or revision.page_id != page_id:
        raise NotFoundError("Documentation revision", revision_id)
    if not await _page_editable(db, user, page):
        raise ForbiddenError("You do not have permission to restore this revision.")
    current = DocRevision(page_id=page.id, revision_number=await repo.next_revision_number(db, page.id), title=page.title, content=page.content, content_json=page.content_json, created_by=user.user_id, created_at=utcnow())
    db.add(current)
    page.title, page.content, page.content_json = revision.title, revision.content, revision.content_json
    page.updated_by = user.user_id
    await db.commit()
    await db.refresh(page)
    return PageRead.model_validate(page)


async def list_permissions(db: AsyncSession, user: CurrentUser, resource_type: str, resource_id: UUID) -> list[PermissionRead]:
    if not await can_access(db, user, resource_type, resource_id, "manage"):
        raise ForbiddenError("You do not have permission to view access rules.")
    return [PermissionRead.model_validate(item) for item in await repo.list_permissions(db, resource_type, resource_id)]


async def list_attachments(db: AsyncSession, user: CurrentUser, page_id: UUID) -> list[AttachmentRead]:
    await get_page(db, user, page_id)
    return [_attachment_read(item) for item in await repo.list_attachments(db, page_id)]


async def add_attachment(db: AsyncSession, user: CurrentUser, page_id: UUID, payload: AttachmentCreate) -> AttachmentRead:
    await get_page(db, user, page_id)
    page = await repo.get_page(db, page_id)
    if not page or not await _page_editable(db, user, page):
        raise ForbiddenError("You do not have permission to attach files.")
    attachment = DocAttachment(page_id=page_id, uploaded_by=user.user_id, **payload.model_dump())
    db.add(attachment)
    await db.commit()
    await db.refresh(attachment)
    return _attachment_read(attachment)


def _attachment_read(attachment: DocAttachment) -> AttachmentRead:
    return AttachmentRead(
        id=attachment.id,
        page_id=attachment.page_id,
        file_name=attachment.file_name,
        file_url=attachment.file_url or None,
        mime_type=attachment.mime_type,
        uploaded_by=attachment.uploaded_by,
        size_bytes=attachment.size_bytes,
        stored=bool(attachment.storage_key),
        created_at=attachment.created_at,
    )


async def upload_attachment(
    db: AsyncSession,
    user: CurrentUser,
    page_id: UUID,
    file_name: str,
    mime_type: str,
    content: BinaryIO,
    size_bytes: int,
) -> AttachmentRead:
    page = await repo.get_page(db, page_id)
    if not page or not await _page_editable(db, user, page):
        raise ForbiddenError("You do not have permission to attach files.")
    if size_bytes <= 0 or size_bytes > 25 * 1024 * 1024:
        raise ValidationAppError("Attachments must be between 1 byte and 25 MB.")
    safe_name = Path(file_name).name[:255] or "attachment"
    storage_key = f"docs/{page_id}/{uuid4()}-{safe_name}"
    file_storage_service.upload(storage_key, content, mime_type)
    attachment = DocAttachment(
        page_id=page_id,
        file_name=safe_name,
        file_url="",
        mime_type=mime_type,
        uploaded_by=user.user_id,
        storage_key=storage_key,
        size_bytes=size_bytes,
    )
    db.add(attachment)
    await db.commit()
    await db.refresh(attachment)
    return _attachment_read(attachment)


async def attachment_download_url(
    db: AsyncSession, user: CurrentUser, attachment_id: UUID
) -> str:
    attachment = await repo.get_attachment(db, attachment_id)
    if not attachment:
        raise NotFoundError("Documentation attachment", attachment_id)
    await get_page(db, user, attachment.page_id)
    if attachment.storage_key:
        return file_storage_service.presigned_url(attachment.storage_key)
    if attachment.file_url:
        return attachment.file_url
    raise NotFoundError("Documentation attachment file", attachment_id)


async def list_links(db: AsyncSession, user: CurrentUser, page_id: UUID) -> list[LinkRead]:
    await get_page(db, user, page_id)
    return [LinkRead.model_validate(item) for item in await repo.list_links(db, page_id)]


async def add_link(db: AsyncSession, user: CurrentUser, page_id: UUID, payload: LinkCreate) -> LinkRead:
    await get_page(db, user, page_id)
    page = await repo.get_page(db, page_id)
    if not page or not await _page_editable(db, user, page):
        raise ForbiddenError("You do not have permission to link this page.")
    link = DocLink(page_id=page_id, **payload.model_dump())
    db.add(link)
    await db.commit()
    await db.refresh(link)
    return LinkRead.model_validate(link)


async def list_entity_links(
    db: AsyncSession,
    user: CurrentUser,
    entity_type: str,
    entity_id: UUID,
) -> list[EntityDocLinkRead]:
    if entity_type not in {"project", "task", "team", "user"}:
        raise ValidationAppError("Unsupported linked work type.")
    visible: list[EntityDocLinkRead] = []
    for link, page in await repo.list_links_by_entity(db, entity_type, entity_id):
        space = await repo.get_space(db, page.space_id)
        if space and await _page_visible(db, user, page, space):
            visible.append(
                EntityDocLinkRead(
                    **LinkRead.model_validate(link).model_dump(),
                    title=page.title,
                    slug=page.slug,
                    space_id=page.space_id,
                    excerpt=page.excerpt,
                )
            )
    return visible


async def delete_link(
    db: AsyncSession,
    user: CurrentUser,
    page_id: UUID,
    link_id: UUID,
) -> None:
    link = await repo.get_link(db, link_id)
    if link is None or link.page_id != page_id:
        raise NotFoundError("Documentation link", link_id)
    page = await repo.get_page(db, page_id)
    if page is None or not await _page_editable(db, user, page):
        raise ForbiddenError("You do not have permission to unlink this page.")
    await db.delete(link)
    await db.commit()


async def set_published(db: AsyncSession, user: CurrentUser, page_id: UUID, published: bool) -> PageRead:
    page = await repo.get_page(db, page_id)
    if not page:
        raise NotFoundError("Documentation page", page_id)
    if not (user.is_super_admin() or has_global_docs_access(user, "publish")):
        raise ForbiddenError("Only a documentation publisher can publish or unpublish this page.")
    if not await _page_editable(db, user, page):
        raise ForbiddenError("You do not have permission to publish this page.")
    page.status = "published" if published else "internal"
    page.visibility = "public" if published else ("inherit" if page.visibility == "public" else page.visibility)
    page.updated_by = user.user_id
    await db.commit()
    await db.refresh(page)
    return PageRead.model_validate(page)


async def public_navigation(db: AsyncSession) -> list[dict]:
    grouped: dict[UUID, dict] = {}
    for space, page in await repo.public_navigation(db):
        grouped.setdefault(space.id, {"name": space.name, "slug": space.slug, "description": space.description, "pages": []})["pages"].append(PageSummary.model_validate(page, from_attributes=True).model_dump())
    return list(grouped.values())


async def get_public_page(db: AsyncSession, space_slug: str, page_slug: str) -> PublicPageRead:
    space = await repo.get_space_by_slug(db, space_slug)
    if not space:
        raise NotFoundError("Documentation page", page_slug)
    page = await repo.get_page_by_slug(db, space.id, page_slug)
    if not page or page.status != "published" or (space.visibility != "public" and page.visibility != "public"):
        raise NotFoundError("Documentation page", page_slug)
    return PublicPageRead.model_validate(page)


async def get_public_page_by_id(db: AsyncSession, page_id: UUID) -> PublicPageRead:
    page = await repo.get_page(db, page_id)
    space = await repo.get_space(db, page.space_id) if page else None
    if not page or not space or page.status != "published" or (space.visibility != "public" and page.visibility != "public"):
        raise NotFoundError("Documentation page", page_id)
    return PublicPageRead.model_validate(page)


async def search_public(db: AsyncSession, query: str) -> list[SearchResult]:
    clean = query.strip().replace("%", "").replace("_", "").replace("\\", "").strip()
    if len(clean) < 2:
        return []
    return [
        SearchResult(
            page_id=p.id,
            space_slug=s.slug,
            page_slug=p.slug,
            title=p.title,
            excerpt=p.excerpt,
            matched_in="title" if clean.lower() in p.title.lower() else "content",
        )
        for s, p in await repo.public_search(db, query)
    ]


async def replace_permissions(db: AsyncSession, user: CurrentUser, resource_type: str, resource_id: UUID, grants: list[PermissionGrant]) -> None:
    if resource_type not in {"space", "page"}:
        raise ValidationAppError("Resource type must be 'space' or 'page'.")
    resource = await (repo.get_space(db, resource_id) if resource_type == "space" else repo.get_page(db, resource_id))
    if not resource:
        raise NotFoundError(f"Documentation {resource_type}", resource_id)
    if not await can_access(db, user, resource_type, resource_id, "manage"):
        raise ForbiddenError("You do not have permission to manage access.")
    await repo.clear_permissions(db, resource_type, resource_id)
    for grant in grants:
        db.add(DocPermission(resource_type=resource_type, resource_id=resource_id, **grant.model_dump()))
    await db.commit()


async def add_comment(db: AsyncSession, user: CurrentUser, page_id: UUID, payload: CommentCreate) -> CommentRead:
    page = await repo.get_page(db, page_id)
    if not page:
        raise NotFoundError("Documentation page", page_id)
    space = await repo.get_space(db, page.space_id)
    visible = bool(space and await _page_visible(db, user, page, space))
    if not visible or not (has_global_docs_access(user, "comment") or await can_access(db, user, "page", page_id, "comment")):
        raise ForbiddenError("You do not have permission to comment on this page.")
    if payload.selection_start is not None and payload.selection_end is not None:
        selected = page.content[payload.selection_start:payload.selection_end]
        if selected != payload.selected_text:
            raise ValidationAppError("The selected text changed. Select it again before commenting.")
    comment = DocComment(page_id=page_id, author_user_id=user.user_id, **payload.model_dump())
    db.add(comment)
    await db.commit()
    await db.refresh(comment)
    return CommentRead.model_validate(comment)


async def list_comments(db: AsyncSession, user: CurrentUser, page_id: UUID) -> list[CommentRead]:
    await get_page(db, user, page_id)
    return [CommentRead.model_validate(c) for c in await repo.list_comments(db, page_id)]


async def get_page_backlinks(db: AsyncSession, user: CurrentUser, page_id: UUID) -> list[RelationRead]:
    await get_page(db, user, page_id)
    return await list_backlinks(db, page_id)


async def get_wikilink_autocomplete(
    db: AsyncSession,
    user: CurrentUser,
    query: str,
    space_id: UUID | None = None,
) -> list[dict]:
    return await wikilink_suggestions(db, query, space_id=space_id)


async def list_tags(db: AsyncSession, user: CurrentUser) -> list[TagRead]:
    stmt = select(DocTag).order_by(DocTag.name.asc())
    result = await db.execute(stmt)
    tags = result.scalars().all()
    return [TagRead.model_validate(t) for t in tags]


async def add_page_tag(
    db: AsyncSession,
    user: CurrentUser,
    page_id: UUID,
    tag_name: str,
) -> None:
    page = await repo.get_page(db, page_id)
    if not page:
        raise NotFoundError("Documentation page", page_id)
    if not await _page_editable(db, user, page):
        raise ForbiddenError("You do not have permission to edit this page.")

    clean_name = tag_name.strip().lstrip("#").lower()
    if not clean_name:
        raise ValidationAppError("Tag name cannot be empty.")

    stmt = select(DocTag).where(DocTag.name == clean_name)
    res = await db.execute(stmt)
    tag = res.scalar_one_or_none()
    if not tag:
        tag = DocTag(name=clean_name)
        db.add(tag)
        await db.flush()

    pt_stmt = select(DocPageTag).where(DocPageTag.page_id == page_id, DocPageTag.tag_id == tag.id)
    pt_res = await db.execute(pt_stmt)
    if not pt_res.scalar_one_or_none():
        page_tag = DocPageTag(page_id=page_id, tag_id=tag.id)
        db.add(page_tag)
        await db.commit()


async def remove_page_tag(
    db: AsyncSession,
    user: CurrentUser,
    page_id: UUID,
    tag_name: str,
) -> None:
    page = await repo.get_page(db, page_id)
    if not page:
        raise NotFoundError("Documentation page", page_id)
    if not await _page_editable(db, user, page):
        raise ForbiddenError("You do not have permission to edit this page.")

    clean_name = tag_name.strip().lstrip("#").lower()
    stmt = select(DocTag).where(DocTag.name == clean_name)
    res = await db.execute(stmt)
    tag = res.scalar_one_or_none()
    if tag:
        del_stmt = delete(DocPageTag).where(DocPageTag.page_id == page_id, DocPageTag.tag_id == tag.id)
        await db.execute(del_stmt)
        await db.commit()
