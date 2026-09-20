"""Organization module business logic."""

from __future__ import annotations

from typing import List, Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError, ValidationAppError
from app.modules.organization import repository as repo
from app.modules.organization.models import (
    Department,
    Employee,
    EmployeeSkill,
    Skill,
    Team,
)
from app.modules.organization.schemas import (
    DepartmentCreate,
    DepartmentLookup,
    DepartmentRead,
    DepartmentUpdate,
    EmployeeContext,
    EmployeeCreate,
    EmployeeRead,
    EmployeeUpdate,
    OrgTreeNode,
    OrgTreeResponse,
    SkillAssignment,
    SkillCreate,
    SkillRead,
    TeamCreate,
    TeamRead,
    TeamUpdate,
)


CANONICAL_DEPARTMENTS = [
    {
        "name": "Technical",
        "description": "Software engineering, core architecture, APIs, DevOps, and platform infrastructure.",
    },
    {
        "name": "Marketing",
        "description": "Brand marketing, growth strategies, campaigns, and go-to-market execution.",
    },
    {
        "name": "Operations",
        "description": "Business operations, workflows, incident management, and operational playbooks.",
    },
    {
        "name": "Platform",
        "description": "Core platform development, app-level documentation, and shared services.",
    },
    {
        "name": "Business",
        "description": "Strategic planning, executive roadmaps, financials, client relations, and KPIs.",
    },
    {
        "name": "Designs",
        "description": "UI/UX design, design system, tokens, Figma assets, and creative design.",
    },
]


async def seed_canonical_departments(
    db: AsyncSession, admin_user_id: Optional[UUID] = None
) -> dict[str, Department]:
    dept_map: dict[str, Department] = {}
    for d_data in CANONICAL_DEPARTMENTS:
        dept = await repo.get_department_by_name(db, d_data["name"])
        if dept is None:
            dept = Department(
                name=d_data["name"],
                description=d_data["description"],
                head_of_department_user_id=admin_user_id,
            )
            db.add(dept)
            await db.flush()
        else:
            if admin_user_id and not dept.head_of_department_user_id:
                dept.head_of_department_user_id = admin_user_id
        dept_map[d_data["name"]] = dept
    await db.commit()
    return dept_map


async def create_department(
    db: AsyncSession, payload: DepartmentCreate
) -> DepartmentRead:
    existing = [
        d
        for d in await repo.list_departments(db)
        if d.name.lower() == payload.name.lower()
    ]
    if existing:
        raise ConflictError(f"Department '{payload.name}' already exists.")
    department = Department(**payload.model_dump())
    db.add(department)
    await db.commit()
    await db.refresh(department)
    return DepartmentRead.model_validate(department)


async def update_department(
    db: AsyncSession, department_id: UUID, payload: DepartmentUpdate
) -> DepartmentRead:
    department = await repo.get_department(db, department_id)
    if department is None:
        raise NotFoundError("Department", department_id)
    changes = payload.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(department, field, value)
    await db.commit()
    await db.refresh(department)
    return DepartmentRead.model_validate(department)


async def is_department_manager(
    db: AsyncSession, user_id: UUID, department_id: UUID
) -> bool:
    department = await repo.get_department(db, department_id)
    if department and department.head_of_department_user_id == user_id:
        return True
    return False


async def delete_department(db: AsyncSession, department_id: UUID) -> None:
    department = await repo.get_department(db, department_id)
    if department is None:
        raise NotFoundError("Department", department_id)
    await repo.delete_department(db, department)


async def _enrich_department_read(db: AsyncSession, dept: Department) -> DepartmentRead:
    from app.modules.identity.models import User
    from sqlalchemy import select

    head_name = None
    if dept.head_of_department_user_id:
        res = await db.execute(select(User).where(User.id == dept.head_of_department_user_id))
        head_user = res.scalar_one_or_none()
        if head_user:
            head_name = head_user.full_name

    teams = await repo.list_teams(db, dept.id)
    employees = await repo.list_employees(db, department_id=dept.id)

    read = DepartmentRead.model_validate(dept)
    read.head_of_department_name = head_name
    read.teams_count = len(teams)
    read.members_count = len(employees)
    return read


async def list_departments(db: AsyncSession) -> List[DepartmentRead]:
    depts = await repo.list_departments(db)
    return [await _enrich_department_read(db, d) for d in depts]


