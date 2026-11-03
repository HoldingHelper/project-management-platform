"""Unit tests for Telegram task assignment notifications and file attachments handling."""

from __future__ import annotations

import io
from datetime import date
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import pytest
from aiogram.types import BufferedInputFile, Document, Message, PhotoSize, Voice

from app.core.current_user import CurrentUser
from app.core.permissions import Permissions
from app.modules.collaboration.models import FileAttachment
from app.modules.integrations.models import UserTelegramConnection
from app.modules.projects.enums import Priority, TaskStatus, TaskType
from app.modules.projects.models import Phase, Product, Project, TaskItem
from app.modules.telegram.handlers.files import handle_incoming_file
from app.modules.telegram.notifications import (
    build_assigned_task_keyboard,
    format_task_assigned_notification,
    send_task_assignment_telegram_notification,
)
from app.modules.telegram.state import conversation_state_manager
from app.modules.telegram.wizard import (
    TelegramWizardManager,
    get_wizard_data,
    save_wizard_data,
)
from app.shared.events import TaskAssigned


@pytest.fixture
def sample_task():
    task = SimpleNamespace(
        id=uuid4(),
        title="Fix Payment Gateway Timeout",
        description="Investigate the connection pool timeout occurring on checkout.",
        priority=Priority.P0,
        status=TaskStatus.READY,
        task_type=TaskType.BUG,
        phase_id=uuid4(),
        created_by_user_id=uuid4(),
        due_date=date(2026, 11, 10),
        start_date=date(2026, 11, 1),
        story_points=5,
        partition="tech",
        labels=[SimpleNamespace(name="backend"), SimpleNamespace(name="urgent")],
        checklist_items=[
            SimpleNamespace(text="Review logs", is_done=True),
            SimpleNamespace(text="Update pool config", is_done=False),
        ],
    )
    return task


def test_format_task_assigned_notification_persian(sample_task):
    """Test Persian formatting includes all fields, checklist summary, and attachments notice."""
    text = format_task_assigned_notification(
        task=sample_task,
        project_name="Core Banking",
        product_name="Fintech Platform",
        phase_name="Sprint 4",
        assigner_name="Hossein Fakhraei",
        attachments_count=2,
        lang="fa",
    )

    assert "📌 <b>یک Task جدید به شما Assign شد</b>" in text
    assert "Fix Payment Gateway Timeout" in text
    assert "Core Banking" in text
    assert "Fintech Platform" in text
    assert "Sprint 4" in text
    assert "P0 - بحرانی" in text
    assert "Hossein Fakhraei" in text
    assert "2026-11-10" in text
    assert "2026-11-01" in text
    assert "5" in text
    assert "backend, urgent" in text
    assert "1 از 2 مورد تکمیل شده" in text
    assert "Review logs" in text
    assert "Update pool config" in text
    assert "Investigate the connection pool timeout" in text
    assert "2 فایل" in text


def test_format_task_assigned_notification_english(sample_task):
    """Test English formatting includes all fields and action text."""
    text = format_task_assigned_notification(
        task=sample_task,
        project_name="Core Banking",
        product_name="Fintech Platform",
        phase_name="Sprint 4",
        assigner_name="Hossein Fakhraei",
        attachments_count=0,
        lang="en",
    )

    assert "📌 <b>A new Task was assigned to you</b>" in text
    assert "Title:</b> Fix Payment Gateway Timeout" in text
    assert "Core Banking" in text
    assert "Fintech Platform" in text
    assert "Critical" in text
    assert "Assigned By:</b> Hossein Fakhraei" in text
    assert "1/2 completed" in text


def test_build_assigned_task_keyboard():
    """Verify inline keyboard action buttons for fa and en."""
    task_id = uuid4()
    kb_fa = build_assigned_task_keyboard(task_id, lang="fa")
    flat_fa = [btn for row in kb_fa.inline_keyboard for btn in row]
    assert any(btn.callback_data == f"task_act:view:{task_id}" for btn in flat_fa)
    assert any(btn.callback_data == f"task_st:{task_id}:InProgress" for btn in flat_fa)
    assert any(btn.callback_data == f"task_st:{task_id}:Done" for btn in flat_fa)
    assert any(btn.callback_data == f"task_act:comment:{task_id}" for btn in flat_fa)
    assert any(btn.callback_data == f"task_act:attach:{task_id}" for btn in flat_fa)

    kb_en = build_assigned_task_keyboard(task_id, lang="en")
    flat_en = [btn for row in kb_en.inline_keyboard for btn in row]
    assert any("View Task" in btn.text for btn in flat_en)
    assert any("Start" in btn.text for btn in flat_en)


