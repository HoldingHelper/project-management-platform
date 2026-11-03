"""PMP Telegram Bot domain module."""

from app.modules.telegram.bot import (
    close_bot,
    feed_telegram_update,
    get_bot,
    get_dispatcher,
    setup_bot_webhook,
)

__all__ = [
    "get_bot",
    "get_dispatcher",
    "feed_telegram_update",
    "close_bot",
    "setup_bot_webhook",
]

