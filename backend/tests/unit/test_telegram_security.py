"""Unit tests for Telegram security, account linking, and RBAC CurrentUser mapping."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch
from uuid import uuid4
import pytest

from app.modules.identity.models import Permission, Role, RolePermission, User, UserRole
from app.modules.integrations.models import UserTelegramConnection
from app.modules.telegram.security import (
    disconnect_telegram_account,
    link_telegram_account,
    resolve_telegram_user,
)
from app.shared.base_model import utcnow


class MockAsyncSession:
    def __init__(self, data=None):
        self.data = data
        self.added = []

    def add(self, obj):
        self.added.append(obj)

    async def commit(self):
        pass

    async def flush(self):
        pass

    async def refresh(self, obj):
        pass

    async def execute(self, stmt):
        params = getattr(stmt.compile(), "params", {})
        # If querying for existing active connection by telegram_chat_id:
        if any("telegram_chat_id" in k for k in params.keys()):
            matched = self.data if (self.data and getattr(self.data, "is_connected", False)) else None
        else:
            matched = self.data

        class MockResult:
            def __init__(self, d):
                self.d = d
                self.rowcount = 1

            def scalar_one_or_none(self):
                return self.d

            def scalars(self):
                class MockScalars:
                    def __init__(self, d):
                        self.d = d or []
                    def all(self):
                        return self.d if isinstance(self.d, list) else ([self.d] if self.d else [])
                return MockScalars(self.d)

        return MockResult(matched)


@pytest.mark.asyncio
async def test_link_telegram_account_success(monkeypatch):
    uid = uuid4()
    code = "A1B2C3D4"
    conn = UserTelegramConnection(
        user_id=uid,
        auth_link_code=code,
        auth_link_expires_at=utcnow() + timedelta(minutes=15),
        is_connected=False,
    )
    mock_db = MockAsyncSession(data=conn)

    mock_user = User(
        id=uid,
        email="dev@example.com",
        first_name="Hassan",
        last_name="Dev",
        is_active=True,
    )

    async def mock_get_user(db, user_id):
        return mock_user

    monkeypatch.setattr("app.modules.identity.repository.get_user_by_id", mock_get_user)

    success, msg, user = await link_telegram_account(mock_db, 123456789, "dev_user", code)  # type: ignore[arg-type]
    assert success is True
    assert conn.is_connected is True
    assert conn.telegram_chat_id == "123456789"
    assert conn.telegram_username == "dev_user"
    assert "با موفقیت" in msg
    assert user is not None


@pytest.mark.asyncio
async def test_link_telegram_account_invalid_code():
    mock_db = MockAsyncSession(data=None)
    success, msg, user = await link_telegram_account(mock_db, 123456789, "dev_user", "INVALID99")  # type: ignore[arg-type]
    assert success is False
    assert "نامعتبر" in msg
    assert user is None


@pytest.mark.asyncio
async def test_resolve_telegram_user_builds_current_user(monkeypatch):
    uid = uuid4()
    chat_id = "987654321"

    conn = UserTelegramConnection(
        user_id=uid,
        telegram_chat_id=chat_id,
        auth_link_code="OLDCODE1",
        auth_link_expires_at=utcnow(),
        is_connected=True,
    )

    role = Role(name="Developer")
    perm = Permission(code="tasks:read")
    rp = RolePermission(role=role, permission=perm)
    role.permissions = [rp]
    ur = UserRole(role=role)

    mock_user = User(
        id=uid,
        email="dev@example.com",
        first_name="Sara",
        last_name="Tech",
        is_active=True,
    )
    mock_user.roles = [ur]

    mock_db = MockAsyncSession(data=conn)

    async def mock_get_user(db, user_id):
        return mock_user

    monkeypatch.setattr("app.modules.identity.repository.get_user_by_id", mock_get_user)

    user, current_user = await resolve_telegram_user(mock_db, chat_id)  # type: ignore[arg-type]
    assert user is not None
    assert current_user is not None
    assert current_user.user_id == uid
    assert current_user.email == "dev@example.com"
    assert "Developer" in current_user.roles
    assert "tasks:read" in current_user.permissions
    assert current_user.has_permission("tasks:read") is True
    assert current_user.has_permission("admin:all") is False


@pytest.mark.asyncio
async def test_two_different_telegram_users_isolated(monkeypatch):
    """Verify that two distinct Telegram users map strictly to their respective PMP users."""
    uid_a = uuid4()
    uid_b = uuid4()
    chat_id_a = "111111111"
    chat_id_b = "222222222"

    conn_a = UserTelegramConnection(
        user_id=uid_a,
        telegram_chat_id=chat_id_a,
        auth_link_code="used_code_a",
        auth_link_expires_at=utcnow(),
        is_connected=True,
    )
    conn_b = UserTelegramConnection(
        user_id=uid_b,
        telegram_chat_id=chat_id_b,
        auth_link_code="used_code_b",
        auth_link_expires_at=utcnow(),
        is_connected=True,
    )

    user_a = User(
        id=uid_a,
        email="alice@example.com",
        first_name="Alice",
        is_active=True,
    )
    role_admin = Role(name="Admin")
    role_admin.permissions = [RolePermission(role=role_admin, permission=Permission(code="projects:manage"))]
    user_a.roles = [UserRole(role=role_admin)]

    user_b = User(
        id=uid_b,
        email="bob@example.com",
        first_name="Bob",
        is_active=True,
    )
    role_dev = Role(name="Developer")
    role_dev.permissions = [RolePermission(role=role_dev, permission=Permission(code="tasks:read"))]
    user_b.roles = [UserRole(role=role_dev)]

    connections_by_chat = {
        chat_id_a: conn_a,
        chat_id_b: conn_b,
    }
    users_by_id = {
        uid_a: user_a,
        uid_b: user_b,
    }

    class MultiUserMockSession:
        async def execute(self, stmt):
            params = stmt.compile().params
            matched_conn = None
            for val in params.values():
                if str(val) in connections_by_chat:
                    matched_conn = connections_by_chat[str(val)]
                    break

            class MockResult:
                def scalar_one_or_none(self):
                    return matched_conn
            return MockResult()

    async def mock_get_user(db, user_id):
        return users_by_id.get(user_id)

    monkeypatch.setattr("app.modules.identity.repository.get_user_by_id", mock_get_user)
    mock_db = MultiUserMockSession()

    # User A query
    u_a, cur_a = await resolve_telegram_user(mock_db, chat_id_a)
    assert u_a is not None and cur_a is not None
    assert cur_a.user_id == uid_a
    assert cur_a.email == "alice@example.com"
    assert cur_a.has_permission("projects:manage") is True
    assert cur_a.has_permission("tasks:read") is False

    # User B query
    u_b, cur_b = await resolve_telegram_user(mock_db, chat_id_b)
    assert u_b is not None and cur_b is not None
    assert cur_b.user_id == uid_b
    assert cur_b.email == "bob@example.com"
    assert cur_b.has_permission("tasks:read") is True
    assert cur_b.has_permission("projects:manage") is False

    # Strict isolation: A never gets B, B never gets A
    assert cur_a.user_id != cur_b.user_id
    assert cur_a.email != cur_b.email

    # Unknown telegram user
    u_unknown, cur_unknown = await resolve_telegram_user(mock_db, "999999999")
    assert u_unknown is None
    assert cur_unknown is None


@pytest.mark.asyncio
async def test_link_code_cannot_be_reused_anti_replay(monkeypatch):
    """A link code marked as used cannot be used again by a different Telegram user."""
    uid = uuid4()
    code = "A1B2C3D4"
    conn = UserTelegramConnection(
        user_id=uid,
        auth_link_code=f"used_already",
        auth_link_expires_at=utcnow() - timedelta(seconds=1),
        is_connected=True,
    )
    mock_db = MockAsyncSession(data=conn)

    # Attacker tries to use the same link code
    success, msg, user = await link_telegram_account(mock_db, 999999999, "attacker", code)
    assert success is False
    assert "نامعتبر است یا منقضی شده است" in msg
    assert user is None


@pytest.mark.asyncio
async def test_disconnect_telegram_clears_mapping():
    """Disconnecting clears telegram_chat_id and sets is_connected to False."""
    chat_id = "123456789"
    class DisconnectMockSession:
        def __init__(self):
            self.executed_stmts = []
        async def execute(self, stmt):
            self.executed_stmts.append(stmt)
            class MockRes:
                rowcount = 1
            return MockRes()
        async def commit(self):
            pass

    mock_db = DisconnectMockSession()
    success = await disconnect_telegram_account(mock_db, chat_id)
    assert success is True
    assert len(mock_db.executed_stmts) == 1


@pytest.mark.asyncio
async def test_prevent_linking_if_telegram_user_already_connected_to_another_pmp_user():
    """If Telegram user is already connected to PMP User A, linking to PMP User B is rejected without silent detach."""
    uid_a = uuid4()
    uid_b = uuid4()
    tg_user_id = 555556666

    conn_a = UserTelegramConnection(
        user_id=uid_a,
        telegram_chat_id=str(tg_user_id),
        auth_link_code="used_a",
        auth_link_expires_at=utcnow(),
        is_connected=True,
    )

    code_b = "B2C3D4E5"
    conn_b = UserTelegramConnection(
        user_id=uid_b,
        auth_link_code=code_b,
        auth_link_expires_at=utcnow() + timedelta(minutes=15),
        is_connected=False,
    )

    class ConflictMockSession:
        def __init__(self):
            self.connections = [conn_a, conn_b]
            self.committed = False

        async def execute(self, stmt):
            params = getattr(stmt.compile(), "params", {})
            matched = None
            if any("auth_link_code" in k for k in params.keys()):
                matched = conn_b
            elif any("telegram_chat_id" in k for k in params.keys()):
                matched = conn_a

            class MockResult:
                def scalar_one_or_none(self):
                    return matched
            return MockResult()

        async def commit(self):
            self.committed = True

    mock_db = ConflictMockSession()

    # Attempt to link Telegram User (already on PMP User A) to PMP User B
    success, msg, user = await link_telegram_account(mock_db, tg_user_id, "shared_tg", code_b)  # type: ignore[arg-type]

    # Must be rejected!
    assert success is False
    assert "این حساب Telegram قبلاً به یک حساب PMP متصل است" in msg
    assert user is None

    # Crucial: Conn A MUST NOT be silently detached or overwritten!
    assert conn_a.is_connected is True
    assert conn_a.telegram_chat_id == str(tg_user_id)
    assert conn_b.is_connected is False


@pytest.mark.asyncio
async def test_reconnect_allowed_only_after_explicit_disconnect(monkeypatch):
    """A Telegram user can connect to a new PMP user only AFTER explicitly disconnecting from previous."""
    uid_a = uuid4()
    uid_b = uuid4()
    tg_user_id = 777778888

    conn_a = UserTelegramConnection(
        user_id=uid_a,
        telegram_chat_id=str(tg_user_id),
        auth_link_code="used_a",
        auth_link_expires_at=utcnow(),
        is_connected=True,
    )

    code_b = "VALID_CODE_B"
    conn_b = UserTelegramConnection(
        user_id=uid_b,
        auth_link_code=code_b,
        auth_link_expires_at=utcnow() + timedelta(minutes=15),
        is_connected=False,
    )

    # 1. First explicitly disconnect from User A
    conn_a.is_connected = False
    conn_a.telegram_chat_id = None

    class ReconnectMockSession:
        async def execute(self, stmt):
            params = getattr(stmt.compile(), "params", {})
            matched = None
            if any("auth_link_code" in k for k in params.keys()):
                matched = conn_b
            elif any("telegram_chat_id" in k for k in params.keys()):
                matched = None

            class MockResult:
                def scalar_one_or_none(self):
                    return matched
            return MockResult()

        async def commit(self):
            pass

    mock_user_b = User(id=uid_b, email="b@example.com", first_name="Bob", is_active=True)
    monkeypatch.setattr("app.modules.identity.repository.get_user_by_id", AsyncMock(return_value=mock_user_b))

    mock_db = ReconnectMockSession()
    success, msg, user = await link_telegram_account(mock_db, tg_user_id, "reconnected_user", code_b)  # type: ignore[arg-type]

    # Must succeed now!
    assert success is True
    assert conn_b.is_connected is True
    assert conn_b.telegram_chat_id == str(tg_user_id)
    assert conn_b.telegram_user_id == str(tg_user_id)
    assert user is not None
    assert user.id == uid_b


@pytest.mark.asyncio
async def test_user_identity_from_user_id_in_group_chat():
    """Verify that in group chats, identity resolution uses from_user.id, not group chat.id."""
    uid = uuid4()
    tg_user_id = 123456789
    group_chat_id = -100987654321

    conn = UserTelegramConnection(
        user_id=uid,
        telegram_chat_id=str(tg_user_id),
        auth_link_code="used_code",
        auth_link_expires_at=utcnow(),
        is_connected=True,
    )

    class GroupMockSession:
        async def execute(self, stmt):
            params = stmt.compile().params
            matched = None
            # If queried with tg_user_id, it succeeds; if queried with group_chat_id, it fails
            if str(tg_user_id) in [str(v) for v in params.values()]:
                matched = conn

            class MockResult:
                def scalar_one_or_none(self):
                    return matched
            return MockResult()

    mock_db = GroupMockSession()

    # Query with actual user ID (from_user.id) -> Found!
    with patch("app.modules.identity.repository.get_user_by_id", AsyncMock(return_value=User(id=uid, is_active=True, email="g@ex.com", roles=[]))):
        u1, cur1 = await resolve_telegram_user(mock_db, tg_user_id)
        assert u1 is not None and cur1 is not None
        assert cur1.user_id == uid

        # Query with group chat ID -> Never found!
        u2, cur2 = await resolve_telegram_user(mock_db, group_chat_id)
        assert u2 is None and cur2 is None

