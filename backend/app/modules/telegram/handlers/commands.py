"""Slash command handlers for the PMP Telegram Bot."""

from __future__ import annotations

import structlog
from aiogram import Router
from aiogram.filters import Command, CommandStart
from aiogram.types import Message

from app.core.database import AsyncSessionLocal
from app.modules.telegram.capabilities import TelegramCapabilityService
from app.modules.telegram.executor import CommandExecutor
from app.modules.telegram.formatter import format_help_message
from app.modules.telegram.schemas import (
    ListProjectsIntent,
    SearchTasksIntent,
    ViewAnalyticsIntent,
    ViewCurrentSprintIntent,
)
from app.modules.telegram.security import (
    disconnect_telegram_account,
    link_telegram_account,
    resolve_telegram_user,
)
from app.modules.telegram.state import (
    conversation_state_manager,
    get_user_language,
    set_user_language,
)
from app.modules.telegram.ui import make_dynamic_main_menu, make_help_keyboard

logger = structlog.get_logger(__name__)
router = Router(name="telegram_commands")


@router.message(CommandStart())
async def handle_start(message: Message) -> None:
    """Handle /start and /start <link_code> deep links matching user client language."""
    user_tg_id = message.from_user.id if message.from_user else message.chat.id
    username = message.from_user.username if message.from_user else None
    client_code = message.from_user.language_code if message.from_user else None

    # Detect user's client language: if English, start in English; if Persian, start in Persian
    lang = "en" if client_code and client_code.strip().lower().startswith("en") else "fa"
    await set_user_language(user_tg_id, lang)

    text = (message.text or "").strip()
    parts = text.split(maxsplit=1)
    link_code = parts[1].strip() if len(parts) > 1 else None

    async with AsyncSessionLocal() as db:
        if link_code:
            success, reply_text, user = await link_telegram_account(db, user_tg_id, username, link_code)
            if success and user:
                # Reload current user with permissions
                _, current_user = await resolve_telegram_user(db, user_tg_id)
                caps = await TelegramCapabilityService.resolve_user_capabilities(db, current_user)
                if lang == "en":
                    reply_text = f"✅ Your Telegram account was successfully linked to <b>{user.full_name}</b> ({user.email})."
                    menu_header = (
                        "📋 <b>PMP Smart Assistant Main Menu</b>\n"
                        "The following options are configured based on your active permissions:"
                    )
                else:
                    menu_header = (
                        "📋 <b>منوی اصلی دستیار هوشمند PMP</b>\n"
                        "گزینه‌های زیر بر اساس مجوزهای فعال حساب شما تنظیم شده‌اند:"
                    )
                await message.answer(reply_text, parse_mode="HTML")
                await message.answer(
                    menu_header,
                    parse_mode="HTML",
                    reply_markup=make_dynamic_main_menu(caps, lang=lang),
                )
            else:
                if lang == "en" and not success:
                    reply_text = "Invalid or expired linking code. Please obtain a fresh link from the settings panel."
                await message.answer(reply_text, parse_mode="HTML")
            return

        # Check existing connection
        user, current_user = await resolve_telegram_user(db, user_tg_id)
        if user and current_user:
            caps = await TelegramCapabilityService.resolve_user_capabilities(db, current_user)
            if lang == "en":
                welcome_text = (
                    f"👋 Hello <b>{user.full_name}</b>!\n"
                    f"Welcome to the Project Management Platform (PMP) Smart Assistant.\n\n"
                    f"Your dynamic menu is ready based on your active PMP permissions:"
                )
            else:
                welcome_text = (
                    f"👋 سلام <b>{user.full_name}</b>!\n"
                    f"به دستیار هوشمند پلتفرم مدیریت پروژه خوش آمدید.\n\n"
                    f"منوی دسترسی‌های شما به صورت پویا بر اساس مجوزهای فعلی PMP آماده است:"
                )
            await message.answer(
                welcome_text,
                parse_mode="HTML",
                reply_markup=make_dynamic_main_menu(caps, lang=lang),
            )
        else:
            if lang == "en":
                unlinked_text = (
                    "👋 <b>Welcome to Project Management Platform (PMP) Bot!</b>\n\n"
                    "Your Telegram account is not connected to the platform yet.\n\n"
                    "<b>How to connect:</b>\n"
                    "1. Open the PMP web platform in your browser.\n"
                    "2. Navigate to <b>Settings > Integrations</b>.\n"
                    "3. Click on <b>Connect Telegram Bot</b> to generate your direct authorization link.\n"
                    "4. Open that link to connect your account securely and automatically."
                )
            else:
                unlinked_text = (
                    "👋 <b>به ربات پلتفرم مدیریت پروژه (PMP) خوش آمدید!</b>\n\n"
                    "حساب تلگرام شما هنوز به پلتفرم متصل نشده است.\n\n"
                    "<b>مراحل اتصال حساب:</b>\n"
                    "1. وارد سامانه PMP در مرورگر خود شوید.\n"
                    "2. به بخش <b>تنظیمات (Settings) > یکپارچه‌سازی‌ها (Integrations)</b> بروید.\n"
                    "3. روی دکمه <b>اتصال به تلگرام (Connect Telegram Bot)</b> کلیک کنید تا لینک مستقیم ورود دریافت نمایید.\n"
                    "4. با باز کردن آن لینک، اتصال حساب شما به صورت امن و خودکار برقرار خواهد شد."
                )
            await message.answer(unlinked_text, parse_mode="HTML")


