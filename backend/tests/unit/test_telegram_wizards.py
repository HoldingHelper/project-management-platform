"""Unit tests for Telegram Bot interactive Project and Task creation wizards."""

from __future__ import annotations

from datetime import date, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import pytest
from aiogram.types import CallbackQuery, Chat, Message, User

from app.core.current_user import CurrentUser
from app.core.exceptions import ForbiddenError
from app.core.permissions import Permissions
from app.modules.projects.enums import Priority, ProjectStatus, TaskStatus, TaskType
from app.modules.projects.models import Product, Project, TaskItem
from app.modules.projects.schemas import MembershipPersonRead
from app.modules.telegram.state import conversation_state_manager
from app.modules.telegram.wizard import (
    ProjectWizard,
    TaskWizard,
    TelegramWizardManager,
    get_wizard_data,
    save_wizard_data,
)


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
def test_pm_user():
    return CurrentUser(
        user_id=uuid4(),
        email="pm@example.com",
        full_name="Project Manager",
        roles=["project_manager"],
        permissions=[
            Permissions.PROJECTS_CREATE,
            Permissions.PROJECTS_MANAGE_ALL,
            Permissions.TASKS_ASSIGN,
            Permissions.TASKS_MANAGE_ALL,
        ],
        allow_role_bypass=True,
    )


@pytest.fixture
def test_developer_user():
    return CurrentUser(
        user_id=uuid4(),
        email="dev@example.com",
        full_name="Developer Person",
        roles=["developer"],
        permissions=[
            Permissions.TASKS_VIEW,
            Permissions.TASKS_EDIT_ASSIGNED,
        ],
        allow_role_bypass=False,
    )


@pytest.fixture
def mock_message():
    chat = Chat(id=98765432, type="private")
    from_user = User(id=98765432, is_bot=False, first_name="TestUser")
    msg = MagicMock(spec=Message)
    msg.chat = chat
    msg.from_user = from_user
    msg.text = ""
    msg.answer = AsyncMock()
    return msg


@pytest.fixture
def mock_query():
    chat = Chat(id=98765432, type="private")
    from_user = User(id=98765432, is_bot=False, first_name="TestUser")
    cb = MagicMock(spec=CallbackQuery)
    cb.from_user = from_user
    cb.data = ""
    cb.answer = AsyncMock()
    cb.message = MagicMock(spec=Message)
    cb.message.chat = chat
    cb.message.edit_text = AsyncMock()
    cb.message.answer = AsyncMock()
    return cb


# =====================================================================
# PROJECT WIZARD TESTS
# =====================================================================

@pytest.mark.asyncio
async def test_project_wizard_start_single_product_auto_selects(test_pm_user):
    """When user has access to exactly 1 product line, it auto-selects and asks project name."""
    mock_db = AsyncMock()
    chat_id = 112233
    prod_id = uuid4()
    single_prod = Product(id=prod_id, name="Core Banking", owner_user_id=test_pm_user.user_id)

    with patch("app.modules.telegram.wizard.visible_product_ids", AsyncMock(return_value=[prod_id])), \
         patch("app.modules.projects.membership.product_people", AsyncMock(return_value=[
             MembershipPersonRead(id=test_pm_user.user_id, full_name=test_pm_user.full_name, email=test_pm_user.email, is_active=True)
         ])):
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [single_prod]
        mock_db.execute.return_value = mock_result

        text, markup = await ProjectWizard.start(mock_db, test_pm_user, chat_id, lang="fa")

        state = await conversation_state_manager.get_state(chat_id)
        wizard = get_wizard_data(state.pending_intent)
        assert wizard is not None
        assert wizard["step"] == "project_manager"
        assert wizard["data"]["product_id"] == str(prod_id)
        assert wizard["data"]["product_name"] == "Core Banking"
        assert "مدیر پروژه" in text


@pytest.mark.asyncio
async def test_project_wizard_select_manager_from_product_line_members(test_pm_user, mock_query):
    """Test selecting a project manager from the product line member buttons."""
    mock_db = AsyncMock()
    chat_id = mock_query.from_user.id
    prod_id = uuid4()
    mgr_id = uuid4()

    data = {
        "type": "wizard",
        "wizard_type": "project",
        "lang": "fa",
        "step": "project_manager",
        "history": ["product_line"],
        "is_editing": False,
        "editing_field": None,
        "data": {"product_id": str(prod_id), "product_name": "Core Banking"},
    }
    await save_wizard_data(chat_id, data)

    # User clicks manager button
    from app.modules.identity.models import User as DBUser
    mock_query.data = f"w:p:mgr:{mgr_id.hex}"
    mock_db.get.return_value = DBUser(id=mgr_id, first_name="Sarah", last_name="Connor", email="sarah@example.com")
    with patch("app.modules.projects.membership.product_people", return_value=[
        MembershipPersonRead(id=mgr_id, full_name="Sarah Connor", email="sarah@example.com", is_active=True)
    ]):
        handled = await TelegramWizardManager.handle_callback(mock_db, test_pm_user, chat_id, mock_query)
        assert handled is True

    w = get_wizard_data((await conversation_state_manager.get_state(chat_id)).pending_intent)
    assert w["data"]["manager_user_id"] == str(mgr_id)
    assert w["data"]["manager_name"] == "Sarah Connor"
    assert w["step"] == "project_members"


