"""Schemas for AI-assisted project generation."""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

AiSource = Literal["ai", "manual"]


class GeneratedTask(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    description: str = Field(min_length=20)
    assignee: Optional[str] = None
    assignee_user_id: Optional[UUID] = None
    priority: Literal["P0", "P1", "P2", "P3"] = "P2"
    estimated_hours: Optional[float] = Field(default=None, ge=0)
    due_date: Optional[date] = None
    dependencies: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    status: Literal[
        "NotStarted",
        "Ready",
        "InProgress",
        "Waiting",
        "Blocked",
        "Review",
        "Testing",
        "Done",
        "Cancelled",
        "Archived",
    ] = "Ready"
    task_type: Literal[
        "Feature",
        "Bug",
        "Enhancement",
        "Research",
        "Documentation",
        "Meeting",
        "Testing",
        "Deployment",
    ] = "Feature"
    partition: str = Field(default="business", min_length=1, max_length=32)


class GeneratedMilestone(BaseModel):
    name: str
    description: Optional[str] = None
    due_date: Optional[date] = None


class GeneratedProject(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=30)
    goal: str
    stakeholders: list[str] = Field(default_factory=list)
    timeline_start: Optional[date] = None
    timeline_end: Optional[date] = None
    constraints: Optional[str] = None
    priority: Literal["P0", "P1", "P2", "P3"] = "P2"
    risk_level: Literal["Low", "Medium", "High", "Critical"] = "Medium"
    tags: list[str] = Field(default_factory=list)
    milestones: list[GeneratedMilestone] = Field(default_factory=list)
    tasks: list[GeneratedTask] = Field(min_length=1)
    unresolved_fields: list[str] = Field(default_factory=list)


class GenerationValidationError(BaseModel):
    field: str
    message: str


class GenerationChange(BaseModel):
    path: str
    before: object = None
    after: object = None
    change_type: Literal["added", "removed", "modified"]


class GenerationDraftResponse(BaseModel):
    generation_run_id: UUID
    status: str
    operation: str
    project: Optional[GeneratedProject] = None
    validation_errors: list[GenerationValidationError] = Field(default_factory=list)
    change_set: list[GenerationChange] = Field(default_factory=list)
    prompt_storage_key: Optional[str] = None


class ConfirmGenerationRequest(BaseModel):
    project: Optional[GeneratedProject] = None


class GenerationJobResponse(BaseModel):
    job_id: UUID
    project_id: UUID
    status: str
    error: Optional[str] = None


class GenerationRunRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    triggered_by_user_id: UUID
    existing_project_id: Optional[UUID] = None
    status: str
    operation: str
    model: Optional[str] = None
    prompt_storage_key: Optional[str] = None
    summary_storage_key: Optional[str] = None
    resulting_project_id: Optional[UUID] = None
    resulting_task_ids: list[str]
    error: Optional[str] = None
    created_at: datetime
    updated_at: datetime
