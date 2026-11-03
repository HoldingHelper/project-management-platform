"""Callback query handlers for inline keyboards (disambiguation, quick actions, confirmations)."""

from __future__ import annotations

from datetime import date
from uuid import UUID

import html

import structlog
from aiogram import F, Router
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup
from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.modules.projects.enums import Priority, ProjectStatus, TaskStatus
from app.modules.projects.models import Product
from app.modules.projects.product_access import require_product_access, visible_product_ids
from app.modules.projects.schemas import ProjectCreate, ProjectUpdate
from app.modules.projects import service as projects_service
from app.modules.projects.service import update_task_status
from app.modules.telegram.capabilities import TelegramCapabilityService
from app.modules.telegram.executor import CommandExecutor
from app.modules.telegram.formatter import (
    format_help_message,
    format_project_overview_card,
    format_project_preview,
    format_project_sprints_view,
    format_project_tasks_view,
)
from app.modules.telegram.schemas import (
    ListProjectMembersIntent,
    ListProjectsIntent,
    SearchTasksIntent,
    ViewAnalyticsIntent,
    ViewCurrentSprintIntent,
    ViewTaskIntent,
)
from app.modules.telegram.security import resolve_telegram_user
from app.modules.telegram.state import (
    conversation_state_manager,
    get_user_language,
    set_user_language,
)
from app.modules.telegram.ui import (
    make_disambiguation_keyboard,
    make_dynamic_main_menu,
    make_help_keyboard,
    make_persistent_reply_keyboard,
    make_product_line_selection_keyboard,
    make_project_actions_keyboard,
    make_project_edit_menu_keyboard,
    make_project_preview_keyboard,
    make_project_priority_keyboard,
    make_project_sprints_keyboard,
    make_project_status_keyboard,
    make_project_tasks_keyboard,
    make_projects_list_keyboard,
    make_task_actions_keyboard,
)

logger = structlog.get_logger(__name__)
router = Router(name="telegram_callbacks")


@router.callback_query(F.data.startswith("select:"))
async def handle_entity_selection(query: CallbackQuery) -> None:
    """Handle user selection from disambiguation keyboard."""
    parts = (query.data or "").split(":")
    if len(parts) < 3:
        await query.answer()
        return

    entity_type = parts[1]
    item_id = parts[2]
    user_tg_id = query.from_user.id
    client_code = query.from_user.language_code if query.from_user else None
    lang = await get_user_language(user_tg_id, client_code)

    async with AsyncSessionLocal() as db:
        user, current_user = await resolve_telegram_user(db, user_tg_id)
        if not user or not current_user:
            alert = "Account not connected." if lang == "en" else "حساب متصل نیست."
            await query.answer(alert, show_alert=True)
            return

        if entity_type == "task":
            executor = CommandExecutor(db, current_user, user_tg_id)
            result = await executor.execute(ViewTaskIntent(task_id_or_title=item_id, language=lang))
            if query.message:
                await query.message.edit_text(result.text, parse_mode="HTML", reply_markup=result.reply_markup)
            notice = "Task selected." if lang == "en" else "تسک انتخاب شد."
            await query.answer(notice)

        elif entity_type == "project":
            from app.modules.telegram.resolver import EntityResolver
            p_res = await EntityResolver.resolve_project(db, item_id, current_user)
            if not p_res.is_exact or not p_res.entity:
                alert = "⛔️ You do not have access to this project." if lang == "en" else "⛔️ شما به این پروژه دسترسی ندارید."
                await query.answer(alert, show_alert=True)
                return
            await conversation_state_manager.set_context(user_tg_id, "last_project_id", item_id)
            pending = await conversation_state_manager.get_pending_intent(user_tg_id)
            intent_data = pending.get("intent_data", {}) if pending else {}
            missing = pending.get("missing_field") if pending else None
            if missing == "sprint_batch_project_select" or intent_data.get("intent_type") == "create_sprint_batch":
                intent_data["project_name"] = p_res.entity.name
                intent_data["language"] = lang
                await conversation_state_manager.clear_pending_intent(user_tg_id)
                from app.modules.telegram.schemas import CreateSprintBatchIntent
                sprint_intent = CreateSprintBatchIntent(**intent_data)
                executor = CommandExecutor(db, current_user, user_tg_id)
                result = await executor.execute(sprint_intent)
                await query.answer("Project selected." if lang == "en" else "پروژه انتخاب شد.")
                if query.message:
                    await query.message.edit_text(result.text, parse_mode="HTML", reply_markup=result.reply_markup)
                return
            await query.answer("Project selected." if lang == "en" else "پروژه انتخاب شد.")
            if query.message:
                sel_text = (
                    "✅ Project selected. Please send your next command."
                    if lang == "en"
                    else "✅ پروژه انتخاب شد. لطفاً دستور بعدی خود را ارسال کنید."
                )
                await query.message.edit_text(sel_text, parse_mode="HTML")

        elif entity_type == "user":
            await conversation_state_manager.set_context(user_tg_id, "last_user_id", item_id)
            notice = "User selected." if lang == "en" else "کاربر انتخاب شد."
            await query.answer(notice)


@router.callback_query(F.data.startswith("task_st:"))
async def handle_quick_status_change(query: CallbackQuery) -> None:
    """Handle instant task status button tap."""
    parts = (query.data or "").split(":")
    if len(parts) < 3:
        await query.answer()
        return

    task_short_id = parts[1]
    status_str = parts[2]
    user_tg_id = query.from_user.id
    client_code = query.from_user.language_code if query.from_user else None
    lang = await get_user_language(user_tg_id, client_code)

    async with AsyncSessionLocal() as db:
        user, current_user = await resolve_telegram_user(db, user_tg_id)
        if not user or not current_user:
            alert = "Account not connected." if lang == "en" else "حساب متصل نیست."
            await query.answer(alert, show_alert=True)
            return

        from app.modules.telegram.resolver import EntityResolver
        t_res = await EntityResolver.resolve_task(db, task_short_id, current_user)
        if not t_res.is_exact or not t_res.entity:
            alert = "Task not found or access denied." if lang == "en" else "تسک یافت نشد یا شما به آن دسترسی ندارید."
            await query.answer(alert, show_alert=True)
            return

        # Server-side authorization check
        if not TelegramCapabilityService.can_change_task_status(current_user, t_res.entity):
            alert = "⛔️ You do not have permission to update this task status." if lang == "en" else "⛔️ شما دسترسی لازم برای تغییر وضعیت این تسک را ندارید."
            await query.answer(alert, show_alert=True)
            return

        st_enum = TaskStatus._value2member_map_.get(status_str) or TaskStatus.DONE
        updated = await update_task_status(db, t_res.entity.id, st_enum, changed_by_user_id=current_user.user_id, current_user=current_user)

        caps = await TelegramCapabilityService.resolve_user_capabilities(db, current_user)
        ans_notice = f"Status changed to {status_str}." if lang == "en" else f"وضعیت به {status_str} تغییر کرد."
        await query.answer(ans_notice)
        if query.message:
            from app.modules.telegram.formatter import format_task_details
            formatted = format_task_details(updated, lang=lang)
            st_val = str(getattr(updated.status, "value", updated.status))
            await query.message.edit_text(
                formatted,
                parse_mode="HTML",
                reply_markup=make_task_actions_keyboard(updated.id, st_val, capabilities=caps, lang=lang),
            )


