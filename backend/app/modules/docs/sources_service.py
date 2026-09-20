from __future__ import annotations

import re
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.current_user import CurrentUser
from app.core.exceptions import ForbiddenError, NotFoundError
from app.modules.docs import repository as repo
from app.modules.docs.models import DocSource, DocSourceChunk, DocSpace
from app.modules.docs.schemas import SourceCreate, SourceRead
from app.modules.docs.service import can_access
from app.shared.base_model import utcnow


def chunk_text(text: str, target_chunk_size: int = 3000, overlap: int = 400) -> list[str]:
    """
    Splits text into chunks respecting paragraph and sentence boundaries.
    Target ~800 tokens (approx 3000 chars) with 400 char overlap.
    """
    clean_text = re.sub(r"\r\n", "\n", text.strip())
    if not clean_text:
        return []

    if len(clean_text) <= target_chunk_size:
        return [clean_text]

    # Split by paragraphs
    paragraphs = clean_text.split("\n\n")
    chunks: list[str] = []
    current_chunk: list[str] = []
    current_len = 0

    for para in paragraphs:
        para_len = len(para)
        if current_len + para_len + 2 > target_chunk_size and current_chunk:
            chunk_content = "\n\n".join(current_chunk).strip()
            if chunk_content:
                chunks.append(chunk_content)
            # Create overlap
            overlap_content = chunk_content[-overlap:] if len(chunk_content) > overlap else ""
            current_chunk = [overlap_content, para] if overlap_content else [para]
            current_len = len(overlap_content) + para_len + 2
        else:
            current_chunk.append(para)
            current_len += para_len + 2

    if current_chunk:
        chunk_content = "\n\n".join(current_chunk).strip()
        if chunk_content:
            chunks.append(chunk_content)

    return chunks


async def create_source(
    db: AsyncSession,
    user: CurrentUser,
    payload: SourceCreate,
) -> SourceRead:
    if payload.space_id:
        space = await repo.get_space(db, payload.space_id)
        if not space:
            raise NotFoundError("Documentation space", payload.space_id)
        if not (space.visibility in {"public", "workspace"} or await can_access(db, user, "space", space.id, "edit")):
            raise ForbiddenError("You do not have permission to add sources to this space.")

    source = DocSource(
        space_id=payload.space_id,
        title=payload.title,
        source_type=payload.source_type,
        url=payload.url,
        content=payload.content or "",
        meta_info=payload.meta_info or {},
        status="processing",
        created_by=user.user_id,
        created_at=utcnow(),
        updated_at=utcnow(),
    )
    db.add(source)
    await db.flush()

    # Process and chunk content
    raw_content = payload.content or ""
    chunks = chunk_text(raw_content)

    for idx, chunk_str in enumerate(chunks):
        # Rough token estimate: ~4 chars per token
        token_count = max(1, len(chunk_str) // 4)
        source_chunk = DocSourceChunk(
            source_id=source.id,
            chunk_index=idx,
            content=chunk_str,
            token_count=token_count,
            created_at=utcnow(),
        )
        db.add(source_chunk)

    source.status = "ready"
    source.processed_at = utcnow()

    await db.commit()
    await db.refresh(source)
    return SourceRead.model_validate(source)


async def get_source(
    db: AsyncSession,
    user: CurrentUser,
    source_id: UUID,
) -> SourceRead:
    source = await db.get(DocSource, source_id)
    if not source:
        raise NotFoundError("Document source", source_id)
    if source.space_id:
        space = await repo.get_space(db, source.space_id)
        if space and not (space.visibility in {"public", "workspace"} or await can_access(db, user, "space", space.id, "view")):
            raise NotFoundError("Document source", source_id)
    return SourceRead.model_validate(source)


async def list_sources(
    db: AsyncSession,
    user: CurrentUser,
    space_id: UUID | None = None,
) -> list[SourceRead]:
    stmt = select(DocSource)
    if space_id:
        stmt = stmt.where(DocSource.space_id == space_id)
    stmt = stmt.order_by(DocSource.created_at.desc())

    result = await db.execute(stmt)
    sources = result.scalars().all()

    visible: list[SourceRead] = []
    for s in sources:
        if s.space_id:
            space = await repo.get_space(db, s.space_id)
            if space and not (space.visibility in {"public", "workspace"} or await can_access(db, user, "space", space.id, "view")):
                continue
        visible.append(SourceRead.model_validate(s))
    return visible


async def delete_source(
    db: AsyncSession,
    user: CurrentUser,
    source_id: UUID,
) -> None:
    source = await db.get(DocSource, source_id)
    if not source:
        raise NotFoundError("Document source", source_id)
    if source.created_by != user.user_id and not user.is_super_admin():
        raise ForbiddenError("You do not have permission to delete this source.")
    await db.delete(source)
    await db.commit()


async def list_source_chunks(
    db: AsyncSession,
    source_id: UUID,
) -> list[DocSourceChunk]:
    stmt = select(DocSourceChunk).where(DocSourceChunk.source_id == source_id).order_by(DocSourceChunk.chunk_index)
    result = await db.execute(stmt)
    return list(result.scalars().all())
