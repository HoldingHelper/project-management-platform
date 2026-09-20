"""Unit tests for GitHub webhook and PR automation workflows."""

from __future__ import annotations

import pytest
from uuid import uuid4

from app.core.config import get_settings
from app.modules.integrations.github.service import (
    handle_github_webhook_event,
    verify_github_signature,
)
from app.modules.integrations.models import GitHubPullRequestLink
from app.modules.projects.models import TaskItem as Task


def test_verify_github_signature(monkeypatch):
    monkeypatch.setattr(get_settings(), "github_webhook_secret", "my-secret-key")

    payload = b'{"action": "ping"}'
    # Valid signature for '{"action": "ping"}' with secret 'my-secret-key'
    import hmac, hashlib
    expected_sig = "sha256=" + hmac.new(b"my-secret-key", payload, hashlib.sha256).hexdigest()

    assert verify_github_signature(payload, expected_sig) is True
    assert verify_github_signature(payload, "sha256=invalid") is False
    assert verify_github_signature(payload, None) is False


@pytest.mark.asyncio
async def test_github_pr_closed_merged_marks_task_done(monkeypatch):
    task_id = uuid4()
    mock_link = GitHubPullRequestLink(
        repo_owner="Project Management Platform",
        repo_name="project-management-app",
        pr_number=42,
        pr_title="feat: add graphql engine",
        pr_url="https://github.com/ali-Eskandarian/project-management-platform/pull/42",
        pr_author="octocat",
        pr_status="open",
        task_id=task_id,
    )

    class MockAsyncSession:
        def __init__(self):
            self.added = []
            self.committed = False

        async def execute(self, stmt):
            class MockResult:
                def scalar_one_or_none(self):
                    return mock_link
            return MockResult()

        def add(self, obj):
            self.added.append(obj)

        async def commit(self):
            self.committed = True

    mock_db = MockAsyncSession()

    payload = {
        "action": "closed",
        "repository": {"full_name": "ali-Eskandarian/project-management-platform"},
        "pull_request": {
            "number": 42,
            "title": "feat: add graphql engine",
            "html_url": "https://github.com/ali-Eskandarian/project-management-platform/pull/42",
            "user": {"login": "octocat"},
            "merged": True,
            "base": {"ref": "dev"},
        },
    }

    res = await handle_github_webhook_event(mock_db, "pull_request", payload)  # type: ignore[arg-type]
    assert res["status"] == "task_marked_done"
    assert res["task_id"] == str(task_id)
    assert mock_link.pr_status == "merged"
    assert len(mock_db.added) == 1  # Completion comment added
