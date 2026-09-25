"""Fixed-window rate limiter for brute-force mitigation on authentication endpoints.
Supports both Redis-backed distributed rate limiting (with INCR + EXPIRE) and
an in-memory fallback with automatic pruning to prevent memory exhaustion (C-5).
Safely extracts client IP behind Cloud Run / reverse proxies.
"""

from __future__ import annotations

import time
from collections import defaultdict
from typing import Callable, Dict, List, Optional

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response


class InMemoryRateLimiter:
    def __init__(self, max_requests: int, window_seconds: int = 60) -> None:
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._hits: Dict[str, List[float]] = defaultdict(list)
        self._last_cleanup = time.time()

    def _cleanup_old_keys(self, now: float) -> None:
        # Periodic cleanup every 60s to prevent unbounded memory growth (C-5)
        if now - self._last_cleanup < 60:
            return
        self._last_cleanup = now
        window_start = now - self.window_seconds
        stale_keys = [k for k, hits in self._hits.items() if not hits or hits[-1] <= window_start]
        for k in stale_keys:
            self._hits.pop(k, None)

    def is_allowed(self, key: str) -> bool:
        now = time.time()
        self._cleanup_old_keys(now)
        window_start = now - self.window_seconds
        hits = [t for t in self._hits[key] if t > window_start]
        hits.append(now)
        self._hits[key] = hits
        return len(hits) <= self.max_requests

    async def is_allowed_async(self, key: str) -> bool:
        # Try Redis first if available
        try:
            from app.core.cache import get_redis
            redis = get_redis()
            rkey = f"ratelimit:{key}"
            current = await redis.incr(rkey)
            if current == 1:
                await redis.expire(rkey, self.window_seconds)
            return current <= self.max_requests
        except Exception:
            # Fall back to in-memory
            return self.is_allowed(key)

    def reset(self) -> None:
        self._hits.clear()


def _get_client_ip(request: Request) -> str:
    """Extract real client IP safely behind Cloud Run / reverse proxies.

    Google Cloud Run / Load Balancer appends the connecting client IP to
    the end of the X-Forwarded-For header before its own proxy IP:
    X-Forwarded-For: <client>, <proxy1>, <proxy2>...
    Client-forged headers appear at the beginning of the list, so taking
    index 0 is trivially spoofable. We take the trusted client IP.
    """
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        parts = [p.strip() for p in forwarded.split(",") if p.strip()]
        if len(parts) >= 2:
            # Second from right is the client IP added before the final Google Cloud Run hop
            return parts[-2]
        if len(parts) == 1:
            return parts[0]

    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip.strip()

    return request.client.host if request.client else "unknown"


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(
        self, app, limiter: InMemoryRateLimiter, path_predicate: Callable[[str], bool]
    ) -> None:
        super().__init__(app)
        self.limiter = limiter
        self.path_predicate = path_predicate

    async def dispatch(self, request: Request, call_next) -> Response:
        if self.path_predicate(request.url.path):
            client_ip = _get_client_ip(request)
            key = f"ip:{client_ip}"
            is_ok = await self.limiter.is_allowed_async(key)
            if not is_ok:
                return JSONResponse(
                    status_code=429,
                    content={
                        "type": "rate_limited",
                        "title": "Too many requests. Please try again shortly.",
                        "status": 429,
                    },
                )
        return await call_next(request)
