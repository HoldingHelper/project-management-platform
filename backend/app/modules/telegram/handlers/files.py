"""File upload and attachment handler for documents, photos, audio, and voice messages."""

from __future__ import annotations

import html
import io
import os
import re
from datetime import datetime, timezone
from uuid import UUID, uuid4

import structlog
from aiogram import Bot, F, Router
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, Message

from app.core.database import AsyncSessionLocal
from app.core.exceptions import ForbiddenError, NotFoundError
from app.core.storage import file_storage_service
from app.modules.collaboration import service as collaboration_service
from app.modules.collaboration.authorization import _require_project_access, _require_task_access
from app.modules.projects import repository as projects_repo
from app.modules.telegram.capabilities import TelegramCapabilityService
from app.modules.telegram.security import resolve_telegram_user
from app.modules.telegram.state import conversation_state_manager, get_user_language
from app.modules.telegram.wizard import get_wizard_data, save_wizard_data

logger = structlog.get_logger(__name__)
router = Router(name="telegram_files")

MAX_TELEGRAM_FILE_SIZE = 25 * 1024 * 1024  # 25MB standard platform limit


@router.message(F.document | F.photo | F.voice | F.audio)
async def handle_incoming_file(message: Message, bot: Bot) -> None:
    """Receive an uploaded Telegram document, photo, audio, or voice message."""
    user_tg_id = message.from_user.id if message.from_user else message.chat.id

    async with AsyncSessionLocal() as db:
        user, current_user = await resolve_telegram_user(db, user_tg_id)
        lang = await get_user_language(user_tg_id)
        if not user or not current_user:
            await message.answer(
                "Please link your Telegram account first by sending the link code."
                if lang == "en"
                else "لطفاً ابتدا با ارسال کد لینک حساب خود را متصل کنید."
            )
            return

        if not TelegramCapabilityService.can_upload_files(current_user):
            await message.answer(
                "⛔️ شما مجوز لازم برای پیوست فایل را ندارید."
                if lang == "fa"
                else "⛔️ You do not have permission to attach files.",
                parse_mode="HTML",
            )
            return

        # 1. Extract file info
        duration = None
        if message.voice:
            file_id = message.voice.file_id
            file_size = message.voice.file_size or 0
            duration = message.voice.duration or 0
            timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
            file_name = f"voice_{timestamp}.ogg"
            content_type = "audio/ogg"
        elif message.audio:
            file_id = message.audio.file_id
            file_size = message.audio.file_size or 0
            duration = message.audio.duration or 0
            file_name = message.audio.file_name or f"audio_{message.audio.file_unique_id}.mp3"
            content_type = message.audio.mime_type or "audio/mpeg"
        elif message.photo:
            photo = message.photo[-1]
            file_id = photo.file_id
            file_size = photo.file_size or 0
            file_name = f"photo_{photo.file_unique_id}.jpg"
            content_type = "image/jpeg"
        else:
            doc = message.document
            file_id = doc.file_id
            file_size = doc.file_size or 0
            file_name = doc.file_name or "document.bin"
            content_type = doc.mime_type or "application/octet-stream"

        # Validate file size
        if file_size > MAX_TELEGRAM_FILE_SIZE:
            await message.answer(
                "⚠️ حجم فایل بیش از حد مجاز (۲۵ مگابایت) است."
                if lang == "fa"
                else "⚠️ File exceeds the maximum allowed size (25MB)."
            )
            return

        # Sanitize filename
        clean_name = re.sub(r"[^\w.\-_]", "_", os.path.basename(file_name))[:128] or "attachment"

        # Download from Telegram
        try:
            tg_file = await bot.get_file(file_id)
            if not tg_file.file_path:
                await message.answer(
                    "خطا در دریافت فایل از تلگرام." if lang == "fa" else "Error downloading file from Telegram."
                )
                return

            dest_buffer = io.BytesIO()
            await bot.download_file(tg_file.file_path, destination=dest_buffer)
            dest_buffer.seek(0)
        except Exception as dl_err:
            logger.exception("telegram_file_download_error", error=str(dl_err))
            await message.answer(
                f"❌ خطا در دریافت فایل از تلگرام: {dl_err}"
                if lang == "fa"
                else f"❌ Failed to download file from Telegram: {dl_err}"
            )
            return

        # 2. Check if user is currently inside an active Creation Wizard
        conv_state = await conversation_state_manager.get_state(user_tg_id)
        wizard_data = get_wizard_data(conv_state.pending_intent)

        if wizard_data and wizard_data.get("type") == "wizard":
            # Save as temporary draft attachment in MinIO/S3
            draft_storage_key = f"drafts/{user_tg_id}/{uuid4()}-{clean_name}"
            await file_storage_service.upload_async(draft_storage_key, dest_buffer, content_type)

            draft_item = {
                "storage_key": draft_storage_key,
                "file_name": clean_name,
                "content_type": content_type,
                "size_bytes": file_size,
                "duration": duration,
                "source": "telegram",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }

            payload = wizard_data.setdefault("data", {})
            payload.setdefault("draft_attachments", []).append(draft_item)

            # If user was on attachments step or sent file during wizard
            wizard_data["step"] = "attachments"
            await save_wizard_data(user_tg_id, wizard_data, "Draft attachment uploaded")

            total_drafts = len(payload["draft_attachments"])
            sz_mb = f"{file_size / (1024 * 1024):.1f} MB" if file_size >= 1024 * 1024 else f"{file_size / 1024:.0f} KB"
            dur_info = f" ({duration}s)" if lang == "en" else f" ({duration} ثانیه)" if duration else ""

            if lang == "fa":
                ack_text = (
                    f"📎 فایل <b>«{html.escape(clean_name)}»</b>{dur_info} ({sz_mb}) با موفقیت به پیش‌نویس اضافه شد.\n\n"
                    f"📊 <b>مجموع پیوست‌ها:</b> {total_drafts} فایل\n\n"
                    "می‌توانید فایل یا ویس دیگری بفرستید، یا جهت ادامه دکمه <b>«ادامه»</b> را انتخاب کنید:"
                )
                markup = InlineKeyboardMarkup(
                    inline_keyboard=[
                        [
                            InlineKeyboardButton(text="➡️ ادامه", callback_data="w:next"),
                            InlineKeyboardButton(text="🗑 حذف آخرین فایل", callback_data="w:rm_att"),
                        ],
                        [
                            InlineKeyboardButton(text="❌ لغو عملیات", callback_data="w:cancel"),
                        ],
                    ]
                )
            else:
                ack_text = (
                    f"📎 File <b>«{html.escape(clean_name)}»</b>{dur_info} ({sz_mb}) was added to draft attachments.\n\n"
                    f"📊 <b>Total attachments:</b> {total_drafts} file(s)\n\n"
                    "You can send more files/voices or tap <b>'Next'</b> to continue:"
                )
                markup = InlineKeyboardMarkup(
                    inline_keyboard=[
                        [
                            InlineKeyboardButton(text="➡️ Next", callback_data="w:next"),
                            InlineKeyboardButton(text="🗑 Remove Last", callback_data="w:rm_att"),
                        ],
                        [
                            InlineKeyboardButton(text="❌ Cancel", callback_data="w:cancel"),
                        ],
                    ]
                )

            await message.reply(ack_text, reply_markup=markup, parse_mode="HTML")
            return

        # 3. Not in wizard: check active task or project context for direct attachment
        last_tid = await conversation_state_manager.get_context(user_tg_id, "last_task_id")
        last_pid = await conversation_state_manager.get_context(user_tg_id, "last_project_id")

        if last_tid:
            task = await projects_repo.get_task(db, UUID(last_tid))
            if task:
                try:
                    await _require_task_access(db, current_user, task.id)
                    attachment = await collaboration_service.upload_file(
                        db,
                        entity_type="task",
                        entity_id=task.id,
                        file_name=clean_name,
                        content_type=content_type,
                        content=dest_buffer,
                        size_bytes=file_size,
                        current_user=current_user,
                    )
                    await message.answer(
                        f"📎 فایل <b>«{html.escape(attachment.file_name)}»</b> با موفقیت به تسک <b>«{html.escape(task.title)}»</b> پیوست شد."
                        if lang == "fa"
                        else f"📎 File <b>«{html.escape(attachment.file_name)}»</b> attached to task <b>«{html.escape(task.title)}»</b>.",
                        parse_mode="HTML",
                    )
                    return
                except (ForbiddenError, NotFoundError):
                    await message.answer(
                        "⛔️ شما به این تسک دسترسی ندارید."
                        if lang == "fa"
                        else "⛔️ You do not have access to this task.",
                        parse_mode="HTML",
                    )
                    return

        if last_pid:
            project = await projects_repo.get_project(db, UUID(last_pid))
            if project:
                try:
                    await _require_project_access(db, current_user, project.id)
                    attachment = await collaboration_service.upload_file(
                        db,
                        entity_type="project",
                        entity_id=project.id,
                        file_name=clean_name,
                        content_type=content_type,
                        content=dest_buffer,
                        size_bytes=file_size,
                        current_user=current_user,
                    )
                    await message.answer(
                        f"📎 فایل <b>«{html.escape(attachment.file_name)}»</b> با موفقیت به پروژه <b>«{html.escape(project.name)}»</b> پیوست شد."
                        if lang == "fa"
                        else f"📎 File <b>«{html.escape(attachment.file_name)}»</b> attached to project <b>«{html.escape(project.name)}»</b>.",
                        parse_mode="HTML",
                    )
                    return
                except (ForbiddenError, NotFoundError):
                    await message.answer(
                        "⛔️ شما به این پروژه دسترسی ندارید."
                        if lang == "fa"
                        else "⛔️ You do not have access to this project.",
                        parse_mode="HTML",
                    )
                    return

        # No target context found
        await message.answer(
            "📌 تسک یا پروژه مشخصی برای پیوست فایل انتخاب نشده است.\n"
            "لطفاً ابتدا تسک یا پروژه مورد نظر را باز کنید (مثال: «تسک 142 را باز کن») یا از دکمه «پیوست» آن استفاده فرمایید."
            if lang == "fa"
            else "📌 No active task or project is selected.\n"
            "Please open a task or project first (e.g., 'Open task 142') before sending files."
        )
