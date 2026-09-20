"""Data-access functions for the Projects module."""

from __future__ import annotations

from typing import List, Optional, Sequence, Tuple
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.projects.models import (
    ChecklistItem,
    Milestone,
    Phase,
    PhaseTeamAssignment,
    Product,
    Project,
    ProjectDependency,
    ProjectMember,
    TaskAssignee,
    TaskDependency,
    TaskItem,
    TaskLabel,
    TaskLabelAssignment,
    TaskPartition,
    TaskStatusTransition,
)

_TASK_LOAD_OPTIONS = (
    selectinload(TaskItem.assignees),
    selectinload(TaskItem.checklist_items),
    selectinload(TaskItem.label_assignments).selectinload(TaskLabelAssignment.label),
)


# ---------- Partitions ----------
async def list_task_partitions(db: AsyncSession) -> Sequence[TaskPartition]:
    result = await db.execute(
        select(TaskPartition).order_by(
            TaskPartition.display_order, TaskPartition.name, TaskPartition.id
        )
    )
    return result.scalars().all()


async def get_task_partition(
    db: AsyncSession, partition_id: UUID
) -> Optional[TaskPartition]:
    result = await db.execute(
        select(TaskPartition).where(TaskPartition.id == partition_id)
    )
    return result.scalar_one_or_none()


async def get_task_partition_by_slug(
    db: AsyncSession, slug: str
) -> Optional[TaskPartition]:
    result = await db.execute(
        select(TaskPartition).where(TaskPartition.slug == slug)
    )
    return result.scalar_one_or_none()


async def get_task_partition_by_name(
    db: AsyncSession, name: str
) -> Optional[TaskPartition]:
    result = await db.execute(
        select(TaskPartition).where(func.lower(TaskPartition.name) == name.lower())
    )
    return result.scalar_one_or_none()


async def partition_usage_counts(
    db: AsyncSession, slug: str
) -> tuple[int, int]:
    task_count = (
        await db.execute(
            select(func.count(TaskItem.id)).where(TaskItem.partition == slug)
        )
    ).scalar_one()
    project_count = (
        await db.execute(
            select(func.count(Project.id)).where(
                Project.tags.any(f"partition:{slug}")
            )
        )
    ).scalar_one()
    return int(task_count), int(project_count)


async def replace_partition_references(
    db: AsyncSession, old_slug: str, replacement_slug: Optional[str]
) -> None:
    await db.execute(
        update(TaskItem)
        .where(TaskItem.partition == old_slug)
        .values(partition=replacement_slug)
    )
    projects = (
        await db.execute(
            select(Project).where(Project.tags.any(f"partition:{old_slug}"))
        )
    ).scalars().all()
    old_tag = f"partition:{old_slug}"
    replacement_tag = (
        f"partition:{replacement_slug}" if replacement_slug is not None else None
    )
    for project in projects:
        tags = [tag for tag in project.tags if tag != old_tag]
        if replacement_tag and replacement_tag not in tags:
            tags.append(replacement_tag)
        project.tags = tags


async def delete_task_partition(
    db: AsyncSession, partition: TaskPartition
) -> None:
    await db.delete(partition)


# ---------- Products ----------
async def create_product(db: AsyncSession, product: Product) -> Product:
    db.add(product)
    await db.commit()
    await db.refresh(product)
    return product


async def get_product(db: AsyncSession, product_id: UUID) -> Optional[Product]:
    result = await db.execute(select(Product).where(Product.id == product_id))
    return result.scalar_one_or_none()


async def list_products(
    db: AsyncSession, offset: int, limit: int
) -> Tuple[Sequence[Product], int]:
    result = await db.execute(select(Product))
    all_products = result.scalars().all()
    stmt = (
        select(Product).order_by(Product.created_at.desc()).offset(offset).limit(limit)
    )
    page_result = await db.execute(stmt)
    return page_result.scalars().all(), len(all_products)


# ---------- Projects ----------
async def create_project(db: AsyncSession, project: Project) -> Project:
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return project


async def get_project(db: AsyncSession, project_id: UUID) -> Optional[Project]:
    result = await db.execute(select(Project).where(Project.id == project_id))
    return result.scalar_one_or_none()


async def delete_project(db: AsyncSession, project: Project) -> None:
    await db.delete(project)
    await db.commit()