@pytest.mark.asyncio
async def test_send_task_assignment_telegram_notification_success(sample_task):
    """Event handler sends rich notification to connected assignee."""
    assignee_id = uuid4()
    assigner_id = sample_task.created_by_user_id
    chat_id = 987654321

    event = TaskAssigned(
        task_id=sample_task.id,
        assignee_user_ids=[assignee_id],
        requested_by_user_id=assigner_id,
        project_name="Core Banking",
    )

    mock_bot = AsyncMock()
    mock_db = AsyncMock()

    # Mock Task Item retrieval
    mock_phase = SimpleNamespace(name="Sprint 4", project_id=uuid4())
    mock_project = SimpleNamespace(name="Core Banking", product_id=uuid4())
    mock_product = SimpleNamespace(name="Fintech")
    mock_assigner = SimpleNamespace(full_name="Hossein Fakhraei", email="hossein@test.com")

    async def mock_get(model, pk):
        if model == Phase:
            return mock_phase
        if model == Project:
            return mock_project
        if model == Product:
            return mock_product
        return mock_assigner

    mock_db.get.side_effect = mock_get

    # Mock UserTelegramConnection query
    mock_conn = SimpleNamespace(
        user_id=assignee_id,
        is_connected=True,
        notify_tasks=True,
        telegram_chat_id=chat_id,
    )
    mock_exec_res = MagicMock()
    mock_exec_res.scalar_one_or_none.return_value = mock_conn
    mock_db.execute.return_value = mock_exec_res

    # Mock empty attachments
    with patch("app.modules.telegram.notifications.get_bot", return_value=mock_bot), \
         patch("app.modules.telegram.notifications.AsyncSessionLocal") as mock_session_local, \
         patch("app.modules.telegram.notifications.projects_repo.get_task", AsyncMock(return_value=sample_task)), \
         patch("app.modules.telegram.notifications.collab_repo.list_file_attachments", AsyncMock(return_value=[])), \
         patch("app.modules.telegram.notifications.get_user_language", AsyncMock(return_value="fa")):

        mock_session_local.return_value.__aenter__.return_value = mock_db
        mock_session_local.return_value.__aexit__.return_value = None

        await send_task_assignment_telegram_notification(event)

        # Assert notification was sent
        assert mock_bot.send_message.called
        call_kwargs = mock_bot.send_message.call_args.kwargs
        assert call_kwargs["chat_id"] == chat_id
        assert "Fix Payment Gateway Timeout" in call_kwargs["text"]
        assert "Core Banking" in call_kwargs["text"]
        assert call_kwargs["reply_markup"] is not None


