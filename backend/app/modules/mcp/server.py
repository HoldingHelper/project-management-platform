"""Permission-aware Model Context Protocol server for Project Management Platform.

Every request runs as the user who generated the personal MCP token. Tool
catalog visibility is derived from the token's effective permission subset,
while domain services enforce resource-level visibility.
"""

from __future__ import annotations

import json
import base64
import io
from datetime import timedelta
from typing import Any
from uuid import UUID

import structlog
from sqlalchemy import select

from app.core.current_user import CurrentUser
from app.core.database import AsyncSessionLocal
from app.core.exceptions import ForbiddenError
from app.core.permissions import Permissions
from app.core.security import create_access_token
from app.modules.automations import service as automation_service
from app.modules.collaboration.authorization import authorize_entity_access
from app.modules.collaboration import service as collaboration_service
from app.modules.docs import diagram_generator
from app.modules.docs import service as docs_service
from app.modules.docs.schemas import PageCreate, PageUpdate
from app.modules.integrations.models import GitHubPullRequestLink
from app.modules.integrations.whatsapp import service as whatsapp_service
from app.modules.identity import service as identity_service
from app.modules.organization import service as organization_service
from app.modules.projects import service as projects_service
from app.modules.projects.enums import TaskStatus
from app.modules.projects.models import Phase, Product, Project
from app.modules.projects.schemas import (
    PhaseCreate,
    PhaseUpdate,
    ProjectCreate,
    ProjectMemberCreate,
    ProjectRead,
    ProjectUpdate,
    TaskCreate,
    TaskUpdate,
)

logger = structlog.get_logger(__name__)

MCP_PROTOCOL_VERSION = "2025-03-26"
MCP_SKILL_URI = "pmp://agent/SKILL.md"
MCP_CONTEXT_URI = "pmp://account/context.json"
MCP_OPENAPI_URI = "pmp://api/openapi.json"

TASK_READ_PERMISSIONS = (
    Permissions.TASKS_VIEW,
    Permissions.TASKS_EDIT_ASSIGNED,
    Permissions.TASKS_MANAGE_TEAM,
    Permissions.TASKS_MANAGE_ALL,
    Permissions.TASKS_MANAGE_TESTING,
    Permissions.TASKS_MANAGE_DESIGN,
)
TASK_WRITE_PERMISSIONS = (
    Permissions.TASKS_EDIT_ASSIGNED,
    Permissions.TASKS_MANAGE_TEAM,
    Permissions.TASKS_MANAGE_ALL,
    Permissions.TASKS_MANAGE_TESTING,
    Permissions.TASKS_MANAGE_DESIGN,
)
PROJECT_READ_PERMISSIONS = (
    Permissions.PROJECTS_VIEW_ALL,
    Permissions.PROJECTS_VIEW_ASSIGNED,
    Permissions.PROJECTS_MANAGE_ALL,
    Permissions.PROJECTS_MANAGE_ASSIGNED,
)
PROJECT_WRITE_PERMISSIONS = (
    Permissions.PROJECTS_MANAGE_ALL,
    Permissions.PROJECTS_MANAGE_ASSIGNED,
)
PROJECT_MEMBER_PERMISSIONS = (
    Permissions.PROJECTS_MANAGE_USERS,
    Permissions.PROJECTS_MANAGE_ALL,
)
PRODUCT_READ_PERMISSIONS = (
    Permissions.PRODUCTS_VIEW_ALL,
    Permissions.PRODUCTS_VIEW_ASSIGNED,
    Permissions.PRODUCTS_MANAGE_ALL,
)
SPRINT_READ_PERMISSIONS = (
    Permissions.PHASES_VIEW,
    Permissions.PHASES_MANAGE_ALL,
    Permissions.PHASES_MANAGE_TEAM,
    Permissions.PHASES_APPROVE,
    *PROJECT_READ_PERMISSIONS,
)
SPRINT_WRITE_PERMISSIONS = (
    Permissions.PHASES_MANAGE_ALL,
    Permissions.PHASES_MANAGE_TEAM,
    Permissions.PHASES_APPROVE,
)
DOC_READ_PERMISSIONS = (
    Permissions.DOCS_VIEW,
    Permissions.DOCS_COMMENT,
    Permissions.DOCS_EDIT,
    Permissions.DOCS_MANAGE,
    Permissions.DOCS_PUBLISH,
)
DOC_WRITE_PERMISSIONS = (Permissions.DOCS_EDIT, Permissions.DOCS_MANAGE)
ANY_PLATFORM_PERMISSION = tuple(Permissions.all())


def _tool(
    name: str,
    description: str,
    properties: dict[str, Any] | None = None,
    required: list[str] | None = None,
) -> dict[str, Any]:
    schema: dict[str, Any] = {
        "type": "object",
        "properties": properties or {},
        "additionalProperties": False,
    }
    if required:
        schema["required"] = required
    return {"name": name, "description": description, "inputSchema": schema}


