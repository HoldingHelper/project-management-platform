"""Organization module ORM models -- schema `organization`.

Owns the company structure (Departments -> Teams -> Employees) and the
manager hierarchy / skills used for reporting/aggregation. `Employee.user_id`
references `identity.users.id` by UUID value only (no cross-schema FK), kept
in sync via the `UserProvisioned` integration event.
"""

from __future__ import annotations

import uuid
from typing import List, Optional

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.shared.base_model import AuditableMixin, TimestampMixin, UUIDPKMixin

SCHEMA = "organization"


class Department(Base, UUIDPKMixin, TimestampMixin, AuditableMixin):
    __tablename__ = "departments"
    __table_args__ = (
        UniqueConstraint("name", name="uq_departments_name"),
        {"schema": SCHEMA},
    )

    name: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    head_of_department_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )

    teams: Mapped[List["Team"]] = relationship(
        back_populates="department", cascade="all, delete-orphan"
    )


class Team(Base, UUIDPKMixin, TimestampMixin, AuditableMixin):
    __tablename__ = "teams"
    __table_args__ = {"schema": SCHEMA}

    department_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.departments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    lead_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )

    department: Mapped["Department"] = relationship(back_populates="teams")
    employees: Mapped[List["Employee"]] = relationship(back_populates="team")


class Employee(Base, UUIDPKMixin, TimestampMixin, AuditableMixin):
    __tablename__ = "employees"
    __table_args__ = (
        UniqueConstraint("user_id", name="uq_employees_user_id"),
        {"schema": SCHEMA},
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    department_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.departments.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    team_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.teams.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    manager_employee_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.employees.id", ondelete="SET NULL"),
        nullable=True,
    )
    job_title: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    hire_date: Mapped[Optional[str]] = mapped_column(
        String(10), nullable=True
    )  # ISO date, kept simple
    status: Mapped[str] = mapped_column(String(30), default="Active", nullable=False)

    department: Mapped[Optional["Department"]] = relationship()
    team: Mapped[Optional["Team"]] = relationship(back_populates="employees")
    manager: Mapped[Optional["Employee"]] = relationship(remote_side="Employee.id")
    skills: Mapped[List["EmployeeSkill"]] = relationship(
        back_populates="employee", cascade="all, delete-orphan"
    )


class Skill(Base, UUIDPKMixin):
    __tablename__ = "skills"
    __table_args__ = (
        UniqueConstraint("name", name="uq_skills_name"),
        {"schema": SCHEMA},
    )

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    category: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)


class EmployeeSkill(Base):
    __tablename__ = "employee_skills"
    __table_args__ = {"schema": SCHEMA}

    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.employees.id", ondelete="CASCADE"),
        primary_key=True,
    )
    skill_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.skills.id", ondelete="CASCADE"),
        primary_key=True,
    )
    proficiency_level: Mapped[int] = mapped_column(default=1, nullable=False)

    employee: Mapped["Employee"] = relationship(back_populates="skills")
    skill: Mapped["Skill"] = relationship()
