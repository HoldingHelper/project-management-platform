"""Pydantic schemas for Google Calendar integration."""

from __future__ import annotations

from datetime import datetime
from typing import Any, List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class CalendarAuthUrlResponse(BaseModel):
    auth_url: str


class CalendarConnectRequest(BaseModel):
    code: str = Field(..., min_length=1)


class CalendarConnectionStatus(BaseModel):
    connected: bool
    google_email: Optional[str] = None
    last_synced_at: Optional[datetime] = None
    is_active: bool = False


class AttendeeRead(BaseModel):
    email: str
    display_name: Optional[str] = None
    response_status: Optional[str] = None
    is_self: bool = False


class CalendarEventRead(BaseModel):
    id: UUID
    google_event_id: str
    title: str
    description: Optional[str] = None
    start_time: datetime
    end_time: datetime
    meet_url: Optional[str] = None
    html_link: Optional[str] = None
    location: Optional[str] = None
    attendees: List[dict[str, Any]] = Field(default_factory=list)
    is_all_day: bool = False
    starts_in_minutes: int = 0
    is_now: bool = False

    model_config = ConfigDict(from_attributes=True)


class UpcomingMeetingsResponse(BaseModel):
    connected: bool
    meetings: List[CalendarEventRead] = Field(default_factory=list)
    next_meeting: Optional[CalendarEventRead] = None