MCP_TOOLS: list[dict[str, Any]] = [
    _tool(
        "pmp_user_context",
        "Show the connected Platform user, roles, and effective token permissions.",
    ),
    _tool(
        "pmp_api_request",
        "Call any authenticated Platform JSON API route with the connected user's effective token permissions. Use GET/read calls before writes; external side effects still require explicit user intent.",
        {
            "method": {"type": "string", "enum": ["GET", "POST", "PUT", "PATCH", "DELETE"]},
            "path": {"type": "string", "description": "Path below /api/v1, for example /projects or /analytics/personal."},
            "query": {"type": "object", "additionalProperties": True},
            "body": {"type": ["object", "array", "null"]},
        },
        ["method", "path"],
    ),
    _tool(
        "pmp_products_list",
        "List only products visible to the connected user; use this to resolve a product before project creation.",
        {"limit": {"type": "integer", "minimum": 1, "maximum": 100, "default": 25}},
    ),
    _tool(
        "pmp_products_get",
        "Get one product after enforcing the connected user's product access.",
        {"product_id": {"type": "string", "format": "uuid"}},
        ["product_id"],
    ),
    _tool(
        "pmp_projects_list",
        "List only projects visible to the connected user.",
        {"limit": {"type": "integer", "minimum": 1, "maximum": 100, "default": 25}},
    ),
    _tool(
        "pmp_projects_get",
        "Get one visible project's overview, including sprint IDs, members, milestones, and task statistics.",
        {"project_id": {"type": "string", "format": "uuid"}},
        ["project_id"],
    ),
    _tool(
        "pmp_projects_create",
        "Create a project as the connected user, including its required 14-day sprints.",
        {
            "product_id": {"type": "string", "format": "uuid"},
            "name": {"type": "string"},
            "description": {"type": "string"},
            "priority": {"type": "string", "enum": ["P0", "P1", "P2", "P3"]},
            "risk_level": {"type": "string", "enum": ["Low", "Medium", "High", "Critical"]},
            "start_date": {"type": "string", "format": "date"},
            "end_date": {"type": "string", "format": "date"},
            "estimated_completion_date": {"type": "string", "format": "date"},
            "status": {"type": "string", "enum": ["not-started", "in-progress", "on-hold", "completed", "cancelled", "archived"]},
            "tags": {"type": "array", "items": {"type": "string"}},
            "sprints": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "start_date": {"type": "string", "format": "date"},
                        "end_date": {"type": "string", "format": "date"},
                        "lead_assignee_user_id": {"type": "string", "format": "uuid"},
                    },
                    "required": ["name", "start_date", "end_date"],
                    "additionalProperties": False,
                },
            },
        },
        ["product_id", "name"],
    ),
    _tool(
        "pmp_projects_update",
        "Update an accessible project using the same date-locking rules as the Platform application.",
        {
            "project_id": {"type": "string", "format": "uuid"},
            "name": {"type": "string"},
            "description": {"type": "string"},
            "priority": {"type": "string", "enum": ["P0", "P1", "P2", "P3"]},
            "risk_level": {"type": "string", "enum": ["Low", "Medium", "High", "Critical"]},
            "start_date": {"type": "string", "format": "date"},
            "end_date": {"type": "string", "format": "date"},
            "estimated_completion_date": {"type": "string", "format": "date"},
            "actual_completion_date": {"type": "string", "format": "date"},
            "status": {"type": "string", "enum": ["not-started", "in-progress", "on-hold", "completed", "cancelled", "archived"]},
            "tags": {"type": "array", "items": {"type": "string"}},
        },
        ["project_id"],
    ),
    _tool(
        "pmp_project_members_add",
        "Add an active user to an accessible project with a project role.",
        {
            "project_id": {"type": "string", "format": "uuid"},
            "user_id": {"type": "string", "format": "uuid"},
            "role": {"type": "string", "enum": ["ProjectManager", "TeamLead", "Developer", "QA", "UIUX", "BusinessAnalyst", "Client", "Observer"]},
        },
        ["project_id", "user_id", "role"],
    ),
    _tool(
        "pmp_project_members_remove",
        "Remove a user from an accessible project.",
        {
            "project_id": {"type": "string", "format": "uuid"},
            "user_id": {"type": "string", "format": "uuid"},
        },
        ["project_id", "user_id"],
    ),
    _tool(
        "pmp_sprints_create",
        "Create a 14-day sprint in an accessible project.",
        {
            "project_id": {"type": "string", "format": "uuid"},
            "name": {"type": "string"},
            "sequence": {"type": "integer"},
            "start_date": {"type": "string", "format": "date"},
            "end_date": {"type": "string", "format": "date"},
            "lead_assignee_user_id": {"type": "string", "format": "uuid"},
            "team_ids": {"type": "array", "items": {"type": "string", "format": "uuid"}},
        },
        ["project_id", "name", "start_date", "end_date"],
    ),
    _tool(
        "pmp_sprints_update",
        "Update an accessible sprint.",
        {
            "sprint_id": {"type": "string", "format": "uuid"},
            "name": {"type": "string"},
            "sequence": {"type": "integer"},
            "start_date": {"type": "string", "format": "date"},
            "end_date": {"type": "string", "format": "date"},
            "status": {"type": "string", "enum": ["not-started", "in-progress", "blocked", "completed", "delayed"]},
            "lead_assignee_user_id": {"type": "string", "format": "uuid"},
        },
        ["sprint_id"],
    ),
    _tool(
        "pmp_people_and_teams_search",
        "Resolve active user and team UUIDs for task assignment or ticket recipients.",
        {
            "query": {"type": "string", "description": "Name, email, job title, or team name."},
            "limit": {"type": "integer", "minimum": 1, "maximum": 50, "default": 20},
        },
        ["query"],
    ),
    _tool(
        "pmp_docs_list_spaces",
        "List documentation spaces visible to the connected user.",
        {"category": {"type": "string"}},
    ),
    _tool(
        "pmp_docs_search_or_get",
        "Search only visible internal docs or retrieve a visible page by ID.",
        {
            "query": {"type": "string"},
            "page_id": {"type": "string", "format": "uuid"},
            "category": {"type": "string"},
        },
    ),
    _tool(
        "pmp_docs_create_page",
        "Create a documentation page as the connected user.",
        {
            "space_id": {"type": "string", "format": "uuid"},
            "title": {"type": "string"},
            "content": {"type": "string"},
            "visibility": {
                "type": "string",
                "enum": ["private", "selected", "workspace", "admins", "public", "inherit"],
                "default": "private",
            },
        },
        ["space_id", "title", "content"],
    ),
    _tool(
        "pmp_docs_update_page",
        "Update a documentation page only when the connected user can edit it.",
        {
            "page_id": {"type": "string", "format": "uuid"},
            "title": {"type": "string"},
            "content": {"type": "string"},
            "visibility": {
                "type": "string",
                "enum": ["private", "selected", "workspace", "admins", "public", "inherit"],
            },
        },
        ["page_id"],
    ),
    _tool(
        "pmp_docs_upload_attachment",
        "Upload a base64-encoded local file to an editable documentation page (25 MB decoded limit).",
        {
            "page_id": {"type": "string", "format": "uuid"},
            "file_name": {"type": "string"},
            "mime_type": {"type": "string"},
            "content_base64": {"type": "string"},
        },
        ["page_id", "file_name", "mime_type", "content_base64"],
    ),
    _tool(
        "pmp_diagram_create",
        "Generate an accessible diagram and save it as a documentation page.",
        {
            "space_id": {"type": "string", "format": "uuid"},
            "title": {"type": "string"},
            "diagram_type": {
                "type": "string",
                "enum": ["architecture", "sequence", "flowchart", "state", "er", "timeline", "quadrant", "layers"],
            },
            "spec": {"type": "object"},
            "spec_json": {"type": "string", "description": "Legacy JSON-string form of spec."},
        },
        ["space_id", "title", "diagram_type"],
    ),
    _tool(
        "pmp_tasks_list",
        "List only tasks visible to the connected user.",
        {
            "status": {"type": "string"},
            "search": {"type": "string"},
            "assignee_user_id": {"type": "string", "format": "uuid"},
            "project_id": {"type": "string", "format": "uuid"},
            "limit": {"type": "integer", "minimum": 1, "maximum": 100, "default": 25},
        },
    ),
    _tool(
        "pmp_tasks_get",
        "Get one task after enforcing the connected user's task/project access.",
        {"task_id": {"type": "string", "format": "uuid"}},
        ["task_id"],
    ),
    _tool(
        "pmp_tasks_create",
        "Create a project-sprint or backlog task as the connected user; optionally create it as a ticket.",
        {
            "phase_id": {"type": "string", "format": "uuid", "description": "Sprint UUID; omit for backlog."},
            "title": {"type": "string"},
            "description": {"type": "string"},
            "task_type": {"type": "string", "enum": ["Feature", "Bug", "Enhancement", "Research", "Documentation", "Meeting", "Testing", "Deployment"]},
            "priority": {"type": "string", "enum": ["P0", "P1", "P2", "P3"]},
            "status": {"type": "string", "enum": ["NotStarted", "Ready", "InProgress", "Waiting", "Blocked", "Review", "Testing", "Done", "Cancelled", "Archived"]},
            "start_date": {"type": "string", "format": "date"},
            "due_date": {"type": "string", "format": "date"},
            "story_points": {"type": "integer", "minimum": 0},
            "estimated_hours": {"type": "number", "minimum": 0},
            "reviewer_user_id": {"type": "string", "format": "uuid"},
            "assignee_user_ids": {"type": "array", "items": {"type": "string", "format": "uuid"}},
            "is_ticket": {"type": "boolean", "default": False},
            "ticket_recipient_user_ids": {"type": "array", "items": {"type": "string", "format": "uuid"}},
            "ticket_recipient_team_ids": {"type": "array", "items": {"type": "string", "format": "uuid"}},
            "label_names": {"type": "array", "items": {"type": "string"}},
        },
        ["title"],
    ),
    _tool(
        "pmp_tasks_update",
        "Update editable fields of a visible task, including labels, checklists, dates, GitHub link, partition, and assignees. Authorization follows the connected user's live task permissions.",
        {
            "task_id": {"type": "string", "format": "uuid"},
            "title": {"type": "string"},
            "description": {"type": "string"},
            "task_type": {"type": "string", "enum": ["Feature", "Bug", "Enhancement", "Research", "Documentation", "Meeting", "Testing", "Deployment"]},
            "priority": {"type": "string", "enum": ["P0", "P1", "P2", "P3"]},
            "story_points": {"type": "integer", "minimum": 0},
            "estimated_hours": {"type": "number", "minimum": 0},
            "actual_hours": {"type": "number", "minimum": 0},
            "reviewer_user_id": {"type": "string", "format": "uuid"},
            "github_url": {"type": "string", "format": "uri"},
            "partition": {"type": "string"},
            "start_date": {"type": "string", "format": "date"},
            "due_date": {"type": "string", "format": "date"},
            "assignee_user_ids": {"type": "array", "items": {"type": "string", "format": "uuid"}},
            "label_names": {"type": "array", "items": {"type": "string"}},
            "checklist_items": {"type": "array", "items": {"type": "object", "properties": {"text": {"type": "string"}, "order": {"type": "integer", "minimum": 0}}, "required": ["text"]}},
        },
        ["task_id"],
    ),
    _tool(
        "pmp_tasks_update_status",
        "Update a visible task's status when the token includes a task-edit permission.",
        {
            "task_id": {"type": "string", "format": "uuid"},
            "status": {"type": "string", "enum": ["NotStarted", "Ready", "InProgress", "Waiting", "Blocked", "Review", "Testing", "Done", "Cancelled", "Archived"]},
        },
        ["task_id", "status"],
    ),
    _tool(
        "pmp_task_files_upload",
        "Upload a base64-encoded local file to a visible task (25 MB decoded limit).",
        {
            "task_id": {"type": "string", "format": "uuid"},
            "file_name": {"type": "string"},
            "content_type": {"type": "string"},
            "content_base64": {"type": "string"},
        },
        ["task_id", "file_name", "content_type", "content_base64"],
    ),
    _tool(
        "pmp_automations_create",
        "Create a workspace automation as the connected user (settings managers only).",
        {
            "name": {"type": "string"},
            "description": {"type": "string"},
            "trigger_type": {"type": "string"},
            "condition_json": {"type": "object"},
            "action_type": {"type": "string"},
            "action_config": {"type": "object"},
        },
        ["name", "trigger_type", "action_type"],
    ),
    _tool(
        "pmp_whatsapp_send",
        "Send a WhatsApp message (settings managers only; this causes an external side effect).",
        {
            "phone_number": {"type": "string", "description": "E.164 phone number"},
            "message": {"type": "string"},
        },
        ["phone_number", "message"],
    ),
    _tool(
        "pmp_github_check_pr",
        "Inspect a linked pull request only when its associated task is visible.",
        {
            "repo_owner": {"type": "string"},
            "repo_name": {"type": "string"},
            "pr_number": {"type": "integer"},
        },
        ["repo_owner", "repo_name", "pr_number"],
    ),
]

