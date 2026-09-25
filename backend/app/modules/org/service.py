"""Holding graph invariants and portfolio projections."""

from __future__ import annotations

import re
from datetime import date
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.current_user import CurrentUser
from app.core.exceptions import BusinessRuleError, ConflictError, NotFoundError
from app.modules.authz.policy import privileged_role, valid_role
from app.modules.authz.service import authorize, explain, visible_nodes
from app.modules.org import repository as repo
from app.modules.org.models import Allocation, Membership, OrgNode
from app.modules.org.schemas import (
    AccessDiff,
    AllocationCreate,
    CapacityRead,
    CockpitRead,
    MembershipCreate,
    NodeCreate,
    NodeMove,
    NodeUpdate,
    VentureSummary,
)

_TIER = {"standard": 0, "restricted": 1, "board": 2}
_PARENT_TYPES: dict[str, set[str | None]] = {
    "holding": {None},
    "function": {"holding"},
    "venture": {"holding"},
    "venture_function": {"venture"},
    "program": {"holding", "venture"},
    "shared_initiative": {"holding"},
    "project": {"holding", "venture", "program", "shared_initiative", "function"},
    "milestone": {"project", "venture"},
    "workstream": {"project"},
    "sprint": {"project", "workstream"},
    "task": {"project", "workstream", "sprint"},
    "team": {"function", "venture", "project"},
    "doc_space": {"holding", "function", "venture", "project", "team"},
}


def slugify(value: str) -> str:
    value = re.sub(r"[^a-z0-9]+", "_", value.strip().lower()).strip("_")
    return value[:70] or "scope"


async def get_node(db: AsyncSession, node_id: UUID) -> OrgNode:
    node = await repo.get_node(db, node_id)
    if not node:
        raise NotFoundError("Organization node", node_id)
    return node


async def create_node(db: AsyncSession, payload: NodeCreate, actor: CurrentUser) -> OrgNode:
    parent = await get_node(db, payload.parent_id) if payload.parent_id else None
    allowed_parents = _PARENT_TYPES[payload.type]
    if (parent.type if parent else None) not in allowed_parents:
        raise BusinessRuleError(f"A {payload.type} cannot be created under this parent.")
    if parent:
        await authorize(db, actor, "create_child", parent)
    elif (await repo.list_nodes(db, node_type="holding")):
        raise ConflictError("A holding root already exists.")
    elif not actor.is_super_admin():
        raise BusinessRuleError("Only the bootstrap administrator can create the first holding.")

    confidentiality = payload.confidentiality
    if parent and _TIER[confidentiality] < _TIER[parent.confidentiality]:
        confidentiality = parent.confidentiality
    slug = payload.slug or slugify(payload.name)
    segment = f"n_{slug}_{str(payload.parent_id or actor.user_id).replace('-', '')[:6]}"
    path = segment if not parent else f"{parent.path}.{segment}"
    node = OrgNode(
        type=payload.type,
        parent_id=payload.parent_id,
        path=path,
        name=payload.name,
        slug=slug,
        confidentiality=confidentiality,
        created_by=actor.user_id,
        metadata_json=payload.metadata_json,
    )
    db.add(node)
    await db.flush()
    if payload.type == "holding":
        db.add(Membership(person_id=actor.user_id, node_id=node.id, role="holding_owner", since=date.today(), granted_by=actor.user_id))
    await db.commit()
    await db.refresh(node)
    return node


async def update_node(db: AsyncSession, node: OrgNode, payload: NodeUpdate, actor: CurrentUser) -> OrgNode:
    action = "manage_confidentiality" if payload.confidentiality and payload.confidentiality != node.confidentiality else "update"
    await authorize(db, actor, action, node)
    data = payload.model_dump(exclude_unset=True)
    if "confidentiality" in data:
        descendants = await repo.descendants(db, node)
        for child in descendants:
            if _TIER[child.confidentiality] < _TIER[data["confidentiality"]]:
                child.confidentiality = data["confidentiality"]
            child.acl_version += 1
    for key, value in data.items():
        setattr(node, key, value)
    if data.get("status") == "archived":
        for child in await repo.descendants(db, node):
            child.status = "archived"
    await db.commit()
    await db.refresh(node)
    return node


