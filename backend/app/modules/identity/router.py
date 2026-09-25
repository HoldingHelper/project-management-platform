"""Identity module REST endpoints."""

from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.current_user import CurrentUser
from app.core.database import get_db
from app.core.deps import get_current_user, require_permission
from app.core.pagination import Page, PageParams
from app.core.permissions import Permissions
from app.modules.identity import service
from app.modules.identity.repository import list_permissions, list_roles
from app.modules.identity.schemas import (
    AcceptInvitationRequest,
    AdminResetPasswordRequest,
    AdminUpdateUserRequest,
    AssignRolesRequest,
    ChangeEmailRequest,
    ChangePasswordRequest,
    CreateInvitationRequest,
    CreateRoleRequest,
    CreateUserRequest,
    CustomStatusUpdateRequest,
    ForgotPasswordRequest,
    InvitationPublicRead,
    InvitationRead,
    LoginRequest,
    LogoutRequest,
    PermissionRead,
    PresenceUpdateRequest,
    RefreshTokenRequest,
    ResetPasswordRequest,
    RoleRead,
    TokenResponse,
    UpdateRolePermissionsRequest,
    UpdateProfileRequest,
    UpdateUserSettingsRequest,
    UserRead,
    UserSettingsRead,
)

router = APIRouter(prefix="/auth", tags=["Identity - Auth"])
users_router = APIRouter(prefix="/users", tags=["Identity - Users"])
rbac_router = APIRouter(tags=["Identity - RBAC"])


@router.post("/login", response_model=TokenResponse)
async def login(
    payload: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)
) -> TokenResponse:
    ip = request.client.host if request.client else None
    return await service.login(
        db,
        identifier=payload.login_identifier,
        password=payload.password,
        ip_address=ip,
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    payload: RefreshTokenRequest, request: Request, db: AsyncSession = Depends(get_db)
) -> TokenResponse:
    ip = request.client.host if request.client else None
    return await service.refresh_access_token(
        db, raw_refresh_token=payload.refresh_token, ip_address=ip
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    payload: LogoutRequest, db: AsyncSession = Depends(get_db)
) -> Response:
    await service.logout(db, raw_refresh_token=payload.refresh_token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/forgot-password", status_code=status.HTTP_204_NO_CONTENT)
async def forgot_password(
    payload: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)
) -> Response:
    await service.forgot_password(db, email=payload.email)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/reset-password", status_code=status.HTTP_204_NO_CONTENT)
