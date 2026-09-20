"""The authenticated-user context extracted from a validated JWT."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List
from uuid import UUID


@dataclass(frozen=True)
class CurrentUser:
    user_id: UUID
    email: str
    full_name: str
    roles: List[str] = field(default_factory=list)
    permissions: List[str] = field(default_factory=list)
    # Personal MCP tokens must never inherit role-based authorization bypasses.
    # Their explicit permission subset is authoritative even for SuperAdmin.
    allow_role_bypass: bool = True

    def has_permission(self, code: str) -> bool:
        return code in self.permissions

    def has_any_permission(self, *codes: str) -> bool:
        return any(c in self.permissions for c in codes)

    def is_in_role(self, role: str) -> bool:
        return role in self.roles

    def is_super_admin(self) -> bool:
        return self.allow_role_bypass and "SuperAdmin" in self.roles
