from __future__ import annotations

import re
from pathlib import Path
from typing import BinaryIO
from uuid import UUID, uuid4

from slugify import slugify
from sqlalchemy import delete, select
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
    if resource_type == "page":
        page = await repo.get_page(db, resource_id)
        if not page or (page.status == "archived" and not user.is_super_admin()):
            return False
        if action in {"edit", "manage"} and page.status not in {"draft", "internal"}:
            return False
    from app.modules.docs.upload_library import managed_access
    managed = await managed_access(db, user, resource_type, resource_id, action)
    if managed is not None:
        return managed
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
    if page.status == "archived":
        return user.is_super_admin()
    from app.modules.docs.upload_library import managed_access
    if space.product_id or space.task_id:
        return bool(await managed_access(db, user, "page", page.id))
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
    if page.status not in {"draft", "internal"}:
        return False
    from app.modules.docs.upload_library import managed_access
    space = await repo.get_space(db, page.space_id)
    if space and (space.product_id or space.task_id):
        return bool(await managed_access(db, user, "page", page.id, "edit"))
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
    visible = []
    from app.modules.docs.upload_library import managed_access
    for space in spaces:
        managed = await managed_access(db, user, "space", space.id)
        if managed is not None:
            if managed:
                visible.append(space)
        elif (space.visibility == "public" or (space.visibility == "workspace" and has_global_docs_access(user, "view")) or space.responsible_user_id == user.user_id or await can_access(db, user, "space", space.id, "view")):
            visible.append(space)
    return [SpaceRead.model_validate(s).model_copy(update={"can_create_pages": await can_create_page(db, user, s)}) for s in visible]


async def can_create_page(db: AsyncSession, user: CurrentUser, space: DocSpace) -> bool:
    # Creation is separate from editing other users' drafts. Managed workspaces
    # still require the corresponding product/task authorization.
    if not (user.is_super_admin() or user.has_any_permission("docs.create", "docs.edit", "docs.manage")):
        return False
    from app.modules.docs.upload_library import managed_access
    managed = await managed_access(db, user, "space", space.id, "edit")
    if managed is not None:
        return managed
    return (space.visibility in {"workspace", "public"}
            or await can_access(db, user, "space", space.id, "edit"))


async def create_page(db: AsyncSession, user: CurrentUser, space_id: UUID, payload: PageCreate) -> PageRead:
    space = await repo.get_space(db, space_id)
    if not space:
        raise NotFoundError("Documentation space", space_id)
    if not await can_create_page(db, user, space):
        raise ForbiddenError("You do not have permission to create pages in this space.")
    if payload.parent_page_id:
        parent = await repo.get_page(db, payload.parent_page_id)
        if not parent or parent.space_id != space_id:
            raise ValidationAppError("Parent page must belong to the same space.")
    page = DocPage(**payload.model_dump(exclude={"tags"}), space_id=space_id, slug=await _unique_page_slug(db, space_id, payload.title), created_by=user.user_id, updated_by=user.user_id)
    db.add(page)
    if payload.tags:
        await db.flush()
        for name in sorted({value.strip().lstrip("#").lower() for value in payload.tags} - {""}):
            tag = (await db.execute(select(DocTag).where(DocTag.name == name))).scalar_one_or_none()
            if not tag:
                tag = DocTag(name=name)
                db.add(tag)
                await db.flush()
            db.add(DocPageTag(page_id=page.id, tag_id=tag.id))
    await db.commit()
    await db.refresh(page)
    await resolve_stubs_for_new_page(db, page)
    await sync_page_relations(db, page.id, page.content)
    await db.commit()
    return PageRead.model_validate(page)


async def list_pages(db: AsyncSession, user: CurrentUser, space_id: UUID | None = None, category: str | None = None) -> list[PageSummary]:
    pages = await repo.list_pages(db, space_id=space_id, category=category)
    result = []
    for page in pages:
        space = await repo.get_space(db, page.space_id)
        if page.status != "archived" and space and await _page_visible(db, user, page, space):
            result.append(PageSummary.model_validate(page, from_attributes=True))
    return result