async def move_node(db: AsyncSession, node: OrgNode, payload: NodeMove, actor: CurrentUser) -> AccessDiff:
    parent = await get_node(db, payload.new_parent_id)
    await authorize(db, actor, "move", node)
    await authorize(db, actor, "create_child", parent)
    if parent.type not in _PARENT_TYPES[node.type]:
        raise BusinessRuleError(f"A {node.type} cannot be moved under {parent.type}.")
    if parent.path == node.path or parent.path.startswith(f"{node.path}."):
        raise BusinessRuleError("A node cannot be moved into its own subtree.")
    old_path = node.path
    new_path = f"{parent.path}.{old_path.rsplit('.', 1)[-1]}"
    descendants = await repo.descendants(db, node)
    diff = AccessDiff(node_id=node.id, old_path=old_path, new_path=new_path, affected_nodes=len(descendants), requires_confirmation=not payload.confirm)
    if not payload.confirm:
        return diff
    for child in descendants:
        child.path = f"{new_path}{child.path[len(old_path):]}"
        child.acl_version += 1
        if _TIER[child.confidentiality] < _TIER[parent.confidentiality]:
            child.confidentiality = parent.confidentiality
    node.parent_id = parent.id
    await db.commit()
    diff.requires_confirmation = False
    return diff


async def add_membership(db: AsyncSession, payload: MembershipCreate, actor: CurrentUser) -> Membership:
    node = await get_node(db, payload.node_id)
    await authorize(db, actor, "manage_members", node)
    if not valid_role(payload.role):
        raise BusinessRuleError("Unknown scoped role.")
    if privileged_role(payload.role):
        holding = next((n for n in await repo.list_nodes(db, node_type="holding")), None)
        if not holding:
            raise BusinessRuleError("Holding root is missing.")
        check = await explain(db, actor, action="manage_members", node=holding)
        if "holding_owner" not in check.effective_roles:
            raise BusinessRuleError("Only a holding owner may grant privileged roles.")
    membership = Membership(**payload.model_dump(), granted_by=actor.user_id)
    db.add(membership)
    for descendant in await repo.descendants(db, node):
        descendant.acl_version += 1
    await db.commit()
    await db.refresh(membership)
    return membership


async def remove_membership(db: AsyncSession, membership_id: UUID, actor: CurrentUser) -> None:
    membership = (await db.execute(select(Membership).where(Membership.id == membership_id))).scalar_one_or_none()
    if not membership:
        raise NotFoundError("Membership", membership_id)
    node = await get_node(db, membership.node_id)
    await authorize(db, actor, "manage_members", node)
    if membership.role == "holding_owner":
        owners = [m for m in await repo.active_memberships(db, node_id=node.id) if m.role == "holding_owner"]
        if len(owners) <= 1:
            raise BusinessRuleError("The last holding owner cannot be removed.")
    await db.delete(membership)
    for descendant in await repo.descendants(db, node):
        descendant.acl_version += 1
    await db.commit()


async def add_allocation(db: AsyncSession, payload: AllocationCreate, actor: CurrentUser) -> Allocation:
    node = await get_node(db, payload.node_id)
    await authorize(db, actor, "manage_members", node)
    allocation = Allocation(**payload.model_dump())
    db.add(allocation)
    await db.commit()
    await db.refresh(allocation)
    return allocation


async def capacity(db: AsyncSession, person_id: UUID) -> CapacityRead:
    total = sum(float(a.percent) for a in await repo.active_allocations(db, person_id=person_id))
    return CapacityRead(person_id=person_id, allocated_percent=total, overallocated_percent=max(total - 100, 0))


async def cockpit(db: AsyncSession, actor: CurrentUser) -> CockpitRead:
    visible = await visible_nodes(db, actor)
    holding = next((n for n in visible if n.type == "holding"), None)
    if not holding:
        raise NotFoundError("Holding cockpit", actor.user_id)
    ventures = [n for n in visible if n.type == "venture" and n.status == "active"]
    summaries: list[VentureSummary] = []
    for venture in ventures:
        subtree = [n for n in visible if n.path == venture.path or n.path.startswith(f"{venture.path}.")]
        project_count = sum(n.type == "project" for n in subtree)
        member_count = await repo.membership_count(db, [n.id for n in subtree])
        allocation = await repo.allocation_total(db, [n.id for n in subtree])
        metadata = venture.metadata_json or {}
        summaries.append(VentureSummary(
            id=venture.id, slug=venture.slug, name=venture.name, status=venture.status,
            confidentiality=venture.confidentiality, project_count=project_count,
            member_count=member_count, allocation_percent=allocation,
            rag=str(metadata.get("rag", "on-track")), top_risk=metadata.get("top_risk"),
            next_milestone=metadata.get("next_milestone"),
        ))
    orphan = sum(n.type == "project" and n.parent_id == holding.id for n in visible)
    return CockpitRead(
        holding=holding, ventures=summaries, active_ventures=len(summaries),
        at_risk_ventures=sum(v.rag in {"at-risk", "delayed", "blocked"} for v in summaries),
        total_allocated_percent=sum(v.allocation_percent for v in summaries), orphan_projects=orphan,
    )
