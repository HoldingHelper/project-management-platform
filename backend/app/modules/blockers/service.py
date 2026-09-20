"""Blockers module business logic, including the "Pending On Me" / "Pending
On Others" workflow described in architecture spec section 5.3.

Cross-module reads use direct, in-process calls into the owning module's
`service` functions (the sanctioned monolith-internal coupling point -- see
docs/MODULE_GUIDE.md) rather than duplicating Projects' tables here.
"""

from __future__ import annotations

from datetime import date
from typing import List
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.events import event_bus
from app.core.exceptions import BusinessRuleError, NotFoundError
from app.modules.blockers import repository as repo
from app.modules.blockers.models import Blocker
from app.modules.blockers.models import BLOCK_REASON_VALUES
from app.modules.blockers.schemas import (
    BlockerCreate,
    BlockerRead,
    BlockerResolve,
    BlockerUpdate,
    PendingOnMeItem,
    PendingOnOthersItem,
    UserPendingWork,
)
from app.modules.projects.enums import PENDING_REVIEW_STATUSES
from app.modules.projects.service import (
    get_blocked_tasks_with_incomplete_predecessors,
    get_tasks_by_assignee,
)
from app.shared.events import BlockerRaised, BlockerResolved


async def create_blocker(
    db: AsyncSession, reported_by_user_id: UUID, payload: BlockerCreate
) -> BlockerRead:
    blocker = Blocker(
        title=payload.title,
        description=payload.description,
        severity=payload.severity,
        priority=payload.priority,
        blocked_task_id=payload.blocked_task_id,
        owner_user_id=payload.owner_user_id,
        reported_by_user_id=reported_by_user_id,
        pending_on_user_id=payload.pending_on_user_id,
        block_reason=payload.block_reason,
        estimated_unblock_date=payload.estimated_unblock_date,
        expected_resolution_date=payload.expected_resolution_date,
        status="Open",
    )
    blocker = await repo.create_blocker(db, blocker)

    await event_bus.publish(
        BlockerRaised(
            blocker_id=blocker.id,
            task_id=blocker.blocked_task_id,
            pending_on_user_id=blocker.pending_on_user_id,
            severity=blocker.severity,
            title=blocker.title,
            description=blocker.description,
        )
    )
    return BlockerRead.model_validate(blocker)


async def update_blocker(
    db: AsyncSession, blocker_id: UUID, payload: BlockerUpdate
) -> BlockerRead:
    blocker = await repo.get_blocker(db, blocker_id)
    if blocker is None:
        raise NotFoundError("Blocker", blocker_id)
    if blocker.status in ("Resolved", "Cancelled"):
        raise BusinessRuleError(f"Blocker is already {blocker.status}.")

    data = payload.model_dump(exclude_unset=True, mode="json")
    new_status = data.get("status")
    if new_status is not None and new_status not in ("Open", "InProgress"):
        raise BusinessRuleError(
            "Status can only be set to Open or InProgress here; use /resolve."
        )
    reason = data.get("block_reason")
    if reason is not None and reason not in BLOCK_REASON_VALUES:
        raise BusinessRuleError(
            f"block_reason must be one of {', '.join(BLOCK_REASON_VALUES)}."
        )

    old_pending_on = blocker.pending_on_user_id
    for field, value in data.items():
        setattr(blocker, field, value)
    await db.commit()
    await db.refresh(blocker)

    if blocker.pending_on_user_id != old_pending_on:
        # Reassigned to a new responsible person -- notify them.
        await event_bus.publish(
            BlockerRaised(
                blocker_id=blocker.id,
                task_id=blocker.blocked_task_id,
                pending_on_user_id=blocker.pending_on_user_id,
                severity=blocker.severity,
                title=blocker.title,
                description=blocker.description,
            )
        )
    return BlockerRead.model_validate(blocker)


async def resolve_blocker(
    db: AsyncSession, blocker_id: UUID, payload: BlockerResolve
) -> BlockerRead:
    blocker = await repo.get_blocker(db, blocker_id)
    if blocker is None:
        raise NotFoundError("Blocker", blocker_id)
    if blocker.status in ("Resolved", "Cancelled"):
        raise BusinessRuleError(f"Blocker is already {blocker.status}.")

    blocker.status = "Resolved"
    blocker.actual_resolution_date = payload.actual_resolution_date or date.today()
    await db.commit()
    await db.refresh(blocker)

    await event_bus.publish(
        BlockerResolved(blocker_id=blocker.id, task_id=blocker.blocked_task_id)
    )
    return BlockerRead.model_validate(blocker)


async def list_blockers(
    db: AsyncSession, status: str | None = None
) -> List[BlockerRead]:
    blockers = await repo.list_blockers(db, status=status)
    return [BlockerRead.model_validate(b) for b in blockers]


async def get_user_pending_work(db: AsyncSession, user_id: UUID) -> UserPendingWork:
    """Answers both:
    - "Who is waiting for my work?" (Pending On Me): open blockers where I'm
      the bottleneck, plus my own tasks sitting in Review/Testing/Waiting.
    - "Why is my work delayed, and who do I need to follow up with?"
      (Pending On Others): my tasks stalled on an incomplete predecessor.
    """
    open_blockers = await repo.list_open_blockers_pending_on(db, user_id)
    pending_on_me: List[PendingOnMeItem] = [
        PendingOnMeItem(
            kind="blocker",
            id=b.id,
            title=b.title,
            project_id=None,
            priority=b.priority,
            detail=f"Blocker reported by {b.reported_by_user_id} · severity {b.severity}",
        )
        for b in open_blockers
    ]

    review_tasks = await get_tasks_by_assignee(
        db, user_id, statuses=list(PENDING_REVIEW_STATUSES)
    )
    pending_on_me.extend(
        PendingOnMeItem(
            kind="review_task",
            id=t.task_id,
            title=t.title,
            project_id=t.project_id,
            priority="P2",
            detail=f"Task is in status '{t.status}' awaiting your action",
        )
        for t in review_tasks
    )

    blocked_info = await get_blocked_tasks_with_incomplete_predecessors(db, user_id)
    pending_on_others = [
        PendingOnOthersItem(
            task_id=item["task_id"],
            title=item["title"],
            project_id=item["project_id"],
            pending_on_user_ids=[],
            reason=f"{len(item['incomplete_predecessor_task_ids'])} predecessor task(s) not yet complete",
        )
        for item in blocked_info
    ]

    return UserPendingWork(
        pending_on_me=pending_on_me, pending_on_others=pending_on_others
    )


async def count_open_blockers_by_user(db: AsyncSession):
    """Cross-module contract consumed by Analytics for departmental
    bottleneck aggregation."""
    return await repo.count_open_blockers_by_user(db)


async def count_open_blockers_for_tasks(
    db: AsyncSession, task_ids: List[UUID]
) -> int:
    """Cross-module contract consumed by Projects' overview aggregate."""
    return await repo.count_open_blockers_for_tasks(db, task_ids)