@router.callback_query(F.data.startswith("task_act:"))
async def handle_task_quick_action(query: CallbackQuery) -> None:
    """Handle task Assign / Comment / Attach button taps."""
    parts = (query.data or "").split(":")
    if len(parts) < 3:
        await query.answer()
        return

    action = parts[1]
    task_short_id = parts[2]
    user_tg_id = query.from_user.id
    client_code = query.from_user.language_code if query.from_user else None
    lang = await get_user_language(user_tg_id, client_code)

    async with AsyncSessionLocal() as db:
        user, current_user = await resolve_telegram_user(db, user_tg_id)
        if not user or not current_user:
            alert = "Account not connected." if lang == "en" else "حساب متصل نیست."
            await query.answer(alert, show_alert=True)
            return

        from app.modules.telegram.resolver import EntityResolver
        t_res = await EntityResolver.resolve_task(db, task_short_id, current_user)
        if not t_res.is_exact or not t_res.entity:
            alert = "Task not found or access denied." if lang == "en" else "تسک یافت نشد یا شما به آن دسترسی ندارید."
            await query.answer(alert, show_alert=True)
            return
        task = t_res.entity

        if action == "assign":
            if not TelegramCapabilityService.can_assign_task(current_user):
                alert = "⛔️ You do not have permission to assign tasks." if lang == "en" else "⛔️ شما مجوز لازم برای ارجاع تسک را ندارید."
                await query.answer(alert, show_alert=True)
                return
            if task.phase_id is None:
                from app.modules.projects import service as projects_service
                projects, total = await projects_service.list_all_projects(db, 1, 50, current_user)
                if not projects or total == 0:
                    alert = "⛔️ No project available to link task." if lang == "en" else "⛔️ هیچ پروژه‌ای برای اتصال تسک وجود ندارد."
                    await query.answer(alert, show_alert=True)
                    return
                elif len(projects) == 1:
                    p = projects[0]
                    s_res = await EntityResolver.resolve_sprint(db, p.id, "current")
                    if s_res.is_exact and s_res.entity:
                        await projects_service.attach_task_to_phase(db, task.id, s_res.entity.id)
                    else:
                        alert = f"Project '{p.name}' has no active sprint." if lang == "en" else f"پروژه «{p.name}» اسپرینت فعالی ندارد."
                        await query.answer(alert, show_alert=True)
                        return
                    prompt_txt = "Send assignee name:" if lang == "en" else "نام فرد را برای ارجاع تسک ارسال کنید:"
                    await conversation_state_manager.set_pending_intent(
                        user_tg_id,
                        intent_data={"task_id": str(task.id)},
                        missing_field="task_assignee_direct",
                        prompt_text=prompt_txt,
                    )
                    await query.answer()
                    if query.message:
                        reply_txt = (
                            f"✅ Task attached to project <b>«{p.name}»</b>.\n\n👤 Please enter assignee name:"
                            if lang == "en"
                            else f"✅ تسک به پروژه <b>«{p.name}»</b> متصل شد.\n\n👤 لطفاً نام یا نام‌کاربری فرد را برای ارجاع تسک ارسال کنید:"
                        )
                        await query.message.reply(reply_txt, parse_mode="HTML")
                    return
                else:
                    prompt_txt = "Select a project:" if lang == "en" else "پروژه مورد نظر را انتخاب کنید:"
                    await conversation_state_manager.set_pending_intent(
                        user_tg_id,
                        intent_data={"task_id": str(task.id), "action": "assign_backlog_task"},
                        missing_field="backlog_task_project",
                        prompt_text=prompt_txt,
                    )
                    await query.answer()
                    if query.message:
                        from app.modules.telegram.ui import make_project_selection_keyboard
                        reply_txt = (
                            f"📁 Task <b>«{task.title}»</b> is currently in Backlog.\n"
                            f"Before assigning to people, it must be attached to a project.\n"
                            f"Please select the target project:"
                            if lang == "en"
                            else f"📁 تسک <b>«{task.title}»</b> در حال حاضر در بک‌لاگ است.\n"
                            f"برای ارجاع تسک به افراد، ابتدا باید به یک پروژه متصل شود.\n"
                            f"لطفاً پروژه مورد نظر را انتخاب فرمایید:"
                        )
                        await query.message.reply(
                            reply_txt,
                            reply_markup=make_project_selection_keyboard(projects, cancel_callback="cancel:flow", lang=lang),
                            parse_mode="HTML",
                        )
                    return
            prompt_txt = "Send assignee name:" if lang == "en" else "نام فرد را برای ارجاع تسک ارسال کنید:"
            await conversation_state_manager.set_pending_intent(
                user_tg_id,
                intent_data={"task_id": str(task.id)},
                missing_field="task_assignee_direct",
                prompt_text=prompt_txt,
            )
            await query.answer()
            if query.message:
                prompt_reply = (
                    f"👤 Please enter teammate name to assign task '{task.title}':"
                    if lang == "en"
                    else f"👤 لطفاً نام یا نام‌کاربری فرد را برای ارجاع تسک «{task.title}» ارسال کنید:"
                )
                await query.message.reply(prompt_reply)

        elif action == "comment":
            if not TelegramCapabilityService.can_add_comment(current_user):
                alert = "⛔️ You do not have permission to comment on tasks." if lang == "en" else "⛔️ شما مجوز لازم برای ثبت نظر را ندارید."
                await query.answer(alert, show_alert=True)
                return
            prompt_txt = "Enter your comment:" if lang == "en" else "متن نظر خود را ارسال کنید:"
            await conversation_state_manager.set_pending_intent(
                user_tg_id,
                intent_data={"task_id": str(task.id)},
                missing_field="task_comment_direct",
                prompt_text=prompt_txt,
            )
            await query.answer()
            if query.message:
                prompt_reply = (
                    f"💬 Please enter your comment for task '{task.title}':"
                    if lang == "en"
                    else f"💬 لطفاً متن نظر خود را برای تسک «{task.title}» ارسال کنید:"
                )
                await query.message.reply(prompt_reply)

        elif action == "attach":
            if not TelegramCapabilityService.can_upload_files(current_user):
                alert = "⛔️ You do not have permission to upload files." if lang == "en" else "⛔️ شما مجوز لازم برای ارسال فایل را ندارید."
                await query.answer(alert, show_alert=True)
                return
            await conversation_state_manager.set_context(user_tg_id, "last_task_id", str(task.id))
            await query.answer()
            if query.message:
                prompt_reply = (
                    "📎 Please send your file, document, image, or voice message in Telegram."
                    if lang == "en"
                    else "📎 لطفاً فایل، سند، یا تصویر مورد نظر خود را در تلگرام ارسال فرمایید."
                )
                await query.message.reply(prompt_reply)

        elif action == "view":
            from app.modules.telegram.formatter import format_task_details
            caps = await TelegramCapabilityService.resolve_user_capabilities(db, current_user)
            formatted = format_task_details(task, lang=lang)
            st_val = str(getattr(task.status, "value", task.status))
            await query.answer()
            if query.message:
                try:
                    await query.message.edit_text(
                        formatted,
                        parse_mode="HTML",
                        reply_markup=make_task_actions_keyboard(task.id, st_val, capabilities=caps, lang=lang),
                    )
                except Exception:
                    await query.message.answer(
                        formatted,
                        parse_mode="HTML",
                        reply_markup=make_task_actions_keyboard(task.id, st_val, capabilities=caps, lang=lang),
                    )

        elif action == "edit":
            if not TelegramCapabilityService.can_edit_task(current_user, task):
                alert = "⛔️ You do not have permission to edit this task." if lang == "en" else "⛔️ شما مجوز لازم برای ویرایش این تسک را ندارید."
                await query.answer(alert, show_alert=True)
                return
            await query.answer()
            from app.modules.telegram.ui import make_task_edit_menu_keyboard
            edit_text = (
                f"✏️ <b>ویرایش تسک «{html.escape(task.title)}»:</b>\n\n"
                f"لطفاً موردی که مایل به ویرایش آن هستید را انتخاب فرمایید:"
                if lang == "fa"
                else (
                    f"✏️ <b>Edit Task '{html.escape(task.title)}':</b>\n\n"
                    f"Please select what you want to edit:"
                )
            )
            markup = make_task_edit_menu_keyboard(task.id, lang=lang)
            if query.message:
                try:
                    await query.message.edit_text(edit_text, parse_mode="HTML", reply_markup=markup)
                except Exception:
                    await query.message.answer(edit_text, parse_mode="HTML", reply_markup=markup)
            return

        elif action == "status":
            if not TelegramCapabilityService.can_change_task_status(current_user, task):
                alert = "⛔️ You do not have permission to update task status." if lang == "en" else "⛔️ شما مجوز لازم برای تغییر وضعیت این تسک را ندارید."
                await query.answer(alert, show_alert=True)
                return
            caps = await TelegramCapabilityService.resolve_user_capabilities(db, current_user)
            st_val = str(getattr(task.status, "value", task.status))
            await query.answer()
            if query.message:
                prompt_reply = (
                    f"🔄 Select new status for task <b>«{task.title}»</b>:"
                    if lang == "en"
                    else f"🔄 وضعیت جدید برای تسک <b>«{task.title}»</b> را انتخاب کنید:"
                )
                await query.message.reply(
                    prompt_reply,
                    parse_mode="HTML",
                    reply_markup=make_task_actions_keyboard(task.id, st_val, capabilities=caps, lang=lang),
                )