async def get_department(db: AsyncSession, department_id: UUID) -> DepartmentRead:
    department = await repo.get_department(db, department_id)
    if department is None:
        raise NotFoundError("Department", department_id)
    return await _enrich_department_read(db, department)


async def get_all_departments_lookup(db: AsyncSession) -> List[DepartmentLookup]:
    departments = await repo.list_departments(db)
    return [DepartmentLookup(id=d.id, name=d.name) for d in departments]


async def _enrich_team_read(db: AsyncSession, team: Team) -> TeamRead:
    from app.modules.identity.models import User
    from sqlalchemy import select

    lead_name = None
    if team.lead_user_id:
        res = await db.execute(select(User).where(User.id == team.lead_user_id))
        lead_user = res.scalar_one_or_none()
        if lead_user:
            lead_name = lead_user.full_name

    dept = await repo.get_department(db, team.department_id)
    dept_name = dept.name if dept else None
    employees = await repo.list_employees(db, team_id=team.id)

    read = TeamRead.model_validate(team)
    read.lead_user_name = lead_name
    read.department_name = dept_name
    read.member_count = len(employees)
    return read


async def create_team(db: AsyncSession, payload: TeamCreate) -> TeamRead:
    department = await repo.get_department(db, payload.department_id)
    if department is None:
        raise NotFoundError("Department", payload.department_id)
    team = Team(**payload.model_dump())
    db.add(team)
    await db.commit()
    await db.refresh(team)
    return await _enrich_team_read(db, team)


async def update_team(
    db: AsyncSession, team_id: UUID, payload: TeamUpdate
) -> TeamRead:
    team = await repo.get_team(db, team_id)
    if team is None:
        raise NotFoundError("Team", team_id)
    changes = payload.model_dump(exclude_unset=True)
    if "department_id" in changes and changes["department_id"]:
        dept = await repo.get_department(db, changes["department_id"])
        if not dept:
            raise NotFoundError("Department", changes["department_id"])
    for field, value in changes.items():
        setattr(team, field, value)
    await db.commit()
    await db.refresh(team)
    return await _enrich_team_read(db, team)


async def delete_team(db: AsyncSession, team_id: UUID) -> None:
    team = await repo.get_team(db, team_id)
    if team is None:
        raise NotFoundError("Team", team_id)
    await repo.delete_team(db, team)


async def list_teams(
    db: AsyncSession, department_id: Optional[UUID] = None
) -> List[TeamRead]:
    teams = await repo.list_teams(db, department_id)
    return [await _enrich_team_read(db, t) for t in teams]


async def get_team(db: AsyncSession, team_id: UUID) -> TeamRead:
    team = await repo.get_team(db, team_id)
    if team is None:
        raise NotFoundError("Team", team_id)
    return await _enrich_team_read(db, team)


async def create_employee(db: AsyncSession, payload: EmployeeCreate) -> EmployeeRead:
    existing = await repo.get_employee_by_user_id(db, payload.user_id)
    if existing is not None:
        raise ConflictError("An employee profile already exists for this user.")

    dept_id = payload.department_id
    if payload.team_id is not None:
        team = await repo.get_team(db, payload.team_id)
        if team is None:
            raise NotFoundError("Team", payload.team_id)
        if dept_id is None:
            dept_id = team.department_id
    elif dept_id is not None:
        if await repo.get_department(db, dept_id) is None:
            raise NotFoundError("Department", dept_id)

    if (
        payload.manager_employee_id is not None
        and await repo.get_employee(db, payload.manager_employee_id) is None
    ):
        raise NotFoundError("Employee", payload.manager_employee_id)

    data = payload.model_dump()
    data["department_id"] = dept_id
    employee = Employee(**data)
    db.add(employee)
    await db.commit()
    await db.refresh(employee)
    return await _enrich_employee_read(db, employee)


