"""Cross-module integration events (the Python equivalent of the
`ProjectPlatform.Contracts` MediatR notifications). These are the ONLY objects
one module may share with another at runtime via `app.core.events.event_bus`;
modules must never import each other's `models.py`/`repository.py`.

Additive-only: never remove/rename a field once another module depends on it.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import List, Optional
from uuid import UUID


def _now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass(frozen=True)
class TaskStatusChanged:
    task_id: UUID
    # None for standalone (imported/backlog) tasks not yet attached to a phase.
    project_id: Optional[UUID]
    phase_id: Optional[UUID]
    old_status: str
    new_status: str
    occurred_at: datetime = field(default_factory=_now)


@dataclass(frozen=True)
class TaskAssigned:
    task_id: UUID
    assignee_user_ids: List[UUID]
    occurred_at: datetime = field(default_factory=_now)


@dataclass(frozen=True)
class BlockerRaised:
    blocker_id: UUID
    task_id: UUID
    pending_on_user_id: UUID
    severity: str
    occurred_at: datetime = field(default_factory=_now)


@dataclass(frozen=True)
class BlockerResolved:
    blocker_id: UUID
    task_id: UUID
    occurred_at: datetime = field(default_factory=_now)


@dataclass(frozen=True)
class CommentAdded:
    entity_type: str
    entity_id: UUID
    author_user_id: UUID
    mentioned_user_ids: List[UUID]
    occurred_at: datetime = field(default_factory=_now)


@dataclass(frozen=True)
class AuditableChangeOccurred:
    entity_type: str
    entity_id: str
    action_type: str
    changes_json: str
    user_id: Optional[UUID] = None
    ip_address: Optional[str] = None
    correlation_id: Optional[str] = None
    occurred_at: datetime = field(default_factory=_now)


@dataclass(frozen=True)
class UserProvisioned:
    user_id: UUID
    email: str
    full_name: str
    occurred_at: datetime = field(default_factory=_now)


@dataclass(frozen=True)
class NotificationRequested:
    """Raised by any module to ask Collaboration to persist + push a
    user-facing notification."""

    user_id: UUID
    type: str
    title: str
    body: str
    link: Optional[str] = None
    # Source entity for reply routing / actionable items.
    entity_type: Optional[str] = None
    entity_id: Optional[UUID] = None
    requires_action: bool = False
    occurred_at: datetime = field(default_factory=_now)


@dataclass(frozen=True)
class ProjectCreated:
    project_id: UUID
    name: str
    created_by_user_id: Optional[UUID]
    member_user_ids: List[UUID] = field(default_factory=list)
    occurred_at: datetime = field(default_factory=_now)


@dataclass(frozen=True)
class ProjectMemberAdded:
    project_id: UUID
    user_id: UUID
    role: str
    occurred_at: datetime = field(default_factory=_now)


@dataclass(frozen=True)
class ProjectMemberRemoved:
    project_id: UUID
    user_id: UUID
    occurred_at: datetime = field(default_factory=_now)


@dataclass(frozen=True)
class ProjectStatusChanged:
    project_id: UUID
    name: str
    old_status: str
    new_status: str
    member_user_ids: List[UUID] = field(default_factory=list)
    occurred_at: datetime = field(default_factory=_now)


@dataclass(frozen=True)
class TaskDependencyCreated:
    predecessor_task_id: UUID
    successor_task_id: UUID
    successor_assignee_user_ids: List[UUID] = field(default_factory=list)
    occurred_at: datetime = field(default_factory=_now)


@dataclass(frozen=True)
class ChatMessageSent:
    message_id: UUID
    channel_id: UUID
    sender_user_id: UUID
    mentioned_user_ids: List[UUID] = field(default_factory=list)
    occurred_at: datetime = field(default_factory=_now)


@dataclass(frozen=True)
class PresenceChanged:
    user_id: UUID
    status: str
    occurred_at: datetime = field(default_factory=_now)
