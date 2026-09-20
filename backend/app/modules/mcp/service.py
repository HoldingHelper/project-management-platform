"""Personal MCP token lifecycle and live RBAC resolution."""

from __future__ import annotations

import secrets
from datetime import timedelta
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.current_user import CurrentUser
from app.core.exceptions import NotFoundError, UnauthorizedError, ValidationAppError
from app.core.security import hash_opaque_token
from app.modules.identity import repository as identity_repo
from app.modules.identity.models import McpAccessToken, User
from app.modules.identity.service import permissions_for_user
from app.modules.mcp import repository as repo
from app.modules.mcp.schemas import McpTokenCreate, McpTokenCreated, McpTokenRead
from app.shared.base_model import utcnow

TOKEN_PREFIX = "pmp_mcp_"
MAX_ACTIVE_TOKENS_PER_USER = 20


def roles_for_user(user: User) -> list[str]:
    return [user_role.role.name for user_role in user.roles]


def available_permission_codes(user: User) -> list[str]:
    return permissions_for_user(user)


def token_read(token: McpAccessToken) -> McpTokenRead:
    return McpTokenRead(
        id=token.id,
        name=token.name,
        token_prefix=token.token_prefix,
        permission_codes=sorted(token.permission_codes),
        created_at=token.created_at,
        expires_at=token.expires_at,
        last_used_at=token.last_used_at,
        revoked_at=token.revoked_at,
        is_active=token.is_active,
    )


async def live_web_principal(
    db: AsyncSession, current_user: CurrentUser
) -> CurrentUser:
    """Refresh JWT-carried RBAC from the database for MCP setup screens."""
    account = await identity_repo.get_user_by_id(db, current_user.user_id)
    if account is None or not account.is_active:
        raise UnauthorizedError("Your account is not active.")
    return CurrentUser(
        user_id=account.id,
        email=account.email,
        full_name=account.full_name,
        roles=roles_for_user(account),
        permissions=available_permission_codes(account),
    )


async def create_token(
    db: AsyncSession, user: CurrentUser, payload: McpTokenCreate
) -> McpTokenCreated:
    account = await identity_repo.get_user_by_id(db, user.user_id)
    if account is None or not account.is_active:
        raise UnauthorizedError("Your account is not active.")

    available = set(available_permission_codes(account))
    requested = set(payload.permission_codes)
    unavailable = sorted(requested - available)
    if unavailable:
        raise ValidationAppError(
            "An MCP token cannot grant permissions your account does not have.",
            errors={"permission_codes": unavailable},
        )
    if await repo.count_active_user_tokens(db, user.user_id) >= MAX_ACTIVE_TOKENS_PER_USER:
        raise ValidationAppError(
            f"Revoke an existing token before creating more than {MAX_ACTIVE_TOKENS_PER_USER}."
        )

    raw_token = TOKEN_PREFIX + secrets.token_urlsafe(48)
    now = utcnow()
    model = McpAccessToken(
        user_id=user.user_id,
        name=payload.name,
        token_prefix=raw_token[:20],
        token_hash=hash_opaque_token(raw_token),
        permission_codes=sorted(requested),
        created_at=now,
        expires_at=now + timedelta(days=payload.expires_in_days),
    )
    db.add(model)
    await db.commit()
    await db.refresh(model)
    return McpTokenCreated(**token_read(model).model_dump(), token=raw_token)


async def list_tokens(db: AsyncSession, user_id: UUID) -> list[McpTokenRead]:
    return [token_read(token) for token in await repo.list_user_tokens(db, user_id)]


async def revoke_token(db: AsyncSession, user_id: UUID, token_id: UUID) -> None:
    token = await repo.get_user_token(db, user_id, token_id)
    if token is None:
        raise NotFoundError("MCP access token", token_id)
    if token.revoked_at is None:
        token.revoked_at = utcnow()
        await db.commit()


async def resolve_principal(
    db: AsyncSession, raw_token: str
) -> tuple[CurrentUser, McpAccessToken]:
    if not raw_token.startswith(TOKEN_PREFIX) or len(raw_token) < 32:
        raise UnauthorizedError("Invalid MCP access token.")
    token = await repo.get_token_by_hash(db, hash_opaque_token(raw_token))
    if token is None or not token.is_active:
        raise UnauthorizedError("MCP access token is invalid, expired, or revoked.")

    account = await identity_repo.get_user_by_id(db, token.user_id)
    if account is None or not account.is_active:
        raise UnauthorizedError("The account for this MCP token is not active.")

    live_permissions = set(available_permission_codes(account))
    effective_permissions = sorted(live_permissions.intersection(token.permission_codes))
    # Record usage without persisting the raw secret. This commit is isolated
    # from tool execution so audit metadata survives read-only calls as well.
    token.last_used_at = utcnow()
    await db.commit()

    return (
        CurrentUser(
            user_id=account.id,
            email=account.email,
            full_name=account.full_name,
            roles=roles_for_user(account),
            permissions=effective_permissions,
            allow_role_bypass=False,
        ),
        token,
    )
