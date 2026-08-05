"""Google Drive integration for music channels.

First (and so far only) external-service integration in the codebase. Talks to
Google's OAuth2 and Drive v3 REST APIs directly with httpx -- deliberately no
`google-api-python-client` dependency; the three calls we need are plain HTTP.

Security posture:
- Only the `drive.readonly` scope is requested.
- Refresh tokens are encrypted at rest with Fernet (`encrypt_refresh_token`);
  the key comes from `MUSIC_TOKEN_ENCRYPTION_KEY`.
- Short-lived access tokens are cached in Redis (never persisted to Postgres)
  keyed by a hash of the refresh token, so we don't hit Google's token
  endpoint on every playlist/stream request.
- Listener browsers never see Google credentials: audio is streamed through
  our authenticated `/music/tracks/{file_id}/stream` proxy which forwards HTTP
  Range headers (required for `<audio>` seeking).
"""

from __future__ import annotations

import hashlib
import json
import re
from typing import Any, AsyncIterator, Optional
from urllib.parse import urlencode

import httpx
from cryptography.fernet import Fernet, InvalidToken

from app.core.cache import get_redis
from app.core.config import get_settings
from app.core.exceptions import UnauthorizedError, ValidationAppError

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files"
DRIVE_PUBLIC_DOWNLOAD_URL = "https://drive.google.com/uc"
DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly"

# Google access tokens live 3600s; refresh a bit early.
_ACCESS_TOKEN_CACHE_TTL = 50 * 60
_HTTP_TIMEOUT = httpx.Timeout(20.0, read=60.0)
# Streaming bodies pace at the consumer's speed (browser buffering pauses,
# cache fills of long tracks): no read deadline, or streams die mid-track.
_STREAM_TIMEOUT = httpx.Timeout(20.0, read=None)

# Shared connection pool for audio streaming (one client per request churns
# TCP/TLS handshakes and defeats keep-alive under 20+ concurrent listeners).
_stream_client: Optional[httpx.AsyncClient] = None


def _get_stream_client() -> httpx.AsyncClient:
    global _stream_client
    if _stream_client is None or _stream_client.is_closed:
        _stream_client = httpx.AsyncClient(
            timeout=_STREAM_TIMEOUT,
            follow_redirects=True,
            limits=httpx.Limits(
                max_connections=64, max_keepalive_connections=16
            ),
        )
    return _stream_client
_DRIVE_FOLDER_ID_RE = re.compile(r"(?:/folders/|id=)([A-Za-z0-9_-]+)")
_DRIVE_IVD_RE = re.compile(r"window\['_DRIVE_ivd'\]\s*=\s*'(.*?)';", re.S)


class GoogleDriveNotConfigured(ValidationAppError):
    def __init__(self) -> None:
        super().__init__(
            "Google Drive integration is not configured on this server "
            "(GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET)."
        )


# --- refresh-token encryption at rest ----------------------------------------


def _fernet() -> Fernet:
    key = get_settings().music_token_encryption_key
    if not key:
        raise GoogleDriveNotConfigured()
    return Fernet(key.encode())


def encrypt_refresh_token(token: str) -> str:
    return _fernet().encrypt(token.encode()).decode()


def decrypt_refresh_token(encrypted: str) -> str:
    try:
        return _fernet().decrypt(encrypted.encode()).decode()
    except InvalidToken as exc:
        raise UnauthorizedError(
            "Stored Google Drive credentials are invalid; reconnect Drive."
        ) from exc


def _decode_drive_string(value: str) -> str:
    try:
        return value.encode("latin1").decode("utf-8")
    except UnicodeError:
        return value


# --- Drive client --------------------------------------------------------------


