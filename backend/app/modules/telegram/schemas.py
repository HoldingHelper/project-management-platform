"""Typed schemas and intent models for the PMP Telegram module."""

from __future__ import annotations

from datetime import date
from enum import Enum
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class IntentType(str, Enum):
    # Tasks
    CREATE_TASK = "create_task"
    VIEW_TASK = "view_task"
    LIST_TASKS = "list_tasks"
    SEARCH_TASKS = "search_tasks"
    UPDATE_TASK_STATUS = "update_task_status"
    ASSIGN_TASK = "assign_task"
    UNASSIGN_TASK = "unassign_task"
    UPDATE_TASK_DETAILS = "update_task_details"
    MOVE_TASK = "move_task"
    ADD_COMMENT = "add_comment"

    # Projects
    LIST_PROJECTS = "list_projects"
    SEARCH_PROJECTS = "search_projects"
    VIEW_PROJECT_STATUS = "view_project_status"
    CREATE_PROJECT = "create_project"
    UPDATE_PROJECT = "update_project"

    # Project Members
    LIST_PROJECT_MEMBERS = "list_project_members"
    ADD_PROJECT_MEMBER = "add_project_member"
    REMOVE_PROJECT_MEMBER = "remove_project_member"

    # Sprints
    LIST_SPRINTS = "list_sprints"
    VIEW_CURRENT_SPRINT = "view_current_sprint"
    CREATE_SPRINT = "create_sprint"
    CREATE_SPRINT_BATCH = "create_sprint_batch"

    # Tickets
    CREATE_TICKET = "create_ticket"

    # Milestones
    LIST_MILESTONES = "list_milestones"
    CREATE_MILESTONE = "create_milestone"

    # Docs & Diagrams
    SEARCH_DOCS = "search_docs"
    READ_DOC = "read_doc"
    CREATE_DIAGRAM = "create_diagram"

    # Analytics / Reports
    VIEW_ANALYTICS = "view_analytics"

    # Bot / Session control
    LINK_ACCOUNT = "link_account"
    HELP = "help"
    CANCEL = "cancel"
    CONFIRM_ACTION = "confirm_action"
    UNKNOWN = "unknown"


class BaseTelegramIntent(BaseModel):
    intent_type: IntentType
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    raw_query: str = ""
    language: str = "fa"  # "fa" | "en"


# --- Task Intents ------------------------------------------------------------

class CreateTaskIntent(BaseTelegramIntent):
    intent_type: IntentType = IntentType.CREATE_TASK
    title: str
    project_name: Optional[str] = None
    sprint_name: Optional[str] = None
    is_backlog: bool = False
    in_current_sprint: bool = False
    assignee_names: List[str] = Field(default_factory=list)
    priority: Optional[str] = None  # P0, P1, P2, P3
    task_type: Optional[str] = "Feature"
    labels: List[str] = Field(default_factory=list)
    checklist_items: List[str] = Field(default_factory=list)
    due_date: Optional[date] = None
    description: Optional[str] = None


class ViewTaskIntent(BaseTelegramIntent):
    intent_type: IntentType = IntentType.VIEW_TASK
    task_id_or_title: str


class SearchTasksIntent(BaseTelegramIntent):
    intent_type: IntentType = IntentType.SEARCH_TASKS
    query: Optional[str] = None
    project_name: Optional[str] = None
    sprint_name: Optional[str] = None
    assignee_name: Optional[str] = None
    team_name: Optional[str] = None
    status: Optional[str] = None
    is_my_tasks: bool = False
    is_overdue: bool = False
    in_current_sprint: bool = False
    limit: int = 10


class UpdateTaskStatusIntent(BaseTelegramIntent):
    intent_type: IntentType = IntentType.UPDATE_TASK_STATUS
    task_id_or_title: Optional[str] = None
    status: str  # e.g. "Done", "InProgress", "Ready", "Blocked", etc.


class AssignTaskIntent(BaseTelegramIntent):
    intent_type: IntentType = IntentType.ASSIGN_TASK
    task_id_or_title: Optional[str] = None
    assignee_names: List[str] = Field(default_factory=list)
    is_unassign: bool = False


class UpdateTaskDetailsIntent(BaseTelegramIntent):
    intent_type: IntentType = IntentType.UPDATE_TASK_DETAILS
    task_id_or_title: Optional[str] = None
    title: Optional[str] = None
    due_date: Optional[date] = None
    priority: Optional[str] = None
    description: Optional[str] = None
    add_labels: List[str] = Field(default_factory=list)
    add_checklist_items: List[str] = Field(default_factory=list)


class MoveTaskIntent(BaseTelegramIntent):
    intent_type: IntentType = IntentType.MOVE_TASK
    task_id_or_title: Optional[str] = None
    target_sprint_name_or_number: Optional[str] = None
    to_backlog: bool = False


class AddCommentIntent(BaseTelegramIntent):
    intent_type: IntentType = IntentType.ADD_COMMENT
    task_id_or_title: Optional[str] = None
    comment_text: str


# --- Project Intents ---------------------------------------------------------

class ListProjectsIntent(BaseTelegramIntent):
    intent_type: IntentType = IntentType.LIST_PROJECTS
    query: Optional[str] = None


class ViewProjectStatusIntent(BaseTelegramIntent):
    intent_type: IntentType = IntentType.VIEW_PROJECT_STATUS
    project_name: str


