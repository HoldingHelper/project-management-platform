"""Unit tests for identity, authentication, RBAC, invitations, and admin controls."""

from __future__ import annotations

from datetime import timedelta
from unittest.mock import AsyncMock
from uuid import uuid4
import pytest
from pydantic import ValidationError

from app.core.current_user import CurrentUser
from app.core.exceptions import ForbiddenError
from app.core.permissions import (
    ROLE_SUPER_ADMIN,
    ROLE_DEVELOPER,
    ROLE_PROJECT_MANAGER,
    Permissions,
    permissions_for_roles,
)
from app.core.security import (
    create_access_token,
    decode_token,
    generate_opaque_token,
    hash_opaque_token,
    hash_password,
    verify_password,
)
from app.modules.identity.schemas import (
    AdminResetPasswordRequest,
    AdminUpdateUserRequest,
    CreateInvitationRequest,
    CreateRoleRequest,
    LoginRequest,
    PresenceUpdateRequest,
    UpdateRolePermissionsRequest,
)
from app.modules.identity.models import Permission, Role, RolePermission, User, UserRole
from app.modules.identity.router import rbac_router
from app.shared.base_model import utcnow


def test_password_hashing_and_verification():
    raw_pass = "MySuperSecurePass123!"
    hashed = hash_password(raw_pass)
    assert hashed != raw_pass
    assert verify_password(raw_pass, hashed) is True
    assert verify_password("WrongPassword!", hashed) is False
    assert verify_password("", hashed) is False


def test_opaque_token_generation_and_hashing():
    token1 = generate_opaque_token()
    token2 = generate_opaque_token()
    assert len(token1) >= 32
    assert token1 != token2

    hash1 = hash_opaque_token(token1)
    hash2 = hash_opaque_token(token2)
    assert hash1 == hash_opaque_token(token1)
    assert hash1 != hash2


def test_jwt_access_token_lifecycle():
    user_id = uuid4()
    email = "test@example.com"
    full_name = "Test User"
    roles = ["Developer", "UIUX"]
    perms = ["tasks.view", "tasks.comment"]

    token = create_access_token(
        user_id=user_id,
        email=email,
        full_name=full_name,
        roles=roles,
        permissions=perms,
        expires_delta=timedelta(seconds=3600),
    )
    assert isinstance(token, str)

    payload = decode_token(token)
    assert payload is not None
    assert payload["sub"] == str(user_id)
    assert payload["email"] == email
    assert payload["name"] == full_name
    assert payload["roles"] == roles
    assert payload["permissions"] == perms
    assert payload["allow_role_bypass"] is True


def test_delegated_access_token_can_disable_role_bypass():
    token = create_access_token(
        user_id=uuid4(),
        email="scoped-admin@example.com",
        full_name="Scoped Admin",
        roles=["SuperAdmin"],
        permissions=[Permissions.DOCS_VIEW],
        allow_role_bypass=False,
    )
    assert decode_token(token)["allow_role_bypass"] is False


def test_login_request_identifier_or_email():
    # Identifier (email or username)
    req1 = LoginRequest(identifier="jdoe", password="secretpassword")
    assert req1.login_identifier == "jdoe"

    req2 = LoginRequest(email="jdoe@example.com", password="secretpassword")
    assert req2.login_identifier == "jdoe@example.com"

    # Missing identifier & email raises ValidationError
    with pytest.raises(ValidationError):
        LoginRequest(password="secretpassword")


def test_admin_update_user_request_validation():
    req = AdminUpdateUserRequest(
        first_name="Jane",
        last_name="Doe",
        username="janedoe",
        email="jane@example.com",
        job_title="Staff Engineer",
        bio="Building distributed systems",
        is_active=True,
        role_names=["SuperAdmin", "ProjectManager"],
    )
    assert req.first_name == "Jane"
    assert req.username == "janedoe"
    assert req.is_active is True
    assert "SuperAdmin" in req.role_names

    # Custom role names pass transport validation and are checked against the DB by the service.
    custom = AdminUpdateUserRequest(role_names=["Support Lead"])
    assert custom.role_names == ["Support Lead"]


def test_admin_reset_password_request_min_length():
    valid = AdminResetPasswordRequest(new_password="8charmin")
    assert valid.new_password == "8charmin"

    with pytest.raises(ValidationError):
        AdminResetPasswordRequest(new_password="short")


