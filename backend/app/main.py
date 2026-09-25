"""FastAPI application entrypoint for the Project Management Platform backend.

This is the composition root of the modular monolith: it wires together the
shared infrastructure (config, logging, middleware, exception handling) and
mounts every domain module's routers under the versioned API prefix.

Cross-module integrations are event-driven. At startup we:

1. install the universal SQLAlchemy audit interceptor, and
2. subscribe each module's event handlers to the in-process event bus,

so that (for example) a task assignment in the *projects* module fans out to
notifications in *collaboration* and an audit row in *analytics* -- without any
module importing another module's models. See docs/MODULE_GUIDE.md.

Run locally:  uvicorn app.main:app --reload
"""

from __future__ import annotations

import asyncio
import contextlib
from collections.abc import AsyncIterator

import structlog
from fastapi import APIRouter, FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.core.audit import register_audit_listeners
from app.core.cache import get_redis
from app.core.config import get_settings
from app.core.database import AsyncSessionLocal, engine
from app.core.exception_handlers import register_exception_handlers
from app.core.logging import configure_logging
from app.core.middleware import CorrelationIdMiddleware
from app.core.rate_limit import InMemoryRateLimiter, RateLimitMiddleware
from app.core.security import TOKEN_TYPE_ACCESS, decode_token
from app.core.storage import file_storage_service
from app.core.websocket_manager import connection_manager

from app.graphql.context import get_graphql_context
from app.graphql.schema import schema as graphql_schema
from strawberry.fastapi import GraphQLRouter

# Domain routers -------------------------------------------------------------
from app.modules.analytics.event_handlers import register_analytics_event_handlers
from app.modules.analytics.router import router as analytics_router
from app.modules.analytics.router import search_router
from app.modules.automations.router import automations_router
from app.modules.automations.service import register_automation_event_listeners
from app.modules.blockers.router import blockers_router, pending_work_router
from app.modules.calendar.router import calendar_router
from app.modules.calendar import service as calendar_service
from app.modules.chat.event_handlers import register_chat_event_handlers
from app.modules.chat.router import chat_router
from app.modules.collaboration.event_handlers import (
    register_collaboration_event_handlers,
)
from app.modules.collaboration.router import (
    comments_router,
    devices_router,
    files_router,
    notifications_router,
)
from app.modules.identity.router import rbac_router
from app.modules.integrations.github.router import github_router
from app.modules.integrations.router import integrations_router
from app.modules.integrations.whatsapp.router import whatsapp_router
from app.modules.mcp.router import mcp_router
from app.modules.music.router import music_router
from app.modules.identity.router import router as auth_router
from app.modules.identity.router import users_router
from app.modules.docs.router import docs_router, public_docs_router
from app.modules.organization.router import (
    departments_router,
    employees_router,
    organization_router,
    skills_router,
    teams_router,
)
from app.modules.projects.router import (
    dependencies_router,
    phases_router,
    partitions_router,
    portfolio_router,
    products_router,
    projects_router,
    sprints_router,
    tasks_router,
)

settings = get_settings()
logger = structlog.get_logger(__name__)


# --- Rate limiting ----------------------------------------------------------
# Brute-force mitigation is scoped to the unauthenticated auth endpoints only.
_auth_limiter = InMemoryRateLimiter(
    max_requests=settings.auth_rate_limit_per_minute, window_seconds=60
)
_RATE_LIMITED_SUFFIXES = (
    "/auth/login",
    "/auth/forgot-password",
    "/auth/reset-password",
)


def _is_rate_limited_path(path: str) -> bool:
    return path.endswith(_RATE_LIMITED_SUFFIXES)


async def _calendar_reminder_worker() -> None:
    """Periodic background worker checking for upcoming meetings (T-10m & T-2m)."""
    while True:
        try:
            await asyncio.sleep(60)
            async with AsyncSessionLocal() as db:
                await calendar_service.check_and_dispatch_meeting_reminders(db)
        except asyncio.CancelledError:
            break
        except Exception as exc:
            logger.warning("calendar_reminder_worker_error", error=str(exc))


