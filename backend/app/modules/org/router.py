"""Scoped org graph API."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.current_user import CurrentUser
from app.core.database import get_db
from app.core.deps import get_current_user
from app.modules.authz.schemas import AccessExplanation
from app.modules.authz.service import authorize, explain, visible_nodes
from app.modules.org import repository as repo, service
from app.modules.org.schemas import (
    AccessDiff, AllocationCreate, AllocationRead, CapacityRead, CockpitRead,
    MembershipCreate, MembershipRead, NodeCreate, NodeMove, NodeRead, NodeUpdate,
)

router = APIRouter(prefix="/org", tags=["Holding Organization"])


@router.get("/nodes", response_model=list[NodeRead])
async def list_nodes(
    parent: UUID | None = Query(default=None),
    type: str | None = Query(default=None),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[NodeRead]:
    nodes = await visible_nodes(db, current_user)
    return [n for n in nodes if (parent is None or n.parent_id == parent) and (type is None or n.type == type)]


@router.post("/nodes", response_model=NodeRead, status_code=status.HTTP_201_CREATED)
async def create_node(payload: NodeCreate, current_user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> NodeRead:
    return await service.create_node(db, payload, current_user)


@router.get("/nodes/{node_id}", response_model=NodeRead)
async def get_node(node_id: UUID, current_user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> NodeRead:
    node = await service.get_node(db, node_id)
    await authorize(db, current_user, "view", node)
    return node


@router.patch("/nodes/{node_id}", response_model=NodeRead)
async def update_node(node_id: UUID, payload: NodeUpdate, current_user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> NodeRead:
    return await service.update_node(db, await service.get_node(db, node_id), payload, current_user)


@router.post("/nodes/{node_id}/move", response_model=AccessDiff)
async def move_node(node_id: UUID, payload: NodeMove, current_user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> AccessDiff:
    return await service.move_node(db, await service.get_node(db, node_id), payload, current_user)


@router.post("/memberships", response_model=MembershipRead, status_code=status.HTTP_201_CREATED)
async def create_membership(payload: MembershipCreate, current_user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> MembershipRead:
    return await service.add_membership(db, payload, current_user)


@router.delete("/memberships/{membership_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_membership(membership_id: UUID, current_user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> Response:
    await service.remove_membership(db, membership_id, current_user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/allocations", response_model=AllocationRead, status_code=status.HTTP_201_CREATED)
async def create_allocation(payload: AllocationCreate, current_user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> AllocationRead:
    return await service.add_allocation(db, payload, current_user)


@router.get("/people/{person_id}/capacity", response_model=CapacityRead)
async def get_capacity(person_id: UUID, current_user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> CapacityRead:
    memberships = await repo.active_memberships(db, person_id=person_id)
    if person_id != current_user.user_id:
        for membership in memberships:
            await authorize(db, current_user, "manage_members", await service.get_node(db, membership.node_id))
    return await service.capacity(db, person_id)


@router.get("/cockpit", response_model=CockpitRead)
async def get_cockpit(current_user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> CockpitRead:
    return await service.cockpit(db, current_user)


@router.get("/authz/explain", response_model=AccessExplanation)
async def explain_access(
    node_id: UUID,
    action: str = Query(default="view", min_length=2, max_length=40),
    object_type: str = Query(default="node", min_length=2, max_length=40),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AccessExplanation:
    return await explain(db, current_user, action=action, object_type=object_type, node=await service.get_node(db, node_id))
