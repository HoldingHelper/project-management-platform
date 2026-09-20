"""Shared FastAPI dependencies: DB session re-export, current-user resolution
and the permission-requirement dependency factory (the Python equivalent of
the .NET `PermissionAuthorizationBehavior` MediatR pipeline behaviour)."""

from __future__ import annotations

from typing import Callable
from uuid import UUID

import jwt
from fastapi import Depends, Request
from fastapi.security import OAuth2PasswordBearer

from app.core.current_user import CurrentUser
from app.core.exceptions import ForbiddenError, UnauthorizedError
from app.core.request_context import current_user_id_var
from app.core.security import TOKEN_TYPE_ACCESS, decode_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


def _extract_token_from_websocket(request: Request) -> str | None:
    return request.query_params.get("access_token")


async def get_current_user(
    request: Request, token: str | None = Depends(oauth2_scheme)
) -> CurrentUser:
    raw_token = token or _extract_token_from_websocket(request)
    if not raw_token:
        raise UnauthorizedError("Missing bearer token.")
    try:
        payload = decode_token(raw_token)
    except jwt.ExpiredSignatureError as exc:
        raise UnauthorizedError("Access token has expired.") from exc
    except jwt.InvalidTokenError as exc:
        raise UnauthorizedError("Invalid access token.") from exc

    if payload.get("type") != TOKEN_TYPE_ACCESS:
        raise UnauthorizedError("Token is not an access token.")

    user = CurrentUser(
        user_id=UUID(payload["sub"]),
        email=payload.get("email", ""),
        full_name=payload.get("name", ""),
        roles=payload.get("roles", []),
        permissions=payload.get("permissions", []),
        allow_role_bypass=payload.get("allow_role_bypass", True),
    )
    current_user_id_var.set(user.user_id)
    return user


async def get_optional_current_user(
    request: Request, token: str | None = Depends(oauth2_scheme)
) -> CurrentUser | None:
    raw_token = token or _extract_token_from_websocket(request)
    if not raw_token:
        return None
    try:
        return await get_current_user(request, raw_token)
    except UnauthorizedError:
        return None


def require_permission(*codes: str) -> Callable:
    """FastAPI dependency factory: enforces the caller has AT LEAST ONE of the
    given permission codes (coarse, global-role check). Handlers/services are
    still responsible for finer-grained, resource-scoped checks -- see
    docs/MODULE_GUIDE.md."""

    async def _dependency(
        current_user: CurrentUser = Depends(get_current_user),
    ) -> CurrentUser:
        if current_user.is_super_admin():
            return current_user
        if not current_user.has_any_permission(*codes):
            raise ForbiddenError(f"Missing required permission: one of {codes}")
        return current_user

    return _dependency
