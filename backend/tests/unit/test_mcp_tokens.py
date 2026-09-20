"""Security invariants for personal MCP token issuance and resolution."""

from __future__ import annotations

from datetime import timedelta
from uuid import uuid4

import pytest

from app.core.current_user import CurrentUser
from app.core.exceptions import UnauthorizedError, ValidationAppError
from app.core.security import hash_opaque_token
from app.modules.identity.models import Permission, Role, RolePermission, User, UserRole
from app.modules.mcp import service
from app.modules.mcp.schemas import McpTokenCreate
from app.shared.base_model import utcnow


def account_with_permissions(*codes: str, super_admin: bool = False) -> User:
    role = Role(
        id=uuid4(),
        name="SuperAdmin" if super_admin else "Scoped Agent",
        description="MCP test role",
    )
    role.permissions = []
    for code in codes:
        permission = Permission(id=uuid4(), code=code, description=code)
        link = RolePermission(role_id=role.id, permission_id=permission.id)
        link.permission = permission
        role.permissions.append(link)
    user = User(
        id=uuid4(),
        email="mcp.user@example.com",
        first_name="MCP",
        last_name="User",
        password_hash="unused",
        is_active=True,
    )
    user_role = UserRole(user_id=user.id, role_id=role.id)
    user_role.role = role
    user.roles = [user_role]
    return user


class FakeDb:
    def __init__(self):
        self.added = []
        self.commits = 0

    def add(self, value):
        if getattr(value, "id", None) is None:
            value.id = uuid4()
        self.added.append(value)

    async def commit(self):
        self.commits += 1

    async def refresh(self, _value):
        return None


@pytest.mark.asyncio
async def test_setup_refreshes_live_permissions_instead_of_trusting_stale_jwt(monkeypatch):
    account = account_with_permissions("docs.view")
    stale = CurrentUser(
        user_id=account.id,
        email=account.email,
        full_name=account.full_name,
        permissions=["docs.manage"],
    )

    async def get_user(*_args):
        return account

    monkeypatch.setattr(service.identity_repo, "get_user_by_id", get_user)
    refreshed = await service.live_web_principal(FakeDb(), stale)  # type: ignore[arg-type]
    assert refreshed.permissions == ["docs.view"]


@pytest.mark.asyncio
async def test_create_token_returns_secret_once_and_persists_only_hash(monkeypatch):
    account = account_with_permissions("docs.view", "docs.edit")
    principal = CurrentUser(
        user_id=account.id,
        email=account.email,
        full_name=account.full_name,
        permissions=["docs.view", "docs.edit"],
    )
    db = FakeDb()

    async def get_user(*_args):
        return account

    async def count_tokens(*_args):
        return 0

    monkeypatch.setattr(service.identity_repo, "get_user_by_id", get_user)
    monkeypatch.setattr(service.repo, "count_active_user_tokens", count_tokens)

    created = await service.create_token(
        db,  # type: ignore[arg-type]
        principal,
        McpTokenCreate(
            name="Codex laptop",
            permission_codes=["docs.view"],
            expires_in_days=30,
        ),
    )
    stored = db.added[0]
    assert created.token.startswith("pmp_mcp_")
    assert stored.token_hash == hash_opaque_token(created.token)
    assert created.token not in vars(stored).values()
    assert stored.permission_codes == ["docs.view"]
    assert created.expires_at > created.created_at


@pytest.mark.asyncio
async def test_create_token_cannot_escalate_beyond_live_user_permissions(monkeypatch):
    account = account_with_permissions("docs.view")
    principal = CurrentUser(
        user_id=account.id,
        email=account.email,
        full_name=account.full_name,
        permissions=["docs.view"],
    )

    async def get_user(*_args):
        return account

    monkeypatch.setattr(service.identity_repo, "get_user_by_id", get_user)
    with pytest.raises(ValidationAppError):
        await service.create_token(
            FakeDb(),  # type: ignore[arg-type]
            principal,
            McpTokenCreate(
                name="Escalation attempt",
                permission_codes=["docs.manage"],
            ),
        )


@pytest.mark.asyncio
async def test_resolve_intersects_token_with_live_rbac_and_disables_superadmin_bypass(monkeypatch):
    account = account_with_permissions("docs.view", super_admin=True)
    raw_token = "pmp_mcp_" + "a" * 64
    from app.modules.identity.models import McpAccessToken

    token = McpAccessToken(
        id=uuid4(),
        user_id=account.id,
        name="Old broad token",
        token_prefix=raw_token[:20],
        token_hash=hash_opaque_token(raw_token),
        permission_codes=["docs.view", "docs.edit"],
        created_at=utcnow(),
        expires_at=utcnow() + timedelta(days=30),
    )

    async def get_token(*_args):
        return token

    async def get_user(*_args):
        return account

    monkeypatch.setattr(service.repo, "get_token_by_hash", get_token)
    monkeypatch.setattr(service.identity_repo, "get_user_by_id", get_user)
    db = FakeDb()
    principal, resolved = await service.resolve_principal(db, raw_token)  # type: ignore[arg-type]

    assert resolved is token
    # SuperAdmin's canonical static permissions remain live, so the requested
    # subset survives, but role bypass is still disabled for the MCP principal.
    assert principal.permissions == ["docs.edit", "docs.view"]
    assert principal.is_super_admin() is False
    assert token.last_used_at is not None


@pytest.mark.asyncio
async def test_resolve_rejects_revoked_token(monkeypatch):
    from app.modules.identity.models import McpAccessToken

    raw_token = "pmp_mcp_" + "b" * 64
    token = McpAccessToken(
        id=uuid4(),
        user_id=uuid4(),
        name="Revoked",
        token_prefix=raw_token[:20],
        token_hash=hash_opaque_token(raw_token),
        permission_codes=["docs.view"],
        created_at=utcnow(),
        expires_at=utcnow() + timedelta(days=30),
        revoked_at=utcnow(),
    )

    async def get_token(*_args):
        return token

    monkeypatch.setattr(service.repo, "get_token_by_hash", get_token)
    with pytest.raises(UnauthorizedError):
        await service.resolve_principal(FakeDb(), raw_token)  # type: ignore[arg-type]
