"""Identity module business logic (the "Application layer" equivalent)."""

from __future__ import annotations

from datetime import timedelta
from typing import List, Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.email import EmailSender, email_sender
from app.core.events import event_bus
from app.core.exceptions import (
    ConflictError,
    NotFoundError,
    UnauthorizedError,
    ValidationAppError,
)
from app.core.permissions import permissions_for_roles
from app.core.security import (
    create_access_token,
    generate_opaque_token,
    hash_opaque_token,
    hash_password,
    verify_password,
)
from app.modules.identity import repository as repo
from app.modules.identity.models import (
    Invitation,
    PasswordResetToken,
    RefreshToken,
    Role,
    User,
    UserRole,
    UserSettings,
)
from app.modules.identity.schemas import (
    InvitationPublicRead,
    InvitationRead,
    TokenResponse,
    UserRead,
    UserSettingsRead,
    UserSummary,
)
from app.shared.base_model import utcnow
from app.shared.events import PresenceChanged, UserProvisioned

settings = get_settings()


def _roles_for(user: User) -> List[str]:
    return [ur.role.name for ur in user.roles]


def to_user_read(user: User) -> UserRead:
    roles = _roles_for(user)
    return UserRead(
        id=user.id,
        email=user.email,
        username=user.username,
        first_name=user.first_name,
        last_name=user.last_name,
        full_name=user.full_name,
        job_title=user.job_title,
        avatar_url=user.avatar_url,
        bio=user.bio,
        phone=user.phone,
        location=user.location,
        presence_status=user.presence_status,
        is_active=user.is_active,
        mfa_enabled=user.mfa_enabled,
        roles=roles,
        permissions=permissions_for_roles(roles),
        created_at=user.created_at,
    )


def _issue_access_token(user: User) -> tuple[str, int]:
    roles = _roles_for(user)
    permissions = permissions_for_roles(roles)
    token = create_access_token(
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
        roles=roles,
        permissions=permissions,
    )
    return token, settings.access_token_expire_minutes * 60


async def _issue_refresh_token(
    db: AsyncSession, user: User, ip_address: Optional[str]
) -> str:
    raw_token = generate_opaque_token()
    refresh_token = RefreshToken(
        user_id=user.id,
        token_hash=hash_opaque_token(raw_token),
        expires_at=utcnow() + timedelta(days=settings.refresh_token_expire_days),
        created_at=utcnow(),
        created_by_ip=ip_address,
    )
    db.add(refresh_token)
    await db.flush()
    return raw_token


async def login(
    db: AsyncSession,
    *,
    identifier: str,
    password: str,
    ip_address: Optional[str] = None,
) -> TokenResponse:
    user = await repo.get_user_by_identifier(db, identifier.lower())
    if user is None or not verify_password(password, user.password_hash):
        raise UnauthorizedError("Invalid email or password.")
    if not user.is_active:
        raise UnauthorizedError("This account has been deactivated.")

    access_token, expires_in = _issue_access_token(user)
    refresh_token = await _issue_refresh_token(db, user, ip_address)
    await db.commit()

    return TokenResponse(
        access_token=access_token,
        expires_in=expires_in,
        refresh_token=refresh_token,
        user=to_user_read(user),
    )


async def refresh_access_token(
    db: AsyncSession, *, raw_refresh_token: str, ip_address: Optional[str] = None
) -> TokenResponse:
    token_hash = hash_opaque_token(raw_refresh_token)
    existing = await repo.get_refresh_token_by_hash(db, token_hash)
    if existing is None:
        raise UnauthorizedError("Invalid refresh token.")

    if existing.revoked_at is not None:
        # Reuse of an already-rotated/revoked token: treat as a compromise
        # signal and revoke every active session for this user.
        await repo.revoke_all_refresh_tokens_for_user(db, existing.user_id)
        await db.commit()
        raise UnauthorizedError(
            "Refresh token has already been used. All sessions have been revoked."
        )

    if existing.expires_at <= utcnow():
        raise UnauthorizedError("Refresh token has expired.")

    user = await repo.get_user_by_id(db, existing.user_id)
    if user is None or not user.is_active:
        raise UnauthorizedError("Account is no longer active.")

    existing.revoked_at = utcnow()
    new_raw_token = await _issue_refresh_token(db, user, ip_address)
    existing.replaced_by_token_hash = hash_opaque_token(new_raw_token)

    access_token, expires_in = _issue_access_token(user)
    await db.commit()

    return TokenResponse(
        access_token=access_token,
        expires_in=expires_in,
        refresh_token=new_raw_token,
        user=to_user_read(user),
    )


