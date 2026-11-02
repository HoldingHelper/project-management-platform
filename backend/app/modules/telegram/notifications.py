"""Telegram push notifications for PMP domain events (e.g. task assignment).

Subscribes to the central PMP event_bus to deliver notifications across all
assignment channels:
- Web UI
- Telegram Bot
- REST API
- Internal services
- Automation workflows
- Background workers
"""

from __future__ import annotations

import asyncio
import html
import io
import re
from datetime import date, datetime
from typing import List, Optional
from uuid import UUID

import structlog
from aiogram import Bot
from aiogram.types import BufferedInputFile, InlineKeyboardButton, InlineKeyboardMarkup
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import AsyncSessionLocal
from app.core.events import event_bus
from app.core.storage import file_storage_service
from app.modules.collaboration import repository as collab_repo
from app.modules.collaboration.models import FileAttachment
from app.modules.identity import repository as identity_repo
from app.modules.identity.models import User
from app.modules.integrations.models import UserTelegramConnection
from app.modules.projects import repository as projects_repo
from app.modules.projects.models import Phase, Product, Project, TaskItem
from app.modules.telegram.bot import get_bot
from app.modules.telegram.capabilities import TelegramCapabilityService
from app.modules.telegram.security import resolve_telegram_user
from app.modules.telegram.state import get_user_language
from app.shared.events import TaskAssigned

logger = structlog.get_logger(__name__)


def _priority_label(prio: str, lang: str = "fa") -> str:
    mapping = {
        "P0": ("🔥 P0 - بحرانی", "🔥 P0 - Critical"),
        "P1": ("⚡️ P1 - بالا", "⚡️ P1 - High"),
        "P2": ("🔹 P2 - متوسط", "🔹 P2 - Medium"),
        "P3": ("▫️ P3 - پایین", "▫️ P3 - Low"),
    }
    pair = mapping.get(prio.upper() if prio else "", (prio, prio))
    return pair[0] if lang == "fa" else pair[1]


def _status_label(stat: str, lang: str = "fa") -> str:
    mapping = {
        "Ready": ("🔵 آماده انجام", "🔵 Ready"),
        "InProgress": ("🟡 در حال انجام", "🟡 In Progress"),
        "InReview": ("🟣 در حال بررسی", "🟣 In Review"),
        "Blocked": ("🔴 مسدود", "🔴 Blocked"),
        "Done": ("✅ انجام شد", "✅ Done"),
    }
    pair = mapping.get(stat, (stat, stat))
    return pair[0] if lang == "fa" else pair[1]


