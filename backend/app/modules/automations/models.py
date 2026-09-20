"""Automations module ORM models -- schema `automations`.

Defines reactive automation rules triggered by platform events (PR merge, task status, docs, blockers)
and historical execution audit logs.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.shared.base_model import TimestampMixin, UUIDPKMixin, utcnow

SCHEMA = "automations"


class AutomationRule(Base, UUIDPKMixin, TimestampMixin):
    """User or workspace defined automation trigger-action rule."""

    __tablename__ = "rules"
    __table_args__ = (
        Index("ix_automations_rules_trigger", "trigger_type", "is_active"),
        {"schema": SCHEMA},
    )

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    trigger_type: Mapped[str] = mapped_column(
        String(64), nullable=False
    )  # e.g., "github.pr_merged", "task.status_changed", "blocker.raised", "meeting.remind", "doc.created"
    condition_json: Mapped[Dict[str, Any]] = mapped_column(
        JSONB, default=dict, nullable=False
    )
    action_type: Mapped[str] = mapped_column(
        String(64), nullable=False
    )  # e.g., "mark_task_done", "send_whatsapp", "create_task", "generate_chart_doc", "post_comment"
    action_config: Mapped[Dict[str, Any]] = mapped_column(
        JSONB, default=dict, nullable=False
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )


class AutomationExecutionLog(Base, UUIDPKMixin):
    """Historical audit log of executed automations."""

    __tablename__ = "execution_logs"
    __table_args__ = (
        Index("ix_automations_logs_rule", "rule_id", "executed_at"),
        {"schema": SCHEMA},
    )

    rule_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True, index=True
    )
    rule_name: Mapped[str] = mapped_column(String(200), nullable=False)
    trigger_event: Mapped[str] = mapped_column(String(64), nullable=False)
    payload_json: Mapped[Dict[str, Any]] = mapped_column(
        JSONB, default=dict, nullable=False
    )
    status: Mapped[str] = mapped_column(
        String(24), nullable=False
    )  # success, failed, skipped
    result_summary: Mapped[str] = mapped_column(String(1000), nullable=False)
    executed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
