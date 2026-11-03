"""Conversational message handler with multi-turn dialogues, follow-up context, and entity resolution."""

from __future__ import annotations

import html
import re
from typing import Any, Dict
from uuid import UUID

import structlog
from aiogram import F, Router
from aiogram.types import BufferedInputFile, Message

from app.core.database import AsyncSessionLocal
from app.modules.telegram.executor import CommandExecutor
from app.modules.telegram.nlp import parse_user_intent
from app.modules.telegram.schemas import (
    AssignTaskIntent,
    CreateTaskIntent,
    LinkAccountIntent,
    UnknownIntent,
    UpdateTaskDetailsIntent,
    UpdateTaskStatusIntent,
)
from app.modules.telegram.security import link_telegram_account, resolve_telegram_user
from app.modules.telegram.state import conversation_state_manager, get_user_language

logger = structlog.get_logger(__name__)
router = Router(name="telegram_messages")


@router.message(F.text & ~F.text.startswith("/"))
async def handle_text_message(message: Message) -> None:
    """Handle conversational natural-language messages in Persian or English."""
    user_tg_id = message.from_user.id if message.from_user else message.chat.id
    raw_text = (message.text or "").strip()
    if not raw_text:
        return

    async with AsyncSessionLocal() as db:
        client_code = message.from_user.language_code if message.from_user else None
        lang = await get_user_language(user_tg_id, client_code)

        # 1. Check if user is sending a hex linking code directly (8 to 64 chars)
        if re.fullmatch(r"[A-Fa-f0-9]{8,64}", raw_text):
            username = message.from_user.username if message.from_user else None
            success, reply_text, _ = await link_telegram_account(db, user_tg_id, username, raw_text)
            if lang == "en" and not success:
                reply_text = "Invalid or expired linking code. Please check your settings panel."
            await message.answer(reply_text, parse_mode="HTML")
            return

        # 2. Check authentication using the Telegram User ID (from_user.id)
        user, current_user = await resolve_telegram_user(db, user_tg_id)
        if not user or not current_user:
            unauth_msg = (
                "🔒 <b>Your Telegram account is not connected yet.</b>\n\n"
                "Please connect your account via the settings panel in the web app, or send /start for instructions."
                if lang == "en"
                else (
                    "🔒 <b>حساب تلگرام شما هنوز متصل نشده است.</b>\n\n"
                    "لطفاً ابتدا کد اتصال را از پنل کاربری در سامانه PMP دریافت کرده و ارسال کنید.\n"
                    "برای راهنمایی دستور /start را ارسال نمایید."
                )
            )
            await message.answer(unauth_msg, parse_mode="HTML")
            return

        norm_text = raw_text.strip().lower()

        # Check menu keyword
        if norm_text in ("منو", "منوی اصلی", "menu", "main menu", "📋 منوی اصلی", "📋 منوی اصلی گزینه‌ها", "منو اصلی"):
            from app.modules.telegram.capabilities import TelegramCapabilityService
            from app.modules.telegram.ui import make_dynamic_main_menu, make_persistent_reply_keyboard
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
            return

        # Handle Reply Keyboard: 📊 My Work / کارهای من
        if norm_text in ("📊 کارهای من", "کارهای من", "my work", "📊 my work", "داشبورد من", "mywork", "my_work", "/mywork", "/my_work"):
            from app.modules.telegram.schemas import ViewAnalyticsIntent
            executor = CommandExecutor(db, current_user, user_tg_id)
            res = await executor.execute(ViewAnalyticsIntent(report_type="personal", language=lang))
            await message.answer(res.text, parse_mode="HTML", reply_markup=res.reply_markup)
            return

        # Handle Reply Keyboard: 📋 My Tasks / تسک‌های من
        if norm_text in ("📋 تسک‌های من", "تسک‌های من", "تسک های من", "my tasks", "📋 my tasks"):
            from app.modules.telegram.schemas import SearchTasksIntent
            executor = CommandExecutor(db, current_user, user_tg_id)
            res = await executor.execute(SearchTasksIntent(assigned_to_me=True, language=lang))
            await message.answer(res.text, parse_mode="HTML", reply_markup=res.reply_markup)
            return

        # Handle Reply Keyboard: ➕ New Task / تسک جدید
        if norm_text in ("➕ تسک جدید", "تسک جدید", "new task", "➕ new task", "ایجاد تسک"):
            from app.modules.telegram.capabilities import TelegramCapabilityService
            from app.modules.telegram.wizard import TaskWizard
            if not TelegramCapabilityService.can_create_task(current_user):
                msg = "⛔️ شما مجوز ایجاد تسک جدید را ندارید." if lang == "fa" else "⛔️ You do not have permission to create tasks."
                await message.answer(msg)
                return
            text, markup = await TaskWizard.start(db, current_user, user_tg_id, lang=lang)
            await message.answer(text, parse_mode="HTML", reply_markup=markup)
            return

        # Handle Reply Keyboard: 📁 Projects / پروژه‌ها
        if norm_text in ("📁 پروژه‌ها", "پروژه‌ها", "پروژه ها", "projects", "📁 projects"):
            from app.modules.telegram.schemas import ListProjectsIntent
            executor = CommandExecutor(db, current_user, user_tg_id)
            res = await executor.execute(ListProjectsIntent(language=lang))
            await message.answer(res.text, parse_mode="HTML", reply_markup=res.reply_markup)
            return

        # Handle Reply Keyboard: 🏢 New Project / ساخت پروژه
        if norm_text in ("🏢 ساخت پروژه", "ساخت پروژه", "پروژه جدید", "new project", "🏢 new project", "ایجاد پروژه"):
            from app.modules.telegram.capabilities import TelegramCapabilityService
            from app.modules.telegram.wizard import ProjectWizard
            if not TelegramCapabilityService.can_create_project(current_user):
                msg = "⛔️ شما مجوز ساخت پروژه جدید را ندارید." if lang == "fa" else "⛔️ You do not have permission to create projects."
                await message.answer(msg)
                return
            text, markup = await ProjectWizard.start(db, current_user, user_tg_id, lang=lang)
            await message.answer(text, parse_mode="HTML", reply_markup=markup)
            return

        # Handle Reply Keyboard: 🎫 New Ticket / ثبت تیکت (Notify selected people or every active member of a team and add it to their dashboard)
        if norm_text in ("🎫 ثبت تیکت", "ثبت تیکت", "ارسال تیکت", "تیکت جدید", "new ticket", "🎫 new ticket", "ticket"):
            from app.modules.telegram.capabilities import TelegramCapabilityService
            if not TelegramCapabilityService.can_create_ticket(current_user):
                msg = "⛔️ شما مجوز ثبت تیکت را ندارید." if lang == "fa" else "⛔️ You do not have permission to create tickets."
                await message.answer(msg)
                return
            await conversation_state_manager.set_pending_intent(
                user_tg_id,
                intent_data={"action": "create_ticket"},
                missing_field="ticket_text_menu",
                prompt_text="لطفاً عنوان و متن تیکت، و نام هم‌تیمی یا تیم دریافت‌کننده را ارسال فرمایید:",
            )
            ticket_prompt = (
                "🎫 <b>ارسال به عنوان تیکت (Send as Ticket)</b>\n\n"
                "<i>Notify selected people or every active member of a team and add it to their dashboard.</i>\n\n"
                "این کار باعث ارسال اعلان فوری به افراد یا تیم مورد نظر شده و تسک را مستقیماً به داشبورد کاری آن‌ها اضافه می‌کند.\n\n"
                "لطفاً عنوان تیکت و تیم یا هم‌تیمی مقصد را ارسال فرمایید:\n"
                "<i>مثال: «تیکت برای تیم فرانت‌اند: بهینه‌سازی ریسپانسیو فرم»</i>\n"
                "<i>یا: «تیکت به علی: بازبینی کد احراز هویت»</i>"
                if lang == "fa"
                else (
                    "🎫 <b>Send as Ticket</b>\n\n"
                    "<i>Notify selected people or every active member of a team and add it to their dashboard.</i>\n\n"
                    "Please enter the ticket title and target team or teammate:\n"
                    "<i>Example: 'Ticket to QA team: Verify registration redirect'</i>"
                )
            )
            await message.answer(ticket_prompt, parse_mode="HTML")
            return

        # Handle Reply Keyboard: ❓ Help / راهنما
        if norm_text in ("❓ راهنما", "راهنما", "help", "❓ help"):
            from app.modules.telegram.formatter import format_help_message
            from app.modules.telegram.ui import make_help_keyboard
            help_text = format_help_message(lang=lang)
            await message.answer(help_text, parse_mode="HTML", reply_markup=make_help_keyboard(lang=lang))
            return

        # Handle Reply Keyboard: 🌐 Language / تغییر زبان
        if norm_text in ("🌐 تغییر زبان", "تغییر زبان", "زبان", "language", "🌐 language"):
            from app.modules.telegram.ui import make_help_keyboard
            lang_txt = (
                "🌐 <b>انتخاب زبان دستیار هوشمند:</b>\n\n"
                "لطفاً زبان مورد نظر خود را انتخاب فرمایید:\n"
                "Please choose your preferred bot language:"
                if lang == "fa"
                else (
                    "🌐 <b>Select Bot Language:</b>\n\n"
                    "Please choose your preferred language for the assistant:"
                )
            )
            await message.answer(lang_txt, parse_mode="HTML", reply_markup=make_help_keyboard(lang=lang))
            return

        state = await conversation_state_manager.get_state(user_tg_id)

        # 3. Check if an active wizard is running
        from app.modules.telegram.wizard import TelegramWizardManager, get_wizard_data
        if get_wizard_data(state.pending_intent):
            handled = await TelegramWizardManager.handle_text_input(
                db, current_user, user_tg_id, raw_text, message
            )
            if handled:
                return

        # 4. Handle multi-turn pending intent if active
        if state.pending_intent:
            handled = await _handle_pending_multi_turn(db, message, current_user, state.pending_intent)
            if handled:
                return

        # 5. Parse incoming text
        intent = await parse_user_intent(raw_text, lang=lang)
        if hasattr(intent, "language"):
            intent.language = lang

        # 6. Intercept Creation Intents to launch step-by-step interactive wizards
        from app.modules.telegram.schemas import CreateProjectIntent
        if isinstance(intent, CreateProjectIntent):
            from app.modules.telegram.wizard import ProjectWizard
            prefill: Dict[str, Any] = {}
            if intent.name:
                prefill["name"] = intent.name
            if intent.description:
                prefill["description"] = intent.description
            if intent.priority:
                prefill["priority"] = intent.priority
            if intent.product_name:
                prefill["product_name"] = intent.product_name
            text_out, markup = await ProjectWizard.start(db, current_user, user_tg_id, lang=lang, prefill=prefill)
            await message.answer(text_out, parse_mode="HTML", reply_markup=markup)
            return

        if isinstance(intent, CreateTaskIntent):
            from app.modules.telegram.wizard import TaskWizard
            prefill = {}
            if intent.title:
                prefill["title"] = intent.title
            if intent.description:
                prefill["description"] = intent.description
            if intent.priority:
                prefill["priority"] = intent.priority
            if intent.project_name:
                from app.modules.telegram.resolver import EntityResolver
                res = await EntityResolver.resolve_project(db, intent.project_name, current_user)
                if res.is_exact and res.entity:
                    prefill["project_id"] = str(res.entity.id)
                    prefill["project_name"] = res.entity.name
            else:
                last_pid = await conversation_state_manager.get_context(user_tg_id, "last_project_id")
                if last_pid:
                    try:
                        p = await repo.get_project(db, UUID(last_pid))
                        if p:
                            prefill["project_id"] = str(p.id)
                            prefill["project_name"] = p.name
                    except Exception:
                        pass

            text_out, markup = await TaskWizard.start(db, current_user, user_tg_id, lang=lang, prefill=prefill)
            await message.answer(text_out, parse_mode="HTML", reply_markup=markup)
            return

        # 7. Execute Intent with user_tg_id
        executor = CommandExecutor(db, current_user, user_tg_id)
        result = await executor.execute(intent)

        # 7. Check for SVG diagram attachment
        if result.extra_data and "svg_content" in result.extra_data:
            svg_bytes = result.extra_data["svg_content"].encode("utf-8")
            filename = result.extra_data.get("filename", "diagram.svg")
            input_file = BufferedInputFile(svg_bytes, filename=filename)
            await message.answer_document(
                document=input_file,
                caption=result.text,
                parse_mode="HTML",
            )
            return

        # Send formatted reply
        await message.answer(
            result.text,
            parse_mode="HTML",
            reply_markup=result.reply_markup,
        )


