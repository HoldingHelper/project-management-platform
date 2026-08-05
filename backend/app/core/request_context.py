"""Contextvars carrying per-request identity, used by the audit interceptor
(SQLAlchemy session events fire outside of FastAPI's dependency graph, so we
can't rely on `Depends(get_current_user)` there -- contextvars flow through
async call chains automatically instead)."""

from __future__ import annotations

import contextvars
from typing import Optional
from uuid import UUID

current_user_id_var: contextvars.ContextVar[Optional[UUID]] = contextvars.ContextVar(
    "current_user_id", default=None
)
client_ip_var: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "client_ip", default=None
)
correlation_id_var: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "correlation_id", default=None
)
