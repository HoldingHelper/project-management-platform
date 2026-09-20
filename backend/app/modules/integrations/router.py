"""FastAPI router for user-level third-party integrations:
GitHub OAuth & Mention Resolver, Telegram Bot, Google Drive & Calendar, WhatsApp.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.current_user import CurrentUser
from app.core.database import get_db
from app.core.deps import get_current_user
from app.modules.integrations import user_service
from app.modules.integrations.schemas import (
    DriveOAuthCallbackRequest,
    GitHubIssueOrPRItem,
    GitHubMentionResolved,
    GitHubOAuthCallbackRequest,
    GitHubRepoItem,
    IntegrationsStatusResponse,
    TelegramLinkCodeResponse,
    TelegramTestResponse,
)

integrations_router = APIRouter(prefix="/integrations", tags=["User Integrations Hub"])


# --- Unified Status ---------------------------------------------------------
@integrations_router.get("/status", response_model=IntegrationsStatusResponse)
async def get_integrations_status(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> IntegrationsStatusResponse:
    """Return live connection status for all third-party integrations."""
    return await user_service.get_all_integrations_status(db, current_user.user_id)


# --- GitHub User OAuth & Mention Resolver -----------------------------------
@integrations_router.get("/github/auth-url")
async def get_github_auth_url(
    redirect_uri: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_user),
) -> Dict[str, str]:
    """Generate GitHub OAuth consent URL with state identifying the user."""
    url = user_service.get_github_oauth_url(current_user.user_id, redirect_uri)
    return {"url": url}


@integrations_router.post("/github/callback", response_model=Dict[str, Any])
async def connect_github_callback(
    payload: GitHubOAuthCallbackRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """Exchange GitHub OAuth code for access token and persist user connection."""
    conn = await user_service.connect_github_oauth(db, current_user.user_id, payload.code)
    return {
        "status": "connected",
        "github_username": conn.github_username,
        "avatar_url": conn.avatar_url,
    }


@integrations_router.delete(
    "/github/disconnect",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def disconnect_github(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Disconnect user's GitHub OAuth profile."""
    await user_service.disconnect_github(db, current_user.user_id)


@integrations_router.get("/github/user-repos", response_model=List[GitHubRepoItem])
async def list_user_github_repos(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[GitHubRepoItem]:
    """List accessible repositories (public and private) for the connected GitHub user."""
    return await user_service.list_user_github_repos(db, current_user.user_id)


@integrations_router.get("/github/issues-and-prs", response_model=List[GitHubIssueOrPRItem])
async def search_github_issues_and_prs(
    repo: str = Query(..., description="Repository full name, e.g. owner/repo"),
    q: Optional[str] = Query(None, description="Search filter query"),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[GitHubIssueOrPRItem]:
    """Search or list issues and pull requests in a repository for autocomplete mentions."""
    return await user_service.search_github_issues_and_prs(db, current_user.user_id, repo, q)


@integrations_router.get("/github/resolve-mention", response_model=GitHubMentionResolved)
async def resolve_github_mention(
    repo: str = Query(..., description="Repository full name, e.g. owner/repo"),
    number: int = Query(..., description="Issue or PR number"),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GitHubMentionResolved:
    """Resolve a GitHub issue or PR mention into live title, status, author, and URL."""
    return await user_service.resolve_github_mention(db, current_user.user_id, repo, number)


# --- Telegram Bot Integration -----------------------------------------------
@integrations_router.post("/telegram/link-code", response_model=TelegramLinkCodeResponse)
async def generate_telegram_link_code(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TelegramLinkCodeResponse:
    """Generate a one-time 8-char link code and deep link to the Telegram bot."""
    return await user_service.generate_telegram_link_code(db, current_user.user_id)


@integrations_router.post("/telegram/webhook")
async def telegram_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """Receive and process Telegram bot incoming updates and command handshakes."""
    body = await request.json()
    return await user_service.handle_telegram_webhook(db, body)


@integrations_router.delete(
    "/telegram/disconnect",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def disconnect_telegram(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Disconnect user's Telegram bot connection."""
    await user_service.disconnect_telegram(db, current_user.user_id)


@integrations_router.post("/telegram/test", response_model=TelegramTestResponse)
async def send_telegram_test(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TelegramTestResponse:
    """Dispatch a test notification to the user's connected Telegram chat."""
    return await user_service.send_telegram_test_notification(db, current_user.user_id)


# --- Google Drive Integration -----------------------------------------------
@integrations_router.get("/drive/auth-url")
async def get_drive_auth_url(
    current_user: CurrentUser = Depends(get_current_user),
) -> Dict[str, str]:
    """Generate Google Drive consent URL with state identifying user."""
    url = user_service.get_drive_auth_url(current_user.user_id)
    return {"url": url}


@integrations_router.post("/drive/callback", response_model=Dict[str, Any])
async def connect_drive_callback(
    payload: DriveOAuthCallbackRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """Exchange Drive OAuth code and persist connection."""
    conn = await user_service.connect_drive_oauth(db, current_user.user_id, payload.code)
    return {"status": "connected", "email": conn.google_email}


@integrations_router.delete(
    "/drive/disconnect",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def disconnect_drive(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Disconnect Google Drive."""
    await user_service.disconnect_drive(db, current_user.user_id)
