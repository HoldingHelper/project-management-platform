"""Projects module business logic: Products, Projects, Phases, Tasks and the
DAG-governed Task Dependencies, plus progress/critical-path recalculation."""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta, timezone
from typing import List, Optional
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.events import event_bus
from app.core.current_user import CurrentUser
from app.core.exceptions import BusinessRuleError, ForbiddenError, NotFoundError, ValidationAppError
from app.core.permissions import Permissions
from app.modules.collaboration.authorization import (
    _can_view_all_projects,
    _require_project_access,
    _require_task_access,
)
from app.modules.projects import repository as repo
from app.modules.projects.critical_path import (
    CpmEdge,
    CpmTask,
    compute_critical_path,
    hours_to_days,
)
from app.modules.projects.dag import would_create_cycle
from app.modules.projects.enums import PhaseType, ProjectStatus, TaskStatus
from app.modules.projects.models import (
    ChecklistItem,
    Milestone,
    Phase,
    Product,
    Project,
    ProjectDependency,
    ProjectMember,
    TaskDependency,
    TaskItem,
    TaskPartition,
)
from app.modules.projects.progress import (
    TaskProgressInput,
    calculate_phase_progress,
    calculate_project_progress,
    is_task_done,
    progress_breakdown,
)
from app.modules.projects.schemas import (
    GanttLinkRow,
    GanttTaskRow,
    MilestoneCreate,
    MilestoneRead,
    MilestoneUpdate,
    PhaseCreate,
    PhaseRead,
    PhaseUpdate,
    PortfolioGantt,
    PortfolioGanttProject,
    ProductCreate,
    ProductRead,
    ProductUpdate,
    ProgressBreakdown,
    ProjectCreate,
    ProjectAdminTransfer,
    ProjectDependencyCreate,
    ProjectDependencyRead,
    ProjectMemberCreate,
    ProjectMemberRead,
    ProjectOverview,
    ProjectRead,
    ProjectSprintCreate,
    ProjectSummary,
    ProjectTimeline,
    ProjectUpdate,
    TaskCreate,
    TaskDependencyCreate,
    TaskDependencyRead,
    TaskRead,
    TaskPartitionCreate,
    TaskPartitionRead,
    TaskPartitionUpdate,
    TaskStats,
    TaskSummary,
    TaskUpdate,
    UpcomingDeadline,
)
from app.shared.events import (
    ProjectCreated,
    ProjectMemberAdded,
    ProjectMemberRemoved,
    ProjectStatusChanged,
    TaskAssigned,
    TaskDependencyCreated,
    TaskStatusChanged,
)


