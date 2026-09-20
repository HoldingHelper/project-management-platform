"use client";

/* Full music-room view rendered inside the chat drawer (parallel to
   ChannelConversation): now-playing card, transport (control-gated),
   playlist, members, and the owner's Google Drive folder picker. */

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Crown,
  FolderOpen,
  Headphones,
  ListMusic,
  Music,
  Pause,
  Play,
  Repeat,
  Shuffle,
  SkipBack,
  SkipForward,
  Trash2,
  Volume2,
} from "lucide-react";
import { Avatar, Button, Field, Select, TextInput, useToast } from "@/components/ds";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useUserMap } from "@/lib/hooks";
import {
  getDriveAuthUrl,
  getDriveStatus,
  deleteMusicChannel,
  joinMusicChannel,
  listDriveFolders,
  listMusicMembers,
  setChannelFolder,
  setMemberControl,
} from "@/lib/api/music";
import { useMusicPlayer, usePlaybackPosition } from "./MusicPlayerProvider";
import { musicAccent, musicTint } from "./colors";
import type { MusicChannelListItem } from "@/lib/types";

export function MusicChannelView({ item }: { item: MusicChannelListItem }) {
  const { user } = useAuth();
  const player = useMusicPlayer();
  const { state, canControl, blocked, errored } = player;
  const toast = useToast();
  const queryClient = useQueryClient();
  const accent = musicAccent(item.channel.color);
  const isOwner = user?.id === item.channel.owner_user_id;
  const [joining, setJoining] = useState(false);

  async function join() {
    setJoining(true);
    try {
      await joinMusicChannel(item.channel.id);
      queryClient.invalidateQueries({ queryKey: ["music-channels"] });
      player.openChannel({ ...item, is_member: true });
    } catch {
      toast.push("Could not join the channel.", "error");
    } finally {
      setJoining(false);
    }
  }

  async function removeChannel() {
    if (!window.confirm(`Delete music channel “${item.channel.name}”? This cannot be undone.`)) return;
    try {
      await deleteMusicChannel(item.channel.id);
      player.closeChannel();
      await queryClient.invalidateQueries({ queryKey: ["music-channels"] });
      toast.push("Music channel deleted.", "success");
    } catch (error) {
      toast.push(error instanceof Error ? error.message : "Could not delete the music channel.", "error");
    }
  }

  if (!item.is_member) {
    return (
      <div style={{ padding: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 12, textAlign: "center" }}>
        <span style={{ width: 56, height: 56, borderRadius: "var(--radius-full)", background: musicTint(item.channel.color, 18), color: accent, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Music size={26} />
        </span>
        <div style={{ fontWeight: 800, fontSize: 15 }}>{item.channel.name}</div>
        <div style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>
          {item.member_count} listener{item.member_count === 1 ? "" : "s"} · join to listen together in sync
        </div>
        <Button onClick={join} disabled={joining}>
          {joining ? "Joining…" : "Join & listen"}
        </Button>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12, padding: 12 }}>
      <NowPlayingCard item={item} />
      {blocked && (
        <button
          onClick={() => void player.resume()}
          style={{
            border: `1px solid ${accent}`,
            background: musicTint(item.channel.color, 10),
            color: accent,
            borderRadius: "var(--radius-3)",
            padding: "10px 12px",
            fontWeight: 700,
            fontSize: 12.5,
            cursor: "pointer",
          }}
        >
          Tap to start listening (your browser blocked autoplay)
        </button>
      )}
      {errored && !blocked && (
        <button
          onClick={() => void player.reconnect()}
          style={{
            border: "1px solid var(--status-danger, #d33)",
            background: "transparent",
            color: "var(--status-danger, #d33)",
            borderRadius: "var(--radius-3)",
            padding: "10px 12px",
            fontWeight: 700,
            fontSize: 12.5,
            cursor: "pointer",
          }}
        >
          Stream lost — tap to reconnect
        </button>
      )}
      {(!state || state.playlist.length === 0) && (
        <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", padding: "2px 4px" }}>
          {isOwner
            ? "Pick a Google Drive folder below to build the playlist."
            : "No playlist yet — the channel owner needs to pick a Drive folder."}
        </div>
      )}
      {state && state.playlist.length > 0 && <Playlist item={item} />}
      {isOwner && <DriveSection item={item} />}
      <MembersSection item={item} isOwner={isOwner} />
      {isOwner && (
        <Button variant="secondary" onClick={removeChannel}>
          <Trash2 size={14} /> Delete music channel
        </Button>
      )}
      {!canControl && (
        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", display: "flex", alignItems: "center", gap: 6 }}>
          <Headphones size={13} /> Listening mode — the owner can grant you playback control.
        </div>
      )}
    </div>
  );
}

function NowPlayingCard({ item }: { item: MusicChannelListItem }) {
  const {
    state,
    canControl,
    command,
    next,
    previous,
    volume,
    setVolume,
    duration,
    shuffle,
    repeat,
    setShuffle,
    setRepeat,
  } = useMusicPlayer();
  const position = usePlaybackPosition();
  const accent = musicAccent(item.channel.color);
  const track = state?.track;
  // Without a known duration the thumb would pin to the end (max === value);
  // keep headroom so it visibly advances, and disable seeking.
  const durationKnown = duration > 0;
  const progressMax = durationKnown
    ? Math.max(1, Math.floor(duration))
    : Math.max(60, Math.floor(position) + 30);

  return (
    <div
      style={{
        borderRadius: "var(--radius-4)",
        border: "1px solid var(--border-default)",
        background: `linear-gradient(135deg, ${musicTint(item.channel.color, 22)}, var(--surface-2))`,
        boxShadow: "var(--shadow-md)",
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          style={{
            width: 44,
            height: 44,
            borderRadius: "var(--radius-3)",
            background: musicTint(item.channel.color, 30),
            color: accent,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {state?.is_playing ? <EqualizerIcon color={accent} /> : <Music size={20} />}
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontWeight: 800, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {track ? track.name.replace(/\.[a-z0-9]+$/i, "") : "Nothing playing"}
          </span>
          <span style={{ display: "block", fontSize: 11, color: "var(--text-tertiary)" }}>
            {state ? `Track ${state.track_index + 1} of ${state.playlist.length}` : "—"}
          </span>
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
        <TransportButton
          title="Previous"
          disabled={!canControl || !track}
          onClick={() => void previous()}
        >
          <SkipBack size={16} />
        </TransportButton>
        <TransportButton
          title={state?.is_playing ? "Pause for everyone" : "Play for everyone"}
          disabled={!canControl || !track}
          primary
          accent={accent}
          onClick={() => void command(state?.is_playing ? "pause" : "play")}
        >
          {state?.is_playing ? <Pause size={18} /> : <Play size={18} style={{ marginLeft: 2 }} />}
        </TransportButton>
        <TransportButton
          title="Next"
          disabled={!canControl || !track}
          onClick={() => void next()}
        >
          <SkipForward size={16} />
        </TransportButton>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10.5, color: "var(--text-tertiary)" }}>
        <span style={{ minWidth: 32 }}>{formatClock(position)}</span>
        <input
          type="range"
          min={0}
          max={progressMax}
          value={Math.min(progressMax, Math.floor(position))}
          disabled={!canControl || !track || !durationKnown}
          onChange={(e) => void command("seek", { position_seconds: Number(e.target.value) })}
          style={{ flex: 1, accentColor: accent }}
          aria-label="Seek"
        />
        <span style={{ minWidth: 32, textAlign: "right" }}>
          {duration ? formatClock(duration) : "--:--"}
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10.5, color: "var(--text-tertiary)" }}>
        <TransportButton
          title={shuffle ? "Shuffle on" : "Straight order"}
          disabled={!canControl || !track}
          active={shuffle}
          accent={accent}
          onClick={() => setShuffle(!shuffle)}
        >
          <Shuffle size={14} />
        </TransportButton>
        <TransportButton
          title={repeat ? "Repeat on" : "Repeat off"}
          disabled={!canControl || !track}
          active={repeat}
          accent={accent}
          onClick={() => setRepeat(!repeat)}
        >
          <Repeat size={14} />
        </TransportButton>
        <span style={{ flex: 1 }} />
        <Volume2 size={13} />
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(volume * 100)}
          onChange={(e) => setVolume(Number(e.target.value) / 100)}
          style={{ width: 64, accentColor: accent }}
          aria-label="Volume"
        />
      </div>
    </div>
  );
}