async def list_projects_by_product(
    db: AsyncSession, product_id: UUID, offset: int, limit: int
) -> Tuple[Sequence[Project], int]:
    count_result = await db.execute(
        select(Project).where(Project.product_id == product_id)
    )
    total = len(count_result.scalars().all())
    stmt = (
        select(Project)
        .where(Project.product_id == product_id)
        .order_by(Project.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    result = await db.execute(stmt)
    return result.scalars().all(), total


async def list_all_projects(
    db: AsyncSession, offset: int, limit: int
) -> Tuple[Sequence[Project], int]:
    count_result = await db.execute(select(Project))
    total = len(count_result.scalars().all())
    stmt = (
        select(Project).order_by(Project.created_at.desc()).offset(offset).limit(limit)
    )
    result = await db.execute(stmt)
    return result.scalars().all(), total


async def add_project_member(db: AsyncSession, member: ProjectMember) -> ProjectMember:
    db.add(member)
    await db.commit()
    return member


async def get_project_member_role(
    db: AsyncSession, project_id: UUID, user_id: UUID
) -> Optional[str]:
    result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id, ProjectMember.user_id == user_id
        )
    )
    member = result.scalar_one_or_none()
    return member.role if member else None


async def list_project_members(
    db: AsyncSession, project_id: UUID
) -> Sequence[ProjectMember]:
    result = await db.execute(
        select(ProjectMember).where(ProjectMember.project_id == project_id)
    )
    return result.scalars().all()


# ---------- Phases ----------
async def create_phase(db: AsyncSession, phase: Phase, team_ids: List[UUID]) -> Phase:
    db.add(phase)
    await db.flush()
    for team_id in team_ids:
        db.add(PhaseTeamAssignment(phase_id=phase.id, team_id=team_id))
    await db.commit()
    await db.refresh(phase)
    return phase


async def get_phase(db: AsyncSession, phase_id: UUID) -> Optional[Phase]:
    result = await db.execute(select(Phase).where(Phase.id == phase_id))
    return result.scalar_one_or_none()


async def list_phases_by_project(db: AsyncSession, project_id: UUID) -> Sequence[Phase]:
    result = await db.execute(
        select(Phase).where(Phase.project_id == project_id).order_by(Phase.sequence)
    )
    return result.scalars().all()


async def get_phase_project_map(db: AsyncSession) -> dict[UUID, UUID]:
    """phase_id -> project_id for every phase (one query, for analytics rollups)."""
    result = await db.execute(select(Phase.id, Phase.project_id))
    return {row.id: row.project_id for row in result.all()}


# ---------- Tasks ----------
async def create_task(
    db: AsyncSession,
    task: TaskItem,
    assignee_ids: List[UUID],
    label_ids: List[UUID],
    checklist_items: List[ChecklistItem],
) -> TaskItem:
    db.add(task)
    await db.flush()
    for user_id in assignee_ids:
        db.add(TaskAssignee(task_id=task.id, user_id=user_id))
    for label_id in label_ids:
        db.add(TaskLabelAssignment(task_id=task.id, label_id=label_id))
    for item in checklist_items:
        item.task_id = task.id
        db.add(item)
    await db.commit()
    await db.refresh(task)
    return task


async def get_task(db: AsyncSession, task_id: UUID) -> Optional[TaskItem]:
    result = await db.execute(
        select(TaskItem).options(*_TASK_LOAD_OPTIONS).where(TaskItem.id == task_id)
    )
    return result.scalar_one_or_none()


async def delete_task(db: AsyncSession, task: TaskItem) -> None:
    await db.delete(task)
    await db.commit()


