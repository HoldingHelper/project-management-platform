"""Strawberry GraphQL output types for Project Management Platform."""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from uuid import UUID

import strawberry


@strawberry.type
class UserType:
    id: UUID
    email: str
    full_name: str
    roles: List[str]


@strawberry.type
class TaskType:
    id: UUID
    phase_id: Optional[UUID]
    parent_task_id: Optional[UUID]
    title: str
    description: Optional[str]
    status: str
    priority: str
    created_at: datetime
    is_ticket: bool = False
    ticket_requested_by_user_id: Optional[UUID] = None


@strawberry.type
class ProjectType:
    id: UUID
    name: str
    description: Optional[str]
    status: str
    key: Optional[str]
    created_at: datetime


@strawberry.type
class DocSpaceType:
    id: UUID
    name: str
    slug: str
    description: Optional[str]
    icon: Optional[str]
    visibility: str


@strawberry.type
class DocPageType:
    id: UUID
    space_id: UUID
    title: str
    slug: str
    excerpt: Optional[str]
    content: str
    status: str
    created_at: datetime


@strawberry.type
class MeetingType:
    id: UUID
    title: str
    start_time: datetime
    end_time: datetime
    meet_url: Optional[str]
    html_link: Optional[str]
    starts_in_minutes: int
    is_now: bool


@strawberry.type
class AutomationRuleType:
    id: UUID
    name: str
    trigger_type: str
    action_type: str
    is_active: bool
    created_at: datetime


@strawberry.type
class DiagramResultType:
    page_id: Optional[UUID]
    title: str
    diagram_type: str
    svg_content: str
    page_slug: Optional[str]
