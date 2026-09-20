from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, File, Query, Response, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.current_user import CurrentUser
from app.core.deps import get_current_user, require_permission
from app.core.database import get_db
from app.core.permissions import Permissions
from app.modules.docs import service
from app.modules.docs.schemas import AttachmentCreate, AttachmentRead, CommentCreate, CommentRead, EntityDocLinkRead, LinkCreate, LinkRead, PageCreate, PageMove, PageRead, PageSummary, PageUpdate, PermissionGrant, PermissionRead, RevisionRead, SearchResult, SpaceCreate, SpaceRead, SpaceUpdate

public_docs_router = APIRouter(prefix="/docs/public", tags=["Public documentation"])
docs_router = APIRouter(prefix="/docs", tags=["Documentation"])


@public_docs_router.get("/navigation")
async def navigation(db: AsyncSession = Depends(get_db)) -> list[dict]:
    return await service.public_navigation(db)


@public_docs_router.get("/search", response_model=list[SearchResult])
async def search(q: str = Query(min_length=2, max_length=120), db: AsyncSession = Depends(get_db)) -> list[SearchResult]:
    return await service.search_public(db, q)


@public_docs_router.get("/pages/{page_id}", response_model=PageRead)
async def public_page_by_id(page_id: UUID, db: AsyncSession = Depends(get_db)) -> PageRead:
    return await service.get_public_page_by_id(db, page_id)


@public_docs_router.get("/{space_slug}/{page_slug}", response_model=PageRead)
async def public_page(space_slug: str, page_slug: str, db: AsyncSession = Depends(get_db)) -> PageRead:
    return await service.get_public_page(db, space_slug, page_slug)


@docs_router.get("/spaces", response_model=list[SpaceRead])
async def spaces(category: str | None = None, db: AsyncSession = Depends(get_db), user: CurrentUser = Depends(get_current_user)) -> list[SpaceRead]:
    return await service.list_spaces(db, user, category=category)


@docs_router.post("/spaces", response_model=SpaceRead, status_code=status.HTTP_201_CREATED)
async def create_space(payload: SpaceCreate, db: AsyncSession = Depends(get_db), user: CurrentUser = Depends(require_permission(Permissions.DOCS_MANAGE, Permissions.DOCS_EDIT))) -> SpaceRead:
    return await service.create_space(db, user, payload)


@docs_router.patch("/spaces/{space_id}", response_model=SpaceRead)
async def update_space(space_id: UUID, payload: SpaceUpdate, db: AsyncSession = Depends(get_db), user: CurrentUser = Depends(get_current_user)) -> SpaceRead:
    return await service.update_space(db, user, space_id, payload)


@docs_router.get("/pages", response_model=list[PageSummary])
async def pages(space_id: UUID | None = None, category: str | None = None, db: AsyncSession = Depends(get_db), user: CurrentUser = Depends(get_current_user)) -> list[PageSummary]:
    return await service.list_pages(db, user, space_id=space_id, category=category)


@docs_router.get("/search", response_model=list[PageSummary])
async def search_private(q: str = Query(min_length=2, max_length=120), category: str | None = None, db: AsyncSession = Depends(get_db), user: CurrentUser = Depends(get_current_user)) -> list[PageSummary]:
    return await service.search_pages(db, user, q, category=category)


@docs_router.get("/recent", response_model=list[PageSummary])
async def recent(category: str | None = None, db: AsyncSession = Depends(get_db), user: CurrentUser = Depends(get_current_user)) -> list[PageSummary]:
    return await service.list_personal_pages(db, user, "recent", category=category)


@docs_router.get("/favorites", response_model=list[PageSummary])
async def favorites(category: str | None = None, db: AsyncSession = Depends(get_db), user: CurrentUser = Depends(get_current_user)) -> list[PageSummary]:
    return await service.list_personal_pages(db, user, "favorites", category=category)


@docs_router.post("/spaces/{space_id}/pages", response_model=PageRead, status_code=status.HTTP_201_CREATED)
async def create_page(space_id: UUID, payload: PageCreate, db: AsyncSession = Depends(get_db), user: CurrentUser = Depends(require_permission(Permissions.DOCS_EDIT, Permissions.DOCS_MANAGE))) -> PageRead:
    return await service.create_page(db, user, space_id, payload)


@docs_router.get("/pages/{page_id}", response_model=PageRead)
async def page(page_id: UUID, db: AsyncSession = Depends(get_db), user: CurrentUser = Depends(get_current_user)) -> PageRead:
    return await service.get_page(db, user, page_id)


@docs_router.patch("/pages/{page_id}", response_model=PageRead)
async def update_page(page_id: UUID, payload: PageUpdate, db: AsyncSession = Depends(get_db), user: CurrentUser = Depends(get_current_user)) -> PageRead:
    return await service.update_page(db, user, page_id, payload)


@docs_router.post("/pages/{page_id}/move", response_model=PageRead)
async def move_page(page_id: UUID, payload: PageMove, db: AsyncSession = Depends(get_db), user: CurrentUser = Depends(get_current_user)) -> PageRead:
    return await service.move_page(db, user, page_id, payload)


