"""Music module business logic: listening rooms, synchronized playback and the
Google Drive playlist source.

Performance model ("listen together"):
- The server NEVER relays live audio to listeners as a broadcast. Transport
  changes are tiny JSON frames pushed over the `music:{channel_id}` websocket
  group (`music.playback`), stamped with the server clock. Each client plays
  the track itself and reconciles its <audio> position against
  `position_seconds + (now - server_epoch_ms)/1000`.
- Late joiners call `get_state` once and reconcile the same way.
- Playback commands go through REST (control-gated) and are re-broadcast from
  the authoritative persisted state, so the controller and every listener are
  driven by the same frame.
"""

from __future__ import annotations

import asyncio
import logging
import secrets
import time
from typing import List, Optional
from uuid import UUID

import jwt
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import get_redis
from app.core.config import get_settings
from app.core.database import AsyncSessionLocal
from app.core.exceptions import (
    ForbiddenError,
    NotFoundError,
    UnauthorizedError,
    ValidationAppError,
)
from app.core.google_drive import (
    decrypt_refresh_token,
    encrypt_refresh_token,
    google_drive_service,
)
from app.core.websocket_manager import connection_manager
from app.modules.music import repository as repo
from app.modules.music.cache import StreamTriple, music_cache_service
from app.modules.music.models import (
    DriveConnection,
    MusicChannel,
    MusicChannelMember,
    MusicPlaybackState,
)
from app.shared.base_model import utcnow
from app.modules.music.schemas import (
    AddMemberRequest,
    DriveAuthUrlRead,
    DriveFolderRead,
    DriveStatusRead,
    MusicChannelCreate,
    MusicChannelListItem,
    MusicChannelRead,
    MusicMemberRead,
    PlaybackCommand,
    PlaybackStateRead,
    TrackInfo,
)

logger = logging.getLogger(__name__)

# Public lobby group (broadcast-only UI metadata: which room is playing what).
LOBBY_GROUP = "music-lobby"

_OAUTH_STATE_TTL = 600  # seconds
_STREAM_TOKEN_TYPE = "music_stream"
# Per-user cap on signed-URL minting; stops client retry storms from turning
# a Drive outage into a request flood. Normal use is a handful per track.
_STREAM_URL_RATE_LIMIT_PER_MINUTE = 30


def _now_ms() -> int:
    return int(time.time() * 1000)


# ---------- membership / control gates ----------


async def _require_channel(db: AsyncSession, channel_id: UUID) -> MusicChannel:
    channel = await repo.get_channel(db, channel_id)
    if channel is None or channel.archived_at is not None:
        raise NotFoundError("MusicChannel", channel_id)
    return channel


async def _require_member(
    db: AsyncSession, channel_id: UUID, user_id: UUID
) -> MusicChannel:
    channel = await _require_channel(db, channel_id)
    if await repo.get_member(db, channel_id, user_id) is None:
        raise ForbiddenError("You are not a member of this music channel.")
    return channel


async def _require_control(
    db: AsyncSession, channel_id: UUID, user_id: UUID
) -> MusicChannel:
    channel = await _require_channel(db, channel_id)
    if channel.owner_user_id == user_id:
        return channel
    member = await repo.get_member(db, channel_id, user_id)
    if member is None or not member.can_control:
        raise ForbiddenError(
            "Only the channel owner or allowed members can control playback."
        )
    return channel


async def is_member(db: AsyncSession, channel_id: UUID, user_id: UUID) -> bool:
    """Cross-module/websocket contract: cheap membership check (mirrors
    `chat.service.is_member`; used by the `/ws` music: join gate)."""
    return await repo.get_member(db, channel_id, user_id) is not None


# ---------- channels ----------