def test_invitation_request_schemas():
    inv = CreateInvitationRequest(email="newuser@example.com", role_name="Developer")
    assert inv.email == "newuser@example.com"
    assert inv.role_name == "Developer"

    with pytest.raises(ValidationError):
        CreateInvitationRequest(email="invalid-email-format", role_name="Developer")

    custom = CreateInvitationRequest(email="valid@example.com", role_name="Support Lead")
    assert custom.role_name == "Support Lead"


def test_create_role_schema_normalizes_name_and_permissions():
    request = CreateRoleRequest(
        name="  Support   Lead  ",
        description=" Handles tickets ",
        permission_codes=["tasks.view", "tasks.view", "tasks.comment"],
    )
    assert request.name == "Support Lead"
    assert request.description == "Handles tickets"
    assert request.permission_codes == ["tasks.view", "tasks.comment"]


def test_update_role_permissions_schema_normalizes_permissions():
    request = UpdateRolePermissionsRequest(
        permission_codes=[" tasks.view ", "tasks.view", "tasks.comment", ""],
    )
    assert request.permission_codes == ["tasks.view", "tasks.comment"]


def test_custom_role_permissions_are_included_in_user_authorization():
    from app.modules.identity.service import permissions_for_user

    permission = Permission(id=uuid4(), code="tasks.manage_team", description="Manage team tasks")
    role = Role(id=uuid4(), name="Support Lead", description="Support queue")
    role_permission = RolePermission(role_id=role.id, permission_id=permission.id)
    role_permission.permission = permission
    role.permissions = [role_permission]
    user = User(
        id=uuid4(),
        email="support@example.com",
        first_name="Support",
        last_name="Lead",
        password_hash="unused",
        is_active=True,
    )
    user_role = UserRole(user_id=user.id, role_id=role.id)
    user_role.role = role
    user.roles = [user_role]

    assert "tasks.manage_team" in permissions_for_user(user)


def test_loaded_database_permissions_override_seeded_role_defaults():
    from app.modules.identity.service import permissions_for_user

    role = Role(id=uuid4(), name=ROLE_DEVELOPER, description="Developer role")
    role.permissions = []
    user = User(
        id=uuid4(),
        email="developer@example.com",
        first_name="Database",
        last_name="Authority",
        password_hash="unused",
        is_active=True,
    )
    user_role = UserRole(user_id=user.id, role_id=role.id)
    user_role.role = role
    user.roles = [user_role]

    assert permissions_for_user(user) == []


@pytest.mark.asyncio
async def test_administrator_can_replace_role_permissions(monkeypatch):
    from app.modules.identity import service

    role = Role(id=uuid4(), name=ROLE_DEVELOPER, description="Developer role")
    role.permissions = []
    task_view = Permission(id=uuid4(), code="tasks.view", description="View tasks")
    task_comment = Permission(id=uuid4(), code="tasks.comment", description="Comment")
    monkeypatch.setattr(service.repo, "get_role_by_id", AsyncMock(return_value=role))
    monkeypatch.setattr(
        service.repo,
        "get_permission_by_code",
        AsyncMock(
            side_effect=lambda _db, code: {
                task_view.code: task_view,
                task_comment.code: task_comment,
            }.get(code)
        ),
    )
    db = AsyncMock()

    updated = await service.update_role_permissions(
        db,
        role_id=role.id,
        permission_codes=[task_view.code, task_comment.code],
    )

    assert updated is role
    assert updated.permission_codes == ["tasks.comment", "tasks.view"]
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_super_admin_permissions_cannot_be_customized(monkeypatch):
    from app.core.exceptions import ValidationAppError
    from app.modules.identity import service

    role = Role(
        id=uuid4(), name=ROLE_SUPER_ADMIN, description="Workspace administrator"
    )
    role.permissions = []
    monkeypatch.setattr(service.repo, "get_role_by_id", AsyncMock(return_value=role))

    with pytest.raises(ValidationAppError, match="always has every permission"):
        await service.update_role_permissions(
            AsyncMock(),
            role_id=role.id,
            permission_codes=[],
        )


@pytest.mark.asyncio
async def test_role_permission_update_route_requires_role_administration():
    route = next(
        route
        for route in rbac_router.routes
        if route.path == "/roles/{role_id}" and "PATCH" in route.methods
    )
    dependency = next(
        dependency
        for dependency in route.dependant.dependencies
        if dependency.name == "current_user"
    )
    ordinary_user = CurrentUser(
        user_id=uuid4(),
        email="member@example.com",
        full_name="Member",
    )
    administrator = CurrentUser(
        user_id=uuid4(),
        email="admin@example.com",
        full_name="Administrator",
        permissions=[Permissions.MANAGE_ROLES],
    )

    with pytest.raises(ForbiddenError):
        await dependency.call(ordinary_user)
    assert await dependency.call(administrator) is administrator


