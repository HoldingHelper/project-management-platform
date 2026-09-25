"""API contracts for the holding organization graph."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

NodeType = Literal[
    "holding", "function", "venture", "venture_function", "program", "project",
    "shared_initiative", "milestone", "workstream", "sprint", "task", "team", "doc_space",
]
Confidentiality = Literal["standard", "restricted", "board"]


class NodeCreate(BaseModel):
    type: NodeType
    parent_id: UUID | None = None
    name: str = Field(min_length=1, max_length=200)
    slug: str | None = Field(default=None, min_length=1, max_length=80, pattern=r"^[a-z0-9_]+$")
    confidentiality: Confidentiality = "standard"
    metadata_json: dict[str, Any] = Field(default_factory=dict)


class NodeUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    status: Literal["active", "archived"] | None = None
    confidentiality: Confidentiality | None = None
    metadata_json: dict[str, Any] | None = None


class NodeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    type: str
    parent_id: UUID | None
    path: str
    name: str
    slug: str
    status: str
    confidentiality: str
    metadata_json: dict[str, Any]
    acl_version: int
    source_type: str | None = None
    source_id: UUID | None = None
    created_at: datetime
    updated_at: datetime


class NodeMove(BaseModel):
    new_parent_id: UUID
    confirm: bool = False


class AccessDiff(BaseModel):
    node_id: UUID
    old_path: str
    new_path: str
    affected_nodes: int
    requires_confirmation: bool = True


class MembershipCreate(BaseModel):
    person_id: UUID
    node_id: UUID
    role: str = Field(min_length=2, max_length=40, pattern=r"^[a-z][a-z0-9_]+$")
    since: date = Field(default_factory=date.today)
    until: date | None = None

    @model_validator(mode="after")
    def dates_are_ordered(self) -> "MembershipCreate":
        if self.until and self.until < self.since:
            raise ValueError("Membership end date cannot precede its start date.")
        return self


class MembershipRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    person_id: UUID
    node_id: UUID
    role: str
    since: date
    until: date | None
    granted_by: UUID
    created_at: datetime


class AllocationCreate(BaseModel):
    person_id: UUID
    node_id: UUID
    percent: float = Field(gt=0, le=100)
    start_date: date
    end_date: date | None = None

    @model_validator(mode="after")
    def dates_are_ordered(self) -> "AllocationCreate":
        if self.end_date and self.end_date < self.start_date:
            raise ValueError("Allocation end date cannot precede its start date.")
        return self


class AllocationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    person_id: UUID
    node_id: UUID
    percent: float
    start_date: date
    end_date: date | None


class CapacityRead(BaseModel):
    person_id: UUID
    allocated_percent: float
    overallocated_percent: float


class VentureSummary(BaseModel):
    id: UUID
    slug: str
    name: str
    status: str
    confidentiality: str
    project_count: int
    member_count: int
    allocation_percent: float
    rag: str
    top_risk: str | None = None
    next_milestone: str | None = None


class CockpitRead(BaseModel):
    holding: NodeRead
    ventures: list[VentureSummary]
    active_ventures: int
    at_risk_ventures: int
    total_allocated_percent: float
    orphan_projects: int