@router.message(Command("menu"))
async def handle_menu(message: Message) -> None:
    """Show the refreshed dynamic main menu based on live PMP permissions."""
    user_tg_id = message.from_user.id if message.from_user else message.chat.id
    client_code = message.from_user.language_code if message.from_user else None
    lang = await get_user_language(user_tg_id, client_code)

    async with AsyncSessionLocal() as db:
        user, current_user = await resolve_telegram_user(db, user_tg_id)
        if not user or not current_user:
            msg = (
                "Please connect your account first via the settings panel in the web app."
                if lang == "en"
                else "لطفاً ابتدا حساب خود را با استفاده از لینک اتصال در پنل تنظیمات متصل کنید."
            )
            await message.answer(msg)
            return

        caps = await TelegramCapabilityService.resolve_user_capabilities(db, current_user)
        header = (
            "📋 <b>PMP Main Menu</b>\n<i>Your permissions are live and up to date.</i>"
            if lang == "en"
            else "📋 <b>منوی اصلی پلتفرم</b>\n<i>سطح دسترسی شما بر اساس آخرین مجوزهای سازمانی به‌روز است.</i>"
        )
        await message.answer(
            header,
            parse_mode="HTML",
            reply_markup=make_dynamic_main_menu(caps, lang=lang),
        )


@router.message(Command("disconnect"))
async def handle_disconnect(message: Message) -> None:
    """Disconnect the Telegram account from the PMP platform."""
    user_tg_id = message.from_user.id if message.from_user else message.chat.id
    client_code = message.from_user.language_code if message.from_user else None
    lang = await get_user_language(user_tg_id, client_code)

    async with AsyncSessionLocal() as db:
        success = await disconnect_telegram_account(db, user_tg_id)
        if success:
            msg = (
                "🔓 <b>Your Telegram account was successfully disconnected.</b>\n\n"
                "All platform access via this bot has been revoked. "
                "To reconnect, generate a new link in your web settings panel."
                if lang == "en"
                else "🔓 <b>اتصال حساب تلگرام شما با موفقیت قطع شد.</b>\n\n"
                "از این لحظه کلیه دسترسی‌های شما به پلتفرم از طریق این ربات باطل شد. "
                "برای اتصال مجدد، از طریق پنل تنظیمات در سامانه وب اقدام فرمایید."
            )
            await message.answer(msg, parse_mode="HTML")
        else:
            msg = "No active connected account found to disconnect." if lang == "en" else "حساب فعالی برای قطع ارتباط یافت نشد."
            await message.answer(msg)


@router.message(Command("help"))
async def handle_help(message: Message) -> None:
    """Show conversational guide and command examples with language switcher."""
    user_tg_id = message.from_user.id if message.from_user else message.chat.id
    client_code = message.from_user.language_code if message.from_user else None
    lang = await get_user_language(user_tg_id, client_code)
    await message.answer(
        format_help_message(lang),
        parse_mode="HTML",
        reply_markup=make_help_keyboard(lang),
    )


@router.message(Command("cancel"))
async def handle_cancel(message: Message) -> None:
    """Cancel any active multi-turn dialogue or confirmation."""
    user_tg_id = message.from_user.id if message.from_user else message.chat.id
    client_code = message.from_user.language_code if message.from_user else None
    lang = await get_user_language(user_tg_id, client_code)
    had_pending = await conversation_state_manager.cancel(user_tg_id)
    if had_pending:
        msg = "❌ Ongoing operation cancelled." if lang == "en" else "❌ عملیات جاری لغو شد."
        await message.answer(msg, parse_mode="HTML")
    else:
        msg = "No active operation to cancel." if lang == "en" else "عملیات فعالی برای لغو وجود ندارد."
        await message.answer(msg, parse_mode="HTML")


@router.message(Command("projects"))
async def handle_projects(message: Message) -> None:
    """List accessible projects."""
    user_tg_id = message.from_user.id if message.from_user else message.chat.id
    client_code = message.from_user.language_code if message.from_user else None
    lang = await get_user_language(user_tg_id, client_code)

    async with AsyncSessionLocal() as db:
        user, current_user = await resolve_telegram_user(db, user_tg_id)
        if not user or not current_user:
            msg = "Please connect your account first." if lang == "en" else "لطفاً ابتدا حساب خود را متصل کنید."
            await message.answer(msg)
            return

        executor = CommandExecutor(db, current_user, user_tg_id)
        result = await executor.execute(ListProjectsIntent(raw_query=message.text or "", language=lang))
        await message.answer(result.text, parse_mode="HTML", reply_markup=result.reply_markup)