async def update_employee(
    db: AsyncSession, employee_id: UUID, payload: EmployeeUpdate
) -> EmployeeRead:
    employee = await repo.get_employee(db, employee_id)
    if employee is None:
        raise NotFoundError("Employee", employee_id)
    changes = payload.model_dump(exclude_unset=True)
    if "team_id" in changes and changes["team_id"]:
        team = await repo.get_team(db, changes["team_id"])
        if not team:
            raise NotFoundError("Team", changes["team_id"])
        if not changes.get("department_id"):
            changes["department_id"] = team.department_id
    if "department_id" in changes and changes["department_id"]:
        dept = await repo.get_department(db, changes["department_id"])
        if not dept:
            raise NotFoundError("Department", changes["department_id"])
    for field, value in changes.items():
        setattr(employee, field, value)
    await db.commit()
    await db.refresh(employee)
    return await _enrich_employee_read(db, employee)


async def _enrich_employee_read(db: AsyncSession, employee: Employee) -> EmployeeRead:
    dept_name = None
    team_name = None
    if employee.department_id:
        dept = await repo.get_department(db, employee.department_id)
        dept_name = dept.name if dept else None
    elif employee.team_id:
        team = await repo.get_team(db, employee.team_id)
        if team:
            team_name = team.name
            dept = await repo.get_department(db, team.department_id)
            dept_name = dept.name if dept else None

    if employee.team_id and not team_name:
        team = await repo.get_team(db, employee.team_id)
        team_name = team.name if team else None

    read = EmployeeRead.model_validate(employee)
    read.department_name = dept_name
    read.team_name = team_name
    return read


async def list_employees(
    db: AsyncSession,
    team_id: Optional[UUID] = None,
    department_id: Optional[UUID] = None,
) -> List[EmployeeRead]:
    employees = await repo.list_employees(db, team_id=team_id, department_id=department_id)
    return [await _enrich_employee_read(db, e) for e in employees]


async def resolve_active_team_user_ids(
    db: AsyncSession, team_ids: List[UUID]
) -> List[UUID]:
    """Resolve ticket recipients from teams while rejecting stale IDs."""
    resolved: set[UUID] = set()
    for team_id in dict.fromkeys(team_ids):
        team = await repo.get_team(db, team_id)
        if team is None:
            raise NotFoundError("Team", team_id)
        employees = await repo.list_employees(db, team_id=team_id)
        resolved.update(
            employee.user_id
            for employee in employees
            if employee.status.strip().lower() == "active"
        )
    return sorted(resolved, key=str)


async def get_employee(db: AsyncSession, employee_id: UUID) -> EmployeeRead:
    employee = await repo.get_employee(db, employee_id)
    if employee is None:
        raise NotFoundError("Employee", employee_id)
    return await _enrich_employee_read(db, employee)


async def assign_skill(
    db: AsyncSession, employee_id: UUID, payload: SkillAssignment
) -> None:
    employee = await repo.get_employee(db, employee_id)
    if employee is None:
        raise NotFoundError("Employee", employee_id)
    skill = await repo.get_skill(db, payload.skill_id)
    if skill is None:
        raise NotFoundError("Skill", payload.skill_id)
    db.add(
        EmployeeSkill(
            employee_id=employee_id,
            skill_id=payload.skill_id,
            proficiency_level=payload.proficiency_level,
        )
    )
    await db.commit()


async def create_skill(db: AsyncSession, payload: SkillCreate) -> SkillRead:
    skill = Skill(**payload.model_dump())
    db.add(skill)
    await db.commit()
    await db.refresh(skill)
    return SkillRead.model_validate(skill)


async def list_skills(db: AsyncSession) -> List[SkillRead]:
    return [SkillRead.model_validate(s) for s in await repo.list_skills(db)]


async def get_employee_context(
    db: AsyncSession, user_id: UUID
) -> Optional[EmployeeContext]:
    """Cross-module contract consumed by Analytics/Blockers for department
    roll-ups (bottleneck-by-department reporting)."""
    employee = await repo.get_employee_by_user_id(db, user_id)
    if employee is None:
        return None

    team = await repo.get_team(db, employee.team_id) if employee.team_id else None
    department = None
    if employee.department_id:
        department = await repo.get_department(db, employee.department_id)
    elif team:
        department = await repo.get_department(db, team.department_id)

    manager_user_id = None
    manager_name = None
    manager_email = None
    if employee.manager_employee_id is not None:
        manager = await repo.get_employee(db, employee.manager_employee_id)
        if manager and manager.user_id:
            manager_user_id = manager.user_id
            from sqlalchemy import select
            from app.modules.identity.models import User

            res = await db.execute(select(User).where(User.id == manager.user_id))
            mgr_u = res.scalar_one_or_none()
            if mgr_u:
                manager_name = mgr_u.full_name
                manager_email = mgr_u.email

    return EmployeeContext(
        user_id=user_id,
        department_id=department.id if department else None,
        department_name=department.name if department else None,
        team_id=team.id if team else None,
        team_name=team.name if team else None,
        manager_user_id=manager_user_id,
        manager_name=manager_name,
        manager_email=manager_email,
        job_title=employee.job_title,
    )