async def create_channel(
    db: AsyncSession, owner_user_id: UUID, payload: MusicChannelCreate
) -> MusicChannelRead:
    now = utcnow()
    channel = MusicChannel(
        name=payload.name,
        color=payload.color,
        owner_user_id=owner_user_id,
        drive_folder_id=(
            google_drive_service.normalize_folder_id(payload.drive_folder_id)
            if payload.drive_folder_id
            else None
        ),
        drive_folder_name=payload.drive_folder_name,
        created_at=now,
        updated_at=now,
    )
    db.add(channel)
    await db.flush()
    db.add(
        MusicChannelMember(
            channel_id=channel.id,
            user_id=owner_user_id,
            can_control=True,
            created_at=now,
            updated_at=now,
        )
    )
    tracks: list[dict] = []
    if payload.drive_folder_id:
        _, tracks = await _tracks_for_folder(db, owner_user_id, payload.drive_folder_id)
    db.add(
        MusicPlaybackState(
            channel_id=channel.id,
            playlist=tracks,
            track_index=0,
            is_playing=False,
            position_seconds=0.0,
            server_epoch_ms=_now_ms(),
        )
    )
    await db.commit()
    await db.refresh(channel)
    await connection_manager.broadcast_to_group(
        LOBBY_GROUP, "music.lobby", {"channel_id": str(channel.id)}
    )
    return MusicChannelRead.model_validate(channel)


async def list_channels(
    db: AsyncSession, user_id: UUID
) -> List[MusicChannelListItem]:
    channels = await repo.list_channels(db)
    counts = await repo.member_counts(db)
    states = await repo.states_by_channel(db)
    memberships = await repo.memberships_for_user(db, user_id)

    items: List[MusicChannelListItem] = []
    for ch in channels:
        state = states.get(ch.id)
        membership = memberships.get(ch.id)
        now_playing: Optional[str] = None
        is_playing = False
        if state is not None and state.playlist:
            is_playing = state.is_playing
            if 0 <= state.track_index < len(state.playlist):
                now_playing = state.playlist[state.track_index].get("name")
        items.append(
            MusicChannelListItem(
                channel=MusicChannelRead.model_validate(ch),
                member_count=counts.get(ch.id, 0),
                is_member=membership is not None,
                can_control=(
                    ch.owner_user_id == user_id
                    or bool(membership and membership.can_control)
                ),
                is_playing=is_playing,
                now_playing=now_playing if is_playing else None,
            )
        )
    return items


async def join_channel(
    db: AsyncSession, channel_id: UUID, user_id: UUID
) -> None:
    """Music rooms are open to everyone with music access; joining makes the
    caller a listener (control stays owner-granted)."""
    await _require_channel(db, channel_id)
    if await repo.get_member(db, channel_id, user_id) is None:
        now = utcnow()
        db.add(
            MusicChannelMember(
                channel_id=channel_id,
                user_id=user_id,
                created_at=now,
                updated_at=now,
            )
        )
        await db.commit()


async def leave_channel(
    db: AsyncSession, channel_id: UUID, user_id: UUID
) -> None:
    channel = await _require_channel(db, channel_id)
    if channel.owner_user_id == user_id:
        raise ValidationAppError("The owner cannot leave their own channel.")
    member = await repo.get_member(db, channel_id, user_id)
    if member is not None:
        await db.delete(member)
        await db.commit()


async def list_members(
    db: AsyncSession, channel_id: UUID, user_id: UUID
) -> List[MusicMemberRead]:
    await _require_member(db, channel_id, user_id)
    members = await repo.list_members(db, channel_id)
    return [MusicMemberRead.model_validate(m) for m in members]


async def add_member(
    db: AsyncSession, channel_id: UUID, owner_id: UUID, payload: AddMemberRequest
) -> MusicMemberRead:
    channel = await _require_channel(db, channel_id)
    if channel.owner_user_id != owner_id:
        raise ForbiddenError("Only the channel owner can manage members.")
    member = await repo.get_member(db, channel_id, payload.user_id)
    if member is None:
        now = utcnow()
        member = MusicChannelMember(
            channel_id=channel_id,
            user_id=payload.user_id,
            can_control=payload.can_control,
            created_at=now,
            updated_at=now,
        )
        db.add(member)
    else:
        member.can_control = payload.can_control
    await db.commit()
    return MusicMemberRead.model_validate(member)


