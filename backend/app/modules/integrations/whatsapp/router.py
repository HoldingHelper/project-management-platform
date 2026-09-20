"""FastAPI router for WhatsApp webhook and user notification preferences."""

from __future__ import annotations

import json
from typing import Any, Dict, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.current_user import CurrentUser
from app.core.database import get_db
from app.core.deps import get_current_user
from app.modules.integrations.models import WhatsAppUserSettings
from app.modules.integrations.whatsapp import service

whatsapp_router = APIRouter(prefix="/integrations/whatsapp", tags=["WhatsApp Integration"])


class WhatsAppSettingsUpdate(BaseModel):
    phone_number: str = Field(..., min_length=7, max_length=32)
    notify_meetings: bool = True
    notify_mentions: bool = True
    notify_blockers: bool = True
    notify_dms: bool = True


@whatsapp_router.get("/webhook")
async def verify_whatsapp_webhook(
    hub_mode: Optional[str] = Query(None, alias="hub.mode"),
    hub_challenge: Optional[str] = Query(None, alias="hub.challenge"),
    hub_verify_token: Optional[str] = Query(None, alias="hub.verify_token"),
) -> Response:
    """Meta Webhook verification handshake."""
    settings = get_settings()
    if settings.whatsapp_verify_token and hub_mode == "subscribe" and hub_verify_token == settings.whatsapp_verify_token:
        return Response(content=hub_challenge or "", media_type="text/plain")
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Verification failed.")


@whatsapp_router.post("/webhook")
async def whatsapp_incoming_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Dict[str, str]:
    """Receive and respond to incoming WhatsApp messages."""
    try:
        body = await request.json()
    except Exception:
        return {"status": "ignored"}

    entry = (body.get("entry") or [{}])[0]
    changes = (entry.get("changes") or [{}])[0]
    value = changes.get("value") or {}
    messages = value.get("messages") or []

    for msg in messages:
        from_phone = msg.get("from")
        text_obj = msg.get("text") or {}
        text_body = text_obj.get("body")
        if from_phone and text_body:
            reply_text = await service.handle_inbound_whatsapp_message(
                db, from_phone, text_body
            )
            if reply_text:
                await service.send_whatsapp_text_message(from_phone, reply_text)

    return {"status": "ok"}


@whatsapp_router.get("/settings")
async def get_user_whatsapp_settings(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """Retrieve current user's WhatsApp notification settings."""
    res = await db.execute(
        select(WhatsAppUserSettings).where(
            WhatsAppUserSettings.user_id == current_user.user_id
        )
    )
    s = res.scalar_one_or_none()
    if not s:
        return {
            "connected": False,
            "phone_number": "",
            "notify_meetings": True,
            "notify_mentions": True,
            "notify_blockers": True,
            "notify_dms": True,
        }
    return {
        "connected": bool(s.phone_number),
        "phone_number": s.phone_number,
        "notify_meetings": s.notify_meetings,
        "notify_mentions": s.notify_mentions,
        "notify_blockers": s.notify_blockers,
        "notify_dms": s.notify_dms,
        "is_verified": s.is_verified,
    }


@whatsapp_router.post("/settings")
async def update_user_whatsapp_settings(
    payload: WhatsAppSettingsUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """Save user's WhatsApp phone number and alert preferences."""
    res = await db.execute(
        select(WhatsAppUserSettings).where(
            WhatsAppUserSettings.user_id == current_user.user_id
        )
    )
    s = res.scalar_one_or_none()
    if not s:
        s = WhatsAppUserSettings(
            user_id=current_user.user_id,
            phone_number=payload.phone_number,
            notify_meetings=payload.notify_meetings,
            notify_mentions=payload.notify_mentions,
            notify_blockers=payload.notify_blockers,
            notify_dms=payload.notify_dms,
            is_verified=True,
        )
        db.add(s)
    else:
        s.phone_number = payload.phone_number
        s.notify_meetings = payload.notify_meetings
        s.notify_mentions = payload.notify_mentions
        s.notify_blockers = payload.notify_blockers
        s.notify_dms = payload.notify_dms

    await db.commit()
    return {"status": "saved", "phone_number": s.phone_number}


@whatsapp_router.post("/test")
async def send_test_whatsapp_alert(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """Send a test WhatsApp alert to verify delivery."""
    ok = await service.notify_user_via_whatsapp(
        db,
        current_user.user_id,
        message_type="mention",
        title="Verification Test",
        body="Your WhatsApp notifications for Project Management Platform are successfully configured!",
        link="https://localhost:3000",
    )
    return {"delivered": ok}
