"""HTTP transport and personal-token management for Model Context Protocol."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Request, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.current_user import CurrentUser
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.exceptions import UnauthorizedError
from app.modules.mcp import server, service
from app.modules.mcp.schemas import (
    McpPermissionOption,
    McpSetupRead,
    McpTokenCreate,
    McpTokenCreated,
    McpTokenRead,
)

mcp_router = APIRouter(prefix="/mcp", tags=["Model Context Protocol"])


def _bearer_token(authorization: str | None) -> str:
    scheme, separator, token = (authorization or "").partition(" ")
    if not separator or scheme.lower() != "bearer" or not token.strip():
        raise UnauthorizedError("Provide an MCP personal token as a Bearer token.")
    return token.strip()


@mcp_router.get("/tokens", response_model=list[McpTokenRead])
async def list_personal_tokens(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[McpTokenRead]:
    return await service.list_tokens(db, user.user_id)


@mcp_router.post(
    "/tokens", response_model=McpTokenCreated, status_code=status.HTTP_201_CREATED
)
async def create_personal_token(
    payload: McpTokenCreate,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> McpTokenCreated:
    return await service.create_token(db, user, payload)


@mcp_router.delete(
    "/tokens/{token_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def revoke_personal_token(
    token_id: UUID,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    await service.revoke_token(db, user.user_id, token_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@mcp_router.get("/setup", response_model=McpSetupRead)
async def setup_information(
    request: Request,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> McpSetupRead:
    user = await service.live_web_principal(db, user)
    permissions = [
        McpPermissionOption(
            code=code,
            description=code.replace(".", " ").replace("_", " ").title(),
            tool_names=server.tools_for_permission(code),
        )
        for code in sorted(user.permissions)
        if server.tools_for_permission(code)
    ]
    endpoint = str(request.url_for("mcp_jsonrpc_endpoint"))
    return McpSetupRead(
        endpoint_url=endpoint,
        skill_resource_uri=server.MCP_SKILL_URI,
        skill_markdown=server.render_skill(user),
        available_permissions=permissions,
        available_tools=server.available_tools(user),
        security_notes=[
            "Use a personal MCP token; never put your account password in an AI client.",
            "The secret is shown once and stored only as a SHA-256 hash.",
            "Effective access is the intersection of token permissions and your live account permissions.",
            "The full authenticated JSON API is available through a delegated tool without exposing its short-lived internal credential.",
            "Private project, task, document, chat, music, and analytics visibility is enforced by the same application authorization rules.",
        ],
    )


@mcp_router.get("/skill.md", response_class=Response)
async def skill_markdown(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    user = await service.live_web_principal(db, user)
    return Response(
        content=server.render_skill(user),
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": 'inline; filename="SKILL.md"'},
    )


@mcp_router.post(
    "",
    status_code=status.HTTP_200_OK,
    name="mcp_jsonrpc_endpoint",
    response_model=None,
)
async def mcp_jsonrpc_endpoint(
    request: Request,
    authorization: str | None = Header(None),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any] | Response:
    """Permission-aware Streamable HTTP JSON-RPC endpoint for MCP clients."""
    user, _token = await service.resolve_principal(db, _bearer_token(authorization))
    try:
        payload = await request.json()
    except Exception:
        return {
            "jsonrpc": "2.0",
            "id": None,
            "error": {"code": -32700, "message": "Parse error"},
        }
    if not isinstance(payload, dict):
        return {
            "jsonrpc": "2.0",
            "id": None,
            "error": {"code": -32600, "message": "Invalid Request"},
        }
    result = await server.process_jsonrpc_request(payload, user)
    # JSON-RPC notifications intentionally have no response body. MCP's
    # Streamable HTTP transport acknowledges them with 202 Accepted.
    if "id" not in payload:
        return Response(status_code=status.HTTP_202_ACCEPTED)
    return result


@mcp_router.get("")
async def mcp_streamable_http_events(
    authorization: str | None = Header(None),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """Authenticated GET half of the MCP Streamable HTTP transport.

    Clients that negotiate a server event stream against the same URL receive
    an initial readiness event. JSON-RPC requests continue to use POST.
    """
    await service.resolve_principal(db, _bearer_token(authorization))

    async def event_stream():
        yield "event: ready\ndata: {}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@mcp_router.get("/sse")
async def mcp_sse_endpoint(
    authorization: str | None = Header(None),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """Authenticated compatibility endpoint for legacy MCP SSE clients."""
    await service.resolve_principal(db, _bearer_token(authorization))

    async def sse_event_stream():
        yield "event: endpoint\ndata: /api/v1/mcp\n\n"

    return StreamingResponse(sse_event_stream(), media_type="text/event-stream")
