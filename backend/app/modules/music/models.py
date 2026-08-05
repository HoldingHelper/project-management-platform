"""Music module ORM models -- schema `music`.

A `MusicChannel` is a listening room: the owner (and members they grant
`can_control`) drives playback; every member listens in sync. The
authoritative transport state lives in `MusicPlaybackState` (one row per
channel) so late joiners can catch up; live sync is pushed over the
`music:{channel_id}` websocket group.

`DriveConnection` stores one Google Drive link per user. The refresh token is
Fernet-encrypted at rest (see `app.core.google_drive`); never store or log it
in plain text. Audio bytes themselves are never persisted here -- playlists
reference Drive file ids only.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, List, Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.shared.base_model import TimestampMixin, UUIDPKMixin, utcnow

SCHEMA = "music"


class MusicChannel(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "channels"
    __table_args__ = ({"schema": SCHEMA},)

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    # Accent token key for the sidebar box tint (e.g. "violet", "gold").
    color: Mapped[str] = mapped_column(
        String(32), default="violet", nullable=False
    )
    owner_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    # Google Drive source folder (owner's Drive). Null until the owner picks one.
    drive_folder_id: Mapped[Optional[str]] = mapped_column(
        String(128), nullable=True
    )
    drive_folder_name: Mapped[Optional[str]] = mapped_column(
        String(300), nullable=True
    )
    archived_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    members: Mapped[List["MusicChannelMember"]] = relationship(
        back_populates="channel", cascade="all, delete-orphan"
    )
    playback_state: Mapped[Optional["MusicPlaybackState"]] = relationship(
        back_populates="channel", cascade="all, delete-orphan", uselist=False
    )


class MusicChannelMember(Base, TimestampMixin):
    __tablename__ = "channel_members"
    __table_args__ = {"schema": SCHEMA}

    channel_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.channels.id", ondelete="CASCADE"),
        primary_key=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, index=True
    )
    # The "DJ allow-list": owner grants transport control per member.
    can_control: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )

    channel: Mapped["MusicChannel"] = relationship(back_populates="members")


class MusicPlaybackState(Base):
    """Authoritative sync state, one row per channel.

    `position_seconds` is the track position at `server_epoch_ms`; while
    `is_playing`, the *current* position is
    `position_seconds + (now_ms - server_epoch_ms) / 1000`. Clients apply the
    same formula, which is what keeps 10+ listeners aligned without the server
    ever touching audio bytes.
    """

    __tablename__ = "playback_states"
    __table_args__ = {"schema": SCHEMA}

    channel_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.channels.id", ondelete="CASCADE"),
        primary_key=True,
    )
    # Playlist snapshot: [{"id", "name", "mimeType", "size", "modifiedTime",
    # "source"?}, ...] from Drive. `modifiedTime` feeds the version-aware byte
    # cache key so a re-uploaded Drive file never serves stale cached audio.
    playlist: Mapped[List[dict[str, Any]]] = mapped_column(
        JSONB, default=list, nullable=False
    )
    track_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # Monotonic counter bumped on every playback change. Clients drop any
    # frame whose version is <= the one they already applied, so a stale or
    # reordered websocket frame can never move playback backward.
    state_version: Mapped[int] = mapped_column(
        BigInteger, default=0, nullable=False
    )
    is_playing: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    position_seconds: Mapped[float] = mapped_column(
        Float, default=0.0, nullable=False
    )
    # Server clock (epoch ms) when position_seconds was stamped.
    server_epoch_ms: Mapped[int] = mapped_column(
        BigInteger, default=0, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )

    channel: Mapped["MusicChannel"] = relationship(
        back_populates="playback_state"
    )


class DriveConnection(Base):
    """A user's Google Drive link (refresh token encrypted at rest)."""

    __tablename__ = "drive_connections"
    __table_args__ = {"schema": SCHEMA}

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True
    )
    encrypted_refresh_token: Mapped[str] = mapped_column(Text, nullable=False)
    google_email: Mapped[Optional[str]] = mapped_column(
        String(320), nullable=True
    )
    connected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