async def set_member_control(
    db: AsyncSession,
    channel_id: UUID,
    owner_id: UUID,
    member_user_id: UUID,
    can_control: bool,
) -> MusicMemberRead:
    channel = await _require_channel(db, channel_id)
    if channel.owner_user_id != owner_id:
        raise ForbiddenError("Only the channel owner can manage members.")
    member = await repo.get_member(db, channel_id, member_user_id)
    if member is None:
        raise NotFoundError("MusicChannelMember", member_user_id)
    member.can_control = can_control
    await db.commit()
    return MusicMemberRead.model_validate(member)


async def remove_member(
    db: AsyncSession, channel_id: UUID, owner_id: UUID, member_user_id: UUID
) -> None:
    channel = await _require_channel(db, channel_id)
    if channel.owner_user_id != owner_id:
        raise ForbiddenError("Only the channel owner can manage members.")
    if member_user_id == channel.owner_user_id:
        raise ValidationAppError("The owner cannot be removed from the channel.")
    member = await repo.get_member(db, channel_id, member_user_id)
    if member is not None:
        await db.delete(member)
        await db.commit()


# ---------- playback ----------


def _current_position(state: MusicPlaybackState) -> float:
    """Track position right now, extrapolated from the last stamped frame."""
    if not state.is_playing:
        return state.position_seconds
    return state.position_seconds + (_now_ms() - state.server_epoch_ms) / 1000.0


def _to_state_read(state: MusicPlaybackState) -> PlaybackStateRead:
    playlist = [TrackInfo(
        id=t["id"],
        name=t.get("name", ""),
        mime_type=t.get("mimeType"),
        size=int(t["size"]) if t.get("size") else None,
        modified_time=t.get("modifiedTime"),
    ) for t in state.playlist]
    track = (
        playlist[state.track_index]
        if 0 <= state.track_index < len(playlist)
        else None
    )
    return PlaybackStateRead(
        channel_id=state.channel_id,
        playlist=playlist,
        track_index=state.track_index,
        track=track,
        is_playing=state.is_playing,
        position_seconds=state.position_seconds,
        server_epoch_ms=state.server_epoch_ms,
        state_version=state.state_version,
        server_now_ms=_now_ms(),
    )


async def _broadcast_playback(state: MusicPlaybackState) -> None:
    """The tiny sync frame every listener reconciles against."""
    track_id = None
    track_name = None
    if 0 <= state.track_index < len(state.playlist):
        track_id = state.playlist[state.track_index].get("id")
        track_name = state.playlist[state.track_index].get("name")
    frame = {
        "channel_id": str(state.channel_id),
        "track_index": state.track_index,
        "track_id": track_id,
        "is_playing": state.is_playing,
        "position_seconds": state.position_seconds,
        "server_epoch_ms": state.server_epoch_ms,
        "state_version": state.state_version,
        "server_now_ms": _now_ms(),
    }
    await connection_manager.broadcast_to_group(
        f"music:{state.channel_id}", "music.playback", frame
    )
    # Lightweight lobby metadata so sidebar rows can pulse "now playing".
    await connection_manager.broadcast_to_group(
        LOBBY_GROUP,
        "music.lobby",
        {
            "channel_id": str(state.channel_id),
            "is_playing": state.is_playing,
            "now_playing": track_name if state.is_playing else None,
        },
    )


async def get_state(
    db: AsyncSession, channel_id: UUID, user_id: UUID
) -> PlaybackStateRead:
    await _require_member(db, channel_id, user_id)
    state = await repo.get_state(db, channel_id)
    if state is None:
        raise NotFoundError("MusicPlaybackState", channel_id)
    return _to_state_read(state)


