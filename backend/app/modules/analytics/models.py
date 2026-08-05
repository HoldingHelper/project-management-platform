"""Analytics module ORM models -- schema `analytics`.

`AuditLog` is append-only: rows are only ever inserted (by
`app.modules.analytics.event_handlers`, which drains `AuditableChangeOccurred`
events published by every other module's SQLAlchemy interceptor), never
updated or deleted, satisfying the "nothing is ever deleted without a trace"
compliance requirement.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.shared.base_model import UUIDPKMixin

SCHEMA = "analytics"


class AuditLog(Base, UUIDPKMixin):
    __tablename__ = "audit_logs"
    __table_args__ = {"schema": SCHEMA}

    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True, index=True
    )
    ip_address: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    entity_type: Mapped[str] = mapped_column(String(150), nullable=False, index=True)
    entity_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    action_type: Mapped[str] = mapped_column(String(30), nullable=False)
    changes_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    correlation_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
