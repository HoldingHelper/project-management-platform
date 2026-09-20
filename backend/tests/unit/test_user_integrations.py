"""Unit tests for user-level OAuth integrations (GitHub mentions, Telegram, Drive, Status)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.integrations import user_service
from app.modules.integrations.models import (
    UserGitHubConnection,
    UserTelegramConnection,
)
from app.modules.integrations.schemas import (
    GitHubIssueOrPRItem,
    GitHubMentionResolved,
    GitHubOAuthCallbackRequest,
    GitHubRepoItem,
    IntegrationsStatusResponse,
    TelegramLinkCodeResponse,
)


def test_github_oauth_url_generation():
    uid = uuid4()
    url = user_service.get_github_oauth_url(uid, "http://localhost:3000/github/callback")
    assert "github.com/login/oauth/authorize" in url
    assert f"state={uid}" in url
    assert "scope=repo%2Cread%3Auser" in url or "scope=repo,read:user" in url


class MockAsyncSession:
    def __init__(self, data=None):
        self.data = data
        self.added = []

    def add(self, obj):
        self.added.append(obj)

    async def commit(self):
        pass

    async def refresh(self, obj):
        pass

    async def execute(self, stmt):
        class MockResult:
            def __init__(self, d):
                self.d = d

            def scalar_one_or_none(self):
                return self.d

            def scalars(self):
                class MockScalars:
                    def __init__(self, d):
                        self.d = d or []

                    def all(self):
                        return self.d
                return MockScalars(self.d if isinstance(self.d, list) else ([self.d] if self.d else []))

        return MockResult(self.data)


@pytest.mark.asyncio
async def test_search_and_resolve_github_mentions():
    uid = uuid4()
    mock_db = MockAsyncSession()

    # Search without query returns catalog
    items = await user_service.search_github_issues_and_prs(
        mock_db, uid, "ali-Eskandarian/project-management-platform"  # type: ignore
    )
    assert len(items) >= 4
    assert any(it.number == 42 for it in items)

    # Search with query
    filtered = await user_service.search_github_issues_and_prs(
        mock_db, uid, "ali-Eskandarian/project-management-platform", query="Biometric"  # type: ignore
    )
    assert len(filtered) == 1
    assert filtered[0].number == 42
    assert "Biometric" in filtered[0].title

    # Resolve mention
    resolved = await user_service.resolve_github_mention(
        mock_db, uid, "ali-Eskandarian/project-management-platform", 42  # type: ignore
    )
    assert resolved.number == 42
    assert resolved.state == "merged"
    assert resolved.type == "pull_request"
    assert "Biometric" in resolved.title


@pytest.mark.asyncio
async def test_telegram_link_code_and_webhook():
    uid = uuid4()
    mock_db = MockAsyncSession()

    link_info = await user_service.generate_telegram_link_code(mock_db, uid)  # type: ignore
    assert len(link_info.link_code) == 8
    assert "t.me" in link_info.deep_link
    assert link_info.link_code in link_info.deep_link

    # Webhook handling with simulated matching link connection
    mock_conn = UserTelegramConnection(
        user_id=uid,
        auth_link_code=link_info.link_code,
        auth_link_expires_at=datetime.now(timezone.utc) + timedelta(minutes=15),
        is_connected=False,
    )
    mock_db_with_conn = MockAsyncSession(data=mock_conn)

    webhook_payload = {
        "update_id": 123456,
        "message": {
            "chat": {"id": 987654321},
            "from": {"username": "pmp_developer_tg", "first_name": "Developer"},
            "text": f"/start {link_info.link_code}",
        },
    }

    result = await user_service.handle_telegram_webhook(mock_db_with_conn, webhook_payload)  # type: ignore
    assert result.get("status") == "connected"
    assert result.get("chat_id") == "987654321"


@pytest.mark.asyncio
async def test_unified_integrations_status():
    uid = uuid4()
    mock_db = MockAsyncSession()

    status_res = await user_service.get_all_integrations_status(mock_db, uid)  # type: ignore
    assert status_res.github.provider == "github"
    assert status_res.google_calendar.provider == "google_calendar"
    assert status_res.google_drive.provider == "google_drive"
    assert status_res.telegram.provider == "telegram"
    assert status_res.whatsapp.provider == "whatsapp"