TOOL_PERMISSIONS: dict[str, tuple[str, ...]] = {
    "pmp_user_context": (),
    "pmp_api_request": ANY_PLATFORM_PERMISSION,
    "pmp_products_list": PRODUCT_READ_PERMISSIONS,
    "pmp_products_get": PRODUCT_READ_PERMISSIONS,
    "pmp_projects_list": PROJECT_READ_PERMISSIONS,
    "pmp_projects_get": PROJECT_READ_PERMISSIONS,
    "pmp_projects_create": PROJECT_WRITE_PERMISSIONS,
    "pmp_projects_update": PROJECT_WRITE_PERMISSIONS,
    "pmp_project_members_add": PROJECT_MEMBER_PERMISSIONS,
    "pmp_project_members_remove": PROJECT_MEMBER_PERMISSIONS,
    "pmp_sprints_create": SPRINT_WRITE_PERMISSIONS,
    "pmp_sprints_update": SPRINT_WRITE_PERMISSIONS,
    "pmp_people_and_teams_search": TASK_WRITE_PERMISSIONS,
    "pmp_docs_list_spaces": DOC_READ_PERMISSIONS,
    "pmp_docs_search_or_get": DOC_READ_PERMISSIONS,
    "pmp_docs_create_page": DOC_WRITE_PERMISSIONS,
    "pmp_docs_update_page": DOC_WRITE_PERMISSIONS,
    "pmp_docs_upload_attachment": DOC_WRITE_PERMISSIONS,
    "pmp_diagram_create": DOC_WRITE_PERMISSIONS,
    "pmp_tasks_list": TASK_READ_PERMISSIONS,
    "pmp_tasks_get": TASK_READ_PERMISSIONS,
    # Creating tasks is a baseline capability for every authenticated user.
    # Editing existing tasks remains permission-scoped below.
    "pmp_tasks_create": (),
    "pmp_tasks_update": TASK_WRITE_PERMISSIONS,
    "pmp_tasks_update_status": TASK_WRITE_PERMISSIONS,
    "pmp_task_files_upload": (Permissions.TASKS_UPLOAD_FILES,),
    "pmp_automations_create": (Permissions.MANAGE_SETTINGS,),
    "pmp_whatsapp_send": (Permissions.MANAGE_SETTINGS,),
    "pmp_github_check_pr": TASK_READ_PERMISSIONS,
}


