"""Idempotent seed routine for the RBAC catalog and a configurable admin."""

from __future__ import annotations

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.permissions import ALL_ROLES, ROLE_PERMISSIONS, Permissions
from app.core.security import hash_password
from app.modules.identity.models import Permission, Role, RolePermission, User, UserRole

logger = structlog.get_logger(__name__)
settings = get_settings()

# Local defaults are configurable through SEED_ADMIN_* environment variables.
ADMIN_USER = {
    "email": settings.seed_admin_email,
    "username": settings.seed_admin_username,
    "password": settings.seed_admin_password,
    "first_name": settings.seed_admin_first_name,
    "last_name": settings.seed_admin_last_name,
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
    for role_name in ALL_ROLES:
        if role_name not in existing:
            role = Role(name=role_name, description=f"{role_name} role")
            db.add(role)
            existing[role_name] = role
    await db.flush()

    for role_name, role in existing.items():
        result = await db.execute(
            select(RolePermission).where(RolePermission.role_id == role.id)
        )
        already_granted = {rp.permission_id for rp in result.scalars().all()}
        for code in ROLE_PERMISSIONS.get(role_name, []):
            permission = permissions_by_code[code]
            if permission.id not in already_granted:
                db.add(RolePermission(role_id=role.id, permission_id=permission.id))
    await db.flush()
    return existing


async def seed_admin_user(db: AsyncSession, roles_by_name: dict[str, Role]) -> None:
    result = await db.execute(select(User).where(User.email == ADMIN_USER["email"]))
    user = result.scalar_one_or_none()
    if user is None:
        user = User(
            email=ADMIN_USER["email"],
            username=ADMIN_USER["username"],
            password_hash=hash_password(ADMIN_USER["password"]),
            first_name=ADMIN_USER["first_name"],
            last_name=ADMIN_USER["last_name"],
            job_title=ADMIN_USER["job_title"],
            is_active=True,
        )
        db.add(user)
        await db.flush()
    elif user.username is None:
        user.username = ADMIN_USER["username"]

    result = await db.execute(select(UserRole).where(UserRole.user_id == user.id))
    current_role_ids = {ur.role_id for ur in result.scalars().all()}
    for role_name in ADMIN_USER["roles"]:
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
