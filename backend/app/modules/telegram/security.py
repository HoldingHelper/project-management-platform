"""Security, authentication, and RBAC mapping for the PMP Telegram module."""

from __future__ import annotations

from datetime import timedelta
from typing import Optional, Tuple
from uuid import UUID

import secrets
import structlog
from sqlalchemy import or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.current_user import CurrentUser
from app.core.request_context import current_user_id_var
from app.modules.identity import repository as identity_repo
from app.modules.identity.models import User
from app.modules.integrations.models import UserTelegramConnection
from app.shared.base_model import utcnow

logger = structlog.get_logger(__name__)


async def resolve_telegram_user(
    db: AsyncSession, telegram_user_id: int | str
) -> Tuple[Optional[User], Optional[CurrentUser]]:
    """Resolve an authenticated PMP User and CurrentUser from an immutable Telegram User ID (from_user.id)."""
    user_id_str = str(telegram_user_id).strip()
    if not user_id_str:
        return None, None

    stmt = select(UserTelegramConnection).where(
        UserTelegramConnection.telegram_chat_id == user_id_str,
        UserTelegramConnection.is_connected.is_(True),
    )
    result = await db.execute(stmt)
    conn = result.scalar_one_or_none()

    if not conn:
        return None, None

    user = await identity_repo.get_user_by_id(db, conn.user_id)
    if not user or not user.is_active:
        logger.warning(
            "telegram_user_inactive_or_missing",
            user_id=str(conn.user_id),
            telegram_user_id=user_id_str,
        )
        return None, None

    roles = [ur.role.name for ur in user.roles if ur.role]
    permissions = sorted(
        {
            rp.permission.code
            for ur in user.roles
            if ur.role
            for rp in ur.role.permissions
            if rp.permission
        }
    )

    current_user = CurrentUser(
        user_id=user.id,
        email=user.email,
        full_name=user.full_name or user.username or "PMP User",
        roles=roles,
        permissions=permissions,
        allow_role_bypass=True,
    )

    # Set context var for audit logs and background operations
    current_user_id_var.set(user.id)
    return user, current_user


async def link_telegram_account(
    db: AsyncSession,
    telegram_user_id: int | str,
    telegram_username: Optional[str],
    raw_code: str,
) -> Tuple[bool, str, Optional[User]]:
    """Validate a short-lived link code and bind the immutable Telegram User ID (from_user.id) to the PMP user.

    Security Rule: If this Telegram User is already connected to another PMP user, do NOT automatically
    or silently detach the previous connection. Instead, stop the link request and require an explicit disconnect.
    """
    code = raw_code.strip()
    user_id_str = str(telegram_user_id).strip()

    if not code or len(code) < 6:
        return False, "کد اتصال نامعتبر است. لطفاً کد یا لینک صحیح را وارد کنید.", None

    stmt = select(UserTelegramConnection).where(
        or_(
            UserTelegramConnection.auth_link_code == code,
            UserTelegramConnection.auth_link_code == code.upper(),
        ),
        UserTelegramConnection.auth_link_expires_at > utcnow(),
    )
    result = await db.execute(stmt)
    conn = result.scalar_one_or_none()

    if (
        not conn
        or conn.auth_link_expires_at <= utcnow()
        or conn.auth_link_code.startswith("used_")
        or conn.auth_link_code.startswith("revoked_")
    ):
        return (
            False,
            "کد یا لینک وارد شده نامعتبر است یا منقضی شده است. لطفاً در پنل تنظیمات کد جدیدی ایجاد کنید.",
            None,
        )

    # Check if this Telegram User is ALREADY connected to another PMP User
    existing_stmt = select(UserTelegramConnection).where(
        UserTelegramConnection.telegram_chat_id == user_id_str,
        UserTelegramConnection.is_connected.is_(True),
    )
    existing_res = await db.execute(existing_stmt)
    existing_conn = existing_res.scalar_one_or_none()

    if existing_conn:
        if existing_conn.user_id != conn.user_id:
            # DO NOT overwrite or silently detach the existing connection!
            logger.warning(
                "telegram_link_conflict_already_connected",
                attempted_pmp_user_id=str(conn.user_id),
                existing_pmp_user_id=str(existing_conn.user_id),
                telegram_user_id=user_id_str,
            )
            return (
                False,
                "این حساب Telegram قبلاً به یک حساب PMP متصل است. ابتدا اتصال قبلی را قطع کنید و سپس دوباره تلاش کنید.",
                None,
            )
        else:
            # Already connected to this exact PMP user
            user = await identity_repo.get_user_by_id(db, conn.user_id)
            return (
                True,
                f"✅ این حساب تلگرام از قبل به حساب کاربری شما ({user.full_name if user else ''}) متصل است.",
                user,
            )

    # Bind the current connection using the unique Telegram User ID
    conn.telegram_chat_id = user_id_str
    conn.telegram_username = telegram_username
    conn.is_connected = True
    conn.connected_at = utcnow()
    # Invalidate code so it cannot be reused (anti-replay single use)
    conn.auth_link_code = f"used_{secrets.token_hex(8)}"
    conn.auth_link_expires_at = utcnow() - timedelta(seconds=1)

    await db.commit()

    user = await identity_repo.get_user_by_id(db, conn.user_id)
    logger.info(
        "telegram_account_linked",
        user_id=str(conn.user_id),
        telegram_user_id=user_id_str,
        username=telegram_username,
    )
    return True, f"حساب کاربری شما ({user.full_name if user else ''}) با موفقیت به تلگرام متصل شد! 🎉", user


async def disconnect_telegram_account(
    db: AsyncSession, telegram_user_id: int | str
) -> bool:
    """Disconnect the Telegram account associated with this Telegram User ID."""
    user_id_str = str(telegram_user_id).strip()
    stmt = (
        update(UserTelegramConnection)
        .where(UserTelegramConnection.telegram_chat_id == user_id_str)
        .values(
            is_connected=False,
            telegram_chat_id=None,
            telegram_username=None,
            connected_at=None,
            auth_link_code=f"revoked_{secrets.token_hex(8)}",
            auth_link_expires_at=utcnow(),
        )
    )
    res = await db.execute(stmt)
    await db.commit()
    return res.rowcount > 0