def user_can_use_tool(user: CurrentUser, tool_name: str) -> bool:
    required = TOOL_PERMISSIONS.get(tool_name)
    return required is not None and (not required or user.has_any_permission(*required))


def available_tools(user: CurrentUser) -> list[dict[str, Any]]:
    return [tool for tool in MCP_TOOLS if user_can_use_tool(user, tool["name"])]


def tools_for_permission(code: str) -> list[str]:
    return sorted(name for name, required in TOOL_PERMISSIONS.items() if code in required)


def render_skill(user: CurrentUser) -> str:
    tools = available_tools(user)
    tool_lines = "\n".join(f"- `{tool['name']}` — {tool['description']}" for tool in tools)
    permission_lines = "\n".join(f"- `{code}`" for code in user.permissions)
    return f"""---
name: project-management-platform-mcp
description: Use the Project Management Platform MCP server to work with the connected user's visible projects, tasks, tickets, internal docs, diagrams, integrations, and automations.
---

# Project Management Platform MCP

You are connected as **{user.full_name}** (`{user.email}`). Treat the server as
authoritative for authorization. Never claim a record exists when a tool returns
not found; inaccessible private records intentionally look unavailable.

## Safety and access

- The connection is a revocable personal token, never the user's password.
- The token can do no more than the user's live RBAC and resource permissions.
- The token is additionally limited to the permissions listed below.
- Ask before external side effects such as WhatsApp messages unless the user
  explicitly requested that action.
- Prefer read tools before write tools and reuse exact UUIDs returned by tools.

## Effective permissions

{permission_lines}

## Available tools

{tool_lines}

## Recommended workflow

1. Call `pmp_user_context` to confirm the connected identity and limits.
2. Use list/search tools to resolve exact project, sprint, task, or page UUIDs.
3. Read the target before updating it.
4. Perform the smallest requested mutation.
5. Read the result again and report what changed.

## Full platform API

`pmp_api_request` exposes the authenticated JSON API below `/api/v1` with this
token's effective permissions. Read `{MCP_OPENAPI_URI}` for the route schemas.
The delegated call cannot elevate permissions or use the SuperAdmin role bypass.
Authentication, MCP-token management, and public anonymous routes are excluded.

## Tickets

For work requested from another person or team, resolve exact recipient UUIDs
with `pmp_people_and_teams_search`, then call `pmp_tasks_create` with
`is_ticket: true` and at least one ticket recipient user or team UUID. The
platform expands active team members and notifies their dashboards.
"""


