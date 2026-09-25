"""One authorization entry point for REST and future GraphQL/WS/MCP adapters."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.current_user import CurrentUser
from app.core.exceptions import ForbiddenError, NotFoundError
from app.modules.authz.policy import role_allows
from app.modules.authz.schemas import AccessExplanation, GrantTrace
from app.modules.org.models import Membership, OrgNode


@dataclass(frozen=True)
class _Grant:
    membership: Membership
    node: OrgNode


def _is_descendant(path: str, ancestor: str) -> bool:
    return path == ancestor or path.startswith(f"{ancestor}.")


async def _ancestor_grants(db: AsyncSession, user_id: UUID, node: OrgNode) -> list[_Grant]:
    today = date.today()
    rows = (
        await db.execute(
            select(Membership, OrgNode)
            .join(OrgNode, OrgNode.id == Membership.node_id)
            .where(
                Membership.person_id == user_id,
                Membership.since <= today,
                or_(Membership.until.is_(None), Membership.until >= today),
            )
        )
    ).all()
    return [_Grant(membership=m, node=n) for m, n in rows if _is_descendant(node.path, n.path)]


async def explain(
    db: AsyncSession,
    user: CurrentUser,
    *,
    action: str,
    node: OrgNode,
    object_type: str = "node",
) -> AccessExplanation:
    grants = await _ancestor_grants(db, user.user_id, node)
    explicit = [g for g in grants if g.node.id == node.id]
    owner = next((g for g in grants if g.membership.role == "holding_owner"), None)
    board = next((g for g in grants if g.membership.role == "board_member"), None)

    eligible = grants
    reason = "No applicable scoped membership grants this action."
    owner_override = False
    if node.confidentiality == "restricted":
        eligible = explicit
        if owner:
            eligible = [owner]
            owner_override = owner.node.id != node.id
            reason = "Holding-owner restricted-scope override; this access is audited."
    elif node.confidentiality == "board":
        eligible = [g for g in grants if g.membership.role in {"holding_owner", "board_member"}] + explicit
        if owner:
            owner_override = owner.node.id != node.id

    roles = sorted({g.membership.role for g in eligible})
    allowed = any(role_allows(role, object_type, action) for role in roles)
    if allowed and not owner_override:
        reason = "Allowed by an explicit or downward-inherited scoped membership."
    elif node.confidentiality in {"restricted", "board"} and not allowed:
        reason = f"{node.confidentiality.title()} confidentiality stops ordinary inheritance."

    return AccessExplanation(
        allowed=allowed,
        action=action,
        object_type=object_type,
        node_id=node.id,
        confidentiality=node.confidentiality,
        effective_roles=roles,
        grants=[
            GrantTrace(
                node_id=g.node.id,
                node_name=g.node.name,
                role=g.membership.role,
                inherited=g.node.id != node.id,
            )
            for g in eligible
        ],
        reason=reason,
        owner_override=owner_override,
    )


async def authorize(
    db: AsyncSession,
    user: CurrentUser,
    action: str,
    node: OrgNode,
    *,
    object_type: str = "node",
) -> AccessExplanation:
    result = await explain(db, user, action=action, node=node, object_type=object_type)
    if not result.allowed:
        if node.confidentiality in {"restricted", "board"}:
            raise NotFoundError("Resource", node.id)
        raise ForbiddenError("You do not have access to this scope.")
    return result


async def visible_nodes(db: AsyncSession, user: CurrentUser) -> list[OrgNode]:
    nodes = (await db.execute(select(OrgNode).order_by(OrgNode.path))).scalars().all()
    visible: list[OrgNode] = []
    for node in nodes:
        result = await explain(db, user, action="view", node=node)
        if result.allowed:
            visible.append(node)
    return visible
