"""Email sending abstraction (M-14).

Provides `SmtpEmailSender` when `SMTP_HOST` is configured, and `ConsoleEmailSender`
for development/testing. In production, warns if no SMTP provider is configured.
"""

from __future__ import annotations

import asyncio
from typing import Optional, Protocol

import structlog

from app.core.config import get_settings

logger = structlog.get_logger(__name__)


class EmailSender(Protocol):
    async def send(self, to: str, subject: str, body: str) -> None: ...


class ConsoleEmailSender:
    async def send(self, to: str, subject: str, body: str) -> None:
        logger.info("email_sent_dev_mode", to=to, subject=subject, body=body)


class SmtpEmailSender:
    def __init__(
        self,
        host: str,
        port: int,
        user: Optional[str] = None,
        password: Optional[str] = None,
        from_addr: str = "noreply@pmp.example.com",
    ) -> None:
        self.host = host
        self.port = port
        self.user = user
        self.password = password
        self.from_addr = from_addr

    def _sync_send(self, to: str, subject: str, body: str) -> None:
        import smtplib
        from email.mime.text import MIMEText

        msg = MIMEText(body)
        msg["Subject"] = subject
        msg["From"] = self.from_addr
        msg["To"] = to
        with smtplib.SMTP(self.host, self.port) as server:
            if self.port in (587, 25):
                server.starttls()
            if self.user and self.password:
                server.login(self.user, self.password)
            server.send_message(msg)

    async def send(self, to: str, subject: str, body: str) -> None:
        try:
            await asyncio.to_thread(self._sync_send, to, subject, body)
            logger.info("email_sent_smtp", to=to, subject=subject)
        except Exception as e:
            logger.error("email_smtp_delivery_failed", to=to, error=str(e))
            raise


def _init_email_sender() -> EmailSender:
    settings = get_settings()
    if settings.smtp_host:
        return SmtpEmailSender(
            host=settings.smtp_host,
            port=settings.smtp_port,
            user=settings.smtp_user,
            password=settings.smtp_password,
            from_addr=settings.smtp_from,
        )
    if settings.is_production:
        logger.warning(
            "email_sender_unconfigured_in_production",
            msg="SMTP_HOST is not configured; password reset and invitation emails are logged to console only.",
        )
    return ConsoleEmailSender()


email_sender: EmailSender = _init_email_sender()