@router.callback_query(F.data.startswith("task_ed:"))
async def handle_task_edit_field_selection(query: CallbackQuery) -> None:
    """Handle selecting a field to edit on a task."""
    parts = (query.data or "").split(":")
    if len(parts) < 3:
        await query.answer()
        return

    field = parts[1]
    task_id_str = parts[2]
    user_tg_id = query.from_user.id
    client_code = query.from_user.language_code if query.from_user else None
    lang = await get_user_language(user_tg_id, client_code)

    async with AsyncSessionLocal() as db:
        user, current_user = await resolve_telegram_user(db, user_tg_id)
        if not user or not current_user:
            alert = "Account not connected." if lang == "en" else "حساب متصل نیست."
            await query.answer(alert, show_alert=True)
            return

        from app.modules.telegram.resolver import EntityResolver
        t_res = await EntityResolver.resolve_task(db, task_id_str, current_user)
        if not t_res.is_exact or not t_res.entity:
            alert = "⛔️ Task not found." if lang == "en" else "⛔️ تسک یافت نشد."
            await query.answer(alert, show_alert=True)
            return

        task = t_res.entity
        if not TelegramCapabilityService.can_edit_task(current_user, task):
            alert = "⛔️ You do not have permission to edit this task." if lang == "en" else "⛔️ شما مجوز لازم برای ویرایش این تسک را ندارید."
            await query.answer(alert, show_alert=True)
            return

        await query.answer()

        if field == "prio":
            from app.modules.telegram.ui import make_task_priority_keyboard
            prio_text = (
                f"⚡️ اولویت جدید برای تسک <b>«{html.escape(task.title)}»</b> را انتخاب کنید:"
                if lang == "fa"
                else f"⚡️ Select new priority for task <b>'{html.escape(task.title)}'</b>:"
            )
            markup = make_task_priority_keyboard(task.id, lang=lang)
            if query.message:
                try:
                    await query.message.edit_text(prio_text, parse_mode="HTML", reply_markup=markup)
                except Exception:
                    await query.message.answer(prio_text, parse_mode="HTML", reply_markup=markup)
            return

        elif field == "stat":
            from app.modules.telegram.ui import make_task_status_keyboard
            st_text = (
                f"🔄 وضعیت جدید برای تسک <b>«{html.escape(task.title)}»</b> را انتخاب کنید:"
                if lang == "fa"
                else f"🔄 Select new status for task <b>'{html.escape(task.title)}'</b>:"
            )
            markup = make_task_status_keyboard(task.id, lang=lang)
            if query.message:
                try:
                    await query.message.edit_text(st_text, parse_mode="HTML", reply_markup=markup)
                except Exception:
                    await query.message.answer(st_text, parse_mode="HTML", reply_markup=markup)
            return

        elif field == "title":
            prompt = (
                f"✏️ لطفاً عنوان جدید تسک <b>«{html.escape(task.title)}»</b> را ارسال فرمایید:"
                if lang == "fa"
                else f"✏️ Please send the new title for task <b>'{html.escape(task.title)}'</b>:"
            )
            await conversation_state_manager.set_pending_intent(
                user_tg_id,
                intent_data={"task_id": str(task.id)},
                missing_field="task_ed_title",
                prompt_text=prompt,
            )
            if query.message:
                await query.message.answer(prompt, parse_mode="HTML")
            return

        elif field == "desc":
            prompt = (
                f"📝 لطفاً توضیحات جدید تسک <b>«{html.escape(task.title)}»</b> را ارسال فرمایید:"
                if lang == "fa"
                else f"📝 Please send the new description for task <b>'{html.escape(task.title)}'</b>:"
            )
            await conversation_state_manager.set_pending_intent(
                user_tg_id,
                intent_data={"task_id": str(task.id)},
                missing_field="task_ed_desc",
                prompt_text=prompt,
            )
            if query.message:
                await query.message.answer(prompt, parse_mode="HTML")
            return

        elif field == "due":
            prompt = (
                f"📅 لطفاً مهلت انجام (ددلاین) جدید تسک <b>«{html.escape(task.title)}»</b> را ارسال فرمایید:\n"
                f"<i>(مثال: فردا، هفته آینده، یا 2026-11-20)</i>"
                if lang == "fa"
                else f"📅 Please send the new due date for task <b>'{html.escape(task.title)}'</b>:\n<i>(e.g., tomorrow, next Monday, or 2026-11-20)</i>"
            )
            await conversation_state_manager.set_pending_intent(
                user_tg_id,
                intent_data={"task_id": str(task.id)},
                missing_field="task_ed_due",
                prompt_text=prompt,
            )
            if query.message:
                await query.message.answer(prompt, parse_mode="HTML")
            return


@router.callback_query(F.data.startswith("task_prio:"))
async def handle_task_priority_selection(query: CallbackQuery) -> None:
    """Handle priority button selection for a task."""
    parts = (query.data or "").split(":")
    if len(parts) < 3:
        await query.answer()
        return

    task_id_str = parts[1]
    prio_str = parts[2]
    user_tg_id = query.from_user.id
    client_code = query.from_user.language_code if query.from_user else None
    lang = await get_user_language(user_tg_id, client_code)

    async with AsyncSessionLocal() as db:
        user, current_user = await resolve_telegram_user(db, user_tg_id)
        if not user or not current_user:
            alert = "Account not connected." if lang == "en" else "حساب متصل نیست."
            await query.answer(alert, show_alert=True)
            return

        from app.modules.telegram.resolver import EntityResolver
        t_res = await EntityResolver.resolve_task(db, task_id_str, current_user)
        if not t_res.is_exact or not t_res.entity:
            alert = "Task not found." if lang == "en" else "تسک یافت نشد."
            await query.answer(alert, show_alert=True)
            return

        task = t_res.entity
        if not TelegramCapabilityService.can_edit_task(current_user, task):
            alert = "⛔️ You do not have permission to edit this task." if lang == "en" else "⛔️ شما مجوز لازم برای ویرایش این تسک را ندارید."
            await query.answer(alert, show_alert=True)
            return

        from app.modules.projects.schemas import TaskUpdate
        from app.modules.projects.enums import Priority
        from app.modules.projects import service as projects_service
        prio_enum = Priority(prio_str)
        updated = await projects_service.update_task(
            db, task.id, TaskUpdate(priority=prio_enum), current_user=current_user
        )
        await db.commit()

        caps = await TelegramCapabilityService.resolve_user_capabilities(db, current_user)
        from app.modules.telegram.formatter import format_task_details
        formatted = format_task_details(updated, lang=lang)
        st_val = str(getattr(updated.status, "value", updated.status))
        ans_notice = f"Priority changed to {prio_str}." if lang == "en" else f"اولویت به {prio_str} تغییر یافت."
        await query.answer(ans_notice)
        if query.message:
            try:
                await query.message.edit_text(
                    formatted,
                    parse_mode="HTML",
                    reply_markup=make_task_actions_keyboard(updated.id, st_val, capabilities=caps, lang=lang),
                )
            except Exception:
                await query.message.answer(
                    formatted,
                    parse_mode="HTML",
                    reply_markup=make_task_actions_keyboard(updated.id, st_val, capabilities=caps, lang=lang),
                )


