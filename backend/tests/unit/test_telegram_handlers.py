"""Unit tests for Telegram Bot command, message, and callback handlers."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch, MagicMock
from uuid import uuid4
import pytest
from aiogram.types import Chat, Message, User, CallbackQuery

from app.core.current_user import CurrentUser
from app.core.permissions import Permissions
from app.modules.projects.enums import TaskStatus
from app.modules.telegram.handlers.commands import handle_start, handle_help, handle_cancel, handle_mywork
from app.modules.telegram.handlers.messages import handle_text_message
from app.modules.telegram.handlers.callbacks import handle_entity_selection, handle_quick_status_change
from app.modules.telegram.resolver import ResolvedEntity
from app.modules.telegram.schemas import CreateTaskIntent


@pytest.fixture(autouse=True)
def mock_async_session_local(monkeypatch):
    mock_session = AsyncMock()
    mock_session.__aenter__.return_value = mock_session
    mock_session.__aexit__.return_value = None

    monkeypatch.setattr("app.modules.telegram.handlers.commands.AsyncSessionLocal", lambda: mock_session)
    monkeypatch.setattr("app.modules.telegram.handlers.messages.AsyncSessionLocal", lambda: mock_session)
    monkeypatch.setattr("app.modules.telegram.handlers.callbacks.AsyncSessionLocal", lambda: mock_session)
    return mock_session


@pytest.fixture
def mock_message():
    chat = Chat(id=12345678, type="private")
    from_user = User(id=12345678, is_bot=False, first_name="Test", username="testuser")
    msg = MagicMock(spec=Message)
    msg.chat = chat
    msg.from_user = from_user
    msg.text = "/start"
    msg.answer = AsyncMock()
    return msg


@pytest.fixture
def mock_callback():
    chat = Chat(id=12345678, type="private")
    from_user = User(id=12345678, is_bot=False, first_name="Test", username="testuser")
    cb = MagicMock(spec=CallbackQuery)
    cb.from_user = from_user
    cb.data = "select:project:123e4567-e89b-12d3-a456-426614174000"
    cb.answer = AsyncMock()
    cb.message = MagicMock(spec=Message)
    cb.message.chat = chat
    cb.message.answer = AsyncMock()
    cb.message.edit_text = AsyncMock()
    cb.message.edit_reply_markup = AsyncMock()
    return cb


@pytest.mark.asyncio
async def test_handle_start_unauthenticated(mock_message, monkeypatch):
    mock_message.text = "/start"
    monkeypatch.setattr(
        "app.modules.telegram.handlers.commands.resolve_telegram_user",
        AsyncMock(return_value=(None, None)),
    )

    await handle_start(mock_message)
    mock_message.answer.assert_called_once()
    args, kwargs = mock_message.answer.call_args
    assert "خوش آمدید" in args[0]
    assert "تنظیمات" in args[0]


@pytest.mark.asyncio
async def test_handle_start_with_link_code(mock_message, monkeypatch):
    mock_message.text = "/start ABC12345"
    mock_user = SimpleNamespace(id=uuid4(), full_name="Ali Rezaei")
    mock_current_user = CurrentUser(
        user_id=mock_user.id,
        email="ali@example.com",
        full_name="Ali Rezaei",
        roles=["developer"],
        permissions=[Permissions.TASKS_VIEW, Permissions.TASKS_EDIT_ASSIGNED],
    )

    monkeypatch.setattr(
        "app.modules.telegram.handlers.commands.link_telegram_account",
        AsyncMock(return_value=(True, "✅ حساب کاربری با موفقیت متصل شد!", mock_user)),
    )
    monkeypatch.setattr(
        "app.modules.telegram.handlers.commands.resolve_telegram_user",
        AsyncMock(return_value=(mock_user, mock_current_user)),
    )

    await handle_start(mock_message)
    assert mock_message.answer.call_count == 2
    first_call_args = mock_message.answer.call_args_list[0][0]
    assert "متصل شد" in first_call_args[0]
    second_call_args = mock_message.answer.call_args_list[1][0]
    assert "منوی اصلی" in second_call_args[0]


@pytest.mark.asyncio
async def test_handle_help(mock_message):
    await handle_help(mock_message)
    mock_message.answer.assert_called_once()
    args, kwargs = mock_message.answer.call_args
    assert "راهنما" in args[0]


@pytest.mark.asyncio
async def test_handle_cancel(mock_message, monkeypatch):
    monkeypatch.setattr(
        "app.modules.telegram.handlers.commands.conversation_state_manager.cancel",
        AsyncMock(return_value=True),
    )

    await handle_cancel(mock_message)
    mock_message.answer.assert_called_once()
    args, kwargs = mock_message.answer.call_args
    assert "لغو شد" in args[0]


@pytest.mark.asyncio
async def test_handle_mywork_command(mock_message, monkeypatch):
    mock_user = SimpleNamespace(id=uuid4(), email="user@test.com", full_name="Test User")
    mock_current_user = CurrentUser(
        user_id=mock_user.id,
        email="user@test.com",
        full_name="Test User",
        roles=["Admin"],
        permissions={Permissions.TASKS_VIEW, Permissions.REPORTS_VIEW},
    )
    monkeypatch.setattr(
        "app.modules.telegram.handlers.commands.resolve_telegram_user",
        AsyncMock(return_value=(mock_user, mock_current_user)),
    )
    mock_res = SimpleNamespace(text="📊 داشبورد کارهای من", reply_markup=None)
    monkeypatch.setattr(
        "app.modules.telegram.handlers.commands.CommandExecutor.execute",
        AsyncMock(return_value=mock_res),
    )

    mock_message.text = "/mywork"
    await handle_mywork(mock_message)
    mock_message.answer.assert_called_once()
    args, kwargs = mock_message.answer.call_args
    assert "داشبورد" in args[0]


@pytest.mark.asyncio
async def test_handle_text_message_unlinked(mock_message, monkeypatch):
    mock_message.text = "یک تسک بساز"
    monkeypatch.setattr(
        "app.modules.telegram.handlers.messages.resolve_telegram_user",
        AsyncMock(return_value=(None, None)),
    )

    await handle_text_message(mock_message)
    mock_message.answer.assert_called_once()
    args, kwargs = mock_message.answer.call_args
    assert "متصل نشده است" in args[0]


@pytest.mark.asyncio
async def test_handle_text_message_with_hex_code(mock_message, monkeypatch):
    mock_message.text = "A1B2C3D4"
    mock_user = SimpleNamespace(id=uuid4(), full_name="Sara")

    monkeypatch.setattr(
        "app.modules.telegram.handlers.messages.link_telegram_account",
        AsyncMock(return_value=(True, "✅ اتصال برقرار شد.", mock_user)),
    )

    await handle_text_message(mock_message)
    mock_message.answer.assert_called_once_with("✅ اتصال برقرار شد.", parse_mode="HTML")


@pytest.mark.asyncio
async def test_handle_callback_entity_selection_project(mock_callback, monkeypatch):
    user_id = uuid4()
    mock_user = SimpleNamespace(id=user_id, full_name="Tester")
    mock_curr = CurrentUser(
        user_id=user_id,
        email="test@example.com",
        full_name="Tester",
        roles=["Developer"],
        permissions=[Permissions.PROJECTS_VIEW_ALL],
    )
    monkeypatch.setattr(
        "app.modules.telegram.handlers.callbacks.resolve_telegram_user",
        AsyncMock(return_value=(mock_user, mock_curr)),
    )
    set_ctx_mock = AsyncMock()
    monkeypatch.setattr(
        "app.modules.telegram.handlers.callbacks.conversation_state_manager.set_context",
        set_ctx_mock,
    )

    await handle_entity_selection(mock_callback)
    mock_callback.answer.assert_called_once_with("پروژه انتخاب شد.")
    set_ctx_mock.assert_called_once()


@pytest.mark.asyncio
async def test_handle_callback_quick_status_change(mock_callback, monkeypatch):
    task_id = uuid4()
    mock_callback.data = f"task_st:{task_id}:InProgress"
    user_id = uuid4()
    mock_user = SimpleNamespace(id=user_id, full_name="Tester")
    mock_curr = CurrentUser(
        user_id=user_id,
        email="test@example.com",
        full_name="Tester",
        roles=["Developer"],
        permissions=[Permissions.TASKS_MANAGE_ALL],
    )
    monkeypatch.setattr(
        "app.modules.telegram.handlers.callbacks.resolve_telegram_user",
        AsyncMock(return_value=(mock_user, mock_curr)),
    )
    mock_task = SimpleNamespace(id=task_id, status=TaskStatus.IN_PROGRESS)
    monkeypatch.setattr(
        "app.modules.telegram.resolver.EntityResolver.resolve_task",
        AsyncMock(return_value=ResolvedEntity(status="exact", entity=mock_task, candidates=[mock_task])),
    )
    monkeypatch.setattr(
        "app.modules.telegram.handlers.callbacks.update_task_status",
        AsyncMock(return_value=mock_task),
    )

    await handle_quick_status_change(mock_callback)
    mock_callback.answer.assert_called_once_with("وضعیت به InProgress تغییر کرد.")
    mock_callback.message.edit_text.assert_called_once()


@pytest.mark.asyncio
async def test_handle_menu_callback_help_no_unbound_error(mock_callback, monkeypatch):
    """Verify that clicking help menu callback does not raise UnboundLocalError."""
    from app.modules.telegram.handlers.callbacks import handle_menu_callbacks
    from app.modules.telegram.capabilities import UserCapabilities

    mock_callback.data = "menu:help"
    user_id = uuid4()
    mock_user = SimpleNamespace(id=user_id, full_name="Tester")
    mock_curr = CurrentUser(
        user_id=user_id,
        email="test@example.com",
        full_name="Tester",
        roles=["Developer"],
        permissions=[Permissions.TASKS_MANAGE_ALL],
    )
    monkeypatch.setattr(
        "app.modules.telegram.handlers.callbacks.resolve_telegram_user",
        AsyncMock(return_value=(mock_user, mock_curr)),
    )
    monkeypatch.setattr(
        "app.modules.telegram.capabilities.TelegramCapabilityService.resolve_user_capabilities",
        AsyncMock(return_value=UserCapabilities(can_view_tasks=True)),
    )

    await handle_menu_callbacks(mock_callback)
    mock_callback.answer.assert_called_once()
    mock_callback.message.answer.assert_called_once()


def test_main_menu_and_reply_keyboard_exclude_ticket():
    """Verify that ticket creation icon/button is excluded from both initial menus."""
    from app.modules.telegram.capabilities import UserCapabilities
    from app.modules.telegram.ui import make_dynamic_main_menu, make_persistent_reply_keyboard

    caps = UserCapabilities(
        can_create_project=True,
        can_view_projects=True,
        can_create_task=True,
        can_view_tasks=True,
        can_create_ticket=True,  # Even if user has can_create_ticket capability!
        can_view_analytics=True,
        can_search_docs=True,
    )

    # Inline main menu
    menu_fa = make_dynamic_main_menu(caps, lang="fa")
    callbacks_fa = [btn.callback_data for row in menu_fa.inline_keyboard for btn in row]
    assert "menu:create_ticket" not in callbacks_fa

    menu_en = make_dynamic_main_menu(caps, lang="en")
    callbacks_en = [btn.callback_data for row in menu_en.inline_keyboard for btn in row]
    assert "menu:create_ticket" not in callbacks_en

    # Persistent reply keyboard
    reply_fa = make_persistent_reply_keyboard(caps, lang="fa")
    texts_fa = [btn.text for row in reply_fa.keyboard for btn in row]
    assert not any("تیکت" in t for t in texts_fa)

    reply_en = make_persistent_reply_keyboard(caps, lang="en")
    texts_en = [btn.text for row in reply_en.keyboard for btn in row]
    assert not any("Ticket" in t or "ticket" in t for t in texts_en)


@pytest.mark.asyncio
async def test_handle_set_language_callback(mock_callback, monkeypatch):
    """Verify handle_set_language executes without NameError on make_persistent_reply_keyboard."""
    from app.modules.telegram.handlers.callbacks import handle_set_language
    from app.modules.telegram.capabilities import UserCapabilities

    mock_callback.data = "set_lang:en"
    user_id = uuid4()
    mock_user = SimpleNamespace(id=user_id, full_name="Tester")
    mock_curr = CurrentUser(
        user_id=user_id,
        email="test@example.com",
        full_name="Tester",
        roles=["Developer"],
        permissions=[Permissions.TASKS_MANAGE_ALL],
    )
    monkeypatch.setattr(
        "app.modules.telegram.handlers.callbacks.resolve_telegram_user",
        AsyncMock(return_value=(mock_user, mock_curr)),
    )
    monkeypatch.setattr(
        "app.modules.telegram.capabilities.TelegramCapabilityService.resolve_user_capabilities",
        AsyncMock(return_value=UserCapabilities(can_view_tasks=True)),
    )

    await handle_set_language(mock_callback)
    mock_callback.answer.assert_called_once()
    mock_callback.message.edit_text.assert_called_once()


@pytest.mark.asyncio
async def test_handle_pending_multi_turn_task_edit_desc(mock_message, monkeypatch):
    """Verify _handle_pending_multi_turn executes for task_ed_desc without UnboundLocalError for UUID."""
    from app.modules.telegram.handlers.messages import _handle_pending_multi_turn
    from app.modules.telegram.resolver import ResolvedEntity

    mock_db = AsyncMock()
    user_id = uuid4()
    task_id = uuid4()
    mock_curr = CurrentUser(
        user_id=user_id,
        email="test@example.com",
        full_name="Tester",
        roles=["Developer"],
        permissions=[Permissions.TASKS_MANAGE_ALL],
    )
    mock_task = SimpleNamespace(
        id=task_id,
        title="Sample Task",
        description="Old description",
        status="InProgress",
        priority="P1",
        project_id=uuid4(),
        created_by_id=user_id,
        assignee_id=user_id,
        due_date=None,
        labels=[],
    )
    monkeypatch.setattr(
        "app.modules.telegram.resolver.EntityResolver.resolve_task",
        AsyncMock(return_value=ResolvedEntity(status="exact", entity=mock_task)),
    )
    monkeypatch.setattr(
        "app.modules.telegram.capabilities.TelegramCapabilityService.can_edit_task",
        lambda user, task: True,
    )
    monkeypatch.setattr(
        "app.modules.projects.service.update_task",
        AsyncMock(return_value=mock_task),
    )

    mock_message.text = "New updated description"
    pending = {
        "missing_field": "task_ed_desc",
        "intent": {"task_id": str(task_id)},
    }
    handled = await _handle_pending_multi_turn(mock_db, mock_message, mock_curr, pending)
    assert handled is True
    mock_message.answer.assert_called_once()
    assert "توضیحات تسک" in mock_message.answer.call_args[0][0] or "description" in mock_message.answer.call_args[0][0]
