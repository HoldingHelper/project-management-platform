"""Handlers package for PMP Telegram Bot."""

from app.modules.telegram.handlers.callbacks import router as callbacks_router
from app.modules.telegram.handlers.commands import router as commands_router
from app.modules.telegram.handlers.files import router as files_router
from app.modules.telegram.handlers.messages import router as messages_router

__all__ = ["commands_router", "messages_router", "callbacks_router", "files_router"]

