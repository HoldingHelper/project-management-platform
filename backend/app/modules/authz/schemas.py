from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel


class GrantTrace(BaseModel):
    node_id: UUID
    node_name: str
    role: str
    inherited: bool


class AccessExplanation(BaseModel):
    allowed: bool
    action: str
    object_type: str
    node_id: UUID
    confidentiality: str
    effective_roles: list[str]
    grants: list[GrantTrace]
    reason: str
    owner_override: bool = False
