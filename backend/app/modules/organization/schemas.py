"""Pydantic schemas for the Organization module."""

from __future__ import annotations

from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class DepartmentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    description: Optional[str] = None
    head_of_department_user_id: Optional[UUID] = None


class DepartmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    description: Optional[str] = None
    head_of_department_user_id: Optional[UUID] = None


class DepartmentLookup(BaseModel):
    id: UUID
    name: str


class TeamCreate(BaseModel):
    department_id: UUID
    name: str = Field(min_length=1, max_length=150)
    description: Optional[str] = None
    lead_user_id: Optional[UUID] = None


class TeamRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    department_id: UUID
    name: str
    description: Optional[str] = None
    lead_user_id: Optional[UUID] = None


class SkillAssignment(BaseModel):
    skill_id: UUID
    proficiency_level: int = Field(default=1, ge=1, le=5)


class EmployeeCreate(BaseModel):
    user_id: UUID
    team_id: Optional[UUID] = None
    manager_employee_id: Optional[UUID] = None
    job_title: Optional[str] = None
    hire_date: Optional[str] = None


class EmployeeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    user_id: UUID
    team_id: Optional[UUID] = None
    manager_employee_id: Optional[UUID] = None
    job_title: Optional[str] = None
    hire_date: Optional[str] = None
    status: str


class SkillCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    category: Optional[str] = None


class SkillRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    category: Optional[str] = None


class EmployeeContext(BaseModel):
    """Cross-module read-model contract (mirrors `EmployeeContextDto`)."""

    user_id: UUID
    department_id: Optional[UUID] = None
    department_name: Optional[str] = None
    team_id: Optional[UUID] = None
    team_name: Optional[str] = None
    manager_user_id: Optional[UUID] = None
    job_title: Optional[str] = None
