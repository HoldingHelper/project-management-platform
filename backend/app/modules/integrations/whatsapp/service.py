"""WhatsApp Business Cloud API integration and alert service."""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from uuid import UUID

import httpx
import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.exceptions import ValidationAppError
from app.modules.integrations.models import WhatsAppUserSettings
from app.modules.projects.models import TaskItem as Task

logger = structlog.get_logger(__name__)

GRAPH_API_BASE = "https://graph.facebook.com/v20.0"
_HTTP_TIMEOUT = httpx.Timeout(15.0, read=25.0)


async def send_whatsapp_text_message(
    to_phone_number: str,
    text: str,
) -> bool:
    """Send an outbound text message via WhatsApp Cloud API."""
    settings = get_settings()
    api_token = settings.whatsapp_api_token
    phone_id = settings.whatsapp_phone_number_id

    # Clean phone number (strip whitespace and non-digits except +)
    clean_phone = to_phone_number.replace(" ", "").replace("-", "")
    if clean_phone.startswith("+"):
        clean_phone = clean_phone[1:]

    if not api_token or not phone_id:
        logger.info(
            "whatsapp_simulated_dispatch",
            to=clean_phone,
            message=text[:80],
        )
        return True

    url = f"{GRAPH_API_BASE}/{phone_id}/messages"
    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": clean_phone,
        "type": "text",
        "text": {"preview_url": True, "body": text},
    }

    try:
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
            resp = await client.post(
                url,
                json=payload,
                headers={"Authorization": f"Bearer {api_token}"},
            )
            if resp.status_code in (200, 201):
                return True
            logger.warning(
                "whatsapp_send_failed",
                status_code=resp.status_code,
                response=resp.text,
            )
            return False
    except Exception as exc:
        logger.warning("whatsapp_send_exception", error=str(exc))
        return False


async def notify_user_via_whatsapp(
    db: AsyncSession,
    user_id: UUID,
    message_type: str,  # meeting_reminder, mention, dm, blocker
    title: str,
    body: str,
    link: Optional[str] = None,
) -> bool:
    """Check user's WhatsApp preferences and dispatch alert if enabled."""
    res = await db.execute(
        select(WhatsAppUserSettings).where(WhatsAppUserSettings.user_id == user_id)
    )
    settings = res.scalar_one_or_none()
    if not settings or not settings.is_verified or not settings.phone_number:
        return False

    if message_type.startswith("meeting") and not settings.notify_meetings:
        return False
    if message_type == "mention" and not settings.notify_mentions:
        return False
    if message_type == "blocker" and not settings.notify_blockers:
        return False
    if message_type == "dm" and not settings.notify_dms:
        return False

    link_text = f"\n🔗 Open: {link}" if link else ""
    full_message = f"🔔 *Project Management Platform Alert*\n*{title}*\n{body}{link_text}"

    return await send_whatsapp_text_message(settings.phone_number, full_message)


async def handle_inbound_whatsapp_message(
    db: AsyncSession,
    from_phone: str,
    message_text: str,
) -> Optional[str]:
    """Process inbound WhatsApp commands (e.g., 'tasks', 'today', 'help')."""
    cmd = message_text.strip().lower()

    # Find matching user
    clean_phone = from_phone.replace(" ", "").replace("-", "")
    if not clean_phone.startswith("+"):
        clean_phone = f"+{clean_phone}"

    res = await db.execute(
        select(WhatsAppUserSettings).where(WhatsAppUserSettings.phone_number == clean_phone)
    )
    user_settings = res.scalar_one_or_none()

    if not user_settings:
        return (
            "👋 Welcome to Project Management Platform!\nYour phone number is not yet linked. "
            "Please link your number in Settings on localhost:3000 to receive notifications."
        )

    if cmd in ("tasks", "my tasks", "list"):
        # Query active tasks assigned to user
        tasks_res = await db.execute(
            select(Task)
            .where(
                Task.created_by_user_id == user_settings.user_id,
                Task.status.in_(["in_progress", "review", "blocked"]),
            )
            .limit(5)
        )
        tasks = tasks_res.scalars().all()
        if not tasks:
            return "✅ You have no active pending tasks right now. Great job!"

        lines = ["📋 *Your Active Tasks:*"]
        for t in tasks:
            lines.append(f"• *[{t.status.upper()}]* {t.title}")
        return "\n".join(lines)

    elif cmd in ("help", "hi", "hello"):
        return (
            "🤖 *Project Management Platform Assistant*\n"
            "Available commands:\n"
            "• *tasks* - List your current active tasks\n"
            "• *status* - Check your notification preferences\n"
            "• *help* - Show this command guide"
        )

    return "Got your message! Type *help* to see available bot commands."
