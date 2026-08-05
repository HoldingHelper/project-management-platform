"""Pydantic request/response schemas for the Identity module."""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    field_validator,
    model_validator,
)

PRESENCE_STATUSES = ["online", "busy", "away", "focus", "offline"]


class LoginRequest(BaseModel):
    """`identifier` accepts an email address or a username. `email` is kept
    as a legacy alias for older clients."""

    identifier: Optional[str] = None
    email: Optional[str] = None
    password: str = Field(min_length=1)

    @model_validator(mode="after")
    def require_identifier(self) -> "LoginRequest":
        if not (self.identifier or self.email):
            raise ValueError("Either 'identifier' or 'email' is required.")
        return self

    @property
    def login_identifier(self) -> str:
        return (self.identifier or self.email or "").strip()


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    username: Optional[str] = None
    first_name: str
    last_name: str
    full_name: str
    job_title: Optional[str] = None
    avatar_url: Optional[str] = None
    bio: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    presence_status: Optional[str] = None
    is_active: bool
    mfa_enabled: bool
    roles: List[str] = Field(default_factory=list)
    permissions: List[str] = Field(default_factory=list)
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    refresh_token: str
    user: UserRead


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=8)


class CreateUserRequest(BaseModel):
    email: EmailStr
    username: Optional[str] = Field(default=None, min_length=2, max_length=64)
    password: str = Field(min_length=8)
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    job_title: Optional[str] = None
    role_names: List[str] = Field(default_factory=list)

    @field_validator("role_names")
    @classmethod
    def validate_roles(cls, roles: List[str]) -> List[str]:
        from app.core.permissions import ALL_ROLES

        for r in roles:
            if r not in ALL_ROLES:
                raise ValueError(f"Unknown role '{r}'.")
        return roles


class AssignRolesRequest(BaseModel):
    role_names: List[str]

    @field_validator("role_names")
    @classmethod
    def validate_roles(cls, roles: List[str]) -> List[str]:
        from app.core.permissions import ALL_ROLES

        for r in roles:
            if r not in ALL_ROLES:
                raise ValueError(f"Unknown role '{r}'.")
        return roles


class RoleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    description: Optional[str] = None


class PermissionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    code: str
    description: Optional[str] = None


class UserSummary(BaseModel):
    """Cross-module read-model contract (mirrors `UserSummaryDto`)."""

    user_id: UUID
    full_name: str
    email: str
    avatar_url: Optional[str] = None
    is_active: bool


class CreateInvitationRequest(BaseModel):
    email: EmailStr
    role_name: str

    @field_validator("role_name")
    @classmethod
    def validate_role(cls, role: str) -> str:
        from app.core.permissions import ALL_ROLES

        if role not in ALL_ROLES:
            raise ValueError(f"Unknown role '{role}'.")
        return role


class InvitationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    role_name: str
    invited_by_user_id: UUID
    expires_at: datetime
    accepted_at: Optional[datetime] = None
    revoked_at: Optional[datetime] = None
    created_at: datetime
    status: str  # pending | accepted | revoked | expired


class InvitationPublicRead(BaseModel):
    """Returned by the public token-verification endpoint."""

    email: str
    role_name: str
    expires_at: datetime


class AcceptInvitationRequest(BaseModel):
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=8)
    username: Optional[str] = Field(default=None, min_length=2, max_length=64)


class UpdateProfileRequest(BaseModel):
    first_name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    job_title: Optional[str] = Field(default=None, max_length=150)
    avatar_url: Optional[str] = Field(default=None, max_length=500)
    bio: Optional[str] = Field(default=None, max_length=2000)
    phone: Optional[str] = Field(default=None, max_length=32)
    location: Optional[str] = Field(default=None, max_length=128)


class ChangeEmailRequest(BaseModel):
    new_email: EmailStr
    current_password: str = Field(min_length=1)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=8)


class UserSettingsRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    notification_prefs: dict = Field(default_factory=dict)
    theme: Optional[str] = None
    github_username: Optional[str] = None


class UpdateUserSettingsRequest(BaseModel):
    notification_prefs: Optional[dict] = None
    theme: Optional[str] = Field(default=None, max_length=16)
    github_username: Optional[str] = Field(default=None, max_length=64)


class PresenceUpdateRequest(BaseModel):
    status: str

    @field_validator("status")
    @classmethod
    def validate_status(cls, status: str) -> str:
        if status not in PRESENCE_STATUSES:
            raise ValueError(
                f"Status must be one of {', '.join(PRESENCE_STATUSES)}."
            )
        return status