def test_presence_update_allowed_statuses():
    for status in ["online", "busy", "away", "focus", "offline"]:
        req = PresenceUpdateRequest(status=status)
        assert req.status == status

    with pytest.raises(ValidationError):
        PresenceUpdateRequest(status="invisible")


def test_rbac_matrix_super_admin_has_all_permissions():
    super_perms = permissions_for_roles([ROLE_SUPER_ADMIN])
    all_perms = Permissions.all()
    assert set(super_perms) == set(all_perms)


def test_rbac_matrix_developer_and_pm_union():
    dev_perms = permissions_for_roles([ROLE_DEVELOPER])
    pm_perms = permissions_for_roles([ROLE_PROJECT_MANAGER])
    union_perms = permissions_for_roles([ROLE_DEVELOPER, ROLE_PROJECT_MANAGER])

    assert "tasks.edit_assigned" in dev_perms
    assert "projects.manage_assigned" in pm_perms
    assert set(union_perms) == (set(dev_perms) | set(pm_perms))


@pytest.mark.asyncio
async def test_admin_reset_password_updates_password_hash_and_revokes_tokens(monkeypatch):
    from app.modules.identity import service
    from app.modules.identity.models import User

    user_id = uuid4()
    mock_user = User(
        id=user_id,
        email="test@example.com",
        first_name="Ali",
        last_name="Eskandarian",
        password_hash=hash_password("oldpassword123"),
        is_active=True,
    )

    revoked_user_id = None
    committed = False

    async def mock_get_user_by_id(_db, uid):
        return mock_user if uid == user_id else None

    async def mock_revoke_tokens(_db, uid):
        nonlocal revoked_user_id
        revoked_user_id = uid

    class MockDB:
        async def commit(self):
            nonlocal committed
            committed = True

    monkeypatch.setattr(service.repo, "get_user_by_id", mock_get_user_by_id)
    monkeypatch.setattr(service.repo, "revoke_all_refresh_tokens_for_user", mock_revoke_tokens)

    await service.admin_reset_password(
        MockDB(),  # type: ignore[arg-type]
        user_id=user_id,
        new_password="NewSecurePassword2026!",
    )

    assert verify_password("NewSecurePassword2026!", mock_user.password_hash) is True
    assert verify_password("oldpassword123", mock_user.password_hash) is False
    assert revoked_user_id == user_id
    assert committed is True


@pytest.mark.asyncio
async def test_set_and_clear_custom_status(monkeypatch):
    from app.modules.identity import service
    user_id = uuid4()
    mock_user = User(
        id=user_id,
        email="status.user@example.test",
        username="statususer",
        password_hash="hash",
        first_name="Status",
        last_name="Tester",
        presence_status="online",
        status_text=None,
        status_emoji=None,
        status_expires_at=None,
        is_active=True,
        mfa_enabled=False,
        created_at=utcnow(),
    )
    mock_user.roles = []

    async def mock_get_user_by_id(_db, uid):
        return mock_user if uid == user_id else None

    class MockDB:
        async def commit(self):
            pass

        async def refresh(self, obj, attribute_names=None):
            pass

    async def mock_get_employee_context(_db, _uid):
        return None

    monkeypatch.setattr(service.repo, "get_user_by_id", mock_get_user_by_id)
    monkeypatch.setattr("app.modules.organization.service.get_employee_context", mock_get_employee_context)

    # 1. Set custom status with emoji and clear_after_minutes
    user_read = await service.set_custom_status(
        MockDB(),  # type: ignore[arg-type]
        user_id=user_id,
        presence_status="busy",
        status_text="Out sick",
        status_emoji="🤒",
        clear_after_minutes=60,
    )

    assert user_read.presence_status == "busy"
    assert user_read.status_text == "Out sick"
    assert user_read.status_emoji == "🤒"
    assert user_read.status_expires_at is not None

    # 2. Get user summary includes status
    summary = await service.get_user_summary(MockDB(), user_id=user_id)  # type: ignore[arg-type]
    assert summary is not None
    assert summary.presence_status == "busy"
    assert summary.status_text == "Out sick"
    assert summary.status_emoji == "🤒"

    # 3. Clear custom status
    cleared = await service.clear_custom_status(MockDB(), user_id=user_id)  # type: ignore[arg-type]
    assert cleared.status_text is None
    assert cleared.status_emoji is None
    assert cleared.status_expires_at is None
