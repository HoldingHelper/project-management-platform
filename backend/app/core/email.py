"""Email sending abstraction. No real SMTP integration is configured for this
project yet -- `ConsoleEmailSender` logs the message so password-reset/invite
flows are fully testable end-to-end; swap in a real provider (SES, SendGrid,
etc.) by implementing `EmailSender` and rebinding it in `app.main`."""

from __future__ import annotations

from typing import Protocol

import structlog

logger = structlog.get_logger(__name__)


class EmailSender(Protocol):
    async def send(self, to: str, subject: str, body: str) -> None: ...


class ConsoleEmailSender:
    async def send(self, to: str, subject: str, body: str) -> None:
        logger.info("email_sent_dev_mode", to=to, subject=subject, body=body)


email_sender: EmailSender = ConsoleEmailSender()
