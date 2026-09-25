"""Correlation-ID + safe request-logging middleware."""

from __future__ import annotations

import time
import uuid

import structlog
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.core.logging import redact_access_token
from app.core.request_context import client_ip_var, correlation_id_var

logger = structlog.get_logger(__name__)


class CorrelationIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        raw_cid = request.headers.get("X-Correlation-Id")
        if raw_cid:
            try:
                # Sanitize: require valid UUID to prevent log injection / header manipulation (M-8)
                correlation_id = str(uuid.UUID(raw_cid.strip()))
            except (ValueError, AttributeError):
                correlation_id = str(uuid.uuid4())
        else:
            correlation_id = str(uuid.uuid4())

        request.state.correlation_id = correlation_id
        structlog.contextvars.bind_contextvars(correlation_id=correlation_id)
        correlation_id_var.set(correlation_id)
        client_ip_var.set(request.client.host if request.client else None)

        start = time.perf_counter()
        response = await call_next(request)
        duration_ms = round((time.perf_counter() - start) * 1000, 2)

        safe_url = redact_access_token(str(request.url))
        logger.info(
            "request_completed",
            method=request.method,
            path=request.url.path,
            url=safe_url
            if not request.url.path.startswith("/ws")
            else request.url.path,
            status_code=response.status_code,
            duration_ms=duration_ms,
        )
        response.headers["X-Correlation-Id"] = correlation_id

        # Security Headers (M-3)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        from app.core.config import get_settings
        if get_settings().is_production:
            response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload"

        structlog.contextvars.unbind_contextvars("correlation_id")
        return response