@router.message(Command("mywork", "my_work"))
async def handle_mywork(message: Message) -> None:
    """Show personal My Work and Dashboard hub."""
    user_tg_id = message.from_user.id if message.from_user else message.chat.id
    client_code = message.from_user.language_code if message.from_user else None
    lang = await get_user_language(user_tg_id, client_code)

    async with AsyncSessionLocal() as db:
        user, current_user = await resolve_telegram_user(db, user_tg_id)
        if not user or not current_user:
            msg = "Please connect your account first." if lang == "en" else "لطفاً ابتدا حساب خود را متصل کنید."
            await message.answer(msg)
            return

        executor = CommandExecutor(db, current_user, user_tg_id)
        result = await executor.execute(
            ViewAnalyticsIntent(report_type="personal", raw_query=message.text or "", language=lang)
        )
        await message.answer(result.text, parse_mode="HTML", reply_markup=result.reply_markup)


@router.message(Command("mytasks"))
async def handle_mytasks(message: Message) -> None:
    """List tasks assigned to the current user."""
    user_tg_id = message.from_user.id if message.from_user else message.chat.id
    client_code = message.from_user.language_code if message.from_user else None
    lang = await get_user_language(user_tg_id, client_code)

    async with AsyncSessionLocal() as db:
        user, current_user = await resolve_telegram_user(db, user_tg_id)
        if not user or not current_user:
            msg = "Please connect your account first." if lang == "en" else "لطفاً ابتدا حساب خود را متصل کنید."
            await message.answer(msg)
            return

        executor = CommandExecutor(db, current_user, user_tg_id)
        result = await executor.execute(SearchTasksIntent(is_my_tasks=True, raw_query=message.text or "", language=lang))
        await message.answer(result.text, parse_mode="HTML", reply_markup=result.reply_markup)


@router.message(Command("status"))
async def handle_status(message: Message) -> None:
    """Show account connection status."""
    user_tg_id = message.from_user.id if message.from_user else message.chat.id
    client_code = message.from_user.language_code if message.from_user else None
    lang = await get_user_language(user_tg_id, client_code)

    async with AsyncSessionLocal() as db:
        user, current_user = await resolve_telegram_user(db, user_tg_id)
        if not user or not current_user:
            msg = "❌ Your Telegram account is not connected." if lang == "en" else "❌ حساب تلگرام شما متصل نیست."
            await message.answer(msg)
            return

        default_role = "Standard User" if lang == "en" else "کاربر عادی"
        roles_str = ", ".join(current_user.roles) or default_role
        if lang == "en":
            info_text = (
                f"👤 <b>Connection Status:</b>\n\n"
                f"• Name: <b>{user.full_name}</b>\n"
                f"• Email: <code>{user.email}</code>\n"
                f"• Roles: <i>{roles_str}</i>\n"
                f"• Telegram User ID: <code>{user_tg_id}</code>\n"
                f"• Status: 🟢 Connected"
            )
        else:
            info_text = (
                f"👤 <b>اطلاعات اتصال:</b>\n\n"
                f"• نام: <b>{user.full_name}</b>\n"
                f"• ایمیل: <code>{user.email}</code>\n"
                f"• نقش‌ها: <i>{roles_str}</i>\n"
                f"• شناسه کاربری تلگرام: <code>{user_tg_id}</code>\n"
                f"• وضعیت: 🟢 متصل"
            )
        await message.answer(info_text, parse_mode="HTML")


@router.message(Command("sprint"))
async def handle_sprint(message: Message) -> None:
    """Show current active sprint."""
    user_tg_id = message.from_user.id if message.from_user else message.chat.id
    client_code = message.from_user.language_code if message.from_user else None
    lang = await get_user_language(user_tg_id, client_code)

    async with AsyncSessionLocal() as db:
        user, current_user = await resolve_telegram_user(db, user_tg_id)
        if not user or not current_user:
            msg = "Please connect your account first." if lang == "en" else "لطفاً ابتدا حساب خود را متصل کنید."
            await message.answer(msg)
            return

        executor = CommandExecutor(db, current_user, user_tg_id)
        result = await executor.execute(ViewCurrentSprintIntent(language=lang))
        await message.answer(result.text, parse_mode="HTML", reply_markup=result.reply_markup)


@router.message(Command("analytics"))
async def handle_analytics(message: Message) -> None:
    """Show personal dashboard analytics."""
    user_tg_id = message.from_user.id if message.from_user else message.chat.id
    client_code = message.from_user.language_code if message.from_user else None
    lang = await get_user_language(user_tg_id, client_code)

    async with AsyncSessionLocal() as db:
        user, current_user = await resolve_telegram_user(db, user_tg_id)
        if not user or not current_user:
            msg = "Please connect your account first." if lang == "en" else "لطفاً ابتدا حساب خود را متصل کنید."
            await message.answer(msg)
            return

        executor = CommandExecutor(db, current_user, user_tg_id)
        result = await executor.execute(ViewAnalyticsIntent(language=lang))
        await message.answer(result.text, parse_mode="HTML", reply_markup=result.reply_markup)