async def apply_command(
    db: AsyncSession, channel_id: UUID, user_id: UUID, cmd: PlaybackCommand
) -> PlaybackStateRead:
    started = time.monotonic()
    channel = await _require_control(db, channel_id, user_id)
    # Row lock: concurrent commands on the same channel serialize here, so the
    # read-modify-write below (position calc + version bump) is atomic and one
    # controller's command never silently overwrites another's.
    state = await repo.get_state_for_update(db, channel_id)
    if state is None:
        raise NotFoundError("MusicPlaybackState", channel_id)
    if not state.playlist:
        raise ValidationAppError(
            "This channel has no playlist yet; the owner must pick a Drive folder."
        )

    track_count = len(state.playlist)
    position = _current_position(state)

    if cmd.action == "play":
        if cmd.track_index is not None:
            state.track_index = min(cmd.track_index, track_count - 1)
            position = 0.0
        if cmd.position_seconds is not None:
            position = cmd.position_seconds
        state.is_playing = True
    elif cmd.action == "pause":
        state.is_playing = False
    elif cmd.action == "seek":
        if cmd.position_seconds is None:
            raise ValidationAppError("seek requires position_seconds.")
        position = cmd.position_seconds
    elif cmd.action == "next":
        state.track_index = (state.track_index + 1) % track_count
        position = 0.0
    elif cmd.action == "prev":
        state.track_index = (state.track_index - 1) % track_count
        position = 0.0
    elif cmd.action == "set_track":
        if cmd.track_index is None:
            raise ValidationAppError("set_track requires track_index.")
        state.track_index = min(cmd.track_index, track_count - 1)
        position = 0.0

    state.position_seconds = max(0.0, position)
    state.server_epoch_ms = _now_ms()
    state.state_version = state.state_version + 1
    # Broadcast ONLY after the transaction commits, so no listener can reconcile
    # against a version that a rollback would erase.
    await db.commit()
    await db.refresh(state)
    await _broadcast_playback(state)
    logger.info(
        "music.command channel=%s action=%s version=%s latency_ms=%.1f",
        channel_id, cmd.action, state.state_version,
        (time.monotonic() - started) * 1000,
    )
    # Warm the byte cache for the current + next track so playback and the
    # upcoming track change start instantly for every listener.
    await _prewarm_tracks(db, channel, state)
    return _to_state_read(state)


# ---------- Google Drive ----------


async def drive_status(db: AsyncSession, user_id: UUID) -> DriveStatusRead:
    connection = await repo.get_connection(db, user_id)
    return DriveStatusRead(
        configured=google_drive_service.enabled,
        connected=connection is not None,
        email=connection.google_email if connection else None,
    )


async def drive_auth_url(user_id: UUID) -> DriveAuthUrlRead:
    """CSRF-protected consent URL: `state` is random, bound to the user in
    Redis, and must round-trip through the callback."""
    state = secrets.token_urlsafe(24)
    await get_redis().set(
        f"music:oauth:state:{state}", str(user_id), ex=_OAUTH_STATE_TTL
    )
    return DriveAuthUrlRead(
        url=google_drive_service.build_auth_url(state), state=state
    )


async def drive_connect(
    db: AsyncSession, user_id: UUID, code: str, state: str
) -> DriveStatusRead:
    stored = await get_redis().get(f"music:oauth:state:{state}")
    if stored != str(user_id):
        raise UnauthorizedError("Invalid or expired Drive authorization state.")
    await get_redis().delete(f"music:oauth:state:{state}")

    tokens = await google_drive_service.exchange_code(code)
    encrypted = encrypt_refresh_token(tokens["refresh_token"])
    # Google returns an id_token JWT alongside; email is informational only.
    email: Optional[str] = None
    id_token = tokens.get("id_token")
    if id_token:
        try:
            email = jwt.decode(
                id_token, options={"verify_signature": False}
            ).get("email")
        except Exception:  # noqa: BLE001 - purely cosmetic metadata
            email = None

    connection = await repo.get_connection(db, user_id)
    if connection is None:
        db.add(
            DriveConnection(
                user_id=user_id,
                encrypted_refresh_token=encrypted,
                google_email=email,
            )
        )
    else:
        connection.encrypted_refresh_token = encrypted
        connection.google_email = email
    await db.commit()
    return await drive_status(db, user_id)


async def _refresh_token_for(db: AsyncSession, user_id: UUID) -> str:
    connection = await repo.get_connection(db, user_id)
    if connection is None:
        raise ValidationAppError("Connect your Google Drive first.")
    return decrypt_refresh_token(connection.encrypted_refresh_token)