@pytest.mark.asyncio
async def test_send_task_assignment_with_attachments(sample_task):
    """Attachments (voice, photo, document) are downloaded and sent to assignee."""
    assignee_id = uuid4()
    chat_id = 123456789

    event = TaskAssigned(
        task_id=sample_task.id,
        assignee_user_ids=[assignee_id],
        requested_by_user_id=sample_task.created_by_user_id,
    )

    mock_bot = AsyncMock()
    mock_db = AsyncMock()
    mock_db.get.return_value = None

    mock_conn = SimpleNamespace(
        user_id=assignee_id,
        is_connected=True,
        notify_tasks=True,
        telegram_chat_id=chat_id,
    )
    mock_exec_res = MagicMock()
    mock_exec_res.scalar_one_or_none.return_value = mock_conn
    mock_db.execute.return_value = mock_exec_res

    # Mock 3 attachments: voice (.ogg), photo (.png), document (.pdf)
    att_voice = SimpleNamespace(
        id=uuid4(),
        storage_key="tasks/voice.ogg",
        file_name="voice_20261101.ogg",
        content_type="audio/ogg",
        download_share_enabled=True,
    )
    att_photo = SimpleNamespace(
        id=uuid4(),
        storage_key="tasks/screenshot.png",
        file_name="screenshot.png",
        content_type="image/png",
        download_share_enabled=True,
    )
    att_doc = SimpleNamespace(
        id=uuid4(),
        storage_key="tasks/spec.pdf",
        file_name="spec.pdf",
        content_type="application/pdf",
        download_share_enabled=True,
    )
    blocked = SimpleNamespace(id=uuid4(), storage_key="tasks/private.pdf", file_name="private.pdf", content_type="application/pdf", download_share_enabled=False)

    with patch("app.modules.telegram.notifications.get_bot", return_value=mock_bot), \
         patch("app.modules.telegram.notifications.AsyncSessionLocal") as mock_session_local, \
         patch("app.modules.telegram.notifications.projects_repo.get_task", AsyncMock(return_value=sample_task)), \
         patch("app.modules.telegram.notifications.collab_repo.list_file_attachments", AsyncMock(return_value=[att_voice, att_photo, att_doc, blocked])), \
         patch("app.modules.telegram.notifications.file_storage_service.download_async", AsyncMock(return_value=b"fake-bytes")) as download_mock, \
         patch("app.modules.docs.lifecycle.visible_upload", AsyncMock(return_value=True)), \
         patch("app.modules.telegram.notifications.get_user_language", AsyncMock(return_value="fa")):

        mock_session_local.return_value.__aenter__.return_value = mock_db
        mock_session_local.return_value.__aexit__.return_value = None

        await send_task_assignment_telegram_notification(event)

        assert mock_bot.send_message.called
        assert mock_bot.send_voice.called
        assert mock_bot.send_photo.called
        assert mock_bot.send_document.called
        assert download_mock.await_count == 3
        assert "1 فایل" in mock_bot.send_message.call_args.kwargs["text"]


@pytest.mark.asyncio
async def test_send_task_assignment_no_telegram_connection(sample_task):
    """If user has no active Telegram connection, gracefully skips without error."""
    assignee_id = uuid4()
    event = TaskAssigned(
        task_id=sample_task.id,
        assignee_user_ids=[assignee_id],
    )

    mock_bot = AsyncMock()
    mock_db = AsyncMock()
    mock_exec_res = MagicMock()
    mock_exec_res.scalar_one_or_none.return_value = None
    mock_db.execute.return_value = mock_exec_res

    with patch("app.modules.telegram.notifications.get_bot", return_value=mock_bot), \
         patch("app.modules.telegram.notifications.AsyncSessionLocal") as mock_session_local, \
         patch("app.modules.telegram.notifications.projects_repo.get_task", AsyncMock(return_value=sample_task)):

        mock_session_local.return_value.__aenter__.return_value = mock_db
        mock_session_local.return_value.__aexit__.return_value = None

        await send_task_assignment_telegram_notification(event)
        assert not mock_bot.send_message.called


@pytest.mark.asyncio
async def test_send_task_assignment_error_resilience(sample_task):
    """If bot fails to send, exception is logged and not raised, preventing rollback."""
    assignee_id = uuid4()
    event = TaskAssigned(
        task_id=sample_task.id,
        assignee_user_ids=[assignee_id],
    )

    mock_bot = AsyncMock()
    mock_bot.send_message.side_effect = RuntimeError("Telegram Network Timeout")
    mock_db = AsyncMock()

    mock_conn = SimpleNamespace(
        user_id=assignee_id,
        is_connected=True,
        notify_tasks=True,
        telegram_chat_id=12345,
    )
    mock_exec_res = MagicMock()
    mock_exec_res.scalar_one_or_none.return_value = mock_conn
    mock_db.execute.return_value = mock_exec_res

    with patch("app.modules.telegram.notifications.get_bot", return_value=mock_bot), \
         patch("app.modules.telegram.notifications.AsyncSessionLocal") as mock_session_local, \
         patch("app.modules.telegram.notifications.projects_repo.get_task", AsyncMock(return_value=sample_task)), \
         patch("app.modules.telegram.notifications.collab_repo.list_file_attachments", AsyncMock(return_value=[])):

        mock_session_local.return_value.__aenter__.return_value = mock_db
        mock_session_local.return_value.__aexit__.return_value = None

        # Must not raise
        await send_task_assignment_telegram_notification(event)


