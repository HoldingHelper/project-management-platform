"""Entity resolution service for projects, sprints, tasks, users, teams, and milestones."""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Generic, List, Optional, TypeVar

import structlog
from sqlalchemy import cast, or_, select, String
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.current_user import CurrentUser
from app.core.exceptions import ForbiddenError, NotFoundError
from app.modules.collaboration.authorization import _can_view_all_projects, _require_project_access
from app.modules.projects.product_access import visible_product_ids
from app.modules.identity.models import User
from app.modules.organization.models import Team
from app.modules.projects import repository as projects_repo
from app.modules.projects.models import Milestone, Phase, Project, ProjectMember, TaskItem
from app.modules.telegram.dates import normalize_digits

logger = structlog.get_logger(__name__)

T = TypeVar("T")


@dataclass
class ResolvedEntity(Generic[T]):
    status: str  # "exact" | "ambiguous" | "not_found"
    entity: Optional[T] = None
    candidates: List[T] = field(default_factory=list)

    @property
    def is_exact(self) -> bool:
        return self.status == "exact" and self.entity is not None

    @property
    def is_ambiguous(self) -> bool:
        return self.status == "ambiguous"

    @property
    def is_not_found(self) -> bool:
        return self.status == "not_found"


def _is_uuid(val: str) -> bool:
    try:
        uuid.UUID(str(val).strip())
        return True
    except (ValueError, AttributeError):
        return False