@pytest.mark.asyncio
async def test_project_wizard_members_selection_bulk_and_individual(test_pm_user, mock_query, mock_message):
    """Test viewing product line members, bulk add, individual toggle, and advancing to name."""
    from app.modules.identity.models import User as DBUser
    from app.modules.projects.schemas import MembershipPersonRead

    mock_db = AsyncMock()
    chat_id = mock_query.from_user.id
    prod_id = uuid4()
    mgr_id = uuid4()
    member1_id = uuid4()
    member2_id = uuid4()

    mock_members = [
        MembershipPersonRead(id=mgr_id, full_name="Manager User", email="mgr@example.com", is_active=True),
        MembershipPersonRead(id=member1_id, full_name="Ali Rezaei", email="ali@example.com", is_active=True),
        MembershipPersonRead(id=member2_id, full_name="Sara Moradi", email="sara@example.com", is_active=True),
    ]

    data = {
        "type": "wizard",
        "wizard_type": "project",
        "lang": "fa",
        "step": "project_members",
        "history": ["product_line", "project_manager"],
        "is_editing": False,
        "editing_field": None,
        "data": {
            "product_id": str(prod_id),
            "product_name": "Core Banking",
            "manager_user_id": str(mgr_id),
            "manager_user_name": "Manager User",
            "member_user_ids": [str(mgr_id)],
            "member_user_names": ["Manager User"],
        },
    }
    await save_wizard_data(chat_id, data)

    # 1. Bulk Add All Members
    mock_query.data = "w:p:mem_all:1"
    with patch("app.modules.projects.membership.product_people", return_value=mock_members):
        handled = await TelegramWizardManager.handle_callback(mock_db, test_pm_user, chat_id, mock_query)
        assert handled is True

    w = get_wizard_data((await conversation_state_manager.get_state(chat_id)).pending_intent)
    assert len(w["data"]["member_user_ids"]) == 3
    assert str(member1_id) in w["data"]["member_user_ids"]
    assert str(member2_id) in w["data"]["member_user_ids"]
    assert w["step"] == "project_members"

    # 2. Individual Toggle Off (Sara Moradi)
    mock_query.data = f"w:p:mem_tog:{member2_id.hex}"
    with patch("app.modules.projects.membership.product_people", return_value=mock_members):
        handled = await TelegramWizardManager.handle_callback(mock_db, test_pm_user, chat_id, mock_query)
        assert handled is True

    w = get_wizard_data((await conversation_state_manager.get_state(chat_id)).pending_intent)
    assert len(w["data"]["member_user_ids"]) == 2
    assert str(member2_id) not in w["data"]["member_user_ids"]
    assert str(member1_id) in w["data"]["member_user_ids"]

    # 3. Individual Toggle On (Sara Moradi)
    mock_db.get.return_value = DBUser(id=member2_id, first_name="Sara", last_name="Moradi", email="sara@example.com")
    with patch("app.modules.projects.membership.product_people", return_value=mock_members):
        handled = await TelegramWizardManager.handle_callback(mock_db, test_pm_user, chat_id, mock_query)
        assert handled is True

    w = get_wizard_data((await conversation_state_manager.get_state(chat_id)).pending_intent)
    assert len(w["data"]["member_user_ids"]) == 3
    assert str(member2_id) in w["data"]["member_user_ids"]

    # 4. Text Input matching member name toggles member off
    with patch("app.modules.projects.membership.product_people", return_value=mock_members):
        handled = await TelegramWizardManager.handle_text_input(mock_db, test_pm_user, chat_id, "Sara Moradi", mock_message)
        assert handled is True

    w = get_wizard_data((await conversation_state_manager.get_state(chat_id)).pending_intent)
    assert str(member2_id) not in w["data"]["member_user_ids"]

    # 5. Confirm and Next advances to 'name'
    mock_query.data = "w:p:mem_done"
    with patch("app.modules.projects.membership.product_people", return_value=mock_members):
        handled = await TelegramWizardManager.handle_callback(mock_db, test_pm_user, chat_id, mock_query)
        assert handled is True

    w = get_wizard_data((await conversation_state_manager.get_state(chat_id)).pending_intent)
    assert w["step"] == "name"


