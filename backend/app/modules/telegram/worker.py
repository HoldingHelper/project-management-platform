"""Standalone polling worker for the PMP Telegram Bot (development and dedicated workers)."""

from __future__ import annotations

import asyncio
import signal
import sys

import structlog

from app.core.audit import register_audit_listeners
from app.modules.analytics.event_handlers import register_analytics_event_handlers
from app.core.config import get_settings
from app.core.database import engine
from app.core.logging import configure_logging
from app.core.storage import file_storage_service
from app.modules.telegram.bot import close_bot, get_bot, get_dispatcher, setup_bot_commands
from app.modules.telegram.notifications import register_telegram_event_handlers

logger = structlog.get_logger(__name__)
settings = get_settings()


async def run_worker() -> None:
    """Run aiogram polling loop."""
    configure_logging(debug=settings.debug)
    register_audit_listeners()
    register_analytics_event_handlers()

    bot = get_bot()
    if not bot:
        logger.error(
            "telegram_worker_token_missing",
            message="TELEGRAM_BOT_TOKEN is not configured in backend .env. Exiting worker.",
        )
        sys.exit(1)

    try:
        file_storage_service.ensure_bucket()
        register_telegram_event_handlers()
    except Exception as exc:  # noqa: BLE001
        logger.warning("storage_bucket_init_failed", error=str(exc))

    dp = get_dispatcher()

    logger.info(
        "telegram_polling_worker_started",
        bot_username=settings.telegram_bot_username,
        environment=settings.environment,
    )

    try:
        # Clear webhook before polling
        await bot.delete_webhook(drop_pending_updates=False)
        # Register menu commands and set menu button
        await setup_bot_commands(bot)
        await dp.start_polling(bot, handle_signals=True)
    except (asyncio.CancelledError, KeyboardInterrupt):
        logger.info("telegram_worker_interrupted")
    finally:
        await close_bot()
        await engine.dispose()
        logger.info("telegram_worker_stopped")


def main() -> None:
    try:
        asyncio.run(run_worker())
    except (KeyboardInterrupt, SystemExit):
        pass


if __name__ == "__main__":
    main()

