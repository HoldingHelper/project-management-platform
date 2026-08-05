"""Structured logging configuration.

Security note (architecture spec section 4.3): because JWTs are carried in
the WebSocket handshake query string (`/ws/*?access_token=...`), request URLs
must never be logged at INFO level -- otherwise the access token leaks into
plaintext server logs. We therefore (a) configure uvicorn's access logger to
WARNING so it doesn't print the raw request line, and (b) have our own
request-logging middleware explicitly redact the `access_token` query
parameter for any path under `/ws`.
"""

from __future__ import annotations

import logging
import re

import structlog

_ACCESS_TOKEN_RE = re.compile(r"(access_token=)[^&\s]+")


def redact_access_token(url: str) -> str:
    return _ACCESS_TOKEN_RE.sub(r"\1***REDACTED***", url)


def configure_logging(debug: bool = True) -> None:
    logging.basicConfig(
        format="%(message)s",
        level=logging.INFO if not debug else logging.DEBUG,
    )
    # Suppress uvicorn's default access log (which prints full request lines,
    # including query strings) at INFO level -- our middleware logs a
    # redacted, structured equivalent instead.
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)

    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(
            logging.INFO if not debug else logging.DEBUG
        ),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )
