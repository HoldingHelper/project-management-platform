from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest

from app.core.current_user import CurrentUser
from app.modules.telegram.executor import CommandExecutor
from app.modules.telegram.schemas import SearchDocsIntent
from app.modules.telegram.handlers.callbacks import handle_document_download


@pytest.mark.asyncio
async def test_docs_search_only_offers_enabled_files():
    actor = CurrentUser(uuid4(), "owner@example.com", "Owner", ["SuperAdmin"], [])
    page = SimpleNamespace(id=uuid4(), title="Guide")
    enabled = SimpleNamespace(id=uuid4(), file_name="allowed.pdf", download_share_enabled=True, stored=True)
    denied = SimpleNamespace(id=uuid4(), file_name="private.pdf", download_share_enabled=False, stored=True)
    with patch("app.modules.telegram.executor.docs_service.search_pages", AsyncMock(return_value=[page])), patch("app.modules.telegram.executor.docs_service.list_attachments", AsyncMock(return_value=[enabled, denied])):
        result = await CommandExecutor(AsyncMock(), actor, 1)._search_docs(SearchDocsIntent(query="guide", raw_query="guide", language="en"))
    buttons = [button for row in result.reply_markup.inline_keyboard for button in row]
    assert any(button.callback_data == f"docsfile:{enabled.id}" for button in buttons)
    assert not any(button.callback_data == f"docsfile:{denied.id}" for button in buttons)
    assert "cannot be sent through telegram" in result.text.lower()


@pytest.mark.asyncio
async def test_telegram_callback_rechecks_revoked_permission():
    actor = CurrentUser(uuid4(), "owner@example.com", "Owner", ["SuperAdmin"], [])
    query = SimpleNamespace(data=f"docsfile:{uuid4()}", from_user=SimpleNamespace(id=1, language_code="en"), message=AsyncMock(), answer=AsyncMock())
    attachment = SimpleNamespace(storage_key="file", file_name="private.pdf")
    source = SimpleNamespace(download_share_enabled=False)
    with patch("app.modules.telegram.handlers.callbacks.AsyncSessionLocal") as session, patch("app.modules.telegram.handlers.callbacks.get_user_language", AsyncMock(return_value="en")), patch("app.modules.telegram.handlers.callbacks.resolve_telegram_user", AsyncMock(return_value=(object(), actor))), patch("app.modules.collaboration.sharing.doc_attachment", AsyncMock(return_value=(attachment, source))), patch("app.core.storage.file_storage_service.download_async", AsyncMock()) as download:
        session.return_value.__aenter__.return_value = AsyncMock()
        await handle_document_download(query)
    download.assert_not_awaited()
    query.message.answer_document.assert_not_awaited()
    assert query.answer.call_args.kwargs["show_alert"]
