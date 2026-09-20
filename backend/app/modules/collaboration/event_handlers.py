"""Subscribes Collaboration's handlers to cross-module integration events.

Registered once at application startup (see `app.main`). Each handler opens
its own short-lived DB session since event handlers run outside of any
HTTP request's dependency-injected session.
"""

from __future__ import annotations

import structlog

from app.core.database import AsyncSessionLocal
from app.core.events import event_bus
from app.core.websocket_manager import connection_manager
from app.modules.collaboration import service
from app.shared.events import (
    BlockerRaised,
    CommentAdded,
    NotificationRequested,
    ProjectMemberAdded,
    ProjectStatusChanged,
    TaskAssigned,
    TaskDependencyCreated,
    TaskStatusChanged,
)

logger = structlog.get_logger(__name__)


async def _handle_notification_requested(event: NotificationRequested) -> None:
    async with AsyncSessionLocal() as db:
        notification = await service.create_notification_from_event(db, event)
    await connection_manager.send_to_user(
        event.user_id,
        "notification.created",
        {
            "id": str(notification.id),
            "type": event.type,
            "title": event.title,
            "body": event.body,
            "link": event.link,
            "requiresAction": event.requires_action,
        },
    )


async def _handle_task_assigned(event: TaskAssigned) -> None:
    task_desc = f'"{event.task_title}"' if event.task_title else "A new task"
    proj_suffix = f" in {event.project_name}" if event.project_name else ""
    for user_id in event.assignee_user_ids:
        await event_bus.publish(
            NotificationRequested(
                user_id=user_id,
                type="ticket_assigned" if event.is_ticket else "task_assigned",
                title="A ticket needs your attention" if event.is_ticket else "You were assigned a task",
                body=(
                    f"Ticket {task_desc}{proj_suffix} was sent to you."
                    if event.is_ticket
                    else f"Task {task_desc}{proj_suffix} was assigned to you."
                ),
                link=f"/tasks/{event.task_id}",
                entity_type="task",
                entity_id=event.task_id,
                requires_action=event.is_ticket,
            )
        )


async def _handle_task_status_changed(event: TaskStatusChanged) -> None:
    await connection_manager.broadcast_to_group(
        f"project-{event.project_id}",
        "task.status_changed",
        {
            "taskId": str(event.task_id),
            "phaseId": str(event.phase_id),
            "oldStatus": event.old_status,
            "newStatus": event.new_status,
        },
    )


async def _handle_blocker_raised(event: BlockerRaised) -> None:
    blocker_label = f'"{event.title}"' if event.title else (f'"{event.task_title}"' if event.task_title else "A task")
    reason_part = f" Details: {event.description}" if event.description else ""
    await event_bus.publish(
        NotificationRequested(
            user_id=event.pending_on_user_id,
            type="blocker_raised",
            title="A blocker is pending on you",
            body=f"Blocker on {blocker_label} is waiting on your action.{reason_part}",
            link=f"/tasks/{event.task_id}",
            entity_type="blocker",
            entity_id=event.blocker_id,
            requires_action=True,
        )
    )


async def _handle_dependency_created(event: TaskDependencyCreated) -> None:
    succ_name = f'"{event.successor_title}"' if event.successor_title else "Your task"
    pred_name = f'"{event.predecessor_title}"' if event.predecessor_title else "a predecessor task"
    for user_id in event.successor_assignee_user_ids:
        await event_bus.publish(
            NotificationRequested(
                user_id=user_id,
                type="dependency_assigned",
                title="Your task gained a dependency",
                body=f"{succ_name} now depends on {pred_name}.",
                link=f"/tasks/{event.successor_task_id}",
                entity_type="task",
                entity_id=event.successor_task_id,
            )
        )


async def _handle_project_status_changed(event: ProjectStatusChanged) -> None:
    for user_id in event.member_user_ids:
        await event_bus.publish(
            NotificationRequested(
                user_id=user_id,
                type="project_update",
                title=f"Project '{event.name}' is now {event.new_status}",
                body=(
                    f"Status changed from {event.old_status} to "
                    f"{event.new_status}."
                ),
                link=f"/projects/{event.project_id}",
                entity_type="project",
                entity_id=event.project_id,
            )
        )


async def _handle_project_member_added(event: ProjectMemberAdded) -> None:
    proj_label = f'"{event.project_name}"' if event.project_name else "the project"
    await event_bus.publish(
        NotificationRequested(
            user_id=event.user_id,
            type="project_member_added",
            title="You were added to a project",
            body=f"You were added to {proj_label} as {event.role}.",
            link=f"/projects/{event.project_id}",
            entity_type="project",
            entity_id=event.project_id,
        )
    )


async def _handle_comment_added(event: CommentAdded) -> None:
    await connection_manager.broadcast_to_group(
        f"{event.entity_type.lower()}-{event.entity_id}",
        "comment.added",
        {
            "entityType": event.entity_type,
            "entityId": str(event.entity_id),
            "authorUserId": str(event.author_user_id),
        },
    )


def register_collaboration_event_handlers() -> None:
    event_bus.subscribe(NotificationRequested, _handle_notification_requested)
    event_bus.subscribe(TaskAssigned, _handle_task_assigned)
    event_bus.subscribe(TaskStatusChanged, _handle_task_status_changed)
    event_bus.subscribe(BlockerRaised, _handle_blocker_raised)
    event_bus.subscribe(CommentAdded, _handle_comment_added)
    event_bus.subscribe(TaskDependencyCreated, _handle_dependency_created)
    event_bus.subscribe(ProjectStatusChanged, _handle_project_status_changed)
    event_bus.subscribe(ProjectMemberAdded, _handle_project_member_added)
    logger.info("collaboration_event_handlers_registered")