def _partition_slug(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-")
    if not slug:
        raise ValidationAppError("Partition name must contain letters or numbers.")
    return slug[:32].rstrip("-")


async def _partition_read(
    db: AsyncSession, partition: TaskPartition
) -> TaskPartitionRead:
    task_count, project_count = await repo.partition_usage_counts(db, partition.slug)
    row = TaskPartitionRead.model_validate(partition)
    row.task_count = task_count
    row.project_count = project_count
    return row


async def list_task_partitions(db: AsyncSession) -> List[TaskPartitionRead]:
    rows = await repo.list_task_partitions(db)
    return [await _partition_read(db, row) for row in rows]


async def create_task_partition(
    db: AsyncSession, payload: TaskPartitionCreate
) -> TaskPartitionRead:
    name = payload.name.strip()
    slug = _partition_slug(name)
    if await repo.get_task_partition_by_name(db, name) is not None:
        raise BusinessRuleError(f"Partition '{name}' already exists.")
    if await repo.get_task_partition_by_slug(db, slug) is not None:
        raise BusinessRuleError(
            "A partition with the same URL-safe name already exists."
        )
    partition = TaskPartition(
        name=name,
        slug=slug,
        description=payload.description,
        display_order=payload.display_order,
    )
    db.add(partition)
    await db.commit()
    await db.refresh(partition)
    return await _partition_read(db, partition)


async def update_task_partition(
    db: AsyncSession, partition_id: UUID, payload: TaskPartitionUpdate
) -> TaskPartitionRead:
    partition = await repo.get_task_partition(db, partition_id)
    if partition is None:
        raise NotFoundError("TaskPartition", partition_id)
    changes = payload.model_dump(exclude_unset=True)
    if "name" in changes:
        name = changes["name"].strip()
        duplicate = await repo.get_task_partition_by_name(db, name)
        if duplicate is not None and duplicate.id != partition.id:
            raise BusinessRuleError(f"Partition '{name}' already exists.")
        changes["name"] = name
    for field, value in changes.items():
        setattr(partition, field, value)
    await db.commit()
    await db.refresh(partition)
    return await _partition_read(db, partition)


async def delete_task_partition(
    db: AsyncSession,
    partition_id: UUID,
    replacement_partition_id: Optional[UUID] = None,
) -> None:
    partition = await repo.get_task_partition(db, partition_id)
    if partition is None:
        raise NotFoundError("TaskPartition", partition_id)
    replacement_slug: Optional[str] = None
    if replacement_partition_id is not None:
        if replacement_partition_id == partition_id:
            raise ValidationAppError("A partition cannot replace itself.")
        replacement = await repo.get_task_partition(db, replacement_partition_id)
        if replacement is None:
            raise NotFoundError("TaskPartition", replacement_partition_id)
        replacement_slug = replacement.slug
    await repo.replace_partition_references(db, partition.slug, replacement_slug)
    await repo.delete_task_partition(db, partition)
    await db.commit()


def _dump(payload, **kwargs) -> dict:
    """model_dump that keeps dates/UUIDs as Python objects (asyncpg cannot
    bind ISO strings to DATE columns) while flattening Enums to their values."""
    from enum import Enum

    data = payload.model_dump(**kwargs)
    return {k: (v.value if isinstance(v, Enum) else v) for k, v in data.items()}


SPRINT_DURATION_DAYS = 14


def _validate_project_date_baseline(
    start_date: date | None,
    end_date: date | None,
) -> None:
    if (start_date is None) != (end_date is None):
        raise ValidationAppError(
            "Project start and end dates must be set together.",
            errors={"planned_dates": ["Set both planned dates or leave both empty."]},
        )
    if start_date and end_date and end_date < start_date:
        raise ValidationAppError(
            "Project end date cannot be before its start date.",
            errors={"end_date": ["Choose a date on or after the start date."]},
        )


def _validate_sprint_window(start_date: date, end_date: date) -> None:
    if (end_date - start_date).days != SPRINT_DURATION_DAYS - 1:
        raise ValidationAppError(
            "A sprint must span exactly 14 calendar days.",
            errors={"end_date": ["Choose the inclusive date 13 days after the start."]},
        )


def _derived_project_status(project: Project, tasks: list[TaskItem]) -> str:
    """Keep lifecycle status aligned with observable work.

    Explicit terminal/paused states remain authoritative. A stale Not Started
    status becomes In Progress once planned work has begun.
    """
    if project.status in {
        ProjectStatus.ARCHIVED.value,
        ProjectStatus.CANCELLED.value,
        ProjectStatus.ON_HOLD.value,
    }:
        return project.status
    if project.actual_completion_date is not None or (
        tasks and all(is_task_done(task.status) for task in tasks)
    ):
        return ProjectStatus.COMPLETED.value
    work_started = any(
        task.status
        not in {
            TaskStatus.NOT_STARTED.value,
            TaskStatus.READY.value,
            TaskStatus.CANCELLED.value,
            TaskStatus.ARCHIVED.value,
        }
        for task in tasks
    )
    scheduled_started = bool(project.start_date and project.start_date <= date.today())
    if work_started or scheduled_started or float(project.progress_percentage or 0) > 0:
        return ProjectStatus.IN_PROGRESS.value
    return ProjectStatus.NOT_STARTED.value


# ---------- Products ----------
async def create_product(db: AsyncSession, payload: ProductCreate) -> ProductRead:
    product = Product(**_dump(payload))
    product = await repo.create_product(db, product)
    return ProductRead.model_validate(product)


async def get_product(db: AsyncSession, product_id: UUID) -> ProductRead:
    product = await repo.get_product(db, product_id)
    if product is None:
        raise NotFoundError("Product", product_id)
    return ProductRead.model_validate(product)


async def update_product(
    db: AsyncSession, product_id: UUID, payload: ProductUpdate
) -> ProductRead:
    product = await repo.get_product(db, product_id)
    if product is None:
        raise NotFoundError("Product", product_id)
    for field, value in _dump(payload, exclude_unset=True).items():
        setattr(product, field, value)
    await db.commit()
    await db.refresh(product)
    return ProductRead.model_validate(product)


async def list_products(
    db: AsyncSession, page: int, page_size: int
) -> tuple[List[ProductRead], int]:
    products, total = await repo.list_products(db, (page - 1) * page_size, page_size)
    return [ProductRead.model_validate(p) for p in products], total


# ---------- Projects ----------
async def create_project(
    db: AsyncSession,
    payload: ProjectCreate,
    created_by_user_id: Optional[UUID] = None,
) -> ProjectRead:
    product = await repo.get_product(db, payload.product_id)
    if product is None:
        raise NotFoundError("Product", payload.product_id)
    data = _dump(payload, exclude={"sprints"})
    _validate_project_date_baseline(data.get("start_date"), data.get("end_date"))
    project = Project(**data, planning_mode="sprints")
    if project.actual_completion_date:
        project.status = ProjectStatus.COMPLETED.value
    elif (
        project.status == ProjectStatus.NOT_STARTED.value
        and project.start_date
        and project.start_date <= date.today()
    ):
        project.status = ProjectStatus.IN_PROGRESS.value
    db.add(project)
    await db.flush()

    sprint_inputs = list(payload.sprints)
    if not sprint_inputs:
        sprint_start = project.start_date or date.today()
        sprint_inputs = [
            ProjectSprintCreate(
                name="Sprint 1",
                start_date=sprint_start,
                end_date=sprint_start + timedelta(days=SPRINT_DURATION_DAYS - 1),
            )
        ]
    for sequence, sprint in enumerate(sprint_inputs, start=1):
        db.add(
            Phase(
                project_id=project.id,
                name=sprint.name,
                phase_type=PhaseType.DEVELOPMENT.value,
                sequence=sequence,
                start_date=sprint.start_date,
                end_date=sprint.end_date,
                lead_assignee_user_id=sprint.lead_assignee_user_id,
                is_sprint=True,
            )
        )

    member_ids: List[UUID] = []
    if created_by_user_id is not None:
        db.add(
            ProjectMember(
                project_id=project.id,
                user_id=created_by_user_id,
                role="ProjectManager",
            ),
        )
        member_ids.append(created_by_user_id)

    await db.commit()
    await db.refresh(project)

    await event_bus.publish(
        ProjectCreated(
            project_id=project.id,
            name=project.name,
            created_by_user_id=created_by_user_id,
            member_user_ids=member_ids,
        )
    )
    return ProjectRead.model_validate(project)


async def get_project(db: AsyncSession, project_id: UUID) -> ProjectRead:
    project = await repo.get_project(db, project_id)
    if project is None:
        raise NotFoundError("Project", project_id)
    return ProjectRead.model_validate(project)


async def update_project(
    db: AsyncSession, project_id: UUID, payload: ProjectUpdate
) -> ProjectRead:
    project = await repo.get_project(db, project_id)
    if project is None:
        raise NotFoundError("Project", project_id)
    if payload.product_id is not None and payload.product_id != project.product_id:
        product = await repo.get_product(db, payload.product_id)
        if product is None:
            raise NotFoundError("Product", payload.product_id)
    update_data = _dump(payload, exclude_unset=True)
    fields_set = payload.model_fields_set
    planned_dates_locked = project.start_date is not None and project.end_date is not None
    if planned_dates_locked:
        attempted_change = (
            "start_date" in fields_set and update_data.get("start_date") != project.start_date
        ) or (
            "end_date" in fields_set and update_data.get("end_date") != project.end_date
        )
        if attempted_change:
            raise BusinessRuleError(
                "Planned start and end dates are locked after they are first set. "
                "Update the actual end date instead."
            )

    next_start = update_data.get("start_date", project.start_date)
    next_end = update_data.get("end_date", project.end_date)
    if "start_date" in fields_set or "end_date" in fields_set:
        _validate_project_date_baseline(next_start, next_end)
    if (
        "actual_completion_date" in fields_set
        and update_data.get("actual_completion_date") is not None
        and not (next_start and next_end)
    ):
        raise BusinessRuleError(
            "Actual end date can only be set after planned start and end dates exist."
        )

    old_status = project.status
    for field, value in update_data.items():
        setattr(project, field, value)
    if (
        "actual_completion_date" in fields_set
        and project.actual_completion_date is not None
        and "status" not in fields_set
    ):
        project.status = ProjectStatus.COMPLETED.value
    elif project.status == ProjectStatus.NOT_STARTED.value:
        tasks = list(await repo.list_tasks_by_project(db, project.id))
        project.status = _derived_project_status(project, tasks)
    await db.commit()
    await db.refresh(project)

    if project.status != old_status:
        members = await repo.list_project_members(db, project_id)
        await event_bus.publish(
            ProjectStatusChanged(
                project_id=project.id,
                name=project.name,
                old_status=old_status,
                new_status=project.status,
                member_user_ids=[m.user_id for m in members],
            )
        )
    return ProjectRead.model_validate(project)


async def archive_project(db: AsyncSession, project_id: UUID) -> ProjectRead:
    project = await repo.get_project(db, project_id)
    if project is None:
        raise NotFoundError("Project", project_id)
    old_status = project.status
    project.status = ProjectStatus.ARCHIVED.value
    project.last_modified_by = "manual"
    await db.commit()
    await db.refresh(project)
    if old_status != project.status:
        members = await repo.list_project_members(db, project_id)
        await event_bus.publish(
            ProjectStatusChanged(
                project_id=project.id,
                name=project.name,
                old_status=old_status,
                new_status=project.status,
                member_user_ids=[m.user_id for m in members],
            )
        )
    return ProjectRead.model_validate(project)


async def _delete_entity_artifacts(
    db: AsyncSession,
    *,
    project_ids: list[UUID] | None = None,
    task_ids: list[UUID] | None = None,
) -> None:
    from app.modules.blockers.models import Blocker
    from app.modules.collaboration.models import Comment, FileAttachment, Notification

    project_ids = project_ids or []
    task_ids = task_ids or []

    if task_ids:
        await db.execute(delete(Blocker).where(Blocker.blocked_task_id.in_(task_ids)))

    entity_pairs: list[tuple[str, list[UUID]]] = []
    if project_ids:
        entity_pairs.append(("project", project_ids))
    if task_ids:
        entity_pairs.append(("task", task_ids))

    for entity_type, ids in entity_pairs:
        await db.execute(
            delete(Comment).where(
                Comment.entity_type == entity_type,
                Comment.entity_id.in_(ids),
            )
        )
        await db.execute(
            delete(FileAttachment).where(
                FileAttachment.entity_type == entity_type,
                FileAttachment.entity_id.in_(ids),
            )
        )
        await db.execute(
            delete(Notification).where(
                Notification.entity_type == entity_type,
                Notification.entity_id.in_(ids),
            )
        )


async def delete_project(db: AsyncSession, project_id: UUID) -> None:
    project = await repo.get_project(db, project_id)
    if project is None:
        raise NotFoundError("Project", project_id)

    tasks = await repo.list_tasks_by_project(db, project_id)
    await _delete_entity_artifacts(
        db,
        project_ids=[project_id],
        task_ids=[task.id for task in tasks],
    )
    await repo.delete_project(db, project)


async def list_projects_by_product(
    db: AsyncSession, product_id: UUID, page: int, page_size: int
) -> tuple[List[ProjectRead], int]:
    projects, total = await repo.list_projects_by_product(
        db, product_id, (page - 1) * page_size, page_size
    )
    return [ProjectRead.model_validate(p) for p in projects], total


async def list_all_projects(
    db: AsyncSession,
    page: int,
    page_size: int,
    current_user: Optional[CurrentUser] = None,
) -> tuple[List[ProjectRead], int]:
    user_id = None
    if current_user is not None and not _can_view_all_projects(current_user):
        user_id = current_user.user_id
    projects, total = await repo.list_all_projects(
        db, (page - 1) * page_size, page_size, user_id=user_id
    )
    return [ProjectRead.model_validate(p) for p in projects], total


async def require_project_manage_access(
    db: AsyncSession, project_id: UUID, current_user: CurrentUser
) -> None:
    """Ensure caller has permission to mutate a project (C-4)."""
    if current_user.is_super_admin() or current_user.has_permission(
        Permissions.PROJECTS_MANAGE_ALL
    ):
        return
    if not current_user.has_permission(Permissions.PROJECTS_MANAGE_ASSIGNED):
        raise ForbiddenError("You do not have permission to manage projects.")
    role = await repo.get_project_member_role(db, project_id, current_user.user_id)
    if role not in ("ProjectManager", "TeamLead"):
        raise ForbiddenError("You are not an assigned manager for this project.")


async def require_project_admin(
    db: AsyncSession, project_id: UUID, current_user: CurrentUser
) -> None:
    if current_user.is_super_admin() or current_user.has_permission(
        Permissions.PROJECTS_MANAGE_ALL
    ):
        return
    role = await repo.get_project_member_role(db, project_id, current_user.user_id)
    if role != "ProjectManager":
        raise ForbiddenError("Only a project admin can manage this project's team.")


async def transfer_project_admin(
    db: AsyncSession,
    project_id: UUID,
    payload: ProjectAdminTransfer,
) -> ProjectMemberRead:
    project = await repo.get_project(db, project_id)
    if project is None:
        raise NotFoundError("Project", project_id)

    members = list(await repo.list_project_members(db, project_id))
    new_admin = next(
        (member for member in members if member.user_id == payload.new_admin_user_id),
        None,
    )
    if new_admin is None:
        raise ValidationAppError(
            "The new project admin must already be a project member.",
            errors={"new_admin_user_id": ["Add this user to the project first."]},
        )

    for member in members:
        if member.role == "ProjectManager" and member.user_id != new_admin.user_id:
            member.role = payload.previous_admin_role.value
    new_admin.role = "ProjectManager"
    await db.commit()
    return ProjectMemberRead.model_validate(new_admin)


async def remove_project_member(
    db: AsyncSession, project_id: UUID, user_id: UUID
) -> None:
    members = list(await repo.list_project_members(db, project_id))
    removing = next((member for member in members if member.user_id == user_id), None)
    if removing is not None and removing.role == "ProjectManager":
        admin_count = sum(member.role == "ProjectManager" for member in members)
        if admin_count == 1:
            raise BusinessRuleError(
                "Transfer project admin before removing the current admin."
            )
    removed = await repo.remove_project_member(db, project_id, user_id)
    if not removed:
        raise NotFoundError("ProjectMember", user_id)
    await event_bus.publish(
        ProjectMemberRemoved(project_id=project_id, user_id=user_id)
    )


def _can_manage_task_fields(current_user: CurrentUser) -> bool:
    return current_user.is_super_admin() or current_user.has_any_permission(
        Permissions.TASKS_MANAGE_ALL,
        Permissions.TASKS_MANAGE_TEAM,
        Permissions.TASKS_MANAGE_TESTING,
        Permissions.TASKS_MANAGE_DESIGN,
    )


async def require_task_edit_access(
    db: AsyncSession,
    current_user: CurrentUser,
    task_id: UUID,
    payload: Optional[TaskUpdate] = None,
) -> TaskItem:
    """Protect every editable task field at one shared boundary.

    Leads, managers and executives edit all task fields. Every assignee can
    edit a task once assigned, independent of their organisation role; before
    assignment, a user may only add or remove themself from its assignee list
    if they already have project access.
    """
    task = await repo.get_task(db, task_id)
    if task is None:
        raise NotFoundError("Task", task_id)
    if _can_manage_task_fields(current_user):
        return task

    # Verify project access (C-4, H-11)
    phase_id = getattr(task, "phase_id", None)
    if phase_id is not None:
        phase = await repo.get_phase(db, phase_id)
        if phase is not None:
            await _require_project_access(db, current_user, phase.project_id)

    current_assignees = {entry.user_id for entry in task.assignees}
    is_assigned = current_user.user_id in current_assignees
    if payload is None:
        if is_assigned:
            return task
        raise ForbiddenError("Only an assigned contributor or task manager can edit this task.")

    changed_fields = payload.model_fields_set - {"assignee_user_ids"}
    if changed_fields and not is_assigned:
        raise ForbiddenError("Only an assigned contributor or task manager can edit task fields.")

    if payload.assignee_user_ids is not None and not current_user.has_permission(
        Permissions.TASKS_ASSIGN
    ):
        requested_assignees = set(payload.assignee_user_ids)
        changed_assignees = requested_assignees.symmetric_difference(current_assignees)
        if changed_assignees - {current_user.user_id}:
            raise ForbiddenError("You may only assign or unassign yourself from this task.")
    return task


async def require_task_board_access(
    db: AsyncSession,
    current_user: CurrentUser,
    task_ids: List[UUID],
) -> None:
    """Allow task managers or members of every affected project to move cards.

    Board movement intentionally keeps the long-standing project-member rule;
    it is narrower in effect than changing task content, labels, or assignees,
    which are protected by ``require_task_edit_access`` above.
    """
    if _can_manage_task_fields(current_user):
        return

    checked_projects: set[UUID] = set()
    for task_id in task_ids:
        task = await repo.get_task(db, task_id)
        if task is None:
            raise NotFoundError("Task", task_id)
        if current_user.user_id in {
            entry.user_id for entry in getattr(task, "assignees", [])
        }:
            continue
        if task.phase_id is None:
            raise ForbiddenError("Only project tasks can be moved by project members.")
        phase = await repo.get_phase(db, task.phase_id)
        if phase is None:
            raise NotFoundError("Phase", task.phase_id)
        if phase.project_id in checked_projects:
            continue
        checked_projects.add(phase.project_id)
        role = await repo.get_project_member_role(
            db, phase.project_id, current_user.user_id
        )
        if role is None:
            raise ForbiddenError("Only project members can move tasks on this board.")


async def list_project_members(
    db: AsyncSession, project_id: UUID
) -> List[ProjectMemberRead]:
    members = await repo.list_project_members(db, project_id)
    return [ProjectMemberRead.model_validate(m) for m in members]


async def get_resource_role(
    db: AsyncSession, user_id: UUID, resource_type: str, resource_id: UUID
) -> Optional[str]:
    """Cross-module contract (mirrors `GetResourceRoleQuery`): resolves a
    user's contextual role for a given resource, used by the coarse RBAC
    layer for resource-scoped permission decisions."""
    if resource_type.lower() == "project":
        return await repo.get_project_member_role(db, resource_id, user_id)
    return None


async def get_project_summary(
    db: AsyncSession, project_id: UUID
) -> Optional[ProjectSummary]:
    project = await repo.get_project(db, project_id)
    if project is None:
        return None
    return ProjectSummary(
        project_id=project.id,
        name=project.name,
        product_id=project.product_id,
        health_status=project.health_status,
        progress_percentage=float(project.progress_percentage),
    )


# ---------- Phases ----------
async def create_phase(db: AsyncSession, payload: PhaseCreate) -> PhaseRead:
    project = await repo.get_project(db, payload.project_id)
    if project is None:
        raise NotFoundError("Project", payload.project_id)
    data = _dump(payload, exclude={"team_ids"})
    existing = list(await repo.list_phases_by_project(db, payload.project_id))
    if data.get("start_date") is None and data.get("end_date") is None:
        last_end = max(
            (item.end_date for item in existing if item.end_date is not None),
            default=None,
        )
        start = (last_end + timedelta(days=1)) if last_end else (project.start_date or date.today())
        data["start_date"] = start
        data["end_date"] = start + timedelta(days=SPRINT_DURATION_DAYS - 1)
    elif data.get("start_date") is None or data.get("end_date") is None:
        raise ValidationAppError("Sprint start and end dates must be set together.")
    _validate_sprint_window(data["start_date"], data["end_date"])
    data["is_sprint"] = True
    phase = Phase(**data)
    phase = await repo.create_phase(db, phase, payload.team_ids)
    return PhaseRead.model_validate(phase)


async def get_phase(db: AsyncSession, phase_id: UUID) -> PhaseRead:
    phase = await repo.get_phase(db, phase_id)
    if phase is None:
        raise NotFoundError("Phase", phase_id)
    return PhaseRead.model_validate(phase)


async def update_phase(
    db: AsyncSession, phase_id: UUID, payload: PhaseUpdate
) -> PhaseRead:
    phase = await repo.get_phase(db, phase_id)
    if phase is None:
        raise NotFoundError("Phase", phase_id)
    data = _dump(payload, exclude_unset=True)
    if phase.is_sprint and ({"start_date", "end_date"} & payload.model_fields_set):
        start = data.get("start_date", phase.start_date)
        end = data.get("end_date", phase.end_date)
        if start is None or end is None:
            raise ValidationAppError("Sprint start and end dates must be set together.")
        _validate_sprint_window(start, end)
    for field, value in data.items():
        setattr(phase, field, value)
    await db.commit()
    await db.refresh(phase)
    return PhaseRead.model_validate(phase)


async def list_phases_by_project(db: AsyncSession, project_id: UUID) -> List[PhaseRead]:
    phases = await repo.list_phases_by_project(db, project_id)
    return [PhaseRead.model_validate(p) for p in phases]


# ---------- Tasks ----------
def _to_task_read(task: TaskItem) -> TaskRead:
    data = TaskRead.model_validate(task).model_dump()
    data["assignee_user_ids"] = [a.user_id for a in task.assignees]
    data["labels"] = [la.label.name for la in task.label_assignments]
    data["checklist_items"] = sorted(
        task.checklist_items,
        key=lambda item: (item.order, str(item.id)),
    )
    return TaskRead(**data)


async def _resolve_ticket_assignee_ids(
    db: AsyncSession,
    payload: TaskCreate,
    created_by_user_id: Optional[UUID],
) -> List[UUID]:
    if not payload.is_ticket:
        if payload.ticket_recipient_user_ids or payload.ticket_recipient_team_ids:
            raise ValidationAppError("Ticket recipients require ticket mode.")
        return []
    if not payload.ticket_recipient_user_ids and not payload.ticket_recipient_team_ids:
        raise ValidationAppError(
            "A ticket must target at least one person or team.",
            errors={"ticket_recipients": ["Select at least one person or team."]},
        )

    from app.modules.identity.service import require_active_user_ids
    from app.modules.organization.service import resolve_active_team_user_ids

    recipients = [
        *payload.ticket_recipient_user_ids,
        *(await resolve_active_team_user_ids(db, payload.ticket_recipient_team_ids)),
    ]
    if created_by_user_id is not None:
        recipients = [user_id for user_id in recipients if user_id != created_by_user_id]
    recipients = await require_active_user_ids(db, list(dict.fromkeys(recipients)))
    if not recipients:
        raise ValidationAppError(
            "The selected ticket recipients contain no other active members.",
            errors={"ticket_recipients": ["Choose another active person or a team with active members."]},
        )
    return recipients


async def create_task(
    db: AsyncSession,
    payload: TaskCreate,
    created_by_user_id: Optional[UUID] = None,
    current_user: Optional[CurrentUser] = None,
) -> TaskRead:
    if payload.phase_id is not None:
        phase = await repo.get_phase(db, payload.phase_id)
        if phase is None:
            raise NotFoundError("Phase", payload.phase_id)
        if current_user is not None:
            await _require_project_access(db, current_user, phase.project_id)
    if payload.parent_task_id is not None:
        parent = await repo.get_task(db, payload.parent_task_id)
        if parent is None:
            raise NotFoundError("Task", payload.parent_task_id)
        if payload.phase_id is not None and parent.phase_id != payload.phase_id:
            parent_phase = await repo.get_phase(db, parent.phase_id) if parent.phase_id else None
            phase = await repo.get_phase(db, payload.phase_id)
            if parent_phase is None or phase is None or parent_phase.project_id != phase.project_id:
                raise ValidationAppError(
                    "Parent task must belong to the same project or sprint.",
                    errors={"parent_task_id": ["Parent task must belong to the same project."]},
                )

    # Contributors can create work, but ordinary assignment remains protected:
    # without the assignment capability they may only add themselves. Ticket
    # recipients stay available because a ticket is an explicit notification
    # request rather than silently reassigning ordinary work.
    if (
        current_user is not None
        and not _can_manage_task_fields(current_user)
        and not current_user.has_permission(Permissions.TASKS_ASSIGN)
        and set(payload.assignee_user_ids) - {current_user.user_id}
    ):
        raise ForbiddenError("You may only assign yourself when creating a task.")

    ticket_assignee_ids = await _resolve_ticket_assignee_ids(
        db, payload, created_by_user_id
    )

    assignee_user_ids = list(
        dict.fromkeys([*payload.assignee_user_ids, *ticket_assignee_ids])
    )

    data = _dump(
        payload,
        exclude={
            "assignee_user_ids",
            "label_ids",
            "label_names",
            "checklist_items",
            "status",
            "ticket_recipient_user_ids",
            "ticket_recipient_team_ids",
        },
    )
    task = TaskItem(**data)
    if payload.is_ticket:
        task.ticket_requested_by_user_id = created_by_user_id
    if payload.status is not None:
        task.status = payload.status.value
    checklist = [
        ChecklistItem(text=c.text, order=c.order) for c in payload.checklist_items
    ]
    label_ids = list(payload.label_ids)
    for label_name in payload.label_names:
        name = label_name.strip()
        if not name:
            continue
        label = await repo.get_or_create_label(db, name)
        label_ids.append(label.id)
    task = await repo.create_task(
        db, task, assignee_user_ids, label_ids, checklist
    )

    repo.add_status_transition(
        db,
        task_id=task.id,
        from_status=None,
        to_status=task.status,
        changed_by_user_id=created_by_user_id,
        changed_at=datetime.now(timezone.utc),
    )
    await db.commit()

    if assignee_user_ids:
        await event_bus.publish(
            TaskAssigned(
                task_id=task.id,
                assignee_user_ids=assignee_user_ids,
                task_title=task.title,
                is_ticket=payload.is_ticket,
                requested_by_user_id=created_by_user_id,
            )
        )

    if task.phase_id is not None:
        await recalculate_phase_and_project_progress(db, task.phase_id)
    task = await repo.get_task(db, task.id)
    return _to_task_read(task)


async def get_task(db: AsyncSession, task_id: UUID) -> TaskRead:
    task = await repo.get_task(db, task_id)
    if task is None:
        raise NotFoundError("Task", task_id)
    return _to_task_read(task)


async def update_task(
    db: AsyncSession,
    task_id: UUID,
    payload: TaskUpdate,
    current_user: CurrentUser,
) -> TaskRead:
    task = await require_task_edit_access(db, current_user, task_id, payload)

    update_data = _dump(
        payload,
        exclude_unset=True,
        exclude={"assignee_user_ids", "label_ids", "label_names", "checklist_items"},
    )
    for field, value in update_data.items():
        setattr(task, field, value)

    previous_assignee_ids = {entry.user_id for entry in task.assignees}
    if payload.assignee_user_ids is not None:
        await repo.set_task_assignees(
            db, task_id, list(dict.fromkeys(payload.assignee_user_ids))
        )

    if payload.label_ids is not None or payload.label_names is not None:
        label_ids = list(payload.label_ids or [])
        for raw_name in payload.label_names or []:
            name = raw_name.strip()
            if name:
                label_ids.append((await repo.get_or_create_label(db, name)).id)
        await repo.set_task_labels(db, task_id, label_ids)

    if payload.checklist_items is not None:
        await repo.set_task_checklist(
            db,
            task_id,
            [
                ChecklistItem(text=item.text, order=item.order)
                for item in payload.checklist_items
            ],
        )

    await db.commit()

    newly_assigned = list(set(payload.assignee_user_ids or []) - previous_assignee_ids)
    if newly_assigned:
        await event_bus.publish(
            TaskAssigned(
                task_id=task_id,
                assignee_user_ids=newly_assigned,
                task_title=task.title,
                is_ticket=task.is_ticket,
                requested_by_user_id=current_user.user_id,
            )
        )

    if task.phase_id is not None:
        await recalculate_phase_and_project_progress(db, task.phase_id)
    task = await repo.get_task(db, task_id)
    return _to_task_read(task)


async def reorder_tasks(db: AsyncSession, task_ids: List[UUID]) -> None:
    """Persist the exact order supplied by a board column or planner bucket."""
    if len(task_ids) != len(set(task_ids)):
        raise ValidationAppError("A task can appear only once in an ordered list.")

    tasks = await repo.get_tasks_by_ids(db, task_ids)
    tasks_by_id = {task.id: task for task in tasks}
    missing = next(
        (task_id for task_id in task_ids if task_id not in tasks_by_id), None
    )
    if missing is not None:
        raise NotFoundError("Task", missing)

    for board_order, task_id in enumerate(task_ids):
        tasks_by_id[task_id].board_order = board_order
    await db.commit()


async def _collect_task_tree_ids(db: AsyncSession, task_id: UUID) -> list[UUID]:
    pending = [task_id]
    collected: list[UUID] = []
    while pending:
        current_id = pending.pop()
        if current_id in collected:
            continue
        collected.append(current_id)
        result = await db.execute(
            select(TaskItem.id).where(TaskItem.parent_task_id == current_id)
        )
        pending.extend(result.scalars().all())
    return collected


async def delete_task(db: AsyncSession, task_id: UUID) -> None:
    task = await repo.get_task(db, task_id)
    if task is None:
        raise NotFoundError("Task", task_id)

    phase_id = task.phase_id
    task_ids = await _collect_task_tree_ids(db, task_id)
    await _delete_entity_artifacts(db, task_ids=task_ids)
    await repo.delete_task(db, task)
    if phase_id is not None:
        await recalculate_phase_and_project_progress(db, phase_id)


async def update_task_status(
    db: AsyncSession,
    task_id: UUID,
    new_status: TaskStatus,
    changed_by_user_id: Optional[UUID] = None,
) -> TaskRead:
    task = await repo.get_task(db, task_id)
    if task is None:
        raise NotFoundError("Task", task_id)

    old_status = task.status
    task.status = new_status.value
    if is_task_done(new_status.value) and task.completed_at is None:
        task.completed_at = datetime.now(timezone.utc)
    elif not is_task_done(new_status.value):
        task.completed_at = None

    if old_status != new_status.value:
        repo.add_status_transition(
            db,
            task_id=task.id,
            from_status=old_status,
            to_status=new_status.value,
            changed_by_user_id=changed_by_user_id,
            changed_at=datetime.now(timezone.utc),
        )
    await db.commit()

    phase = (
        await repo.get_phase(db, task.phase_id) if task.phase_id is not None else None
    )

    if old_status != new_status.value:
        await event_bus.publish(
            TaskStatusChanged(
                task_id=task.id,
                project_id=phase.project_id if phase else None,
                phase_id=task.phase_id,
                old_status=old_status,
                new_status=new_status.value,
            )
        )

    if task.phase_id is not None:
        await recalculate_phase_and_project_progress(db, task.phase_id)
    task = await repo.get_task(db, task_id)
    return _to_task_read(task)


async def update_checklist_item(
    db: AsyncSession,
    *,
    task_id: UUID,
    checklist_item_id: UUID,
    is_done: bool,
    changed_by_user_id: Optional[UUID] = None,
) -> TaskRead:
    task = await repo.get_task(db, task_id)
    if task is None:
        raise NotFoundError("Task", task_id)
    item = next(
        (entry for entry in task.checklist_items if entry.id == checklist_item_id), None
    )
    if item is None:
        raise NotFoundError("ChecklistItem", checklist_item_id)

    item.is_done = is_done
    old_status = task.status
    if task.checklist_items and all(entry.is_done for entry in task.checklist_items):
        task.status = TaskStatus.DONE.value
        if task.completed_at is None:
            task.completed_at = datetime.now(timezone.utc)
        if old_status != task.status:
            repo.add_status_transition(
                db,
                task_id=task.id,
                from_status=old_status,
                to_status=task.status,
                changed_by_user_id=changed_by_user_id,
                changed_at=datetime.now(timezone.utc),
            )

    await db.commit()

    phase = (
        await repo.get_phase(db, task.phase_id) if task.phase_id is not None else None
    )
    if old_status != task.status:
        await event_bus.publish(
            TaskStatusChanged(
                task_id=task.id,
                project_id=phase.project_id if phase else None,
                phase_id=task.phase_id,
                old_status=old_status,
                new_status=task.status,
            )
        )

    if task.phase_id is not None:
        await recalculate_phase_and_project_progress(db, task.phase_id)
    task = await repo.get_task(db, task_id)
    return _to_task_read(task)


async def list_tasks(
    db: AsyncSession,
    *,
    partition: Optional[str] = None,
    label: Optional[str] = None,
    assignee_user_id: Optional[UUID] = None,
    status: Optional[str] = None,
    unattached: Optional[bool] = None,
    parent_task_id: Optional[UUID] = None,
    search: Optional[str] = None,
    current_user: Optional[CurrentUser] = None,
    page: int = 1,
    page_size: int = 50,
) -> tuple[List[TaskRead], int]:
    user_id = None
    if current_user is not None and not (
        current_user.is_super_admin()
        or current_user.has_any_permission(
            Permissions.TASKS_VIEW,
            Permissions.TASKS_MANAGE_ALL,
            Permissions.PROJECTS_VIEW_ALL,
            Permissions.PROJECTS_MANAGE_ALL,
        )
    ):
        user_id = current_user.user_id
    tasks, total = await repo.list_tasks(
        db,
        partition=partition,
        label=label,
        assignee_user_id=assignee_user_id,
        status=status,
        unattached=unattached,
        parent_task_id=parent_task_id,
        search=search,
        user_id=user_id,
        offset=(page - 1) * page_size,
        limit=page_size,
    )
    return [_to_task_read(t) for t in tasks], total


async def attach_task_to_phase(
    db: AsyncSession, task_id: UUID, phase_id: UUID
) -> TaskRead:
    task = await repo.get_task(db, task_id)
    if task is None:
        raise NotFoundError("Task", task_id)
    phase = await repo.get_phase(db, phase_id)
    if phase is None:
        raise NotFoundError("Phase", phase_id)

    old_phase_id = task.phase_id
    task.phase_id = phase_id
    await db.commit()

    if old_phase_id is not None and old_phase_id != phase_id:
        await recalculate_phase_and_project_progress(db, old_phase_id)
    await recalculate_phase_and_project_progress(db, phase_id)
    task = await repo.get_task(db, task_id)
    return _to_task_read(task)


async def detach_task_from_phase(db: AsyncSession, task_id: UUID) -> TaskRead:
    task = await repo.get_task(db, task_id)
    if task is None:
        raise NotFoundError("Task", task_id)
    old_phase_id = task.phase_id
    task.phase_id = None
    await db.commit()
    if old_phase_id is not None:
        await recalculate_phase_and_project_progress(db, old_phase_id)
    task = await repo.get_task(db, task_id)
    return _to_task_read(task)


async def list_tasks_by_phase(db: AsyncSession, phase_id: UUID) -> List[TaskRead]:
    tasks = await repo.list_tasks_by_phase(db, phase_id)
    return [_to_task_read(t) for t in tasks]


async def get_task_summary(db: AsyncSession, task_id: UUID) -> Optional[TaskSummary]:
    task = await repo.get_task(db, task_id)
    if task is None:
        return None
    phase = (
        await repo.get_phase(db, task.phase_id) if task.phase_id is not None else None
    )
    return TaskSummary(
        task_id=task.id,
        title=task.title,
        phase_id=task.phase_id,
        project_id=phase.project_id if phase else None,
        status=task.status,
        assignee_user_ids=[a.user_id for a in task.assignees],
    )


async def get_tasks_by_assignee(
    db: AsyncSession, user_id: UUID, statuses: Optional[List[str]] = None
) -> List[TaskSummary]:
    """Cross-module contract (mirrors `GetTasksByAssigneeQuery`), consumed by
    the Blockers module for the "Pending On Me" workflow."""
    tasks = await repo.list_tasks_by_assignee(db, user_id, statuses)
    summaries = []
    for task in tasks:
        phase = (
            await repo.get_phase(db, task.phase_id)
            if task.phase_id is not None
            else None
        )
        summaries.append(
            TaskSummary(
                task_id=task.id,
                title=task.title,
                phase_id=task.phase_id,
                project_id=phase.project_id if phase else None,
                status=task.status,
                assignee_user_ids=[a.user_id for a in task.assignees],
            )
        )
    return summaries


async def get_blocked_tasks_with_incomplete_predecessors(
    db: AsyncSession, user_id: UUID
) -> list[dict]:
    """Cross-module contract (mirrors `GetBlockedTasksForUserQuery`): tasks
    assigned to `user_id` whose predecessor(s) are not yet Done, i.e. the
    task is stalled waiting on someone else's work ("Pending On Others")."""
    my_tasks = await repo.list_tasks_by_assignee(db, user_id)
    results = []
    for task in my_tasks:
        deps = await db.execute(
            select(TaskDependency).where(TaskDependency.successor_task_id == task.id)
        )
        dependency_rows = deps.scalars().all()
        if not dependency_rows:
            continue
        predecessor_ids = [d.predecessor_task_id for d in dependency_rows]
        predecessors = await repo.get_tasks_by_ids(db, predecessor_ids)
        incomplete = [p.id for p in predecessors if not is_task_done(p.status)]
        if incomplete:
            phase = (
                await repo.get_phase(db, task.phase_id)
                if task.phase_id is not None
                else None
            )
            results.append(
                {
                    "task_id": task.id,
                    "title": task.title,
                    "project_id": phase.project_id if phase else None,
                    "incomplete_predecessor_task_ids": incomplete,
                }
            )
    return results


# ---------- Dependencies (DAG) ----------
async def create_dependency(
    db: AsyncSession, payload: TaskDependencyCreate
) -> TaskDependencyRead:
    predecessor = await repo.get_task(db, payload.predecessor_task_id)
    successor = await repo.get_task(db, payload.successor_task_id)
    if predecessor is None:
        raise NotFoundError("Task", payload.predecessor_task_id)
    if successor is None:
        raise NotFoundError("Task", payload.successor_task_id)
    if predecessor.id == successor.id:
        raise BusinessRuleError("A task cannot depend on itself.")

    phase = (
        await repo.get_phase(db, predecessor.phase_id)
        if predecessor.phase_id is not None
        else None
    )
    project_id = phase.project_id if phase else None
    existing = (
        await repo.list_dependencies_for_project(db, project_id) if project_id else []
    )
    edges = [(d.predecessor_task_id, d.successor_task_id) for d in existing]

    cycle_path = would_create_cycle(
        edges, payload.predecessor_task_id, payload.successor_task_id
    )
    if cycle_path is not None:
        from app.modules.projects.dag import DependencyCycleError

        raise DependencyCycleError(
            payload.predecessor_task_id, payload.successor_task_id, cycle_path
        )

    dependency = TaskDependency(**_dump(payload))
    dependency = await repo.create_dependency(db, dependency)

    await event_bus.publish(
        TaskDependencyCreated(
            predecessor_task_id=dependency.predecessor_task_id,
            successor_task_id=dependency.successor_task_id,
            successor_assignee_user_ids=[a.user_id for a in successor.assignees],
            predecessor_title=predecessor.title,
            successor_title=successor.title,
        )
    )
    return TaskDependencyRead.model_validate(dependency)


async def delete_dependency(db: AsyncSession, dependency_id: UUID) -> None:
    dependency = await repo.get_dependency(db, dependency_id)
    if dependency is None:
        raise NotFoundError("TaskDependency", dependency_id)
    await repo.delete_dependency(db, dependency)


# ---------- Status transitions (cross-module contract for Analytics) ----------
async def get_status_transitions(
    db: AsyncSession,
    *,
    since=None,
    project_id: Optional[UUID] = None,
) -> list[dict]:
    task_ids = None
    if project_id is not None:
        tasks = await repo.list_tasks_by_project(db, project_id)
        task_ids = [t.id for t in tasks]
    rows = await repo.list_status_transitions(db, since=since, task_ids=task_ids)
    return [
        {
            "task_id": r.task_id,
            "from_status": r.from_status,
            "to_status": r.to_status,
            "changed_by_user_id": r.changed_by_user_id,
            "changed_at": r.changed_at,
        }
        for r in rows
    ]


async def get_all_tasks_snapshot(db: AsyncSession) -> list[TaskRead]:
    """Cross-module contract: full task list for analytics aggregation."""
    tasks, _ = await repo.list_tasks(db, offset=0, limit=5000)
    return [_to_task_read(t) for t in tasks]


# ---------- Milestones ----------
async def create_milestone(
    db: AsyncSession,
    project_id: UUID,
    payload: MilestoneCreate,
    created_by_user_id: UUID,
) -> MilestoneRead:
    project = await repo.get_project(db, project_id)
    if project is None:
        raise NotFoundError("Project", project_id)
    milestone = Milestone(
        project_id=project_id,
        created_by_user_id=created_by_user_id,
        **_dump(payload),
    )
    milestone = await repo.create_milestone(db, milestone)
    return MilestoneRead.model_validate(milestone)


async def update_milestone(
    db: AsyncSession, milestone_id: UUID, payload: MilestoneUpdate
) -> MilestoneRead:
    milestone = await repo.get_milestone(db, milestone_id)
    if milestone is None:
        raise NotFoundError("Milestone", milestone_id)
    data = _dump(payload, exclude_unset=True)
    completed = data.pop("completed", None)
    for field, value in data.items():
        setattr(milestone, field, value)
    if completed is True and milestone.completed_at is None:
        milestone.completed_at = datetime.now(timezone.utc)
    elif completed is False:
        milestone.completed_at = None
    await db.commit()
    await db.refresh(milestone)
    return MilestoneRead.model_validate(milestone)


async def list_milestones(db: AsyncSession, project_id: UUID) -> List[MilestoneRead]:
    milestones = await repo.list_milestones_by_project(db, project_id)
    return [MilestoneRead.model_validate(m) for m in milestones]


async def delete_milestone(db: AsyncSession, milestone_id: UUID) -> None:
    milestone = await repo.get_milestone(db, milestone_id)
    if milestone is None:
        raise NotFoundError("Milestone", milestone_id)
    await repo.delete_milestone(db, milestone)


# ---------- Project dependencies ----------
async def create_project_dependency(
    db: AsyncSession, payload: ProjectDependencyCreate
) -> ProjectDependencyRead:
    predecessor = await repo.get_project(db, payload.predecessor_project_id)
    successor = await repo.get_project(db, payload.successor_project_id)
    if predecessor is None:
        raise NotFoundError("Project", payload.predecessor_project_id)
    if successor is None:
        raise NotFoundError("Project", payload.successor_project_id)
    if predecessor.id == successor.id:
        raise BusinessRuleError("A project cannot depend on itself.")

    existing = await repo.list_project_dependencies(db)
    edges = [(d.predecessor_project_id, d.successor_project_id) for d in existing]
    cycle_path = would_create_cycle(
        edges, payload.predecessor_project_id, payload.successor_project_id
    )
    if cycle_path is not None:
        raise BusinessRuleError(
            "This dependency would create a cycle between projects."
        )

    dependency = ProjectDependency(**_dump(payload))
    dependency = await repo.create_project_dependency(db, dependency)
    return ProjectDependencyRead.model_validate(dependency)


async def delete_project_dependency(db: AsyncSession, dependency_id: UUID) -> None:
    dependency = await repo.get_project_dependency(db, dependency_id)
    if dependency is None:
        raise NotFoundError("ProjectDependency", dependency_id)
    await repo.delete_project_dependency(db, dependency)


# ---------- Portfolio Gantt ----------
def _current_phase(phases: List[Phase]) -> Optional[Phase]:
    today = date.today()
    current_window = [
        p
        for p in phases
        if p.start_date and p.end_date and p.start_date <= today <= p.end_date
    ]
    if current_window:
        return sorted(current_window, key=lambda p: p.sequence)[0]
    in_progress = [p for p in phases if p.status == "in-progress"]
    if in_progress:
        return sorted(in_progress, key=lambda p: p.sequence)[0]
    not_done = [p for p in phases if p.status not in ("completed",)]
    if not_done:
        return sorted(not_done, key=lambda p: p.sequence)[0]
    return None


async def get_portfolio_gantt(
    db: AsyncSession, include_archived: bool = False
) -> PortfolioGantt:
    projects, _ = await repo.list_all_projects(db, 0, 500)
    if not include_archived:
        projects = [p for p in projects if p.status != ProjectStatus.ARCHIVED.value]
    dependencies = await repo.list_project_dependencies(db)
    all_milestones = await repo.list_all_milestones(db)
    milestones_by_project: dict[UUID, list] = {}
    for m in all_milestones:
        milestones_by_project.setdefault(m.project_id, []).append(m)

    rows: List[PortfolioGanttProject] = []
    for project in projects:
        phases = list(await repo.list_phases_by_project(db, project.id))
        current = _current_phase(phases)
        rows.append(
            PortfolioGanttProject(
                id=project.id,
                product_id=project.product_id,
                name=project.name,
                status=project.status,
                health_status=project.health_status,
                priority=project.priority,
                progress_percentage=float(project.progress_percentage),
                start_date=project.start_date,
                end_date=project.end_date or project.estimated_completion_date,
                current_phase=current.name if current else None,
                current_sprint=current.name if current else None,
                tags=project.tags,
                milestones=[
                    MilestoneRead.model_validate(m)
                    for m in milestones_by_project.get(project.id, [])
                ],
            )
        )
    visible_ids = {p.id for p in projects}
    return PortfolioGantt(
        projects=rows,
        links=[
            ProjectDependencyRead.model_validate(d)
            for d in dependencies
            if d.predecessor_project_id in visible_ids
            and d.successor_project_id in visible_ids
        ],
    )


# ---------- Project overview aggregate ----------
async def get_project_overview(db: AsyncSession, project_id: UUID) -> ProjectOverview:
    project = await repo.get_project(db, project_id)
    if project is None:
        raise NotFoundError("Project", project_id)

    phases = [
        PhaseRead.model_validate(p)
        for p in await repo.list_phases_by_project(db, project_id)
    ]
    raw_phases = list(await repo.list_phases_by_project(db, project_id))
    current = _current_phase(raw_phases)
    members = await list_project_members(db, project_id)
    milestones = await list_milestones(db, project_id)
    tasks = await repo.list_tasks_by_project(db, project_id)
    corrected_status = _derived_project_status(project, tasks)
    if project.status != corrected_status:
        project.status = corrected_status
        await db.commit()
        await db.refresh(project)

    today = date.today()
    stats = TaskStats(
        total=len(tasks),
        done=sum(1 for t in tasks if is_task_done(t.status)),
        in_progress=sum(1 for t in tasks if t.status == TaskStatus.IN_PROGRESS.value),
        blocked=sum(1 for t in tasks if t.status == TaskStatus.BLOCKED.value),
        overdue=sum(
            1
            for t in tasks
            if t.due_date and t.due_date < today and not is_task_done(t.status)
        ),
        unassigned=sum(1 for t in tasks if not t.assignees),
    )

    # Open blockers via the Blockers module's public service (sanctioned
    # cross-module call).
    from app.modules.blockers.service import count_open_blockers_for_tasks

    open_blockers = await count_open_blockers_for_tasks(db, [t.id for t in tasks])

    deadlines = sorted(
        (
            UpcomingDeadline(
                task_id=t.id,
                title=t.title,
                due_date=t.due_date,
                status=t.status,
                assignee_user_ids=[a.user_id for a in t.assignees],
            )
            for t in tasks
            if t.due_date and t.due_date >= today and not is_task_done(t.status)
        ),
        key=lambda d: d.due_date,
    )[:10]

    return ProjectOverview(
        project=ProjectRead.model_validate(project),
        phases=phases,
        sprints=phases,
        current_phase=PhaseRead.model_validate(current) if current else None,
        current_sprint=PhaseRead.model_validate(current) if current else None,
        members=members,
        milestones=milestones,
        task_stats=stats,
        open_blockers=open_blockers,
        upcoming_deadlines=deadlines,
    )


# ---------- Progress + Critical Path recalculation ----------
async def recalculate_phase_and_project_progress(
    db: AsyncSession, phase_id: UUID
) -> None:
    phase = await repo.get_phase(db, phase_id)
    if phase is None:
        return
    tasks = await repo.list_tasks_by_phase(db, phase_id)
    inputs = [
        TaskProgressInput(
            task_id=str(t.id),
            status=t.status,
            story_points=t.story_points,
            estimated_hours=float(t.estimated_hours) if t.estimated_hours else None,
        )
        for t in tasks
    ]
    phase.progress_percentage = calculate_phase_progress(inputs)
    await db.commit()

    project = await repo.get_project(db, phase.project_id)
    if project is None:
        return
    all_phases = await repo.list_phases_by_project(db, project.id)
    from app.modules.projects.progress import PhaseProgressInput

    phase_inputs = []
    for p in all_phases:
        p_tasks = await repo.list_tasks_by_phase(db, p.id)
        phase_inputs.append(
            PhaseProgressInput(
                phase_id=str(p.id),
                progress_percentage=float(p.progress_percentage),
                task_count=len(p_tasks),
            )
        )
    project.progress_percentage = calculate_project_progress(phase_inputs)
    tasks = await repo.list_tasks_by_project(db, project.id)
    project.status = _derived_project_status(project, tasks)
    await db.commit()


async def get_phase_progress_breakdown(
    db: AsyncSession, phase_id: UUID
) -> ProgressBreakdown:
    from app.modules.projects.progress import blocks_string

    tasks = await repo.list_tasks_by_phase(db, phase_id)
    today = date.today()
    overdue_ids = {
        str(t.id)
        for t in tasks
        if t.due_date and t.due_date < today and not is_task_done(t.status)
    }
    inputs = [
        TaskProgressInput(
            task_id=str(t.id),
            status=t.status,
            story_points=t.story_points,
            estimated_hours=float(t.estimated_hours) if t.estimated_hours else None,
        )
        for t in tasks
    ]
    breakdown = progress_breakdown(inputs, overdue_ids)
    percentage = calculate_phase_progress(inputs)
    return ProgressBreakdown(
        completed=breakdown["completed"],
        in_progress=breakdown["in_progress"],
        blocked=breakdown["blocked"],
        overdue=breakdown["overdue"],
        pending=breakdown["pending"],
        percentage=percentage,
        blocks=blocks_string(percentage),
    )


async def get_project_timeline(db: AsyncSession, project_id: UUID) -> ProjectTimeline:
    project = await repo.get_project(db, project_id)
    if project is None:
        raise NotFoundError("Project", project_id)

    tasks = await repo.list_tasks_by_project(db, project_id)
    dependencies = await repo.list_dependencies_for_project(db, project_id)

    done_ids = {t.id for t in tasks if is_task_done(t.status)}
    cpm_tasks = [
        CpmTask(
            task_id=t.id,
            duration_days=hours_to_days(
                float(t.estimated_hours) if t.estimated_hours else None
            ),
        )
        for t in tasks
    ]
    cpm_edges = [
        CpmEdge(
            predecessor_id=d.predecessor_task_id,
            successor_id=d.successor_task_id,
            lag_days=d.lag_days,
        )
        for d in dependencies
    ]
    cpm_results = compute_critical_path(
        cpm_tasks, cpm_edges, excluded_task_ids=done_ids
    )

    for task in tasks:
        result = cpm_results.get(task.id)
        if result:
            task.earliest_start = int(result.earliest_start)
            task.earliest_finish = int(result.earliest_finish)
            task.latest_start = int(result.latest_start)
            task.latest_finish = int(result.latest_finish)
            task.total_slack = int(result.total_slack)
            task.is_critical = result.is_critical
    await db.commit()

    def _gantt_schedule(t: TaskItem) -> tuple[Optional[date], float]:
        """Bar anchor + length from the task's real start_date and due_date.

        start_date anchors the bar; length is the span to due_date (inclusive,
        min 1 day). Falls back to created_at for the anchor and the
        estimated-hours duration when a date is missing — the bar still renders
        but drag-editing writes the real start_date/due_date.
        """
        est_days = hours_to_days(
            float(t.estimated_hours) if t.estimated_hours else None
        )
        bar_start = t.start_date or (
            t.created_at.date() if t.created_at else t.due_date
        )
        if bar_start and t.due_date:
            span = (t.due_date - bar_start).days + 1
            return bar_start, float(max(span, 1))
        return bar_start, est_days

    task_rows = []
    for t in tasks:
        bar_start, bar_days = _gantt_schedule(t)
        done = is_task_done(t.status)
        # Finished after its due date: rendered as a lighter green on the Gantt.
        done_late = bool(
            done
            and t.due_date is not None
            and t.completed_at is not None
            and t.completed_at.date() > t.due_date
        )
        task_rows.append(
            GanttTaskRow(
                id=t.id,
                text=t.title,
                start_date=bar_start,
                due_date=t.due_date,
                duration_days=bar_days,
                progress=100.0
                if done
                else (50.0 if t.status == TaskStatus.IN_PROGRESS.value else 0.0),
                parent=t.parent_task_id,
                status=t.status,
                is_critical=t.is_critical,
                done_late=done_late,
            )
        )
    link_rows = [
        GanttLinkRow(
            id=str(d.id),
            source=d.predecessor_task_id,
            target=d.successor_task_id,
            type=d.dependency_type,
        )
        for d in dependencies
    ]
    return ProjectTimeline(project_id=project_id, tasks=task_rows, links=link_rows)