@router.callback_query(F.data.startswith("menu:"))
async def handle_menu_callbacks(query: CallbackQuery) -> None:
    """Handle buttons pressed from the dynamic main menu."""
    action = (query.data or "").split(":", 1)[1]
    user_tg_id = query.from_user.id
    client_code = query.from_user.language_code if query.from_user else None
    lang = await get_user_language(user_tg_id, client_code)

    async with AsyncSessionLocal() as db:
        user, current_user = await resolve_telegram_user(db, user_tg_id)
        if not user or not current_user:
            alert = "Account not connected." if lang == "en" else "حساب متصل نیست."
            await query.answer(alert, show_alert=True)
            return

        caps = await TelegramCapabilityService.resolve_user_capabilities(db, current_user)

        if action == "projects":
            if not caps.can_view_projects:
                alert = "⛔️ You do not have permission to view projects." if lang == "en" else "⛔️ شما مجوز مشاهده پروژه‌ها را ندارید."
                await query.answer(alert, show_alert=True)
                return
            await query.answer()
            executor = CommandExecutor(db, current_user, user_tg_id)
            res = await executor.execute(ListProjectsIntent(raw_query="", language=lang))
            if query.message:
                await query.message.answer(res.text, parse_mode="HTML", reply_markup=res.reply_markup)

        elif action == "mytasks":
            if not caps.can_view_tasks:
                alert = "⛔️ You do not have permission to view tasks." if lang == "en" else "⛔️ شما مجوز مشاهده تسک‌ها را ندارید."
                await query.answer(alert, show_alert=True)
                return
            await query.answer()
            executor = CommandExecutor(db, current_user, user_tg_id)
            res = await executor.execute(SearchTasksIntent(is_my_tasks=True, raw_query="", language=lang))
            if query.message:
                try:
                    await query.message.edit_text(res.text, parse_mode="HTML", reply_markup=res.reply_markup)
                except Exception:
                    await query.message.answer(res.text, parse_mode="HTML", reply_markup=res.reply_markup)

        elif action == "create_project":
            if not caps.can_create_project:
                alert = "⛔️ You do not have permission to create projects." if lang == "en" else "⛔️ شما مجوز ساخت پروژه جدید را ندارید."
                await query.answer(alert, show_alert=True)
                return
            from app.modules.telegram.wizard import TelegramWizardManager
            await TelegramWizardManager.handle_callback(db, current_user, user_tg_id, query)
            return

        elif action == "create_task":
            if not caps.can_create_task:
                alert = "⛔️ You do not have permission to create tasks." if lang == "en" else "⛔️ شما مجوز ساخت تسک را ندارید."
                await query.answer(alert, show_alert=True)
                return
            from app.modules.telegram.wizard import TelegramWizardManager
            await TelegramWizardManager.handle_callback(db, current_user, user_tg_id, query)
            return

        elif action == "current_sprint":
            if not caps.can_view_sprints:
                alert = "⛔️ You do not have permission to view sprints." if lang == "en" else "⛔️ شما مجوز مشاهده اسپرینت‌ها را ندارید."
                await query.answer(alert, show_alert=True)
                return
            await query.answer()
            executor = CommandExecutor(db, current_user, user_tg_id)
            res = await executor.execute(ViewCurrentSprintIntent(language=lang))
            if query.message:
                await query.message.answer(res.text, parse_mode="HTML", reply_markup=res.reply_markup)

        elif action == "create_ticket":
            if not caps.can_create_ticket:
                alert = "⛔️ You do not have permission to create tickets." if lang == "en" else "⛔️ شما مجوز ثبت تیکت را ندارید."
                await query.answer(alert, show_alert=True)
                return
            prompt_missing = "لطفاً عنوان تیکت و تیم یا هم‌تیمی مقصد را ارسال فرمایید:" if lang == "fa" else "Please send ticket title and target team/user:"
            await conversation_state_manager.set_pending_intent(
                user_tg_id,
                intent_data={"action": "create_ticket"},
                missing_field="ticket_text_menu",
                prompt_text=prompt_missing,
            )
            await query.answer()
            if query.message:
                ticket_prompt = (
                    "🎫 <b>ارسال به عنوان تیکت (Send as Ticket)</b>\n\n"
                    "<i>Notify selected people or every active member of a team and add it to their dashboard.</i>\n\n"
                    "این کار اعلان فوری برای افراد یا تیم مشخص‌شده ارسال کرده و تسک را مستقیماً به داشبورد کاری آن‌ها اضافه می‌کند.\n\n"
                    "لطفاً عنوان تیکت و تیم یا هم‌تیمی دریافت‌کننده را ارسال فرمایید:\n"
                    "<i>مثال: «تیکت برای تیم QA: بررسی خطای هدایت کاربر»</i>\n"
                    "<i>یا: «تیکت به علی: بازبینی طراحی کامپوننت»</i>"
                    if lang == "fa"
                    else (
                        "🎫 <b>Send as Ticket</b>\n\n"
                        "<i>Notify selected people or every active member of a team and add it to their dashboard.</i>\n\n"
                        "This will dispatch instant notification to target teams or users and add it to their workspace.\n\n"
                        "Please enter ticket title and recipient team or user:\n"
                        "<i>Example: 'Ticket to QA team: Check redirect failure'</i>"
                    )
                )
                await query.message.answer(ticket_prompt, parse_mode="HTML")

        elif action in ("analytics", "my_work", "mywork"):
            if not caps.can_view_analytics:
                alert = "⛔️ You do not have permission to view reports." if lang == "en" else "⛔️ شما مجوز مشاهده گزارش‌ها و آمار را ندارید."
                await query.answer(alert, show_alert=True)
                return
            await query.answer()
            executor = CommandExecutor(db, current_user, user_tg_id)
            res = await executor.execute(ViewAnalyticsIntent(report_type="personal", language=lang))
            if query.message:
                try:
                    await query.message.edit_text(res.text, parse_mode="HTML", reply_markup=res.reply_markup)
                except Exception:
                    await query.message.answer(res.text, parse_mode="HTML", reply_markup=res.reply_markup)

        elif action == "language":
            await query.answer()
            txt = (
                "🌐 <b>انتخاب زبان دستیار هوشمند:</b>\n\n"
                "لطفاً زبان مورد نظر خود برای بات را انتخاب فرمایید:\n"
                "Please choose your preferred bot language:"
                if lang == "fa"
                else "🌐 <b>Select Bot Language:</b>\n\nPlease select your preferred language:"
            )
            if query.message:
                try:
                    await query.message.edit_text(txt, parse_mode="HTML", reply_markup=make_help_keyboard(lang))
                except Exception:
                    await query.message.answer(txt, parse_mode="HTML", reply_markup=make_help_keyboard(lang))

        elif action == "docs":
            if not caps.can_search_docs:
                alert = "⛔️ You do not have permission to search docs." if lang == "en" else "⛔️ شما مجوز مشاهده مستندات را ندارید."
                await query.answer(alert, show_alert=True)
                return
            prompt_doc = "عبارت مورد نظر برای جستجو در مستندات را بنویسید:" if lang == "fa" else "Enter query to search docs:"
            await conversation_state_manager.set_pending_intent(
                user_tg_id,
                intent_data={"action": "search_docs"},
                missing_field="docs_search_menu",
                prompt_text=prompt_doc,
            )
            await query.answer()
            if query.message:
                doc_msg = (
                    "📚 عبارت مورد نظر برای جستجو در مستندات را بنویسید (مثال: «مستند راهنمای API»):"
                    if lang == "fa"
                    else "📚 Enter search keyword for documentation (e.g. 'API Reference'):"
                )
                await query.message.answer(doc_msg)

        elif action == "help":
            await query.answer()
            if query.message:
                await query.message.answer(
                    format_help_message(lang),
                    parse_mode="HTML",
                    reply_markup=make_help_keyboard(lang),
                )

        elif action == "main":
            notice = "منوی اصلی باز شد." if lang == "fa" else "Main menu opened."
            await query.answer(notice)
            header = (
                "📋 <b>منوی اصلی دستیار هوشمند PMP</b>\nگزینه‌های زیر بر اساس مجوزهای فعال حساب شما تنظیم شده‌اند:"
                if lang == "fa"
                else "📋 <b>PMP Smart Assistant Main Menu</b>\nThe options below reflect your active account permissions:"
            )
            if query.message:
                try:
                    await query.message.edit_text(
                        header,
                        reply_markup=make_dynamic_main_menu(caps, lang=lang),
                        parse_mode="HTML",
                    )
                except Exception:
                    await query.message.answer(
                        header,
                        reply_markup=make_dynamic_main_menu(caps, lang=lang),
                        parse_mode="HTML",
                    )


@router.callback_query(F.data.startswith("an:"))
async def handle_analytics_subview_callbacks(query: CallbackQuery) -> None:
    """Handle interactive navigation inside My Work & Analytics views."""
    sub_action = (query.data or "").split(":", 1)[1]
    user_tg_id = query.from_user.id
    client_code = query.from_user.language_code if query.from_user else None
    lang = await get_user_language(user_tg_id, client_code)

    async with AsyncSessionLocal() as db:
        user, current_user = await resolve_telegram_user(db, user_tg_id)
        if not user or not current_user:
            alert = "Account not connected." if lang == "en" else "حساب متصل نیست."
            await query.answer(alert, show_alert=True)
            return

        caps = await TelegramCapabilityService.resolve_user_capabilities(db, current_user)
        if not caps.can_view_analytics:
            alert = "⛔️ You do not have permission to view reports." if lang == "en" else "⛔️ شما مجوز مشاهده گزارش‌ها و آمار را ندارید."
            await query.answer(alert, show_alert=True)
            return

        await query.answer()
        executor = CommandExecutor(db, current_user, user_tg_id)
        res = await executor.execute(ViewAnalyticsIntent(report_type=sub_action, language=lang))
        if query.message:
            try:
                await query.message.edit_text(res.text, parse_mode="HTML", reply_markup=res.reply_markup)
            except Exception:
                await query.message.answer(res.text, parse_mode="HTML", reply_markup=res.reply_markup)