@pytest.mark.asyncio
async def test_project_wizard_step_progression_to_preview(test_pm_user, mock_query, mock_message):
    """Test full sequential project wizard progression through Sprints and all fields to Preview."""
    mock_db = AsyncMock()
    chat_id = mock_query.from_user.id
    prod_id = uuid4()

    # Initialize wizard with product selected
    data = {
        "type": "wizard",
        "wizard_type": "project",
        "lang": "fa",
        "step": "name",
        "history": ["product_line", "project_manager"],
        "is_editing": False,
        "editing_field": None,
        "data": {
            "product_id": str(prod_id),
            "product_name": "Atlas Cloud",
            "manager_user_id": str(test_pm_user.user_id),
            "manager_name": test_pm_user.full_name,
        },
    }
    await save_wizard_data(chat_id, data)

    # 1. User sends Name
    mock_message.text = "Platform 2.0"
    handled = await TelegramWizardManager.handle_text_input(mock_db, test_pm_user, chat_id, "Platform 2.0", mock_message)
    assert handled is True
    w = get_wizard_data((await conversation_state_manager.get_state(chat_id)).pending_intent)
    assert w["data"]["name"] == "Platform 2.0"
    assert w["step"] == "description"

    # 2. User skips Description
    mock_query.data = "w:skip"
    handled = await TelegramWizardManager.handle_callback(mock_db, test_pm_user, chat_id, mock_query)
    assert handled is True
    w = get_wizard_data((await conversation_state_manager.get_state(chat_id)).pending_intent)
    assert w["step"] == "scope"

    # 3. User chooses Scope (Tech)
    mock_query.data = "w:p:scope:tech"
    handled = await TelegramWizardManager.handle_callback(mock_db, test_pm_user, chat_id, mock_query)
    assert handled is True
    w = get_wizard_data((await conversation_state_manager.get_state(chat_id)).pending_intent)
    assert w["data"]["partition"] == "tech"
    assert w["step"] == "priority"

    # 4. User chooses Priority (P1)
    mock_query.data = "w:p:prio:P1"
    await TelegramWizardManager.handle_callback(mock_db, test_pm_user, chat_id, mock_query)
    w = get_wizard_data((await conversation_state_manager.get_state(chat_id)).pending_intent)
    assert w["data"]["priority"] == "P1"
    assert w["step"] == "status"

    # 5. User chooses Status (not-started)
    mock_query.data = "w:p:stat:not-started"
    await TelegramWizardManager.handle_callback(mock_db, test_pm_user, chat_id, mock_query)
    w = get_wizard_data((await conversation_state_manager.get_state(chat_id)).pending_intent)
    assert w["data"]["status"] == "not-started"
    assert w["step"] == "has_sprints"

    # 6. User chooses With Sprints (1)
    mock_query.data = "w:p:sp_yn:1"
    await TelegramWizardManager.handle_callback(mock_db, test_pm_user, chat_id, mock_query)
    w = get_wizard_data((await conversation_state_manager.get_state(chat_id)).pending_intent)
    assert w["data"]["has_sprints"] is True
    assert w["step"] == "sprint_start"

    # 7. User selects Today for Sprint 1 Start
    mock_query.data = "w:p:start:today"
    await TelegramWizardManager.handle_callback(mock_db, test_pm_user, chat_id, mock_query)
    w = get_wizard_data((await conversation_state_manager.get_state(chat_id)).pending_intent)
    assert w["data"]["start_date"] == date.today().isoformat()
    assert w["step"] == "sprint_duration"

    # 8. User chooses 14-day sprints
    mock_query.data = "w:p:dur:14"
    await TelegramWizardManager.handle_callback(mock_db, test_pm_user, chat_id, mock_query)
    w = get_wizard_data((await conversation_state_manager.get_state(chat_id)).pending_intent)
    assert w["data"]["sprint_duration"] == 14
    assert w["step"] == "sprint_count"

    # 9. User chooses 4 sprints
    mock_query.data = "w:p:cnt:4"
    await TelegramWizardManager.handle_callback(mock_db, test_pm_user, chat_id, mock_query)
    w = get_wizard_data((await conversation_state_manager.get_state(chat_id)).pending_intent)
    assert w["data"]["sprint_count"] == 4
    assert w["step"] == "sprint_names"

    # 10. User chooses Default Sprint Names
    mock_query.data = "w:p:sp_name:default"
    await TelegramWizardManager.handle_callback(mock_db, test_pm_user, chat_id, mock_query)
    w = get_wizard_data((await conversation_state_manager.get_state(chat_id)).pending_intent)
    assert w["data"]["sprint_names"] == ["Sprint 1", "Sprint 2", "Sprint 3", "Sprint 4"]
    assert w["step"] == "checklist"

    # 11. User enters Checklist items
    handled = await TelegramWizardManager.handle_text_input(mock_db, test_pm_user, chat_id, "طراحی دیتابیس, توسعه API, تست و استقرار", mock_message)
    w = get_wizard_data((await conversation_state_manager.get_state(chat_id)).pending_intent)
    assert len(w["data"]["checklist_items"]) == 3
    assert w["step"] == "budget"

    # 12. User skips Budget -> Reaches Attachments step
    mock_query.data = "w:skip"
    await TelegramWizardManager.handle_callback(mock_db, test_pm_user, chat_id, mock_query)
    w = get_wizard_data((await conversation_state_manager.get_state(chat_id)).pending_intent)
    assert w["step"] == "attachments"

    # 13. User skips Attachments -> Reaches Final Preview!
    mock_query.data = "w:skip"
    await TelegramWizardManager.handle_callback(mock_db, test_pm_user, chat_id, mock_query)
    w = get_wizard_data((await conversation_state_manager.get_state(chat_id)).pending_intent)
    assert w["step"] == "preview"
    # End date automatically derived from 4 sprints * 14 days
    expected_end = date.today() + timedelta(days=55)
    assert w["data"]["end_date"] == expected_end.isoformat()