async def reset_password(
    payload: ResetPasswordRequest, db: AsyncSession = Depends(get_db)
) -> Response:
    await service.reset_password(
        db, raw_token=payload.token, new_password=payload.new_password
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/invitations/{token}", response_model=InvitationPublicRead)
async def verify_invitation(
    token: str, db: AsyncSession = Depends(get_db)
) -> InvitationPublicRead:
    return await service.verify_invitation(db, token)


@router.post("/invitations/{token}/accept", response_model=TokenResponse)
async def accept_invitation(
    token: str,
    payload: AcceptInvitationRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    return await service.accept_invitation(
        db,
        raw_token=token,
        first_name=payload.first_name,
        last_name=payload.last_name,
        password=payload.password,
        username=payload.username,
    )


@users_router.get("/me", response_model=UserRead)
async def get_me(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserRead:
    return await service.get_user(db, current_user.user_id)


@users_router.patch("/me/profile", response_model=UserRead)
async def update_my_profile(
    payload: UpdateProfileRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserRead:
    return await service.update_profile(
        db, current_user.user_id, **payload.model_dump(exclude_none=True)
    )


@users_router.patch("/me/email", response_model=UserRead)
async def change_my_email(
    payload: ChangeEmailRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserRead:
    return await service.change_email(
        db,
        current_user.user_id,
        new_email=payload.new_email,
        current_password=payload.current_password,
    )


@users_router.patch(
    "/me/password", status_code=status.HTTP_204_NO_CONTENT, response_model=None
)
async def change_my_password(
    payload: ChangePasswordRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    await service.change_password(
        db,
        current_user.user_id,
        current_password=payload.current_password,
        new_password=payload.new_password,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@users_router.get("/me/settings", response_model=UserSettingsRead)
async def get_my_settings(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserSettingsRead:
    return await service.get_user_settings(db, current_user.user_id)


@users_router.patch("/me/settings", response_model=UserSettingsRead)
async def update_my_settings(
    payload: UpdateUserSettingsRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserSettingsRead:
    return await service.update_user_settings(
        db, current_user.user_id, **payload.model_dump(exclude_none=True)
    )


@users_router.post(
    "/me/presence", status_code=status.HTTP_204_NO_CONTENT, response_model=None
)
async def set_my_presence(
    payload: PresenceUpdateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    await service.set_presence(db, current_user.user_id, payload.status)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@users_router.put("/me/status", response_model=UserRead)
async def update_my_status(
    payload: CustomStatusUpdateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserRead:
    return await service.set_custom_status(
        db,
        current_user.user_id,
        presence_status=payload.presence_status,
        status_text=payload.status_text,
        status_emoji=payload.status_emoji,
        clear_after_minutes=payload.clear_after_minutes,
    )


@users_router.delete("/me/status", response_model=UserRead)
async def clear_my_status(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserRead:
    return await service.clear_custom_status(db, current_user.user_id)


@users_router.get("/presence", response_model=dict)
async def get_presence_snapshot(
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    from app.core.websocket_manager import connection_manager

    return connection_manager.presence_snapshot()


SAFE_DEPARTMENT_ROLES = {"Developer", "QA", "UIUX", "TeamLead", "Guest", "Client"}


@users_router.post(
    "/invitations",
    response_model=InvitationRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_invitation(
    payload: CreateInvitationRequest,
    current_user: CurrentUser = Depends(
        require_permission(Permissions.USERS_INVITE, Permissions.MANAGE_USERS)
    ),
    db: AsyncSession = Depends(get_db),
) -> InvitationRead:
    from app.core.exceptions import ForbiddenError

    # Guard SuperAdmin invitations (C-3)
    if payload.role_name.strip().lower() == "superadmin":
        if not current_user.is_super_admin():
            raise ForbiddenError("Only SuperAdmins can invite SuperAdmin users.")

    if not current_user.is_super_admin():
        from app.core.permissions import permissions_for_roles
        inviter_perms = set(current_user.permissions)
        role_perms = set(permissions_for_roles([payload.role_name]))
        if not role_perms.issubset(inviter_perms):
            raise ForbiddenError("You cannot invite a user to a role with higher permissions than your own.")

    return await service.create_invitation(
        db,
        email=payload.email,
        role_name=payload.role_name,
        invited_by_user_id=current_user.user_id,
        department_id=payload.department_id,
        team_id=payload.team_id,
        manager_id=payload.manager_id,
    )


@users_router.get("/invitations", response_model=list[InvitationRead])
async def list_invitations(
    current_user: CurrentUser = Depends(
        require_permission(Permissions.USERS_INVITE, Permissions.MANAGE_USERS)
    ),
    db: AsyncSession = Depends(get_db),
) -> list[InvitationRead]:
    return await service.list_invitations(db)


@users_router.delete(
    "/invitations/{invitation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def revoke_invitation(
    invitation_id: UUID,
    current_user: CurrentUser = Depends(
        require_permission(Permissions.USERS_INVITE, Permissions.MANAGE_USERS)
    ),
    db: AsyncSession = Depends(get_db),
) -> Response:
    await service.revoke_invitation(db, invitation_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@users_router.get("", response_model=Page[UserRead])
async def get_users(
    search: Optional[str] = Query(default=None),
    params: PageParams = Depends(),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Page[UserRead]:
    items, total = await service.list_users(
        db, search=search, page=params.page, page_size=params.page_size
    )
    return Page.create(items, total, params)


@users_router.get("/{user_id}", response_model=UserRead)
async def get_user(
    user_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserRead:
    return await service.get_user(db, user_id)


@users_router.post("", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: CreateUserRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserRead:
    from app.core.exceptions import ForbiddenError

    is_dept_mgr = False
    if payload.department_id:
        from app.modules.organization.service import is_department_manager
        is_dept_mgr = await is_department_manager(db, current_user.user_id, payload.department_id)
    if not (current_user.is_super_admin() or current_user.has_permission(Permissions.MANAGE_USERS) or is_dept_mgr):
        raise ForbiddenError("You do not have permission to create users.")

    # Guard SuperAdmin role assignment (C-3)
    if any(r.strip().lower() == "superadmin" for r in payload.role_names):
        if not current_user.is_super_admin():
            raise ForbiddenError("Only SuperAdmins can assign the SuperAdmin role.")

    # Department Managers can only assign safe roles to members of their department
    if is_dept_mgr and not (current_user.is_super_admin() or current_user.has_permission(Permissions.MANAGE_USERS)):
        for r in payload.role_names:
            if r not in SAFE_DEPARTMENT_ROLES:
                raise ForbiddenError(f"Department managers may only assign roles from: {', '.join(sorted(SAFE_DEPARTMENT_ROLES))}.")

    return await service.create_user(
        db,
        email=payload.email,
        password=payload.password,
        first_name=payload.first_name,
        last_name=payload.last_name,
        job_title=payload.job_title,
        role_names=payload.role_names,
        username=payload.username,
        department_id=payload.department_id,
        team_id=payload.team_id,
        manager_id=payload.manager_id,
    )


@users_router.delete(
    "/{user_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None
)
async def delete_user(
    user_id: UUID,
    current_user: CurrentUser = Depends(require_permission(Permissions.MANAGE_USERS)),
    db: AsyncSession = Depends(get_db),
) -> Response:
    await service.delete_user(db, user_id=user_id, acting_user_id=current_user.user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@users_router.patch("/{user_id}", response_model=UserRead)
async def admin_update_user(
    user_id: UUID,
    payload: AdminUpdateUserRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserRead:
    from app.core.exceptions import ForbiddenError
    from app.modules.organization.service import get_employee_context, is_department_manager
    ctx = await get_employee_context(db, user_id)
    is_dept_mgr = False
    if ctx and ctx.department_id:
        is_dept_mgr = await is_department_manager(db, current_user.user_id, ctx.department_id)
    if not (current_user.is_super_admin() or current_user.has_permission(Permissions.MANAGE_USERS) or is_dept_mgr):
        raise ForbiddenError("You do not have permission to update this user.")

    # Guard SuperAdmin target user and role assignments (C-3)
    target_user = await repo.get_user_by_id(db, user_id)
    if target_user and "SuperAdmin" in [ur.role.name for ur in target_user.roles]:
        if not current_user.is_super_admin():
            raise ForbiddenError("Only SuperAdmins can modify a SuperAdmin account.")

    if payload.role_names is not None:
        if any(r.strip().lower() == "superadmin" for r in payload.role_names):
            if not current_user.is_super_admin():
                raise ForbiddenError("Only SuperAdmins can assign the SuperAdmin role.")
        if is_dept_mgr and not (current_user.is_super_admin() or current_user.has_permission(Permissions.MANAGE_USERS)):
            for r in payload.role_names:
                if r not in SAFE_DEPARTMENT_ROLES:
                    raise ForbiddenError(f"Department managers may only assign roles from: {', '.join(sorted(SAFE_DEPARTMENT_ROLES))}.")

    return await service.admin_update_user(
        db,
        user_id=user_id,
        first_name=payload.first_name,
        last_name=payload.last_name,
        username=payload.username,
        email=payload.email,
        job_title=payload.job_title,
        department_id=payload.department_id,
        team_id=payload.team_id,
        manager_id=payload.manager_id,
        bio=payload.bio,
        is_active=payload.is_active,
        role_names=payload.role_names,
    )


@users_router.post(
    "/{user_id}/reset-password",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def admin_reset_password(
    user_id: UUID,
    payload: AdminResetPasswordRequest,
    current_user: CurrentUser = Depends(require_permission(Permissions.MANAGE_USERS)),
    db: AsyncSession = Depends(get_db),
) -> Response:
    await service.admin_reset_password(
        db,
        user_id=user_id,
        new_password=payload.new_password,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@users_router.put("/{user_id}/roles", response_model=UserRead)
async def assign_roles(
    user_id: UUID,
    payload: AssignRolesRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserRead:
    from app.core.exceptions import ForbiddenError
    from app.modules.organization.service import get_employee_context, is_department_manager
    ctx = await get_employee_context(db, user_id)
    is_dept_mgr = False
    if ctx and ctx.department_id:
        is_dept_mgr = await is_department_manager(db, current_user.user_id, ctx.department_id)
    if not (current_user.is_super_admin() or current_user.has_permission(Permissions.MANAGE_ROLES) or is_dept_mgr):
        raise ForbiddenError("You do not have permission to assign roles.")

    # Guard SuperAdmin role assignment (C-3)
    if any(r.strip().lower() == "superadmin" for r in payload.role_names):
        if not current_user.is_super_admin():
            raise ForbiddenError("Only SuperAdmins can assign the SuperAdmin role.")

    target_user = await repo.get_user_by_id(db, user_id)
    if target_user and "SuperAdmin" in [ur.role.name for ur in target_user.roles]:
        if not current_user.is_super_admin():
            raise ForbiddenError("Only SuperAdmins can modify a SuperAdmin account.")

    if is_dept_mgr and not (current_user.is_super_admin() or current_user.has_permission(Permissions.MANAGE_ROLES)):
        for r in payload.role_names:
            if r not in SAFE_DEPARTMENT_ROLES:
                raise ForbiddenError(f"Department managers may only assign roles from: {', '.join(sorted(SAFE_DEPARTMENT_ROLES))}.")

    return await service.assign_roles(
        db, user_id=user_id, role_names=payload.role_names
    )


@rbac_router.get("/roles", response_model=list[RoleRead])
async def get_roles(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[RoleRead]:
    roles = await list_roles(db)
    return [RoleRead.model_validate(r) for r in roles]


@rbac_router.post(
    "/roles",
    response_model=RoleRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_role(
    payload: CreateRoleRequest,
    current_user: CurrentUser = Depends(require_permission(Permissions.MANAGE_ROLES)),
    db: AsyncSession = Depends(get_db),
) -> RoleRead:
    from app.core.exceptions import ForbiddenError
    if payload.name.strip().lower() == "superadmin" or any(p.startswith("system.") for p in payload.permission_codes):
        if not current_user.is_super_admin():
            raise ForbiddenError("Only SuperAdmins can create system roles.")
    role = await service.create_role(
        db,
        name=payload.name,
        description=payload.description,
        permission_codes=payload.permission_codes,
    )
    return RoleRead.model_validate(role)


@rbac_router.patch("/roles/{role_id}", response_model=RoleRead)
async def update_role_permissions(
    role_id: UUID,
    payload: UpdateRolePermissionsRequest,
    current_user: CurrentUser = Depends(require_permission(Permissions.MANAGE_ROLES)),
    db: AsyncSession = Depends(get_db),
) -> RoleRead:
    from app.core.exceptions import ForbiddenError
    target_role = await repo.get_role_by_id(db, role_id)
    if target_role and (target_role.name == "SuperAdmin" or any(p.startswith("system.") for p in payload.permission_codes)):
        if not current_user.is_super_admin():
            raise ForbiddenError("Only SuperAdmins can modify system permissions or the SuperAdmin role.")
    role = await service.update_role_permissions(
        db,
        role_id=role_id,
        permission_codes=payload.permission_codes,
    )
    return RoleRead.model_validate(role)


@rbac_router.get("/permissions", response_model=list[PermissionRead])
async def get_permissions(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[PermissionRead]:
    permissions = await list_permissions(db)
    return [PermissionRead.model_validate(p) for p in permissions]
