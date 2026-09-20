"""Persistence helpers for personal MCP access tokens."""

from __future__ import annotations

from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.identity.models import McpAccessToken


async def get_token_by_hash(db: AsyncSession, token_hash: str) -> McpAccessToken | None:
    result = await db.execute(
        select(McpAccessToken).where(McpAccessToken.token_hash == token_hash)
    )
    return result.scalar_one_or_none()


async def get_user_token(
    db: AsyncSession, user_id: UUID, token_id: UUID
) -> McpAccessToken | None:
    result = await db.execute(
        select(McpAccessToken).where(
            McpAccessToken.id == token_id,
            McpAccessToken.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()


async def list_user_tokens(
    db: AsyncSession, user_id: UUID
) -> Sequence[McpAccessToken]:
    result = await db.execute(
        select(McpAccessToken)
        .where(McpAccessToken.user_id == user_id)
        .order_by(McpAccessToken.created_at.desc())
    )
    return result.scalars().all()


async def count_active_user_tokens(db: AsyncSession, user_id: UUID) -> int:
    from app.shared.base_model import utcnow

    result = await db.execute(
        select(func.count(McpAccessToken.id)).where(
            McpAccessToken.user_id == user_id,
            McpAccessToken.revoked_at.is_(None),
            McpAccessToken.expires_at > utcnow(),
        )
    )
    return int(result.scalar_one())
