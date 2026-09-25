"""Resource-scoped authorization for polymorphic collaboration entities.

Comments and file attachments store only ``(entity_type, entity_id)``. This
module resolves those pairs back to their owning aggregate and enforces the
same project/channel/notification boundaries as the owning module.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.current_user import CurrentUser
from app.core.exceptions import ForbiddenError, NotFoundError
from app.core.permissions import Permissions
from app.modules.blockers.models import Blocker
from app.modules.chat.models import Channel, ChannelMember, Message
from app.modules.collaboration.models import Comment, Notification
from app.modules.projects.models import (
    Milestone,
    Phase,
    Product,
    Project,
    ProjectDependency,
    ProjectMember,
    TaskAssignee,
    TaskDependency,
    TaskItem,
)

_PROJECT_WIDE_PERMISSIONS = {
    Permissions.PROJECTS_VIEW_ALL,
    Permissions.PROJECTS_MANAGE_ALL,
    Permissions.ANALYTICS_VIEW_ORG,
    Permissions.REPORTS_VIEW_EXECUTIVE,
}


def _can_view_all_projects(user: CurrentUser) -> bool:
    return user.is_super_admin() or user.has_any_permission(*_PROJECT_WIDE_PERMISSIONS)


async def _require_project_access(
    db: AsyncSession, user: CurrentUser, project_id: UUID
) -> None:
    project = await db.get(Project, project_id)
    if project is None:
        raise NotFoundError("Project", project_id)

    # Migrated projects use the holding graph as the canonical boundary for
    # REST, MCP, and WebSocket callers. Legacy checks remain only for rows not
    # yet backfilled, which makes rollout reversible.
    if getattr(project, "org_node_id", None) is not None:
        from app.modules.authz.service import authorize
        from app.modules.org.models import OrgNode

        node = await db.get(OrgNode, project.org_node_id)
        if node is None:
            raise NotFoundError("Organization node", project.org_node_id)
        await authorize(db, user, "view", node)
        return

    if _can_view_all_projects(user):
        return

    product = await db.get(Product, project.product_id)
    if product is not None and product.owner_user_id == user.user_id:
        return

    result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user.user_id,
        )
    )
    if result.scalar_one_or_none() is not None:
        return

    raise ForbiddenError("You do not have access to this project resource.")


async def _require_channel_access(
    db: AsyncSession, user: CurrentUser, channel_id: UUID
) -> None:
    channel = await db.get(Channel, channel_id)
    if channel is None:
        raise NotFoundError("Channel", channel_id)

    if user.is_super_admin():
        return

    result = await db.execute(
        select(ChannelMember).where(
            ChannelMember.channel_id == channel_id,
            ChannelMember.user_id == user.user_id,
        )
    )
    if result.scalar_one_or_none() is not None:
        return

    if channel.type == "project" and channel.project_id is not None:
        await _require_project_access(db, user, channel.project_id)
        return

    raise ForbiddenError("You are not a member of this channel.")


async def _require_task_access(
    db: AsyncSession, user: CurrentUser, task_id: UUID
) -> None:
    task = await db.get(TaskItem, task_id)
    if task is None:
        raise NotFoundError("Task", task_id)

    if task.phase_id is not None:
        phase = await db.get(Phase, task.phase_id)
        if phase is None:
            raise NotFoundError("Phase", task.phase_id)
        await _require_project_access(db, user, phase.project_id)
        return

    if user.is_super_admin() or user.has_any_permission(
        Permissions.TASKS_VIEW,
        Permissions.TASKS_MANAGE_ALL,
        Permissions.TASKS_MANAGE_TEAM,
    ):
        return

    if task.reviewer_user_id == user.user_id:
        return

    result = await db.execute(
        select(TaskAssignee).where(
            TaskAssignee.task_id == task_id,
            TaskAssignee.user_id == user.user_id,
        )
    )
    if result.scalar_one_or_none() is not None:
        return

    raise ForbiddenError("You do not have access to this task.")


async def _require_notification_access(
    db: AsyncSession, user: CurrentUser, notification_id: UUID
) -> None:
    notification = await db.get(Notification, notification_id)
    if notification is None or notification.user_id != user.user_id:
        raise NotFoundError("Notification", notification_id)


async def _require_comment_access(
    db: AsyncSession, user: CurrentUser, comment_id: UUID
) -> None:
    comment = await db.get(Comment, comment_id)
    if comment is None or comment.is_deleted:
        raise NotFoundError("Comment", comment_id)
    await authorize_entity_access(db, user, comment.entity_type, comment.entity_id)


async def _project_id_for_phase(db: AsyncSession, phase_id: UUID) -> UUID:
    phase = await db.get(Phase, phase_id)
    if phase is None:
        raise NotFoundError("Phase", phase_id)
    return phase.project_id


async def _project_id_for_milestone(db: AsyncSession, milestone_id: UUID) -> UUID:
    milestone = await db.get(Milestone, milestone_id)
    if milestone is None:
        raise NotFoundError("Milestone", milestone_id)
    return milestone.project_id


async def authorize_entity_access(
    db: AsyncSession, user: CurrentUser, entity_type: str, entity_id: UUID
) -> None:
    """Raise unless ``user`` may access the polymorphic entity."""

    kind = entity_type.strip().lower()

    if kind == "product":
        product = await db.get(Product, entity_id)
        if product is None:
            raise NotFoundError("Product", entity_id)
        if (
            _can_view_all_projects(user)
            or user.has_any_permission(
                Permissions.PRODUCTS_VIEW_ALL,
                Permissions.PRODUCTS_MANAGE_ALL,
            )
            or product.owner_user_id == user.user_id
        ):
            return
        result = await db.execute(
            select(ProjectMember)
            .join(Project, ProjectMember.project_id == Project.id)
            .where(
                Project.product_id == entity_id,
                ProjectMember.user_id == user.user_id,
            )
        )
        if result.scalar_one_or_none() is not None:
            return
        raise ForbiddenError("You do not have access to this product.")

    if kind == "project":
        await _require_project_access(db, user, entity_id)
        return

    if kind == "phase":
        await _require_project_access(
            db, user, await _project_id_for_phase(db, entity_id)
        )
        return

    if kind == "milestone":
        await _require_project_access(
            db, user, await _project_id_for_milestone(db, entity_id)
        )
        return

    if kind == "task":
        await _require_task_access(db, user, entity_id)
        return

    if kind == "blocker":
        blocker = await db.get(Blocker, entity_id)
        if blocker is None:
            raise NotFoundError("Blocker", entity_id)
        if user.user_id in {
            blocker.owner_user_id,
            blocker.reported_by_user_id,
            blocker.pending_on_user_id,
        }:
            return
        await _require_task_access(db, user, blocker.blocked_task_id)
        return

    if kind in {"channel", "chat_message", "chat_channel"}:
        await _require_channel_access(db, user, entity_id)
        return

    if kind == "message":
        message = await db.get(Message, entity_id)
        if message is None:
            raise NotFoundError("Message", entity_id)
        await _require_channel_access(db, user, message.channel_id)
        return

    if kind == "comment":
        await _require_comment_access(db, user, entity_id)
        return

    if kind == "notification_reply":
        await _require_notification_access(db, user, entity_id)
        return

    if kind == "task_dependency":
        dependency = await db.get(TaskDependency, entity_id)
        if dependency is None:
            raise NotFoundError("TaskDependency", entity_id)
        await _require_task_access(db, user, dependency.successor_task_id)
        return

    if kind == "project_dependency":
        dependency = await db.get(ProjectDependency, entity_id)
        if dependency is None:
            raise NotFoundError("ProjectDependency", entity_id)
        await _require_project_access(db, user, dependency.predecessor_project_id)
        await _require_project_access(db, user, dependency.successor_project_id)
        return

    raise ForbiddenError(f"Unsupported collaboration entity type: {entity_type}.")
