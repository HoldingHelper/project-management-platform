"""MinIO-backed byte cache for Drive tracks.

One Google Drive fetch per track for the whole room instead of one per
listener. Cache hits are served straight from MinIO with real Range support
and an exact Content-Length — which is also what gives browsers a stable
duration/seek bar (Drive's public download endpoint often ignores Range).

Cache identity is ``{file_id}/{version}`` where version derives from Drive's
modifiedTime — re-uploading a Drive file mints a new key, so stale bytes are
never served (the old key just ages out via LRU).

Redis bookkeeping (all best-effort; losing Redis just means re-fetching):
- ``music:cache:meta:{key}``  hash: size, mime
- ``music:cache:lock:{key}``  single-flight fill lock (SET NX EX)
- ``music:cache:lru``         ZSET cache_key -> last-access epoch
- ``music:cache:total_bytes`` running byte total for LRU eviction
"""

from __future__ import annotations

import asyncio
import logging
import tempfile
import time
from typing import Any, AsyncIterator, Awaitable, Callable, Optional

import boto3
from botocore.client import Config as BotoConfig
from botocore.exceptions import ClientError

from app.core.cache import get_redis
from app.core.config import get_settings

logger = logging.getLogger(__name__)

# (status_code, headers, body_iterator) — same shape google_drive returns.
StreamTriple = tuple[int, dict[str, str], AsyncIterator[bytes]]
UpstreamOpener = Callable[[], Awaitable[StreamTriple]]

_LRU_KEY = "music:cache:lru"
_TOTAL_KEY = "music:cache:total_bytes"
_FILL_LOCK_TTL = 600  # seconds; covers the slowest realistic Drive download
_CHUNK_SIZE = 256 * 1024
# Spill fills bigger than this from memory to disk while downloading.
_SPOOL_MAX_MEMORY = 32 * 1024 * 1024


def _cache_key(file_id: str, version: str) -> str:
    """Cache identity: the Drive file id plus a content version tag."""
    return f"{file_id}/{version}"


def _meta_key(cache_key: str) -> str:
    return f"music:cache:meta:{cache_key}"


def _lock_key(cache_key: str) -> str:
    return f"music:cache:lock:{cache_key}"