async def _tracks_for_folder(
    db: AsyncSession, owner_id: UUID, folder_id_or_url: str
) -> tuple[str, list[dict]]:
    folder_id = google_drive_service.normalize_folder_id(folder_id_or_url)
    public_error: Optional[Exception] = None
    try:
        tracks = await google_drive_service.list_public_audio_files(folder_id)
        if tracks:
            return folder_id, tracks
    except ValidationAppError as exc:
        public_error = exc

    try:
        token = await _refresh_token_for(db, owner_id)
    except ValidationAppError:
        if public_error:
            raise public_error
        raise
    return folder_id, await google_drive_service.list_audio_files(token, folder_id)


async def drive_folders(
    db: AsyncSession, user_id: UUID
) -> List[DriveFolderRead]:
    token = await _refresh_token_for(db, user_id)
    folders = await google_drive_service.list_folders(token)
    return [DriveFolderRead(id=f["id"], name=f["name"]) for f in folders]


async def set_channel_folder(
    db: AsyncSession,
    channel_id: UUID,
    owner_id: UUID,
    folder_id: str,
    folder_name: Optional[str],
) -> PlaybackStateRead:
    channel = await _require_channel(db, channel_id)
    if channel.owner_user_id != owner_id:
        raise ForbiddenError("Only the channel owner can set the Drive folder.")
    normalized_folder_id, tracks = await _tracks_for_folder(db, owner_id, folder_id)
    if not tracks:
        raise ValidationAppError("That Drive folder contains no audio files.")

    channel.drive_folder_id = normalized_folder_id
    channel.drive_folder_name = folder_name
    state = await repo.get_state(db, channel_id)
    if state is None:
        state = MusicPlaybackState(channel_id=channel_id)
        db.add(state)
    state.playlist = tracks
    state.track_index = 0
    state.is_playing = False
    state.position_seconds = 0.0
    state.server_epoch_ms = _now_ms()
    state.state_version = state.state_version + 1
    await db.commit()
    await db.refresh(state)

    # Playlist changed: nudge members to refetch full state.
    await connection_manager.broadcast_to_group(
        f"music:{channel_id}", "music.playlist", {"channel_id": str(channel_id)}
    )
    return _to_state_read(state)


# ---------- stream tokens (audio element cannot send Authorization headers) ----


def _find_track(state: MusicPlaybackState, file_id: str) -> Optional[dict]:
    return next((t for t in state.playlist if t.get("id") == file_id), None)


def _cache_version(track: dict) -> str:
    """Version tag for the byte cache key. `modifiedTime` changes whenever the
    Drive file is re-uploaded, so a stale cached copy can never be served;
    fall back to `size`, then a constant so the key is always well-formed."""
    raw = track.get("modifiedTime") or track.get("size") or "0"
    # Keep the object key filesystem/S3-safe.
    return "".join(c if c.isalnum() else "-" for c in str(raw))


async def issue_stream_url(
    db: AsyncSession, channel_id: UUID, user_id: UUID, file_id: str
) -> str:
    """Short-lived signed URL for one track. `<audio src>` cannot carry a JWT
    header, so we mint a scoped token (mirrors the S3 presigned-URL pattern
    in collaboration)."""
    await _require_member(db, channel_id, user_id)
    state = await repo.get_state(db, channel_id)
    if state is None or not _find_track(state, file_id):
        raise NotFoundError("Track", file_id)
    rate_key = f"music:streamurl:rl:{user_id}"
    redis = get_redis()
    hits = await redis.incr(rate_key)
    if hits == 1:
        await redis.expire(rate_key, 60)
    if hits > _STREAM_URL_RATE_LIMIT_PER_MINUTE:
        raise ValidationAppError(
            "Too many stream requests; wait a moment and try again."
        )
    settings = get_settings()
    token = jwt.encode(
        {
            "type": _STREAM_TOKEN_TYPE,
            "sub": str(user_id),
            "channel_id": str(channel_id),
            "file_id": file_id,
            "exp": int(time.time()) + settings.music_stream_token_ttl_seconds,
        },
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )
    return (
        f"{settings.api_v1_prefix}/music/tracks/{file_id}/stream?token={token}"
    )


