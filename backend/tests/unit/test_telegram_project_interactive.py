"""Unit tests for Telegram interactive project navigation, sprints view, tasks view, and editing."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4
import pytest

from app.core.current_user import CurrentUser
from app.core.permissions import Permissions
from app.modules.projects.enums import Priority, ProjectStatus, TaskStatus
from app.modules.telegram.executor import CommandExecutor
from app.modules.telegram.schemas import ListProjectsIntent, ViewProjectStatusIntent, UpdateProjectIntent


@pytest.fixture
def current_user():
    return CurrentUser(
        user_id=uuid4(),
        email="lead@example.test",
        full_name="Reza Tehrani",
        roles=["ProjectManager"],
        permissions=[
            Permissions.PROJECTS_VIEW_ALL,
            Permissions.PROJECTS_MANAGE_ALL,
            Permissions.TASKS_VIEW,
            Permissions.PHASES_VIEW,
        ],
    )


@pytest.mark.asyncio
async def test_list_projects_returns_interactive_buttons(current_user):
    db = AsyncMock()
    executor = CommandExecutor(db, current_user, 123456)

    proj1 = SimpleNamespace(
        id=uuid4(),
        name="پروژه الف",
        progress_percentage=45.0,
        status="Active",
    )
    proj2 = SimpleNamespace(
        id=uuid4(),
        name="پروژه ب",
        progress_percentage=80.0,
        status="Planning",
    )

    with patch("app.modules.projects.service.list_all_projects", new_callable=AsyncMock) as mock_list:
        mock_list.return_value = ([proj1, proj2], 2)
        res = await executor.execute(ListProjectsIntent(language="fa"))

        assert "پروژه الف" in res.text
        assert "پروژه ب" in res.text
        assert res.reply_markup is not None

        # Verify buttons contain proj_act:view:<id>
        callbacks = [
            btn.callback_data
            for row in res.reply_markup.inline_keyboard
            for btn in row
            if btn.callback_data
        ]
        assert f"proj_act:view:{proj1.id}" in callbacks
        assert f"proj_act:view:{proj2.id}" in callbacks


@pytest.mark.asyncio
async def test_view_project_overview_card(current_user):
    db = AsyncMock()
    executor = CommandExecutor(db, current_user, 123456)
    proj_id = uuid4()

    mock_proj = SimpleNamespace(
        id=proj_id,
        name="سیستم مدیریت منابع",
        description="توضیحات سیستم مدیریت",
        status=ProjectStatus.IN_PROGRESS.value,
        priority=Priority.P1.value,
        budget=120000000.0,
        progress_percentage=65.0,
        start_date="2026-10-01",
        end_date="2026-12-30",
        product_id=uuid4(),
    )

    mock_overview = SimpleNamespace(
        project=mock_proj,
        task_stats=SimpleNamespace(total=10, done=6, in_progress=3, blocked=1),
        sprints=[
            SimpleNamespace(id=uuid4(), name="اسپرینت ۱", status="completed", start_date="2026-10-01", end_date="2026-10-14"),
            SimpleNamespace(id=uuid4(), name="اسپرینت ۲", status="active", start_date="2026-10-15", end_date="2026-10-29"),
        ],
        current_sprint=SimpleNamespace(id=uuid4(), name="اسپرینت ۲"),
        members=[],
    )

    with patch.object(executor, "_get_project_card_data", new_callable=AsyncMock) as mock_data, \
         patch("app.modules.telegram.resolver.EntityResolver.resolve_project", new_callable=AsyncMock) as mock_resolve:
        mock_resolve.return_value = SimpleNamespace(is_exact=True, entity=mock_proj)
        mock_data.return_value = (mock_overview, "لاین هوش مصنوعی", "رضا طهرانی", ["علی", "مریم"])

        res = await executor.execute(ViewProjectStatusIntent(project_name="سیستم مدیریت منابع", language="fa"))

        assert "سیستم مدیریت منابع" in res.text
        assert "لاین هوش مصنوعی" in res.text
        assert "رضا طهرانی" in res.text
        assert "65%" in res.text
        assert res.reply_markup is not None

        callbacks = [
            btn.callback_data
            for row in res.reply_markup.inline_keyboard
            for btn in row
            if btn.callback_data
        ]
        assert f"proj_act:tasks:{proj_id}" in callbacks
        assert f"proj_act:sprints:{proj_id}" in callbacks
        assert f"proj_act:edit:{proj_id}" in callbacks
        assert f"proj_act:new_task:{proj_id}" in callbacks
        assert f"proj_act:new_sprint:{proj_id}" in callbacks
        assert f"proj_act:members:{proj_id}" in callbacks


@pytest.mark.asyncio
async def test_view_project_overview_card_english_has_no_persian_words(current_user):
    import re
    db = AsyncMock()
    executor = CommandExecutor(db, current_user, 123456)
    proj_id = uuid4()

    mock_proj = SimpleNamespace(
        id=proj_id,
        name="Atlas Project",
        description="Atlas Project Description",
        status=ProjectStatus.IN_PROGRESS.value,
        priority=Priority.P1.value,
        budget=120000000.0,
        progress_percentage=65.0,
        start_date="2026-10-01",
        end_date="2026-12-30",
        product_id=uuid4(),
    )

    mock_overview = SimpleNamespace(
        project=mock_proj,
        task_stats=SimpleNamespace(total=10, done=6, in_progress=3, blocked=1),
        sprints=[
            SimpleNamespace(id=uuid4(), name="Sprint 1", status="completed", start_date="2026-10-01", end_date="2026-10-14"),
            SimpleNamespace(id=uuid4(), name="Sprint 2", status="active", start_date="2026-10-15", end_date="2026-10-29"),
        ],
        current_sprint=SimpleNamespace(id=uuid4(), name="Sprint 2"),
        members=[],
    )

    with patch.object(executor, "_get_project_card_data", new_callable=AsyncMock) as mock_data, \
         patch("app.modules.telegram.resolver.EntityResolver.resolve_project", new_callable=AsyncMock) as mock_resolve:
        mock_resolve.return_value = SimpleNamespace(is_exact=True, entity=mock_proj)
        mock_data.return_value = (mock_overview, "AI Product Line", "Alex Smith", ["John", "Sara"])

        res = await executor.execute(ViewProjectStatusIntent(project_name="Atlas Project", language="en"))

        # Verify English wording
        assert "Project: Atlas Project" in res.text
        assert "Timeline:</b> 2026-10-01 to 2026-12-30" in res.text
        assert "(2026-10-01 to 2026-10-14)" in res.text
        assert "Tomans" in res.text
        assert " تا " not in res.text
        assert "تومان" not in res.text

        # Ensure NO Persian characters in the English text
        persian_chars = re.findall(r"[\u0600-\u06FF]", res.text)
        assert persian_chars == [], f"Found Persian characters in English card: {persian_chars}"


@pytest.mark.asyncio
async def test_update_project_and_return_updated_card(current_user):
    db = AsyncMock()
    executor = CommandExecutor(db, current_user, 123456)
    proj_id = uuid4()

    mock_proj = SimpleNamespace(
        id=proj_id,
        name="پروژه تست",
        description="توضیحات قبلی",
        status=ProjectStatus.NOT_STARTED.value,
        priority=Priority.P2.value,
        budget=50000000.0,
        progress_percentage=10.0,
        start_date=None,
        end_date=None,
        product_id=None,
    )

    mock_overview = SimpleNamespace(
        project=mock_proj,
        task_stats=SimpleNamespace(total=2, done=0, in_progress=1, blocked=0),
        sprints=[],
        current_sprint=None,
        members=[],
    )

    with patch("app.modules.telegram.resolver.EntityResolver.resolve_project", new_callable=AsyncMock) as mock_resolve, \
         patch("app.modules.projects.service.update_project", new_callable=AsyncMock) as mock_update, \
         patch.object(executor, "_get_project_card_data", new_callable=AsyncMock) as mock_data:
        mock_resolve.return_value = SimpleNamespace(is_exact=True, entity=mock_proj)
        mock_data.return_value = (mock_overview, "محصول تستی", "مدیر تستی", [])

        res = await executor.execute(
            UpdateProjectIntent(
                project_name="پروژه تست",
                name="پروژه تست ویرایش شده",
                status="in-progress",
                priority="P1",
                budget=80000000.0,
                language="fa",
            )
        )

        mock_update.assert_awaited_once()
        assert "با موفقیت به‌روزرسانی شد" in res.text
        assert res.reply_markup is not None


@pytest.mark.asyncio
async def test_my_tasks_interactive_list_and_keyboard(current_user):
    """Test that My Tasks returns interactive buttons for each task."""
    from app.modules.telegram.schemas import SearchTasksIntent

    db = AsyncMock()
    executor = CommandExecutor(db, current_user, 123456)

    t1_id = uuid4()
    t2_id = uuid4()
    t1 = SimpleNamespace(id=t1_id, title="طراحی صفحه لاگین", status="InProgress", due_date="2026-11-10", priority=Priority.P1.value)
    t2 = SimpleNamespace(id=t2_id, title="بهینه‌سازی دیتابیس", status="Done", due_date=None, priority=Priority.P2.value)

    with patch("app.modules.projects.repository.list_tasks_by_assignee", new_callable=AsyncMock) as mock_list, \
         patch("app.modules.collaboration.authorization._require_task_access", new_callable=AsyncMock):
        mock_list.return_value = [t1, t2]

        res = await executor.execute(SearchTasksIntent(is_my_tasks=True, language="fa"))

        assert "تسک‌های من" in res.text
        assert "طراحی صفحه لاگین" in res.text
        assert "بهینه‌سازی دیتابیس" in res.text
        assert res.reply_markup is not None

        cbs = [b.callback_data for row in res.reply_markup.inline_keyboard for b in row]
        assert f"task_act:view:{t1_id}" in cbs
        assert f"task_act:view:{t2_id}" in cbs
        assert "menu:main" in cbs


@pytest.mark.asyncio
async def test_task_actions_keyboard_contains_edit_and_navigation(current_user):
    """Test that task details actions keyboard contains Edit Task button."""
    from app.modules.telegram.ui import make_task_actions_keyboard
    from app.modules.telegram.capabilities import UserCapabilities

    tid = uuid4()
    caps = UserCapabilities(can_edit_task=True, can_change_task_status=True, can_assign_task=True, can_add_comment=True)
    kb = make_task_actions_keyboard(tid, current_status="Ready", capabilities=caps, lang="fa")

    cbs = [b.callback_data for row in kb.inline_keyboard for b in row]
    assert f"task_act:edit:{tid}" in cbs
    assert f"task_act:assign:{tid}" in cbs
    assert f"task_act:comment:{tid}" in cbs
    assert "menu:mytasks" in cbs
    assert "menu:main" in cbs


@pytest.mark.asyncio
async def test_task_edit_menu_keyboard_options():
    """Test that task edit menu provides title, desc, prio, stat, and due options."""
    from app.modules.telegram.ui import make_task_edit_menu_keyboard

    tid = uuid4()
    kb = make_task_edit_menu_keyboard(tid, lang="fa")
    cbs = [b.callback_data for row in kb.inline_keyboard for b in row]

    assert f"task_ed:title:{tid}" in cbs
    assert f"task_ed:desc:{tid}" in cbs
    assert f"task_ed:prio:{tid}" in cbs
    assert f"task_ed:stat:{tid}" in cbs
    assert f"task_ed:due:{tid}" in cbs
    assert f"task_act:view:{tid}" in cbs
    assert "menu:mytasks" in cbs


@pytest.mark.asyncio
async def test_task_priority_quick_selection(current_user):
    """Test updating task priority via inline button callback."""
    from app.modules.telegram.handlers.callbacks import handle_task_priority_selection
    from aiogram.types import CallbackQuery, User as TgUser

    tid = uuid4()
    mock_task = SimpleNamespace(
        id=tid,
        title="تسک آزمایشی",
        status="Ready",
        priority=Priority.P2.value,
        description="توضیح",
        due_date=None,
        start_date=None,
        assignees=[],
        checklist_items=[],
        phase=None,
    )

    cb = MagicMock(spec=CallbackQuery)
    cb.data = f"task_prio:{tid}:P0"
    cb.from_user = TgUser(id=12345678, is_bot=False, first_name="Dev")
    cb.message = MagicMock()
    cb.message.edit_text = AsyncMock()
    cb.answer = AsyncMock()

    mock_db = AsyncMock()
    mock_user = SimpleNamespace(id=current_user.user_id, full_name="Dev")

    with patch("app.modules.telegram.handlers.callbacks.AsyncSessionLocal", lambda: mock_db), \
         patch("app.modules.telegram.handlers.callbacks.resolve_telegram_user", AsyncMock(return_value=(mock_user, current_user))), \
         patch("app.modules.telegram.resolver.EntityResolver.resolve_task", AsyncMock(return_value=SimpleNamespace(is_exact=True, entity=mock_task))), \
         patch("app.modules.telegram.capabilities.TelegramCapabilityService.can_edit_task", return_value=True), \
         patch("app.modules.projects.service.update_task", new_callable=AsyncMock) as mock_upd:
        mock_upd.return_value = mock_task

        await handle_task_priority_selection(cb)

        mock_upd.assert_awaited_once()
        cb.answer.assert_called_once()
        assert "P0" in cb.answer.call_args[0][0]
        cb.message.edit_text.assert_called_once()