function Playlist({ item }: { item: MusicChannelListItem }) {
  const { state, canControl, command } = useMusicPlayer();
  const accent = musicAccent(item.channel.color);
  if (!state) return null;
  return (
    <div style={{ borderRadius: "var(--radius-3)", border: "1px solid var(--border-subtle)", overflow: "hidden" }}>
      <div style={{ padding: "8px 12px", fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.7, color: "var(--text-tertiary)", display: "flex", alignItems: "center", gap: 6 }}>
        <ListMusic size={12} /> Playlist · {state.playlist.length} tracks
        {item.channel.drive_folder_name && <span style={{ fontWeight: 500, textTransform: "none", letterSpacing: 0 }}>({item.channel.drive_folder_name})</span>}
      </div>
      <div style={{ maxHeight: 220, overflowY: "auto" }}>
        {state.playlist.map((t, i) => {
          const current = i === state.track_index;
          return (
            <button
              key={t.id}
              className="pmp-row"
              disabled={!canControl}
              onClick={() => void command("set_track", { track_index: i })}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                border: "none",
                background: current ? musicTint(item.channel.color, 12) : "transparent",
                cursor: canControl ? "pointer" : "default",
                padding: "7px 12px",
                textAlign: "left",
                color: current ? accent : "var(--text-secondary)",
                fontSize: 12.5,
                fontWeight: current ? 700 : 500,
              }}
            >
              <span style={{ width: 18, flexShrink: 0, textAlign: "right", fontSize: 10.5, color: current ? accent : "var(--text-tertiary)" }}>
                {current && state.is_playing ? <EqualizerIcon color={accent} size={11} /> : i + 1}
              </span>
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {t.name.replace(/\.[a-z0-9]+$/i, "")}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DriveSection({ item }: { item: MusicChannelListItem }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const player = useMusicPlayer();
  const [folderId, setFolderId] = useState("");
  const [folderInput, setFolderInput] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: drive } = useQuery({ queryKey: ["music-drive-status"], queryFn: getDriveStatus });
  const { data: folders } = useQuery({
    queryKey: ["music-drive-folders"],
    queryFn: listDriveFolders,
    enabled: !!drive?.connected,
  });

  async function connect() {
    try {
      const { url } = await getDriveAuthUrl();
      window.open(url, "_blank", "width=520,height=680");
    } catch (e) {
      toast.push(e instanceof Error ? e.message : "Drive is not configured.", "error");
    }
  }

  async function applyFolder() {
    const source = folderInput.trim() || folderId;
    if (!source) return;
    setSaving(true);
    try {
      await setChannelFolder(item.channel.id, {
        folder_id: source,
        folder_name: folderInput.trim()
          ? "Public Drive folder"
          : folders?.find((f) => f.id === folderId)?.name,
      });
      setFolderInput("");
      await player.refreshState();
      queryClient.invalidateQueries({ queryKey: ["music-channels"] });
      toast.push("Playlist loaded from Drive.", "success");
    } catch (e) {
      toast.push(e instanceof Error ? e.message : "Could not load that folder.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ borderRadius: "var(--radius-3)", border: "1px solid var(--border-subtle)", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.7, color: "var(--text-tertiary)", display: "flex", alignItems: "center", gap: 6 }}>
        <FolderOpen size={12} /> Google Drive source
      </div>
      <Field label="Public folder link">
        <TextInput
          value={folderInput}
          onChange={(e) => setFolderInput(e.target.value)}
          placeholder="Paste a public Google Drive folder URL"
        />
      </Field>
      <Button onClick={applyFolder} disabled={!(folderInput.trim() || folderId) || saving}>
        {saving ? "Loading tracks…" : "Use folder as playlist"}
      </Button>
      {!drive?.connected ? (
        <>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
            Public folders work without connecting Drive. Connect only for private folders.
          </div>
          <Button variant="secondary" onClick={connect} disabled={drive ? !drive.configured : false}>
            {drive && !drive.configured ? "Drive not configured on server" : "Connect Google Drive"}
          </Button>
          {drive?.configured && (
            <button
              onClick={() => queryClient.invalidateQueries({ queryKey: ["music-drive-status"] })}
              style={{ border: "none", background: "transparent", color: "var(--text-link)", fontSize: 11.5, cursor: "pointer", textAlign: "left", padding: 0 }}
            >
              I finished connecting — refresh
            </button>
          )}
        </>
      ) : (
        <>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
            Connected{drive.email ? ` as ${drive.email}` : ""}
          </div>
          <Field label="Playlist folder">
            <Select
              value={folderId}
              onChange={(e) => setFolderId(e.target.value)}
              placeholder="Choose a folder…"
              options={(folders ?? []).map((f) => ({ value: f.id, label: f.name }))}
            />
          </Field>
        </>
      )}
    </div>
  );
}

function MembersSection({ item, isOwner }: { item: MusicChannelListItem; isOwner: boolean }) {
  const { nameOf } = useUserMap();
  const toast = useToast();
  const accent = musicAccent(item.channel.color);
  const { data: members, refetch } = useQuery({
    queryKey: ["music-members", item.channel.id],
    queryFn: () => listMusicMembers(item.channel.id),
  });

  async function toggleControl(userId: string, next: boolean) {
    try {
      await setMemberControl(item.channel.id, userId, next);
      await refetch();
    } catch {
      toast.push("Could not update member.", "error");
    }
  }

  const sorted = useMemo(
    () =>
      [...(members ?? [])].sort((a, b) => {
        if (a.user_id === item.channel.owner_user_id) return -1;
        if (b.user_id === item.channel.owner_user_id) return 1;
        return Number(b.can_control) - Number(a.can_control);
      }),
    [members, item.channel.owner_user_id],
  );

  return (
    <div style={{ borderRadius: "var(--radius-3)", border: "1px solid var(--border-subtle)", overflow: "hidden" }}>
      <div style={{ padding: "8px 12px", fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.7, color: "var(--text-tertiary)" }}>
        Listeners · {sorted.length}
      </div>
      {sorted.map((m) => {
        const owner = m.user_id === item.channel.owner_user_id;
        return (
          <div key={m.user_id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px" }}>
            <Avatar name={nameOf(m.user_id)} size={24} />
            <span style={{ flex: 1, fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {nameOf(m.user_id)}
            </span>
            {owner ? (
              <span title="Channel owner" style={{ color: accent, display: "inline-flex" }}>
                <Crown size={13} />
              </span>
            ) : m.can_control ? (
              <span style={{ fontSize: 10, fontWeight: 700, color: accent, border: `1px solid ${accent}`, borderRadius: "var(--radius-full)", padding: "1px 7px" }}>
                DJ
              </span>
            ) : null}
            {isOwner && !owner && (
              <button
                onClick={() => void toggleControl(m.user_id, !m.can_control)}
                style={{ border: "none", background: "transparent", color: "var(--text-link)", fontSize: 10.5, cursor: "pointer", padding: 0 }}
              >
                {m.can_control ? "revoke" : "allow control"}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TransportButton({
  children,
  onClick,
  disabled,
  title,
  primary = false,
  active = false,
  accent,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title: string;
  primary?: boolean;
  active?: boolean;
  accent?: string;
}) {
  const size = primary ? 44 : 34;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      style={{
        width: size,
        height: size,
        borderRadius: "var(--radius-full)",
        border: primary || active ? "none" : "1px solid var(--border-default)",
        background: primary || active ? accent : "var(--surface-2)",
        color: primary || active ? "var(--text-on-accent)" : "var(--text-primary)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: primary ? "var(--shadow-sm)" : "none",
      }}
    >
      {children}
    </button>
  );
}

/** Tiny animated three-bar equalizer (pure CSS). */
function EqualizerIcon({ color, size = 14 }: { color: string; size?: number }) {
  const bar = (delay: string) => ({
    width: Math.max(2, Math.round(size / 5)),
    background: color,
    borderRadius: 1,
    animation: `pmp-eq 0.9s ease-in-out ${delay} infinite alternate`,
  });
  return (
    <span style={{ display: "inline-flex", alignItems: "flex-end", gap: 2, height: size }} aria-label="Playing">
      <style>{`@keyframes pmp-eq { from { height: 25%; } to { height: 100%; } }`}</style>
      <span style={{ ...bar("0s"), height: "60%" }} />
      <span style={{ ...bar("0.25s"), height: "100%" }} />
      <span style={{ ...bar("0.5s"), height: "40%" }} />
    </span>
  );
}

function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
