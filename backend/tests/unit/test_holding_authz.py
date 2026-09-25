from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from app.core.current_user import CurrentUser
from app.modules.authz import service
from app.modules.authz.policy import load_policy, role_allows, valid_role
from app.modules.org.models import Membership, OrgNode
from app.modules.org.schemas import AllocationCreate, MembershipCreate


def user(user_id=None):
    return CurrentUser(user_id=user_id or uuid4(), email="person@example.com", full_name="Person")


def node(*, path="holding.venture.project", confidentiality="standard"):
    return OrgNode(
        id=uuid4(), type="project", parent_id=uuid4(), path=path, name="Project",
        slug="project", confidentiality=confidentiality, created_by=uuid4(), metadata_json={},
    )


def grant(person_id, scope, role):
    membership = Membership(
        id=uuid4(), person_id=person_id, node_id=scope.id, role=role,
        since=__import__("datetime").date.today(), granted_by=person_id,
    )
    return service._Grant(membership=membership, node=scope)


class EmptyResult:
    def scalars(self):
        return self

    def all(self):
        return []


def test_policy_is_reviewable_and_covers_core_scoped_roles():
    policy = load_policy()
    assert set(policy["object_types"]) >= {"node", "task", "page", "objective", "request"}
    assert all(valid_role(role) for role in ("holding_owner", "venture_lead", "function_lead", "project_manager", "contractor", "investor"))
    assert role_allows("holding_owner", "page", "publish_external")
    assert role_allows("venture_member", "task", "create")
    assert not role_allows("venture_member", "node", "manage_members")
    assert not role_allows("contractor", "page", "view")


@pytest.mark.asyncio
async def test_restricted_scope_stops_ancestor_inheritance(monkeypatch):
    actor = user()
    target = node(confidentiality="restricted")
    venture = node(path="holding.venture")
    inherited = grant(actor.user_id, venture, "venture_lead")
    monkeypatch.setattr(service, "_ancestor_grants", AsyncMock(return_value=[inherited]))
    db = AsyncMock()
    db.execute.return_value = EmptyResult()

    result = await service.explain(db, actor, action="view", node=target)

    assert result.allowed is False
    assert result.effective_roles == []
    assert "stops ordinary inheritance" in result.reason


@pytest.mark.asyncio
async def test_explicit_membership_unlocks_restricted_scope(monkeypatch):
    actor = user()
    target = node(confidentiality="restricted")
    explicit = grant(actor.user_id, target, "viewer")
    monkeypatch.setattr(service, "_ancestor_grants", AsyncMock(return_value=[explicit]))
    db = AsyncMock()
    db.execute.return_value = EmptyResult()

    result = await service.explain(db, actor, action="view", node=target)

    assert result.allowed is True
    assert result.effective_roles == ["viewer"]
    assert result.grants[0].inherited is False


def test_capacity_and_membership_contracts_reject_invalid_ranges():
    with pytest.raises(ValueError):
        AllocationCreate(person_id=uuid4(), node_id=uuid4(), percent=101, start_date="2026-09-25")
    with pytest.raises(ValueError):
        MembershipCreate(
            person_id=uuid4(), node_id=uuid4(), role="viewer",
            since="2026-09-25", until="2026-09-24",
        )
