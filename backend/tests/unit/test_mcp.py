"""Unit tests for permission-aware MCP JSON-RPC and resources."""

from __future__ import annotations

from uuid import uuid4

import pytest

from app.core.current_user import CurrentUser
from app.core.exceptions import UnauthorizedError
from app.core.permissions import Permissions
from app.modules.mcp import router, server


def user_with(*permissions: str) -> CurrentUser:
    return CurrentUser(
        user_id=uuid4(),
        email="agent.user@example.com",
        full_name="Agent User",
        roles=["Developer"],
        permissions=list(permissions),
        allow_role_bypass=False,
    )


@pytest.mark.asyncio
async def test_mcp_initialize_tools_and_skill_resource_are_identity_aware():
    user = user_with(Permissions.DOCS_VIEW, Permissions.TASKS_VIEW)

    init_res = await server.process_jsonrpc_request(
        {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
        user,
    )
    assert init_res["result"]["serverInfo"]["name"] == "project-management-platform-mcp"
    assert init_res["result"]["serverInfo"]["version"] == "2.1.0"
    assert "resources" in init_res["result"]["capabilities"]
    assert server.MCP_SKILL_URI in init_res["result"]["instructions"]

    tools_res = await server.process_jsonrpc_request(
        {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}},
        user,
    )
    names = {tool["name"] for tool in tools_res["result"]["tools"]}
    assert "pmp_user_context" in names
    assert "pmp_docs_search_or_get" in names
    assert "pmp_tasks_list" in names
    assert "pmp_docs_update_page" not in names
    assert "pmp_whatsapp_send" not in names

    resource_res = await server.process_jsonrpc_request(
        {
            "jsonrpc": "2.0",
            "id": 3,
            "method": "resources/read",
            "params": {"uri": server.MCP_SKILL_URI},
        },
        user,
    )
    skill = resource_res["result"]["contents"][0]["text"]
    assert "name: project-management-platform-mcp" in skill
    assert "Agent User" in skill
    assert "docs.view" in skill
    assert "never the user's password" in skill
    assert server.MCP_OPENAPI_URI in skill


@pytest.mark.asyncio
async def test_task_writer_can_discover_ticket_recipients_and_sprint_context():
    user = user_with(Permissions.TASKS_MANAGE_TEAM, Permissions.PROJECTS_VIEW_ASSIGNED)
    tools_res = await server.process_jsonrpc_request(
        {"jsonrpc": "2.0", "id": 20, "method": "tools/list", "params": {}},
        user,
    )
    tools = {tool["name"]: tool for tool in tools_res["result"]["tools"]}
    assert "pmp_people_and_teams_search" in tools
    assert "sprint IDs" in tools["pmp_projects_get"]["description"]


@pytest.mark.asyncio
async def test_every_authenticated_mcp_user_can_create_but_not_edit_tasks():
    user = user_with()
    tools_res = await server.process_jsonrpc_request(
        {"jsonrpc": "2.0", "id": 22, "method": "tools/list", "params": {}},
        user,
    )
    names = {tool["name"] for tool in tools_res["result"]["tools"]}

    assert "pmp_tasks_create" in names
    assert "pmp_tasks_update" not in names
    assert "pmp_tasks_update_status" not in names


@pytest.mark.asyncio
async def test_project_manager_gets_complete_project_sprint_and_task_write_surface():
    user = user_with(
        Permissions.PRODUCTS_VIEW_ASSIGNED,
        Permissions.PROJECTS_MANAGE_ASSIGNED,
        Permissions.PROJECTS_MANAGE_USERS,
        Permissions.PHASES_MANAGE_TEAM,
        Permissions.TASKS_MANAGE_ALL,
    )
    tools_res = await server.process_jsonrpc_request(
        {"jsonrpc": "2.0", "id": 21, "method": "tools/list", "params": {}},
        user,
    )
    tools = {tool["name"]: tool for tool in tools_res["result"]["tools"]}
    assert {
        "pmp_products_list",
        "pmp_projects_create",
        "pmp_projects_update",
        "pmp_project_members_add",
        "pmp_project_members_remove",
        "pmp_sprints_create",
        "pmp_sprints_update",
        "pmp_tasks_create",
        "pmp_tasks_update",
        "pmp_tasks_update_status",
    } <= tools.keys()
    task_create_properties = tools["pmp_tasks_create"]["inputSchema"]["properties"]
    assert task_create_properties["due_date"]["format"] == "date"
    assert task_create_properties["start_date"]["format"] == "date"


