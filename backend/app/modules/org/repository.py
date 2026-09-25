"""Database access for the org graph."""

from __future__ import annotations

from datetime import date
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.org.models import Allocation, Membership, OrgNode


async def get_node(db: AsyncSession, node_id: UUID) -> OrgNode | None:
    return (await db.execute(select(OrgNode).where(OrgNode.id == node_id))).scalar_one_or_none()


async def get_node_by_slug(db: AsyncSession, slug: str, node_type: str | None = None) -> OrgNode | None:
    stmt = select(OrgNode).where(OrgNode.slug == slug)
    if node_type:
        stmt = stmt.where(OrgNode.type == node_type)
    return (await db.execute(stmt)).scalars().first()


async def list_nodes(db: AsyncSession, *, parent_id: UUID | None = None, node_type: str | None = None) -> list[OrgNode]:
    stmt = select(OrgNode)
    if parent_id is not None:
        stmt = stmt.where(OrgNode.parent_id == parent_id)
    if node_type is not None:
        stmt = stmt.where(OrgNode.type == node_type)
    return list((await db.execute(stmt.order_by(OrgNode.path))).scalars().all())


async def descendants(db: AsyncSession, node: OrgNode) -> list[OrgNode]:
    all_nodes = list((await db.execute(select(OrgNode).order_by(OrgNode.path))).scalars().all())
    return [n for n in all_nodes if n.path == node.path or n.path.startswith(f"{node.path}.")]


async def active_memberships(db: AsyncSession, *, person_id: UUID | None = None, node_id: UUID | None = None) -> list[Membership]:
    today = date.today()
    stmt = select(Membership).where(Membership.since <= today, or_(Membership.until.is_(None), Membership.until >= today))
    if person_id:
        stmt = stmt.where(Membership.person_id == person_id)
    if node_id:
        stmt = stmt.where(Membership.node_id == node_id)
    return list((await db.execute(stmt.order_by(Membership.created_at))).scalars().all())


async def active_allocations(db: AsyncSession, *, person_id: UUID | None = None, node_id: UUID | None = None) -> list[Allocation]:
    today = date.today()
    stmt = select(Allocation).where(Allocation.start_date <= today, or_(Allocation.end_date.is_(None), Allocation.end_date >= today))
    if person_id:
        stmt = stmt.where(Allocation.person_id == person_id)
    if node_id:
        stmt = stmt.where(Allocation.node_id == node_id)
    return list((await db.execute(stmt.order_by(Allocation.start_date))).scalars().all())


async def membership_count(db: AsyncSession, node_ids: list[UUID]) -> int:
    if not node_ids:
        return 0
    return int((await db.execute(select(func.count(func.distinct(Membership.person_id))).where(Membership.node_id.in_(node_ids)))).scalar_one())


async def allocation_total(db: AsyncSession, node_ids: list[UUID]) -> float:
    if not node_ids:
        return 0.0
    today = date.today()
    total = (
        await db.execute(
            select(func.coalesce(func.sum(Allocation.percent), 0)).where(
                Allocation.node_id.in_(node_ids),
                Allocation.start_date <= today,
                or_(Allocation.end_date.is_(None), Allocation.end_date >= today),
            )
        )
    ).scalar_one()
    return float(total or 0)