class CreateProjectIntent(BaseTelegramIntent):
    intent_type: IntentType = IntentType.CREATE_PROJECT
    name: str
    description: Optional[str] = None
    priority: Optional[str] = "P2"
    product_name: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None


class UpdateProjectIntent(BaseTelegramIntent):
    intent_type: IntentType = IntentType.UPDATE_PROJECT
    project_name: str
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    budget: Optional[float] = None


# --- Project Membership Intents ----------------------------------------------

class ListProjectMembersIntent(BaseTelegramIntent):
    intent_type: IntentType = IntentType.LIST_PROJECT_MEMBERS
    project_name: str


class AddProjectMemberIntent(BaseTelegramIntent):
    intent_type: IntentType = IntentType.ADD_PROJECT_MEMBER
    project_name: str
    user_name: str
    role: str = "Developer"


class RemoveProjectMemberIntent(BaseTelegramIntent):
    intent_type: IntentType = IntentType.REMOVE_PROJECT_MEMBER
    project_name: str
    user_name: str


# --- Sprint Intents ----------------------------------------------------------

class ListSprintsIntent(BaseTelegramIntent):
    intent_type: IntentType = IntentType.LIST_SPRINTS
    project_name: Optional[str] = None


class ViewCurrentSprintIntent(BaseTelegramIntent):
    intent_type: IntentType = IntentType.VIEW_CURRENT_SPRINT
    project_name: Optional[str] = None


class CreateSprintIntent(BaseTelegramIntent):
    intent_type: IntentType = IntentType.CREATE_SPRINT
    project_name: Optional[str] = None
    name: str
    duration_days: int = 14  # 3, 7, 14
    start_date: Optional[date] = None


class CreateSprintBatchIntent(BaseTelegramIntent):
    intent_type: IntentType = IntentType.CREATE_SPRINT_BATCH
    project_name: Optional[str] = None
    count: int = 5
    duration_days: int = 14  # 3, 7, 14
    start_date: Optional[date] = None
    name_prefix: str = "Sprint"


# --- Ticket Intents ----------------------------------------------------------

class CreateTicketIntent(BaseTelegramIntent):
    intent_type: IntentType = IntentType.CREATE_TICKET
    title: str
    description: Optional[str] = None
    recipient_team_names: List[str] = Field(default_factory=list)
    recipient_user_names: List[str] = Field(default_factory=list)
    priority: Optional[str] = "P2"


# --- Milestone Intents -------------------------------------------------------

class ListMilestonesIntent(BaseTelegramIntent):
    intent_type: IntentType = IntentType.LIST_MILESTONES
    project_name: str


class CreateMilestoneIntent(BaseTelegramIntent):
    intent_type: IntentType = IntentType.CREATE_MILESTONE
    project_name: str
    title: str
    due_date: Optional[date] = None
    description: Optional[str] = None


# --- Docs & Diagram Intents --------------------------------------------------

class SearchDocsIntent(BaseTelegramIntent):
    intent_type: IntentType = IntentType.SEARCH_DOCS
    query: str


class ReadDocIntent(BaseTelegramIntent):
    intent_type: IntentType = IntentType.READ_DOC
    title_or_slug: str


class CreateDiagramIntent(BaseTelegramIntent):
    intent_type: IntentType = IntentType.CREATE_DIAGRAM
    diagram_type: str = "architecture"  # architecture, sequence, flowchart, er
    title: str = "System Diagram"
    description: Optional[str] = None


# --- Analytics Intents -------------------------------------------------------

class ViewAnalyticsIntent(BaseTelegramIntent):
    intent_type: IntentType = IntentType.VIEW_ANALYTICS
    report_type: str = "personal"  # "personal", "health", "velocity"
    project_name: Optional[str] = None


# --- System / Control Intents ------------------------------------------------

class LinkAccountIntent(BaseTelegramIntent):
    intent_type: IntentType = IntentType.LINK_ACCOUNT
    code: str


class HelpIntent(BaseTelegramIntent):
    intent_type: IntentType = IntentType.HELP
    topic: Optional[str] = None


class CancelIntent(BaseTelegramIntent):
    intent_type: IntentType = IntentType.CANCEL


class ConfirmActionIntent(BaseTelegramIntent):
    intent_type: IntentType = IntentType.CONFIRM_ACTION
    confirmation_token: str
    approved: bool = True


class UnknownIntent(BaseTelegramIntent):
    intent_type: IntentType = IntentType.UNKNOWN
    suggested_action: Optional[str] = None


# Union of all executable intents for LLM structured output
TelegramIntentUnion = (
    CreateTaskIntent
    | ViewTaskIntent
    | SearchTasksIntent
    | UpdateTaskStatusIntent
    | AssignTaskIntent
    | UpdateTaskDetailsIntent
    | MoveTaskIntent
    | AddCommentIntent
    | ListProjectsIntent
    | ViewProjectStatusIntent
    | CreateProjectIntent
    | UpdateProjectIntent
    | ListProjectMembersIntent
    | AddProjectMemberIntent
    | RemoveProjectMemberIntent
    | ListSprintsIntent
    | ViewCurrentSprintIntent
    | CreateSprintIntent
    | CreateSprintBatchIntent
    | CreateTicketIntent
    | ListMilestonesIntent
    | CreateMilestoneIntent
    | SearchDocsIntent
    | ReadDocIntent
    | CreateDiagramIntent
    | ViewAnalyticsIntent
    | LinkAccountIntent
    | HelpIntent
    | CancelIntent
    | UnknownIntent
)

