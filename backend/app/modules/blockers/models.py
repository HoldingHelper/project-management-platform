"""Blockers module ORM models -- schema `blockers`.

A Blocker is modelled as a distinct, first-class entity (architecture spec
section 5.3), explicitly mapping a blocked task to the person the resolution
is `PendingOnUserId` -- powering the "Pending On Me" / "Pending On Others"
dashboards.
"""

from __future__ import annotations

import uuid
from datetime import date
from typing import Optional

from sqlalchemy import CheckConstraint, Date, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.shared.base_model import AuditableMixin, TimestampMixin, UUIDPKMixin

SCHEMA = "blockers"

SEVERITY_VALUES = ["Low", "Medium", "High", "Critical"]
PRIORITY_VALUES = ["P0", "P1", "P2", "P3"]
STATUS_VALUES = ["Open", "InProgress", "Resolved", "Cancelled"]
BLOCK_REASON_VALUES = ["waiting_on_person", "technical", "business", "external"]


class Blocker(Base, UUIDPKMixin, TimestampMixin, AuditableMixin):
    __tablename__ = "blockers"
    __table_args__ = (
        CheckConstraint(
            f"severity IN ({', '.join(repr(v) for v in SEVERITY_VALUES)})",
            name="ck_blocker_severity",
        ),
        CheckConstraint(
            f"priority IN ({', '.join(repr(v) for v in PRIORITY_VALUES)})",
            name="ck_blocker_priority",
        ),
        CheckConstraint(
            f"status IN ({', '.join(repr(v) for v in STATUS_VALUES)})",
            name="ck_blocker_status",
        ),
        CheckConstraint(
            "block_reason IS NULL OR block_reason IN "
            f"({', '.join(repr(v) for v in BLOCK_REASON_VALUES)})",
            name="ck_blocker_block_reason",
        ),
        {"schema": SCHEMA},
    )

    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    severity: Mapped[str] = mapped_column(String(20), default="Medium", nullable=False)
    priority: Mapped[str] = mapped_column(String(10), default="P2", nullable=False)
    blocked_task_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    owner_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    reported_by_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False
    )
    pending_on_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    block_reason: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    estimated_unblock_date: Mapped[Optional[date]] = mapped_column(
        Date, nullable=True
    )
    expected_resolution_date: Mapped[Optional[date]] = mapped_column(
        Date, nullable=True
    )
    actual_resolution_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), default="Open", nullable=False, index=True
    )
