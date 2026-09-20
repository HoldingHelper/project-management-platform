from __future__ import annotations

from typing import Sequence
from uuid import UUID

from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.docs.models import DocAttachment, DocComment, DocFavorite, DocLink, DocPage, DocPermission, DocRevision, DocSpace, DocView
from app.shared.base_model import utcnow


async def get_space(db: AsyncSession, space_id: UUID) -> DocSpace | None:
    return await db.get(DocSpace, space_id)


async def get_space_by_slug(db: AsyncSession, slug: str) -> DocSpace | None:
    result = await db.execute(select(DocSpace).where(DocSpace.slug == slug))
    return result.scalar_one_or_none()


async def list_spaces(db: AsyncSession, category: str | None = None) -> Sequence[DocSpace]:
    stmt = select(DocSpace)
    if category:
        stmt = stmt.where(DocSpace.category == category)
    result = await db.execute(stmt.order_by(DocSpace.position, DocSpace.name))
    return result.scalars().all()


async def get_page(db: AsyncSession, page_id: UUID) -> DocPage | None:
    return await db.get(DocPage, page_id)


async def get_page_by_slug(db: AsyncSession, space_id: UUID, slug: str) -> DocPage | None:
    result = await db.execute(select(DocPage).where(DocPage.space_id == space_id, DocPage.slug == slug))
    return result.scalar_one_or_none()


async def list_pages(db: AsyncSession, space_id: UUID | None = None, category: str | None = None) -> Sequence[DocPage]:
    stmt = select(DocPage)
    if space_id:
        stmt = stmt.where(DocPage.space_id == space_id)
    elif category:
        stmt = stmt.join(DocSpace, DocPage.space_id == DocSpace.id).where(DocSpace.category == category)
    result = await db.execute(stmt.order_by(DocPage.position, DocPage.title))
    return result.scalars().all()


async def search_pages(db: AsyncSession, query: str, category: str | None = None, limit: int = 40) -> Sequence[DocPage]:
    needle = f"%{query.strip()}%"
    stmt = select(DocPage).where(or_(DocPage.title.ilike(needle), DocPage.excerpt.ilike(needle), DocPage.content.ilike(needle)))
    if category:
        stmt = stmt.join(DocSpace, DocPage.space_id == DocSpace.id).where(DocSpace.category == category)
    result = await db.execute(stmt.order_by(DocPage.updated_at.desc()).limit(limit))
    return result.scalars().all()


async def public_navigation(db: AsyncSession) -> Sequence[tuple[DocSpace, DocPage]]:
    result = await db.execute(
        select(DocSpace, DocPage)
        .join(DocPage, DocPage.space_id == DocSpace.id)
        .where(DocPage.status == "published")
        .where(or_(DocSpace.visibility == "public", DocPage.visibility == "public"))
        .order_by(DocSpace.position, DocPage.position, DocPage.title)
    )
    return result.all()


async def public_search(db: AsyncSession, query: str, limit: int = 20) -> Sequence[tuple[DocSpace, DocPage]]:
    needle = f"%{query.strip()}%"
    result = await db.execute(
        select(DocSpace, DocPage)
        .join(DocPage, DocPage.space_id == DocSpace.id)
        .where(DocPage.status == "published")
        .where(or_(DocSpace.visibility == "public", DocPage.visibility == "public"))
        .where(or_(DocPage.title.ilike(needle), DocPage.excerpt.ilike(needle), DocPage.content.ilike(needle)))
        .order_by(DocPage.updated_at.desc())
        .limit(limit)
    )
    return result.all()


async def list_permissions(db: AsyncSession, resource_type: str, resource_id: UUID) -> Sequence[DocPermission]:
    result = await db.execute(select(DocPermission).where(DocPermission.resource_type == resource_type, DocPermission.resource_id == resource_id))
    return result.scalars().all()