@router.callback_query(F.data.startswith("set_lang:"))
async def handle_set_language(query: CallbackQuery) -> None:
    """Handle language switch button tap (Persian / English)."""
    target_lang = (query.data or "").split(":", 1)[1]
    if target_lang not in ("fa", "en"):
        await query.answer()
        return

    user_tg_id = query.from_user.id
    await set_user_language(user_tg_id, target_lang)

    notice = "زبان به فارسی تغییر یافت. 🇮🇷" if target_lang == "fa" else "Language changed to English. 🇬🇧"
    await query.answer(notice)

    if query.message:
        try:
            await query.message.edit_text(
                format_help_message(target_lang),
                parse_mode="HTML",
                reply_markup=make_help_keyboard(target_lang),
            )
        except Exception:
            await query.message.answer(
                format_help_message(target_lang),
                parse_mode="HTML",
                reply_markup=make_help_keyboard(target_lang),
            )

    # Immediately update persistent docked keyboard to the newly selected language!
    async with AsyncSessionLocal() as db:
        user, current_user = await resolve_telegram_user(db, user_tg_id)
        if user and current_user:
            caps = await TelegramCapabilityService.resolve_user_capabilities(db, current_user)
            menu_notice = (
                "language updated to English. 🇬🇧"
                if target_lang == "en"
                else "زبان به فارسی تغییر یافت. 🇮🇷"
            )
            if query.message:
                await query.message.answer(
                    menu_notice,
                    reply_markup=make_persistent_reply_keyboard(caps, lang=target_lang),
                )


@router.callback_query(F.data.startswith("proj_act:"))
async def handle_project_quick_action(query: CallbackQuery) -> None:
    """Handle project-level action buttons (view, tasks, sprints, edit, new task, new sprint, members)."""
    parts = (query.data or "").split(":")
    if len(parts) < 3:
        await query.answer()
        return

    action = parts[1]
    project_id = parts[2]
    user_tg_id = query.from_user.id
    client_code = query.from_user.language_code if query.from_user else None
    lang = await get_user_language(user_tg_id, client_code)

    async with AsyncSessionLocal() as db:
        user, current_user = await resolve_telegram_user(db, user_tg_id)
        if not user or not current_user:
            alert = "Account not connected." if lang == "en" else "حساب متصل نیست."
            await query.answer(alert, show_alert=True)
            return

        caps = await TelegramCapabilityService.resolve_user_capabilities(db, current_user)

        from app.modules.telegram.resolver import EntityResolver
        p_res = await EntityResolver.resolve_project(db, project_id, current_user)
        if not p_res.is_exact or not p_res.entity:
            alert = "⛔️ Project not found or access denied." if lang == "en" else "⛔️ پروژه یافت نشد یا شما به آن دسترسی ندارید."
            await query.answer(alert, show_alert=True)
            return

        proj = p_res.entity

        if action == "view":
            if not caps.can_view_projects:
                alert = "⛔️ You do not have permission to view projects." if lang == "en" else "⛔️ شما مجوز مشاهده پروژه‌ها را ندارید."
                await query.answer(alert, show_alert=True)
                return
            await query.answer()
            executor = CommandExecutor(db, current_user, user_tg_id)
            overview, product_name, manager_name, members_names = await executor._get_project_card_data(proj.id)
            text = format_project_overview_card(
                overview,
                product_name=product_name,
                manager_name=manager_name,
                members_names=members_names,
                lang=lang,
            )
            markup = make_project_actions_keyboard(proj.id, capabilities=caps, lang=lang)
            if query.message:
                try:
                    await query.message.edit_text(text, parse_mode="HTML", reply_markup=markup)
                except Exception:
                    await query.message.answer(text, parse_mode="HTML", reply_markup=markup)
            return

        elif action == "sprints":
            if not caps.can_view_sprints:
                alert = "⛔️ You do not have permission to view sprints." if lang == "en" else "⛔️ شما مجوز مشاهده اسپرینت‌ها را ندارید."
                await query.answer(alert, show_alert=True)
                return
            await query.answer()
            overview = await projects_service.get_project_overview(db, proj.id)
            text = format_project_sprints_view(overview, lang=lang)
            markup = make_project_sprints_keyboard(proj.id, capabilities=caps, lang=lang)
            if query.message:
                try:
                    await query.message.edit_text(text, parse_mode="HTML", reply_markup=markup)
                except Exception:
                    await query.message.answer(text, parse_mode="HTML", reply_markup=markup)
            return

        elif action == "tasks":
            if not caps.can_view_tasks:
                alert = "⛔️ You do not have permission to view tasks." if lang == "en" else "⛔️ شما مجوز مشاهده تسک‌ها را ندارید."
                await query.answer(alert, show_alert=True)
                return
            await query.answer()
            from app.modules.projects import repository as projects_repo
            tasks = await projects_repo.list_tasks_by_project(db, proj.id)
            text = format_project_tasks_view(proj.name, tasks, lang=lang)
            markup = make_project_tasks_keyboard(proj.id, tasks, capabilities=caps, lang=lang)
            if query.message:
                try:
                    await query.message.edit_text(text, parse_mode="HTML", reply_markup=markup)
                except Exception:
                    await query.message.answer(text, parse_mode="HTML", reply_markup=markup)
            return

        elif action == "edit":
            if not TelegramCapabilityService.can_manage_project(current_user):
                alert = "⛔️ You do not have permission to edit projects." if lang == "en" else "⛔️ شما مجوز ویرایش پروژه را ندارید."
                await query.answer(alert, show_alert=True)
                return
            await query.answer()
            edit_text = (
                f"✏️ <b>ویرایش پروژه «{html.escape(proj.name)}»:</b>\n\n"
                f"لطفاً فیلدی که می‌خواهید ویرایش شود را انتخاب فرمایید:"
                if lang == "fa"
                else (
                    f"✏️ <b>Edit Project '{html.escape(proj.name)}':</b>\n\n"
                    f"Please select the field you want to edit:"
                )
            )
            markup = make_project_edit_menu_keyboard(proj.id, lang=lang)
            if query.message:
                try:
                    await query.message.edit_text(edit_text, parse_mode="HTML", reply_markup=markup)
                except Exception:
                    await query.message.answer(edit_text, parse_mode="HTML", reply_markup=markup)
            return

        elif action == "new_task":
            if not caps.can_create_task:
                alert = "⛔️ You do not have permission to create tasks." if lang == "en" else "⛔️ شما مجوز ایجاد تسک را ندارید."
                await query.answer(alert, show_alert=True)
                return
            from app.modules.telegram.wizard import TaskWizard
            text, markup = await TaskWizard.start(
                db, current_user, user_tg_id, lang=lang, prefill={"project_id": str(proj.id), "project_name": proj.name}
            )
            await query.answer()
            if query.message:
                await query.message.answer(text, parse_mode="HTML", reply_markup=markup)
            return

        elif action == "new_sprint":
            if not caps.can_create_sprint:
                alert = "⛔️ You do not have permission to create sprints." if lang == "en" else "⛔️ شما مجوز ایجاد اسپرینت را ندارید."
                await query.answer(alert, show_alert=True)
                return
            await conversation_state_manager.set_context(user_tg_id, "last_project_id", project_id)
            await query.answer()
            if query.message:
                prompt_reply = (
                    "🚀 Write to create sprints (e.g. 'Create 5 14-day sprints'):"
                    if lang == "en"
                    else "🚀 برای ایجاد اسپرینت‌ها بنویسید (مثال: «۵ اسپرینت ۷ روزه ایجاد کن»):"
                )
                await query.message.reply(prompt_reply)

        elif action == "members":
            if not caps.can_view_projects:
                alert = "⛔️ You do not have permission to view members." if lang == "en" else "⛔️ شما مجوز مشاهده اعضای پروژه را ندارید."
                await query.answer(alert, show_alert=True)
                return
            await query.answer()
            executor = CommandExecutor(db, current_user, user_tg_id)
            res = await executor.execute(ListProjectMembersIntent(project_name=project_id, language=lang))
            if query.message:
                await query.message.answer(res.text, parse_mode="HTML")


