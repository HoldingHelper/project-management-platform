from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class RequestCreate(BaseModel):
    from_node_id: UUID
    to_node_id: UUID
    title: str = Field(min_length=1, max_length=240)
    need: str = Field(min_length=1)
    due_date: date | None = None
    priority: str = Field(default="P2", pattern=r"^P[0-3]$")


class RequestRead(RequestCreate):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    status: str
    created_by_user_id: UUID
    created_task_id: UUID | None
    created_at: datetime
    updated_at: datetime
