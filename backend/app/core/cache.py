"""Thin async Redis wrapper used for distributed caching (e.g. resource-scoped
permission lookups, 5-minute read-model caches) and pub/sub broadcast."""

from __future__ import annotations

import json
from typing import Any, Optional

import redis.asyncio as redis

from app.core.config import get_settings

settings = get_settings()

_redis_client: Optional[redis.Redis] = None


def get_redis() -> redis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.from_url(settings.redis_url, decode_responses=True)
    return _redis_client


class CacheService:
    """A small convenience facade around Redis GET/SET with JSON (de)serialisation."""

    def __init__(self, client: Optional[redis.Redis] = None) -> None:
        self._client = client or get_redis()

    async def get_json(self, key: str) -> Any | None:
        raw = await self._client.get(key)
        return json.loads(raw) if raw is not None else None

    async def set_json(self, key: str, value: Any, ttl_seconds: int = 300) -> None:
        await self._client.set(key, json.dumps(value, default=str), ex=ttl_seconds)

    async def invalidate(self, key: str) -> None:
        await self._client.delete(key)

    async def invalidate_prefix(self, prefix: str) -> None:
        async for key in self._client.scan_iter(match=f"{prefix}*"):
            await self._client.delete(key)
