"""Google Calendar integration for Project Management Platform.

Manages OAuth2 consent, token refresh, and Google Calendar v3 REST API interactions
for meeting synchronization and smart advance reminders.
"""

from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import urlencode

import httpx

from app.core.cache import get_redis
from app.core.config import get_settings
from app.core.exceptions import UnauthorizedError, ValidationAppError
from app.core.google_drive import decrypt_refresh_token, encrypt_refresh_token

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"
CALENDAR_EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events"

CALENDAR_SCOPES = [
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/userinfo.email",
    "openid",
]

_ACCESS_TOKEN_CACHE_TTL = 50 * 60
_HTTP_TIMEOUT = httpx.Timeout(20.0, read=40.0)

# Match video conference URLs in descriptions or location fields
_MEETING_LINK_REGEX = re.compile(
    r"https?://(?:meet\.google\.com/[a-z]{3}-[a-z]{4}-[a-z]{3}|[a-zA-Z0-9-]+\.zoom\.us/j/[0-9]+|teams\.microsoft\.com/l/meetup-join/[^\s]+)",
    re.IGNORECASE,
)


class GoogleCalendarNotConfigured(ValidationAppError):
    def __init__(self) -> None:
        super().__init__(
            "Google Calendar integration is not configured on this server "
            "(GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET)."
        )


def get_calendar_auth_url(state: str) -> str:
    """Build the OAuth consent URL for Google Calendar."""
    settings = get_settings()
    if not settings.google_oauth_client_id:
        raise GoogleCalendarNotConfigured()

    params = {
        "client_id": settings.google_oauth_client_id,
        "redirect_uri": settings.google_calendar_redirect_uri,
        "response_type": "code",
        "scope": " ".join(CALENDAR_SCOPES),
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    }
    return f"{GOOGLE_AUTH_URL}?{urlencode(params)}"


async def exchange_calendar_code(code: str) -> Dict[str, Any]:
    """Exchange authorization code for refresh token, access token, and user email."""
    settings = get_settings()
    if not settings.google_oauth_client_id or not settings.google_oauth_client_secret:
        raise GoogleCalendarNotConfigured()

    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
        resp = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.google_oauth_client_id,
                "client_secret": settings.google_oauth_client_secret,
                "redirect_uri": settings.google_calendar_redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        if resp.status_code != 200:
            raise UnauthorizedError("Failed to authenticate with Google Calendar.")

        token_data = resp.json()
        refresh_token = token_data.get("refresh_token")
        if not refresh_token:
            raise ValidationAppError(
                "Google did not return a refresh token. Please re-consent by visiting the authorization link."
            )

        access_token = token_data.get("access_token")

        # Fetch authenticated user's email
        email = None
        userinfo_resp = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if userinfo_resp.status_code == 200:
            email = userinfo_resp.json().get("email")

        # Cache the initial access token in Redis
        await _cache_access_token(refresh_token, access_token)

        return {
            "refresh_token": refresh_token,
            "access_token": access_token,
            "email": email,
        }


async def _cache_access_token(refresh_token: str, access_token: str) -> None:
    try:
        redis = get_redis()
        cache_key = f"calendar:token:{hashlib.sha256(refresh_token.encode()).hexdigest()}"
        await redis.set(cache_key, access_token, ex=_ACCESS_TOKEN_CACHE_TTL)
    except Exception:
        pass


async def get_valid_calendar_access_token(refresh_token: str) -> str:
    """Return a valid Google access token, checking Redis cache or refreshing."""
    # Check cache first
    try:
        redis = get_redis()
        cache_key = f"calendar:token:{hashlib.sha256(refresh_token.encode()).hexdigest()}"
        cached = await redis.get(cache_key)
        if cached:
            return cached.decode() if isinstance(cached, bytes) else str(cached)
    except Exception:
        pass

    # Refresh via Google token endpoint
    settings = get_settings()
    if not settings.google_oauth_client_id or not settings.google_oauth_client_secret:
        raise GoogleCalendarNotConfigured()

    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
        resp = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "client_id": settings.google_oauth_client_id,
                "client_secret": settings.google_oauth_client_secret,
                "refresh_token": refresh_token,
                "grant_type": "refresh_token",
            },
        )
        if resp.status_code != 200:
            raise UnauthorizedError(
                "Google Calendar connection expired or revoked. Please reconnect in Settings."
            )

        data = resp.json()
        access_token = data["access_token"]
        await _cache_access_token(refresh_token, access_token)
        return access_token


def extract_meeting_url(event_data: Dict[str, Any]) -> Optional[str]:
    """Extract Google Meet, Zoom, or Teams URL from event metadata."""
    # 1. Direct hangoutLink
    if event_data.get("hangoutLink"):
        return event_data["hangoutLink"]

    # 2. conferenceData entry points
    conf_data = event_data.get("conferenceData") or {}
    for entry in conf_data.get("entryPoints") or []:
        if entry.get("entryPointType") == "video" and entry.get("uri"):
            return entry["uri"]

    # 3. Location or description regex match
    location = event_data.get("location") or ""
    description = event_data.get("description") or ""
    match = _MEETING_LINK_REGEX.search(f"{location} {description}")
    if match:
        return match.group(0)

    return None


async def fetch_calendar_events(
    access_token: str,
    time_min: datetime,
    time_max: datetime,
) -> List[Dict[str, Any]]:
    """Fetch user's primary calendar events between time_min and time_max."""
    iso_min = time_min.astimezone(timezone.utc).isoformat()
    iso_max = time_max.astimezone(timezone.utc).isoformat()

    params = {
        "timeMin": iso_min,
        "timeMax": iso_max,
        "singleEvents": "true",
        "orderBy": "startTime",
        "maxResults": "100",
    }

    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
        resp = await client.get(
            CALENDAR_EVENTS_URL,
            params=params,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if resp.status_code != 200:
            if resp.status_code in (401, 403):
                raise UnauthorizedError("Google Calendar authorization invalid.")
            return []

        data = resp.json()
        return data.get("items", [])
