"""FastAPI webhook endpoint for Telegram Bot updates."""

from __future__ import annotations

import hmac
from typing import Any, Dict

import structlog
from fastapi import APIRouter, Request

from app.core.config import get_settings
from app.core.exceptions import ForbiddenError
from app.modules.telegram.bot import feed_telegram_update

logger = structlog.get_logger(__name__)
settings = get_settings()

router = APIRouter(prefix="/telegram", tags=["Telegram Bot"])


@router.post("/webhook")
async def telegram_webhook_handler(request: Request) -> Dict[str, Any]:
    """Receive and dispatch webhook updates from the Telegram Bot API."""
    if settings.telegram_webhook_secret:
        received = request.headers.get("X-Telegram-Bot-Api-Secret-Token")
        if not received or not hmac.compare_digest(received, settings.telegram_webhook_secret):
            raise ForbiddenError("Invalid Telegram webhook secret token.")
    elif settings.is_production:
        raise ForbiddenError("Telegram webhook secret is not configured in production.")

    payload = await request.json()
    await feed_telegram_update(payload)
    return {"ok": True}