@pytest.mark.asyncio
async def test_project_wizard_back_navigation(test_pm_user, mock_query):
    """User can go back to previous steps using [⬅️ قبلی / Back]."""
    mock_db = AsyncMock()
    chat_id = mock_query.from_user.id

    data = {
        "type": "wizard",
        "wizard_type": "project",
        "lang": "fa",
        "step": "priority",
        "history": ["product_line", "name", "description", "scope"],
        "is_editing": False,
        "editing_field": None,
        "data": {"name": "Atlas"},
    }
    await save_wizard_data(chat_id, data)

    # Click Back
    mock_query.data = "w:back"
    handled = await TelegramWizardManager.handle_callback(mock_db, test_pm_user, chat_id, mock_query)
    assert handled is True

    w = get_wizard_data((await conversation_state_manager.get_state(chat_id)).pending_intent)
    assert w["step"] == "scope"
    assert w["history"] == ["product_line", "name", "description"]


@pytest.mark.asyncio
async def test_project_wizard_edit_field_from_preview(test_pm_user, mock_query, mock_message):
    """User can choose 'Edit Fields' from Preview, modify one field, and immediately return to Preview."""
    mock_db = AsyncMock()
    chat_id = mock_query.from_user.id

    data = {
        "type": "wizard",
        "wizard_type": "project",
        "lang": "fa",
        "step": "preview",
        "history": ["name", "priority"],
        "is_editing": False,
        "editing_field": None,
        "data": {
            "name": "Atlas",
            "priority": "P2",
            "product_id": str(uuid4()),
            "product_name": "Mobile",
        },
    }
    await save_wizard_data(chat_id, data)

    # 1. Click edit priority
    mock_query.data = "w:ed:priority"
    await TelegramWizardManager.handle_callback(mock_db, test_pm_user, chat_id, mock_query)
    w = get_wizard_data((await conversation_state_manager.get_state(chat_id)).pending_intent)
    assert w["step"] == "priority"
    assert w["is_editing"] is True

    # 2. Pick P0
    mock_query.data = "w:p:prio:P0"
    await TelegramWizardManager.handle_callback(mock_db, test_pm_user, chat_id, mock_query)
    w = get_wizard_data((await conversation_state_manager.get_state(chat_id)).pending_intent)
    # Jumps directly back to preview!
    assert w["step"] == "preview"
    assert w["data"]["priority"] == "P0"
    assert w["is_editing"] is False


@pytest.mark.asyncio
async def test_project_wizard_final_commit_calls_service(test_pm_user, mock_query):
    """Commit on preview validates permissions and invokes projects_service.create_project."""
    mock_db = AsyncMock()
    chat_id = mock_query.from_user.id
    prod_id = uuid4()
    proj_id = uuid4()

    data = {
        "type": "wizard",
        "wizard_type": "project",
        "lang": "fa",
        "step": "preview",
        "history": ["name"],
        "is_editing": False,
        "editing_field": None,
        "data": {
            "name": "Nova Platform",
            "product_id": str(prod_id),
            "product_name": "Core Banking",
            "priority": "P1",
            "status": "not-started",
            "has_sprints": True,
            "start_date": "2026-11-01",
            "end_date": "2026-12-26",
            "sprint_duration": 14,
            "sprint_count": 4,
            "sprint_names": ["Sprint 1", "Sprint 2", "Sprint 3", "Sprint 4"],
        },
    }
    await save_wizard_data(chat_id, data)

    created_project = Project(
        id=proj_id,
        name="Nova Platform",
        product_id=prod_id,
        start_date=date(2026, 11, 1),
        end_date=date(2026, 12, 26),
    )

    with patch("app.modules.telegram.wizard.require_product_access", AsyncMock()), \
         patch("app.modules.telegram.wizard.projects_service.create_project", AsyncMock(return_value=created_project)) as mock_create:

        mock_query.data = "w:commit"
        handled = await TelegramWizardManager.handle_callback(mock_db, test_pm_user, chat_id, mock_query)
        assert handled is True
        assert mock_create.called
        payload_arg = mock_create.call_args[1]["payload"]
        assert payload_arg.name == "Nova Platform"
        assert payload_arg.priority == Priority.P1
        assert len(payload_arg.sprints) == 4

        # Pending intent cleared
        state = await conversation_state_manager.get_state(chat_id)
        assert not state.pending_intent


@pytest.mark.asyncio
async def test_project_wizard_final_commit_adds_members(test_pm_user, mock_query):
    """Committing project creation adds selected member users as project members."""
    mock_db = AsyncMock()
    chat_id = mock_query.from_user.id
    prod_id = uuid4()
    proj_id = uuid4()
    extra_member_id = uuid4()

    data = {
        "type": "wizard",
        "wizard_type": "project",
        "lang": "fa",
        "step": "preview",
        "history": ["product_line", "project_manager", "project_members", "name"],
        "is_editing": False,
        "editing_field": None,
        "data": {
            "name": "Nova Platform",
            "product_id": str(prod_id),
            "product_name": "Core Banking",
            "manager_user_id": str(test_pm_user.user_id),
            "member_user_ids": [str(test_pm_user.user_id), str(extra_member_id)],
            "member_user_names": [test_pm_user.full_name, "Extra Dev"],
            "priority": "P1",
            "status": "not-started",
            "has_sprints": False,
            "start_date": "2026-11-01",
            "end_date": "2026-12-01",
        },
    }
    await save_wizard_data(chat_id, data)

    created_project = Project(
        id=proj_id,
        name="Nova Platform",
        product_id=prod_id,
        start_date=date(2026, 11, 1),
        end_date=date(2026, 12, 1),
    )

    with patch("app.modules.telegram.wizard.require_product_access", AsyncMock()), \
         patch("app.modules.telegram.wizard.projects_service.create_project", AsyncMock(return_value=created_project)), \
         patch("app.modules.telegram.wizard.projects_service.add_project_member", AsyncMock()) as mock_add_member:

        mock_query.data = "w:commit"
        handled = await TelegramWizardManager.handle_callback(mock_db, test_pm_user, chat_id, mock_query)
        assert handled is True
        assert mock_add_member.called
        assert mock_add_member.call_args[1]["payload"].user_id == extra_member_id