def test_every_mcp_tool_has_an_explicit_permission_policy():
    assert {tool["name"] for tool in server.MCP_TOOLS} == set(server.TOOL_PERMISSIONS)


def test_every_live_permission_can_discover_the_full_platform_api_tool():
    for permission in Permissions.all():
        assert "pmp_api_request" in server.tools_for_permission(permission)


@pytest.mark.asyncio
async def test_mcp_rejects_tool_outside_token_permission_subset(monkeypatch):
    user = user_with(Permissions.DOCS_VIEW)
    called = False

    async def should_not_execute(*_args, **_kwargs):
        nonlocal called
        called = True
        return {}

    monkeypatch.setattr(server, "execute_mcp_tool", should_not_execute)
    result = await server.process_jsonrpc_request(
        {
            "jsonrpc": "2.0",
            "id": 4,
            "method": "tools/call",
            "params": {"name": "pmp_tasks_update_status", "arguments": {}},
        },
        user,
    )
    assert result["result"]["isError"] is True
    assert "Permission denied" in result["result"]["content"][0]["text"]
    assert called is False


@pytest.mark.asyncio
async def test_mcp_tool_call_receives_connected_user(monkeypatch):
    user = user_with(Permissions.DOCS_EDIT)
    seen_user = None

    async def fake_execute(name, args, principal):
        nonlocal seen_user
        seen_user = principal
        return {"name": name, "page_id": args["page_id"]}

    monkeypatch.setattr(server, "execute_mcp_tool", fake_execute)
    page_id = str(uuid4())
    result = await server.process_jsonrpc_request(
        {
            "jsonrpc": "2.0",
            "id": 5,
            "method": "tools/call",
            "params": {
                "name": "pmp_docs_update_page",
                "arguments": {"page_id": page_id, "content": "Updated"},
            },
        },
        user,
    )
    assert result["result"]["isError"] is False
    assert result["result"]["structuredContent"]["page_id"] == page_id
    assert seen_user is user


def test_scoped_super_admin_does_not_bypass_token_permissions():
    user = CurrentUser(
        user_id=uuid4(),
        email="admin@example.com",
        full_name="Admin",
        roles=["SuperAdmin"],
        permissions=[Permissions.DOCS_VIEW],
        allow_role_bypass=False,
    )
    assert user.is_super_admin() is False
    assert server.user_can_use_tool(user, "pmp_docs_search_or_get") is True
    assert server.user_can_use_tool(user, "pmp_whatsapp_send") is False


def test_mcp_requires_a_well_formed_personal_bearer_token_header():
    assert router._bearer_token("Bearer pmp_mcp_secret") == "pmp_mcp_secret"
    with pytest.raises(UnauthorizedError):
        router._bearer_token(None)
    with pytest.raises(UnauthorizedError):
        router._bearer_token("Basic password")


@pytest.mark.asyncio
async def test_delegated_api_tool_rejects_auth_and_token_management_routes():
    user = user_with(Permissions.PROJECTS_VIEW_ASSIGNED)
    for path in ("/auth/login", "/mcp/tokens", "/docs/public/navigation"):
        with pytest.raises(ValueError, match="not available"):
            await server.execute_mcp_tool(
                "pmp_api_request",
                {"method": "GET", "path": path},
                user,
            )