def format_task_assigned_notification(
    task: TaskItem,
    project_name: str,
    product_name: str,
    phase_name: str,
    assigner_name: str,
    attachments_count: int,
    lang: str = "fa",
) -> str:
    """Format the rich Telegram push notification message for an assigned task."""
    prio_str = _priority_label(getattr(task.priority, "value", str(task.priority)), lang)
    stat_str = _status_label(getattr(task.status, "value", str(task.status)), lang)

    short_id = str(task.id)[:8]
    due_str = str(task.due_date) if task.due_date else ("ندارد" if lang == "fa" else "None")
    start_str = str(task.start_date) if task.start_date else ("ندارد" if lang == "fa" else "None")
    sp_str = str(task.story_points) if task.story_points is not None else None
    partition_str = task.partition if task.partition else None

    # Labels
    labels_list = [l.name for l in getattr(task, "labels", []) if getattr(l, "name", None)]
    labels_str = ", ".join(labels_list) if labels_list else None

    # Checklist summary
    chk_items = getattr(task, "checklist_items", []) or []
    total_chk = len(chk_items)
    done_chk = sum(1 for it in chk_items if getattr(it, "is_done", False))

    if lang == "fa":
        lines = [
            "📌 <b>یک Task جدید به شما Assign شد</b>\n",
            f"📋 <b>عنوان:</b> {html.escape(task.title)}",
            f"🔢 <b>کد تسک:</b> <code>#{short_id}</code>",
            f"📁 <b>پروژه:</b> {html.escape(project_name)}",
            f"🏢 <b>خط محصول:</b> {html.escape(product_name)}",
            f"🎯 <b>محل / اسپرینت:</b> {html.escape(phase_name)}",
            f"⚡️ <b>اولویت:</b> {prio_str}",
            f"📊 <b>وضعیت:</b> {stat_str}",
            f"👤 <b>ارجاع‌دهنده:</b> {html.escape(assigner_name)}",
        ]

        if start_str != "ندارد":
            lines.append(f"📅 <b>تاریخ شروع:</b> {start_str}")
        lines.append(f"⏰ <b>مهلت انجام (ددلاین):</b> {due_str}")

        if sp_str:
            lines.append(f"🎯 <b>امتیاز (Story Points):</b> {sp_str}")
        if partition_str:
            lines.append(f"🏷 <b>حوزه / دیسیپلین:</b> {partition_str}")
        if labels_str:
            lines.append(f"🏷 <b>برچسب‌ها:</b> {html.escape(labels_str)}")

        if total_chk > 0:
            lines.append(f"☑️ <b>چک‌لیست:</b> {done_chk} از {total_chk} مورد تکمیل شده")
            for it in chk_items[:4]:
                mark = "✅" if getattr(it, "is_done", False) else "▫️"
                lines.append(f"  {mark} {html.escape(getattr(it, 'text', ''))}")
            if total_chk > 4:
                lines.append(f"  ... و {total_chk - 4} مورد دیگر")

        if task.description and task.description.strip():
            desc_snip = task.description.strip()
            if len(desc_snip) > 200:
                desc_snip = desc_snip[:197] + "..."
            lines.append(f"\n📄 <b>توضیحات:</b>\n<i>{html.escape(desc_snip)}</i>")

        if attachments_count > 0:
            lines.append(f"\n📎 <b>پیوست‌ها:</b> {attachments_count} فایل (در پیام‌های بعد ارسال می‌شود)")

        return "\n".join(lines)

    # English version
    lines = [
        "📌 <b>A new Task was assigned to you</b>\n",
        f"📋 <b>Title:</b> {html.escape(task.title)}",
        f"🔢 <b>Task ID:</b> <code>#{short_id}</code>",
        f"📁 <b>Project:</b> {html.escape(project_name)}",
        f"🏢 <b>Product Line:</b> {html.escape(product_name)}",
        f"🎯 <b>Sprint / Location:</b> {html.escape(phase_name)}",
        f"⚡️ <b>Priority:</b> {prio_str}",
        f"📊 <b>Status:</b> {stat_str}",
        f"👤 <b>Assigned By:</b> {html.escape(assigner_name)}",
    ]

    if start_str != "None":
        lines.append(f"📅 <b>Start Date:</b> {start_str}")
    lines.append(f"⏰ <b>Due Date:</b> {due_str}")

    if sp_str:
        lines.append(f"🎯 <b>Story Points:</b> {sp_str}")
    if partition_str:
        lines.append(f"🏷 <b>Partition:</b> {partition_str}")
    if labels_str:
        lines.append(f"🏷 <b>Labels:</b> {html.escape(labels_str)}")

    if total_chk > 0:
        lines.append(f"☑️ <b>Checklist:</b> {done_chk}/{total_chk} completed")
        for it in chk_items[:4]:
            mark = "✅" if getattr(it, "is_done", False) else "▫️"
            lines.append(f"  {mark} {html.escape(getattr(it, 'text', ''))}")
        if total_chk > 4:
            lines.append(f"  ... and {total_chk - 4} more")

    if task.description and task.description.strip():
        desc_snip = task.description.strip()
        if len(desc_snip) > 200:
            desc_snip = desc_snip[:197] + "..."
        lines.append(f"\n📄 <b>Description:</b>\n<i>{html.escape(desc_snip)}</i>")

    if attachments_count > 0:
        lines.append(f"\n📎 <b>Attachments:</b> {attachments_count} file(s) (attached below)")

    return "\n".join(lines)


def build_assigned_task_keyboard(task_id: UUID, lang: str = "fa") -> InlineKeyboardMarkup:
    """Build action buttons tailored to the assigned user."""
    tid = str(task_id)
    buttons = [
        [
            InlineKeyboardButton(
                text="👁 مشاهده تسک" if lang == "fa" else "👁 View Task",
                callback_data=f"task_act:view:{tid}",
            ),
        ],
        [
            InlineKeyboardButton(
                text="▶️ شروع کار" if lang == "fa" else "▶️ Start",
                callback_data=f"task_st:{tid}:InProgress",
            ),
            InlineKeyboardButton(
                text="✅ انجام شد" if lang == "fa" else "✅ Done",
                callback_data=f"task_st:{tid}:Done",
            ),
        ],
        [
            InlineKeyboardButton(
                text="💬 افزودن نظر" if lang == "fa" else "💬 Comment",
                callback_data=f"task_act:comment:{tid}",
            ),
            InlineKeyboardButton(
                text="📎 پیوست فایل" if lang == "fa" else "📎 Attach",
                callback_data=f"task_act:attach:{tid}",
            ),
        ],
    ]
    return InlineKeyboardMarkup(inline_keyboard=buttons)


