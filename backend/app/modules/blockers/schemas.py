"""Pydantic schemas for the Blockers module."""

from __future__ import annotations

from datetime import date, datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class BlockerCreate(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    description: Optional[str] = None
    severity: str = Field(default="Medium")
    priority: str = Field(default="P2")
    blocked_task_id: UUID
    owner_user_id: UUID
    pending_on_user_id: UUID
    # waiting_on_person | technical | business | external
    block_reason: Optional[str] = None
    estimated_unblock_date: Optional[date] = None
    expected_resolution_date: Optional[date] = None


class BlockerUpdate(BaseModel):
    severity: Optional[str] = None
    priority: Optional[str] = None
    pending_on_user_id: Optional[UUID] = None
    block_reason: Optional[str] = None
    estimated_unblock_date: Optional[date] = None
    expected_resolution_date: Optional[date] = None
    status: Optional[str] = None  # Open | InProgress (resolve via /resolve)


class BlockerResolve(BaseModel):
    actual_resolution_date: Optional[date] = None


class BlockerRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    title: str
    description: Optional[str] = None
    severity: str
    priority: str
    blocked_task_id: UUID
    owner_user_id: UUID
    reported_by_user_id: UUID
    pending_on_user_id: UUID
    block_reason: Optional[str] = None
    estimated_unblock_date: Optional[date] = None
    expected_resolution_date: Optional[date] = None
    actual_resolution_date: Optional[date] = None
    status: str
    created_at: datetime
    updated_at: datetime


class PendingOnMeItem(BaseModel):
    kind: str  # "blocker" | "review_task"
    id: UUID
    title: str
    project_id: Optional[UUID] = None
    priority: str
    detail: str


class PendingOnOthersItem(BaseModel):
    task_id: UUID
    title: str
    project_id: Optional[UUID] = None
    pending_on_user_ids: List[UUID]
    reason: str


class UserPendingWork(BaseModel):
    """Response for `GET /users/{id}/pending-work`."""

    pending_on_me: List[PendingOnMeItem]
    pending_on_others: List[PendingOnOthersItem]