async def list_revisions(db: AsyncSession, page_id: UUID) -> Sequence[DocRevision]:
    result = await db.execute(select(DocRevision).where(DocRevision.page_id == page_id).order_by(DocRevision.revision_number.desc()))
    return result.scalars().all()


async def get_revision(db: AsyncSession, revision_id: UUID) -> DocRevision | None:
    return await db.get(DocRevision, revision_id)


async def list_attachments(db: AsyncSession, page_id: UUID) -> Sequence[DocAttachment]:
    result = await db.execute(select(DocAttachment).where(DocAttachment.page_id == page_id).order_by(DocAttachment.created_at.desc()))
    return result.scalars().all()


async def get_attachment(db: AsyncSession, attachment_id: UUID) -> DocAttachment | None:
    return await db.get(DocAttachment, attachment_id)


async def list_links(db: AsyncSession, page_id: UUID) -> Sequence[DocLink]:
    result = await db.execute(select(DocLink).where(DocLink.page_id == page_id).order_by(DocLink.created_at.desc()))
    return result.scalars().all()


async def list_links_by_entity(
    db: AsyncSession, entity_type: str, entity_id: UUID
) -> Sequence[tuple[DocLink, DocPage]]:
    result = await db.execute(
        select(DocLink, DocPage)
        .join(DocPage, DocPage.id == DocLink.page_id)
        .where(
            DocLink.entity_type == entity_type,
            DocLink.entity_id == entity_id,
        )
        .order_by(DocPage.title, DocLink.created_at)
    )
    return result.all()


async def get_link(db: AsyncSession, link_id: UUID) -> DocLink | None:
    return await db.get(DocLink, link_id)


async def next_revision_number(db: AsyncSession, page_id: UUID) -> int:
    result = await db.execute(select(func.max(DocRevision.revision_number)).where(DocRevision.page_id == page_id))
    return int(result.scalar_one_or_none() or 0) + 1


async def touch_view(db: AsyncSession, user_id: UUID, page_id: UUID) -> None:
    view = await db.get(DocView, (user_id, page_id))
    if view:
        view.viewed_at = utcnow()
    else:
        db.add(DocView(user_id=user_id, page_id=page_id, viewed_at=utcnow()))


async def set_favorite(db: AsyncSession, user_id: UUID, page_id: UUID, enabled: bool) -> None:
    favorite = await db.get(DocFavorite, (user_id, page_id))
    if enabled and not favorite:
        db.add(DocFavorite(user_id=user_id, page_id=page_id, created_at=utcnow()))
    elif not enabled and favorite:
        await db.delete(favorite)


async def list_comments(db: AsyncSession, page_id: UUID) -> Sequence[DocComment]:
    result = await db.execute(select(DocComment).where(DocComment.page_id == page_id).order_by(DocComment.created_at))
    return result.scalars().all()


async def list_recent_pages(db: AsyncSession, user_id: UUID, category: str | None = None, limit: int = 12) -> Sequence[DocPage]:
    stmt = select(DocPage).join(DocView, DocView.page_id == DocPage.id).where(DocView.user_id == user_id)
    if category:
        stmt = stmt.join(DocSpace, DocPage.space_id == DocSpace.id).where(DocSpace.category == category)
    result = await db.execute(stmt.order_by(DocView.viewed_at.desc()).limit(limit))
    return result.scalars().all()


async def list_favorite_pages(db: AsyncSession, user_id: UUID, category: str | None = None) -> Sequence[DocPage]:
    stmt = select(DocPage).join(DocFavorite, DocFavorite.page_id == DocPage.id).where(DocFavorite.user_id == user_id)
    if category:
        stmt = stmt.join(DocSpace, DocPage.space_id == DocSpace.id).where(DocSpace.category == category)
    result = await db.execute(stmt.order_by(DocFavorite.created_at.desc()))
    return result.scalars().all()


async def clear_permissions(db: AsyncSession, resource_type: str, resource_id: UUID) -> None:
    await db.execute(delete(DocPermission).where(DocPermission.resource_type == resource_type, DocPermission.resource_id == resource_id))
