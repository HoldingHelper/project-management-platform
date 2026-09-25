"""Blockers module REST endpoints."""

from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.current_user import CurrentUser
from app.core.database import get_db
from app.core.deps import get_current_user
from app.modules.blockers import service
from app.modules.blockers.schemas import (
    BlockerCreate,
    BlockerRead,
    BlockerResolve,
    BlockerUpdate,
    UserPendingWork,
)

blockers_router = APIRouter(prefix="/blockers", tags=["Blockers"])
pending_work_router = APIRouter(tags=["Blockers - Pending Work"])


@blockers_router.post(
    "", response_model=BlockerRead, status_code=status.HTTP_201_CREATED
)
async def create_blocker(
    payload: BlockerCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BlockerRead:
    return await service.create_blocker(db, current_user.user_id, payload)


@blockers_router.get("", response_model=list[BlockerRead])
async def list_blockers(
    status_filter: Optional[str] = Query(default=None, alias="status"),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[BlockerRead]:
    return await service.list_blockers(db, status_filter)


@blockers_router.put("/{blocker_id}", response_model=BlockerRead)
async def update_blocker(
    blocker_id: UUID,
    payload: BlockerUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BlockerRead:
    return await service.update_blocker(db, blocker_id, payload)


@blockers_router.put("/{blocker_id}/resolve", response_model=BlockerRead)
async def resolve_blocker(
    blocker_id: UUID,
    payload: BlockerResolve,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BlockerRead:
    return await service.resolve_blocker(db, blocker_id, payload)


@pending_work_router.get(
    "/users/{user_id}/pending-work", response_model=UserPendingWork
)
async def get_user_pending_work(
    user_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserPendingWork:
    from app.core.exceptions import ForbiddenError
    from app.core.permissions import Permissions

    if not (
        current_user.user_id == user_id
        or current_user.is_super_admin()
        or current_user.has_any_permission(
            Permissions.TASKS_MANAGE_ALL,
            Permissions.TASKS_MANAGE_TEAM,
            Permissions.PROJECTS_MANAGE_ALL,
            Permissions.MANAGE_USERS,
        )
    ):
        raise ForbiddenError("You may only view your own pending work unless authorized as a manager.")

    return await service.get_user_pending_work(db, user_id)