@router.callback_query(F.data.startswith("proj_ed:"))
async def handle_project_edit_field_selection(query: CallbackQuery) -> None:
    """Handle selecting a field to edit in a project."""
    parts = (query.data or "").split(":")
    if len(parts) < 3:
        await query.answer()
        return

    field = parts[1]
    project_id = parts[2]
    user_tg_id = query.from_user.id
    client_code = query.from_user.language_code if query.from_user else None
    lang = await get_user_language(user_tg_id, client_code)

    async with AsyncSessionLocal() as db:
        user, current_user = await resolve_telegram_user(db, user_tg_id)
        if not user or not current_user:
            alert = "Account not connected." if lang == "en" else "حساب متصل نیست."
            await query.answer(alert, show_alert=True)
            return

        if not TelegramCapabilityService.can_manage_project(current_user):
            alert = "⛔️ You do not have permission to edit projects." if lang == "en" else "⛔️ شما مجوز ویرایش پروژه را ندارید."
            await query.answer(alert, show_alert=True)
            return

        from app.modules.telegram.resolver import EntityResolver
        p_res = await EntityResolver.resolve_project(db, project_id, current_user)
        if not p_res.is_exact or not p_res.entity:
            alert = "⛔️ Project not found." if lang == "en" else "⛔️ پروژه یافت نشد."
            await query.answer(alert, show_alert=True)
            return

        proj = p_res.entity
        await query.answer()

        if field == "stat":
            st_text = (
                f"🔄 وضعیت جدید برای پروژه <b>«{html.escape(proj.name)}»</b> را انتخاب کنید:"
                if lang == "fa"
                else f"🔄 Select new status for project <b>'{html.escape(proj.name)}'</b>:"
            )
            markup = make_project_status_keyboard(proj.id, lang=lang)
            if query.message:
                try:
                    await query.message.edit_text(st_text, parse_mode="HTML", reply_markup=markup)
                except Exception:
                    await query.message.answer(st_text, parse_mode="HTML", reply_markup=markup)
            return

        elif field == "prio":
            prio_text = (
                f"⚡️ اولویت جدید برای پروژه <b>«{html.escape(proj.name)}»</b> را انتخاب کنید:"
                if lang == "fa"
                else f"⚡️ Select new priority for project <b>'{html.escape(proj.name)}'</b>:"
            )
            markup = make_project_priority_keyboard(proj.id, lang=lang)
            if query.message:
                try:
                    await query.message.edit_text(prio_text, parse_mode="HTML", reply_markup=markup)
                except Exception:
                    await query.message.answer(prio_text, parse_mode="HTML", reply_markup=markup)
            return

        elif field == "name":
            prompt = (
                f"✏️ لطفاً نام جدید برای پروژه <b>«{html.escape(proj.name)}»</b> را ارسال فرمایید:"
                if lang == "fa"
                else f"✏️ Please send the new name for project <b>'{html.escape(proj.name)}'</b>:"
            )
            await conversation_state_manager.set_pending_intent(
                user_tg_id,
                intent_data={"project_id": str(proj.id)},
                missing_field="proj_ed_name",
                prompt_text=prompt,
            )
            if query.message:
                await query.message.answer(prompt, parse_mode="HTML")
            return

        elif field == "desc":
            prompt = (
                f"📝 لطفاً توضیحات جدید برای پروژه <b>«{html.escape(proj.name)}»</b> را ارسال فرمایید:"
                if lang == "fa"
                else f"📝 Please send the new description for project <b>'{html.escape(proj.name)}'</b>:"
            )
            await conversation_state_manager.set_pending_intent(
                user_tg_id,
                intent_data={"project_id": str(proj.id)},
                missing_field="proj_ed_desc",
                prompt_text=prompt,
            )
            if query.message:
                await query.message.answer(prompt, parse_mode="HTML")
            return

        elif field == "budget":
            prompt = (
                f"💰 لطفاً بودجه جدید برای پروژه <b>«{html.escape(proj.name)}»</b> را به عدد یا تومان ارسال فرمایید:\n"
                f"<i>(مثال: 50,000,000 یا 50000000)</i>"
                if lang == "fa"
                else f"💰 Please send the new budget for project <b>'{html.escape(proj.name)}'</b>:"
            )
            await conversation_state_manager.set_pending_intent(
                user_tg_id,
                intent_data={"project_id": str(proj.id)},
                missing_field="proj_ed_budget",
                prompt_text=prompt,
            )
            if query.message:
                await query.message.answer(prompt, parse_mode="HTML")
            return


@router.callback_query(F.data.startswith("proj_set:"))
async def handle_project_set_value(query: CallbackQuery) -> None:
    """Handle instant selection of project status or priority."""
    parts = (query.data or "").split(":")
    if len(parts) < 4:
        await query.answer()
        return

    field = parts[1]
    project_id_str = parts[2]
    val = parts[3]
    user_tg_id = query.from_user.id
    client_code = query.from_user.language_code if query.from_user else None
    lang = await get_user_language(user_tg_id, client_code)

    async with AsyncSessionLocal() as db:
        user, current_user = await resolve_telegram_user(db, user_tg_id)
        if not user or not current_user:
            alert = "Account not connected." if lang == "en" else "حساب متصل نیست."
            await query.answer(alert, show_alert=True)
            return

        if not TelegramCapabilityService.can_manage_project(current_user):
            alert = "⛔️ You do not have permission to edit projects." if lang == "en" else "⛔️ شما مجوز ویرایش پروژه را ندارید."
            await query.answer(alert, show_alert=True)
            return

        from app.modules.telegram.resolver import EntityResolver
        p_res = await EntityResolver.resolve_project(db, project_id_str, current_user)
        if not p_res.is_exact or not p_res.entity:
            alert = "⛔️ Project not found." if lang == "en" else "⛔️ پروژه یافت نشد."
            await query.answer(alert, show_alert=True)
            return

        proj = p_res.entity
        update_payload = ProjectUpdate()
        if field == "stat":
            update_payload.status = ProjectStatus(val)
            ack_msg = f"وضعیت به {val} تغییر یافت" if lang == "fa" else f"Status updated to {val}"
        elif field == "prio":
            update_payload.priority = Priority(val)
            ack_msg = f"اولویت به {val} تغییر یافت" if lang == "fa" else f"Priority updated to {val}"
        else:
            await query.answer()
            return

        await projects_service.update_project(db, proj.id, update_payload, current_user)
        await db.commit()
        await query.answer(ack_msg)

        executor = CommandExecutor(db, current_user, user_tg_id)
        overview, product_name, manager_name, members_names = await executor._get_project_card_data(proj.id)
        text = format_project_overview_card(
            overview,
            product_name=product_name,
            manager_name=manager_name,
            members_names=members_names,
            lang=lang,
        )
        caps = await TelegramCapabilityService.resolve_user_capabilities(db, current_user)
        markup = make_project_actions_keyboard(proj.id, capabilities=caps, lang=lang)
        if query.message:
            try:
                await query.message.edit_text(text, parse_mode="HTML", reply_markup=markup)
            except Exception:
                await query.message.answer(text, parse_mode="HTML", reply_markup=markup)


