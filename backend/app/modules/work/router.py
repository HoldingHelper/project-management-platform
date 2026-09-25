from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.current_user import CurrentUser
from app.core.database import get_db
from app.core.deps import get_current_user
from app.modules.work import service
from app.modules.work.schemas import RequestCreate, RequestRead

router = APIRouter(prefix="/work", tags=["Cross-scope Work"])


@router.post("/requests", response_model=RequestRead, status_code=status.HTTP_201_CREATED)
async def create_request(payload: RequestCreate, current_user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> RequestRead:
    return await service.create_request(db, payload, current_user)


@router.get("/requests", response_model=list[RequestRead])
async def list_requests(scope: UUID, current_user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> list[RequestRead]:
    return await service.list_requests(db, scope, current_user)


@router.post("/requests/{request_id}/accept", response_model=RequestRead)
async def accept_request(request_id: UUID, current_user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> RequestRead:
    return await service.accept_request(db, request_id, current_user)
