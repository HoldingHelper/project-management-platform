"""Identity module business logic (the "Application layer" equivalent)."""

from __future__ import annotations

from datetime import timedelta, timezone
from typing import List, Optional
from uuid import UUID

from sqlalchemy import delete, func, select, update
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
from app.core.permissions import ROLE_SUPER_ADMIN, Permissions, permissions_for_roles
from app.core.security import (
    create_access_token,
    generate_opaque_token,
    hash_opaque_token,
    hash_password,
    revoke_all_user_tokens,
    verify_password,
)
from app.modules.identity import repository as repo
from app.modules.identity.models import (
    Invitation,
    PasswordResetToken,
    RefreshToken,
    Role,
    RolePermission,
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


def permissions_for_user(user: User) -> List[str]:
    """Resolve seeded and administrator-defined permissions for a user.

    Loaded database RolePermission rows are authoritative. The static matrix
    remains a compatibility fallback for callers that do not load them.
    """
    resolved: set[str] = set()
    for user_role in user.roles:
        role = user_role.role
        if role.name == ROLE_SUPER_ADMIN:
            resolved.update(Permissions.all())
            continue

        # Database grants are authoritative once the relationship is loaded.
        # The static matrix remains a compatibility fallback for callers that
        # construct a User without loading Role.permissions.
        if "permissions" not in role.__dict__:
            resolved.update(permissions_for_roles([role.name]))
            continue

        for role_permission in role.permissions:
            permission = role_permission.permission
            if permission is not None:
                resolved.add(permission.code)
    return sorted(resolved)


def _is_status_expired(user: User) -> bool:
    if user.status_expires_at is None:
        return False
    now = utcnow()
    expires_at = user.status_expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    return now > expires_at


def to_user_read(user: User, employee_ctx: Optional[object] = None) -> UserRead:
    roles = _roles_for(user)
    dept_id = getattr(employee_ctx, "department_id", None) if employee_ctx else None
    dept_name = getattr(employee_ctx, "department_name", None) if employee_ctx else None
    team_id = getattr(employee_ctx, "team_id", None) if employee_ctx else None
    team_name = getattr(employee_ctx, "team_name", None) if employee_ctx else None
    manager_id = getattr(employee_ctx, "manager_user_id", None) if employee_ctx else None
    manager_name = getattr(employee_ctx, "manager_name", None) if employee_ctx else None
    manager_email = getattr(employee_ctx, "manager_email", None) if employee_ctx else None
    expired = _is_status_expired(user)
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
        status_text=None if expired else user.status_text,
        status_emoji=None if expired else user.status_emoji,
        status_expires_at=None if expired else user.status_expires_at,
        department_id=dept_id,
        department_name=dept_name,
        team_id=team_id,
        team_name=team_name,
        manager_id=manager_id,
        manager_name=manager_name,
        manager_email=manager_email,
        is_active=user.is_active,
        mfa_enabled=user.mfa_enabled,
        roles=roles,
        permissions=permissions_for_user(user),
        created_at=user.created_at,
    )


def _issue_access_token(user: User) -> tuple[str, int]:
    roles = _roles_for(user)
    permissions = permissions_for_user(user)
    token = create_access_token(
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
        roles=roles,
        permissions=permissions,
    )
    return token, settings.access_token_expire_minutes * 60


async def create_role(
    db: AsyncSession,
    *,
    name: str,
    description: Optional[str],
    permission_codes: List[str],
) -> Role:
    if await repo.get_role_by_normalized_name(db, name) is not None:
        raise ConflictError(f"A role named '{name}' already exists.")

    permissions = []
    for code in permission_codes:
        permission = await repo.get_permission_by_code(db, code)
        if permission is None:
            raise ValidationAppError(f"Unknown permission '{code}'.")
        permissions.append(permission)

    role = Role(name=name, description=description)
    db.add(role)
    await db.flush()
    for permission in permissions:
        db.add(RolePermission(role_id=role.id, permission_id=permission.id))

    await db.commit()
    roles = await repo.list_roles(db)
    return next(item for item in roles if item.id == role.id)