@router.callback_query(F.data.startswith("task_proj:"))
async def handle_task_project_selection(query: CallbackQuery) -> None:
    """Handle project selection when creating a task."""
    parts = (query.data or "").split(":")
    if len(parts) < 2:
        await query.answer()
        return

    project_id = parts[1]
    user_tg_id = query.from_user.id
    client_code = query.from_user.language_code if query.from_user else None
    lang = await get_user_language(user_tg_id, client_code)

    async with AsyncSessionLocal() as db:
        user, current_user = await resolve_telegram_user(db, user_tg_id)
        if not user or not current_user:
            alert = "Account not connected." if lang == "en" else "حساب متصل نیست."
            await query.answer(alert, show_alert=True)
            return

        from app.modules.telegram.resolver import EntityResolver
        p_res = await EntityResolver.resolve_project(db, project_id, current_user)
        if not p_res.is_exact or not p_res.entity:
            alert = "⛔️ Project not found or access denied." if lang == "en" else "⛔️ پروژه یافت نشد یا شما به آن دسترسی ندارید."
            await query.answer(alert, show_alert=True)
            return

        project = p_res.entity
        await conversation_state_manager.set_context(user_tg_id, "last_project_id", str(project.id))

        pending = await conversation_state_manager.get_pending_intent(user_tg_id)
        intent_data = pending.get("intent_data", {}) if pending else {}
        missing = pending.get("missing_field") if pending else None

        if missing == "backlog_task_project" or intent_data.get("action") == "assign_backlog_task":
            from app.modules.projects import service as projects_service
            task_id_raw = intent_data.get("task_id")
            s_res = await EntityResolver.resolve_sprint(db, project.id, "current")
            if not s_res.is_exact or not s_res.entity:
                alert = f"Project '{project.name}' has no active sprint." if lang == "en" else f"پروژه «{project.name}» اسپرینت فعالی ندارد."
                await query.answer(alert, show_alert=True)
                return
            await projects_service.attach_task_to_phase(db, UUID(task_id_raw), s_res.entity.id)
            prompt_txt = "Send assignee name:" if lang == "en" else "نام فرد را برای ارجاع تسک ارسال کنید:"
            await conversation_state_manager.set_pending_intent(
                user_tg_id,
                intent_data={"task_id": task_id_raw},
                missing_field="task_assignee_direct",
                prompt_text=prompt_txt,
            )
            notice = "Task attached to project." if lang == "en" else "تسک به پروژه متصل شد."
            await query.answer(notice)
            if query.message:
                reply_txt = (
                    f"✅ Task attached to project <b>«{project.name}»</b> (Sprint {s_res.entity.name}).\n\n"
                    f"👤 Please enter assignee name:"
                    if lang == "en"
                    else (
                        f"✅ تسک به پروژه <b>«{project.name}»</b> (اسپرینت {s_res.entity.name}) متصل شد.\n\n"
                        f"👤 لطفاً نام یا نام‌کاربری فرد را برای ارجاع تسک ارسال کنید:"
                    )
                )
                await query.message.edit_text(reply_txt, parse_mode="HTML")
            return

        if missing == "sprint_batch_project_select" or intent_data.get("intent_type") == "create_sprint_batch":
            intent_data["project_name"] = project.name
            intent_data["language"] = lang
            await conversation_state_manager.clear_pending_intent(user_tg_id)
            from app.modules.telegram.schemas import CreateSprintBatchIntent
            sprint_intent = CreateSprintBatchIntent(**intent_data)
            executor = CommandExecutor(db, current_user, user_tg_id)
            result = await executor.execute(sprint_intent)
            notice = "Project selected." if lang == "en" else "پروژه انتخاب شد."
            await query.answer(notice)
            if query.message:
                await query.message.edit_text(result.text, parse_mode="HTML", reply_markup=result.reply_markup)
            return

        if intent_data.get("title"):
            intent_data["project_name"] = project.name
            intent_data["language"] = lang
            await conversation_state_manager.clear_pending_intent(user_tg_id)
            from app.modules.telegram.schemas import CreateTaskIntent
            task_intent = CreateTaskIntent(**intent_data)
            executor = CommandExecutor(db, current_user, user_tg_id)
            result = await executor.execute(task_intent)
            notice = "Project selected." if lang == "en" else "پروژه انتخاب شد."
            await query.answer(notice)
            if query.message:
                await query.message.edit_text(result.text, parse_mode="HTML", reply_markup=result.reply_markup)
        else:
            prompt_txt = (
                f"Please enter task title for project '{project.name}':"
                if lang == "en"
                else f"لطفاً عنوان تسک برای پروژه «{project.name}» را ارسال فرمایید:"
            )
            await conversation_state_manager.set_pending_intent(
                user_tg_id,
                intent_data={"action": "create_task", "project_id": str(project.id), "project_name": project.name},
                missing_field="task_title_menu",
                prompt_text=prompt_txt,
            )
            notice = "Project selected." if lang == "en" else "پروژه انتخاب شد."
            await query.answer(notice)
            if query.message:
                sel_txt = (
                    f"📁 Project <b>«{project.name}»</b> selected.\n\n➕ Please enter task title:"
                    if lang == "en"
                    else f"📁 پروژه <b>«{project.name}»</b> انتخاب شد.\n\n➕ لطفاً عنوان تسک مورد نظر را ارسال فرمایید (مثال: «تسک بررسی لاگ‌ها» یا «رفع باگ ورود»):"
                )
                await query.message.edit_text(sel_txt, parse_mode="HTML")


@router.callback_query(F.data.startswith("proj_prod:") | F.data.startswith("proj_pick_prod:"))
async def handle_product_line_selection(query: CallbackQuery) -> None:
    """Handle user clicking an authorized product line button during project creation."""
    parts = (query.data or "").split(":")
    if len(parts) < 3:
        await query.answer()
        return

    token = parts[1]
    prod_id_raw = parts[2]
    user_tg_id = query.from_user.id
    client_code = query.from_user.language_code if query.from_user else None
    lang = await get_user_language(user_tg_id, client_code)

    conf = await conversation_state_manager.get_confirmation(user_tg_id, token)
    if not conf:
        alert = "This request has expired or is invalid." if lang == "en" else "این درخواست منقضی شده یا نامعتبر است."
        await query.answer(alert, show_alert=True)
        return

    async with AsyncSessionLocal() as db:
        user, current_user = await resolve_telegram_user(db, user_tg_id)
        if not user or not current_user:
            alert = "Authentication error: Account not connected." if lang == "en" else "خطای احراز هویت: حساب متصل نیست."
            await query.answer(alert, show_alert=True)
            return

        try:
            target_prod_uuid = UUID(hex=prod_id_raw) if len(prod_id_raw) == 32 else UUID(prod_id_raw)
            target_prod = await require_product_access(db, current_user, target_prod_uuid)
            prod = target_prod if (target_prod and getattr(target_prod, "name", None)) else None
            if not prod:
                prod_res = await db.execute(select(Product).where(Product.id == target_prod_uuid))
                prod = prod_res.scalar_one_or_none()
            if not prod:
                alert = "Product Line not found." if lang == "en" else "خط محصول یافت نشد."
                await query.answer(alert, show_alert=True)
                return
        except Exception:
            alert = "⛔️ You do not have access to this Product Line." if lang == "en" else "⛔️ شما به این خط محصول (Product Line) دسترسی ندارید."
            await query.answer(alert, show_alert=True)
            return

        # Update draft confirmation with selected product
        await conversation_state_manager.update_confirmation(
            user_tg_id,
            token,
            {"product_id": str(prod.id), "product_name": prod.name},
        )

        payload = conf.get("payload", {})
        payload["product_id"] = str(prod.id)
        payload["product_name"] = prod.name
        conf_lang = payload.get("lang") or lang

        preview_text = format_project_preview(
            name=payload.get("name", "Project"),
            product_name=prod.name,
            description=payload.get("description"),
            priority=payload.get("priority"),
            start_date=payload.get("start_date"),
            end_date=payload.get("end_date"),
            lang=conf_lang,
        )

        notice = "Product Line selected." if conf_lang == "en" else "خط محصول انتخاب شد."
        await query.answer(notice)
        if query.message:
            await query.message.edit_text(
                preview_text,
                parse_mode="HTML",
                reply_markup=make_project_preview_keyboard(token, lang=conf_lang),
            )


@router.callback_query(F.data.startswith("proj_chg:") | F.data.startswith("proj_change_prod:"))
async def handle_change_product_line(query: CallbackQuery) -> None:
    """Handle user clicking 'Change Product Line' during preview."""
    parts = (query.data or "").split(":")
    if len(parts) < 2:
        await query.answer()
        return

    token = parts[1]
    user_tg_id = query.from_user.id
    client_code = query.from_user.language_code if query.from_user else None
    lang = await get_user_language(user_tg_id, client_code)

    conf = await conversation_state_manager.get_confirmation(user_tg_id, token)
    if not conf:
        alert = "This request has expired." if lang == "en" else "این درخواست منقضی شده است."
        await query.answer(alert, show_alert=True)
        return

    async with AsyncSessionLocal() as db:
        user, current_user = await resolve_telegram_user(db, user_tg_id)
        if not user or not current_user:
            alert = "Authentication error." if lang == "en" else "خطای احراز هویت."
            await query.answer(alert, show_alert=True)
            return

        prod_ids = await visible_product_ids(db, current_user)
        if prod_ids is not None and len(prod_ids) == 0:
            alert = "⛔️ You are not a member of any Product Line." if lang == "en" else "⛔️ شما عضو هیچ خط محصولی نیستید."
            await query.answer(alert, show_alert=True)
            return

        product_stmt = select(Product)
        if prod_ids is not None:
            product_stmt = product_stmt.where(Product.id.in_(prod_ids))
        product_stmt = product_stmt.order_by(Product.name)
        res = await db.execute(product_stmt)
        products = res.scalars().all()

        if not products:
            alert = "⛔️ No Product Line found." if lang == "en" else "⛔️ هیچ خط محصولی برای شما یافت نشد."
            await query.answer(alert, show_alert=True)
            return

        payload = conf.get("payload", {})
        conf_lang = payload.get("lang") or lang
        prompt_text = (
            f"🏢 Which Product Line does project '<b>{payload.get('name', 'project')}</b>' belong to?"
            if conf_lang == "en"
            else f"🏢 پروژه «<b>{payload.get('name', 'پروژه')}</b>» مربوط به کدام Product Line است؟"
        )

        await query.answer()
        if query.message:
            await query.message.edit_text(
                prompt_text,
                parse_mode="HTML",
                reply_markup=make_product_line_selection_keyboard(products, token, lang=conf_lang),
            )


