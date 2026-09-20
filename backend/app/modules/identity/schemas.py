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
    status_text: Optional[str] = None
    status_emoji: Optional[str] = None
    status_expires_at: Optional[datetime] = None
    department_id: Optional[UUID] = None
    department_name: Optional[str] = None
    team_id: Optional[UUID] = None
    team_name: Optional[str] = None
    manager_id: Optional[UUID] = None
    manager_name: Optional[str] = None
    manager_email: Optional[str] = None
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
    department_id: Optional[UUID] = None
    team_id: Optional[UUID] = None
    manager_id: Optional[UUID] = None
    role_names: List[str] = Field(default_factory=list)

    @field_validator("role_names")
    @classmethod
    def validate_roles(cls, roles: List[str]) -> List[str]:
        return list(dict.fromkeys(role.strip() for role in roles if role.strip()))


class AssignRolesRequest(BaseModel):
    role_names: List[str]

    @field_validator("role_names")
    @classmethod
    def validate_roles(cls, roles: List[str]) -> List[str]:
        normalized = list(dict.fromkeys(role.strip() for role in roles if role.strip()))
        if not normalized:
            raise ValueError("At least one role is required.")
        return normalized


class CreateRoleRequest(BaseModel):
    name: str = Field(min_length=2, max_length=100, pattern=r"^[A-Za-z][A-Za-z0-9 _-]*$")
    description: Optional[str] = Field(default=None, max_length=500)
    permission_codes: List[str] = Field(default_factory=list)

    @field_validator("name", mode="before")
    @classmethod
    def normalize_name(cls, name: str) -> str:
        return " ".join(name.split())

    @field_validator("description", mode="before")
    @classmethod
    def normalize_description(cls, description: Optional[str]) -> Optional[str]:
        if description is None:
            return None
        normalized = description.strip()
        return normalized or None

    @field_validator("permission_codes")
    @classmethod
    def normalize_permissions(cls, codes: List[str]) -> List[str]:
        return list(dict.fromkeys(code.strip() for code in codes if code.strip()))


class UpdateRolePermissionsRequest(BaseModel):
    permission_codes: List[str] = Field(default_factory=list)

    @field_validator("permission_codes")
    @classmethod
    def normalize_permissions(cls, codes: List[str]) -> List[str]:
        return list(dict.fromkeys(code.strip() for code in codes if code.strip()))


class RoleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    description: Optional[str] = None
    permission_codes: List[str] = Field(default_factory=list)


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
    presence_status: Optional[str] = None
    status_text: Optional[str] = None
    status_emoji: Optional[str] = None
    status_expires_at: Optional[datetime] = None
    department_id: Optional[UUID] = None
    department_name: Optional[str] = None
    team_id: Optional[UUID] = None
    team_name: Optional[str] = None
    manager_id: Optional[UUID] = None
    manager_name: Optional[str] = None


class CustomStatusUpdateRequest(BaseModel):
    presence_status: Optional[str] = None
    status_text: Optional[str] = Field(default=None, max_length=255)
    status_emoji: Optional[str] = Field(default=None, max_length=32)
    clear_after_minutes: Optional[int] = Field(default=None, ge=1, le=10080)

    @field_validator("presence_status")
    @classmethod
    def validate_presence_status(cls, status: Optional[str]) -> Optional[str]:
        if status is not None and status not in PRESENCE_STATUSES:
            raise ValueError(
                f"Status must be one of {', '.join(PRESENCE_STATUSES)}."
            )
        return status


class UserStatusRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: UUID
    presence_status: str
    status_text: Optional[str] = None
    status_emoji: Optional[str] = None
    status_expires_at: Optional[datetime] = None


class CreateInvitationRequest(BaseModel):
    email: EmailStr
    role_name: str
    department_id: Optional[UUID] = None
    team_id: Optional[UUID] = None
    manager_id: Optional[UUID] = None

    @field_validator("role_name")
    @classmethod
    def validate_role(cls, role: str) -> str:
        normalized = role.strip()
        if not normalized:
            raise ValueError("Role is required.")
        return normalized


class InvitationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    role_name: str
    invited_by_user_id: UUID
    department_id: Optional[UUID] = None
    department_name: Optional[str] = None
    team_id: Optional[UUID] = None
    team_name: Optional[str] = None
    manager_id: Optional[UUID] = None
    manager_name: Optional[str] = None
    expires_at: datetime
    accepted_at: Optional[datetime] = None
    revoked_at: Optional[datetime] = None
    created_at: datetime
    status: str  # pending | accepted | revoked | expired
    invite_token: Optional[str] = None
    invite_url: Optional[str] = None


class InvitationPublicRead(BaseModel):
    """Returned by the public token-verification endpoint."""

    email: str
    role_name: str
    department_name: Optional[str] = None
    team_name: Optional[str] = None
    manager_name: Optional[str] = None
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


class AdminUpdateUserRequest(BaseModel):
    first_name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    username: Optional[str] = Field(default=None, min_length=2, max_length=64)
    email: Optional[EmailStr] = None
    job_title: Optional[str] = Field(default=None, max_length=150)
    department_id: Optional[UUID] = None
    team_id: Optional[UUID] = None
    manager_id: Optional[UUID] = None
    bio: Optional[str] = Field(default=None, max_length=2000)
    is_active: Optional[bool] = None
    role_names: Optional[List[str]] = None

    @field_validator("role_names")
    @classmethod
    def validate_roles(cls, roles: Optional[List[str]]) -> Optional[List[str]]:
        if roles is None:
            return None
        normalized = list(dict.fromkeys(role.strip() for role in roles if role.strip()))
        if not normalized:
            raise ValueError("At least one role is required.")
        return normalized


class AdminResetPasswordRequest(BaseModel):
    new_password: str = Field(min_length=8)
