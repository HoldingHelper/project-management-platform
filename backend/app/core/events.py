"""A tiny in-process, async pub/sub event bus.

This is the Python analogue of the MediatR `INotification` pattern used to
keep modules decoupled: the owning module publishes a domain event (a frozen
dataclass), and any number of other modules subscribe handlers to it without
either side importing the other's models/repositories directly.
"""

from __future__ import annotations

import asyncio
import inspect
from collections import defaultdict
from typing import Any, Awaitable, Callable, DefaultDict, List, Type

import structlog

logger = structlog.get_logger(__name__)

Handler = Callable[[Any], Awaitable[None]] | Callable[[Any], None]


class EventBus:
    def __init__(self) -> None:
        self._subscribers: DefaultDict[Type[Any], List[Handler]] = defaultdict(list)

    def subscribe(self, event_type: Type[Any], handler: Handler) -> None:
        self._subscribers[event_type].append(handler)

    async def publish(self, event: Any) -> None:
        handlers = self._subscribers.get(type(event), [])
        for handler in handlers:
            try:
                result = handler(event)
                if inspect.isawaitable(result):
                    await result
            except (
                Exception
            ):  # pragma: no cover - defensive; handlers must not break publishers
                logger.exception(
                    "event_handler_failed",
                    event=type(event).__name__,
                    handler=getattr(handler, "__name__", str(handler)),
                )

    def publish_sync_fire_and_forget(self, event: Any) -> None:
        """Schedules publish() on the running loop without awaiting it, useful
        from synchronous SQLAlchemy event listeners."""
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(self.publish(event))
        except RuntimeError:
            logger.warning("event_bus_no_loop", event=type(event).__name__)


event_bus = EventBus()
