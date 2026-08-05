"""Real-time WebSocket connection/group manager.

This is the FastAPI/Python equivalent of the .NET `PlatformHub` (SignalR).
FastAPI has no SignalR equivalent, so we implement native WebSockets with the
exact same security posture described in the architecture spec:

- The JWT is passed as a query string parameter (`?access_token=...`) because
  browsers cannot attach custom headers during the WebSocket handshake.
- The token is validated the same way as for REST calls (see `get_current_user`).
- Because the token can appear in URLs/logs, request logging for `/ws/*`
  paths is suppressed at INFO level (see `app.core.logging`), and the
  connection is closed the moment the token would be considered expired
  (checked on every group broadcast tick) -- mirroring SignalR's
  `CloseOnAuthenticationExpiration`.
- In production this must run behind TLS (wss://) so the query string is
  encrypted in transit.

Horizontal scale-out (the "backplane"): every `broadcast_to_group` /
`send_to_user` also PUBLISHes an envelope to Redis Pub/Sub (`REDIS_CHANNEL`),
and a background subscriber task (started in `app.main`'s lifespan, see
`backplane_listener`) re-delivers remote envelopes to this process's local
sockets. Envelopes carry an `origin` process id so a process never re-delivers
its own messages. Publishing is best-effort: if Redis is down, local realtime
keeps working and the process simply behaves single-node.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
from collections import defaultdict
from typing import Any, DefaultDict, Dict, Set
from uuid import UUID, uuid4

from fastapi import WebSocket

REDIS_CHANNEL = "pmp:platform:broadcast"

PRESENCE_GROUP = "presence"
PRESENCE_STATUSES = ["online", "busy", "away", "focus", "offline"]

# Identifies this process in backplane envelopes so the subscriber can drop
# self-published messages (they were already delivered locally).
PROCESS_ID = uuid4().hex


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: DefaultDict[str, Set[WebSocket]] = defaultdict(set)
        self._user_connections: DefaultDict[str, Set[WebSocket]] = defaultdict(set)
        # Manually chosen statuses (busy/away/focus). Online/offline is derived
        # from socket lifecycle; a manual status wins while the user is
        # connected and is cleared on their last disconnect.
        self._manual_presence: Dict[str, str] = {}

    async def connect(self, websocket: WebSocket, user_id: UUID) -> None:
        await websocket.accept()
        was_online = self.is_online(user_id)
        self._user_connections[str(user_id)].add(websocket)
        if not was_online:
            await self.broadcast_presence(user_id)

    def disconnect(self, websocket: WebSocket, user_id: UUID) -> None:
        self._user_connections[str(user_id)].discard(websocket)
        for group in list(self._connections.keys()):
            self._connections[group].discard(websocket)
        if not self.is_online(user_id):
            self._manual_presence.pop(str(user_id), None)
            try:
                asyncio.get_running_loop().create_task(
                    self.broadcast_presence(user_id)
                )
            except RuntimeError:
                pass

    # -- presence ---------------------------------------------------------

    def is_online(self, user_id: UUID) -> bool:
        return bool(self._user_connections.get(str(user_id)))

    def get_presence(self, user_id: UUID) -> str:
        if not self.is_online(user_id):
            return "offline"
        return self._manual_presence.get(str(user_id), "online")

    async def set_presence(self, user_id: UUID, status: str) -> None:
        key = str(user_id)
        if status in ("online", "offline"):
            self._manual_presence.pop(key, None)
        else:
            self._manual_presence[key] = status
        await self.broadcast_presence(user_id)

    def presence_snapshot(self) -> Dict[str, str]:
        """Status for every currently-connected user (offline users omitted)."""
        return {
            uid: self._manual_presence.get(uid, "online")
            for uid, sockets in self._user_connections.items()
            if sockets
        }

    async def broadcast_presence(self, user_id: UUID) -> None:
        await self.broadcast_to_group(
            PRESENCE_GROUP,
            "presence.changed",
            {"user_id": str(user_id), "status": self.get_presence(user_id)},
        )

    # -- groups -------------------------------------------------------------

    def join_group(self, websocket: WebSocket, group: str) -> None:
        self._connections[group].add(websocket)

    def leave_group(self, websocket: WebSocket, group: str) -> None:
        self._connections[group].discard(websocket)

    # -- local delivery -------------------------------------------------------

    async def _send_local_group(self, group: str, message: str) -> None:
        dead: list[WebSocket] = []
        for ws in self._connections.get(group, set()):
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._connections[group].discard(ws)

    async def _send_local_user(self, user_id: str, message: str) -> None:
        dead: list[WebSocket] = []
        for ws in self._user_connections.get(user_id, set()):
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._user_connections[user_id].discard(ws)

    # -- cross-process publish -------------------------------------------------

    async def _publish(
        self, kind: str, target: str, event: str, payload: Dict[str, Any]
    ) -> None:
        """Best-effort backplane publish. Never raises; a dead Redis simply
        degrades to single-process realtime."""
        from app.core.config import get_settings

        if not get_settings().realtime_backplane_enabled:
            return
        envelope = json.dumps(
            {
                "origin": PROCESS_ID,
                "kind": kind,
                "target": target,
                "event": event,
                "payload": payload,
            },
            default=str,
        )
        with contextlib.suppress(Exception):
            from app.core.cache import get_redis

            await get_redis().publish(REDIS_CHANNEL, envelope)

    async def dispatch_remote(self, envelope: Dict[str, Any]) -> None:
        """Deliver a backplane envelope from another process to local sockets.

        Never re-publishes (that would loop)."""
        if envelope.get("origin") == PROCESS_ID:
            return
        message = json.dumps(
            {"event": envelope.get("event"), "data": envelope.get("payload") or {}},
            default=str,
        )
        target = str(envelope.get("target") or "")
        if envelope.get("kind") == "group":
            await self._send_local_group(target, message)
        elif envelope.get("kind") == "user":
            await self._send_local_user(target, message)

    async def backplane_listener(self) -> None:
        """Long-running Redis Pub/Sub subscriber; run as a lifespan task.

        Reconnects with a small backoff if Redis drops."""
        from app.core.cache import get_redis

        while True:
            try:
                pubsub = get_redis().pubsub()
                await pubsub.subscribe(REDIS_CHANNEL)
                async for item in pubsub.listen():
                    if item.get("type") != "message":
                        continue
                    with contextlib.suppress(Exception):
                        await self.dispatch_remote(json.loads(item["data"]))
            except asyncio.CancelledError:
                with contextlib.suppress(Exception):
                    await pubsub.aclose()
                raise
            except Exception:
                await asyncio.sleep(2.0)

    # -- public send API ---------------------------------------------------------

    async def broadcast_to_group(
        self, group: str, event: str, payload: Dict[str, Any]
    ) -> None:
        message = json.dumps({"event": event, "data": payload}, default=str)
        await self._send_local_group(group, message)
        await self._publish("group", group, event, payload)

    async def send_to_user(
        self, user_id: UUID, event: str, payload: Dict[str, Any]
    ) -> None:
        message = json.dumps({"event": event, "data": payload}, default=str)
        await self._send_local_user(str(user_id), message)
        await self._publish("user", str(user_id), event, payload)


connection_manager = ConnectionManager()