async def logout(db: AsyncSession, *, raw_refresh_token: str) -> None:
    token_hash = hash_opaque_token(raw_refresh_token)
    existing = await repo.get_refresh_token_by_hash(db, token_hash)
    if existing is not None and existing.revoked_at is None:
        existing.revoked_at = utcnow()
        await db.commit()


async def forgot_password(
    db: AsyncSession, *, email: str, sender: EmailSender = email_sender
) -> None:
    user = await repo.get_user_by_email(db, email.lower())
    if user is None:
        # Do not reveal whether the email exists.
        return
    raw_token = generate_opaque_token()
    reset_token = PasswordResetToken(
        user_id=user.id,
        token_hash=hash_opaque_token(raw_token),
        expires_at=utcnow() + timedelta(hours=1),
        created_at=utcnow(),
    )
    db.add(reset_token)
    await db.commit()
    await sender.send(
        user.email,
        "Reset your Project Management Platform password",
        f"Use this token to reset your password (valid 1 hour): {raw_token}",
    )


async def reset_password(
    db: AsyncSession, *, raw_token: str, new_password: str
) -> None:
    token_hash = hash_opaque_token(raw_token)
    reset_token = await repo.get_password_reset_token_by_hash(db, token_hash)
    if reset_token is None or reset_token.used_at is not None:
        raise UnauthorizedError("Invalid or already-used reset token.")
    if reset_token.expires_at <= utcnow():
        raise UnauthorizedError("Reset token has expired.")

    user = await repo.get_user_by_id(db, reset_token.user_id)
    if user is None:
        raise NotFoundError("User", reset_token.user_id)

    user.password_hash = hash_password(new_password)
    reset_token.used_at = utcnow()
    await repo.revoke_all_refresh_tokens_for_user(db, user.id)
    await db.commit()


async def create_user(
    db: AsyncSession,
    *,
    email: str,
    password: str,
    first_name: str,
    last_name: str,
    job_title: Optional[str],
    role_names: List[str],
    username: Optional[str] = None,
) -> UserRead:
    existing = await repo.get_user_by_email(db, email.lower())
    if existing is not None:
        raise ConflictError(f"A user with email '{email}' already exists.")
    if username:
        username = username.lower()
        if await repo.get_user_by_username(db, username) is not None:
            raise ConflictError(f"Username '{username}' is already taken.")

    user = User(
        email=email.lower(),
        username=username,
        password_hash=hash_password(password),
        first_name=first_name,
        last_name=last_name,
        job_title=job_title,
        is_active=True,
    )
    db.add(user)
    await db.flush()

    for role_name in role_names:
        role = await repo.get_role_by_name(db, role_name)
        if role is None:
            raise ValidationAppError(f"Unknown role '{role_name}'.")
        db.add(UserRole(user_id=user.id, role_id=role.id))

    await db.commit()
    await db.refresh(user, attribute_names=["roles"])

    await event_bus.publish(
        UserProvisioned(user_id=user.id, email=user.email, full_name=user.full_name)
    )

    return to_user_read(user)


async def assign_roles(
    db: AsyncSession, *, user_id: UUID, role_names: List[str]
) -> UserRead:
    user = await repo.get_user_by_id(db, user_id)
    if user is None:
        raise NotFoundError("User", user_id)

    for existing_role in list(user.roles):
        await db.delete(existing_role)
    await db.flush()

    for role_name in role_names:
        role = await repo.get_role_by_name(db, role_name)
        if role is None:
            raise ValidationAppError(f"Unknown role '{role_name}'.")
        db.add(UserRole(user_id=user.id, role_id=role.id))

    await db.commit()
    await db.refresh(user, attribute_names=["roles"])
    return to_user_read(user)


