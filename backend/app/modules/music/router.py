"""Music module REST endpoints.

Everything except the raw byte stream is JWT-gated via `music.access`. The
stream endpoint (`/tracks/{file_id}/stream`) is authenticated by a short-lived
signed token in the query string instead, because `<audio src>` cannot attach
an Authorization header (same tradeoff as the `/ws` handshake).
"""

from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.current_user import CurrentUser
from app.core.database import get_db
from app.core.deps import require_permission
from app.core.permissions import Permissions
from app.modules.music import service
from app.modules.music.schemas import (
    AddMemberRequest,
    DriveAuthUrlRead,
    DriveConnectRequest,
    DriveFolderRead,
    DriveStatusRead,
    MusicChannelCreate,
    MusicChannelListItem,
    MusicChannelRead,
    MusicMemberRead,
    PlaybackCommand,
    PlaybackStateRead,
    SetFolderRequest,
    StreamUrlRead,
    UpdateMemberRequest,
)

music_router = APIRouter(prefix="/music", tags=["Music"])

_music_access = require_permission(Permissions.MUSIC_ACCESS)


# ---------- channels ----------


@music_router.get("/channels", response_model=list[MusicChannelListItem])
async def list_channels(
    current_user: CurrentUser = Depends(_music_access),
    db: AsyncSession = Depends(get_db),
) -> list[MusicChannelListItem]:
    return await service.list_channels(db, current_user.user_id)


@music_router.post(
    "/channels", response_model=MusicChannelRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_channel(
    payload: MusicChannelCreate,
    current_user: CurrentUser = Depends(_music_access),
    db: AsyncSession = Depends(get_db),
) -> MusicChannelRead:
    return await service.create_channel(db, current_user.user_id, payload)


@music_router.post(
    "/channels/{channel_id}/join",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def join_channel(
    channel_id: UUID,
    current_user: CurrentUser = Depends(_music_access),
    db: AsyncSession = Depends(get_db),
) -> None:
    await service.join_channel(db, channel_id, current_user.user_id)


@music_router.post(
    "/channels/{channel_id}/leave",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def leave_channel(
    channel_id: UUID,
    current_user: CurrentUser = Depends(_music_access),
    db: AsyncSession = Depends(get_db),
) -> None:
    await service.leave_channel(db, channel_id, current_user.user_id)


@music_router.get("/channels/{channel_id}/state", response_model=PlaybackStateRead)
async def get_playback_state(
    channel_id: UUID,
    current_user: CurrentUser = Depends(_music_access),
    db: AsyncSession = Depends(get_db),
) -> PlaybackStateRead:
    return await service.get_state(db, channel_id, current_user.user_id)


@music_router.post(
    "/channels/{channel_id}/playback", response_model=PlaybackStateRead
)
async def playback_command(
    channel_id: UUID,
    payload: PlaybackCommand,
    current_user: CurrentUser = Depends(_music_access),
    db: AsyncSession = Depends(get_db),
) -> PlaybackStateRead:
    return await service.apply_command(
        db, channel_id, current_user.user_id, payload
    )


# ---------- members ----------


@music_router.get(
    "/channels/{channel_id}/members", response_model=list[MusicMemberRead]
)
async def list_members(
    channel_id: UUID,
    current_user: CurrentUser = Depends(_music_access),
    db: AsyncSession = Depends(get_db),
) -> list[MusicMemberRead]:
    return await service.list_members(db, channel_id, current_user.user_id)


@music_router.post(
    "/channels/{channel_id}/members", response_model=MusicMemberRead,
    status_code=status.HTTP_201_CREATED,
)
async def add_member(
    channel_id: UUID,
    payload: AddMemberRequest,
    current_user: CurrentUser = Depends(_music_access),
    db: AsyncSession = Depends(get_db),
) -> MusicMemberRead:
    return await service.add_member(db, channel_id, current_user.user_id, payload)


@music_router.patch(
    "/channels/{channel_id}/members/{member_user_id}",
    response_model=MusicMemberRead,
)
async def update_member(
    channel_id: UUID,
    member_user_id: UUID,
    payload: UpdateMemberRequest,
    current_user: CurrentUser = Depends(_music_access),
    db: AsyncSession = Depends(get_db),
) -> MusicMemberRead:
    return await service.set_member_control(
        db, channel_id, current_user.user_id, member_user_id, payload.can_control
    )


@music_router.delete(
    "/channels/{channel_id}/members/{member_user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def remove_member(
    channel_id: UUID,
    member_user_id: UUID,
    current_user: CurrentUser = Depends(_music_access),
    db: AsyncSession = Depends(get_db),
) -> None:
    await service.remove_member(
        db, channel_id, current_user.user_id, member_user_id
    )


# ---------- Google Drive ----------


@music_router.get("/drive/status", response_model=DriveStatusRead)
async def drive_status(
    current_user: CurrentUser = Depends(_music_access),
    db: AsyncSession = Depends(get_db),
) -> DriveStatusRead:
    return await service.drive_status(db, current_user.user_id)


@music_router.get("/drive/auth-url", response_model=DriveAuthUrlRead)
async def drive_auth_url(
    current_user: CurrentUser = Depends(_music_access),
) -> DriveAuthUrlRead:
    return await service.drive_auth_url(current_user.user_id)


@music_router.post("/drive/connect", response_model=DriveStatusRead)
async def drive_connect(
    payload: DriveConnectRequest,
    current_user: CurrentUser = Depends(_music_access),
    db: AsyncSession = Depends(get_db),
) -> DriveStatusRead:
    return await service.drive_connect(
        db, current_user.user_id, payload.code, payload.state
    )


@music_router.get("/drive/folders", response_model=list[DriveFolderRead])
async def drive_folders(
    current_user: CurrentUser = Depends(_music_access),
    db: AsyncSession = Depends(get_db),
) -> list[DriveFolderRead]:
    return await service.drive_folders(db, current_user.user_id)


@music_router.post(
    "/channels/{channel_id}/folder", response_model=PlaybackStateRead
)
async def set_channel_folder(
    channel_id: UUID,
    payload: SetFolderRequest,
    current_user: CurrentUser = Depends(_music_access),
    db: AsyncSession = Depends(get_db),
) -> PlaybackStateRead:
    return await service.set_channel_folder(
        db, channel_id, current_user.user_id, payload.folder_id, payload.folder_name
    )


# ---------- audio streaming ----------


@music_router.get(
    "/channels/{channel_id}/tracks/{file_id}/stream-url",
    response_model=StreamUrlRead,
)
async def get_stream_url(
    channel_id: UUID,
    file_id: str,
    current_user: CurrentUser = Depends(_music_access),
    db: AsyncSession = Depends(get_db),
) -> StreamUrlRead:
    url = await service.issue_stream_url(
        db, channel_id, current_user.user_id, file_id
    )
    return StreamUrlRead(url=url)


@music_router.get("/tracks/{file_id}/stream", response_model=None)
async def stream_track(
    file_id: str,
    token: str = Query(...),
    range_header: Optional[str] = Header(default=None, alias="Range"),
) -> StreamingResponse:
    # Deliberately no `get_db` dependency: a yield-dependency session would be
    # held open for the entire (minutes-long) byte stream and 20 listeners
    # would exhaust the pool. The service opens a short-lived session for
    # validation and streams sessionless.
    status_code, headers, body = await service.open_stream(
        file_id, token, range_header
    )
    return StreamingResponse(body, status_code=status_code, headers=headers)
