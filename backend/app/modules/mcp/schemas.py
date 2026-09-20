"""Request/response contracts for personal MCP connections."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class McpTokenCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    permission_codes: list[str] = Field(default_factory=list)
    expires_in_days: int = Field(default=90, ge=1, le=365)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        normalized = " ".join(value.split())
        if not normalized:
            raise ValueError("Token name is required.")
        return normalized

    @field_validator("permission_codes")
    @classmethod
    def unique_permissions(cls, value: list[str]) -> list[str]:
        return list(dict.fromkeys(code.strip() for code in value if code.strip()))


class McpTokenRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    token_prefix: str
    permission_codes: list[str]
    created_at: datetime
    expires_at: datetime
    last_used_at: datetime | None = None
    revoked_at: datetime | None = None
    is_active: bool


class McpTokenCreated(McpTokenRead):
    token: str


class McpPermissionOption(BaseModel):
    code: str
    description: str
    tool_names: list[str]


class McpSetupRead(BaseModel):
    endpoint_url: str
    skill_resource_uri: str
    skill_markdown: str
    available_permissions: list[McpPermissionOption]
    available_tools: list[dict]
    security_notes: list[str]