# =====================================================================
# TASK WIZARD TESTS
# =====================================================================

@pytest.mark.asyncio
async def test_task_wizard_start_prompts_project_selection(test_developer_user):
    """Task wizard start lists accessible projects and asks user to choose."""
    mock_db = AsyncMock()
    chat_id = 998877
    proj1 = SimpleNamespace(id=uuid4(), name="Atlas")
    proj2 = SimpleNamespace(id=uuid4(), name="Hermes")

    with patch("app.modules.telegram.wizard.projects_service.list_all_projects", AsyncMock(return_value=([proj1, proj2], 2))):
        text, markup = await TaskWizard.start(mock_db, test_developer_user, chat_id, lang="fa")
        assert "انتخاب پروژه" in text
        # Inline buttons contains project names
        all_btn_texts = [btn.text for row in markup.inline_keyboard for btn in row]
        assert any("Atlas" in t for t in all_btn_texts)
        assert any("Hermes" in t for t in all_btn_texts)


@pytest.mark.asyncio
async def test_task_wizard_progression_to_preview(test_developer_user, mock_query, mock_message):
    """Full task wizard progression through all fields to preview."""
    mock_db = AsyncMock()
    chat_id = mock_query.from_user.id
    proj_id = uuid4()
    phase_id = uuid4()

    data = {
        "type": "wizard",
        "wizard_type": "task",
        "lang": "fa",
        "step": "title",
        "history": ["project", "phase"],
        "is_editing": False,
        "editing_field": None,
        "data": {
            "project_id": str(proj_id),
            "project_name": "Atlas",
            "phase_id": str(phase_id),
            "phase_name": "Sprint 1",
        },
    }
    await save_wizard_data(chat_id, data)

    # 1. Title
    await TelegramWizardManager.handle_text_input(mock_db, test_developer_user, chat_id, "Fix Payment Gateway Timeout", mock_message)
    w = get_wizard_data((await conversation_state_manager.get_state(chat_id)).pending_intent)
    assert w["data"]["title"] == "Fix Payment Gateway Timeout"
    assert w["step"] == "task_type"

    # 2. Type Bug
    mock_query.data = "w:t:type:Bug"
    await TelegramWizardManager.handle_callback(mock_db, test_developer_user, chat_id, mock_query)
    w = get_wizard_data((await conversation_state_manager.get_state(chat_id)).pending_intent)
    assert w["data"]["task_type"] == "Bug"
    assert w["step"] == "priority"

    # 3. Priority P0
    mock_query.data = "w:t:prio:P0"
    await TelegramWizardManager.handle_callback(mock_db, test_developer_user, chat_id, mock_query)
    w = get_wizard_data((await conversation_state_manager.get_state(chat_id)).pending_intent)
    assert w["data"]["priority"] == "P0"
    assert w["step"] == "status"

    # 4. Status Ready
    mock_query.data = "w:t:stat:Ready"
    await TelegramWizardManager.handle_callback(mock_db, test_developer_user, chat_id, mock_query)
    w = get_wizard_data((await conversation_state_manager.get_state(chat_id)).pending_intent)
    assert w["data"]["status"] == "Ready"
    assert w["step"] == "description"

    # 5. Skip Description
    mock_query.data = "w:skip"
    await TelegramWizardManager.handle_callback(mock_db, test_developer_user, chat_id, mock_query)
    w = get_wizard_data((await conversation_state_manager.get_state(chat_id)).pending_intent)
    assert w["step"] == "partition"

    # 6. Partition Tech
    mock_query.data = "w:t:part:tech"
    await TelegramWizardManager.handle_callback(mock_db, test_developer_user, chat_id, mock_query)
    w = get_wizard_data((await conversation_state_manager.get_state(chat_id)).pending_intent)
    assert w["data"]["partition"] == "tech"
    assert w["step"] == "assignee"

    # 7. Assign to Me
    mock_query.data = "w:t:asgn:me"
    await TelegramWizardManager.handle_callback(mock_db, test_developer_user, chat_id, mock_query)
    w = get_wizard_data((await conversation_state_manager.get_state(chat_id)).pending_intent)
    assert w["data"]["assignee_user_ids"] == [str(test_developer_user.user_id)]
    assert w["step"] == "due_date"

    # 8. Due date 3 days
    mock_query.data = "w:t:due:3d"
    await TelegramWizardManager.handle_callback(mock_db, test_developer_user, chat_id, mock_query)
    w = get_wizard_data((await conversation_state_manager.get_state(chat_id)).pending_intent)
    assert w["data"]["due_date"] == (date.today() + timedelta(days=3)).isoformat()
    assert w["step"] == "story_points"

    # 9. Story Points 5
    mock_query.data = "w:t:sp:5"
    await TelegramWizardManager.handle_callback(mock_db, test_developer_user, chat_id, mock_query)
    w = get_wizard_data((await conversation_state_manager.get_state(chat_id)).pending_intent)
    assert w["data"]["story_points"] == 5
    assert w["step"] == "labels"

    # 10. Labels
    await TelegramWizardManager.handle_text_input(mock_db, test_developer_user, chat_id, "backend, payment, urgent", mock_message)
    w = get_wizard_data((await conversation_state_manager.get_state(chat_id)).pending_intent)
    assert w["data"]["label_names"] == ["backend", "payment", "urgent"]
    assert w["step"] == "checklist"

    # 11. Checklist
    await TelegramWizardManager.handle_text_input(mock_db, test_developer_user, chat_id, "بررسی لاگ, اصلاح timeout, تست پذیرش", mock_message)
    w = get_wizard_data((await conversation_state_manager.get_state(chat_id)).pending_intent)
    assert len(w["data"]["checklist_items"]) == 3
    assert w["step"] == "github_url"

    # 12. Skip GitHub
    mock_query.data = "w:skip"
    await TelegramWizardManager.handle_callback(mock_db, test_developer_user, chat_id, mock_query)
    w = get_wizard_data((await conversation_state_manager.get_state(chat_id)).pending_intent)
    assert w["step"] == "attachments"

    # 13. Skip Attachments
    mock_query.data = "w:skip"
    await TelegramWizardManager.handle_callback(mock_db, test_developer_user, chat_id, mock_query)
    w = get_wizard_data((await conversation_state_manager.get_state(chat_id)).pending_intent)
    assert w["step"] == "is_ticket"

    # 14. Is Ticket: No (0) -> Reaches Preview!
    mock_query.data = "w:t:tkt:0"
    await TelegramWizardManager.handle_callback(mock_db, test_developer_user, chat_id, mock_query)
    w = get_wizard_data((await conversation_state_manager.get_state(chat_id)).pending_intent)
    assert w["step"] == "preview"
    assert w["data"]["is_ticket"] is False


