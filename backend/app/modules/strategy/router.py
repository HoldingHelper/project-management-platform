from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.current_user import CurrentUser
from app.core.database import get_db
from app.core.deps import get_current_user
from app.modules.strategy import service
from app.modules.strategy.schemas import (
    CheckInCreate, CheckInRead, KeyResultCreate, KeyResultRead,
    ObjectiveCreate, ObjectiveRead, VisionRead, VisionWrite,
)

router = APIRouter(prefix="/strategy", tags=["Holding Strategy"])


@router.get("/visions/{node_id}", response_model=VisionRead | None)
async def get_vision(node_id: UUID, current_user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> VisionRead | None:
    return await service.get_vision(db, node_id, current_user)


@router.put("/visions/{node_id}", response_model=VisionRead)
async def set_vision(node_id: UUID, payload: VisionWrite, current_user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> VisionRead:
    return await service.set_vision(db, node_id, payload, current_user)


@router.get("/objectives", response_model=list[ObjectiveRead])
async def list_objectives(scope: UUID, period: str | None = Query(default=None), current_user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> list[ObjectiveRead]:
    return await service.list_objectives(db, scope, current_user, period)


@router.post("/objectives", response_model=ObjectiveRead, status_code=status.HTTP_201_CREATED)
async def create_objective(payload: ObjectiveCreate, current_user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> ObjectiveRead:
    return await service.create_objective(db, payload, current_user)


@router.post("/key-results", response_model=KeyResultRead, status_code=status.HTTP_201_CREATED)
async def create_key_result(payload: KeyResultCreate, current_user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> KeyResultRead:
    return await service.create_key_result(db, payload, current_user)


@router.post("/key-results/{key_result_id}/checkins", response_model=CheckInRead, status_code=status.HTTP_201_CREATED)
async def add_checkin(key_result_id: UUID, payload: CheckInCreate, current_user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> CheckInRead:
    return await service.add_checkin(db, key_result_id, payload, current_user)
