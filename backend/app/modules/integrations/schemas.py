"""Pydantic schemas for user-level third-party integrations."""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class IntegrationItemStatus(BaseModel):
    provider: str
    is_connected: bool = Field(default=False)
    account_name: Optional[str] = None
    account_id: Optional[str] = None
    avatar_url: Optional[str] = None
    last_synced_at: Optional[datetime] = None
    details: Optional[dict] = None

    model_config = ConfigDict(populate_by_name=True)


class IntegrationsStatusResponse(BaseModel):
    github: IntegrationItemStatus
    google_calendar: IntegrationItemStatus
    google_drive: IntegrationItemStatus
    telegram: IntegrationItemStatus
    whatsapp: IntegrationItemStatus


class GitHubOAuthCallbackRequest(BaseModel):
    code: str = Field(min_length=1)
    state: Optional[str] = None


class GitHubRepoItem(BaseModel):
    id: int
    name: str
    full_name: str
    owner: str
    is_private: bool
    description: Optional[str] = None
    html_url: str
    default_branch: str = "main"

    model_config = ConfigDict(populate_by_name=True)


class GitHubIssueOrPRItem(BaseModel):
    id: int
    number: int
    title: str
    type: str  # "issue" | "pull_request"
    state: str  # "open" | "closed" | "merged"
    author: str
    html_url: str
    labels: List[str] = Field(default_factory=list)
    created_at: str
    updated_at: str


class GitHubMentionResolveRequest(BaseModel):
    repo: str  # "owner/repo"
    number: int


class GitHubMentionResolved(BaseModel):
    repo: str
    number: int
    type: str  # "issue" | "pull_request"
    title: str
    state: str  # "open" | "closed" | "merged"
    author: str
    html_url: str
    labels: List[str] = Field(default_factory=list)


class TelegramLinkCodeResponse(BaseModel):
    link_code: str
    bot_username: str
    deep_link: str
    expires_at: datetime


class TelegramWebhookUpdate(BaseModel):
    update_id: int
    message: Optional[dict] = None


class TelegramTestResponse(BaseModel):
    success: bool
    chat_id: Optional[str] = None
    message: str


class DriveOAuthCallbackRequest(BaseModel):
    code: str = Field(min_length=1)
    state: Optional[str] = None