async def _handle_pending_multi_turn(
    db: AsyncSession,
    message: Message,
    current_user: Any,
    pending: Dict[str, Any],
) -> bool:
    """Handle step-by-step clarification for incomplete intents."""
    user_tg_id = message.from_user.id if message.from_user else message.chat.id
    client_code = message.from_user.language_code if message.from_user else None
    lang = await get_user_language(user_tg_id, client_code)
    text = (message.text or "").strip()
    missing_field = pending.get("missing_field")
    intent_data = pending.get("intent", {})

    if not missing_field:
        await conversation_state_manager.clear_pending_intent(user_tg_id)
        return False

    # Check for cancellation
    if text.lower() in ("cancel", "لغو", "انصراف", "کنسل"):
        await conversation_state_manager.clear_pending_intent(user_tg_id)
        cancel_msg = "❌ عملیات لغو شد." if lang == "fa" else "❌ Operation cancelled."
        await message.answer(cancel_msg, parse_mode="HTML")
        return True

    if missing_field == "project_name":
        intent_data["project_name"] = text
        prompt = "در Sprint فعلی یا Backlog؟" if lang == "fa" else "In Current Sprint or Backlog?"
        await conversation_state_manager.set_pending_intent(
            user_tg_id,
            intent_data=intent_data,
            missing_field="sprint_mode",
            prompt_text=prompt,
        )
        await message.answer(prompt, parse_mode="HTML")
        return True

    elif missing_field == "sprint_mode":
        if any(kw in text.lower() for kw in ("sprint", "اسپرینت", "فعلی", "جاری", "current")):
            intent_data["in_current_sprint"] = True
            intent_data["is_backlog"] = False
        else:
            intent_data["is_backlog"] = True
            intent_data["in_current_sprint"] = False

        prompt = (
            "به چه کسی assign شود؟ (برای صرف‌نظر بنویسید هیچکس)"
            if lang == "fa"
            else "Who should this be assigned to? (Type 'none' to skip)"
        )
        await conversation_state_manager.set_pending_intent(
            user_tg_id,
            intent_data=intent_data,
            missing_field="assignee",
            prompt_text=prompt,
        )
        await message.answer(prompt, parse_mode="HTML")
        return True

    elif missing_field == "assignee":
        if text.lower() not in ("هیچکس", "هیچ کس", "کسی نه", "none", "no one", "no"):
            intent_data["assignee_names"] = [text]

        # Reconstruct typed CreateTaskIntent and execute!
        await conversation_state_manager.clear_pending_intent(user_tg_id)
        intent_data["language"] = lang
        task_intent = CreateTaskIntent(**intent_data)
        executor = CommandExecutor(db, current_user, user_tg_id)
        result = await executor.execute(task_intent)
        await message.answer(result.text, parse_mode="HTML", reply_markup=result.reply_markup)
        return True

    elif missing_field == "task_assignee_direct":
        await conversation_state_manager.clear_pending_intent(user_tg_id)
        assign_intent = AssignTaskIntent(
            task_id_or_title=intent_data.get("task_id"),
            assignee_names=[text],
            language=lang,
        )
        executor = CommandExecutor(db, current_user, user_tg_id)
        result = await executor.execute(assign_intent)
        await message.answer(result.text, parse_mode="HTML", reply_markup=result.reply_markup)
        return True

    elif missing_field == "task_comment_direct":
        await conversation_state_manager.clear_pending_intent(user_tg_id)
        from app.modules.telegram.schemas import AddCommentIntent
        comment_intent = AddCommentIntent(
            task_id_or_title=intent_data.get("task_id"),
            comment_text=text,
            language=lang,
        )
        executor = CommandExecutor(db, current_user, user_tg_id)
        result = await executor.execute(comment_intent)
        await message.answer(result.text, parse_mode="HTML", reply_markup=result.reply_markup)
        return True

    elif missing_field == "project_name_menu":
        await conversation_state_manager.clear_pending_intent(user_tg_id)
        from app.modules.telegram.nlp.parser import parse_user_intent
        from app.modules.telegram.schemas import CreateProjectIntent
        parsed = await parse_user_intent(text, lang=lang)
        if isinstance(parsed, CreateProjectIntent):
            proj_intent = parsed
        else:
            proj_intent = CreateProjectIntent(name=text, raw_query=text, language=lang)
        if hasattr(proj_intent, "language"):
            proj_intent.language = lang
        executor = CommandExecutor(db, current_user, user_tg_id)
        result = await executor.execute(proj_intent)
        await message.answer(result.text, parse_mode="HTML", reply_markup=result.reply_markup)
        return True

    elif missing_field == "backlog_task_project":
        from app.modules.telegram.resolver import EntityResolver
        p_res = await EntityResolver.resolve_project(db, text, current_user)
        if p_res.is_exact and p_res.entity:
            from app.modules.projects import service as projects_service
            project = p_res.entity
            task_id_raw = intent_data.get("task_id")
            s_res = await EntityResolver.resolve_sprint(db, project.id, "current")
            if not s_res.is_exact or not s_res.entity:
                no_sp_msg = (
                    f"پروژه «{project.name}» اسپرینت فعالی ندارد. ابتدا یک اسپرینت ایجاد کنید."
                    if lang == "fa"
                    else f"Project '{project.name}' has no active sprint. Please create a sprint first."
                )
                await message.answer(no_sp_msg, parse_mode="HTML")
                return True
            await projects_service.attach_task_to_phase(db, UUID(task_id_raw), s_res.entity.id)
            prompt = "نام فرد را برای ارجاع تسک ارسال کنید:" if lang == "fa" else "Send assignee name:"
            await conversation_state_manager.set_pending_intent(
                user_tg_id,
                intent_data={"task_id": task_id_raw},
                missing_field="task_assignee_direct",
                prompt_text=prompt,
            )
            connected_msg = (
                f"✅ تسک به پروژه <b>«{project.name}»</b> (اسپرینت {s_res.entity.name}) متصل شد.\n\n"
                f"👤 لطفاً نام یا نام‌کاربری فرد را برای ارجاع تسک ارسال کنید:"
                if lang == "fa"
                else (
                    f"✅ Task attached to project <b>«{project.name}»</b> (Sprint {s_res.entity.name}).\n\n"
                    f"👤 Please send the teammate name or email to assign:"
                )
            )
            await message.answer(connected_msg, parse_mode="HTML")
            return True
        elif p_res.is_ambiguous:
            from app.modules.telegram.ui import make_disambiguation_keyboard
            dis_msg = "چند پروژه با نام مشابه پیدا شد. لطفاً یکی را انتخاب کنید:" if lang == "fa" else "Multiple projects found. Please choose one:"
            await message.answer(
                dis_msg,
                reply_markup=make_disambiguation_keyboard("project", p_res.candidates, label_attr="name"),
            )
            return True
        else:
            from app.modules.projects import service as projects_service
            projects, _ = await projects_service.list_all_projects(db, 1, 50, current_user)
            from app.modules.telegram.ui import make_project_selection_keyboard
            not_found_msg = f"پروژه‌ای با نام «{text}» پیدا نشد. لطفاً از دکمه‌های زیر انتخاب فرمایید:" if lang == "fa" else f"Project '{text}' not found. Please select from below:"
            await message.answer(
                not_found_msg,
                reply_markup=make_project_selection_keyboard(projects, lang=lang),
            )
            return True

    elif missing_field == "task_project_select":
        from app.modules.telegram.resolver import EntityResolver
        p_res = await EntityResolver.resolve_project(db, text, current_user)
        if p_res.is_exact and p_res.entity:
            project = p_res.entity
            await conversation_state_manager.set_context(user_tg_id, "last_project_id", str(project.id))
            if intent_data.get("title"):
                intent_data["project_name"] = project.name
                intent_data["language"] = lang
                await conversation_state_manager.clear_pending_intent(user_tg_id)
                from app.modules.telegram.schemas import CreateTaskIntent
                task_intent = CreateTaskIntent(**intent_data)
                executor = CommandExecutor(db, current_user, user_tg_id)
                result = await executor.execute(task_intent)
                await message.answer(result.text, parse_mode="HTML", reply_markup=result.reply_markup)
                return True
            else:
                prompt = (
                    f"لطفاً عنوان تسک برای پروژه «{project.name}» را ارسال فرمایید:"
                    if lang == "fa"
                    else f"Please enter task title for project '{project.name}':"
                )
                await conversation_state_manager.set_pending_intent(
                    user_tg_id,
                    intent_data={"action": "create_task", "project_id": str(project.id), "project_name": project.name},
                    missing_field="task_title_menu",
                    prompt_text=prompt,
                )
                sel_msg = (
                    f"📁 پروژه <b>«{project.name}»</b> انتخاب شد.\n\n➕ لطفاً عنوان تسک مورد نظر را ارسال فرمایید:"
                    if lang == "fa"
                    else f"📁 Project <b>«{project.name}»</b> selected.\n\n➕ Please enter task title:"
                )
                await message.answer(sel_msg, parse_mode="HTML")
                return True
        elif p_res.is_ambiguous:
            from app.modules.telegram.ui import make_disambiguation_keyboard
            dis_msg = "چند پروژه با نام مشابه پیدا شد. لطفاً یکی را انتخاب کنید:" if lang == "fa" else "Multiple projects found. Please choose one:"
            await message.answer(
                dis_msg,
                reply_markup=make_disambiguation_keyboard("project", p_res.candidates, label_attr="name"),
            )
            return True
        else:
            from app.modules.projects import service as projects_service
            projects, _ = await projects_service.list_all_projects(db, 1, 50, current_user)
            from app.modules.telegram.ui import make_project_selection_keyboard
            not_found_msg = f"پروژه‌ای با نام «{text}» پیدا نشد. لطفاً از دکمه‌های زیر انتخاب فرمایید:" if lang == "fa" else f"Project '{text}' not found. Please select from below:"
            await message.answer(
                not_found_msg,
                reply_markup=make_project_selection_keyboard(projects, lang=lang),
            )
            return True

    elif missing_field == "sprint_batch_project_select":
        from app.modules.telegram.resolver import EntityResolver
        p_res = await EntityResolver.resolve_project(db, text, current_user)
        if p_res.is_exact and p_res.entity:
            project = p_res.entity
            await conversation_state_manager.set_context(user_tg_id, "last_project_id", str(project.id))
            intent_data["project_name"] = project.name
            intent_data["language"] = lang
            await conversation_state_manager.clear_pending_intent(user_tg_id)
            from app.modules.telegram.schemas import CreateSprintBatchIntent
            sprint_intent = CreateSprintBatchIntent(**intent_data)
            executor = CommandExecutor(db, current_user, user_tg_id)
            result = await executor.execute(sprint_intent)
            await message.answer(result.text, parse_mode="HTML", reply_markup=result.reply_markup)
            return True
        elif p_res.is_ambiguous:
            from app.modules.telegram.ui import make_disambiguation_keyboard
            dis_msg = "چند پروژه با نام مشابه پیدا شد. لطفاً یکی را انتخاب کنید:" if lang == "fa" else "Multiple projects found with similar name. Please choose one:"
            await message.answer(
                dis_msg,
                reply_markup=make_disambiguation_keyboard("project", p_res.candidates, label_attr="name"),
            )
            return True
        else:
            from app.modules.projects import service as projects_service
            projects, _ = await projects_service.list_all_projects(db, 1, 50, current_user)
            from app.modules.telegram.ui import make_project_selection_keyboard
            not_found_msg = f"پروژه‌ای با نام «{text}» پیدا نشد. لطفاً از دکمه‌های زیر انتخاب فرمایید:" if lang == "fa" else f"Project '{text}' not found. Please select from below:"
            await message.answer(
                not_found_msg,
                reply_markup=make_project_selection_keyboard(projects, lang=lang),
            )
            return True

    elif missing_field == "task_title_menu":
        await conversation_state_manager.clear_pending_intent(user_tg_id)
        from app.modules.telegram.nlp.parser import parse_user_intent
        from app.modules.telegram.schemas import CreateTaskIntent
        parsed = await parse_user_intent(text, lang=lang)
        if isinstance(parsed, CreateTaskIntent):
            task_intent = parsed
        else:
            task_intent = CreateTaskIntent(title=text, raw_query=text, language=lang)

        if not task_intent.project_name and intent_data.get("project_name"):
            task_intent.project_name = intent_data.get("project_name")
        task_intent.language = lang

        executor = CommandExecutor(db, current_user, user_tg_id)
        result = await executor.execute(task_intent)
        await message.answer(result.text, parse_mode="HTML", reply_markup=result.reply_markup)
        return True

    elif missing_field == "ticket_text_menu":
        await conversation_state_manager.clear_pending_intent(user_tg_id)
        from app.modules.telegram.nlp.parser import parse_user_intent
        from app.modules.telegram.schemas import CreateTicketIntent
        parsed = await parse_user_intent(text, lang=lang)
        if isinstance(parsed, CreateTicketIntent):
            ticket_intent = parsed
        else:
            ticket_intent = CreateTicketIntent(title=text, raw_query=text, language=lang)
        ticket_intent.language = lang

        executor = CommandExecutor(db, current_user, user_tg_id)
        result = await executor.execute(ticket_intent)
        await message.answer(result.text, parse_mode="HTML", reply_markup=result.reply_markup)
        return True

    elif missing_field == "docs_search_menu":
        await conversation_state_manager.clear_pending_intent(user_tg_id)
        from app.modules.telegram.schemas import SearchDocsIntent
        docs_intent = SearchDocsIntent(query=text, raw_query=text, language=lang)
        executor = CommandExecutor(db, current_user, user_tg_id)
        result = await executor.execute(docs_intent)
        await message.answer(result.text, parse_mode="HTML", reply_markup=result.reply_markup)
        return True

    elif missing_field == "proj_ed_name":
        await conversation_state_manager.clear_pending_intent(user_tg_id)
        proj_id_str = intent_data.get("project_id")
        if not proj_id_str:
            return False
        p_uuid = UUID(proj_id_str)
        from app.modules.telegram.capabilities import TelegramCapabilityService
        if not TelegramCapabilityService.can_manage_project(current_user):
            msg = "⛔️ شما مجوز ویرایش پروژه را ندارید." if lang == "fa" else "⛔️ You do not have permission to edit projects."
            await message.answer(msg)
            return True
        from app.modules.projects.schemas import ProjectUpdate
        from app.modules.projects import service as projects_service
        await projects_service.update_project(db, p_uuid, ProjectUpdate(name=text.strip()))
        await db.commit()

        executor = CommandExecutor(db, current_user, user_tg_id)
        overview, product_name, manager_name, members_names = await executor._get_project_card_data(p_uuid)
        from app.modules.telegram.formatter import format_project_overview_card
        from app.modules.telegram.ui import make_project_actions_keyboard
        card_text = format_project_overview_card(
            overview, product_name=product_name, manager_name=manager_name, members_names=members_names, lang=lang
        )
        caps = await TelegramCapabilityService.resolve_user_capabilities(db, current_user)
        succ = (
            f"✅ نام پروژه با موفقیت به <b>«{html.escape(text.strip())}»</b> تغییر یافت.\n\n{card_text}"
            if lang == "fa"
            else f"✅ Project name updated to <b>'{html.escape(text.strip())}'</b> successfully.\n\n{card_text}"
        )
        await message.answer(succ, parse_mode="HTML", reply_markup=make_project_actions_keyboard(p_uuid, capabilities=caps, lang=lang))
        return True

    elif missing_field == "proj_ed_desc":
        await conversation_state_manager.clear_pending_intent(user_tg_id)
        proj_id_str = intent_data.get("project_id")
        if not proj_id_str:
            return False
        p_uuid = UUID(proj_id_str)
        from app.modules.telegram.capabilities import TelegramCapabilityService
        if not TelegramCapabilityService.can_manage_project(current_user):
            msg = "⛔️ شما مجوز ویرایش پروژه را ندارید." if lang == "fa" else "⛔️ You do not have permission to edit projects."
            await message.answer(msg)
            return True
        from app.modules.projects.schemas import ProjectUpdate
        from app.modules.projects import service as projects_service
        await projects_service.update_project(db, p_uuid, ProjectUpdate(description=text.strip()))
        await db.commit()

        executor = CommandExecutor(db, current_user, user_tg_id)
        overview, product_name, manager_name, members_names = await executor._get_project_card_data(p_uuid)
        from app.modules.telegram.formatter import format_project_overview_card
        from app.modules.telegram.ui import make_project_actions_keyboard
        card_text = format_project_overview_card(
            overview, product_name=product_name, manager_name=manager_name, members_names=members_names, lang=lang
        )
        caps = await TelegramCapabilityService.resolve_user_capabilities(db, current_user)
        succ = (
            f"✅ توضیحات پروژه با موفقیت به‌روزرسانی شد.\n\n{card_text}"
            if lang == "fa"
            else f"✅ Project description updated successfully.\n\n{card_text}"
        )
        await message.answer(succ, parse_mode="HTML", reply_markup=make_project_actions_keyboard(p_uuid, capabilities=caps, lang=lang))
        return True

    elif missing_field == "proj_ed_budget":
        await conversation_state_manager.clear_pending_intent(user_tg_id)
        proj_id_str = intent_data.get("project_id")
        if not proj_id_str:
            return False
        p_uuid = UUID(proj_id_str)
        from app.modules.telegram.capabilities import TelegramCapabilityService
        if not TelegramCapabilityService.can_manage_project(current_user):
            msg = "⛔️ شما مجوز ویرایش پروژه را ندارید." if lang == "fa" else "⛔️ You do not have permission to edit projects."
            await message.answer(msg)
            return True

        clean_str = text.translate(str.maketrans("۰۱۲۳۴۵۶۷۸۹", "0123456789"))
        clean_str = re.sub(r"[^\d.]", "", clean_str)
        budget_val = float(clean_str) if clean_str else 0.0

        from app.modules.projects.schemas import ProjectUpdate
        from app.modules.projects import service as projects_service
        await projects_service.update_project(db, p_uuid, ProjectUpdate(budget=budget_val))
        await db.commit()

        executor = CommandExecutor(db, current_user, user_tg_id)
        overview, product_name, manager_name, members_names = await executor._get_project_card_data(p_uuid)
        from app.modules.telegram.formatter import format_project_overview_card
        from app.modules.telegram.ui import make_project_actions_keyboard
        card_text = format_project_overview_card(
            overview, product_name=product_name, manager_name=manager_name, members_names=members_names, lang=lang
        )
        caps = await TelegramCapabilityService.resolve_user_capabilities(db, current_user)
        budget_disp = f"{budget_val:,.0f} تومان" if lang == "fa" else f"{budget_val:,.0f}"
        succ = (
            f"✅ بودجه پروژه با موفقیت به <b>«{budget_disp}»</b> به‌روزرسانی شد.\n\n{card_text}"
            if lang == "fa"
            else f"✅ Project budget updated to <b>'{budget_disp}'</b> successfully.\n\n{card_text}"
        )
        await message.answer(succ, parse_mode="HTML", reply_markup=make_project_actions_keyboard(p_uuid, capabilities=caps, lang=lang))
        return True

    elif missing_field == "task_ed_title":
        await conversation_state_manager.clear_pending_intent(user_tg_id)
        task_id_str = intent_data.get("task_id")
        if not task_id_str:
            return False
        t_uuid = UUID(task_id_str)
        from app.modules.telegram.resolver import EntityResolver
        t_res = await EntityResolver.resolve_task(db, task_id_str, current_user)
        if not t_res.is_exact or not t_res.entity:
            not_f = "Task not found." if lang == "en" else "تسک یافت نشد."
            await message.answer(not_f)
            return True
        task = t_res.entity
        from app.modules.telegram.capabilities import TelegramCapabilityService
        if not TelegramCapabilityService.can_edit_task(current_user, task):
            msg = "⛔️ You do not have permission to edit this task." if lang == "en" else "⛔️ شما مجوز لازم برای ویرایش این تسک را ندارید."
            await message.answer(msg)
            return True

        new_title = text.strip()
        from app.modules.projects.schemas import TaskUpdate
        from app.modules.projects import service as projects_service
        updated = await projects_service.update_task(
            db, t_uuid, TaskUpdate(title=new_title), current_user=current_user
        )
        await db.commit()

        caps = await TelegramCapabilityService.resolve_user_capabilities(db, current_user)
        from app.modules.telegram.formatter import format_task_details
        formatted = format_task_details(updated, lang=lang)
        st_val = str(getattr(updated.status, "value", updated.status))
        succ = (
            f"✅ Task title updated to <b>«{html.escape(new_title)}»</b> successfully.\n\n{formatted}"
            if lang == "en"
            else f"✅ عنوان تسک با موفقیت به <b>«{html.escape(new_title)}»</b> تغییر یافت.\n\n{formatted}"
        )
        from app.modules.telegram.ui import make_task_actions_keyboard
        await message.answer(
            succ,
            parse_mode="HTML",
            reply_markup=make_task_actions_keyboard(updated.id, st_val, capabilities=caps, lang=lang),
        )
        return True

    elif missing_field == "task_ed_desc":
        await conversation_state_manager.clear_pending_intent(user_tg_id)
        task_id_str = intent_data.get("task_id")
        if not task_id_str:
            return False
        t_uuid = UUID(task_id_str)
        from app.modules.telegram.resolver import EntityResolver
        t_res = await EntityResolver.resolve_task(db, task_id_str, current_user)
        if not t_res.is_exact or not t_res.entity:
            not_f = "Task not found." if lang == "en" else "تسک یافت نشد."
            await message.answer(not_f)
            return True
        task = t_res.entity
        from app.modules.telegram.capabilities import TelegramCapabilityService
        if not TelegramCapabilityService.can_edit_task(current_user, task):
            msg = "⛔️ You do not have permission to edit this task." if lang == "en" else "⛔️ شما مجوز لازم برای ویرایش این تسک را ندارید."
            await message.answer(msg)
            return True

        new_desc = text.strip()
        from app.modules.projects.schemas import TaskUpdate
        from app.modules.projects import service as projects_service
        updated = await projects_service.update_task(
            db, t_uuid, TaskUpdate(description=new_desc), current_user=current_user
        )
        await db.commit()

        caps = await TelegramCapabilityService.resolve_user_capabilities(db, current_user)
        from app.modules.telegram.formatter import format_task_details
        formatted = format_task_details(updated, lang=lang)
        st_val = str(getattr(updated.status, "value", updated.status))
        succ = (
            f"✅ Task description updated successfully.\n\n{formatted}"
            if lang == "en"
            else f"✅ توضیحات تسک با موفقیت به‌روزرسانی شد.\n\n{formatted}"
        )
        from app.modules.telegram.ui import make_task_actions_keyboard
        await message.answer(
            succ,
            parse_mode="HTML",
            reply_markup=make_task_actions_keyboard(updated.id, st_val, capabilities=caps, lang=lang),
        )
        return True

    elif missing_field == "task_ed_due":
        await conversation_state_manager.clear_pending_intent(user_tg_id)
        task_id_str = intent_data.get("task_id")
        if not task_id_str:
            return False
        t_uuid = UUID(task_id_str)
        from app.modules.telegram.resolver import EntityResolver
        t_res = await EntityResolver.resolve_task(db, task_id_str, current_user)
        if not t_res.is_exact or not t_res.entity:
            not_f = "Task not found." if lang == "en" else "تسک یافت نشد."
            await message.answer(not_f)
            return True
        task = t_res.entity
        from app.modules.telegram.capabilities import TelegramCapabilityService
        if not TelegramCapabilityService.can_edit_task(current_user, task):
            msg = "⛔️ You do not have permission to edit this task." if lang == "en" else "⛔️ شما مجوز لازم برای ویرایش این تسک را ندارید."
            await message.answer(msg)
            return True

        from app.modules.telegram.dates import parse_relative_date
        due_d = parse_relative_date(text)
        if not due_d:
            try:
                from datetime import date
                due_d = date.fromisoformat(text.strip())
            except Exception:
                due_d = None

        if not due_d:
            invalid_msg = "❌ تاریخ وارد شده نامعتبر است." if lang == "fa" else "❌ Invalid date format."
            await message.answer(invalid_msg)
            return True

        from app.modules.projects.schemas import TaskUpdate
        from app.modules.projects import service as projects_service
        updated = await projects_service.update_task(
            db, t_uuid, TaskUpdate(due_date=due_d), current_user=current_user
        )
        await db.commit()

        caps = await TelegramCapabilityService.resolve_user_capabilities(db, current_user)
        from app.modules.telegram.formatter import format_task_details
        formatted = format_task_details(updated, lang=lang)
        st_val = str(getattr(updated.status, "value", updated.status))
        succ = (
            f"✅ Due date updated to <b>{due_d}</b> successfully.\n\n{formatted}"
            if lang == "en"
            else f"✅ مهلت انجام تسک با موفقیت به <b>{due_d}</b> به‌روزرسانی شد.\n\n{formatted}"
        )
        from app.modules.telegram.ui import make_task_actions_keyboard
        await message.answer(
            succ,
            parse_mode="HTML",
            reply_markup=make_task_actions_keyboard(updated.id, st_val, capabilities=caps, lang=lang),
        )
        return True

    await conversation_state_manager.clear_pending_intent(user_tg_id)
    return False

    await conversation_state_manager.clear_pending_intent(user_tg_id)
    return False

