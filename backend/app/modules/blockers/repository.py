"""Data-access functions for the Blockers module."""

from __future__ import annotations

from typing import Dict, Optional, Sequence
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.blockers.models import Blocker


async def create_blocker(db: AsyncSession, blocker: Blocker) -> Blocker:
    db.add(blocker)
    await db.commit()
    await db.refresh(blocker)
    return blocker


async def get_blocker(db: AsyncSession, blocker_id: UUID) -> Optional[Blocker]:
    result = await db.execute(select(Blocker).where(Blocker.id == blocker_id))
    return result.scalar_one_or_none()


async def list_blockers(
    db: AsyncSession, *, status: Optional[str] = None, project_id: Optional[UUID] = None
) -> Sequence[Blocker]:
    stmt = select(Blocker)
    if status:
        stmt = stmt.where(Blocker.status == status)
    result = await db.execute(stmt.order_by(Blocker.created_at.desc()))
    return result.scalars().all()


async def list_open_blockers_pending_on(
    db: AsyncSession, user_id: UUID
) -> Sequence[Blocker]:
    result = await db.execute(
        select(Blocker).where(
            Blocker.pending_on_user_id == user_id,
            Blocker.status.in_(["Open", "InProgress"]),
        )
    )
    return result.scalars().all()


async def count_open_blockers_by_user(db: AsyncSession) -> Dict[UUID, int]:
    """Cross-module contract (mirrors `GetOpenBlockerCountsByUserQuery`)."""
    result = await db.execute(
        select(Blocker.pending_on_user_id, func.count(Blocker.id))
        .where(Blocker.status.in_(["Open", "InProgress"]))
        .group_by(Blocker.pending_on_user_id)
    )
    return {row[0]: row[1] for row in result.all()}


async def count_open_blockers_for_tasks(db: AsyncSession, task_ids) -> int:
    if not task_ids:
        return 0
    result = await db.execute(
        select(func.count(Blocker.id)).where(
            Blocker.blocked_task_id.in_(task_ids),
            Blocker.status.in_(["Open", "InProgress"]),
        )
    )
    return result.scalar_one()