class GoogleDriveService:
    """Stateless facade over Google's OAuth2 + Drive v3 REST APIs."""

    @property
    def enabled(self) -> bool:
        s = get_settings()
        return bool(s.google_oauth_client_id and s.google_oauth_client_secret)

    def _require_enabled(self) -> None:
        if not self.enabled:
            raise GoogleDriveNotConfigured()

    def build_auth_url(self, state: str) -> str:
        """Consent URL. `access_type=offline` + `prompt=consent` force Google
        to issue a refresh token (otherwise repeat consents omit it)."""
        self._require_enabled()
        s = get_settings()
        return f"{GOOGLE_AUTH_URL}?" + urlencode(
            {
                "client_id": s.google_oauth_client_id,
                "redirect_uri": s.google_oauth_redirect_uri,
                "response_type": "code",
                "scope": f"{DRIVE_SCOPE} email",
                "access_type": "offline",
                "prompt": "consent",
                "state": state,
            }
        )

    async def exchange_code(self, code: str) -> dict[str, Any]:
        """Authorization code -> tokens. Returns Google's token payload
        (`refresh_token`, `access_token`, ...)."""
        self._require_enabled()
        s = get_settings()
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
            res = await client.post(
                GOOGLE_TOKEN_URL,
                data={
                    "client_id": s.google_oauth_client_id,
                    "client_secret": s.google_oauth_client_secret,
                    "redirect_uri": s.google_oauth_redirect_uri,
                    "grant_type": "authorization_code",
                    "code": code,
                },
            )
        if res.status_code != 200:
            raise ValidationAppError("Google rejected the authorization code.")
        payload = res.json()
        if not payload.get("refresh_token"):
            raise ValidationAppError(
                "Google did not return a refresh token; retry the consent flow."
            )
        return payload

    async def _access_token(self, refresh_token: str) -> str:
        """Mint (or reuse a Redis-cached) short-lived access token."""
        self._require_enabled()
        cache_key = (
            "music:gdrive:at:"
            + hashlib.sha256(refresh_token.encode()).hexdigest()[:32]
        )
        cached = await get_redis().get(cache_key)
        if cached:
            return cached
        s = get_settings()
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
            res = await client.post(
                GOOGLE_TOKEN_URL,
                data={
                    "client_id": s.google_oauth_client_id,
                    "client_secret": s.google_oauth_client_secret,
                    "grant_type": "refresh_token",
                    "refresh_token": refresh_token,
                },
            )
        if res.status_code != 200:
            raise UnauthorizedError(
                "Google Drive authorization expired; reconnect Drive."
            )
        token = res.json()["access_token"]
        await get_redis().set(cache_key, token, ex=_ACCESS_TOKEN_CACHE_TTL)
        return token

    async def _list_files(
        self, refresh_token: str, query: str, page_size: int = 200
    ) -> list[dict[str, Any]]:
        token = await self._access_token(refresh_token)
        files: list[dict[str, Any]] = []
        params: dict[str, str] = {
            "q": query,
            "fields": "nextPageToken, files(id, name, mimeType, size, modifiedTime)",
            "pageSize": str(page_size),
            "orderBy": "name",
        }
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
            while True:
                res = await client.get(
                    DRIVE_FILES_URL,
                    params=params,
                    headers={"Authorization": f"Bearer {token}"},
                )
                if res.status_code != 200:
                    raise ValidationAppError("Google Drive listing failed.")
                payload = res.json()
                files.extend(payload.get("files", []))
                next_page = payload.get("nextPageToken")
                if not next_page:
                    return files
                params["pageToken"] = next_page

    async def list_folders(self, refresh_token: str) -> list[dict[str, Any]]:
        return await self._list_files(
            refresh_token,
            "mimeType='application/vnd.google-apps.folder' and trashed=false",
        )

    async def list_audio_files(
        self, refresh_token: str, folder_id: str
    ) -> list[dict[str, Any]]:
        # Basic injection guard: Drive file ids are [A-Za-z0-9_-].
        safe_folder = folder_id.replace("'", "")
        return await self._list_files(
            refresh_token,
            f"'{safe_folder}' in parents and mimeType contains 'audio/' "
            "and trashed=false",
        )

    def normalize_folder_id(self, folder: str) -> str:
        """Accept either a raw Drive folder id or a share URL."""
        match = _DRIVE_FOLDER_ID_RE.search(folder)
        return match.group(1) if match else folder.strip()

    async def list_public_audio_files(self, folder: str) -> list[dict[str, Any]]:
        """List audio files from a public Drive folder without OAuth.

        Google exposes the folder bootstrap payload in `_DRIVE_ivd` on the
        mobile folder page. It is JSON escaped inside a JS string; once decoded
        we can read the same id/name/mime/size fields Drive renders publicly.
        """
        folder_id = self.normalize_folder_id(folder)
        url = f"https://drive.google.com/drive/mobile/folders/{folder_id}"
        async with httpx.AsyncClient(
            timeout=_HTTP_TIMEOUT, follow_redirects=True
        ) as client:
            res = await client.get(url, params={"usp": "sharing"})
        if res.status_code != 200:
            raise ValidationAppError("Public Google Drive folder listing failed.")
        match = _DRIVE_IVD_RE.search(res.text)
        if not match:
            raise ValidationAppError(
                "That Drive folder is not public, or Drive did not expose a file list."
            )

        try:
            payload = json.loads(match.group(1).encode().decode("unicode_escape"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ValidationAppError("Could not read the public Drive folder.") from exc

        tracks: list[dict[str, Any]] = []
        seen: set[str] = set()

        def walk(node: Any) -> None:
            if not isinstance(node, list):
                return
            if (
                len(node) > 4
                and isinstance(node[0], str)
                and isinstance(node[2], str)
                and isinstance(node[3], str)
                and node[3].startswith("audio/")
                and node[0] not in seen
            ):
                seen.add(node[0])
                tracks.append(
                    {
                        "id": node[0],
                        "name": _decode_drive_string(node[2]),
                        "mimeType": node[3],
                        "size": node[13] if len(node) > 13 and node[13] else None,
                        "source": "public_drive",
                    }
                )
                return
            for child in node:
                walk(child)

        walk(payload)
        tracks.sort(key=lambda t: t["name"].casefold())
        return tracks

    async def stream_file(
        self, refresh_token: str, file_id: str, range_header: Optional[str]
    ) -> tuple[int, dict[str, str], AsyncIterator[bytes]]:
        """Open a (range-aware) streaming download of a Drive file.

        Returns `(status_code, passthrough_headers, byte_iterator)` for the
        router to wrap in a StreamingResponse. Forwarding the client's Range
        header is what makes `<audio>` seeking work."""
        token = await self._access_token(refresh_token)
        headers = {"Authorization": f"Bearer {token}"}
        if range_header:
            headers["Range"] = range_header

        client = _get_stream_client()
        req = client.build_request(
            "GET", f"{DRIVE_FILES_URL}/{file_id}", params={"alt": "media"},
            headers=headers,
        )
        res = await client.send(req, stream=True)
        if res.status_code not in (200, 206):
            await res.aclose()
            raise ValidationAppError("Google Drive stream failed.")

        passthrough = {
            name: res.headers[name]
            for name in ("content-type", "content-length", "content-range",
                         "accept-ranges")
            if name in res.headers
        }
        passthrough.setdefault("accept-ranges", "bytes")

        async def body() -> AsyncIterator[bytes]:
            try:
                async for chunk in res.aiter_bytes(chunk_size=64 * 1024):
                    yield chunk
            finally:
                await res.aclose()

        return res.status_code, passthrough, body()

    async def stream_public_file(
        self, file_id: str, range_header: Optional[str]
    ) -> tuple[int, dict[str, str], AsyncIterator[bytes]]:
        """Range-aware stream for a public Drive file."""
        headers = {}
        if range_header:
            headers["Range"] = range_header

        client = _get_stream_client()
        req = client.build_request(
            "GET",
            DRIVE_PUBLIC_DOWNLOAD_URL,
            params={"export": "download", "id": file_id},
            headers=headers,
        )
        res = await client.send(req, stream=True)
        if res.status_code not in (200, 206):
            await res.aclose()
            raise ValidationAppError("Public Google Drive stream failed.")

        passthrough = {
            name: res.headers[name]
            for name in ("content-type", "content-length", "content-range",
                         "accept-ranges")
            if name in res.headers
        }
        passthrough.setdefault("accept-ranges", "bytes")

        async def body() -> AsyncIterator[bytes]:
            try:
                async for chunk in res.aiter_bytes(chunk_size=64 * 1024):
                    yield chunk
            finally:
                await res.aclose()

        return res.status_code, passthrough, body()


google_drive_service = GoogleDriveService()