@docs_router.delete("/pages/{page_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_page(page_id: UUID, db: AsyncSession = Depends(get_db), user: CurrentUser = Depends(get_current_user)) -> Response:
    await service.delete_page(db, user, page_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@docs_router.get("/pages/{page_id}/revisions", response_model=list[RevisionRead])
async def revisions(page_id: UUID, db: AsyncSession = Depends(get_db), user: CurrentUser = Depends(get_current_user)) -> list[RevisionRead]:
    return await service.list_revisions(db, user, page_id)


@docs_router.post("/pages/{page_id}/revisions/{revision_id}/restore", response_model=PageRead)
async def restore_revision(page_id: UUID, revision_id: UUID, db: AsyncSession = Depends(get_db), user: CurrentUser = Depends(get_current_user)) -> PageRead:
    return await service.restore_revision(db, user, page_id, revision_id)


@docs_router.post("/pages/{page_id}/publish", response_model=PageRead)
async def publish(page_id: UUID, db: AsyncSession = Depends(get_db), user: CurrentUser = Depends(get_current_user)) -> PageRead:
    return await service.set_published(db, user, page_id, True)


@docs_router.post("/pages/{page_id}/unpublish", response_model=PageRead)
async def unpublish(page_id: UUID, db: AsyncSession = Depends(get_db), user: CurrentUser = Depends(get_current_user)) -> PageRead:
    return await service.set_published(db, user, page_id, False)


@docs_router.put("/pages/{page_id}/favorite", status_code=status.HTTP_204_NO_CONTENT)
async def favorite(page_id: UUID, enabled: bool = True, db: AsyncSession = Depends(get_db), user: CurrentUser = Depends(get_current_user)) -> Response:
    await service.set_favorite(db, user, page_id, enabled)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@docs_router.put("/{resource_type}/{resource_id}/permissions", status_code=status.HTTP_204_NO_CONTENT)
async def permissions(resource_type: str, resource_id: UUID, grants: list[PermissionGrant], db: AsyncSession = Depends(get_db), user: CurrentUser = Depends(get_current_user)) -> Response:
    await service.replace_permissions(db, user, resource_type, resource_id, grants)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@docs_router.get("/{resource_type}/{resource_id}/permissions", response_model=list[PermissionRead])
async def get_permissions(resource_type: str, resource_id: UUID, db: AsyncSession = Depends(get_db), user: CurrentUser = Depends(get_current_user)) -> list[PermissionRead]:
    return await service.list_permissions(db, user, resource_type, resource_id)


@docs_router.get("/pages/{page_id}/comments", response_model=list[CommentRead])
async def comments(page_id: UUID, db: AsyncSession = Depends(get_db), user: CurrentUser = Depends(get_current_user)) -> list[CommentRead]:
    return await service.list_comments(db, user, page_id)


@docs_router.post("/pages/{page_id}/comments", response_model=CommentRead, status_code=status.HTTP_201_CREATED)
async def add_comment(page_id: UUID, payload: CommentCreate, db: AsyncSession = Depends(get_db), user: CurrentUser = Depends(get_current_user)) -> CommentRead:
    return await service.add_comment(db, user, page_id, payload)


@docs_router.get("/pages/{page_id}/attachments", response_model=list[AttachmentRead])
async def attachments(page_id: UUID, db: AsyncSession = Depends(get_db), user: CurrentUser = Depends(get_current_user)) -> list[AttachmentRead]:
    return await service.list_attachments(db, user, page_id)


@docs_router.post("/pages/{page_id}/attachments", response_model=AttachmentRead, status_code=status.HTTP_201_CREATED)
async def add_attachment(page_id: UUID, payload: AttachmentCreate, db: AsyncSession = Depends(get_db), user: CurrentUser = Depends(get_current_user)) -> AttachmentRead:
    return await service.add_attachment(db, user, page_id, payload)


@docs_router.post("/pages/{page_id}/attachments/upload", response_model=AttachmentRead, status_code=status.HTTP_201_CREATED)
async def upload_attachment(
    page_id: UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> AttachmentRead:
    import io

    content = await file.read()
    return await service.upload_attachment(
        db,
        user,
        page_id,
        file.filename or "attachment",
        file.content_type or "application/octet-stream",
        io.BytesIO(content),
        len(content),
    )


@docs_router.get("/attachments/{attachment_id}/download-url")
async def attachment_download_url(
    attachment_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> dict[str, str]:
    return {"url": await service.attachment_download_url(db, user, attachment_id)}


@docs_router.get("/pages/{page_id}/links", response_model=list[LinkRead])
async def links(page_id: UUID, db: AsyncSession = Depends(get_db), user: CurrentUser = Depends(get_current_user)) -> list[LinkRead]:
    return await service.list_links(db, user, page_id)


@docs_router.post("/pages/{page_id}/links", response_model=LinkRead, status_code=status.HTTP_201_CREATED)
async def add_link(page_id: UUID, payload: LinkCreate, db: AsyncSession = Depends(get_db), user: CurrentUser = Depends(get_current_user)) -> LinkRead:
    return await service.add_link(db, user, page_id, payload)


@docs_router.get(
    "/entity-links/{entity_type}/{entity_id}",
    response_model=list[EntityDocLinkRead],
)
async def entity_links(
    entity_type: str,
    entity_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> list[EntityDocLinkRead]:
    return await service.list_entity_links(db, user, entity_type, entity_id)


@docs_router.delete(
    "/pages/{page_id}/links/{link_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_link(
    page_id: UUID,
    link_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> Response:
    await service.delete_link(db, user, page_id, link_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