@router.callback_query(F.data.startswith("proj_ok:") | F.data.startswith("proj_confirm:"))
async def handle_confirm_create_project(query: CallbackQuery) -> None:
    """Handle user clicking 'Create Project' to commit project creation."""
    parts = (query.data or "").split(":")
    if len(parts) < 2:
        await query.answer()
        return

    token = parts[1]
    user_tg_id = query.from_user.id
    client_code = query.from_user.language_code if query.from_user else None
    lang = await get_user_language(user_tg_id, client_code)

    conf = await conversation_state_manager.consume_confirmation(user_tg_id, token)
    if not conf:
        alert = "This request has expired or was already committed." if lang == "en" else "این درخواست منقضی شده یا قبلاً ثبت شده است."
        await query.answer(alert, show_alert=True)
        return

    payload = conf.get("payload", {})
    prod_id_str = payload.get("product_id")
    conf_lang = payload.get("lang") or lang
    if not prod_id_str:
        alert = "Product Line not selected." if conf_lang == "en" else "خط محصول انتخاب نشده است."
        await query.answer(alert, show_alert=True)
        return

    async with AsyncSessionLocal() as db:
        user, current_user = await resolve_telegram_user(db, user_tg_id)
        if not user or not current_user:
            alert = "Authentication error." if conf_lang == "en" else "خطای احراز هویت."
            await query.answer(alert, show_alert=True)
            return

        if not TelegramCapabilityService.can_create_project(current_user):
            alert = "⛔️ You do not have permission to create projects." if conf_lang == "en" else "⛔️ شما دسترسی لازم برای ساخت پروژه را ندارید."
            await query.answer(alert, show_alert=True)
            if query.message:
                denied_msg = "⛔️ Permission denied to create project." if conf_lang == "en" else "⛔️ دسترسی لازم برای ساخت پروژه وجود ندارد."
                await query.message.edit_text(denied_msg)
            return

        product_name = payload.get("product_name") or "Product"
        # Server-side re-verification: verify current user STILL has product access
        try:
            target_prod_uuid = UUID(prod_id_str)
            target_prod = await require_product_access(db, current_user, target_prod_uuid)
            prod = target_prod if (target_prod and getattr(target_prod, "name", None)) else None
            if not prod:
                prod_res = await db.execute(select(Product).where(Product.id == target_prod_uuid))
                prod = prod_res.scalar_one_or_none()
            if prod:
                product_name = prod.name
        except Exception:
            alert = "⛔️ You do not have access to this Product Line." if conf_lang == "en" else "⛔️ شما به این خط محصول دسترسی ندارید."
            await query.answer(alert, show_alert=True)
            if query.message:
                err_msg = "⛔️ Error: Access to this Product Line is invalid or revoked." if conf_lang == "en" else "⛔️ خطا: دسترسی شما به این خط محصول نامعتبر یا لغو شده است."
                await query.message.edit_text(err_msg)
            return

        priority_val = payload.get("priority")
        prio = Priority(priority_val) if priority_val in Priority._value2member_map_ else Priority.P2
        start_d = date.fromisoformat(payload["start_date"]) if payload.get("start_date") else None
        end_d = date.fromisoformat(payload["end_date"]) if payload.get("end_date") else None

        create_data = ProjectCreate(
            product_id=target_prod_uuid,
            name=payload.get("name"),
            description=payload.get("description"),
            priority=prio,
            start_date=start_d,
            end_date=end_d,
        )

        project_read = await projects_service.create_project(
            db, create_data, created_by_user_id=current_user.user_id
        )
        await conversation_state_manager.set_context(user_tg_id, "last_project_id", str(project_read.id))
        await conversation_state_manager.set_context(user_tg_id, "last_project_name", project_read.name)

        notice = "Project created successfully! 🎉" if conf_lang == "en" else "پروژه با موفقیت ایجاد شد! 🎉"
        await query.answer(notice)
        if query.message:
            msg = (
                f"🏢 Project <b>«{project_read.name}»</b> in product line <b>«{product_name}»</b> was successfully created! 🎉"
                if conf_lang == "en"
                else f"🏢 پروژه <b>«{project_read.name}»</b> در خط محصول <b>«{product_name}»</b> با موفقیت ایجاد شد! 🎉"
            )
            caps = await TelegramCapabilityService.resolve_user_capabilities(db, current_user)
            await query.message.edit_text(
                msg,
                parse_mode="HTML",
                reply_markup=make_project_actions_keyboard(project_read.id, capabilities=caps, lang=conf_lang),
            )


@router.callback_query(F.data.startswith("confirm:"))
async def handle_confirmation_approval(query: CallbackQuery) -> None:
    """Handle confirmation of a high-impact operation."""
    token = (query.data or "").split(":", 1)[1]
    user_tg_id = query.from_user.id
    client_code = query.from_user.language_code if query.from_user else None
    lang = await get_user_language(user_tg_id, client_code)

    confirm_data = await conversation_state_manager.consume_confirmation(user_tg_id, token)
    if not confirm_data:
        alert = "This request has expired or was already confirmed." if lang == "en" else "این درخواست منقضی شده یا قبلاً تایید شده است."
        await query.answer(alert, show_alert=True)
        return

    action_type = confirm_data.get("action_type")
    payload = confirm_data.get("payload", {})

    async with AsyncSessionLocal() as db:
        user, current_user = await resolve_telegram_user(db, user_tg_id)
        if not user or not current_user:
            alert = "Access error." if lang == "en" else "خطای دسترسی."
            await query.answer(alert, show_alert=True)
            return

        if action_type == "delete_task":
            notice = "Tasks cannot be deleted. Archive the task instead." if lang == "en" else "حذف کار امکان‌پذیر نیست؛ کار را بایگانی کنید."
            await query.answer(notice, show_alert=True)
        else:
            notice = "Operation confirmed." if lang == "en" else "عملیات تایید شد."
            await query.answer(notice)
            if query.message:
                ok_msg = "✅ Operation confirmed and completed successfully." if lang == "en" else "✅ عملیات با موفقیت تایید و انجام شد."
                await query.message.edit_text(ok_msg)


@router.callback_query(F.data.startswith("cancel:"))
async def handle_cancellation(query: CallbackQuery) -> None:
    """Handle cancel button clicks."""
    user_tg_id = query.from_user.id
    client_code = query.from_user.language_code if query.from_user else None
    lang = await get_user_language(user_tg_id, client_code)

    token = (query.data or "").split(":", 1)[1] if ":" in (query.data or "") else None
    if token and token != "flow":
        await conversation_state_manager.consume_confirmation(user_tg_id, token)
    await conversation_state_manager.cancel(user_tg_id)

    notice = "Operation cancelled." if lang == "en" else "عملیات لغو شد."
    await query.answer(notice)
    if query.message:
        from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup
        cancel_text = "❌ Operation cancelled." if lang == "en" else "❌ عملیات لغو شد."
        menu_btn = "📋 Main Menu Options" if lang == "en" else "📋 منوی اصلی گزینه‌ها"
        await query.message.edit_text(
            cancel_text,
            reply_markup=InlineKeyboardMarkup(
                inline_keyboard=[
                    [
                        InlineKeyboardButton(
                            text=menu_btn, callback_data="menu:main"
                        )
                    ]
                ]
            ),
        )


@router.callback_query(F.data.startswith("w:"))
async def handle_wizard_callbacks(query: CallbackQuery) -> None:
    """Handle all interactive wizard steps, navigations, skips, and commits."""
    user_tg_id = query.from_user.id
    client_code = query.from_user.language_code if query.from_user else None
    lang = await get_user_language(user_tg_id, client_code)

    try:
        async with AsyncSessionLocal() as db:
            user, current_user = await resolve_telegram_user(db, user_tg_id)
            if not user or not current_user:
                alert = "Authentication error: Account not connected." if lang == "en" else "خطای احراز هویت: حساب متصل نیست."
                await query.answer(alert, show_alert=True)
                return
            from app.modules.telegram.wizard import TelegramWizardManager
            handled = await TelegramWizardManager.handle_callback(db, current_user, user_tg_id, query)
            if not handled:
                await query.answer()
    except Exception as exc:
        logger.error("handle_wizard_callbacks_failed", error=str(exc))
        try:
            err_msg = str(getattr(exc, "message", exc))
            if len(err_msg) > 140:
                err_msg = err_msg[:137] + "..."
            alert = f"Error: {err_msg}" if lang == "en" else f"خطا: {err_msg}"
            await query.answer(alert, show_alert=True)
        except Exception:
            try:
                await query.answer()
            except Exception:
                pass


@router.callback_query(F.data == "noop")
async def handle_noop(query: CallbackQuery) -> None:
    await query.answer()