# Keep strong references to fire-and-forget cache fills (asyncio only holds
# weak refs to tasks; without this they can be garbage-collected mid-fill).
_cache_fill_tasks: set[asyncio.Task] = set()


def _track_opener(track: dict, refresh_token: Optional[str]):
    """Build a zero-arg coroutine factory that opens the full Drive stream
    for `track` — the shape the byte cache needs to fill itself."""

    async def open_upstream() -> StreamTriple:
        if track.get("source") == "public_drive":
            return await google_drive_service.stream_public_file(
                track["id"], None
            )
        if refresh_token is None:
            raise ValidationAppError("No Drive credentials for cache fill.")
        return await google_drive_service.stream_file(
            refresh_token, track["id"], None
        )

    return open_upstream


def _spawn_cache_fill(track: dict, refresh_token: Optional[str]) -> None:
    file_id = track.get("id")
    if not file_id:
        return
    task = asyncio.create_task(
        music_cache_service.try_fill(
            file_id, _cache_version(track), _track_opener(track, refresh_token)
        )
    )
    _cache_fill_tasks.add(task)
    task.add_done_callback(_cache_fill_tasks.discard)


async def _prewarm_tracks(
    db: AsyncSession, channel: MusicChannel, state: MusicPlaybackState
) -> None:
    """Warm the current + next track into the byte cache (best-effort)."""
    if not get_settings().music_cache_enabled or not state.playlist:
        return
    count = len(state.playlist)
    indices = {state.track_index % count, (state.track_index + 1) % count}
    tracks = [state.playlist[i] for i in sorted(indices)]
    refresh: Optional[str] = None
    if any(t.get("source") != "public_drive" for t in tracks):
        try:
            refresh = await _refresh_token_for(db, channel.owner_user_id)
        except Exception:  # noqa: BLE001 - warming is best-effort
            refresh = None
    for track in tracks:
        if track.get("source") != "public_drive" and refresh is None:
            continue
        _spawn_cache_fill(track, refresh)


async def open_stream(
    file_id: str, token: str, range_header: Optional[str]
) -> StreamTriple:
    """Validate a stream token and open the track byte stream (range-aware).

    Serves from the MinIO byte cache when possible; on a miss it kicks off a
    single-flight background fill and streams through from Drive for this
    request. Opens its own short-lived DB session for validation so no
    connection is held while the (potentially minutes-long) body streams.
    """
    settings = get_settings()
    try:
        claims = jwt.decode(
            token, settings.jwt_secret, algorithms=[settings.jwt_algorithm]
        )
    except jwt.PyJWTError as exc:
        raise UnauthorizedError("Invalid or expired stream token.") from exc
    if claims.get("type") != _STREAM_TOKEN_TYPE or claims.get("file_id") != file_id:
        raise UnauthorizedError("Invalid stream token.")

    async with AsyncSessionLocal() as db:
        channel = await repo.get_channel(db, UUID(claims["channel_id"]))
        if channel is None:
            raise NotFoundError("MusicChannel", claims["channel_id"])
        state = await repo.get_state(db, channel.id)
        if state is None:
            raise NotFoundError("MusicPlaybackState", channel.id)
        track = _find_track(state, file_id)
        if track is None:
            raise NotFoundError("Track", file_id)
        refresh: Optional[str] = None
        if track.get("source") != "public_drive":
            refresh = await _refresh_token_for(db, channel.owner_user_id)

    if settings.music_cache_enabled:
        served = await music_cache_service.serve(
            file_id, _cache_version(track), range_header
        )
        if served is not None:
            return served
        # Miss: fill in the background (single-flight) while this listener
        # streams through directly — nobody waits for the download.
        logger.info("music.stream cache_miss file=%s", file_id)
        _spawn_cache_fill(track, refresh)

    if track.get("source") == "public_drive":
        return await google_drive_service.stream_public_file(file_id, range_header)
    assert refresh is not None
    return await google_drive_service.stream_file(refresh, file_id, range_header)
