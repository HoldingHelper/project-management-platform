"""Data-access functions for the Identity module."""

from __future__ import annotations

from typing import List, Optional, Sequence
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.identity.models import (
    Invitation,
    PasswordResetToken,
    Permission,
    RefreshToken,
    Role,
    RolePermission,
    User,
    UserRole,
    UserSettings,
)


async def get_user_by_id(db: AsyncSession, user_id: UUID) -> Optional[User]:
    result = await db.execute(
        select(User)
        .options(
            selectinload(User.roles)
            .selectinload(UserRole.role)
            .selectinload(Role.permissions)
            .selectinload(RolePermission.permission)
        )
        .where(User.id == user_id)
    )
    return result.scalar_one_or_none()


async def get_user_by_email(db: AsyncSession, email: str) -> Optional[User]:
    result = await db.execute(
        select(User)
        .options(
            selectinload(User.roles)
            .selectinload(UserRole.role)
            .selectinload(Role.permissions)
            .selectinload(RolePermission.permission)
        )
        .where(User.email == email.lower())
    )
    return result.scalar_one_or_none()


async def get_user_by_username(db: AsyncSession, username: str) -> Optional[User]:
    result = await db.execute(
        select(User)
        .options(
            selectinload(User.roles)
            .selectinload(UserRole.role)
            .selectinload(Role.permissions)
            .selectinload(RolePermission.permission)
        )
        .where(User.username == username.lower())
    )
    return result.scalar_one_or_none()


async def get_user_by_identifier(db: AsyncSession, identifier: str) -> Optional[User]:
    """Email when the identifier contains '@', username otherwise."""
    if "@" in identifier:
        return await get_user_by_email(db, identifier)
    return await get_user_by_username(db, identifier)


async def list_users(
    db: AsyncSession, *, search: Optional[str], offset: int, limit: int
) -> tuple[Sequence[User], int]:
    stmt = select(User).options(
        selectinload(User.roles)
        .selectinload(UserRole.role)
        .selectinload(Role.permissions)
        .selectinload(RolePermission.permission)
    )
    count_stmt = select(User)
    if search:
        like = f"%{search.lower()}%"
        from sqlalchemy import func, or_

        cond = or_(
            func.lower(User.email).like(like),
            func.lower(User.first_name).like(like),
            func.lower(User.last_name).like(like),
        )
        stmt = stmt.where(cond)
        count_stmt = count_stmt.where(cond)

    total_result = await db.execute(count_stmt)
    total = len(total_result.scalars().all())

    stmt = stmt.order_by(User.created_at.desc()).offset(offset).limit(limit)
    result = await db.execute(stmt)
    return result.scalars().unique().all(), total


async def get_users_by_ids(db: AsyncSession, user_ids: List[UUID]) -> Sequence[User]:
    if not user_ids:
        return []
    result = await db.execute(
        select(User)
        .options(
            selectinload(User.roles)
            .selectinload(UserRole.role)
            .selectinload(Role.permissions)
            .selectinload(RolePermission.permission)
        )
        .where(User.id.in_(user_ids))
    )
    return result.scalars().unique().all()


async def delete_user(db: AsyncSession, user: User) -> None:
    await db.delete(user)


async def get_role_by_name(db: AsyncSession, name: str) -> Optional[Role]:
    result = await db.execute(
        select(Role)
        .options(
            selectinload(Role.permissions).selectinload(RolePermission.permission)
        )
        .where(Role.name == name)
    )
    return result.scalar_one_or_none()


async def get_role_by_id(db: AsyncSession, role_id: UUID) -> Optional[Role]:
    result = await db.execute(
        select(Role)
        .options(selectinload(Role.permissions).selectinload(RolePermission.permission))
        .where(Role.id == role_id)
    )
    return result.scalar_one_or_none()


async def get_role_by_normalized_name(db: AsyncSession, name: str) -> Optional[Role]:
    from sqlalchemy import func

    result = await db.execute(
        select(Role).where(func.lower(Role.name) == name.strip().lower())
    )
    return result.scalar_one_or_none()


async def list_roles(db: AsyncSession) -> Sequence[Role]:
    result = await db.execute(
        select(Role).options(
            selectinload(Role.permissions).selectinload(RolePermission.permission)
        )
    )
    return result.scalars().unique().all()


async def list_permissions(db: AsyncSession) -> Sequence[Permission]:
    result = await db.execute(select(Permission).order_by(Permission.code))
    return result.scalars().all()


async def get_permission_by_code(db: AsyncSession, code: str) -> Optional[Permission]:
    result = await db.execute(select(Permission).where(Permission.code == code))
    return result.scalar_one_or_none()


async def get_refresh_token_by_hash(
    db: AsyncSession, token_hash: str
) -> Optional[RefreshToken]:
    result = await db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    )
    return result.scalar_one_or_none()


async def revoke_all_refresh_tokens_for_user(db: AsyncSession, user_id: UUID) -> None:
    from app.shared.base_model import utcnow

    result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None)
        )
    )
    for token in result.scalars().all():
        token.revoked_at = utcnow()


async def get_password_reset_token_by_hash(
    db: AsyncSession, token_hash: str
) -> Optional[PasswordResetToken]:
    result = await db.execute(
        select(PasswordResetToken).where(PasswordResetToken.token_hash == token_hash)
    )
    return result.scalar_one_or_none()


async def get_invitation_by_id(
    db: AsyncSession, invitation_id: UUID
) -> Optional[Invitation]:
    result = await db.execute(select(Invitation).where(Invitation.id == invitation_id))
    return result.scalar_one_or_none()


async def get_invitation_by_hash(
    db: AsyncSession, token_hash: str
) -> Optional[Invitation]:
    result = await db.execute(
        select(Invitation).where(Invitation.token_hash == token_hash)
    )
    return result.scalar_one_or_none()


async def get_pending_invitation_by_email(
    db: AsyncSession, email: str
) -> Optional[Invitation]:
    from app.shared.base_model import utcnow

    result = await db.execute(
        select(Invitation).where(
            Invitation.email == email.lower(),
            Invitation.accepted_at.is_(None),
            Invitation.revoked_at.is_(None),
            Invitation.expires_at > utcnow(),
        )
    )
    return result.scalars().first()


async def list_invitations(db: AsyncSession) -> Sequence[Invitation]:
    result = await db.execute(select(Invitation).order_by(Invitation.created_at.desc()))
    return result.scalars().all()


async def get_user_settings(db: AsyncSession, user_id: UUID) -> Optional[UserSettings]:
    result = await db.execute(
        select(UserSettings).where(UserSettings.user_id == user_id)
    )
    return result.scalar_one_or_none()
