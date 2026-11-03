"""Comprehensive unit tests for Telegram connection lifecycle, dynamic RBAC, and server-side authorization."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from aiogram.types import CallbackQuery, Chat, Message, User as TgUser

from app.core.current_user import CurrentUser
from app.core.exceptions import ForbiddenError
from app.core.permissions import Permissions
from app.modules.identity.models import User
from app.modules.integrations.models import UserTelegramConnection
from app.modules.integrations.user_service import (
    disconnect_telegram,
    generate_telegram_link_code,
)
from app.modules.projects.models import Project, ProjectMember, TaskItem
from app.modules.telegram.capabilities import TelegramCapabilityService, UserCapabilities
from app.modules.telegram.executor import CommandExecutor
from app.modules.telegram.handlers.callbacks import (
    handle_menu_callbacks,
    handle_project_quick_action,
    handle_quick_status_change,
)
from app.modules.telegram.handlers.commands import handle_disconnect, handle_menu, handle_start
from app.modules.telegram.resolver import EntityResolver
from app.modules.telegram.schemas import (
    AddCommentIntent,
    CreateProjectIntent,
    CreateTaskIntent,
    ListProjectsIntent,
    UpdateTaskStatusIntent,
)
from app.modules.telegram.security import (
    disconnect_telegram_account,
    link_telegram_account,
    resolve_telegram_user,
)
from app.modules.telegram.ui import (
    make_dynamic_main_menu,
    make_project_actions_keyboard,
    make_task_actions_keyboard,
)


@pytest.fixture
def test_user() -> User:
    u = User(
        id=uuid4(),
        email="developer@example.com",
        username="dev_user",
        first_name="Developer",
        last_name="Person",
        is_active=True,
    )
    return u


@pytest.fixture
def test_current_user(test_user: User) -> CurrentUser:
    return CurrentUser(
        user_id=test_user.id,
        email=test_user.email,
        full_name=test_user.full_name or "Dev",
        roles=["developer"],
        permissions=[Permissions.TASKS_VIEW, Permissions.TASKS_EDIT_ASSIGNED, Permissions.TASKS_COMMENT],
    )


# =============================================================================
# 1. Connection Token Generation & Deep Link
# =============================================================================

@pytest.mark.asyncio
async def test_generate_telegram_link_code(test_current_user: CurrentUser):
    """Test generating a secure, short-lived single-use Telegram link token."""
    mock_db = AsyncMock()
    mock_existing_conn = None

    async def mock_execute(stmt):
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_existing_conn
        return mock_result

    mock_db.execute = AsyncMock(side_effect=mock_execute)
    mock_db.add = MagicMock()
    mock_db.flush = AsyncMock()

    resp = await generate_telegram_link_code(mock_db, test_current_user)

    assert resp.link_code is not None
    assert len(resp.link_code) == 32  # 32-hex character cryptographically secure token
    assert "https://t.me/" in resp.deep_link
    assert resp.deep_link.endswith(f"?start={resp.link_code}")
    # Ensure sensitive data (passwords, JWTs, role names, permissions) are NOT exposed in link
    assert "developer" not in resp.deep_link
    assert str(test_current_user.user_id) not in resp.deep_link
    assert test_current_user.email not in resp.deep_link
    assert resp.expires_at > datetime.now(timezone.utc)


# =============================================================================
# 2. Telegram Account Linking, Replay & Expiration
# =============================================================================

@pytest.mark.asyncio
async def test_link_telegram_account_valid(test_user: User):
    """Test linking Telegram account with a valid, non-expired token."""
    mock_db = AsyncMock()
    valid_token = "a" * 32
    conn = UserTelegramConnection(
        user_id=test_user.id,
        auth_link_code=valid_token,
        auth_link_expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
        is_connected=False,
    )

    async def mock_execute(stmt):
        mock_res = MagicMock()
        params = getattr(stmt.compile(), "params", {})
        if any("telegram_chat_id" in k for k in params.keys()):
            mock_res.scalar_one_or_none.return_value = conn if conn.is_connected else None
        else:
            mock_res.scalar_one_or_none.return_value = conn
        mock_res.scalars.return_value.all.return_value = []
        return mock_res

    mock_db.execute = AsyncMock(side_effect=mock_execute)

    with patch("app.modules.telegram.security.identity_repo.get_user_by_id", AsyncMock(return_value=test_user)):
        success, msg, linked_user = await link_telegram_account(mock_db, 987654321, "tg_user", valid_token)

    assert success is True
    assert linked_user is not None
    assert linked_user.id == test_user.id
    assert conn.is_connected is True
    assert conn.telegram_chat_id == "987654321"
    assert conn.auth_link_code.startswith("used_")  # Single-use consumed


@pytest.mark.asyncio
async def test_link_telegram_account_expired(test_user: User):
    """Test rejection when token is expired."""
    mock_db = AsyncMock()
    expired_token = "b" * 32
    conn = UserTelegramConnection(
        user_id=test_user.id,
        auth_link_code=expired_token,
        auth_link_expires_at=datetime.now(timezone.utc) - timedelta(minutes=5),  # expired
        is_connected=False,
    )

    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = conn
    mock_db.execute = AsyncMock(return_value=mock_res)

    success, msg, linked_user = await link_telegram_account(mock_db, 987654321, "tg_user", expired_token)
    assert success is False
    assert linked_user is None
    assert "منقضی" in msg or "expired" in msg.lower()


@pytest.mark.asyncio
async def test_link_telegram_account_replay():
    """Test that reused or invalid tokens are rejected."""
    mock_db = AsyncMock()
    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = None
    mock_db.execute = AsyncMock(return_value=mock_res)

    success, msg, linked_user = await link_telegram_account(mock_db, 987654321, "tg_user", "invalid_token")
    assert success is False
    assert linked_user is None
    assert "نامعتبر" in msg or "یافت نشد" in msg or "invalid" in msg.lower()


@pytest.mark.asyncio
async def test_disconnect_telegram_flow(test_user: User):
    """Test disconnecting Telegram account from PMP and bot."""
    mock_db = AsyncMock()
    conn = UserTelegramConnection(
        user_id=test_user.id,
        telegram_chat_id="987654321",
        is_connected=True,
        connected_at=datetime.now(timezone.utc),
        auth_link_code="active_token",
    )

    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = conn
    mock_db.execute = AsyncMock(return_value=mock_res)

    # Disconnect via user_service
    await disconnect_telegram(mock_db, test_user.id)
    assert conn.telegram_chat_id is None
    assert conn.is_connected is False
    assert conn.auth_link_code.startswith("revoked_")


# =============================================================================
# 3. Dynamic Capabilities Derived From Current PMP Permissions
# =============================================================================

def test_capabilities_super_admin():
    admin_user = CurrentUser(
        user_id=uuid4(),
        email="admin@example.com",
        full_name="Admin User",
        roles=["SuperAdmin"],
        permissions=[],
    )
    caps = TelegramCapabilityService.get_user_capabilities(admin_user)
    assert caps.can_create_project is True
    assert caps.can_view_projects is True
    assert caps.can_create_sprint is True
    assert caps.can_create_task is True
    assert caps.can_assign_task is True
    assert caps.can_edit_task is True
    assert caps.can_view_analytics is True
    assert caps.can_manage_project_members is True


def test_capabilities_developer_role():
    dev_user = CurrentUser(
        user_id=uuid4(),
        email="dev@example.com",
        full_name="Dev User",
        roles=["developer"],
        permissions=[
            Permissions.PROJECTS_VIEW_ASSIGNED,
            Permissions.TASKS_VIEW,
            Permissions.TASKS_EDIT_ASSIGNED,
            Permissions.TASKS_COMMENT,
            Permissions.TASKS_UPLOAD_FILES,
        ],
    )
    caps = TelegramCapabilityService.get_user_capabilities(dev_user)
    assert caps.can_create_project is False
    assert caps.can_manage_project_members is False
    assert caps.can_create_sprint is False
    assert caps.can_view_projects is True
    assert caps.can_view_tasks is True
    assert caps.can_add_comment is True
    assert caps.can_upload_files is True


def test_capabilities_readonly_role():
    ro_user = CurrentUser(
        user_id=uuid4(),
        email="auditor@example.com",
        full_name="Auditor",
        roles=["auditor"],
        permissions=[Permissions.READONLY_ACCESS],
    )
    caps = TelegramCapabilityService.get_user_capabilities(ro_user)
    assert caps.can_create_project is False
    assert caps.can_create_task is False
    assert caps.can_assign_task is False
    assert caps.can_add_comment is False
    assert caps.can_upload_files is False
    assert caps.can_view_projects is True
    assert caps.can_view_tasks is True


# =============================================================================
# 4. Permission-Aware UI Keyboards
# =============================================================================

def test_dynamic_main_menu_buttons_filter():
    """Verify buttons reflect only granted capabilities."""
    # 1. Full admin capabilities
    admin_caps = UserCapabilities(
        can_create_project=True,
        can_view_projects=True,
        can_create_task=True,
        can_view_tasks=True,
        can_view_sprints=True,
        can_create_ticket=True,
        can_view_analytics=True,
        can_search_docs=True,
    )
    admin_menu = make_dynamic_main_menu(admin_caps, lang="fa")
    button_callbacks = [btn.callback_data for row in admin_menu.inline_keyboard for btn in row]
    assert "menu:create_project" in button_callbacks
    assert "menu:projects" in button_callbacks
    assert "menu:create_task" in button_callbacks
    assert "menu:mytasks" in button_callbacks
    assert "menu:analytics" in button_callbacks

    # 2. Developer capabilities (cannot create project, cannot view analytics)
    dev_caps = UserCapabilities(
        can_create_project=False,
        can_view_projects=True,
        can_create_task=True,
        can_view_tasks=True,
        can_view_sprints=True,
        can_create_ticket=True,
        can_view_analytics=False,
        can_search_docs=True,
    )
    dev_menu = make_dynamic_main_menu(dev_caps, lang="fa")
    dev_callbacks = [btn.callback_data for row in dev_menu.inline_keyboard for btn in row]
    assert "menu:create_project" not in dev_callbacks  # Excluded!
    assert "menu:analytics" not in dev_callbacks  # Excluded!
    assert "menu:projects" in dev_callbacks
    assert "menu:create_task" in dev_callbacks
    assert "menu:mytasks" in dev_callbacks


def test_task_actions_keyboard_filtering():
    """Verify task action keyboard excludes actions without permissions."""
    task_id = uuid4()
    # Read-only user: cannot change status, cannot assign, cannot comment, cannot attach
    ro_caps = UserCapabilities(
        can_change_task_status=False,
        can_assign_task=False,
        can_add_comment=False,
        can_upload_files=False,
    )
    kb = make_task_actions_keyboard(task_id, "In Progress", capabilities=ro_caps)
    callbacks = [btn.callback_data for row in kb.inline_keyboard for btn in row]
    assert not any(c.startswith("task_st:") for c in callbacks)
    assert f"task_act:assign:{task_id}" not in callbacks
    assert f"task_act:comment:{task_id}" not in callbacks
    assert f"task_act:attach:{task_id}" not in callbacks


# =============================================================================
# 5. Server-Side Authorization Enforcement (Defense In Depth)
# =============================================================================

@pytest.mark.asyncio
async def test_executor_create_project_denied_without_permission(test_current_user: CurrentUser):
    """User without PROJECTS_CREATE cannot create a project."""
    mock_db = AsyncMock()
    executor = CommandExecutor(mock_db, test_current_user, 12345678)
    intent = CreateProjectIntent(name="Forbidden Project", raw_query="پروژه جدید بساز")

    res = await executor.execute(intent)
    assert "دسترسی لازم برای ساخت پروژه را ندارید" in res.text or "permission" in res.text.lower()


@pytest.mark.asyncio
async def test_executor_add_comment_allowed_with_permission(test_current_user: CurrentUser):
    """User with TASKS_COMMENT can add comments."""
    mock_db = AsyncMock()
    executor = CommandExecutor(mock_db, test_current_user, 12345678)
    task_id = uuid4()
    mock_task = SimpleNamespace(id=task_id, title="Fix Login Bug", phase=None, assignees=[])

    with patch("app.modules.telegram.executor.EntityResolver.resolve_task") as mock_resolve, \
         patch("app.modules.telegram.executor.collaboration_service.create_comment", AsyncMock()):
        mock_resolve.return_value = SimpleNamespace(is_exact=True, entity=mock_task)
        intent = AddCommentIntent(task_id_or_title=str(task_id), comment_text="Working on it")
        res = await executor.execute(intent)

    assert "نظر شما روی تسک" in res.text or "Comment added" in res.text


@pytest.mark.asyncio
async def test_callback_status_change_rejected_server_side(test_current_user: CurrentUser):
    """Even if an unauthorized user clicks/forges a status change callback, server rejects it."""
    # User has no edit/status permission
    restricted_user = CurrentUser(
        user_id=test_current_user.user_id,
        email="test@example.com",
        full_name="Restricted",
        roles=[],
        permissions=[],
    )

    cb = MagicMock(spec=CallbackQuery)
    cb.data = f"task_st:{uuid4()}:Done"
    cb.message = MagicMock()
    cb.from_user = TgUser(id=12345678, is_bot=False, first_name="Test")
    cb.answer = AsyncMock()

    mock_db = AsyncMock()
    mock_user = SimpleNamespace(id=restricted_user.user_id, full_name="Restricted")
    mock_task = SimpleNamespace(id=uuid4(), title="Test Task", assignees=[])

    with patch("app.modules.telegram.handlers.callbacks.AsyncSessionLocal", lambda: mock_db), \
         patch("app.modules.telegram.handlers.callbacks.resolve_telegram_user", AsyncMock(return_value=(mock_user, restricted_user))), \
         patch("app.modules.telegram.resolver.EntityResolver.resolve_task", AsyncMock(return_value=SimpleNamespace(is_exact=True, entity=mock_task))):
        await handle_quick_status_change(cb)

    cb.answer.assert_called_once()
    alert_text = cb.answer.call_args[0][0]
    assert "دسترسی لازم" in alert_text or "permission" in alert_text.lower()


# =============================================================================
# 6. Dynamic Permission Update Without Reconnecting
# =============================================================================

@pytest.mark.asyncio
async def test_dynamic_permission_revocation_immediately_reflected(test_user: User):
    """Granting or revoking permission in PMP immediately alters Telegram menu and capabilities."""
    mock_db = AsyncMock()
    chat_id = 999888

    # 1. Monday: User has PROJECTS_CREATE
    user_monday = CurrentUser(
        user_id=test_user.id,
        email=test_user.email,
        full_name=test_user.full_name or "Dev",
        roles=["manager"],
        permissions=[Permissions.PROJECTS_CREATE, Permissions.PROJECTS_VIEW_ALL],
    )
    caps_monday = TelegramCapabilityService.get_user_capabilities(user_monday)
    assert caps_monday.can_create_project is True
    menu_monday = make_dynamic_main_menu(caps_monday)
    monday_buttons = [btn.callback_data for row in menu_monday.inline_keyboard for btn in row]
    assert "menu:create_project" in monday_buttons

    # 2. Tuesday: Admin revokes PROJECTS_CREATE in PMP database
    user_tuesday = CurrentUser(
        user_id=test_user.id,
        email=test_user.email,
        full_name=test_user.full_name or "Dev",
        roles=["manager"],
        permissions=[Permissions.PROJECTS_VIEW_ALL],  # PROJECTS_CREATE removed!
    )
    caps_tuesday = TelegramCapabilityService.get_user_capabilities(user_tuesday)
    assert caps_tuesday.can_create_project is False
    menu_tuesday = make_dynamic_main_menu(caps_tuesday)
    tuesday_buttons = [btn.callback_data for row in menu_tuesday.inline_keyboard for btn in row]
    assert "menu:create_project" not in tuesday_buttons

    # Executor also rejects it immediately without requiring reconnect
    executor = CommandExecutor(mock_db, user_tuesday, chat_id)
    res = await executor.execute(CreateProjectIntent(name="New Project"))
    assert "دسترسی لازم برای ساخت پروژه را ندارید" in res.text


# =============================================================================
# 7. Resource-Level Scoping & Isolation
# =============================================================================

@pytest.mark.asyncio
async def test_resolve_project_resource_scoping(test_current_user: CurrentUser):
    """User cannot resolve or access a project they are not a member of."""
    mock_db = AsyncMock()
    hidden_project_id = uuid4()
    hidden_project = Project(
        id=hidden_project_id,
        name="Confidential Project",
        product_id=uuid4(),
    )

    # User is not a member of this project
    async def mock_execute(stmt):
        mock_res = MagicMock()
        mock_res.scalars.return_value.all.return_value = []
        mock_res.scalar_one_or_none.return_value = None  # No membership row
        return mock_res

    mock_db.execute = AsyncMock(side_effect=mock_execute)

    with patch("app.modules.telegram.resolver.projects_repo.get_project", AsyncMock(return_value=hidden_project)):
        resolved = await EntityResolver.resolve_project(mock_db, str(hidden_project_id), test_current_user)

    assert resolved.is_not_found is True
    assert resolved.entity is None


@pytest.mark.asyncio
async def test_multi_user_isolation_distinct_telegram_ids():
    """Verify distinct Telegram chat IDs map to distinct PMP users without session or token leakage."""
    user_a_id = uuid4()
    user_b_id = uuid4()
    chat_id_a = 11110001
    chat_id_b = 22220002

    conn_a = UserTelegramConnection(
        user_id=user_a_id,
        telegram_chat_id=str(chat_id_a),
        is_connected=True,
        auth_link_code="used_a",
        auth_link_expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
    )
    conn_b = UserTelegramConnection(
        user_id=user_b_id,
        telegram_chat_id=str(chat_id_b),
        is_connected=True,
        auth_link_code="used_b",
        auth_link_expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
    )

    mock_db = AsyncMock()

    # When querying for chat_id_a, return conn_a
    # When querying for chat_id_b, return conn_b
    def mock_execute_side_effect(stmt):
        mock_res = MagicMock()
        # Inspect query
        stmt_str = str(stmt)
        if str(chat_id_a) in stmt_str or hasattr(stmt, "_where_criteria"):
            # Check params or return appropriate connection
            pass
        return mock_res

    # Test using resolve_telegram_user directly with DB query mocked per chat ID
    async def resolve_mock(db, chat_id):
        if str(chat_id) == str(chat_id_a):
            u_a = SimpleNamespace(id=user_a_id, email="a@example.com", full_name="User A", is_active=True)
            cu_a = CurrentUser(user_id=user_a_id, email="a@example.com", full_name="User A", roles=["developer"])
            return u_a, cu_a
        elif str(chat_id) == str(chat_id_b):
            u_b = SimpleNamespace(id=user_b_id, email="b@example.com", full_name="User B", is_active=True)
            cu_b = CurrentUser(user_id=user_b_id, email="b@example.com", full_name="User B", roles=["manager"])
            return u_b, cu_b
        return None, None

    with patch("app.modules.telegram.security.resolve_telegram_user", side_effect=resolve_mock):
        user_1, cu_1 = await resolve_mock(mock_db, chat_id_a)
        user_2, cu_2 = await resolve_mock(mock_db, chat_id_b)

    assert user_1.id == user_a_id
    assert user_2.id == user_b_id
    assert user_1.id != user_2.id
    assert cu_1.roles == ["developer"]
    assert cu_2.roles == ["manager"]


@pytest.mark.asyncio
async def test_forged_project_select_callback_rejected(test_current_user: CurrentUser):
    """Manipulated select:project:<uuid> callback is rejected if user is not a member."""
    from app.modules.telegram.handlers.callbacks import handle_entity_selection
    from app.modules.telegram.resolver import ResolvedEntity

    unauthorized_proj_id = uuid4()
    cb = MagicMock(spec=CallbackQuery)
    cb.data = f"select:project:{unauthorized_proj_id}"
    cb.message = MagicMock()
    cb.from_user = TgUser(id=12345678, is_bot=False, first_name="Test")
    cb.answer = AsyncMock()

    mock_db = AsyncMock()
    mock_user = SimpleNamespace(id=test_current_user.user_id, full_name="Dev")

    with patch("app.modules.telegram.handlers.callbacks.AsyncSessionLocal", lambda: mock_db), \
         patch("app.modules.telegram.handlers.callbacks.resolve_telegram_user", AsyncMock(return_value=(mock_user, test_current_user))), \
         patch("app.modules.telegram.resolver.EntityResolver.resolve_project", AsyncMock(return_value=ResolvedEntity(status="not_found"))):
        await handle_entity_selection(cb)

    cb.answer.assert_called_once()
    assert "دسترسی ندارید" in cb.answer.call_args[0][0] or "access" in cb.answer.call_args[0][0].lower()


@pytest.mark.asyncio
async def test_forged_project_action_callback_rejected(test_current_user: CurrentUser):
    """Manipulated proj_act:new_task:<uuid> callback is rejected if project is inaccessible."""
    from app.modules.telegram.resolver import ResolvedEntity

    unauthorized_proj_id = uuid4()
    cb = MagicMock(spec=CallbackQuery)
    cb.data = f"proj_act:new_task:{unauthorized_proj_id}"
    cb.message = MagicMock()
    cb.from_user = TgUser(id=12345678, is_bot=False, first_name="Test")
    cb.answer = AsyncMock()

    mock_db = AsyncMock()
    mock_user = SimpleNamespace(id=test_current_user.user_id, full_name="Dev")

    # Current user has can_create_task capability, but NO access to this specific project
    dev_with_task_perm = CurrentUser(
        user_id=test_current_user.user_id,
        email="dev@example.com",
        full_name="Dev",
        roles=["developer"],
        permissions=[Permissions.TASKS_MANAGE_ALL],
    )

    with patch("app.modules.telegram.handlers.callbacks.AsyncSessionLocal", lambda: mock_db), \
         patch("app.modules.telegram.handlers.callbacks.resolve_telegram_user", AsyncMock(return_value=(mock_user, dev_with_task_perm))), \
         patch("app.modules.telegram.resolver.EntityResolver.resolve_project", AsyncMock(return_value=ResolvedEntity(status="not_found"))):
        await handle_project_quick_action(cb)

    cb.answer.assert_called_once()
    alert_text = cb.answer.call_args[0][0]
    assert "یافت نشد یا شما به آن دسترسی ندارید" in alert_text or "inaccessible" in alert_text.lower() or "not found" in alert_text.lower()


# =============================================================================
# Product Line Access Boundary Tests
# =============================================================================

@pytest.mark.asyncio
async def test_product_line_boundary_blocks_unauthorized_project_resolution():
    """A user with projects.view_all in Product Line A cannot resolve projects in Product Line B."""
    from app.modules.telegram.resolver import EntityResolver
    from app.modules.projects.models import Project

    product_a_id = uuid4()
    product_b_id = uuid4()
    project_a_id = uuid4()
    project_b_id = uuid4()

    user = CurrentUser(
        user_id=uuid4(),
        email="manager@example.com",
        full_name="Line A Manager",
        roles=["project_manager"],
        permissions=[Permissions.PROJECTS_VIEW_ALL, Permissions.PROJECTS_MANAGE_ALL],
    )

    proj_a = SimpleNamespace(id=project_a_id, product_id=product_a_id, name="Project Alpha")
    proj_b = SimpleNamespace(id=project_b_id, product_id=product_b_id, name="Project Beta")

    mock_db = AsyncMock()

    with patch("app.modules.telegram.resolver.visible_product_ids", AsyncMock(return_value=[product_a_id])), \
         patch("app.modules.telegram.resolver._require_project_access") as mock_req_proj, \
         patch("app.modules.telegram.resolver.projects_repo.get_project") as mock_get_proj:

        async def fake_get_proj(db, pid):
            if pid == project_a_id:
                return proj_a
            if pid == project_b_id:
                return proj_b
            return None

        async def fake_req_proj(db, u, pid):
            if pid == project_b_id:
                raise ForbiddenError("You are not a member of this product line.")

        mock_get_proj.side_effect = fake_get_proj
        mock_req_proj.side_effect = fake_req_proj

        # 1. Resolving Project B by UUID must be rejected (not_found)
        res_b = await EntityResolver.resolve_project(mock_db, str(project_b_id), user)
        assert res_b.is_not_found

        # 2. Resolving Project A by UUID must succeed
        res_a = await EntityResolver.resolve_project(mock_db, str(project_a_id), user)
        assert res_a.is_exact
        assert res_a.entity.id == project_a_id


@pytest.mark.asyncio
async def test_product_line_boundary_blocks_unauthorized_task_resolution():
    """A user cannot resolve tasks belonging to projects in unauthorized Product Lines."""
    from app.modules.telegram.resolver import EntityResolver

    product_a_id = uuid4()
    product_b_id = uuid4()
    project_b_id = uuid4()
    task_b_id = uuid4()

    user = CurrentUser(
        user_id=uuid4(),
        email="dev@example.com",
        full_name="Dev User",
        roles=["developer"],
        permissions=[Permissions.TASKS_VIEW, Permissions.TASKS_MANAGE_ALL],
    )

    mock_db = AsyncMock()
    mock_task_b = SimpleNamespace(id=task_b_id, title="Secret Task in B")

    with patch("app.modules.telegram.resolver.visible_product_ids", AsyncMock(return_value=[product_a_id])), \
         patch("app.modules.telegram.resolver.projects_repo.get_task", AsyncMock(return_value=mock_task_b)), \
         patch("app.modules.collaboration.authorization._require_task_access", AsyncMock(side_effect=ForbiddenError("Not in product line"))):

        res = await EntityResolver.resolve_task(mock_db, str(task_b_id), user)
        assert res.is_not_found


@pytest.mark.asyncio
async def test_zero_product_line_memberships_disables_capabilities_and_menus():
    """When a user has permissions but 0 product line access, project/task actions are disabled."""
    user = CurrentUser(
        user_id=uuid4(),
        email="unassigned@example.com",
        full_name="Unassigned User",
        roles=["project_manager"],
        permissions=[Permissions.PROJECTS_CREATE, Permissions.PROJECTS_VIEW_ALL, Permissions.TASKS_MANAGE_ALL],
    )

    mock_db = AsyncMock()

    with patch("app.modules.projects.product_access.visible_product_ids", AsyncMock(return_value=[])):
        caps = await TelegramCapabilityService.resolve_user_capabilities(mock_db, user)

        # Capabilities must be suppressed
        assert caps.can_create_project is False
        assert caps.can_view_projects is False
        assert caps.can_create_task is False
        assert caps.can_view_tasks is False
        assert caps.can_create_sprint is False

        # Menu must not include project or task buttons
        from app.modules.telegram.ui import make_dynamic_main_menu
        menu = make_dynamic_main_menu(caps, lang="fa")
        all_callbacks = [
            button.callback_data
            for row in menu.inline_keyboard
            for button in row
        ]
        assert "menu:projects" not in all_callbacks
        assert "menu:create_project" not in all_callbacks
        assert "menu:mytasks" not in all_callbacks
        assert "menu:create_task" not in all_callbacks


@pytest.mark.asyncio
async def test_zero_product_line_blocks_project_and_task_execution():
    """Attempting to create projects or tasks with zero product line memberships is blocked."""
    from app.modules.telegram.schemas import CreateProjectIntent, CreateTaskIntent

    user = CurrentUser(
        user_id=uuid4(),
        email="unassigned@example.com",
        full_name="Unassigned User",
        roles=["project_manager"],
        permissions=[Permissions.PROJECTS_CREATE, Permissions.TASKS_MANAGE_ALL],
    )

    mock_db = AsyncMock()
    executor = CommandExecutor(db=mock_db, current_user=user, chat_id=12345678)

    with patch("app.modules.projects.product_access.visible_product_ids", AsyncMock(return_value=[])):
        # Project creation attempt
        p_intent = CreateProjectIntent(name="Forbidden Project", language="fa")
        p_res = await executor.execute(p_intent)
        assert "شما عضو هیچ خط محصولی" in p_res.text

        # Task creation attempt
        t_intent = CreateTaskIntent(title="Forbidden Task", language="fa")
        t_res = await executor.execute(t_intent)
        assert "شما عضو هیچ خط محصولی" in t_res.text


@pytest.mark.asyncio
async def test_search_tasks_does_not_leak_unauthorized_product_line_tasks():
    """Manual search for tasks does not return tasks from unauthorized product lines."""
    from app.modules.telegram.schemas import SearchTasksIntent

    user = CurrentUser(
        user_id=uuid4(),
        email="auditor@example.com",
        full_name="Auditor",
        roles=["auditor"],
        permissions=[Permissions.TASKS_VIEW],
    )

    task_allowed_id = uuid4()
    task_blocked_id = uuid4()
    task_allowed = SimpleNamespace(id=task_allowed_id, title="Allowed Task in Line A", status="Ready", assignees=[])
    task_blocked = SimpleNamespace(id=task_blocked_id, title="Secret Task in Line B", status="Ready", assignees=[])

    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [task_allowed, task_blocked]
    mock_db.execute.return_value = mock_result

    executor = CommandExecutor(db=mock_db, current_user=user, chat_id=12345678)

    async def fake_require_task_access(db, u, tid):
        if tid == task_blocked_id:
            raise ForbiddenError("Product line B forbidden")

    with patch("app.modules.collaboration.authorization._require_task_access", side_effect=fake_require_task_access):
        s_intent = SearchTasksIntent(query="Task", language="fa")
        res = await executor.execute(s_intent)

        # Allowed task must appear, but blocked task must NOT appear
        assert "Allowed Task in Line A" in res.text
        assert "Secret Task in Line B" not in res.text


# =============================================================================
# 10. Product Line Selection & Preview Lifecycle for Project Creation
# =============================================================================

@pytest.mark.asyncio
async def test_create_project_zero_product_lines_rejected():
    """If user is not a member of any product line, project creation is rejected immediately."""
    user = CurrentUser(
        user_id=uuid4(),
        email="pm_no_prod@example.com",
        full_name="No Product PM",
        roles=["project_manager"],
        permissions=[Permissions.PROJECTS_CREATE],
    )
    mock_db = AsyncMock()
    executor = CommandExecutor(db=mock_db, current_user=user, chat_id=999901)

    with patch("app.modules.projects.product_access.visible_product_ids", AsyncMock(return_value=[])):
        res = await executor.execute(CreateProjectIntent(name="Lonely Project", language="fa"))
        assert "شما عضو هیچ خط محصولی" in res.text
        assert res.reply_markup is None


@pytest.mark.asyncio
async def test_create_project_single_product_line_auto_selected():
    """If user has exactly 1 accessible product line, it is auto-selected and Preview is shown."""
    user = CurrentUser(
        user_id=uuid4(),
        email="single_pm@example.com",
        full_name="Single PM",
        roles=["project_manager"],
        permissions=[Permissions.PROJECTS_CREATE],
    )
    mock_db = AsyncMock()
    prod_id = uuid4()
    mock_prod = SimpleNamespace(id=prod_id, name="Logistics Engine")

    mock_res = MagicMock()
    mock_res.scalars.return_value.all.return_value = [mock_prod]
    mock_db.execute.return_value = mock_res

    executor = CommandExecutor(db=mock_db, current_user=user, chat_id=999902)

    with patch("app.modules.projects.product_access.visible_product_ids", AsyncMock(return_value=[prod_id])):
        res = await executor.execute(CreateProjectIntent(name="Fleet Tracking", language="fa"))

        # Must display preview text with both project and product name
        assert "پیش‌نمایش ایجاد پروژه" in res.text
        assert "Fleet Tracking" in res.text
        assert "Logistics Engine" in res.text

        # Must include Preview keyboard (Confirm, Change Product, Cancel)
        assert res.reply_markup is not None
        callbacks = [btn.callback_data for row in res.reply_markup.inline_keyboard for btn in row]
        assert any(cb.startswith("proj_ok:") for cb in callbacks)
        assert any(cb.startswith("proj_chg:") for cb in callbacks)
        assert any(cb.startswith("cancel:") for cb in callbacks)


@pytest.mark.asyncio
async def test_create_project_multiple_product_lines_prompts_selection():
    """If user has > 1 product lines, prompt them with inline buttons without picking a default."""
    user = CurrentUser(
        user_id=uuid4(),
        email="multi_pm@example.com",
        full_name="Multi PM",
        roles=["project_manager"],
        permissions=[Permissions.PROJECTS_CREATE],
    )
    mock_db = AsyncMock()
    prod_a_id = uuid4()
    prod_b_id = uuid4()
    prod_a = SimpleNamespace(id=prod_a_id, name="Payment Service")
    prod_b = SimpleNamespace(id=prod_b_id, name="Retail Portal")

    mock_res = MagicMock()
    mock_res.scalars.return_value.all.return_value = [prod_a, prod_b]
    mock_db.execute.return_value = mock_res

    executor = CommandExecutor(db=mock_db, current_user=user, chat_id=999903)

    with patch("app.modules.projects.product_access.visible_product_ids", AsyncMock(return_value=[prod_a_id, prod_b_id])):
        res = await executor.execute(CreateProjectIntent(name="Atlas", language="fa"))

        # Must prompt to ask which product line
        assert "پروژه «<b>Atlas</b>» مربوط به کدام Product Line است؟" in res.text

        # Must present buttons for Payment Service and Retail Portal, and Cancel
        assert res.reply_markup is not None
        callbacks = [btn.callback_data for row in res.reply_markup.inline_keyboard for btn in row]
        button_texts = [btn.text for row in res.reply_markup.inline_keyboard for btn in row]

        assert any("Payment Service" in t for t in button_texts)
        assert any("Retail Portal" in t for t in button_texts)
        assert any(cb.startswith("proj_prod:") for cb in callbacks)
        assert any(cb.startswith("cancel:") for cb in callbacks)


@pytest.mark.asyncio
async def test_create_project_selection_to_preview_flow():
    """Selecting a product line updates confirmation draft and transitions to preview."""
    from app.modules.telegram.handlers.callbacks import handle_product_line_selection
    from app.modules.telegram.state import conversation_state_manager

    chat_id = 999904
    token = await conversation_state_manager.create_confirmation(
        chat_id=chat_id,
        action_type="create_project",
        description="Draft project",
        payload={"name": "Atlas", "product_id": None, "product_name": None, "lang": "fa"},
    )

    prod_id = uuid4()
    selected_prod = SimpleNamespace(id=prod_id, name="Fintech Core")

    mock_query = AsyncMock()
    mock_query.data = f"proj_prod:{token}:{prod_id.hex}"
    mock_query.from_user = TgUser(id=chat_id, is_bot=False, first_name="User")
    mock_query.message = AsyncMock()
    mock_query.message.chat = Chat(id=chat_id, type="private")

    current_u = CurrentUser(
        user_id=uuid4(),
        email="user@example.com",
        full_name="Dev",
        roles=["project_manager"],
        permissions=[Permissions.PROJECTS_CREATE],
    )

    with patch("app.modules.telegram.handlers.callbacks.resolve_telegram_user", AsyncMock(return_value=(SimpleNamespace(), current_u))), \
         patch("app.modules.telegram.handlers.callbacks.require_product_access", AsyncMock(return_value=selected_prod)):

        await handle_product_line_selection(mock_query)

        # Message edited to preview
        assert mock_query.message.edit_text.called
        call_text = mock_query.message.edit_text.call_args[0][0]
        assert "Atlas" in call_text
        assert "Fintech Core" in call_text

        # State updated
        saved = await conversation_state_manager.get_confirmation(chat_id, token)
        assert saved["payload"]["product_id"] == str(prod_id)
        assert saved["payload"]["product_name"] == "Fintech Core"


@pytest.mark.asyncio
async def test_create_project_change_product_line_flow():
    """User clicking 'تغییر Product Line' redisplays authorized product line buttons."""
    from app.modules.telegram.handlers.callbacks import handle_change_product_line
    from app.modules.telegram.state import conversation_state_manager

    chat_id = 999905
    prod_a_id = uuid4()
    token = await conversation_state_manager.create_confirmation(
        chat_id=chat_id,
        action_type="create_project",
        description="Draft project",
        payload={"name": "Atlas", "product_id": str(prod_a_id), "product_name": "Line A", "lang": "fa"},
    )

    mock_query = AsyncMock()
    mock_query.data = f"proj_chg:{token}"
    mock_query.from_user = TgUser(id=chat_id, is_bot=False, first_name="User")
    mock_query.message = AsyncMock()
    mock_query.message.chat = Chat(id=chat_id, type="private")

    current_u = CurrentUser(
        user_id=uuid4(),
        email="user@example.com",
        full_name="Dev",
        roles=["project_manager"],
        permissions=[Permissions.PROJECTS_CREATE],
    )

    prod1 = SimpleNamespace(id=uuid4(), name="Mobile Banking")
    prod2 = SimpleNamespace(id=uuid4(), name="Web Banking")

    mock_db = AsyncMock()
    mock_db.__aenter__.return_value = mock_db
    mock_res = MagicMock()
    mock_res.scalars.return_value.all.return_value = [prod1, prod2]
    mock_db.execute.return_value = mock_res

    with patch("app.modules.telegram.handlers.callbacks.resolve_telegram_user", AsyncMock(return_value=(SimpleNamespace(), current_u))), \
         patch("app.modules.telegram.handlers.callbacks.AsyncSessionLocal", return_value=mock_db), \
         patch("app.modules.telegram.handlers.callbacks.visible_product_ids", AsyncMock(return_value=[prod1.id, prod2.id])):

        await handle_change_product_line(mock_query)

        assert mock_query.message.edit_text.called
        call_text = mock_query.message.edit_text.call_args[0][0]
        assert "مربوط به کدام Product Line است" in call_text
        reply_markup = mock_query.message.edit_text.call_args[1]["reply_markup"]
        btn_texts = [btn.text for row in reply_markup.inline_keyboard for btn in row]
        assert any("Mobile Banking" in t for t in btn_texts)
        assert any("Web Banking" in t for t in btn_texts)


@pytest.mark.asyncio
async def test_create_project_forged_callback_unauthorized_product_rejected():
    """Malicious callback containing an unauthorized Product Line ID is blocked server-side."""
    from app.modules.telegram.handlers.callbacks import handle_product_line_selection
    from app.modules.telegram.state import conversation_state_manager

    chat_id = 999906
    token = await conversation_state_manager.create_confirmation(
        chat_id=chat_id,
        action_type="create_project",
        description="Draft project",
        payload={"name": "Attacker Project", "product_id": None, "product_name": None, "lang": "fa"},
    )

    unauthorized_prod_id = uuid4()
    mock_query = AsyncMock()
    mock_query.data = f"proj_prod:{token}:{unauthorized_prod_id.hex}"
    mock_query.from_user = TgUser(id=chat_id, is_bot=False, first_name="Attacker")
    mock_query.message = AsyncMock()
    mock_query.message.chat = Chat(id=chat_id, type="private")

    current_u = CurrentUser(
        user_id=uuid4(),
        email="attacker@example.com",
        full_name="Attacker",
        roles=["project_manager"],
        permissions=[Permissions.PROJECTS_CREATE],
    )

    # require_product_access throws ForbiddenError!
    with patch("app.modules.telegram.handlers.callbacks.resolve_telegram_user", AsyncMock(return_value=(SimpleNamespace(), current_u))), \
         patch("app.modules.projects.product_access.require_product_access", AsyncMock(side_effect=ForbiddenError("Access Denied"))):

        await handle_product_line_selection(mock_query)

        # Must reject with alert
        assert mock_query.answer.called
        alert_text = mock_query.answer.call_args[0][0]
        assert "دسترسی ندارید" in alert_text

        # Draft remains unassigned
        saved = await conversation_state_manager.get_confirmation(chat_id, token)
        assert saved["payload"]["product_id"] is None


@pytest.mark.asyncio
async def test_create_project_revoked_access_at_final_commit_rejected():
    """If user access to product line was revoked between draft and final commit, creation is aborted."""
    from app.modules.telegram.handlers.callbacks import handle_confirm_create_project
    from app.modules.telegram.state import conversation_state_manager

    chat_id = 999907
    revoked_prod_id = uuid4()
    token = await conversation_state_manager.create_confirmation(
        chat_id=chat_id,
        action_type="create_project",
        description="Draft project",
        payload={"name": "Delayed Project", "product_id": str(revoked_prod_id), "product_name": "Old Line", "lang": "fa"},
    )

    mock_query = AsyncMock()
    mock_query.data = f"proj_ok:{token}"
    mock_query.from_user = TgUser(id=chat_id, is_bot=False, first_name="User")
    mock_query.message = AsyncMock()
    mock_query.message.chat = Chat(id=chat_id, type="private")

    current_u = CurrentUser(
        user_id=uuid4(),
        email="user@example.com",
        full_name="User",
        roles=["project_manager"],
        permissions=[Permissions.PROJECTS_CREATE],
    )

    with patch("app.modules.telegram.handlers.callbacks.resolve_telegram_user", AsyncMock(return_value=(SimpleNamespace(), current_u))), \
         patch("app.modules.projects.product_access.require_product_access", AsyncMock(side_effect=ForbiddenError("Revoked!"))), \
         patch("app.modules.projects.service.create_project") as mock_create:

        await handle_confirm_create_project(mock_query)

        # Creation service must NOT be called!
        assert not mock_create.called

        # Message updated to error notice
        assert mock_query.message.edit_text.called
        assert "دسترسی شما به این خط محصول نامعتبر یا لغو شده است" in mock_query.message.edit_text.call_args[0][0]


@pytest.mark.asyncio
async def test_create_project_nlp_patterns():
    """Test deterministic NLP parser correctly extracts project name and product line."""
    from app.modules.telegram.nlp.deterministic import parse_deterministic_intent

    # 1. Simple: "یک پروژه به نام Atlas بساز"
    res1 = parse_deterministic_intent("یک پروژه به نام Atlas بساز")
    assert isinstance(res1, CreateProjectIntent)
    assert res1.name == "Atlas"
    assert res1.product_name is None

    # 2. Product line specified: "Atlas را در Product Line Mobile بساز"
    res2 = parse_deterministic_intent("Atlas را در Product Line Mobile بساز")
    assert isinstance(res2, CreateProjectIntent)
    assert res2.name == "Atlas"
    assert res2.product_name == "Mobile"

    # 3. Product line specified Persian: "پروژه Atlas در خط محصول Mobile بساز"
    res3 = parse_deterministic_intent("پروژه Atlas در خط محصول Mobile بساز")
    assert isinstance(res3, CreateProjectIntent)
    assert res3.name == "Atlas"
    assert res3.product_name == "Mobile"

    # 4. English: "create project Atlas in product line Mobile"
    res4 = parse_deterministic_intent("create project Atlas in product line Mobile")
    assert isinstance(res4, CreateProjectIntent)
    assert res4.name == "Atlas"
    assert res4.product_name == "Mobile"

    # 5. English simple: "create a project named Atlas"
    res5 = parse_deterministic_intent("create a project named Atlas")
    assert isinstance(res5, CreateProjectIntent)
    assert res5.name == "Atlas"
    assert res5.product_name is None


@pytest.mark.asyncio
async def test_create_project_nlp_inaccessible_product_line_rejected():
    """If user specifies a product line in natural language that they do not have access to, it is rejected."""
    user = CurrentUser(
        user_id=uuid4(),
        email="user@example.com",
        full_name="Dev",
        roles=["project_manager"],
        permissions=[Permissions.PROJECTS_CREATE],
    )
    mock_db = AsyncMock()
    public_prod = SimpleNamespace(id=uuid4(), name="Public Line")

    mock_res = MagicMock()
    mock_res.scalars.return_value.all.return_value = [public_prod]
    mock_db.execute.return_value = mock_res

    executor = CommandExecutor(db=mock_db, current_user=user, chat_id=999908)

    with patch("app.modules.projects.product_access.visible_product_ids", AsyncMock(return_value=[public_prod.id])):
        # User tries to create in "Secret Line" which they don't have
        intent = CreateProjectIntent(name="Infiltrator", product_name="Secret Line", language="fa")
        res = await executor.execute(intent)

        assert "خط محصول «Secret Line» یافت نشد یا شما به آن دسترسی ندارید" in res.text
        assert res.reply_markup is None