async def get_task_by_github_url(db: AsyncSession, url: str) -> Optional[TaskItem]:
    result = await db.execute(
        select(TaskItem).options(*_TASK_LOAD_OPTIONS).where(TaskItem.github_url == url)
    )
    return result.scalar_one_or_none()


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
    offset: int = 0,
    limit: int = 50,
) -> Tuple[Sequence[TaskItem], int]:
    """Org-wide task browser powering the standalone-task views."""
    stmt = select(TaskItem)
    if partition:
        stmt = stmt.where(TaskItem.partition == partition)
    if parent_task_id is not None:
        stmt = stmt.where(TaskItem.parent_task_id == parent_task_id)
    if label:
        stmt = stmt.where(
            TaskItem.id.in_(
                select(TaskLabelAssignment.task_id)
                .join(TaskLabel, TaskLabelAssignment.label_id == TaskLabel.id)
                .where(TaskLabel.name == label)
            )
        )
    if assignee_user_id:
        stmt = stmt.where(
            TaskItem.id.in_(
                select(TaskAssignee.task_id).where(
                    TaskAssignee.user_id == assignee_user_id
                )
            )
        )
    if status:
        stmt = stmt.where(TaskItem.status == status)
    if unattached is True:
        stmt = stmt.where(TaskItem.phase_id.is_(None))
    elif unattached is False:
        stmt = stmt.where(TaskItem.phase_id.is_not(None))
    if search:
        stmt = stmt.where(TaskItem.title.ilike(f"%{search}%"))

    total = (
        await db.execute(select(func.count()).select_from(stmt.subquery()))
    ).scalar_one()
    result = await db.execute(
        stmt.options(*_TASK_LOAD_OPTIONS)
        .order_by(TaskItem.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    return result.scalars().unique().all(), total


async def get_or_create_label(
    db: AsyncSession, name: str, color: str = "#6B7684"
) -> TaskLabel:
    result = await db.execute(select(TaskLabel).where(TaskLabel.name == name))
    label = result.scalar_one_or_none()
    if label is None:
        label = TaskLabel(name=name, color=color)
        db.add(label)
        await db.flush()
    return label


async def list_status_transitions(
    db: AsyncSession,
    *,
    since=None,
    task_ids: Optional[List[UUID]] = None,
) -> Sequence[TaskStatusTransition]:
    stmt = select(TaskStatusTransition)
    if since is not None:
        stmt = stmt.where(TaskStatusTransition.changed_at >= since)
    if task_ids is not None:
        if not task_ids:
            return []
        stmt = stmt.where(TaskStatusTransition.task_id.in_(task_ids))
    result = await db.execute(stmt.order_by(TaskStatusTransition.changed_at))
    return result.scalars().all()


def add_status_transition(
    db: AsyncSession,
    *,
    task_id: UUID,
    from_status: Optional[str],
    to_status: str,
    changed_by_user_id: Optional[UUID],
    changed_at,
) -> None:
    db.add(
        TaskStatusTransition(
            task_id=task_id,
            from_status=from_status,
            to_status=to_status,
            changed_by_user_id=changed_by_user_id,
            changed_at=changed_at,
        )
    )


async def get_tasks_by_ids(
    db: AsyncSession, task_ids: List[UUID]
) -> Sequence[TaskItem]:
    if not task_ids:
        return []
    result = await db.execute(
        select(TaskItem).options(*_TASK_LOAD_OPTIONS).where(TaskItem.id.in_(task_ids))
    )
    return result.scalars().unique().all()


async def list_tasks_by_phase(db: AsyncSession, phase_id: UUID) -> Sequence[TaskItem]:
    result = await db.execute(
        select(TaskItem)
        .options(*_TASK_LOAD_OPTIONS)
        .where(TaskItem.phase_id == phase_id)
        .order_by(TaskItem.board_order, TaskItem.created_at, TaskItem.id)
    )
    return result.scalars().unique().all()


async def list_tasks_by_project(
    db: AsyncSession, project_id: UUID
) -> Sequence[TaskItem]:
    result = await db.execute(
        select(TaskItem)
        .join(Phase, TaskItem.phase_id == Phase.id)
        .options(*_TASK_LOAD_OPTIONS)
        .where(Phase.project_id == project_id)
        .order_by(TaskItem.board_order, TaskItem.created_at, TaskItem.id)
    )
    return result.scalars().unique().all()


async def list_tasks_by_assignee(
    db: AsyncSession, user_id: UUID, statuses: Optional[List[str]] = None
) -> Sequence[TaskItem]:
    stmt = (
        select(TaskItem)
        .join(TaskAssignee, TaskAssignee.task_id == TaskItem.id)
        .options(*_TASK_LOAD_OPTIONS)
        .where(TaskAssignee.user_id == user_id)
    )
    if statuses:
        stmt = stmt.where(TaskItem.status.in_(statuses))
    result = await db.execute(stmt)
    return result.scalars().unique().all()


async def set_task_assignees(
    db: AsyncSession, task_id: UUID, user_ids: List[UUID]
) -> None:
    result = await db.execute(
        select(TaskAssignee).where(TaskAssignee.task_id == task_id)
    )
    for existing in result.scalars().all():
        await db.delete(existing)
    await db.flush()
    for user_id in user_ids:
        db.add(TaskAssignee(task_id=task_id, user_id=user_id))


async def set_task_labels(
    db: AsyncSession, task_id: UUID, label_ids: List[UUID]
) -> None:
    result = await db.execute(
        select(TaskLabelAssignment).where(TaskLabelAssignment.task_id == task_id)
    )
    for existing in result.scalars().all():
        await db.delete(existing)
    await db.flush()
    for label_id in dict.fromkeys(label_ids):
        db.add(TaskLabelAssignment(task_id=task_id, label_id=label_id))


async def set_task_checklist(
    db: AsyncSession, task_id: UUID, items: List[ChecklistItem]
) -> None:
    result = await db.execute(
        select(ChecklistItem)
        .where(ChecklistItem.task_id == task_id)
        .order_by(ChecklistItem.order, ChecklistItem.id)
    )
    existing = list(result.scalars().all())
    for index, item in enumerate(items):
        if index < len(existing):
            current = existing[index]
            current.text = item.text
            current.order = item.order
        else:
            item.task_id = task_id
            db.add(item)
    for stale in existing[len(items) :]:
        await db.delete(stale)


# ---------- Dependencies ----------
async def create_dependency(
    db: AsyncSession, dependency: TaskDependency
) -> TaskDependency:
    db.add(dependency)
    await db.commit()
    await db.refresh(dependency)
    return dependency


async def get_dependency(
    db: AsyncSession, dependency_id: UUID
) -> Optional[TaskDependency]:
    result = await db.execute(
        select(TaskDependency).where(TaskDependency.id == dependency_id)
    )
    return result.scalar_one_or_none()


async def list_dependencies_for_project(
    db: AsyncSession, project_id: UUID
) -> Sequence[TaskDependency]:
    result = await db.execute(
        select(TaskDependency)
        .join(TaskItem, TaskDependency.successor_task_id == TaskItem.id)
        .join(Phase, TaskItem.phase_id == Phase.id)
        .where(Phase.project_id == project_id)
    )
    return result.scalars().unique().all()


async def delete_dependency(db: AsyncSession, dependency: TaskDependency) -> None:
    await db.delete(dependency)
    await db.commit()


async def remove_project_member(
    db: AsyncSession, project_id: UUID, user_id: UUID
) -> bool:
    result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id, ProjectMember.user_id == user_id
        )
    )
    member = result.scalar_one_or_none()
    if member is None:
        return False
    await db.delete(member)
    await db.commit()
    return True


