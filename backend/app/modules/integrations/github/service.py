"""GitHub organization webhook and pull request automation service."""

from __future__ import annotations

import hashlib
import hmac
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID

import structlog
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.events import event_bus
from app.core.exceptions import UnauthorizedError, ValidationAppError
from app.modules.collaboration.models import Comment
from app.modules.identity.models import User
from app.modules.integrations.models import GitHubPullRequestLink, GitHubRepositoryLink
from app.modules.projects.models import Project, TaskItem as Task
from app.shared.base_model import utcnow
from app.shared.events import NotificationRequested

logger = structlog.get_logger(__name__)

TASK_ID_REGEX = re.compile(
    r"(?:task[:\s#]|PMP-)?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})",
    re.IGNORECASE,
)


def verify_github_signature(payload_bytes: bytes, signature_header: Optional[str]) -> bool:
    """Verify GitHub HMAC-SHA256 signature."""
    settings = get_settings()
    secret = settings.github_webhook_secret
    if not secret:
        # If secret not configured on dev server, accept with warning
        return True

    if not signature_header or not signature_header.startswith("sha256="):
        return False

    expected_sig = hmac.new(
        secret.encode(), payload_bytes, hashlib.sha256
    ).hexdigest()
    received_sig = signature_header[len("sha256="):]
    return hmac.compare_digest(expected_sig, received_sig)


async def handle_github_webhook_event(
    db: AsyncSession,
    event_type: str,
    payload: Dict[str, Any],
) -> Dict[str, Any]:
    """Process incoming GitHub webhook event."""
    if event_type == "ping":
        return {"status": "ok", "message": "GitHub webhook ping acknowledged"}

    if event_type == "pull_request":
        return await _handle_pull_request_event(db, payload)

    return {"status": "ignored", "event_type": event_type}


async def _handle_pull_request_event(
    db: AsyncSession,
    payload: Dict[str, Any],
) -> Dict[str, Any]:
    """Handle pull_request lifecycle: opened, review_requested, closed (merged)."""
    action = payload.get("action")
    pr = payload.get("pull_request")
    repo_data = payload.get("repository") or {}

    if not pr:
        return {"status": "ignored", "reason": "no pull_request payload"}

    repo_full_name = repo_data.get("full_name", "")
    parts = repo_full_name.split("/")
    repo_owner = parts[0] if len(parts) > 0 else ""
    repo_name = parts[1] if len(parts) > 1 else ""

    pr_number = pr.get("number", 0)
    pr_title = pr.get("title", "")
    pr_body = pr.get("body") or ""
    pr_url = pr.get("html_url", "")
    pr_author = (pr.get("user") or {}).get("login", "")
    is_merged = pr.get("merged", False)

    # 1. Look for existing PR link
    result = await db.execute(
        select(GitHubPullRequestLink).where(
            GitHubPullRequestLink.repo_owner == repo_owner,
            GitHubPullRequestLink.repo_name == repo_name,
            GitHubPullRequestLink.pr_number == pr_number,
        )
    )
    pr_link = result.scalar_one_or_none()

    # 2. Check if a task ID is mentioned in PR title or body
    match = TASK_ID_REGEX.search(f"{pr_title} {pr_body} {pr.get('head', {}).get('ref', '')}")
    matched_task_id: Optional[UUID] = None
    if match:
        try:
            matched_task_id = UUID(match.group(1))
        except ValueError:
            pass

    # 3. If action is 'opened', link or auto-create task
    if action == "opened":
        target_task_id = matched_task_id

        if not target_task_id:
            # Check if repo has default project configuration
            repo_link_res = await db.execute(
                select(GitHubRepositoryLink).where(
                    GitHubRepositoryLink.repo_owner == repo_owner,
                    GitHubRepositoryLink.repo_name == repo_name,
                )
            )
            repo_link = repo_link_res.scalar_one_or_none()

            # Find matching user by github_username if possible
            user_res = await db.execute(
                select(User).where(User.github_username == pr_author)
            )
            matched_user = user_res.scalar_one_or_none()

            if not matched_user:
                # Fallback to first active admin
                admin_res = await db.execute(
                    select(User).where(User.is_active.is_(True)).limit(1)
                )
                matched_user = admin_res.scalar_one_or_none()

            if matched_user:
                # Create a task in default project or first available project
                project_id = repo_link.default_project_id if repo_link else None
                phase_id = repo_link.default_phase_id if repo_link else None

                if not project_id:
                    p_res = await db.execute(select(Project.id).limit(1))
                    project_id = p_res.scalar_one_or_none()

                if project_id:
                    new_task = Task(
                        project_id=project_id,
                        phase_id=phase_id,
                        title=f"[PR #{pr_number}] {pr_title}",
                        description=f"GitHub Pull Request: {pr_url}\nAuthor: @{pr_author}\n\n{pr_body}",
                        status="in_progress",
                        priority="medium",
                        created_by_user_id=matched_user.id,
                    )
                    db.add(new_task)
                    await db.flush()
                    target_task_id = new_task.id

        if target_task_id:
            if not pr_link:
                pr_link = GitHubPullRequestLink(
                    repo_owner=repo_owner,
                    repo_name=repo_name,
                    pr_number=pr_number,
                    pr_title=pr_title,
                    pr_url=pr_url,
                    pr_author=pr_author,
                    pr_status="open",
                    task_id=target_task_id,
                )
                db.add(pr_link)
            else:
                pr_link.task_id = target_task_id
                pr_link.pr_status = "open"
            await db.commit()
            return {"status": "linked", "task_id": str(target_task_id), "pr_number": pr_number}

    # 4. If review requested -> update task to 'review'
    elif action in ("review_requested", "ready_for_review"):
        if pr_link:
            pr_link.pr_status = "review_requested"
            await db.execute(
                update(Task)
                .where(Task.id == pr_link.task_id)
                .values(status="review")
            )
            await db.commit()
            return {"status": "status_updated_to_review", "task_id": str(pr_link.task_id)}

    # 5. If closed and merged -> update task to 'done' and post celebration comment
    elif action == "closed" and is_merged:
        if pr_link:
            pr_link.pr_status = "merged"
            pr_link.merged_at = utcnow()

            # Mark task done
            await db.execute(
                update(Task)
                .where(Task.id == pr_link.task_id)
                .values(status="done")
            )

            # Post completion comment
            comment = Comment(
                entity_type="task",
                entity_id=pr_link.task_id,
                author_user_id=UUID("00000000-0000-0000-0000-000000000000"),  # System bot
                body=f"🚀 **GitHub PR #{pr_number} Merged!**\nPR [{pr_title}]({pr_url}) was merged into `{pr.get('base', {}).get('ref', 'main')}` by @{pr_author}. Task marked as **Done**.",
            )
            db.add(comment)
            await db.commit()

            return {
                "status": "task_marked_done",
                "task_id": str(pr_link.task_id),
                "pr_number": pr_number,
            }

    return {"status": "processed", "action": action}