async def send_task_assignment_telegram_notification(event: TaskAssigned) -> None:
    """Event handler invoked when a Task is assigned to one or more users."""
    bot = get_bot()
    if not bot:
        return

    # Small delay to ensure any concurrent attachment uploads or commit steps settle
    await asyncio.sleep(0.3)

    try:
        async with AsyncSessionLocal() as db:
            task = await projects_repo.get_task(db, event.task_id)
            if not task:
                logger.debug("notification_task_not_found", task_id=str(event.task_id))
                return

            # Resolve project & product names
            project_name = "بک‌لاگ"
            product_name = "عمومی"
            phase_name = "بک‌لاگ (Backlog)"

            if task.phase_id:
                phase = await db.get(Phase, task.phase_id)
                if phase:
                    phase_name = phase.name
                    project = await db.get(Project, phase.project_id)
                    if project:
                        project_name = project.name
                        if project.product_id:
                            product = await db.get(Product, project.product_id)
                            if product:
                                product_name = product.name
            elif event.project_name:
                project_name = event.project_name

            # Resolve assigner user
            assigner_name = "سیستم"
            req_uid = event.requested_by_user_id or task.created_by_user_id
            if req_uid:
                assigner = await db.get(User, req_uid)
                if assigner:
                    assigner_name = assigner.full_name or assigner.email

            # Query all attachments for this task (from Telegram or Web UI)
            attachments: List[FileAttachment] = list(
                await collab_repo.list_file_attachments(db, "task", task.id)
            )

            # Process each assignee independently
            for assignee_id in event.assignee_user_ids:
                try:
                    conn = (
                        await db.execute(
                            select(UserTelegramConnection).where(
                                UserTelegramConnection.user_id == assignee_id,
                                UserTelegramConnection.is_connected.is_(True),
                                UserTelegramConnection.notify_tasks.is_(True),
                            )
                        )
                    ).scalar_one_or_none()

                    if not conn or not conn.telegram_chat_id:
                        continue

                    chat_id = conn.telegram_chat_id
                    lang = await get_user_language(chat_id)

                    msg_text = format_task_assigned_notification(
                        task=task,
                        project_name=project_name,
                        product_name=product_name,
                        phase_name=phase_name,
                        assigner_name=assigner_name,
                        attachments_count=len(attachments),
                        lang=lang,
                    )
                    markup = build_assigned_task_keyboard(task.id, lang=lang)

                    # 1. Send the primary task notification message
                    await bot.send_message(
                        chat_id=chat_id,
                        text=msg_text,
                        reply_markup=markup,
                        parse_mode="HTML",
                    )

                    # 2. If task has attachments, send each file to assignee in Telegram
                    short_id = str(task.id)[:8]
                    for att in attachments:
                        try:
                            file_bytes = await file_storage_service.download_async(att.storage_key)
                            buf = BufferedInputFile(file_bytes, filename=att.file_name)
                            c_type = (att.content_type or "").lower()
                            f_name = att.file_name.lower()

                            caption = (
                                f"📎 <b>{html.escape(att.file_name)}</b>\nپیوست تسک #{short_id}"
                                if lang == "fa"
                                else f"📎 <b>{html.escape(att.file_name)}</b>\nAttachment for #{short_id}"
                            )

                            if "audio/ogg" in c_type or "voice" in f_name or f_name.endswith(".ogg"):
                                await bot.send_voice(chat_id=chat_id, voice=buf, caption=caption, parse_mode="HTML")
                            elif c_type.startswith("audio/"):
                                await bot.send_audio(chat_id=chat_id, audio=buf, caption=caption, parse_mode="HTML")
                            elif c_type.startswith("image/"):
                                await bot.send_photo(chat_id=chat_id, photo=buf, caption=caption, parse_mode="HTML")
                            else:
                                await bot.send_document(chat_id=chat_id, document=buf, caption=caption, parse_mode="HTML")
                        except Exception as att_err:
                            logger.warning(
                                "telegram_attachment_send_failed",
                                task_id=str(task.id),
                                file_name=att.file_name,
                                error=str(att_err),
                            )

                except Exception as user_err:
                    logger.warning(
                        "telegram_user_notify_failed",
                        assignee_id=str(assignee_id),
                        task_id=str(task.id),
                        error=str(user_err),
                    )

    except Exception as exc:
        logger.warning(
            "telegram_task_assignment_notification_handler_error",
            task_id=str(event.task_id),
            error=str(exc),
        )


def register_telegram_event_handlers() -> None:
    """Subscribe telegram handlers to PMP domain events."""
    event_bus.subscribe(TaskAssigned, send_task_assignment_telegram_notification)
    logger.info("telegram_event_handlers_registered")