def _resource_list(user: CurrentUser) -> list[dict[str, Any]]:
    return [
        {
            "uri": MCP_SKILL_URI,
            "name": "Project Management Platform agent skill",
            "description": "Identity-aware operating instructions and available tools.",
            "mimeType": "text/markdown",
        },
        {
            "uri": MCP_CONTEXT_URI,
            "name": "Connected account context",
            "description": "Current user, roles, effective token permissions, and tools.",
            "mimeType": "application/json",
        },
        {
            "uri": MCP_OPENAPI_URI,
            "name": "Permission-scoped Platform API schema",
            "description": "OpenAPI routes callable through pmp_api_request.",
            "mimeType": "application/json",
        },
    ]


def _delegated_openapi() -> dict[str, Any]:
    """Return only the authenticated JSON routes exposed by pmp_api_request."""
    from app.main import app

    source = app.openapi()
    paths: dict[str, Any] = {}
    for raw_path, operations in source.get("paths", {}).items():
        if not raw_path.startswith("/api/v1/"):
            continue
        relative = raw_path.removeprefix("/api/v1")
        if relative == "/openapi.json" or relative.startswith(("/auth", "/mcp", "/docs/public")):
            continue
        paths[relative] = operations
    return {**source, "paths": paths}


def _context_payload(user: CurrentUser) -> dict[str, Any]:
    return {
        "user_id": str(user.user_id),
        "email": user.email,
        "full_name": user.full_name,
        "roles": user.roles,
        "effective_permissions": user.permissions,
        "available_tools": [tool["name"] for tool in available_tools(user)],
    }


async def process_jsonrpc_request(req: dict[str, Any], user: CurrentUser) -> dict[str, Any]:
    """Handle JSON-RPC 2.0 for an already authenticated MCP principal."""
    req_id = req.get("id")
    method = req.get("method")
    params = req.get("params") or {}

    if method == "initialize":
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {
                "protocolVersion": MCP_PROTOCOL_VERSION,
                "capabilities": {
                    "tools": {"listChanged": True},
                    "resources": {"subscribe": False, "listChanged": True},
                },
                "serverInfo": {"name": "project-management-platform-mcp", "version": "2.1.0"},
                "instructions": f"Read {MCP_SKILL_URI} before using tools. All operations run as {user.full_name} and are limited by live Platform permissions.",
            },
        }
    if method in {"notifications/initialized", "ping"}:
        return {"jsonrpc": "2.0", "id": req_id, "result": {}}
    if method == "tools/list":
        return {"jsonrpc": "2.0", "id": req_id, "result": {"tools": available_tools(user)}}
    if method == "resources/list":
        return {"jsonrpc": "2.0", "id": req_id, "result": {"resources": _resource_list(user)}}
    if method == "resources/read":
        uri = params.get("uri")
        if uri == MCP_SKILL_URI:
            contents = [{"uri": uri, "mimeType": "text/markdown", "text": render_skill(user)}]
        elif uri == MCP_CONTEXT_URI:
            contents = [{"uri": uri, "mimeType": "application/json", "text": json.dumps(_context_payload(user), indent=2)}]
        elif uri == MCP_OPENAPI_URI:
            contents = [{"uri": uri, "mimeType": "application/json", "text": json.dumps(_delegated_openapi())}]
        else:
            return {"jsonrpc": "2.0", "id": req_id, "error": {"code": -32002, "message": "Resource not found"}}
        return {"jsonrpc": "2.0", "id": req_id, "result": {"contents": contents}}
    if method == "tools/call":
        tool_name = params.get("name", "")
        if not user_can_use_tool(user, tool_name):
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {
                    "content": [{"type": "text", "text": "Permission denied: this tool is outside the token's effective access."}],
                    "isError": True,
                },
            }
        try:
            output = await execute_mcp_tool(tool_name, params.get("arguments") or {}, user)
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {
                    "content": [{"type": "text", "text": json.dumps(output, indent=2, default=str)}],
                    "structuredContent": output,
                    "isError": False,
                },
            }
        except Exception as exc:
            logger.warning("mcp_tool_execution_error", tool=tool_name, user_id=str(user.user_id), error=type(exc).__name__)
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {"content": [{"type": "text", "text": f"Error: {exc}"}], "isError": True},
            }

    return {"jsonrpc": "2.0", "id": req_id, "error": {"code": -32601, "message": f"Method '{method}' not found"}}


