"""Organization module business logic."""

from __future__ import annotations

from typing import List, Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError
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
    EmployeeContext,
    EmployeeCreate,
    EmployeeRead,
    SkillAssignment,
    SkillCreate,
    SkillRead,
    TeamCreate,
    TeamRead,
)


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


async def list_departments(db: AsyncSession) -> List[DepartmentRead]:
    return [DepartmentRead.model_validate(d) for d in await repo.list_departments(db)]


async def get_department(db: AsyncSession, department_id: UUID) -> DepartmentRead:
    department = await repo.get_department(db, department_id)
    if department is None:
        raise NotFoundError("Department", department_id)
    return DepartmentRead.model_validate(department)


async def get_all_departments_lookup(db: AsyncSession) -> List[DepartmentLookup]:
    departments = await repo.list_departments(db)
    return [DepartmentLookup(id=d.id, name=d.name) for d in departments]


async def create_team(db: AsyncSession, payload: TeamCreate) -> TeamRead:
    department = await repo.get_department(db, payload.department_id)
    if department is None:
        raise NotFoundError("Department", payload.department_id)
    team = Team(**payload.model_dump())
    db.add(team)
    await db.commit()
    await db.refresh(team)
    return TeamRead.model_validate(team)


async def list_teams(
    db: AsyncSession, department_id: Optional[UUID] = None
) -> List[TeamRead]:
    return [
        TeamRead.model_validate(t) for t in await repo.list_teams(db, department_id)
    ]


async def get_team(db: AsyncSession, team_id: UUID) -> TeamRead:
    team = await repo.get_team(db, team_id)
    if team is None:
        raise NotFoundError("Team", team_id)
    return TeamRead.model_validate(team)


async def create_employee(db: AsyncSession, payload: EmployeeCreate) -> EmployeeRead:
    existing = await repo.get_employee_by_user_id(db, payload.user_id)
    if existing is not None:
        raise ConflictError("An employee profile already exists for this user.")
    if payload.team_id is not None and await repo.get_team(db, payload.team_id) is None:
        raise NotFoundError("Team", payload.team_id)
    if (
        payload.manager_employee_id is not None
        and await repo.get_employee(db, payload.manager_employee_id) is None
    ):
        raise NotFoundError("Employee", payload.manager_employee_id)

    employee = Employee(**payload.model_dump())
    db.add(employee)
    await db.commit()
    await db.refresh(employee)
    return EmployeeRead.model_validate(employee)


async def list_employees(
    db: AsyncSession, team_id: Optional[UUID] = None
) -> List[EmployeeRead]:
    return [
        EmployeeRead.model_validate(e) for e in await repo.list_employees(db, team_id)
    ]


async def get_employee(db: AsyncSession, employee_id: UUID) -> EmployeeRead:
    employee = await repo.get_employee(db, employee_id)
    if employee is None:
        raise NotFoundError("Employee", employee_id)
    return EmployeeRead.model_validate(employee)


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
    department = await repo.get_department(db, team.department_id) if team else None
    manager_user_id = None
    if employee.manager_employee_id is not None:
        manager = await repo.get_employee(db, employee.manager_employee_id)
        manager_user_id = manager.user_id if manager else None

    return EmployeeContext(
        user_id=user_id,
        department_id=department.id if department else None,
        department_name=department.name if department else None,
        team_id=team.id if team else None,
        team_name=team.name if team else None,
        manager_user_id=manager_user_id,
        job_title=employee.job_title,
    )
