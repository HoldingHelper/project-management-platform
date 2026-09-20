"""Calendar module ORM models -- schema `calendar`.

Stores Google Calendar user connections (with encrypted OAuth tokens at rest)
and synchronized calendar events for smart notifications and real-time meeting countdowns.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, List, Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    Index,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.shared.base_model import TimestampMixin, UUIDPKMixin, utcnow

SCHEMA = "calendar"


class CalendarConnection(Base):
    """User's connected Google Calendar OAuth profile."""

    __tablename__ = "connections"
    __table_args__ = ({"schema": SCHEMA},)

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True
    )
    encrypted_refresh_token: Mapped[str] = mapped_column(Text, nullable=False)
    google_email: Mapped[Optional[str]] = mapped_column(
        String(320), nullable=True
    )
    sync_token: Mapped[Optional[str]] = mapped_column(
        String(512), nullable=True
    )
    last_synced_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    connected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )


class CalendarEvent(Base, UUIDPKMixin, TimestampMixin):
    """Synchronized calendar meeting with attendee, timing, and conference data."""

    __tablename__ = "events"
    __table_args__ = (
        Index("ix_calendar_events_user_start", "user_id", "start_time"),
        Index("ix_calendar_events_remind_10m", "reminded_10m", "start_time"),
        Index("ix_calendar_events_remind_2m", "reminded_2m", "start_time"),
        {"schema": SCHEMA},
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    google_event_id: Mapped[str] = mapped_column(
        String(255), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    start_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    end_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    meet_url: Mapped[Optional[str]] = mapped_column(
        String(1024), nullable=True
    )
    html_link: Mapped[Optional[str]] = mapped_column(
        String(1024), nullable=True
    )
    location: Mapped[Optional[str]] = mapped_column(
        String(500), nullable=True
    )
    attendees: Mapped[List[dict[str, Any]]] = mapped_column(
        JSONB, default=list, nullable=False
    )
    is_all_day: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    reminded_10m: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    reminded_2m: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