async def get_organization_tree(db: AsyncSession) -> OrgTreeResponse:
    """Builds the full hierarchical tree for HiBob-style Org Chart visualization."""
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
    from app.modules.identity.models import User, UserRole

    # Fetch all active users with roles
    user_stmt = (
        select(User)
        .options(selectinload(User.roles).selectinload(UserRole.role))
        .where(User.is_active.is_(True))
        .order_by(User.first_name, User.last_name)
    )
    users_res = await db.execute(user_stmt)
    all_users = users_res.scalars().all()

    depts = list(await repo.list_departments(db))
    teams = list(await repo.list_teams(db))
    employees = list(await repo.list_employees(db))

    dept_map = {d.id: d for d in depts}
    team_map = {t.id: t for t in teams}
    user_map = {u.id: u for u in all_users}
    emp_by_user = {e.user_id: e for e in employees}
    emp_by_id = {e.id: e for e in employees}

    nodes_by_user_id: dict[UUID, OrgTreeNode] = {}

    for u in all_users:
        emp = emp_by_user.get(u.id)
        dept_id = emp.department_id if emp and emp.department_id else None
        team_id = emp.team_id if emp and emp.team_id else None
        if not dept_id and team_id and team_id in team_map:
            dept_id = team_map[team_id].department_id

        dept_name = dept_map[dept_id].name if dept_id and dept_id in dept_map else None
        team_name = team_map[team_id].name if team_id and team_id in team_map else None

        mgr_user_id = None
        mgr_name = None
        if emp and emp.manager_employee_id and emp.manager_employee_id in emp_by_id:
            mgr_emp = emp_by_id[emp.manager_employee_id]
            if mgr_emp.user_id in user_map:
                mgr_user_id = mgr_emp.user_id
                mgr_name = user_map[mgr_emp.user_id].full_name

        roles = [ur.role.name for ur in u.roles if ur.role]

        node = OrgTreeNode(
            id=u.id,
            employee_id=emp.id if emp else None,
            full_name=u.full_name,
            first_name=u.first_name,
            last_name=u.last_name,
            email=u.email,
            job_title=emp.job_title if emp and emp.job_title else u.job_title,
            avatar_url=u.avatar_url,
            bio=u.bio,
            department_id=dept_id,
            department_name=dept_name,
            team_id=team_id,
            team_name=team_name,
            manager_user_id=mgr_user_id,
            manager_name=mgr_name,
            presence_status=u.presence_status or "offline",
            status_emoji=u.status_emoji,
            status_text=u.status_text,
            role_names=roles,
            direct_reports_count=0,
            direct_reports=[],
        )
        nodes_by_user_id[u.id] = node

    # Build parent-child hierarchy
    roots: list[OrgTreeNode] = []
    unassigned: list[OrgTreeNode] = []

    for uid, node in nodes_by_user_id.items():
        if (
            node.manager_user_id
            and node.manager_user_id in nodes_by_user_id
            and node.manager_user_id != uid
        ):
            parent = nodes_by_user_id[node.manager_user_id]
            parent.direct_reports.append(node)
            parent.direct_reports_count += 1
        else:
            is_exec = (
                "SuperAdmin" in node.role_names
                or "CLevel" in node.role_names
                or "CompanyManager" in node.role_names
            )
            if is_exec:
                roots.append(node)
            elif node.department_id or node.team_id:
                roots.append(node)
            else:
                unassigned.append(node)

    # If no roots identified, place all non-assigned as roots
    if not roots and nodes_by_user_id:
        roots = list(nodes_by_user_id.values())

    return OrgTreeResponse(
        roots=roots,
        total_departments=len(depts),
        total_teams=len(teams),
        total_employees=len(all_users),
        unassigned=unassigned,
    )