async def search_pages(db: AsyncSession, user: CurrentUser, query: str, category: str | None = None) -> list[PageSummary]:
    result: list[PageSummary] = []
    for page in await repo.search_pages(db, query, category=category):
        space = await repo.get_space(db, page.space_id)
        if page.status != "archived" and space and await _page_visible(db, user, page, space):
            result.append(PageSummary.model_validate(page, from_attributes=True))
    return result


async def list_personal_pages(db: AsyncSession, user: CurrentUser, kind: str, category: str | None = None) -> list[PageSummary]:
    pages = await (repo.list_recent_pages(db, user.user_id, category=category) if kind == "recent" else repo.list_favorite_pages(db, user.user_id, category=category))
    result: list[PageSummary] = []
    for page in pages:
        space = await repo.get_space(db, page.space_id)
        if page.status != "archived" and space and await _page_visible(db, user, page, space):
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
    await db.refresh(page)
    return PageRead.model_validate(page)


async def update_page(db: AsyncSession, user: CurrentUser, page_id: UUID, payload: PageUpdate) -> PageRead:
    page = await _locked_page(db, page_id)
    if not page:
        raise NotFoundError("Documentation page", page_id)
    if not await _page_editable(db, user, page):
        raise ForbiddenError("You do not have permission to edit this page.")
    revision = DocRevision(page_id=page.id, revision_number=await repo.next_revision_number(db, page.id), title=page.title, content=page.content, content_json=page.content_json, created_by=user.user_id, created_at=utcnow())
    db.add(revision)
    managed_space = await repo.get_space(db, page.space_id)
    if managed_space and (managed_space.product_id or managed_space.task_id):
        if payload.visibility not in (None, "inherit", "private") or ("parent_page_id" in payload.model_fields_set and payload.parent_page_id != page.parent_page_id):
            raise ValidationAppError("Uploaded documentation must stay in its source workspace and folder.")
    changes = payload.model_dump(exclude_unset=True)
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
        await sync_page_relations(db, page.id, page.content)
    return PageRead.model_validate(page)


async def move_page(db: AsyncSession, user: CurrentUser, page_id: UUID, payload: PageMove) -> PageRead:
    page = await _locked_page(db, page_id)
    if not page:
        raise NotFoundError("Documentation page", page_id)
    if not await _page_editable(db, user, page):
        raise ForbiddenError("You do not have permission to reorder this page.")
    space = await repo.get_space(db, page.space_id)
    if space and (space.product_id or space.task_id) and payload.parent_page_id != page.parent_page_id:
        raise ValidationAppError("Uploaded documentation must stay in its source folder.")
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
    if any(sibling.status not in {"draft", "internal"} and sibling.position != index * 10 for index, sibling in enumerate(siblings)):
        raise ForbiddenError("Published documents cannot be reordered.")
    for index, sibling in enumerate(siblings):
        sibling.position = index * 10
    page.updated_by = user.user_id
    await db.commit()
    await db.refresh(page)
    return PageRead.model_validate(page)


async def delete_page(db: AsyncSession, user: CurrentUser, page_id: UUID) -> None:
    raise ForbiddenError("Documents cannot be deleted. Archive the document instead.")


async def list_revisions(db: AsyncSession, user: CurrentUser, page_id: UUID) -> list[RevisionRead]:
    await get_page(db, user, page_id)
    return [RevisionRead.model_validate(revision) for revision in await repo.list_revisions(db, page_id)]


async def restore_revision(db: AsyncSession, user: CurrentUser, page_id: UUID, revision_id: UUID) -> PageRead:
    page = await _locked_page(db, page_id)
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
    from app.modules.collaboration.sharing import doc_permission
    result = []
    for item in await repo.list_attachments(db, page_id):
        permission = await doc_permission(db, user, item.id)
        result.append(_attachment_read(item, permission["enabled"]))
    return result


async def add_attachment(db: AsyncSession, user: CurrentUser, page_id: UUID, payload: AttachmentCreate) -> AttachmentRead:
    await get_page(db, user, page_id)
    page = await _locked_page(db, page_id)
    if not page or not await _page_editable(db, user, page):
        raise ForbiddenError("You do not have permission to attach files.")
    attachment = DocAttachment(page_id=page_id, uploaded_by=user.user_id, **payload.model_dump())
    db.add(attachment)
    await db.commit()
    await db.refresh(attachment)
    return _attachment_read(attachment)


