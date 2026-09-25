"""Password hashing and JWT issuance/verification."""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID

import bcrypt
import jwt

from app.core.config import get_settings

settings = get_settings()

TOKEN_TYPE_ACCESS = "access"
TOKEN_TYPE_RESET = "reset"


# Constant-time dummy hash for user-enumeration mitigation (M-10)
_DUMMY_BCRYPT_HASH = "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewKyNiRrhU5.3d.q"

# In-memory revocation cache fallback (when Redis unavailable)
_REVOKED_JTIS: dict[str, float] = {}
_USER_REVOKED_AT: dict[str, float] = {}


def hash_password(plain_password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(plain_password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"), hashed_password.encode("utf-8")
        )
    except (ValueError, TypeError):
        return False


def dummy_verify_password(plain_password: str) -> None:
    """Execute constant-time bcrypt verify against dummy hash to prevent user enumeration."""
    try:
        bcrypt.checkpw(plain_password.encode("utf-8"), _DUMMY_BCRYPT_HASH.encode("utf-8"))
    except Exception:
        pass


def revoke_token(jti: str, ttl_seconds: int = 1800) -> None:
    now = datetime.now(timezone.utc).timestamp()
    _REVOKED_JTIS[jti] = now + ttl_seconds
    try:
        import asyncio
        from app.core.cache import get_redis
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.create_task(get_redis().set(f"token:revoked:{jti}", "1", ex=ttl_seconds))
    except Exception:
        pass


def revoke_all_user_tokens(user_id: UUID | str) -> None:
    now = datetime.now(timezone.utc).timestamp()
    uid = str(user_id)
    _USER_REVOKED_AT[uid] = now
    try:
        import asyncio
        from app.core.cache import get_redis
        loop = asyncio.get_event_loop()
        if loop.is_running():
            ttl = settings.access_token_expire_minutes * 60 + 60
            asyncio.create_task(get_redis().set(f"user:revoked_at:{uid}", str(now), ex=ttl))
    except Exception:
        pass


async def is_token_revoked(jti: Optional[str], user_id: str, issued_at: Optional[Any]) -> bool:
    now = datetime.now(timezone.utc).timestamp()
    if jti and jti in _REVOKED_JTIS:
        if _REVOKED_JTIS[jti] > now:
            return True
        else:
            _REVOKED_JTIS.pop(jti, None)

    if user_id in _USER_REVOKED_AT:
        cutoff = _USER_REVOKED_AT[user_id]
        iat = issued_at.timestamp() if isinstance(issued_at, datetime) else (float(issued_at) if issued_at else 0)
        if iat < cutoff:
            return True

    # Check Redis
    try:
        from app.core.cache import get_redis
        redis = get_redis()
        if jti and await redis.get(f"token:revoked:{jti}"):
            return True
        user_cutoff = await redis.get(f"user:revoked_at:{user_id}")
        if user_cutoff:
            iat = issued_at.timestamp() if isinstance(issued_at, datetime) else (float(issued_at) if issued_at else 0)
            if iat < float(user_cutoff):
                return True
    except Exception:
        pass

    return False


def create_access_token(
    *,
    user_id: UUID,
    email: str,
    full_name: str,
    roles: List[str],
    permissions: List[str],
    expires_delta: Optional[timedelta] = None,
    allow_role_bypass: bool = True,
) -> str:
    now = datetime.now(timezone.utc)
    expire = now + (
        expires_delta or timedelta(minutes=settings.access_token_expire_minutes)
    )
    payload: Dict[str, Any] = {
        "sub": str(user_id),
        "email": email,
        "name": full_name,
        "roles": roles,
        "permissions": permissions,
        "allow_role_bypass": allow_role_bypass,
        "type": TOKEN_TYPE_ACCESS,
        "jti": secrets.token_urlsafe(16),
        "iat": now,
        "exp": expire,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> Dict[str, Any]:
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])


def generate_opaque_token() -> str:
    """Used for refresh tokens and password-reset tokens: a random opaque
    secret is returned to the caller, but only its SHA-256 hash is persisted."""
    return secrets.token_urlsafe(48)


def hash_opaque_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


_IN_MEMORY_OAUTH_STATES: dict[str, tuple[str, float]] = {}


def create_oauth_state_sync(user_id: UUID, provider: str, ttl_seconds: int = 600) -> str:
    """Generate a random CSRF state bound to user and provider synchronously (H-10)."""
    state = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc).timestamp()
    _IN_MEMORY_OAUTH_STATES[f"{provider}:{state}"] = (str(user_id), now + ttl_seconds)
    return state


async def create_oauth_state(user_id: UUID, provider: str, ttl_seconds: int = 600) -> str:
    """Generate a random CSRF state bound to user and provider (H-10)."""
    state = create_oauth_state_sync(user_id, provider, ttl_seconds)
    try:
        from app.core.cache import get_redis
        redis_client = get_redis()
        await redis_client.set(f"oauth:state:{provider}:{state}", str(user_id), ex=ttl_seconds)
    except Exception:
        pass
    return state


async def verify_oauth_state(user_id: UUID, provider: str, state: str) -> bool:
    """Verify and consume the CSRF OAuth state (H-10)."""
    if not state:
        return False
    key = f"{provider}:{state}"
    expected_user = str(user_id)
    verified = False

    try:
        from app.core.cache import get_redis
        redis_client = get_redis()
        stored = await redis_client.get(f"oauth:state:{key}")
        if stored:
            await redis_client.delete(f"oauth:state:{key}")
            return stored == expected_user
    except Exception:
        pass

    if key in _IN_MEMORY_OAUTH_STATES:
        stored_user, expires_at = _IN_MEMORY_OAUTH_STATES.pop(key)
        now = datetime.now(timezone.utc).timestamp()
        if now <= expires_at and stored_user == expected_user:
            verified = True

    return verified

