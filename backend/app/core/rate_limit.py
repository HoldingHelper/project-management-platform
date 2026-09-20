"""A minimal in-memory fixed-window rate limiter for brute-force mitigation
on authentication endpoints. For multi-replica production deployments this
should be backed by Redis (`INCR` + `EXPIRE`) instead of process memory --
swap `InMemoryRateLimiter` for a Redis-backed implementation of the same
interface without touching call sites."""

from __future__ import annotations

import time
from collections import defaultdict
from typing import Callable, Dict, List

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response


class InMemoryRateLimiter:
    def __init__(self, max_requests: int, window_seconds: int = 60) -> None:
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._hits: Dict[str, List[float]] = defaultdict(list)

    def is_allowed(self, key: str) -> bool:
        now = time.time()
        window_start = now - self.window_seconds
        hits = [t for t in self._hits[key] if t > window_start]
        hits.append(now)
        self._hits[key] = hits
        return len(hits) <= self.max_requests

    def reset(self) -> None:
        self._hits.clear()


def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
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
            client_key = _get_client_ip(request)
            if not self.limiter.is_allowed(client_key):
                return JSONResponse(
                    status_code=429,
                    content={
                        "type": "rate_limited",
                        "title": "Too many requests. Please try again shortly.",
                        "status": 429,
                    },
                )
        return await call_next(request)