async def get_user(db: AsyncSession, user_id: UUID) -> UserRead:
    user = await repo.get_user_by_id(db, user_id)
    if user is None:
        raise NotFoundError("User", user_id)
    return to_user_read(user)


async def list_users(
    db: AsyncSession, *, search: Optional[str], page: int, page_size: int
) -> tuple[List[UserRead], int]:
    users, total = await repo.list_users(
        db, search=search, offset=(page - 1) * page_size, limit=page_size
    )
    return [to_user_read(u) for u in users], total


def _invitation_status(inv: Invitation) -> str:
    if inv.accepted_at is not None:
        return "accepted"
    if inv.revoked_at is not None:
        return "revoked"
    if inv.expires_at <= utcnow():
        return "expired"
    return "pending"


async def _invitation_to_read(db: AsyncSession, inv: Invitation) -> InvitationRead:
    role = await db.get(Role, inv.role_id)
    return InvitationRead(
        id=inv.id,
        email=inv.email,
        role_name=role.name if role else "?",
        invited_by_user_id=inv.invited_by_user_id,
        expires_at=inv.expires_at,
        accepted_at=inv.accepted_at,
        revoked_at=inv.revoked_at,
        created_at=inv.created_at,
        status=_invitation_status(inv),
    )


async def create_invitation(
    db: AsyncSession,
    *,
    email: str,
    role_name: str,
    invited_by_user_id: UUID,
    sender: EmailSender = email_sender,
) -> InvitationRead:
    email = email.lower()
    if await repo.get_user_by_email(db, email) is not None:
        raise ConflictError(f"A user with email '{email}' already exists.")
    if await repo.get_pending_invitation_by_email(db, email) is not None:
        raise ConflictError(f"An invitation for '{email}' is already pending.")

    role = await repo.get_role_by_name(db, role_name)
    if role is None:
        raise ValidationAppError(f"Unknown role '{role_name}'.")

    raw_token = generate_opaque_token()
    invitation = Invitation(
        email=email,
        role_id=role.id,
        invited_by_user_id=invited_by_user_id,
        token_hash=hash_opaque_token(raw_token),
        expires_at=utcnow() + timedelta(days=7),
    )
    db.add(invitation)
    await db.commit()

    link = f"{settings.frontend_base_url}/accept-invitation/{raw_token}"
    await sender.send(
        email,
        "You're invited to the Project Management Platform",
        f"You have been invited to join the Project Management Platform as {role_name}. "
        f"Accept here (valid 7 days): {link}",
    )
    return await _invitation_to_read(db, invitation)


async def list_invitations(db: AsyncSession) -> List[InvitationRead]:
    invitations = await repo.list_invitations(db)
    return [await _invitation_to_read(db, inv) for inv in invitations]


async def revoke_invitation(db: AsyncSession, invitation_id: UUID) -> None:
    invitation = await repo.get_invitation_by_id(db, invitation_id)
    if invitation is None:
        raise NotFoundError("Invitation", invitation_id)
    if invitation.accepted_at is not None:
        raise ConflictError("Invitation has already been accepted.")
    invitation.revoked_at = utcnow()
    await db.commit()


async def _get_valid_invitation(db: AsyncSession, raw_token: str) -> Invitation:
    invitation = await repo.get_invitation_by_hash(db, hash_opaque_token(raw_token))
    if invitation is None or not invitation.is_pending:
        raise UnauthorizedError("Invalid or expired invitation.")
    return invitation


async def verify_invitation(
    db: AsyncSession, raw_token: str
) -> InvitationPublicRead:
    invitation = await _get_valid_invitation(db, raw_token)
    read = await _invitation_to_read(db, invitation)
    return InvitationPublicRead(
        email=read.email, role_name=read.role_name, expires_at=read.expires_at
    )


