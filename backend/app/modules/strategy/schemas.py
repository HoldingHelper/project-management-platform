from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class VisionWrite(BaseModel):
    statement: str = Field(min_length=1)
    horizon: str | None = Field(default=None, max_length=40)
    narrative_page_id: UUID | None = None


class VisionRead(VisionWrite):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    node_id: UUID
    updated_by: UUID
    updated_at: datetime


class ObjectiveCreate(BaseModel):
    node_id: UUID
    parent_objective_id: UUID | None = None
    title: str = Field(min_length=1, max_length=240)
    period: str = Field(min_length=2, max_length=40)
    owner_user_id: UUID
    status: str = "draft"
    confidence: float = Field(default=0.5, ge=0, le=1)
    weight: float = Field(default=1, gt=0)


class ObjectiveRead(ObjectiveCreate):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    created_at: datetime
    updated_at: datetime


class KeyResultCreate(BaseModel):
    objective_id: UUID
    metric: str = Field(min_length=1, max_length=240)
    baseline: float
    target: float
    current: float
    unit: str = Field(min_length=1, max_length=40)
    update_cadence: str = "weekly"

    @model_validator(mode="after")
    def target_differs(self) -> "KeyResultCreate":
        if self.target == self.baseline:
            raise ValueError("Key result target must differ from baseline.")
        return self


class KeyResultRead(KeyResultCreate):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    created_at: datetime
    updated_at: datetime


class CheckInCreate(BaseModel):
    value: float
    confidence: float = Field(ge=0, le=1)
    note: str | None = None


class CheckInRead(CheckInCreate):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    key_result_id: UUID
    created_by: UUID
    created_at: datetime