@pytest.mark.asyncio
async def test_task_wizard_contributor_cannot_assign_others(test_developer_user, mock_message):
    """A developer without tasks.assign cannot assign tasks to other users."""
    mock_db = AsyncMock()
    chat_id = mock_message.from_user.id
    other_user_id = uuid4()

    data = {
        "type": "wizard",
        "wizard_type": "task",
        "lang": "fa",
        "step": "assignee",
        "history": ["project", "phase", "title"],
        "is_editing": False,
        "editing_field": None,
        "data": {
            "title": "Bug fix",
            "project_id": str(uuid4()),
        },
    }
    await save_wizard_data(chat_id, data)

    other_user = SimpleNamespace(id=other_user_id, full_name="Sarah Developer", email="sarah@test.com")
    with patch("app.modules.telegram.resolver.EntityResolver.resolve_user", AsyncMock(return_value=SimpleNamespace(is_exact=True, entity=other_user))):
        handled = await TelegramWizardManager.handle_text_input(mock_db, test_developer_user, chat_id, "Sarah", mock_message)
        assert handled is True
        # Assignment rejected
        assert mock_message.answer.called
        reply_text = mock_message.answer.call_args[0][0]
        assert "تنها مجاز هستید تسک را به خودتان ارجاع دهید" in reply_text


@pytest.mark.asyncio
async def test_task_wizard_final_commit_calls_service(test_developer_user, mock_query):
    """Task commit on preview triggers projects_service.create_task and clears conversation state."""
    mock_db = AsyncMock()
    chat_id = mock_query.from_user.id
    proj_id = uuid4()
    task_id = uuid4()

    data = {
        "type": "wizard",
        "wizard_type": "task",
        "lang": "fa",
        "step": "preview",
        "history": ["title"],
        "is_editing": False,
        "editing_field": None,
        "data": {
            "title": "Optimize DB Indexes",
            "project_id": str(proj_id),
            "project_name": "Core Banking",
            "task_type": "Improvement",
            "priority": "P1",
            "status": "Ready",
            "assignee_user_ids": [str(test_developer_user.user_id)],
            "due_date": "2026-11-15",
            "story_points": 3,
            "partition": "tech",
        },
    }
    await save_wizard_data(chat_id, data)

    created_task = TaskItem(
        id=task_id,
        title="Optimize DB Indexes",
        status=TaskStatus.READY.value,
        priority=Priority.P1.value,
        due_date=date(2026, 11, 15),
    )

    with patch("app.modules.telegram.wizard._require_project_access", AsyncMock()), \
         patch("app.modules.telegram.wizard.projects_service.create_task", AsyncMock(return_value=created_task)) as mock_create:

        mock_query.data = "w:commit"
        handled = await TelegramWizardManager.handle_callback(mock_db, test_developer_user, chat_id, mock_query)
        assert handled is True
        assert mock_create.called
        payload_arg = mock_create.call_args[1]["payload"]
        assert payload_arg.title == "Optimize DB Indexes"
        assert payload_arg.priority == Priority.P1

        # Clear state
        state = await conversation_state_manager.get_state(chat_id)
        assert not state.pending_intent