def _attachment_read(attachment: DocAttachment, enabled: bool | None = None) -> AttachmentRead:
    enabled = attachment.download_share_enabled if enabled is None else enabled
    return AttachmentRead(
        id=attachment.id,
        page_id=attachment.page_id,
        file_name=attachment.file_name,
        file_url=(attachment.file_url or None) if enabled else None,
        mime_type=attachment.mime_type,
        uploaded_by=attachment.uploaded_by,
        size_bytes=attachment.size_bytes,
        stored=bool(attachment.storage_key),
        download_share_enabled=enabled,
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
    page = await _locked_page(db, page_id)
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
    from app.modules.collaboration.sharing import doc_attachment, require_download_enabled
    _, source = await doc_attachment(db, user, attachment_id)
    require_download_enabled(source)
    if attachment.storage_key:
        return f"/api/v1/docs/attachments/{attachment.id}/download"
    if attachment.file_url:
        return attachment.file_url
    raise NotFoundError("Documentation attachment file", attachment_id)


async def list_links(db: AsyncSession, user: CurrentUser, page_id: UUID) -> list[LinkRead]:
    await get_page(db, user, page_id)
    return [LinkRead.model_validate(item) for item in await repo.list_links(db, page_id)]


async def add_link(db: AsyncSession, user: CurrentUser, page_id: UUID, payload: LinkCreate) -> LinkRead:
    await get_page(db, user, page_id)
    page = await _locked_page(db, page_id)
    if not page or not await _page_editable(db, user, page):
        raise ForbiddenError("You do not have permission to link this page.")
    if payload.entity_type == "product":
        await _authorize_product_link(db, user, payload.entity_id, manage=True)
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
    if entity_type not in {"product", "project", "task", "team", "user"}:
        raise ValidationAppError("Unsupported linked work type.")
    if entity_type == "product":
        await _authorize_product_link(db, user, entity_id)
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
    page = await _locked_page(db, page_id)
    if page is None or not await _page_editable(db, user, page):
        raise ForbiddenError("You do not have permission to unlink this page.")
    if link.entity_type == "product":
        await _authorize_product_link(db, user, link.entity_id, manage=True)
    await db.delete(link)
    await db.commit()


async def _locked_page(db, page_id):
    page = (await db.execute(select(DocPage).where(DocPage.id == page_id).with_for_update().execution_options(populate_existing=True))).scalar_one_or_none()
    if page is None:
        raise NotFoundError("Documentation page", page_id)
    return page


async def _can_publish_page(db, user, page):
    author_can_publish = page.created_by == user.user_id and (
        user.allow_role_bypass or user.has_any_permission("docs.create", "docs.edit", "docs.manage")
    )
    return bool(
        (user.is_super_admin() or has_global_docs_access(user, "publish") or author_can_publish)
        and await _page_editable(db, user, page)
    )


async def lifecycle_permissions(db, user, page_id):
    page = await repo.get_page(db, page_id)
    if not page:
        raise NotFoundError("Documentation page", page_id)
    space = await repo.get_space(db, page.space_id)
    if not space or not await _page_visible(db, user, page, space):
        raise NotFoundError("Documentation page", page_id)
    managed_folder = bool(page.source_entity_type and not page.source_attachment_id)
    writable_token = user.allow_role_bypass or user.has_any_permission("docs.edit", "docs.manage")
    return {
        "page_id": str(page.id), "status": page.status,
        "can_edit": await _page_editable(db, user, page),
        "can_comment": page.status != "archived" and (has_global_docs_access(user, "comment") or await can_access(db, user, "page", page.id, "comment")),
        "can_publish": await _can_publish_page(db, user, page),
        "can_archive": not managed_folder and page.status != "archived" and (user.is_super_admin() or (page.created_by == user.user_id and writable_token)),
        "can_restore": page.status == "archived" and user.is_super_admin(),
    }


async def _notify_lifecycle(page):
    # Invalidation only: no document titles, content, or author details in frames.
    from app.core.websocket_manager import connection_manager, PRESENCE_GROUP
    try:
        await connection_manager.broadcast_to_group(PRESENCE_GROUP, "docs.lifecycle", {"page_id": str(page.id), "status": page.status})
    except Exception:
        import logging
        logging.getLogger(__name__).exception("Could not broadcast document lifecycle invalidation")


async def set_archived(db, user, page_id, archived=True):
    page = await _locked_page(db, page_id)
    if archived:
        if page.source_entity_type and not page.source_attachment_id:
            raise ForbiddenError("Managed folders cannot be archived. Archive individual documents instead.")
        if not (user.is_super_admin() or (page.created_by == user.user_id and (user.allow_role_bypass or user.has_any_permission("docs.edit", "docs.manage")))):
            raise ForbiddenError("Only the document author or a Super Admin can archive it.")
        if page.status != "archived":
            page.archived_from_status = "draft" if page.status in {"draft", "internal"} else "published"
            page.status = "archived"
    else:
        if not user.is_super_admin():
            raise ForbiddenError("Only a Super Admin can restore archived documents.")
        if page.status != "archived":
            raise ValidationAppError("Only archived documents can be restored.")
        page.status = page.archived_from_status or "published"
        page.archived_from_status = None
    page.updated_by = user.user_id
    await db.commit()
    await db.refresh(page)
    await _notify_lifecycle(page)
    return PageRead.model_validate(page)


async def set_published(db: AsyncSession, user: CurrentUser, page_id: UUID, published: bool) -> PageRead:
    if not published:
        raise ForbiddenError("Published documents cannot return to draft. Archive the document instead.")
    page = await _locked_page(db, page_id)
    if not await _can_publish_page(db, user, page):
        raise ForbiddenError("Only the author or an authorized publisher can publish an editable draft.")
    # Publication locks content; it does not grant public or wider access.
    page.status = "published"
    page.updated_by = user.user_id
    await db.commit()
    await db.refresh(page)
    await _notify_lifecycle(page)
    return PageRead.model_validate(page)


async def public_navigation(db: AsyncSession) -> list[dict]:
    grouped: dict[UUID, dict] = {}
    for space, page in await repo.public_navigation(db):
        grouped.setdefault(space.id, {"name": space.name, "slug": space.slug, "description": space.description, "pages": []})["pages"].append(PageSummary.model_validate(page, from_attributes=True).model_dump())
    return list(grouped.values())


async def get_public_page(db: AsyncSession, space_slug: str, page_slug: str) -> PublicPageRead:
    space = await repo.get_space_by_slug(db, space_slug)
    if not space or space.product_id or space.task_id:
        raise NotFoundError("Documentation page", page_slug)
    page = await repo.get_page_by_slug(db, space.id, page_slug)
    if not page or page.status != "published" or (space.visibility != "public" and page.visibility != "public"):
        raise NotFoundError("Documentation page", page_slug)
    return PublicPageRead.model_validate(page)


async def get_public_page_by_id(db: AsyncSession, page_id: UUID) -> PublicPageRead:
    page = await repo.get_page(db, page_id)
    space = await repo.get_space(db, page.space_id) if page else None
    if not page or not space or space.product_id or space.task_id or page.status != "published" or (space.visibility != "public" and page.visibility != "public"):
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
    return await list_backlinks(db, user, page_id)


async def get_wikilink_autocomplete(
    db: AsyncSession,
    user: CurrentUser,
    query: str,
    space_id: UUID | None = None,
) -> list[dict]:
    return await wikilink_suggestions(db, user, query)


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
    page = await _locked_page(db, page_id)
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
    page = await _locked_page(db, page_id)
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

async def _authorize_product_link(db: AsyncSession, user: CurrentUser, product_id: UUID, *, manage: bool = False) -> None:
    from app.modules.projects.product_access import require_product_access
    await require_product_access(db, user, product_id)
    if manage and not (user.is_super_admin() or user.has_any_permission("products.update", "products.manage_all")):
        raise ForbiddenError("You do not have permission to edit product-line documents.")