class MusicCacheService:
    """S3/MinIO byte cache with single-flight fills and LRU eviction."""

    def __init__(self) -> None:
        settings = get_settings()
        client_kwargs: dict[str, Any] = {
            "region_name": settings.s3_region or "eu-central-1",
            "use_ssl": settings.s3_use_ssl,
            "config": BotoConfig(
                signature_version="s3v4", s3={"addressing_style": "path"}
            ),
        }
        if settings.s3_endpoint_url and settings.s3_endpoint_url.strip():
            client_kwargs["endpoint_url"] = settings.s3_endpoint_url.strip()
        if settings.s3_access_key and settings.s3_access_key.strip():
            client_kwargs["aws_access_key_id"] = settings.s3_access_key.strip()
        if settings.s3_secret_key and settings.s3_secret_key.strip():
            client_kwargs["aws_secret_access_key"] = settings.s3_secret_key.strip()

        self._client = boto3.client("s3", **client_kwargs)
        self._bucket = settings.music_cache_bucket
        self._max_bytes = settings.music_cache_max_bytes
        self._bucket_ready = False

    @staticmethod
    def _object_key(cache_key: str) -> str:
        return f"drive/{cache_key}"

    def _ensure_bucket_sync(self) -> None:
        existing = [
            b["Name"] for b in self._client.list_buckets().get("Buckets", [])
        ]
        if self._bucket not in existing:
            self._client.create_bucket(Bucket=self._bucket)

    async def _ensure_bucket(self) -> None:
        if self._bucket_ready:
            return
        await asyncio.to_thread(self._ensure_bucket_sync)
        self._bucket_ready = True

    # ---------- lookup ----------

    async def get_meta(
        self, file_id: str, version: str
    ) -> Optional[dict[str, str]]:
        meta = await get_redis().hgetall(_meta_key(_cache_key(file_id, version)))
        return meta or None

    async def _drop(self, cache_key: str) -> None:
        redis = get_redis()
        size = int(await redis.hget(_meta_key(cache_key), "size") or 0)
        await redis.delete(_meta_key(cache_key))
        await redis.zrem(_LRU_KEY, cache_key)
        if size:
            await redis.decrby(_TOTAL_KEY, size)

    # ---------- serving ----------

    async def serve(
        self, file_id: str, version: str, range_header: Optional[str]
    ) -> Optional[StreamTriple]:
        """Serve a cached track (Range-aware). None = cache miss."""
        cache_key = _cache_key(file_id, version)
        meta = await self.get_meta(file_id, version)
        if meta is None:
            return None
        get_kwargs: dict[str, str] = {
            "Bucket": self._bucket, "Key": self._object_key(cache_key)
        }
        if range_header:
            get_kwargs["Range"] = range_header
        try:
            obj = await asyncio.to_thread(self._client.get_object, **get_kwargs)
        except ClientError as exc:
            code = exc.response.get("Error", {}).get("Code", "")
            if code in ("InvalidRange", "Requested Range Not Satisfiable"):
                size = meta.get("size", "*")

                async def empty() -> AsyncIterator[bytes]:
                    return
                    yield b""  # pragma: no cover - makes this a generator

                return 416, {"content-range": f"bytes */{size}"}, empty()
            # Object vanished under us (manual wipe, bucket loss): treat as
            # a miss so the caller falls back to Drive.
            await self._drop(cache_key)
            return None

        status = obj["ResponseMetadata"]["HTTPStatusCode"]
        headers = {
            "content-type": meta.get("mime")
            or obj.get("ContentType", "application/octet-stream"),
            "content-length": str(obj["ContentLength"]),
            "accept-ranges": "bytes",
        }
        if obj.get("ContentRange"):
            headers["content-range"] = obj["ContentRange"]

        body = obj["Body"]

        async def iterate() -> AsyncIterator[bytes]:
            try:
                while True:
                    chunk = await asyncio.to_thread(body.read, _CHUNK_SIZE)
                    if not chunk:
                        break
                    yield chunk
            finally:
                await asyncio.to_thread(body.close)

        await get_redis().zadd(_LRU_KEY, {cache_key: time.time()})
        logger.debug("music cache: hit %s", cache_key)
        return status, headers, iterate()

    # ---------- filling ----------

    async def try_fill(
        self, file_id: str, version: str, open_upstream: UpstreamOpener
    ) -> bool:
        """Single-flight: download the full track from Drive into MinIO.

        Returns True when this call did the fill; False when already cached,
        another fill is in flight, or the fill failed (all non-fatal — the
        caller streams through from Drive either way).
        """
        redis = get_redis()
        cache_key = _cache_key(file_id, version)
        if await self.get_meta(file_id, version) is not None:
            return False
        acquired = await redis.set(
            _lock_key(cache_key), "1", nx=True, ex=_FILL_LOCK_TTL
        )
        if not acquired:
            return False
        try:
            await self._ensure_bucket()
            started = time.monotonic()
            _, headers, body = await open_upstream()
            mime = headers.get("content-type", "application/octet-stream")
            size = 0
            with tempfile.SpooledTemporaryFile(
                max_size=_SPOOL_MAX_MEMORY
            ) as buffer:
                async for chunk in body:
                    buffer.write(chunk)
                    size += len(chunk)
                if size == 0:
                    logger.warning("music cache: empty body for %s", cache_key)
                    return False
                buffer.seek(0)
                await asyncio.to_thread(
                    self._client.upload_fileobj,
                    buffer,
                    self._bucket,
                    self._object_key(cache_key),
                    ExtraArgs={"ContentType": mime},
                )
            await redis.hset(
                _meta_key(cache_key), mapping={"size": size, "mime": mime}
            )
            await redis.zadd(_LRU_KEY, {cache_key: time.time()})
            total = await redis.incrby(_TOTAL_KEY, size)
            logger.info(
                "music cache: filled %s (%d bytes in %.1fs, total %d)",
                cache_key, size, time.monotonic() - started, total,
            )
            await self._evict_if_needed(int(total), keep=cache_key)
            return True
        except Exception:  # noqa: BLE001 - cache fill is always best-effort
            logger.warning(
                "music cache: fill failed for %s", cache_key, exc_info=True
            )
            return False
        finally:
            await redis.delete(_lock_key(cache_key))

    async def _evict_if_needed(self, total: int, keep: str) -> None:
        redis = get_redis()
        while total > self._max_bytes:
            oldest = await redis.zrange(_LRU_KEY, 0, 0)
            if not oldest or oldest[0] == keep:
                return
            victim = oldest[0]
            size = int(await redis.hget(_meta_key(victim), "size") or 0)
            try:
                await asyncio.to_thread(
                    self._client.delete_object,
                    Bucket=self._bucket,
                    Key=self._object_key(victim),
                )
            except ClientError:
                logger.warning("music cache: evict delete failed for %s", victim)
            await redis.zrem(_LRU_KEY, victim)
            await redis.delete(_meta_key(victim))
            total = int(await redis.decrby(_TOTAL_KEY, size))
            logger.info("music cache: evicted %s (%d bytes)", victim, size)


music_cache_service = MusicCacheService()
