from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, File, Query, Response, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.current_user import CurrentUser
from app.core.database import get_db
from app.core.deps import get_current_user, require_permission
from app.core.permissions import Permissions
from app.modules.docs import ai_service, graph_service, search_service, service, sources_service
from app.modules.docs.schemas import (
    AIChatRequest,
    AttachmentCreate,
    AttachmentRead,
    CommentCreate,
    CommentRead,
    EntityDocLinkRead,
    GraphResponse,
    LinkCreate,
    LinkRead,
    PageCreate,
    PageMove,
    PageRead,
    PageSummary,
    PageUpdate,
    PermissionGrant,
    PermissionRead,
    RelationRead,
    RevisionRead,
    SearchResponse,
    SearchResult,
    SearchResultItem,
    SourceCreate,
    SourceRead,
    SpaceCreate,
    SpaceRead,
    SpaceUpdate,
    TagRead,
)

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


# --- Knowledge Workspace Endpoints ---


@docs_router.get("/pages/{page_id}/backlinks", response_model=list[RelationRead])
async def page_backlinks(
    page_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> list[RelationRead]:
    return await service.get_page_backlinks(db, user, page_id)


@docs_router.get("/wikilink-suggestions")
async def wikilink_suggestions(
    q: str = Query(default="", max_length=100),
    space_id: UUID | None = None,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> list[dict]:
    return await service.get_wikilink_autocomplete(db, user, q, space_id=space_id)


@docs_router.get("/search/v2", response_model=SearchResponse)
async def search_v2(
    q: str = Query(min_length=1, max_length=120),
    space_id: UUID | None = None,
    tag: str | None = None,
    doc_type: str | None = None,
    limit: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> SearchResponse:
    return await search_service.search_pages_v2(
        db, user, q, space_id=space_id, tag=tag, doc_type=doc_type, limit=limit
    )


@docs_router.get("/search/quick", response_model=list[SearchResultItem])
async def search_quick(
    q: str = Query(default="", max_length=100),
    limit: int = Query(default=10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> list[SearchResultItem]:
    return await search_service.quick_search(db, user, q, limit=limit)


@docs_router.get("/graph/local", response_model=GraphResponse)
async def graph_local(
    page_id: UUID,
    depth: int = Query(default=1, ge=1, le=2),
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> GraphResponse:
    return await graph_service.get_local_graph(db, user, page_id, depth=depth)


@docs_router.get("/graph/global", response_model=GraphResponse)
async def graph_global(
    space_id: UUID | None = None,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> GraphResponse:
    return await graph_service.get_global_graph(db, user, space_id=space_id)


@docs_router.post("/sources", response_model=SourceRead, status_code=status.HTTP_201_CREATED)
async def create_source(
    payload: SourceCreate,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_permission(Permissions.DOCS_EDIT, Permissions.DOCS_MANAGE)),
) -> SourceRead:
    return await sources_service.create_source(db, user, payload)


@docs_router.get("/sources", response_model=list[SourceRead])
async def list_sources(
    space_id: UUID | None = None,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> list[SourceRead]:
    return await sources_service.list_sources(db, user, space_id=space_id)


@docs_router.get("/sources/{source_id}", response_model=SourceRead)
async def get_source(
    source_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> SourceRead:
    return await sources_service.get_source(db, user, source_id)


@docs_router.delete("/sources/{source_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_source(
    source_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> Response:
    await sources_service.delete_source(db, user, source_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@docs_router.post("/ai/chat/stream")
async def ai_chat_stream(
    payload: AIChatRequest,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> StreamingResponse:
    generator = ai_service.stream_chat_response(db, user, payload)
    return StreamingResponse(generator, media_type="text/event-stream")


@docs_router.get("/ai/sessions")
async def ai_sessions(
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> list[dict]:
    return await ai_service.list_chat_sessions(db, user)


@docs_router.get("/ai/sessions/{session_id}/messages")
async def ai_session_messages(
    session_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> list[dict]:
    return await ai_service.get_chat_session_messages(db, user, session_id)


@docs_router.get("/tags", response_model=list[TagRead])
async def list_tags(
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> list[TagRead]:
    return await service.list_tags(db, user)


@docs_router.post("/pages/{page_id}/tags/{tag_name}", status_code=status.HTTP_204_NO_CONTENT)
async def add_page_tag(
    page_id: UUID,
    tag_name: str,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> Response:
    await service.add_page_tag(db, user, page_id, tag_name)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@docs_router.delete("/pages/{page_id}/tags/{tag_name}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_page_tag(
    page_id: UUID,
    tag_name: str,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> Response:
    await service.remove_page_tag(db, user, page_id, tag_name)
    return Response(status_code=status.HTTP_204_NO_CONTENT)

