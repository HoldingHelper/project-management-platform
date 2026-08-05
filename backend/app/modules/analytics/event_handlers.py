"""Subscribes the Analytics module to the universal audit event stream."""

from __future__ import annotations

import structlog

from app.core.database import AsyncSessionLocal
from app.core.events import event_bus
from app.modules.analytics import repository as repo
from app.modules.analytics.models import AuditLog
from app.shared.events import AuditableChangeOccurred

logger = structlog.get_logger(__name__)


async def _handle_audit_event(event: AuditableChangeOccurred) -> None:
    async with AsyncSessionLocal() as db:
        entry = AuditLog(
            user_id=event.user_id,
            ip_address=event.ip_address,
            entity_type=event.entity_type,
            entity_id=event.entity_id,
            action_type=event.action_type,
            changes_json=event.changes_json,
            correlation_id=event.correlation_id,
        )
        await repo.insert_audit_log(db, entry)


def register_analytics_event_handlers() -> None:
    event_bus.subscribe(AuditableChangeOccurred, _handle_audit_event)
    logger.info("analytics_event_handlers_registered")