@pytest.mark.asyncio
async def test_wizard_cancel_clears_state(test_pm_user, mock_query):
    """Clicking [❌ لغو / Cancel] clears conversation state and notifies user."""
    mock_db = AsyncMock()
    chat_id = mock_query.from_user.id

    data = {
        "type": "wizard",
        "wizard_type": "project",
        "lang": "fa",
        "step": "name",
        "history": [],
        "is_editing": False,
        "editing_field": None,
        "data": {},
    }
    await save_wizard_data(chat_id, data)

    mock_query.data = "w:cancel"
    handled = await TelegramWizardManager.handle_callback(mock_db, test_pm_user, chat_id, mock_query)
    assert handled is True

    state = await conversation_state_manager.get_state(chat_id)
    assert not state.pending_intent
    assert mock_query.message.edit_text.called
    assert "عملیات ساخت لغو گردید" in mock_query.message.edit_text.call_args[0][0]


@pytest.mark.asyncio
async def test_task_wizard_render_step_assignee_lists_project_members(test_pm_user):
    """Verify that TaskWizard assignee step displays project members by name and provides assign buttons."""
    from app.modules.telegram.wizard import TaskWizard
    from app.modules.identity.models import User

    mock_db = AsyncMock()
    proj_id = uuid4()
    member1 = User(id=uuid4(), email="alice@example.com", first_name="Alice", last_name="Smith", is_active=True)
    member2 = User(id=uuid4(), email="bob@example.com", first_name="Bob", last_name="Jones", is_active=True)
    admin_member = User(id=uuid4(), email="admin@example.com", first_name="Platform", last_name="Admin", is_active=True)

    wizard = {
        "type": "wizard",
        "wizard_type": "task",
        "lang": "fa",
        "step": "assignee",
        "history": ["project"],
        "is_editing": False,
        "editing_field": None,
        "data": {
            "project_id": str(proj_id),
            "project_name": "Project Alpha",
        },
    }

    mock_proj = SimpleNamespace(id=proj_id, name="Project Alpha", product_id=uuid4())

    with patch("app.modules.telegram.wizard.repo.get_project", AsyncMock(return_value=mock_proj)), \
         patch("app.modules.projects.membership.project_people", AsyncMock(return_value=[member1, member2, admin_member])), \
         patch("app.modules.projects.membership.product_people", AsyncMock(return_value=[])):

        text, markup = await TaskWizard.render_step(mock_db, test_pm_user, wizard, lang="fa")

        # Name list must be included in the message text
        assert "لیست افراد و اعضای پروژه" in text
        assert "Alice Smith" in text
        assert "Bob Jones" in text
        assert "Platform Admin" not in text

        # Inline keyboard must include buttons for members, excluding Platform Admin
        all_callbacks = [btn.callback_data for row in markup.inline_keyboard for btn in row]
        assert "w:t:asgn:me" in all_callbacks
        assert "w:t:asgn:none" in all_callbacks
        assert f"w:t:asgn:{member1.id.hex}" in all_callbacks
        assert f"w:t:asgn:{member2.id.hex}" in all_callbacks
        assert f"w:t:asgn:{admin_member.id.hex}" not in all_callbacks


@pytest.mark.asyncio
async def test_task_wizard_commit_persists_voice_drafts_without_error(test_pm_user, mock_query):
    """Verify that voice attachments during task wizard are downloaded and uploaded without NameError."""
    mock_db = AsyncMock()
    chat_id = mock_query.from_user.id
    proj_id = uuid4()
    task_id = uuid4()

    data = {
        "type": "wizard",
        "wizard_type": "task",
        "lang": "fa",
        "step": "preview",
        "history": [],
        "is_editing": False,
        "editing_field": None,
        "data": {
            "title": "Voice Task",
            "project_id": str(proj_id),
            "project_name": "Voice Project",
            "task_type": "Task",
            "priority": "P2",
            "status": "Ready",
            "draft_attachments": [
                {
                    "storage_key": "drafts/123/voice.ogg",
                    "file_name": "voice_1.ogg",
                    "content_type": "audio/ogg",
                    "size_bytes": 1024,
                }
            ],
        },
    }
    await save_wizard_data(chat_id, data)

    created_task = TaskItem(
        id=task_id,
        title="Voice Task",
        status=TaskStatus.READY.value,
        priority=Priority.P2.value,
    )

    with patch("app.modules.telegram.wizard._require_project_access", AsyncMock()), \
         patch("app.modules.telegram.wizard.projects_service.create_task", AsyncMock(return_value=created_task)), \
         patch("app.modules.telegram.wizard.file_storage_service.download_async", AsyncMock(return_value=b"OGG_BYTES")) as mock_dl, \
         patch("app.modules.telegram.wizard.collaboration_service.upload_file", AsyncMock()) as mock_up, \
         patch("app.modules.telegram.wizard.file_storage_service.delete", MagicMock()):

        mock_query.data = "w:commit"
        handled = await TelegramWizardManager.handle_callback(mock_db, test_pm_user, chat_id, mock_query)
        assert handled is True
        assert mock_dl.called
        assert mock_up.called
        assert mock_up.call_args[1]["file_name"] == "voice_1.ogg"
        assert mock_up.call_args[1]["entity_type"] == "task"


