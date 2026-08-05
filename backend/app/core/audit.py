"""Universal audit-logging interceptor.

Mirrors the .NET `SaveChangesInterceptor` design from the architecture spec:
whenever a SQLAlchemy `Session` (including the sync session that backs every
`AsyncSession`) flushes changes for an entity opted into auditing (via the
`__auditable__ = True` class attribute), a JSON diff is captured and
published as an `AuditableChangeOccurred` event through the in-process event
bus -- asynchronously and without blocking the HTTP response. The Analytics
module subscribes a handler that persists these into `analytics.audit_logs`.
"""

from __future__ import annotations

import json
from typing import Any, List, Tuple

from sqlalchemy import event
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import get_history

from app.core.events import event_bus
from app.core.request_context import (
    client_ip_var,
    correlation_id_var,
    current_user_id_var,
)
from app.shared.events import AuditableChangeOccurred

_PENDING_KEY = "_pending_audit_entries"


def _entity_type(obj: Any) -> str:
    module_parts = obj.__class__.__module__.split(".")
    module_name = (
        module_parts[-2] if len(module_parts) >= 2 else obj.__class__.__module__
    )
    return f"{module_name}.{obj.__class__.__name__}"


def _serialisable(value: Any) -> Any:
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


def _diff_for_update(obj: Any) -> dict:
    diffs: dict[str, Any] = {}
    for attr in obj.__mapper__.column_attrs:
        hist = get_history(obj, attr.key)
        if hist.has_changes() and (hist.added or hist.deleted):
            old_value = hist.deleted[0] if hist.deleted else None
            new_value = hist.added[0] if hist.added else getattr(obj, attr.key, None)
            if old_value != new_value:
                diffs[attr.key] = {
                    "old": _serialisable(old_value),
                    "new": _serialisable(new_value),
                }
    return diffs


def register_audit_listeners() -> None:
    @event.listens_for(Session, "before_flush")
    def _before_flush(session: Session, flush_context, instances) -> None:  # noqa: ANN001
        pending: List[Tuple[str, Any, dict]] = session.info.setdefault(_PENDING_KEY, [])

        for obj in session.new:
            if getattr(obj, "__auditable__", False):
                pending.append(("Create", obj, {}))

        for obj in session.dirty:
            if getattr(obj, "__auditable__", False) and session.is_modified(
                obj, include_collections=False
            ):
                diff = _diff_for_update(obj)
                if diff:
                    pending.append(("Update", obj, diff))

        for obj in session.deleted:
            if getattr(obj, "__auditable__", False):
                pending.append(("Delete", obj, {}))

    @event.listens_for(Session, "after_commit")
    def _after_commit(session: Session) -> None:  # noqa: ANN001
        pending: List[Tuple[str, Any, dict]] = session.info.pop(_PENDING_KEY, [])
        for action_type, obj, diff in pending:
            audit_event = AuditableChangeOccurred(
                entity_type=_entity_type(obj),
                entity_id=str(getattr(obj, "id", "")),
                action_type=action_type,
                changes_json=json.dumps(diff, default=str),
                user_id=current_user_id_var.get(),
                ip_address=client_ip_var.get(),
                correlation_id=correlation_id_var.get(),
            )
            event_bus.publish_sync_fire_and_forget(audit_event)

    @event.listens_for(Session, "after_rollback")
    def _after_rollback(session: Session) -> None:  # noqa: ANN001
        session.info.pop(_PENDING_KEY, None)
