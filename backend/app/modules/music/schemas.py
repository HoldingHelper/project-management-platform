"""Pydantic schemas for the Music module."""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

# Sidebar tint choices -- keys the frontend maps onto theme accent tokens.
CHANNEL_COLORS = ["violet", "gold", "rose", "teal", "blue", "green"]


# ---------- Channels ----------


class MusicChannelCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    color: str = Field(default="violet", pattern="^(" + "|".join(CHANNEL_COLORS) + ")$")
    drive_folder_id: Optional[str] = Field(default=None, min_length=1, max_length=512)
    drive_folder_name: Optional[str] = Field(default=None, max_length=300)


class MusicChannelRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    color: str
    owner_user_id: UUID
    drive_folder_id: Optional[str] = None
    drive_folder_name: Optional[str] = None
    created_at: datetime


class MusicChannelListItem(BaseModel):
    """Sidebar row: channel + live status + the viewer's relationship to it."""

    channel: MusicChannelRead
    member_count: int
    is_member: bool
    can_control: bool
    is_playing: bool
    now_playing: Optional[str] = None  # track name, when playing


class MusicMemberRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    user_id: UUID
    can_control: bool


class AddMemberRequest(BaseModel):
    user_id: UUID
    can_control: bool = False


class UpdateMemberRequest(BaseModel):
    can_control: bool


# ---------- Playback ----------


class TrackInfo(BaseModel):
    id: str
    name: str
    mime_type: Optional[str] = None
    size: Optional[int] = None
    # Drive's modifiedTime (RFC3339) when known; feeds the version-aware cache
    # key so a re-uploaded file busts the stale cached bytes.
    modified_time: Optional[str] = None


class PlaybackStateRead(BaseModel):
    channel_id: UUID
    playlist: List[TrackInfo]
    track_index: int
    track: Optional[TrackInfo] = None
    is_playing: bool
    position_seconds: float
    server_epoch_ms: int
    # Monotonic version; clients drop any frame that is not strictly newer.
    state_version: int

    # Server clock at response time; clients derive clock offset from this
    # (server_epoch_ms alone is stale for late joiners).
    server_now_ms: int


PLAYBACK_ACTIONS = ["play", "pause", "seek", "next", "prev", "set_track"]


class PlaybackCommand(BaseModel):
    action: str = Field(pattern="^(" + "|".join(PLAYBACK_ACTIONS) + ")$")
    position_seconds: Optional[float] = Field(default=None, ge=0)
    track_index: Optional[int] = Field(default=None, ge=0)


# ---------- Google Drive ----------


class DriveStatusRead(BaseModel):
    configured: bool  # server has OAuth credentials
    connected: bool  # this user linked their Drive
    email: Optional[str] = None


class DriveAuthUrlRead(BaseModel):
    url: str
    state: str


class DriveConnectRequest(BaseModel):
    code: str
    state: str


class DriveFolderRead(BaseModel):
    id: str
    name: str


class SetFolderRequest(BaseModel):
    folder_id: str = Field(min_length=1, max_length=512)
    folder_name: Optional[str] = Field(default=None, max_length=300)


class StreamUrlRead(BaseModel):
    url: str
