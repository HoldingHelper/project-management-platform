"""aiogram Bot and Dispatcher setup, lifecycle management, and webhook feeding."""

from __future__ import annotations

from typing import Any, Dict, Optional

import structlog
from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.types import (
    BotCommand,
    BotCommandScopeAllPrivateChats,
    BotCommandScopeDefault,
    MenuButtonCommands,
    Update,
)

from app.core.config import get_settings
from app.modules.telegram.handlers import (
    callbacks_router,
    commands_router,
    files_router,
    messages_router,
)

logger = structlog.get_logger(__name__)
settings = get_settings()

_bot: Optional[Bot] = None
_dispatcher: Optional[Dispatcher] = None


def get_dispatcher() -> Dispatcher:
    """Create and configure the aiogram Dispatcher with domain routers."""
    global _dispatcher
    if _dispatcher is None:
        dp = Dispatcher()
        dp.include_router(commands_router)
        dp.include_router(callbacks_router)
        dp.include_router(files_router)
        dp.include_router(messages_router)
        _dispatcher = dp
    return _dispatcher


def get_bot() -> Optional[Bot]:
    """Return configured aiogram Bot instance, or None if token not set."""
    global _bot
    if _bot is None:
        token = settings.telegram_bot_token
        if not token:
            logger.debug("telegram_bot_token_not_set")
            return None
        _bot = Bot(
            token=token,
            default=DefaultBotProperties(parse_mode=ParseMode.HTML),
        )
    return _bot


async def setup_bot_commands(bot: Bot) -> bool:
    """Register official Telegram Bot commands in Persian and English, and configure menu button."""
    fa_commands = [
        BotCommand(command="menu", description="📋 منوی اصلی گزینه‌ها"),
        BotCommand(command="mywork", description="📊 کارهای من و داشبورد"),
        BotCommand(command="mytasks", description="📋 تسک‌های من"),
        BotCommand(command="projects", description="📁 پروژه‌ها"),
        BotCommand(command="sprint", description="🚀 اسپرینت جاری"),
        BotCommand(command="analytics", description="📊 گزارشات و داشبورد"),
        BotCommand(command="help", description="❓ راهنما و تغییر زبان"),
        BotCommand(command="status", description="👤 وضعیت اتصال حساب"),
        BotCommand(command="cancel", description="❌ لغو عملیات فعلی"),
    ]
    en_commands = [
        BotCommand(command="menu", description="📋 Main Menu Options"),
        BotCommand(command="mywork", description="📊 My Work & Dashboard"),
        BotCommand(command="mytasks", description="📋 My Tasks"),
        BotCommand(command="projects", description="📁 Projects"),
        BotCommand(command="sprint", description="🚀 Current Sprint"),
        BotCommand(command="analytics", description="📊 Reports & Analytics"),
        BotCommand(command="help", description="❓ Guide & Switch Language"),
        BotCommand(command="status", description="👤 Account Connection Status"),
        BotCommand(command="cancel", description="❌ Cancel Ongoing Action"),
    ]
    try:
        # Default scope (global fallback)
        await bot.set_my_commands(commands=fa_commands, scope=BotCommandScopeDefault())
        await bot.set_my_commands(commands=fa_commands, scope=BotCommandScopeDefault(), language_code="fa")
        await bot.set_my_commands(commands=en_commands, scope=BotCommandScopeDefault(), language_code="en")

        # All private chats scope (explicitly triggers command menu button on mobile/desktop clients)
        await bot.set_my_commands(commands=fa_commands, scope=BotCommandScopeAllPrivateChats())
        await bot.set_my_commands(commands=fa_commands, scope=BotCommandScopeAllPrivateChats(), language_code="fa")
        await bot.set_my_commands(commands=en_commands, scope=BotCommandScopeAllPrivateChats(), language_code="en")

        await bot.set_chat_menu_button(menu_button=MenuButtonCommands())
        logger.info("telegram_bot_commands_configured", count=len(fa_commands))
        return True
    except Exception as exc:
        logger.warning("telegram_bot_commands_setup_failed", error=str(exc))
        return False


async def setup_bot_webhook(bot: Bot) -> bool:
    """Register webhook with Telegram API in production environments."""
    if not settings.telegram_webhook_url:
        return False

    await setup_bot_commands(bot)
    url = settings.telegram_webhook_url.rstrip("/") + "/api/v1/integrations/telegram/webhook"
    secret = settings.telegram_webhook_secret or None
    try:
        await bot.set_webhook(
            url=url,
            secret_token=secret,
            drop_pending_updates=False,
            allowed_updates=["message", "callback_query"],
        )
        logger.info("telegram_webhook_configured", url=url)
        return True
    except Exception as exc:
        logger.error("telegram_webhook_setup_failed", error=str(exc))
        return False


async def feed_telegram_update(payload: Dict[str, Any]) -> None:
    """Feed a webhook update dictionary directly to the aiogram dispatcher."""
    bot = get_bot()
    if not bot:
        logger.warning("telegram_bot_not_configured_for_update")
        return

    dp = get_dispatcher()
    update = Update.model_validate(payload, context={"bot": bot})
    await dp.feed_update(bot=bot, update=update)


async def close_bot() -> None:
    """Close bot session on application shutdown."""
    global _bot
    if _bot is not None:
        try:
            await _bot.session.close()
            logger.info("telegram_bot_session_closed")
        except Exception as exc:
            logger.warning("telegram_bot_close_error", error=str(exc))
        _bot = None

