"""Idempotent seed routine: RBAC catalog (roles + permissions) and the default
administrator account (`admin` / `ChangeMe123!`).

Real user accounts come from invitations, manual admin creation, or administrator-created accounts.
"""

from __future__ import annotations

from typing import Any
import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.permissions import ALL_ROLES, ROLE_PERMISSIONS, Permissions
from app.core.security import hash_password
from app.modules.identity.models import Permission, Role, RolePermission, User, UserRole

logger = structlog.get_logger(__name__)


def get_default_admin_config() -> dict[str, Any]:
    settings = get_settings()
    return {
        "email": settings.initial_admin_email or "admin@example.com",
        "username": settings.initial_admin_username or "admin",
        "password": settings.initial_admin_password or "ChangeMe123!",
        "first_name": "Platform",
        "last_name": "Admin",
        "job_title": "Administrator",
        "roles": ["SuperAdmin"],
    }


async def seed_permissions(db: AsyncSession) -> dict[str, Permission]:
    result = await db.execute(select(Permission))
    existing = {p.code: p for p in result.scalars().all()}
    for code in Permissions.all():
        if code not in existing:
            permission = Permission(
                code=code, description=code.replace(".", " ").replace("_", " ").title()
            )
            db.add(permission)
            existing[code] = permission
    await db.flush()
    return existing


async def seed_roles(
    db: AsyncSession, permissions_by_code: dict[str, Permission]
) -> dict[str, Role]:
    result = await db.execute(select(Role))
    existing = {r.name: r for r in result.scalars().all()}
    created_role_names: set[str] = set()
    for role_name in ALL_ROLES:
        if role_name not in existing:
            role = Role(name=role_name, description=f"{role_name} role")
            db.add(role)
            existing[role_name] = role
            created_role_names.add(role_name)
    await db.flush()

    # Defaults initialize newly-created roles only. Existing database grants are
    # administrator-managed and must not be restored after an intentional edit.
    for role_name in created_role_names:
        role = existing[role_name]
        for code in ROLE_PERMISSIONS.get(role_name, []):
            permission = permissions_by_code[code]
            db.add(RolePermission(role_id=role.id, permission_id=permission.id))
    await db.flush()
    return existing


async def seed_admin_user(db: AsyncSession, roles_by_name: dict[str, Role]) -> None:
    admin_cfg = get_default_admin_config()
    result = await db.execute(select(User).where(User.email == admin_cfg["email"]))
    user = result.scalar_one_or_none()
    if user is None:
        user = User(
            email=admin_cfg["email"],
            username=admin_cfg["username"],
            password_hash=hash_password(admin_cfg["password"]),
            first_name=admin_cfg["first_name"],
            last_name=admin_cfg["last_name"],
            job_title=admin_cfg["job_title"],
            is_active=True,
        )
        db.add(user)
        await db.flush()
    elif user.username is None:
        user.username = admin_cfg["username"]

    result = await db.execute(select(UserRole).where(UserRole.user_id == user.id))
    current_role_ids = {ur.role_id for ur in result.scalars().all()}
    for role_name in admin_cfg["roles"]:
        role = roles_by_name[role_name]
        if role.id not in current_role_ids:
            db.add(UserRole(user_id=user.id, role_id=role.id))
    await db.flush()


async def run_seed(db: AsyncSession) -> None:
    permissions_by_code = await seed_permissions(db)
    roles_by_name = await seed_roles(db, permissions_by_code)
    await seed_admin_user(db, roles_by_name)
    await db.commit()
    logger.info(
        "identity_seed_complete",
        roles=len(roles_by_name),
        permissions=len(permissions_by_code),
    )