# --- Application lifecycle ---------------------------------------------------
@contextlib.asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Startup/shutdown hooks.

    Event wiring is idempotent enough for tests but is intentionally done here
    (not at import time) so that importing `app.main` for tooling/migrations
    doesn't register live listeners.
    """
    configure_logging(debug=settings.debug)

    # 1. Universal audit interceptor + cross-module event subscriptions.
    register_audit_listeners()
    register_collaboration_event_handlers()
    register_analytics_event_handlers()
    register_chat_event_handlers()
    register_automation_event_listeners()

    # 2. Ensure the object-storage bucket exists. Best-effort: the API must
    #    still boot in environments where MinIO/S3 isn't reachable yet -- file
    #    endpoints will surface their own errors on use.
    try:
        file_storage_service.ensure_bucket()
    except Exception as exc:  # noqa: BLE001 - non-fatal at boot
        logger.warning("storage_bucket_init_failed", error=str(exc))

    # 3. Redis Pub/Sub backplane: re-delivers websocket broadcasts published by
    #    other API replicas to this process's local sockets. Without it, group
    #    events (chat, music sync) only reach sockets on the emitting replica.
    backplane_task: asyncio.Task[None] | None = None
    if settings.realtime_backplane_enabled:
        backplane_task = asyncio.create_task(
            connection_manager.backplane_listener(), name="ws-backplane"
        )

    # 4. Background meeting reminder worker
    reminder_task = asyncio.create_task(
        _calendar_reminder_worker(), name="calendar-reminders"
    )

    logger.info(
        "application_startup",
        app_name=settings.app_name,
        environment=settings.environment,
    )

    yield

    # Shutdown: release pooled resources.
    if backplane_task is not None:
        backplane_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await backplane_task
    reminder_task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await reminder_task
    await engine.dispose()
    with contextlib.suppress(Exception):
        await get_redis().aclose()
    logger.info("application_shutdown")


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None if settings.is_production else "/redoc",
    openapi_url=None if settings.is_production else f"{settings.api_v1_prefix}/openapi.json",
    lifespan=lifespan,
)

# --- Middleware (added inner-to-outer; last added runs first) ---------------
register_exception_handlers(app)

app.add_middleware(
    RateLimitMiddleware,
    limiter=_auth_limiter,
    path_predicate=_is_rate_limited_path,
)
app.add_middleware(CorrelationIdMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=[
        "Authorization",
        "Content-Type",
        "X-Correlation-Id",
        "X-Hub-Signature-256",
        "X-Telegram-Bot-Api-Secret-Token",
        "Range",
        "Accept",
    ],
    expose_headers=["X-Correlation-Id", "Content-Range", "Accept-Ranges"],
)


# --- Routers ----------------------------------------------------------------
# Each module exposes plain APIRouters; we aggregate them under the versioned
# prefix so the mount point is owned by the composition root, not the modules.
_MODULE_ROUTERS: tuple[APIRouter, ...] = (
    auth_router,
    users_router,
    rbac_router,
    departments_router,
    teams_router,
    employees_router,
    organization_router,
    skills_router,
    products_router,
    projects_router,
    portfolio_router,
    phases_router,
    sprints_router,
    partitions_router,
    tasks_router,
    dependencies_router,
    blockers_router,
    pending_work_router,
    comments_router,
    files_router,
    notifications_router,
    devices_router,
    chat_router,
    music_router,
    analytics_router,
    search_router,
    public_docs_router,
    docs_router,
    calendar_router,
    github_router,
    whatsapp_router,
    integrations_router,
    automations_router,
    mcp_router,
)

for module_router in _MODULE_ROUTERS:
    app.include_router(module_router, prefix=settings.api_v1_prefix)

# --- GraphQL Engine ---------------------------------------------------------
graphql_app = GraphQLRouter(
    schema=graphql_schema,
    context_getter=get_graphql_context,
    graphql_ide=None if settings.is_production else "graphiql",
)
app.include_router(graphql_app, prefix="/graphql", tags=["GraphQL"])
app.include_router(graphql_app, prefix=f"{settings.api_v1_prefix}/graphql", tags=["GraphQL"])


# --- Infra endpoints --------------------------------------------------------
@app.get("/health", tags=["Infra"], include_in_schema=False)
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/ready", tags=["Infra"], include_in_schema=False)
async def ready() -> dict[str, Any]:
    """Readiness probe checking database and cache health (E-11)."""
    from sqlalchemy import text
    async with AsyncSessionLocal() as db:
        await db.execute(text("SELECT 1"))
    if settings.realtime_backplane_enabled:
        with contextlib.suppress(Exception):
            await get_redis().ping()
    return {"status": "ready"}


@app.get("/", tags=["Infra"], include_in_schema=False)
async def root() -> dict[str, str]:
    info = {"service": settings.app_name}
    if not settings.is_production:
        info["docs"] = "/docs"
    return info


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    """Real-time channel.

    The JWT is passed as the `access_token` query parameter because browsers
    cannot set custom headers during the WS handshake (see websocket_manager).
    Clients may join/leave broadcast groups by sending
    `{"action": "join"|"leave", "group": "<name>"}`.
    """
    import time
    from uuid import UUID as _UUID
    from app.core.security import is_token_revoked
    from app.core.current_user import CurrentUser

    raw_token = websocket.query_params.get("access_token")
    if not raw_token:
        await websocket.close(code=4401)
        return
    try:
        payload = decode_token(raw_token)
        if payload.get("type") != TOKEN_TYPE_ACCESS:
            raise ValueError("not an access token")
        exp = payload.get("exp")
        if exp and time.time() >= exp:
            await websocket.close(code=4401)
            return

        jti = payload.get("jti")
        sub = payload.get("sub", "")
        iat = payload.get("iat")
        if await is_token_revoked(jti, sub, iat):
            await websocket.close(code=4401)
            return

        user_id = _UUID(sub)
        current_user = CurrentUser(
            user_id=user_id,
            email=payload.get("email", ""),
            full_name=payload.get("name", ""),
            roles=payload.get("roles", []),
            permissions=payload.get("permissions", []),
            allow_role_bypass=payload.get("allow_role_bypass", True),
        )
    except Exception:  # noqa: BLE001 - any decode/shape failure => unauthorized
        await websocket.close(code=4401)
        return

    await connection_manager.connect(websocket, user_id)
    joined_groups: set[str] = set()
    MAX_GROUPS_PER_SOCKET = 50

    try:
        while True:
            # Check token expiration on each frame (H-1)
            if exp and time.time() >= exp:
                await websocket.close(code=4401)
                break
            if await is_token_revoked(jti, sub, iat):
                await websocket.close(code=4401)
                break

            try:
                message = await websocket.receive_json()
            except WebSocketDisconnect:
                break
            except Exception:
                # Malformed frame or unexpected error; do not crash
                continue

            action = message.get("action")
            group = str(message.get("group") or "").strip()
            if not group or len(group) > 128:
                continue

            if action == "join":
                if len(joined_groups) >= MAX_GROUPS_PER_SOCKET:
                    continue

                # Group join authorization check (H-1)
                is_authorized = False
                if group == "presence":
                    is_authorized = True
                elif group.startswith(("chat:", "music:")):
                    from app.core.database import AsyncSessionLocal
                    if group.startswith("chat:"):
                        from app.modules.chat.service import is_member
                    else:
                        from app.modules.music.service import is_member

                    try:
                        channel_id = _UUID(group.split(":", 1)[1])
                    except ValueError:
                        continue
                    async with AsyncSessionLocal() as db:
                        if await is_member(db, channel_id, user_id):
                            is_authorized = True
                elif group.startswith(("project:", "project-")):
                    from app.core.database import AsyncSessionLocal
                    from app.modules.collaboration.authorization import _require_project_access
                    sep = ":" if ":" in group else "-"
                    try:
                        proj_id = _UUID(group.split(sep, 1)[1])
                        async with AsyncSessionLocal() as db:
                            await _require_project_access(db, current_user, proj_id)
                            is_authorized = True
                    except Exception:
                        is_authorized = False
                elif group.startswith(("task:", "task-")):
                    from app.core.database import AsyncSessionLocal
                    from app.modules.collaboration.authorization import _require_task_access
                    sep = ":" if ":" in group else "-"
                    try:
                        t_id = _UUID(group.split(sep, 1)[1])
                        async with AsyncSessionLocal() as db:
                            await _require_task_access(db, current_user, t_id)
                            is_authorized = True
                    except Exception:
                        is_authorized = False

                if is_authorized:
                    connection_manager.join_group(websocket, group)
                    joined_groups.add(group)

            elif action == "leave" and group:
                connection_manager.leave_group(websocket, group)
                joined_groups.discard(group)

    except WebSocketDisconnect:
        pass
    finally:
        connection_manager.disconnect(websocket, user_id)
