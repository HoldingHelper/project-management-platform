"""Pydantic schemas for the Organization module."""

from __future__ import annotations

from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class DepartmentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    description: Optional[str] = None
    head_of_department_user_id: Optional[UUID] = None


class DepartmentUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=150)
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


class TeamUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=150)
    description: Optional[str] = None
    department_id: Optional[UUID] = None
    lead_user_id: Optional[UUID] = None


class TeamRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    department_id: UUID
    name: str
    description: Optional[str] = None
    lead_user_id: Optional[UUID] = None
    lead_user_name: Optional[str] = None
    department_name: Optional[str] = None
    member_count: Optional[int] = 0


class DepartmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    description: Optional[str] = None
    head_of_department_user_id: Optional[UUID] = None
    head_of_department_name: Optional[str] = None
    teams_count: Optional[int] = 0
    members_count: Optional[int] = 0


class SkillAssignment(BaseModel):
    skill_id: UUID
    proficiency_level: int = Field(default=1, ge=1, le=5)


class EmployeeCreate(BaseModel):
    user_id: UUID
    department_id: Optional[UUID] = None
    team_id: Optional[UUID] = None
    manager_employee_id: Optional[UUID] = None
    job_title: Optional[str] = None
    hire_date: Optional[str] = None


class EmployeeUpdate(BaseModel):
    department_id: Optional[UUID] = None
    team_id: Optional[UUID] = None
    manager_employee_id: Optional[UUID] = None
    job_title: Optional[str] = None
    hire_date: Optional[str] = None
    status: Optional[str] = None


class EmployeeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    user_id: UUID
    department_id: Optional[UUID] = None
    department_name: Optional[str] = None
    team_id: Optional[UUID] = None
    team_name: Optional[str] = None
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
    manager_name: Optional[str] = None
    manager_email: Optional[str] = None
    job_title: Optional[str] = None


class OrgTreeNode(BaseModel):
    """Hierarchical node for HiBob-like Org Chart Tree."""

    id: UUID  # user_id
    employee_id: Optional[UUID] = None
    full_name: str
    first_name: str
    last_name: str
    email: str
    job_title: Optional[str] = None
    avatar_url: Optional[str] = None
    bio: Optional[str] = None
    department_id: Optional[UUID] = None
    department_name: Optional[str] = None
    team_id: Optional[UUID] = None
    team_name: Optional[str] = None
    manager_user_id: Optional[UUID] = None
    manager_name: Optional[str] = None
    presence_status: Optional[str] = "offline"
    status_text: Optional[str] = None
    status_emoji: Optional[str] = None
    role_names: List[str] = Field(default_factory=list)
    direct_reports_count: int = 0
    direct_reports: List["OrgTreeNode"] = Field(default_factory=list)


class OrgTreeResponse(BaseModel):
    """Response containing root executives, department stats, and unassigned users."""

    roots: List[OrgTreeNode]
    total_departments: int
    total_teams: int
    total_employees: int
    unassigned: List[OrgTreeNode] = Field(default_factory=list)