async def update_role_permissions(
    db: AsyncSession,
    *,
    role_id: UUID,
    permission_codes: List[str],
) -> Role:
    role = await repo.get_role_by_id(db, role_id)
    if role is None:
        raise NotFoundError("Role", role_id)
    if role.name == ROLE_SUPER_ADMIN:
        raise ValidationAppError(
            "SuperAdmin always has every permission and cannot be customized."
        )

    permissions = []
    for code in permission_codes:
        permission = await repo.get_permission_by_code(db, code)
        if permission is None:
            raise ValidationAppError(f"Unknown permission '{code}'.")
        permissions.append(permission)

    existing_by_code = {
        role_permission.permission.code: role_permission
        for role_permission in role.permissions
        if role_permission.permission is not None
    }
    role.permissions = [
        existing_by_code.get(permission.code)
        or RolePermission(
            role_id=role.id,
            permission_id=permission.id,
            permission=permission,
        )
        for permission in permissions
    ]
    await db.commit()
    refreshed = await repo.get_role_by_id(db, role.id)
    if refreshed is None:  # pragma: no cover - the committed role cannot disappear here
        raise NotFoundError("Role", role.id)
    return refreshed


async def require_active_user_ids(
    db: AsyncSession, user_ids: List[UUID]
) -> List[UUID]:
    unique_ids = list(dict.fromkeys(user_ids))
    users = await repo.get_users_by_ids(db, unique_ids)
    users_by_id = {user.id: user for user in users}
    missing = next((user_id for user_id in unique_ids if user_id not in users_by_id), None)
    if missing is not None:
        raise NotFoundError("User", missing)
    inactive = next((user.id for user in users if not user.is_active), None)
    if inactive is not None:
        raise ValidationAppError(f"User '{inactive}' is not active and cannot receive a ticket.")
    return unique_ids


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
    from app.core.security import dummy_verify_password

    user = await repo.get_user_by_identifier(db, identifier.lower())
    if user is None:
        dummy_verify_password(password)
        raise UnauthorizedError("Invalid email or password.")
    if not verify_password(password, user.password_hash):
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

    # Invalidate prior unused reset tokens on new request (M-11)
    await db.execute(
        update(PasswordResetToken)
        .where(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used_at.is_(None),
        )
        .values(used_at=utcnow())
    )

    raw_token = generate_opaque_token()
    reset_token = PasswordResetToken(
        user_id=user.id,
        token_hash=hash_opaque_token(raw_token),
        expires_at=utcnow() + timedelta(hours=1),
        created_at=utcnow(),
    )
    db.add(reset_token)
    await db.commit()

    reset_link = f"{settings.frontend_base_url}/reset-password?token={raw_token}"
    await sender.send(
        user.email,
        "Reset your Project Management Platform password",
        f"Click the link below to reset your password (valid 1 hour):\n{reset_link}",
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
    await revoke_all_user_tokens(user.id)
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
    department_id: Optional[UUID] = None,
    team_id: Optional[UUID] = None,
    manager_id: Optional[UUID] = None,
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

    if department_id is not None or team_id is not None or manager_id is not None or job_title is not None:
        from app.modules.organization.models import Employee
        mgr_emp_id = None
        if manager_id and manager_id != user.id:
            mgr_res = await db.execute(select(Employee).where(Employee.user_id == manager_id))
            mgr_emp = mgr_res.scalar_one_or_none()
            if mgr_emp is None:
                mgr_emp = Employee(user_id=manager_id)
                db.add(mgr_emp)
                await db.flush()
            mgr_emp_id = mgr_emp.id

        db.add(Employee(
            user_id=user.id,
            department_id=department_id,
            team_id=team_id,
            manager_employee_id=mgr_emp_id,
            job_title=job_title,
        ))

    await db.commit()
    created_user_id = user.id
    user = await repo.get_user_by_id(db, created_user_id)
    if user is None:  # pragma: no cover - defensive after successful commit
        raise NotFoundError("User", created_user_id)

    await event_bus.publish(
        UserProvisioned(user_id=user.id, email=user.email, full_name=user.full_name)
    )

    from app.modules.organization.service import get_employee_context
    ctx = await get_employee_context(db, user.id)
    return to_user_read(user, ctx)


async def assign_roles(
    db: AsyncSession, *, user_id: UUID, role_names: List[str]
) -> UserRead:
    user = await repo.get_user_by_id(db, user_id)
    if user is None:
        raise NotFoundError("User", user_id)

    # Prevent stripping SuperAdmin from the last active SuperAdmin (M-15)
    if "SuperAdmin" in _roles_for(user) and not any(r.strip().lower() == "superadmin" for r in role_names):
        remaining_super_admins = (
            await db.execute(
                select(func.count())
                .select_from(UserRole)
                .join(Role, UserRole.role_id == Role.id)
                .join(User, UserRole.user_id == User.id)
                .where(Role.name == "SuperAdmin", UserRole.user_id != user_id, User.is_active.is_(True))
            )
        ).scalar_one()
        if remaining_super_admins == 0:
            raise ConflictError("Cannot remove the SuperAdmin role from the last active SuperAdmin.")

    for existing_role in list(user.roles):
        await db.delete(existing_role)
    await db.flush()

    for role_name in role_names:
        role = await repo.get_role_by_name(db, role_name)
        if role is None:
            raise ValidationAppError(f"Unknown role '{role_name}'.")
        db.add(UserRole(user_id=user.id, role_id=role.id))

    await db.commit()
    from app.core.security import revoke_all_user_tokens
    revoke_all_user_tokens(user.id)

    user = await repo.get_user_by_id(db, user.id)
    if user is None:  # pragma: no cover - defensive after successful commit
        raise NotFoundError("User", user_id)
    from app.modules.organization.service import get_employee_context
    ctx = await get_employee_context(db, user.id)
    return to_user_read(user, ctx)


async def get_user(db: AsyncSession, user_id: UUID) -> UserRead:
    user = await repo.get_user_by_id(db, user_id)
    if user is None:
        raise NotFoundError("User", user_id)
    from app.modules.organization.service import get_employee_context
    ctx = await get_employee_context(db, user.id)
    return to_user_read(user, ctx)


async def list_users(
    db: AsyncSession, *, search: Optional[str], page: int, page_size: int
) -> tuple[List[UserRead], int]:
    users, total = await repo.list_users(
        db, search=search, offset=(page - 1) * page_size, limit=page_size
    )
    from app.modules.organization.service import get_employee_context
    result = []
    for u in users:
        ctx = await get_employee_context(db, u.id)
        result.append(to_user_read(u, ctx))
    return result, total


async def delete_user(db: AsyncSession, *, user_id: UUID, acting_user_id: UUID) -> None:
    if user_id == acting_user_id:
        raise ValidationAppError("You cannot delete your own account.")

    user = await repo.get_user_by_id(db, user_id)
    if user is None:
        raise NotFoundError("User", user_id)

    if "SuperAdmin" in _roles_for(user):
        remaining_super_admins = (
            await db.execute(
                select(func.count())
                .select_from(UserRole)
                .join(Role, UserRole.role_id == Role.id)
                .join(User, UserRole.user_id == User.id)
                .where(Role.name == "SuperAdmin", UserRole.user_id != user_id, User.is_active.is_(True))
            )
        ).scalar_one()
        if remaining_super_admins == 0:
            raise ConflictError("The last active SuperAdmin account cannot be deleted.")

    # Remove the user's active operational assignments. Authored messages,
    # comments, and audit records retain the UUID as historical evidence.
    from app.modules.chat.models import ChannelMember
    from app.modules.collaboration.models import Notification
    from app.modules.music.models import MusicChannelMember
    from app.modules.organization.models import Department, Employee, Team
    from app.modules.projects.models import Phase, ProjectMember, TaskAssignee, TaskItem

    await db.execute(delete(TaskAssignee).where(TaskAssignee.user_id == user_id))
    await db.execute(delete(ProjectMember).where(ProjectMember.user_id == user_id))
    await db.execute(
        update(TaskItem)
        .where(TaskItem.reviewer_user_id == user_id)
        .values(reviewer_user_id=None)
    )
    await db.execute(
        update(Phase)
        .where(Phase.lead_assignee_user_id == user_id)
        .values(lead_assignee_user_id=None)
    )
    await db.execute(
        update(Department)
        .where(Department.head_of_department_user_id == user_id)
        .values(head_of_department_user_id=None)
    )
    await db.execute(
        update(Team).where(Team.lead_user_id == user_id).values(lead_user_id=None)
    )
    await db.execute(delete(Employee).where(Employee.user_id == user_id))
    await db.execute(delete(ChannelMember).where(ChannelMember.user_id == user_id))
    await db.execute(
        delete(MusicChannelMember).where(MusicChannelMember.user_id == user_id)
    )
    await db.execute(delete(Notification).where(Notification.user_id == user_id))
    await repo.delete_user(db, user)
    await db.commit()


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
    dept_name = None
    team_name = None
    mgr_name = None

    if inv.department_id:
        from app.modules.organization.models import Department
        dept = await db.get(Department, inv.department_id)
        if dept:
            dept_name = dept.name
    if inv.team_id:
        from app.modules.organization.models import Team
        team = await db.get(Team, inv.team_id)
        if team:
            team_name = team.name
            if not dept_name and team.department_id:
                dept = await db.get(Department, team.department_id)
                if dept:
                    dept_name = dept.name
    if inv.manager_id:
        mgr = await db.get(User, inv.manager_id)
        if mgr:
            mgr_name = mgr.full_name

    return InvitationRead(
        id=inv.id,
        email=inv.email,
        role_name=role.name if role else "?",
        invited_by_user_id=inv.invited_by_user_id,
        department_id=inv.department_id,
        department_name=dept_name,
        team_id=inv.team_id,
        team_name=team_name,
        manager_id=inv.manager_id,
        manager_name=mgr_name,
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
    department_id: Optional[UUID] = None,
    team_id: Optional[UUID] = None,
    manager_id: Optional[UUID] = None,
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
        department_id=department_id,
        team_id=team_id,
        manager_id=manager_id,
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
    read = await _invitation_to_read(db, invitation)
    if not settings.is_production:
        read.invite_token = raw_token
        read.invite_url = link
    else:
        read.invite_token = None
        read.invite_url = None
    return read


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


async def verify_invitation(db: AsyncSession, raw_token: str) -> InvitationPublicRead:
    invitation = await _get_valid_invitation(db, raw_token)
    read = await _invitation_to_read(db, invitation)
    return InvitationPublicRead(
        email=read.email,
        role_name=read.role_name,
        department_name=read.department_name,
        team_name=read.team_name,
        manager_name=read.manager_name,
        expires_at=read.expires_at,
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

    created_user = await create_user(
        db,
        email=invitation.email,
        password=password,
        first_name=first_name,
        last_name=last_name,
        job_title=None,
        role_names=[read.role_name],
        username=username,
        department_id=invitation.department_id,
        team_id=invitation.team_id,
        manager_id=invitation.manager_id,
    )
    invitation.accepted_at = utcnow()
    await db.commit()

    user = await repo.get_user_by_id(db, created_user.id)
    if user is None:
        raise NotFoundError("User", created_user.id)

    from app.modules.organization.service import get_employee_context

    ctx = await get_employee_context(db, user.id)
    token, expires_in = _issue_access_token(user)
    raw_refresh = await _issue_refresh_token(db, user, None)
    await db.commit()
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        expires_in=expires_in,
        refresh_token=raw_refresh,
        user=to_user_read(user, ctx),
    )


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
    db: AsyncSession,
    user_id: UUID,
    *,
    new_email: str,
    current_password: str,
    sender: EmailSender = email_sender,
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
    old_email = user.email
    user.email = new_email
    await repo.revoke_all_refresh_tokens_for_user(db, user_id)
    await revoke_all_user_tokens(user_id)
    await db.commit()
    await db.refresh(user, attribute_names=["roles"])

    # Notify old address of email change (M-12)
    try:
        await sender.send(
            old_email,
            "Security Alert: Your email address was changed",
            f"Your Project Management Platform account email was changed to {new_email}. "
            "If you did not request this change, please contact your administrator immediately.",
        )
    except Exception:
        pass

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
    await revoke_all_user_tokens(user_id)
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
    expired = _is_status_expired(user)
    st_text = None if expired else user.status_text
    st_emoji = None if expired else user.status_emoji
    st_exp = None if expired else user.status_expires_at
    await connection_manager.set_presence(
        user_id,
        status=status,
        status_text=st_text,
        status_emoji=st_emoji,
        status_expires_at=st_exp,
    )
    await event_bus.publish(
        PresenceChanged(
            user_id=user_id,
            status=status,
            status_text=st_text,
            status_emoji=st_emoji,
            status_expires_at=st_exp,
        )
    )


async def set_custom_status(
    db: AsyncSession,
    user_id: UUID,
    *,
    presence_status: Optional[str] = None,
    status_text: Optional[str] = None,
    status_emoji: Optional[str] = None,
    clear_after_minutes: Optional[int] = None,
) -> UserRead:
    from app.core.websocket_manager import connection_manager

    user = await repo.get_user_by_id(db, user_id)
    if user is None:
        raise NotFoundError("User", user_id)

    if presence_status:
        user.presence_status = presence_status

    user.status_text = status_text.strip() if status_text is not None else user.status_text
    user.status_emoji = status_emoji.strip() if status_emoji is not None else user.status_emoji

    if clear_after_minutes is not None:
        if clear_after_minutes > 0:
            user.status_expires_at = utcnow() + timedelta(minutes=clear_after_minutes)
        else:
            user.status_expires_at = None
    elif status_text == "" and status_emoji == "":
        user.status_expires_at = None

    await db.commit()
    await db.refresh(user, attribute_names=["roles"])

    effective_status = user.presence_status or "online"
    await connection_manager.set_presence(
        user_id,
        status=effective_status,
        status_text=user.status_text,
        status_emoji=user.status_emoji,
        status_expires_at=user.status_expires_at,
    )
    await event_bus.publish(
        PresenceChanged(
            user_id=user_id,
            status=effective_status,
            status_text=user.status_text,
            status_emoji=user.status_emoji,
            status_expires_at=user.status_expires_at,
        )
    )

    from app.modules.organization.service import get_employee_context
    ctx = await get_employee_context(db, user.id)
    return to_user_read(user, ctx)


async def clear_custom_status(db: AsyncSession, user_id: UUID) -> UserRead:
    from app.core.websocket_manager import connection_manager

    user = await repo.get_user_by_id(db, user_id)
    if user is None:
        raise NotFoundError("User", user_id)

    user.status_text = None
    user.status_emoji = None
    user.status_expires_at = None

    await db.commit()
    await db.refresh(user, attribute_names=["roles"])

    effective_status = user.presence_status or "online"
    await connection_manager.set_presence(
        user_id,
        status=effective_status,
        status_text="",
        status_emoji="",
        status_expires_at=None,
    )
    await event_bus.publish(
        PresenceChanged(
            user_id=user_id,
            status=effective_status,
            status_text=None,
            status_emoji=None,
            status_expires_at=None,
        )
    )

    from app.modules.organization.service import get_employee_context
    ctx = await get_employee_context(db, user.id)
    return to_user_read(user, ctx)


async def get_user_summary(db: AsyncSession, user_id: UUID) -> Optional[UserSummary]:
    user = await repo.get_user_by_id(db, user_id)
    if user is None:
        return None
    expired = _is_status_expired(user)
    return UserSummary(
        user_id=user.id,
        full_name=user.full_name,
        email=user.email,
        avatar_url=user.avatar_url,
        is_active=user.is_active,
        presence_status=user.presence_status,
        status_text=None if expired else user.status_text,
        status_emoji=None if expired else user.status_emoji,
        status_expires_at=None if expired else user.status_expires_at,
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
            presence_status=u.presence_status,
            status_text=None if _is_status_expired(u) else u.status_text,
            status_emoji=None if _is_status_expired(u) else u.status_emoji,
            status_expires_at=None if _is_status_expired(u) else u.status_expires_at,
        )
        for u in users
    ]


async def admin_update_user(
    db: AsyncSession,
    *,
    user_id: UUID,
    first_name: Optional[str] = None,
    last_name: Optional[str] = None,
    username: Optional[str] = None,
    email: Optional[str] = None,
    job_title: Optional[str] = None,
    department_id: Optional[UUID] = None,
    team_id: Optional[UUID] = None,
    manager_id: Optional[UUID] = None,
    bio: Optional[str] = None,
    is_active: Optional[bool] = None,
    role_names: Optional[List[str]] = None,
) -> UserRead:
    user = await repo.get_user_by_id(db, user_id)
    if user is None:
        raise NotFoundError("User", user_id)

    if username is not None:
        trimmed_username = username.strip() or None
        if trimmed_username is not None and trimmed_username.lower() != (user.username or "").lower():
            existing = await repo.get_user_by_username(db, trimmed_username)
            if existing and existing.id != user.id:
                raise ConflictError(f"Username '{trimmed_username}' is already taken.")
        user.username = trimmed_username

    if email is not None:
        trimmed_email = email.strip().lower()
        if trimmed_email != user.email.lower():
            existing = await repo.get_user_by_email(db, trimmed_email)
            if existing and existing.id != user.id:
                raise ConflictError(f"Email '{trimmed_email}' is already registered.")
            user.email = trimmed_email

    if first_name is not None:
        user.first_name = first_name.strip()
    if last_name is not None:
        user.last_name = last_name.strip()
    if job_title is not None:
        user.job_title = job_title.strip() or None
    if bio is not None:
        user.bio = bio.strip() or None
    if is_active is not None:
        if is_active is False and "SuperAdmin" in _roles_for(user):
            remaining_super_admins = (
                await db.execute(
                    select(func.count())
                    .select_from(UserRole)
                    .join(Role, UserRole.role_id == Role.id)
                    .join(User, UserRole.user_id == User.id)
                    .where(Role.name == "SuperAdmin", UserRole.user_id != user_id, User.is_active.is_(True))
                )
            ).scalar_one()
            if remaining_super_admins == 0:
                raise ConflictError("The last active SuperAdmin account cannot be deactivated.")
        user.is_active = is_active
        if is_active is False:
            from app.core.security import revoke_all_user_tokens
            revoke_all_user_tokens(user.id)

    if department_id is not None or team_id is not None or manager_id is not None or job_title is not None:
        from app.modules.organization.models import Employee
        emp_res = await db.execute(select(Employee).where(Employee.user_id == user_id))
        emp = emp_res.scalar_one_or_none()
        if emp is None:
            emp = Employee(user_id=user_id, job_title=job_title or user.job_title)
            db.add(emp)
            await db.flush()

        if department_id is not None:
            emp.department_id = department_id
        if team_id is not None:
            emp.team_id = team_id
        if manager_id is not None:
            if manager_id == user_id:
                emp.manager_employee_id = None
            else:
                mgr_res = await db.execute(select(Employee).where(Employee.user_id == manager_id))
                mgr_emp = mgr_res.scalar_one_or_none()
                if mgr_emp is None:
                    mgr_emp = Employee(user_id=manager_id)
                    db.add(mgr_emp)
                    await db.flush()
                emp.manager_employee_id = mgr_emp.id
        if job_title is not None:
            emp.job_title = job_title

    if role_names is not None:
        if "SuperAdmin" in _roles_for(user) and not any(r.strip().lower() == "superadmin" for r in role_names):
            remaining_super_admins = (
                await db.execute(
                    select(func.count())
                    .select_from(UserRole)
                    .join(Role, UserRole.role_id == Role.id)
                    .join(User, UserRole.user_id == User.id)
                    .where(Role.name == "SuperAdmin", UserRole.user_id != user_id, User.is_active.is_(True))
                )
            ).scalar_one()
            if remaining_super_admins == 0:
                raise ConflictError("Cannot remove the SuperAdmin role from the last active SuperAdmin.")

        for existing_role in list(user.roles):
            await db.delete(existing_role)
        await db.flush()

        for name in role_names:
            role = await repo.get_role_by_name(db, name)
            if role is None:
                raise NotFoundError("Role", name)
            db.add(UserRole(user_id=user.id, role_id=role.id))

        from app.core.security import revoke_all_user_tokens
        revoke_all_user_tokens(user.id)

    await db.commit()
    user = await repo.get_user_by_id(db, user_id)
    if user is None:  # pragma: no cover - defensive after successful commit
        raise NotFoundError("User", user_id)
    from app.modules.organization.service import get_employee_context
    ctx = await get_employee_context(db, user_id)
    return to_user_read(user, ctx)


async def admin_reset_password(
    db: AsyncSession,
    *,
    user_id: UUID,
    new_password: str,
) -> None:
    user = await repo.get_user_by_id(db, user_id)
    if user is None:
        raise NotFoundError("User", user_id)

    user.password_hash = hash_password(new_password)
    await repo.revoke_all_refresh_tokens_for_user(db, user_id)
    await db.commit()
