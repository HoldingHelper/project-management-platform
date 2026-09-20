"""WikiLink extraction, relationship persistence, backlink queries, and stub resolution."""

from __future__ import annotations

import re
from typing import Sequence
from uuid import UUID, uuid4

from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.current_user import CurrentUser
from app.modules.docs.models import DocPage, DocRelation, DocSpace
from app.modules.docs.schemas import RelationRead


WIKILINK_REGEX = re.compile(r"\[\[([^\]\|\#\n]+)(?:#([^\]\|\n]+))?(?:\|([^\]\n]+))?\]\]")


def extract_wikilinks(content: str) -> list[dict[str, str | None]]:
    """Extract all [[WikiLink]] occurrences from markdown content."""
    if not content:
        return []
    matches = []
    seen = set()
    for match in WIKILINK_REGEX.finditer(content):
        target = match.group(1).strip()
        anchor = match.group(2).strip() if match.group(2) else None
        alias = match.group(3).strip() if match.group(3) else None
        if not target:
            continue
        key = (target.lower(), (anchor or "").lower())
        if key not in seen:
            seen.add(key)
            matches.append({"target": target, "anchor": anchor, "alias": alias})
    return matches


async def sync_page_relations(db: AsyncSession, page_id: UUID, content: str) -> None:
    """Incrementally synchronize outgoing relations extracted from content."""
    extracted = extract_wikilinks(content)
    existing_relations = (
        await db.execute(select(DocRelation).where(DocRelation.source_page_id == page_id))
    ).scalars().all()

    existing_by_key = {
        (r.target_title.lower(), (r.anchor_text or "").lower()): r
        for r in existing_relations
    }

    current_keys = set()
    for item in extracted:
        target_title = item["target"]
        anchor_text = item["anchor"]
        key = (target_title.lower(), (anchor_text or "").lower())
        current_keys.add(key)

        if key in existing_by_key:
            continue

        # Look up if a page already exists with this title or slug
        resolved_page = (
            await db.execute(
                select(DocPage).where(
                    or_(
                        func.lower(DocPage.title) == target_title.lower(),
                        func.lower(DocPage.slug) == target_title.lower().replace(" ", "-"),
                    )
                ).limit(1)
            )
        ).scalar_one_or_none()

        relation = DocRelation(
            id=uuid4(),
            source_page_id=page_id,
            target_page_id=resolved_page.id if resolved_page else None,
            target_title=target_title,
            relation_type="links_to",
            anchor_text=anchor_text,
            confidence="EXTRACTED",
            confidence_score=1.0,
        )
        db.add(relation)

    # Delete relations that are no longer present in content
    for key, rel in existing_by_key.items():
        if key not in current_keys:
            await db.delete(rel)


async def resolve_stubs_for_new_page(db: AsyncSession, page: DocPage) -> int:
    """Resolve any existing stub relations that match the title or slug of the newly created page."""
    matching_stubs = (
        await db.execute(
            select(DocRelation).where(
                DocRelation.target_page_id.is_(None),
                or_(
                    func.lower(DocRelation.target_title) == page.title.lower(),
                    func.lower(DocRelation.target_title) == page.slug.lower().replace("-", " "),
                ),
            )
        )
    ).scalars().all()

    for stub in matching_stubs:
        stub.target_page_id = page.id
    return len(matching_stubs)


async def list_backlinks(
    db: AsyncSession,
    user: CurrentUser,
    page_id: UUID,
) -> list[RelationRead]:
    """Retrieve incoming links to this page, enforcing visibility on the source pages."""
    stmt = (
        select(DocRelation, DocPage, DocSpace)
        .join(DocPage, DocPage.id == DocRelation.source_page_id)
        .join(DocSpace, DocSpace.id == DocPage.space_id)
        .where(DocRelation.target_page_id == page_id)
        .order_by(DocPage.title, DocRelation.created_at.desc())
    )
    results = (await db.execute(stmt)).all()

    from app.modules.docs.service import _page_visible

    visible: list[RelationRead] = []
    for rel, source_page, space in results:
        if await _page_visible(db, user, source_page, space):
            visible.append(
                RelationRead(
                    id=rel.id,
                    source_page_id=rel.source_page_id,
                    target_page_id=rel.target_page_id,
                    target_title=rel.target_title,
                    relation_type=rel.relation_type,
                    anchor_text=rel.anchor_text,
                    confidence=rel.confidence,
                    confidence_score=rel.confidence_score,
                    created_at=rel.created_at,
                    source_page_title=source_page.title,
                    source_page_slug=source_page.slug,
                    source_page_excerpt=source_page.excerpt,
                )
            )
    return visible


async def wikilink_suggestions(
    db: AsyncSession,
    user: CurrentUser,
    query: str,
    limit: int = 10,
) -> list[dict[str, str]]:
    """Fast prefix and title suggestions for autocomplete when typing [[ in the editor."""
    needle = f"%{query.strip().lower()}%" if query.strip() else "%"
    stmt = (
        select(DocPage, DocSpace)
        .join(DocSpace, DocSpace.id == DocPage.space_id)
        .where(
            or_(
                func.lower(DocPage.title).like(needle),
                func.lower(DocPage.slug).like(needle),
            )
        )
        .order_by(DocPage.updated_at.desc())
        .limit(limit * 2)
    )
    rows = (await db.execute(stmt)).all()

    from app.modules.docs.service import _page_visible

    suggestions: list[dict[str, str]] = []
    for page, space in rows:
        if await _page_visible(db, user, page, space):
            suggestions.append({
                "id": str(page.id),
                "title": page.title,
                "slug": page.slug,
                "space_name": space.name,
                "space_id": str(space.id),
                "doc_type": page.doc_type,
            })
            if len(suggestions) >= limit:
                break
    return suggestions
