from __future__ import annotations

import re
from typing import Sequence
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.current_user import CurrentUser
from app.modules.docs import repository as repo
from app.modules.docs.models import DocPage, DocPageTag, DocSpace, DocTag
from app.modules.docs.schemas import SearchResponse, SearchResultItem
from app.modules.docs.service import _page_visible


def _extract_highlight(content: str, query: str, max_chars: int = 160) -> str:
    if not content or not query:
        return ""
    q = query.strip()
    idx = content.lower().find(q.lower())
    if idx == -1:
        return content[:max_chars].strip() + ("..." if len(content) > max_chars else "")
    start = max(0, idx - 60)
    end = min(len(content), idx + len(q) + 90)
    snippet = content[start:end].strip()
    if start > 0:
        snippet = "..." + snippet
    if end < len(content):
        snippet = snippet + "..."
    return snippet


def _score_match(title: str, content: str, excerpt: str | None, query: str) -> tuple[float, str]:
    q = query.strip().lower()
    t = title.lower()
    e = (excerpt or "").lower()
    c = (content or "").lower()

    if t == q:
        return 1.0, "title"
    if t.startswith(q):
        return 0.9, "title"
    if q in t:
        return 0.75, "title"
    if excerpt and q in e:
        return 0.5, "excerpt"
    if q in c:
        return 0.35, "content"
    return 0.1, "content"


async def search_pages_v2(
    db: AsyncSession,
    user: CurrentUser,
    query: str,
    space_id: UUID | None = None,
    tag: str | None = None,
    doc_type: str | None = None,
    limit: int = 20,
) -> SearchResponse:
    q = query.strip()
    if not q:
        return SearchResponse(items=[], total=0, query=query)

    needle = f"%{q}%"
    stmt = select(DocPage, DocSpace).join(DocSpace, DocPage.space_id == DocSpace.id)

    if space_id:
        stmt = stmt.where(DocPage.space_id == space_id)

    if doc_type:
        stmt = stmt.where(DocPage.doc_type == doc_type)

    if tag:
        stmt = stmt.join(DocPageTag, DocPageTag.page_id == DocPage.id).join(DocTag, DocPageTag.tag_id == DocTag.id).where(DocTag.name == tag.lstrip("#"))

    # Matching condition: title, excerpt, or content
    stmt = stmt.where(
        or_(
            DocPage.title.ilike(needle),
            DocPage.slug.ilike(needle),
            DocPage.excerpt.ilike(needle),
            DocPage.content.ilike(needle),
        )
    )

    result = await db.execute(stmt.order_by(DocPage.updated_at.desc()).limit(limit * 3))
    rows = result.all()

    items: list[SearchResultItem] = []
    for page, space in rows:
        if not await _page_visible(db, user, page, space):
            continue

        score, matched_in = _score_match(page.title, page.content, page.excerpt, q)
        highlight = _extract_highlight(page.content, q)

        items.append(
            SearchResultItem(
                id=page.id,
                result_type="page",
                title=page.title,
                slug=page.slug,
                space_id=space.id,
                space_name=space.name,
                excerpt=page.excerpt,
                snippet_html=highlight,
                matching_field=matched_in,
                rank_score=score,
                doc_type=page.doc_type or "document",
                updated_at=page.updated_at,
            )
        )

    # Sort by score desc, then title asc
    items.sort(key=lambda x: (-x.rank_score, x.title.lower()))
    paged_items = items[:limit]

    return SearchResponse(query=query, total=len(items), results=paged_items)


async def quick_search(
    db: AsyncSession,
    user: CurrentUser,
    query: str,
    limit: int = 10,
) -> list[SearchResultItem]:
    q = query.strip()
    if not q:
        return []

    needle = f"%{q}%"
    stmt = (
        select(DocPage, DocSpace)
        .join(DocSpace, DocPage.space_id == DocSpace.id)
        .where(
            or_(
                DocPage.title.ilike(needle),
                DocPage.slug.ilike(needle),
            )
        )
        .order_by(DocPage.updated_at.desc())
        .limit(limit * 2)
    )

    result = await db.execute(stmt)
    rows = result.all()

    items: list[SearchResultItem] = []
    for page, space in rows:
        if not await _page_visible(db, user, page, space):
            continue

        score, matched_in = _score_match(page.title, page.content, page.excerpt, q)
        items.append(
            SearchResultItem(
                id=page.id,
                result_type="page",
                title=page.title,
                slug=page.slug,
                space_id=space.id,
                space_name=space.name,
                excerpt=page.excerpt,
                snippet_html=None,
                matching_field=matched_in,
                rank_score=score,
                doc_type=page.doc_type or "document",
                updated_at=page.updated_at,
            )
        )

    items.sort(key=lambda x: (-x.rank_score, x.title.lower()))
    return items[:limit]
