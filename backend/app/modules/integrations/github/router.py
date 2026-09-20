"""FastAPI router for GitHub organization webhooks and repository linkages."""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.current_user import CurrentUser
from app.core.database import get_db
from app.core.deps import get_current_user
from app.modules.integrations.github import service
from app.modules.integrations.models import GitHubPullRequestLink, GitHubRepositoryLink

github_router = APIRouter(prefix="/integrations/github", tags=["GitHub Integration"])


class GitHubRepoConfig(BaseModel):
    repo_owner: str
    repo_name: str
    default_project_id: Optional[UUID] = None
    default_phase_id: Optional[UUID] = None
    auto_create_tasks: bool = True
    auto_close_tasks_on_merge: bool = True


@github_router.post("/webhook", status_code=status.HTTP_200_OK)
async def github_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
    x_github_event: Optional[str] = Header(None, alias="X-GitHub-Event"),
    x_hub_signature_256: Optional[str] = Header(None, alias="X-Hub-Signature-256"),
) -> Dict[str, Any]:
    """Receive and process GitHub organization webhooks."""
    body_bytes = await request.body()
    if not service.verify_github_signature(body_bytes, x_hub_signature_256):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid GitHub webhook signature.",
        )

    try:
        payload = json.loads(body_bytes.decode())
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid JSON payload.",
        )

    event_type = x_github_event or "unknown"
    return await service.handle_github_webhook_event(db, event_type, payload)


@github_router.get("/repos")
async def list_github_repos(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[Dict[str, Any]]:
    """List configured GitHub repository integrations."""
    result = await db.execute(select(GitHubRepositoryLink))
    repos = result.scalars().all()
    return [
        {
            "id": str(r.id),
            "repo_owner": r.repo_owner,
            "repo_name": r.repo_name,
            "default_project_id": str(r.default_project_id) if r.default_project_id else None,
            "default_phase_id": str(r.default_phase_id) if r.default_phase_id else None,
            "auto_create_tasks": r.auto_create_tasks,
            "auto_close_tasks_on_merge": r.auto_close_tasks_on_merge,
            "created_at": r.created_at.isoformat(),
        }
        for r in repos
    ]


@github_router.post("/repos")
async def configure_github_repo(
    payload: GitHubRepoConfig,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """Configure or link a GitHub repository to a project."""
    existing = await db.execute(
        select(GitHubRepositoryLink).where(
            GitHubRepositoryLink.repo_owner == payload.repo_owner,
            GitHubRepositoryLink.repo_name == payload.repo_name,
        )
    )
    repo_link = existing.scalar_one_or_none()
    if not repo_link:
        repo_link = GitHubRepositoryLink(
            repo_owner=payload.repo_owner,
            repo_name=payload.repo_name,
            default_project_id=payload.default_project_id,
            default_phase_id=payload.default_phase_id,
            auto_create_tasks=payload.auto_create_tasks,
            auto_close_tasks_on_merge=payload.auto_close_tasks_on_merge,
        )
        db.add(repo_link)
    else:
        repo_link.default_project_id = payload.default_project_id
        repo_link.default_phase_id = payload.default_phase_id
        repo_link.auto_create_tasks = payload.auto_create_tasks
        repo_link.auto_close_tasks_on_merge = payload.auto_close_tasks_on_merge

    await db.commit()
    await db.refresh(repo_link)
    return {"status": "ok", "id": str(repo_link.id)}