# ---------- Milestones ----------
async def create_milestone(db: AsyncSession, milestone: Milestone) -> Milestone:
    db.add(milestone)
    await db.commit()
    await db.refresh(milestone)
    return milestone


async def get_milestone(db: AsyncSession, milestone_id: UUID) -> Optional[Milestone]:
    result = await db.execute(select(Milestone).where(Milestone.id == milestone_id))
    return result.scalar_one_or_none()


async def list_milestones_by_project(
    db: AsyncSession, project_id: UUID
) -> Sequence[Milestone]:
    result = await db.execute(
        select(Milestone)
        .where(Milestone.project_id == project_id)
        .order_by(Milestone.sequence, Milestone.due_date)
    )
    return result.scalars().all()


async def list_all_milestones(db: AsyncSession) -> Sequence[Milestone]:
    result = await db.execute(
        select(Milestone).order_by(Milestone.sequence, Milestone.due_date)
    )
    return result.scalars().all()


async def delete_milestone(db: AsyncSession, milestone: Milestone) -> None:
    await db.delete(milestone)
    await db.commit()


# ---------- Project dependencies ----------
async def create_project_dependency(
    db: AsyncSession, dependency: ProjectDependency
) -> ProjectDependency:
    db.add(dependency)
    await db.commit()
    await db.refresh(dependency)
    return dependency


async def get_project_dependency(
    db: AsyncSession, dependency_id: UUID
) -> Optional[ProjectDependency]:
    result = await db.execute(
        select(ProjectDependency).where(ProjectDependency.id == dependency_id)
    )
    return result.scalar_one_or_none()


async def list_project_dependencies(db: AsyncSession) -> Sequence[ProjectDependency]:
    result = await db.execute(select(ProjectDependency))
    return result.scalars().all()


async def delete_project_dependency(
    db: AsyncSession, dependency: ProjectDependency
) -> None:
    await db.delete(dependency)
    await db.commit()