@pytest.mark.asyncio
async def test_files_handler_saves_to_wizard_draft():
    """Sending a document while in an active wizard saves draft in MinIO and wizard state."""
    chat_id = 999888
    user_id = uuid4()
    current_user = CurrentUser(
        user_id=user_id,
        email="test@example.com",
        full_name="Tester",
        roles=["developer"],
        permissions=[Permissions.TASKS_VIEW, Permissions.TASKS_UPLOAD_FILES],
        allow_role_bypass=True,
    )

    # Initialize wizard
    wizard_state = {
        "type": "wizard",
        "wizard_type": "task",
        "lang": "fa",
        "step": "checklist",
        "history": ["project", "phase", "title"],
        "is_editing": False,
        "editing_field": None,
        "data": {
            "title": "Build Cache Layer",
            "draft_attachments": [],
        },
    }
    await save_wizard_data(chat_id, wizard_state)

    mock_doc = MagicMock(spec=Document)
    mock_doc.file_id = "doc123"
    mock_doc.file_name = "architecture.pdf"
    mock_doc.mime_type = "application/pdf"
    mock_doc.file_size = 1024 * 50

    mock_msg = AsyncMock()
    mock_msg.chat = MagicMock(id=chat_id)
    mock_msg.from_user = MagicMock(id=chat_id)
    mock_msg.document = mock_doc
    mock_msg.photo = None
    mock_msg.voice = None
    mock_msg.audio = None

    mock_bot = AsyncMock()
    mock_bot.download.return_value = io.BytesIO(b"dummy pdf bytes")

    with patch("app.modules.telegram.handlers.files.AsyncSessionLocal") as mock_session_local, \
         patch("app.modules.telegram.handlers.files.resolve_telegram_user", AsyncMock(return_value=(MagicMock(), current_user))), \
         patch("app.modules.telegram.handlers.files.file_storage_service.upload_async", AsyncMock()):

        mock_db = AsyncMock()
        mock_session_local.return_value.__aenter__.return_value = mock_db
        mock_session_local.return_value.__aexit__.return_value = None

        await handle_incoming_file(mock_msg, mock_bot)

        w = get_wizard_data((await conversation_state_manager.get_state(chat_id)).pending_intent)
        assert len(w["data"]["draft_attachments"]) == 1
        assert w["data"]["draft_attachments"][0]["file_name"] == "architecture.pdf"
        assert w["step"] == "attachments"
        assert mock_msg.reply.called or mock_msg.answer.called


@pytest.mark.asyncio
async def test_files_handler_rejects_oversized_file():
    """File exceeding 25MB is rejected."""
    chat_id = 999888
    user_id = uuid4()
    current_user = CurrentUser(
        user_id=user_id,
        email="test@example.com",
        full_name="Tester",
        roles=["developer"],
        permissions=[Permissions.TASKS_VIEW, Permissions.TASKS_UPLOAD_FILES],
        allow_role_bypass=True,
    )

    mock_doc = MagicMock(spec=Document)
    mock_doc.file_id = "huge123"
    mock_doc.file_name = "huge_dump.zip"
    mock_doc.mime_type = "application/zip"
    mock_doc.file_size = 30 * 1024 * 1024  # 30MB

    mock_msg = AsyncMock()
    mock_msg.chat = MagicMock(id=chat_id)
    mock_msg.from_user = MagicMock(id=chat_id)
    mock_msg.document = mock_doc
    mock_msg.photo = None
    mock_msg.voice = None
    mock_msg.audio = None

    mock_bot = AsyncMock()

    with patch("app.modules.telegram.handlers.files.AsyncSessionLocal") as mock_session_local, \
         patch("app.modules.telegram.handlers.files.resolve_telegram_user", AsyncMock(return_value=(MagicMock(), current_user))):

        mock_db = AsyncMock()
        mock_session_local.return_value.__aenter__.return_value = mock_db
        mock_session_local.return_value.__aexit__.return_value = None

        await handle_incoming_file(mock_msg, mock_bot)

        assert mock_msg.reply.called or mock_msg.answer.called
        reply_txt = mock_msg.answer.call_args[0][0]
        assert "۲۵" in reply_txt or "25" in reply_txt
