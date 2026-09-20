"""Data-access functions for the Organization module."""

from __future__ import annotations

from typing import Optional, Sequence
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.organization.models import (
    Department,
    Employee,
    EmployeeSkill,
    Skill,
    Team,
)


async def list_departments(db: AsyncSession) -> Sequence[Department]:
    result = await db.execute(select(Department).order_by(Department.name))
    return result.scalars().all()


async def get_department(db: AsyncSession, department_id: UUID) -> Optional[Department]:
    result = await db.execute(select(Department).where(Department.id == department_id))
    return result.scalar_one_or_none()


async def get_department_by_name(db: AsyncSession, name: str) -> Optional[Department]:
    result = await db.execute(select(Department).where(Department.name.ilike(name.strip())))
    return result.scalar_one_or_none()


async def get_department_by_head_user_id(db: AsyncSession, user_id: UUID) -> Optional[Department]:
    result = await db.execute(select(Department).where(Department.head_of_department_user_id == user_id))
    return result.scalar_one_or_none()


async def list_teams(
    db: AsyncSession, department_id: Optional[UUID] = None
) -> Sequence[Team]:
    stmt = select(Team)
    if department_id:
        stmt = stmt.where(Team.department_id == department_id)
    result = await db.execute(stmt.order_by(Team.name))
    return result.scalars().all()


async def get_team(db: AsyncSession, team_id: UUID) -> Optional[Team]:
    result = await db.execute(select(Team).where(Team.id == team_id))
    return result.scalar_one_or_none()


async def list_employees(
    db: AsyncSession,
    team_id: Optional[UUID] = None,
    department_id: Optional[UUID] = None,
) -> Sequence[Employee]:
    stmt = select(Employee)
    if department_id:
        stmt = stmt.where(Employee.department_id == department_id)
    if team_id:
        stmt = stmt.where(Employee.team_id == team_id)
    result = await db.execute(stmt)
    return result.scalars().all()


async def get_employee_by_user_id(
    db: AsyncSession, user_id: UUID
) -> Optional[Employee]:
    result = await db.execute(select(Employee).where(Employee.user_id == user_id))
    return result.scalar_one_or_none()


async def get_employee(db: AsyncSession, employee_id: UUID) -> Optional[Employee]:
    result = await db.execute(select(Employee).where(Employee.id == employee_id))
    return result.scalar_one_or_none()


async def delete_department(db: AsyncSession, department: Department) -> None:
    await db.delete(department)
    await db.commit()


async def delete_team(db: AsyncSession, team: Team) -> None:
    await db.delete(team)
    await db.commit()


async def list_skills(db: AsyncSession) -> Sequence[Skill]:
    result = await db.execute(select(Skill).order_by(Skill.name))
    return result.scalars().all()


async def get_skill(db: AsyncSession, skill_id: UUID) -> Optional[Skill]:
    result = await db.execute(select(Skill).where(Skill.id == skill_id))
    return result.scalar_one_or_none()