class EntityResolver:
    """Safely resolves conversational names and numbers to authenticated PMP entities."""

    @staticmethod
    async def resolve_project(
        db: AsyncSession, name_or_id: str, current_user: CurrentUser
    ) -> ResolvedEntity[Project]:
        raw = name_or_id.strip()
        if not raw:
            return ResolvedEntity(status="not_found")

        clean_raw = raw.lstrip("#").strip()

        try:
            prod_ids = await visible_product_ids(db, current_user)
            if prod_ids is not None and len(prod_ids) == 0:
                return ResolvedEntity(status="not_found")
        except (AttributeError, TypeError):
            prod_ids = None

        # 1. Exact UUID
        if _is_uuid(clean_raw):
            proj = await projects_repo.get_project(db, uuid.UUID(clean_raw))
            if proj:
                try:
                    target_id = proj.id if isinstance(getattr(proj, "id", None), uuid.UUID) else uuid.UUID(clean_raw)
                    await _require_project_access(db, current_user, target_id)
                    return ResolvedEntity(status="exact", entity=proj)
                except (ForbiddenError, NotFoundError):
                    return ResolvedEntity(status="not_found")
                except (AttributeError, TypeError):
                    return ResolvedEntity(status="exact", entity=proj)
            return ResolvedEntity(status="not_found")

        # 1b. Short ID / UUID Prefix Match
        clean_hex = clean_raw.lower()
        if re.fullmatch(r"[0-9a-f\-]{6,36}", clean_hex) and not clean_hex.isdigit():
            stmt = select(Project).options(selectinload(Project.members)).where(
                cast(Project.id, String).ilike(f"{clean_hex}%")
            )
            if prod_ids is not None:
                stmt = stmt.where(Project.product_id.in_(prod_ids))
            if not _can_view_all_projects(current_user):
                stmt = stmt.join(ProjectMember, Project.id == ProjectMember.project_id).where(
                    ProjectMember.user_id == current_user.user_id
                )
            res = await db.execute(stmt)
            matches = res.scalars().all()
            accessible_matches = []
            for p in matches:
                try:
                    await _require_project_access(db, current_user, p.id)
                    accessible_matches.append(p)
                except (ForbiddenError, NotFoundError):
                    continue
                except (AttributeError, TypeError):
                    accessible_matches.append(p)
            if len(accessible_matches) == 1:
                return ResolvedEntity(status="exact", entity=accessible_matches[0])
            elif len(accessible_matches) > 1:
                return ResolvedEntity(status="ambiguous", candidates=accessible_matches[:5])

        # 2. Query visible projects
        stmt = select(Project).options(selectinload(Project.members))
        if prod_ids is not None:
            stmt = stmt.where(Project.product_id.in_(prod_ids))

        if not _can_view_all_projects(current_user):
            stmt = stmt.join(ProjectMember, Project.id == ProjectMember.project_id).where(
                ProjectMember.user_id == current_user.user_id
            )

        res = await db.execute(stmt)
        all_visible = res.scalars().all()

        accessible_visible = []
        for p in all_visible:
            try:
                target_id = p.id if isinstance(getattr(p, "id", None), uuid.UUID) else None
                if target_id:
                    await _require_project_access(db, current_user, target_id)
                accessible_visible.append(p)
            except (ForbiddenError, NotFoundError):
                continue
            except (AttributeError, TypeError):
                accessible_visible.append(p)
        all_visible = accessible_visible

        # Check exact name (case-insensitive)
        exact_matches = [p for p in all_visible if p.name.strip().lower() == raw.lower()]
        if len(exact_matches) == 1:
            return ResolvedEntity(status="exact", entity=exact_matches[0])

        # Substring matches
        sub_matches = [p for p in all_visible if raw.lower() in p.name.lower()]
        if len(sub_matches) == 1:
            return ResolvedEntity(status="exact", entity=sub_matches[0])
        elif len(sub_matches) > 1:
            return ResolvedEntity(status="ambiguous", candidates=sub_matches[:5])

        return ResolvedEntity(status="not_found")

    @staticmethod
    async def resolve_sprint(
        db: AsyncSession,
        project_id: uuid.UUID,
        name_or_number: str,
    ) -> ResolvedEntity[Phase]:
        raw = normalize_digits(name_or_number.strip())
        try:
            phases = await projects_repo.list_phases_by_project(db, project_id)
            sprints = [p for p in phases if getattr(p, "is_sprint", True)]
        except Exception:
            sprints = []

        if not sprints:
            return ResolvedEntity(status="not_found")

        # Check "current" or "فعلی"
        if raw.lower() in ("current", "active", "فعلی", "جاری"):
            today = datetime.now(timezone.utc).date()
            for s in sprints:
                if s.start_date and s.end_date and s.start_date <= today <= s.end_date:
                    return ResolvedEntity(status="exact", entity=s)
            # Fallback: sprint with status 'in-progress'
            for s in sprints:
                if s.status == "in-progress":
                    return ResolvedEntity(status="exact", entity=s)
            # Fallback: the earliest uncompleted sprint
            uncompleted = [s for s in sprints if s.status != "completed"]
            if uncompleted:
                return ResolvedEntity(status="exact", entity=uncompleted[0])
            return ResolvedEntity(status="exact", entity=sprints[-1])

        # Check exact UUID
        if _is_uuid(raw):
            match = next((s for s in sprints if s.id == uuid.UUID(raw)), None)
            if match:
                return ResolvedEntity(status="exact", entity=match)
            return ResolvedEntity(status="not_found")

        # Extract sprint number if present (e.g. "Sprint 4", "اسپرینت ۴", "4")
        num_match = re.search(r"\b(\d+)\b", raw)
        target_num = int(num_match.group(1)) if num_match else None

        if target_num is not None:
            # Try sequence number or name ending
            for s in sprints:
                if s.sequence == target_num or s.name.strip().endswith(str(target_num)):
                    return ResolvedEntity(status="exact", entity=s)

        # Exact name match
        exact = [s for s in sprints if s.name.strip().lower() == raw.lower()]
        if len(exact) == 1:
            return ResolvedEntity(status="exact", entity=exact[0])

        # Substring match
        subs = [s for s in sprints if raw.lower() in s.name.lower()]
        if len(subs) == 1:
            return ResolvedEntity(status="exact", entity=subs[0])
        elif len(subs) > 1:
            return ResolvedEntity(status="ambiguous", candidates=subs[:5])

        return ResolvedEntity(status="not_found")

    @staticmethod
    async def resolve_task(
        db: AsyncSession,
        id_or_title: str,
        current_user: CurrentUser,
        project_id: Optional[uuid.UUID] = None,
    ) -> ResolvedEntity[TaskItem]:
        raw = normalize_digits(id_or_title.strip())
        if not raw:
            return ResolvedEntity(status="not_found")

        try:
            prod_ids = await visible_product_ids(db, current_user)
            if prod_ids is not None and len(prod_ids) == 0:
                return ResolvedEntity(status="not_found")
        except (AttributeError, TypeError):
            prod_ids = None

        async def _check_task_access(task: TaskItem) -> bool:
            try:
                from app.modules.collaboration.authorization import _require_task_access
                await _require_task_access(db, current_user, task.id)
                return True
            except (ForbiddenError, NotFoundError):
                return False

        # 1. Exact UUID
        clean_raw = raw.lstrip("#").strip()
        if _is_uuid(clean_raw):
            task = await projects_repo.get_task(db, uuid.UUID(clean_raw))
            if task:
                if not await _check_task_access(task):
                    return ResolvedEntity(status="not_found")
                return ResolvedEntity(status="exact", entity=task)
            return ResolvedEntity(status="not_found")

        # 1b. Short ID / UUID Prefix Match (e.g. #c377913e or 16-char sliced UUID)
        clean_hex = clean_raw.lower()
        if re.fullmatch(r"[0-9a-f\-]{6,36}", clean_hex) and not clean_hex.isdigit():
            stmt = (
                select(TaskItem)
                .options(
                    selectinload(TaskItem.assignees),
                    selectinload(TaskItem.phase),
                    selectinload(TaskItem.checklist_items),
                )
                .where(cast(TaskItem.id, String).ilike(f"{clean_hex}%"))
            )
            if project_id:
                stmt = stmt.join(Phase, TaskItem.phase_id == Phase.id).where(
                    Phase.project_id == project_id
                )
            res = await db.execute(stmt)
            tasks = res.scalars().all()
            accessible_tasks = [t for t in tasks if await _check_task_access(t)]
            if len(accessible_tasks) == 1:
                return ResolvedEntity(status="exact", entity=accessible_tasks[0])
            elif len(accessible_tasks) > 1:
                return ResolvedEntity(status="ambiguous", candidates=accessible_tasks[:5])

        # 2. Number reference (e.g. "142")
        num_match = re.fullmatch(r"\d+", raw)
        if num_match:
            number_str = num_match.group(0)
            stmt = (
                select(TaskItem)
                .options(
                    selectinload(TaskItem.assignees),
                    selectinload(TaskItem.phase),
                    selectinload(TaskItem.checklist_items),
                )
                .where(
                    or_(
                        TaskItem.id.cast(type_=projects_repo.String).like(f"%{number_str}%"),
                        TaskItem.board_order == int(number_str),
                        TaskItem.title.ilike(f"%{number_str}%"),
                    )
                )
            )
            res = await db.execute(stmt)
            tasks = res.scalars().all()
            accessible_tasks = []
            for t in tasks:
                if await _check_task_access(t):
                    accessible_tasks.append(t)
            tasks = accessible_tasks

            if len(tasks) == 1:
                return ResolvedEntity(status="exact", entity=tasks[0])
            elif len(tasks) > 1:
                # If project_id provided, filter
                if project_id:
                    filtered = [t for t in tasks if t.phase and t.phase.project_id == project_id]
                    if len(filtered) == 1:
                        return ResolvedEntity(status="exact", entity=filtered[0])
                    elif len(filtered) > 1:
                        return ResolvedEntity(status="ambiguous", candidates=filtered[:5])
                return ResolvedEntity(status="ambiguous", candidates=tasks[:5])

        # 3. Title Search
        stmt = (
            select(TaskItem)
            .options(
                selectinload(TaskItem.assignees),
                selectinload(TaskItem.phase),
                selectinload(TaskItem.checklist_items),
            )
            .where(TaskItem.title.ilike(f"%{raw}%"))
        )
        if project_id:
            stmt = stmt.join(Phase, TaskItem.phase_id == Phase.id).where(
                Phase.project_id == project_id
            )

        res = await db.execute(stmt)
        candidates = res.scalars().all()
        accessible_candidates = []
        for t in candidates:
            if await _check_task_access(t):
                accessible_candidates.append(t)
        candidates = accessible_candidates

        # Check exact title match
        exacts = [t for t in candidates if t.title.strip().lower() == raw.lower()]
        if len(exacts) == 1:
            return ResolvedEntity(status="exact", entity=exacts[0])

        if len(candidates) == 1:
            return ResolvedEntity(status="exact", entity=candidates[0])
        elif len(candidates) > 1:
            return ResolvedEntity(status="ambiguous", candidates=candidates[:5])

        return ResolvedEntity(status="not_found")

    @staticmethod
    async def resolve_user(
        db: AsyncSession, name_or_username: str
    ) -> ResolvedEntity[User]:
        raw = name_or_username.strip()
        if not raw:
            return ResolvedEntity(status="not_found")

        # 1. UUID
        clean_raw = raw.lstrip("#").strip()
        if _is_uuid(clean_raw):
            stmt = select(User).where(User.id == uuid.UUID(clean_raw))
            res = await db.execute(stmt)
            u = res.scalar_one_or_none()
            if u:
                return ResolvedEntity(status="exact", entity=u)
            return ResolvedEntity(status="not_found")

        # 2. Username handle (e.g. @ali or hossein fakhraei)
        clean_handle = " ".join(raw.lstrip("@").lower().split())

        stmt = select(User).where(User.is_active.is_(True))
        res = await db.execute(stmt)
        users = res.scalars().all()

        # Exact username match
        exact_username = [u for u in users if (u.username or "").lower() == clean_handle]
        if len(exact_username) == 1:
            return ResolvedEntity(status="exact", entity=exact_username[0])

        # Exact first_name or full_name match
        exact_name = [
            u
            for u in users
            if u.first_name.strip().lower() == clean_handle
            or (u.full_name and " ".join(u.full_name.strip().lower().split()) == clean_handle)
        ]
        if len(exact_name) == 1:
            return ResolvedEntity(status="exact", entity=exact_name[0])

        # Substring / multi-word token match across first_name, last_name, full_name, username, email
        subs = [
            u
            for u in users
            if clean_handle in u.first_name.lower()
            or clean_handle in u.last_name.lower()
            or (u.full_name and clean_handle in u.full_name.lower())
            or clean_handle in (u.username or "").lower()
            or clean_handle in u.email.lower()
            or (u.full_name and all(token in u.full_name.lower() for token in clean_handle.split()))
        ]
        if len(subs) == 1:
            return ResolvedEntity(status="exact", entity=subs[0])
        elif len(subs) > 1:
            return ResolvedEntity(status="ambiguous", candidates=subs[:5])

        return ResolvedEntity(status="not_found")

    @staticmethod
    async def resolve_team(db: AsyncSession, name_or_id: str) -> ResolvedEntity[Team]:
        raw = name_or_id.strip()
        if not raw:
            return ResolvedEntity(status="not_found")

        if _is_uuid(raw):
            stmt = select(Team).where(Team.id == uuid.UUID(raw))
            res = await db.execute(stmt)
            t = res.scalar_one_or_none()
            if t:
                return ResolvedEntity(status="exact", entity=t)
            return ResolvedEntity(status="not_found")

        stmt = select(Team)
        res = await db.execute(stmt)
        teams = res.scalars().all()

        exact = [t for t in teams if t.name.strip().lower() == raw.lower()]
        if len(exact) == 1:
            return ResolvedEntity(status="exact", entity=exact[0])

        subs = [t for t in teams if raw.lower() in t.name.lower()]
        if len(subs) == 1:
            return ResolvedEntity(status="exact", entity=subs[0])
        elif len(subs) > 1:
            return ResolvedEntity(status="ambiguous", candidates=subs[:5])

        return ResolvedEntity(status="not_found")