async def _visible_projects(db: Any, user: CurrentUser, limit: int) -> list[dict[str, Any]]:
    result = await db.execute(select(Project).order_by(Project.updated_at.desc()).limit(200))
    visible: list[dict[str, Any]] = []
    for project in result.scalars().all():
        try:
            await authorize_entity_access(db, user, "project", project.id)
        except ForbiddenError:
            continue
        visible.append(ProjectRead.model_validate(project).model_dump(mode="json"))
        if len(visible) >= limit:
            break
    return visible


async def _visible_products(db: Any, user: CurrentUser, limit: int) -> list[dict[str, Any]]:
    result = await db.execute(select(Product).order_by(Product.updated_at.desc()).limit(200))
    visible: list[dict[str, Any]] = []
    for product in result.scalars().all():
        try:
            await authorize_entity_access(db, user, "product", product.id)
        except ForbiddenError:
            continue
        visible.append((await projects_service.get_product(db, product.id)).model_dump(mode="json"))
        if len(visible) >= limit:
            break
    return visible


async def execute_mcp_tool(name: str, args: dict[str, Any], user: CurrentUser) -> dict[str, Any]:
    """Execute a tool using domain authorization under ``user``."""
    async with AsyncSessionLocal() as db:
        if name == "pmp_user_context":
            return _context_payload(user)

        if name == "pmp_api_request":
            method = str(args["method"]).upper()
            path = str(args["path"]).strip()
            if method not in {"GET", "POST", "PUT", "PATCH", "DELETE"}:
                raise ValueError("Unsupported API method.")
            if not path.startswith("/") or path.startswith("//") or ".." in path or "://" in path:
                raise ValueError("Use a relative path below /api/v1.")
            blocked_prefixes = ("/auth", "/mcp", "/docs/public")
            if path == "/openapi.json" or path.startswith(blocked_prefixes):
                raise ValueError("This route is not available through the delegated API tool.")

            # Import lazily so the MCP module can still be imported while the
            # FastAPI composition root is being built.
            import httpx

            from app.main import app

            delegated_token = create_access_token(
                user_id=user.user_id,
                email=user.email,
                full_name=user.full_name,
                roles=user.roles,
                permissions=user.permissions,
                expires_delta=timedelta(minutes=2),
                allow_role_bypass=False,
            )
            transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
            async with httpx.AsyncClient(transport=transport, base_url="http://pmp-mcp-internal") as client:
                response = await client.request(
                    method,
                    f"/api/v1{path}",
                    params=args.get("query"),
                    json=args.get("body") if "body" in args else None,
                    headers={"Authorization": f"Bearer {delegated_token}"},
                    timeout=30.0,
                )
            content_type = response.headers.get("content-type", "")
            if len(response.content) > 2_000_000:
                raise ValueError("API response exceeds the MCP 2 MB response limit.")
            result: dict[str, Any] = {
                "status_code": response.status_code,
                "content_type": content_type,
            }
            if "application/json" in content_type:
                result["data"] = response.json()
            elif response.content:
                result["text"] = response.text
            return result

        if name == "pmp_products_list":
            return {"products": await _visible_products(db, user, min(int(args.get("limit", 25)), 100))}

        if name == "pmp_products_get":
            product_id = UUID(args["product_id"])
            await authorize_entity_access(db, user, "product", product_id)
            return (await projects_service.get_product(db, product_id)).model_dump(mode="json")

        if name == "pmp_projects_list":
            return {"projects": await _visible_projects(db, user, min(int(args.get("limit", 25)), 100))}

        if name == "pmp_projects_get":
            project_id = UUID(args["project_id"])
            await authorize_entity_access(db, user, "project", project_id)
            return (await projects_service.get_project_overview(db, project_id)).model_dump(mode="json")

        if name == "pmp_projects_create":
            product_id = UUID(args["product_id"])
            await authorize_entity_access(db, user, "product", product_id)
            payload_data = {
                field: args[field]
                for field in (
                    "name",
                    "description",
                    "priority",
                    "risk_level",
                    "start_date",
                    "end_date",
                    "estimated_completion_date",
                    "status",
                    "tags",
                    "sprints",
                )
                if field in args
            }
            project = await projects_service.create_project(
                db,
                ProjectCreate(product_id=product_id, **payload_data),
                created_by_user_id=user.user_id,
            )
            return {"status": "created", "project": project.model_dump(mode="json")}

        if name == "pmp_projects_update":
            project_id = UUID(args["project_id"])
            await authorize_entity_access(db, user, "project", project_id)
            changes = {
                field: args[field]
                for field in (
                    "name",
                    "description",
                    "priority",
                    "risk_level",
                    "start_date",
                    "end_date",
                    "estimated_completion_date",
                    "actual_completion_date",
                    "status",
                    "tags",
                )
                if field in args
            }
            project = await projects_service.update_project(db, project_id, ProjectUpdate(**changes))
            return {"status": "updated", "project": project.model_dump(mode="json")}

        if name == "pmp_project_members_add":
            project_id = UUID(args["project_id"])
            await authorize_entity_access(db, user, "project", project_id)
            await projects_service.add_project_member(
                db,
                project_id,
                ProjectMemberCreate(user_id=UUID(args["user_id"]), role=args["role"]),
            )
            return {"status": "added", "project_id": str(project_id), "user_id": args["user_id"]}

        if name == "pmp_project_members_remove":
            project_id = UUID(args["project_id"])
            await authorize_entity_access(db, user, "project", project_id)
            await projects_service.remove_project_member(db, project_id, UUID(args["user_id"]))
            return {"status": "removed", "project_id": str(project_id), "user_id": args["user_id"]}

        if name == "pmp_sprints_create":
            project_id = UUID(args["project_id"])
            await authorize_entity_access(db, user, "project", project_id)
            payload = PhaseCreate(
                project_id=project_id,
                name=args["name"],
                sequence=int(args.get("sequence", 0)),
                start_date=args["start_date"],
                end_date=args["end_date"],
                lead_assignee_user_id=(
                    UUID(args["lead_assignee_user_id"])
                    if args.get("lead_assignee_user_id")
                    else None
                ),
                team_ids=[UUID(value) for value in args.get("team_ids", [])],
            )
            sprint = await projects_service.create_phase(db, payload)
            return {"status": "created", "sprint": sprint.model_dump(mode="json")}

        if name == "pmp_sprints_update":
            sprint_id = UUID(args["sprint_id"])
            await authorize_entity_access(db, user, "phase", sprint_id)
            changes = {
                field: args[field]
                for field in ("name", "sequence", "start_date", "end_date", "status")
                if field in args
            }
            if "lead_assignee_user_id" in args:
                changes["lead_assignee_user_id"] = UUID(args["lead_assignee_user_id"])
            sprint = await projects_service.update_phase(db, sprint_id, PhaseUpdate(**changes))
            return {"status": "updated", "sprint": sprint.model_dump(mode="json")}

        if name == "pmp_people_and_teams_search":
            query = args["query"].strip().lower()
            limit = min(int(args.get("limit", 20)), 50)
            people, _ = await identity_service.list_users(
                db,
                search=query,
                page=1,
                page_size=limit,
            )
            teams = await organization_service.list_teams(db)
            matching_teams = [
                team
                for team in teams
                if query in team.name.lower()
            ][:limit]
            return {
                "people": [
                    {
                        "id": str(person.id),
                        "full_name": person.full_name,
                        "email": person.email,
                        "job_title": person.job_title,
                        "department_name": person.department_name,
                        "team_name": person.team_name,
                    }
                    for person in people
                    if person.is_active
                ],
                "teams": [
                    {
                        "id": str(team.id),
                        "name": team.name,
                        "department_id": str(team.department_id),
                        "lead_user_id": str(team.lead_user_id) if team.lead_user_id else None,
                        "member_count": team.member_count,
                    }
                    for team in matching_teams
                ],
            }

        if name == "pmp_docs_list_spaces":
            spaces = await docs_service.list_spaces(db, user, category=args.get("category"))
            return {"spaces": [space.model_dump(mode="json") for space in spaces]}

        if name == "pmp_docs_search_or_get":
            if args.get("page_id"):
                return (await docs_service.get_page(db, user, UUID(args["page_id"]))).model_dump(mode="json")
            pages = await docs_service.search_pages(db, user, args.get("query", ""), category=args.get("category"))
            return {"results": [page.model_dump(mode="json") for page in pages[:50]]}

        if name == "pmp_docs_create_page":
            page = await docs_service.create_page(
                db,
                user,
                UUID(args["space_id"]),
                PageCreate(title=args["title"], content=args["content"], visibility=args.get("visibility", "private")),
            )
            return {"status": "created", "page": page.model_dump(mode="json")}

        if name == "pmp_docs_update_page":
            changes = {field: args[field] for field in ("title", "content", "visibility") if field in args}
            page = await docs_service.update_page(db, user, UUID(args["page_id"]), PageUpdate(**changes))
            return {"status": "updated", "page": page.model_dump(mode="json")}

        if name == "pmp_docs_upload_attachment":
            try:
                content = base64.b64decode(args["content_base64"], validate=True)
            except Exception as exc:
                raise ValueError("content_base64 must be valid base64.") from exc
            attachment = await docs_service.upload_attachment(
                db,
                user,
                UUID(args["page_id"]),
                args["file_name"],
                args["mime_type"],
                io.BytesIO(content),
                len(content),
            )
            return {"status": "uploaded", "attachment": attachment.model_dump(mode="json")}

        if name == "pmp_diagram_create":
            spec = args.get("spec") or {}
            if not spec and args.get("spec_json"):
                spec = json.loads(args["spec_json"])
            svg = diagram_generator.render_diagram_svg(args["diagram_type"], args["title"], spec)
            content = f"# {args['title']}\n\n*Generated {args['diagram_type'].title()} diagram*\n\n```xml\n{svg}\n```"
            page = await docs_service.create_page(
                db,
                user,
                UUID(args["space_id"]),
                PageCreate(title=args["title"], content=content, visibility="private"),
            )
            return {"status": "diagram_generated", "page": page.model_dump(mode="json")}

        if name == "pmp_tasks_list":
            tasks, _ = await projects_service.list_tasks(
                db,
                status=args.get("status"),
                search=args.get("search"),
                assignee_user_id=UUID(args["assignee_user_id"]) if args.get("assignee_user_id") else None,
                page=1,
                page_size=100,
            )
            requested_project_id = UUID(args["project_id"]) if args.get("project_id") else None
            limit = min(int(args.get("limit", 25)), 100)
            visible: list[dict[str, Any]] = []
            for task in tasks:
                if requested_project_id is not None:
                    if task.phase_id is None:
                        continue
                    phase = await db.get(Phase, task.phase_id)
                    if phase is None or phase.project_id != requested_project_id:
                        continue
                try:
                    await authorize_entity_access(db, user, "task", task.id)
                except ForbiddenError:
                    continue
                visible.append(task.model_dump(mode="json"))
                if len(visible) >= limit:
                    break
            return {"tasks": visible}

        if name == "pmp_tasks_get":
            task_id = UUID(args["task_id"])
            await authorize_entity_access(db, user, "task", task_id)
            return (await projects_service.get_task(db, task_id)).model_dump(mode="json")

        if name == "pmp_tasks_create":
            phase_id = UUID(args["phase_id"]) if args.get("phase_id") else None
            if phase_id is not None:
                await authorize_entity_access(db, user, "phase", phase_id)
            payload = TaskCreate(
                phase_id=phase_id,
                title=args["title"],
                description=args.get("description"),
                task_type=args.get("task_type", "Feature"),
                priority=args.get("priority", "P2"),
                status=args.get("status"),
                start_date=args.get("start_date"),
                due_date=args.get("due_date"),
                story_points=args.get("story_points"),
                estimated_hours=args.get("estimated_hours"),
                reviewer_user_id=(UUID(args["reviewer_user_id"]) if args.get("reviewer_user_id") else None),
                assignee_user_ids=[UUID(value) for value in args.get("assignee_user_ids", [])],
                is_ticket=bool(args.get("is_ticket", False)),
                ticket_recipient_user_ids=[UUID(value) for value in args.get("ticket_recipient_user_ids", [])],
                ticket_recipient_team_ids=[UUID(value) for value in args.get("ticket_recipient_team_ids", [])],
                label_names=args.get("label_names", []),
            )
            task = await projects_service.create_task(
                db, payload, created_by_user_id=user.user_id, current_user=user
            )
            return {"status": "created", "task": task.model_dump(mode="json")}

        if name == "pmp_tasks_update":
            task_id = UUID(args["task_id"])
            await authorize_entity_access(db, user, "task", task_id)
            changes = {
                field: args[field]
                for field in (
                    "title",
                    "description",
                    "task_type",
                    "priority",
                    "story_points",
                    "estimated_hours",
                    "actual_hours",
                    "github_url",
                    "partition",
                    "start_date",
                    "due_date",
                )
                if field in args
            }
            if "reviewer_user_id" in args:
                changes["reviewer_user_id"] = (
                    UUID(args["reviewer_user_id"])
                    if args["reviewer_user_id"]
                    else None
                )
            if "assignee_user_ids" in args:
                changes["assignee_user_ids"] = [UUID(value) for value in args["assignee_user_ids"]]
            if "label_names" in args:
                changes["label_names"] = args["label_names"]
            if "checklist_items" in args:
                changes["checklist_items"] = args["checklist_items"]
            task = await projects_service.update_task(
                db, task_id, TaskUpdate(**changes), user
            )
            return {"status": "updated", "task": task.model_dump(mode="json")}

        if name == "pmp_tasks_update_status":
            task_id = UUID(args["task_id"])
            await authorize_entity_access(db, user, "task", task_id)
            await projects_service.require_task_edit_access(db, user, task_id)
            task = await projects_service.update_task_status(
                db, task_id, TaskStatus(args["status"]), changed_by_user_id=user.user_id
            )
            return {"status": "updated", "task": task.model_dump(mode="json")}

        if name == "pmp_task_files_upload":
            task_id = UUID(args["task_id"])
            await authorize_entity_access(db, user, "task", task_id)
            try:
                content = base64.b64decode(args["content_base64"], validate=True)
            except Exception as exc:
                raise ValueError("content_base64 must be valid base64.") from exc
            if not content or len(content) > 25 * 1024 * 1024:
                raise ValueError("Task files must be between 1 byte and 25 MB.")
            attachment = await collaboration_service.upload_file(
                db,
                entity_type="task",
                entity_id=task_id,
                file_name=args["file_name"],
                content_type=args["content_type"],
                content=io.BytesIO(content),
                size_bytes=len(content),
                current_user=user,
            )
            return {"status": "uploaded", "attachment": attachment.model_dump(mode="json")}

        if name == "pmp_automations_create":
            rule = await automation_service.create_rule(
                db,
                name=args["name"],
                description=args.get("description"),
                trigger_type=args["trigger_type"],
                condition_json=args.get("condition_json", {}),
                action_type=args["action_type"],
                action_config=args.get("action_config", {}),
                created_by_user_id=user.user_id,
            )
            return {"status": "automation_created", "rule_id": str(rule.id)}

        if name == "pmp_whatsapp_send":
            delivered = await whatsapp_service.send_whatsapp_text_message(args["phone_number"], args["message"])
            return {"delivered": delivered}

        if name == "pmp_github_check_pr":
            result = await db.execute(
                select(GitHubPullRequestLink).where(
                    GitHubPullRequestLink.repo_owner == args["repo_owner"],
                    GitHubPullRequestLink.repo_name == args["repo_name"],
                    GitHubPullRequestLink.pr_number == int(args["pr_number"]),
                )
            )
            link = result.scalar_one_or_none()
            if link is None:
                return {"status": "not_linked"}
            await authorize_entity_access(db, user, "task", link.task_id)
            return {
                "status": link.pr_status,
                "task_id": str(link.task_id),
                "pr_title": link.pr_title,
                "pr_url": link.pr_url,
                "merged_at": link.merged_at.isoformat() if link.merged_at else None,
            }

        raise ValueError(f"Unknown tool: {name}")
