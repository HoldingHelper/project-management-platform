from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.current_user import CurrentUser
from app.core.exceptions import NotFoundError
from app.modules.authz.service import authorize
from app.modules.org.service import get_node
from app.modules.strategy.models import CheckIn, KeyResult, Objective, Vision
from app.modules.strategy.schemas import CheckInCreate, KeyResultCreate, ObjectiveCreate, VisionWrite
from app.shared.base_model import utcnow


async def get_vision(db: AsyncSession, node_id: UUID, actor: CurrentUser) -> Vision | None:
    node = await get_node(db, node_id)
    await authorize(db, actor, "view", node, object_type="objective")
    return (await db.execute(select(Vision).where(Vision.node_id == node_id))).scalar_one_or_none()


async def set_vision(db: AsyncSession, node_id: UUID, payload: VisionWrite, actor: CurrentUser) -> Vision:
    node = await get_node(db, node_id)
    await authorize(db, actor, "update", node, object_type="objective")
    vision = (await db.execute(select(Vision).where(Vision.node_id == node_id))).scalar_one_or_none()
    if vision is None:
        vision = Vision(node_id=node_id, updated_by=actor.user_id, **payload.model_dump())
        db.add(vision)
    else:
        for key, value in payload.model_dump().items():
            setattr(vision, key, value)
        vision.updated_by = actor.user_id
    await db.commit()
    await db.refresh(vision)
    return vision


async def list_objectives(db: AsyncSession, node_id: UUID, actor: CurrentUser, period: str | None = None) -> list[Objective]:
    node = await get_node(db, node_id)
    await authorize(db, actor, "view", node, object_type="objective")
    stmt = select(Objective).where(Objective.node_id == node_id).options(selectinload(Objective.key_results))
    if period:
        stmt = stmt.where(Objective.period == period)
    return list((await db.execute(stmt.order_by(Objective.created_at))).scalars().all())


async def create_objective(db: AsyncSession, payload: ObjectiveCreate, actor: CurrentUser) -> Objective:
    node = await get_node(db, payload.node_id)
    await authorize(db, actor, "create", node, object_type="objective")
    objective = Objective(**payload.model_dump())
    db.add(objective)
    await db.commit()
    await db.refresh(objective)
    return objective


async def get_objective(db: AsyncSession, objective_id: UUID) -> Objective:
    objective = (await db.execute(select(Objective).where(Objective.id == objective_id))).scalar_one_or_none()
    if not objective:
        raise NotFoundError("Objective", objective_id)
    return objective


async def create_key_result(db: AsyncSession, payload: KeyResultCreate, actor: CurrentUser) -> KeyResult:
    objective = await get_objective(db, payload.objective_id)
    await authorize(db, actor, "update", await get_node(db, objective.node_id), object_type="objective")
    key_result = KeyResult(**payload.model_dump())
    db.add(key_result)
    await db.commit()
    await db.refresh(key_result)
    return key_result


async def add_checkin(db: AsyncSession, key_result_id: UUID, payload: CheckInCreate, actor: CurrentUser) -> CheckIn:
    key_result = (await db.execute(select(KeyResult).where(KeyResult.id == key_result_id))).scalar_one_or_none()
    if not key_result:
        raise NotFoundError("Key result", key_result_id)
    objective = await get_objective(db, key_result.objective_id)
    await authorize(db, actor, "checkin", await get_node(db, objective.node_id), object_type="objective")
    checkin = CheckIn(key_result_id=key_result_id, created_by=actor.user_id, created_at=utcnow(), **payload.model_dump())
    key_result.current = payload.value
    db.add(checkin)
    await db.commit()
    await db.refresh(checkin)
    return checkin