async def accept_invitation(
    db: AsyncSession,
    *,
    raw_token: str,
    first_name: str,
    last_name: str,
    password: str,
    username: Optional[str] = None,
) -> TokenResponse:
    invitation = await _get_valid_invitation(db, raw_token)
    read = await _invitation_to_read(db, invitation)

    await create_user(
        db,
        email=invitation.email,
        password=password,
        first_name=first_name,
        last_name=last_name,
        job_title=None,
        role_names=[read.role_name],
        username=username,
    )
    invitation.accepted_at = utcnow()
    await db.commit()

    return await login(db, identifier=invitation.email, password=password)


async def update_profile(db: AsyncSession, user_id: UUID, **fields) -> UserRead:
    user = await repo.get_user_by_id(db, user_id)
    if user is None:
        raise NotFoundError("User", user_id)
    for name, value in fields.items():
        if value is not None:
            setattr(user, name, value)
    await db.commit()
    await db.refresh(user, attribute_names=["roles"])
    return to_user_read(user)


async def change_email(
    db: AsyncSession, user_id: UUID, *, new_email: str, current_password: str
) -> UserRead:
    user = await repo.get_user_by_id(db, user_id)
    if user is None:
        raise NotFoundError("User", user_id)
    if not verify_password(current_password, user.password_hash):
        raise UnauthorizedError("Current password is incorrect.")
    new_email = new_email.lower()
    existing = await repo.get_user_by_email(db, new_email)
    if existing is not None and existing.id != user_id:
        raise ConflictError(f"A user with email '{new_email}' already exists.")
    user.email = new_email
    await db.commit()
    await db.refresh(user, attribute_names=["roles"])
    return to_user_read(user)


async def change_password(
    db: AsyncSession, user_id: UUID, *, current_password: str, new_password: str
) -> None:
    user = await repo.get_user_by_id(db, user_id)
    if user is None:
        raise NotFoundError("User", user_id)
    if not verify_password(current_password, user.password_hash):
        raise UnauthorizedError("Current password is incorrect.")
    user.password_hash = hash_password(new_password)
    await repo.revoke_all_refresh_tokens_for_user(db, user_id)
    await db.commit()


async def get_user_settings(db: AsyncSession, user_id: UUID) -> UserSettingsRead:
    row = await repo.get_user_settings(db, user_id)
    if row is None:
        return UserSettingsRead()
    return UserSettingsRead.model_validate(row)


async def update_user_settings(
    db: AsyncSession, user_id: UUID, **fields
) -> UserSettingsRead:
    row = await repo.get_user_settings(db, user_id)
    if row is None:
        row = UserSettings(user_id=user_id)
        db.add(row)
        await db.flush()
    for name, value in fields.items():
        if value is not None:
            setattr(row, name, value)
    await db.commit()
    return UserSettingsRead.model_validate(row)


async def set_presence(db: AsyncSession, user_id: UUID, status: str) -> None:
    from app.core.websocket_manager import connection_manager

    user = await repo.get_user_by_id(db, user_id)
    if user is None:
        raise NotFoundError("User", user_id)
    user.presence_status = status
    await db.commit()
    await connection_manager.set_presence(user_id, status)
    await event_bus.publish(PresenceChanged(user_id=user_id, status=status))


async def get_user_summary(db: AsyncSession, user_id: UUID) -> Optional[UserSummary]:
    user = await repo.get_user_by_id(db, user_id)
    if user is None:
        return None
    return UserSummary(
        user_id=user.id,
        full_name=user.full_name,
        email=user.email,
        avatar_url=user.avatar_url,
        is_active=user.is_active,
    )


async def get_user_summaries(
    db: AsyncSession, user_ids: List[UUID]
) -> List[UserSummary]:
    users = await repo.get_users_by_ids(db, user_ids)
    return [
        UserSummary(
            user_id=u.id,
            full_name=u.full_name,
            email=u.email,
            avatar_url=u.avatar_url,
            is_active=u.is_active,
        )
        for u in users
    ]