@pytest.mark.asyncio
async def test_project_wizard_render_step_lists_product_line_members(test_pm_user):
    """Verify that ProjectWizard displays product line members and creates selection buttons."""
    from app.modules.telegram.wizard import ProjectWizard
    from app.modules.identity.models import User

    mock_db = AsyncMock()
    prod_id = uuid4()
    member1 = User(id=uuid4(), email="pm1@example.com", first_name="PM", last_name="One", is_active=True)
    member2 = User(id=uuid4(), email="pm2@example.com", first_name="PM", last_name="Two", is_active=True)

    wizard = {
        "type": "wizard",
        "wizard_type": "project",
        "lang": "fa",
        "step": "project_manager",
        "history": ["product_line"],
        "is_editing": False,
        "editing_field": None,
        "data": {
            "product_id": str(prod_id),
            "product_name": "Line Alpha",
        },
    }

    with patch("app.modules.projects.membership.product_people", AsyncMock(return_value=[member1, member2])):
        text, markup = await ProjectWizard.render_step(mock_db, test_pm_user, wizard, lang="fa")

        # Name list must be included in the message text
        assert "لیست اعضای خط محصول" in text
        assert "PM One" in text
        assert "PM Two" in text

        # Inline keyboard must include buttons for product line members
        all_callbacks = [btn.callback_data for row in markup.inline_keyboard for btn in row]
        assert f"w:p:mgr:{member1.id.hex}" in all_callbacks
        assert f"w:p:mgr:{member2.id.hex}" in all_callbacks


@pytest.mark.asyncio
async def test_task_wizard_assignee_bulk_and_individual(test_pm_user, mock_query, mock_message):
    """Verify TaskWizard assignee selection supports bulk add, individual toggle, and advancing."""
    from app.modules.identity.models import User as DBUser
    from app.modules.projects.schemas import MembershipPersonRead

    mock_db = AsyncMock()
    chat_id = mock_query.from_user.id
    proj_id = uuid4()
    member1_id = uuid4()
    member2_id = uuid4()

    mock_members = [
        MembershipPersonRead(id=test_pm_user.user_id, full_name="PM User", email="pm@example.com", is_active=True),
        MembershipPersonRead(id=member1_id, full_name="Dev Alpha", email="alpha@example.com", is_active=True),
        MembershipPersonRead(id=member2_id, full_name="Dev Beta", email="beta@example.com", is_active=True),
    ]

    data = {
        "type": "wizard",
        "wizard_type": "task",
        "lang": "fa",
        "step": "assignee",
        "history": ["project", "title", "description"],
        "is_editing": False,
        "editing_field": None,
        "data": {
            "project_id": str(proj_id),
            "project_name": "Phoenix",
            "assignee_user_ids": [],
            "assignee_names": [],
        },
    }
    await save_wizard_data(chat_id, data)

    # 1. Bulk Add All Members (w:t:asgn_all:1)
    mock_query.data = "w:t:asgn_all:1"
    with patch("app.modules.projects.membership.project_people", return_value=mock_members):
        handled = await TelegramWizardManager.handle_callback(mock_db, test_pm_user, chat_id, mock_query)
        assert handled is True

    w = get_wizard_data((await conversation_state_manager.get_state(chat_id)).pending_intent)
    assert len(w["data"]["assignee_user_ids"]) == 3
    assert str(member1_id) in w["data"]["assignee_user_ids"]
    assert str(member2_id) in w["data"]["assignee_user_ids"]
    assert w["step"] == "assignee"

    # 2. Individual Toggle Off (Dev Beta)
    mock_query.data = f"w:t:asgn:{member2_id.hex}"
    with patch("app.modules.projects.membership.project_people", return_value=mock_members):
        handled = await TelegramWizardManager.handle_callback(mock_db, test_pm_user, chat_id, mock_query)
        assert handled is True

    w = get_wizard_data((await conversation_state_manager.get_state(chat_id)).pending_intent)
    assert len(w["data"]["assignee_user_ids"]) == 2
    assert str(member2_id) not in w["data"]["assignee_user_ids"]
    assert str(member1_id) in w["data"]["assignee_user_ids"]

    # 3. Individual Toggle On (Dev Beta)
    mock_db.get.return_value = DBUser(id=member2_id, first_name="Dev", last_name="Beta", email="beta@example.com")
    with patch("app.modules.projects.membership.project_people", return_value=mock_members):
        handled = await TelegramWizardManager.handle_callback(mock_db, test_pm_user, chat_id, mock_query)
        assert handled is True

    w = get_wizard_data((await conversation_state_manager.get_state(chat_id)).pending_intent)
    assert len(w["data"]["assignee_user_ids"]) == 3
    assert str(member2_id) in w["data"]["assignee_user_ids"]

    # 4. Text input "Dev Beta" toggles member off
    with patch("app.modules.projects.membership.project_people", return_value=mock_members):
        handled = await TelegramWizardManager.handle_text_input(mock_db, test_pm_user, chat_id, "Dev Beta", mock_message)
        assert handled is True

    w = get_wizard_data((await conversation_state_manager.get_state(chat_id)).pending_intent)
    assert str(member2_id) not in w["data"]["assignee_user_ids"]

    # 5. Confirm and Next advances to 'due_date'
    mock_query.data = "w:t:asgn_done"
    with patch("app.modules.projects.membership.project_people", return_value=mock_members):
        handled = await TelegramWizardManager.handle_callback(mock_db, test_pm_user, chat_id, mock_query)
        assert handled is True

    w = get_wizard_data((await conversation_state_manager.get_state(chat_id)).pending_intent)
    assert w["step"] == "due_date"
