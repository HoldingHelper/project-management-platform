"use client";

/* Slack-style right-side communication panel:
   - collapsed rail with a total-unread badge
   - expanded 380px drawer: channel list (projects + DMs + music rooms) or the
     open conversation (ChannelConversation) / music room (MusicChannelView)
   - live unread updates via `chat.channel_activity` per-user pushes
   - live "now playing" sidebar state via `music.lobby` broadcasts */

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Hash,
  MessageSquare,
  Music,
  PenSquare,
  Plus,
  Search,
  Square,
  X,
} from "lucide-react";
import { createDm, listChannels } from "@/lib/api/chat";
import { createMusicChannel, listMusicChannels } from "@/lib/api/music";
import { Avatar, Drawer, Modal, PresenceDot, Select, Button, Field, TextInput, PRESENCE_LABELS } from "@/components/ds";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useUserMap } from "@/lib/hooks";
import { usePresenceMap } from "@/lib/stores/presence";
import { useRealtimeEvent } from "@/lib/ws/RealtimeProvider";
import { relativeTime } from "@/lib/format";
import { ChannelConversation } from "./ChannelConversation";
import { MusicChannelView } from "@/components/music/MusicChannelView";
import { useMusicPlayer } from "@/components/music/MusicPlayerProvider";
import { MUSIC_COLORS, musicAccent, musicTint } from "@/components/music/colors";
import type {
  ChannelListItem,
  MusicChannelListItem,
  PresenceStatus,
  UserPresenceInfo,
  UserRead,
  UUID,
} from "@/lib/types";

export function ChatPanel() {
  const { user, hasPermission, isSuperAdmin } = useAuth();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [activeChannel, setActiveChannel] = useState<UUID | null>(null);
  const [newDmOpen, setNewDmOpen] = useState(false);
  const [newMusicOpen, setNewMusicOpen] = useState(false);
  // Viewing state only — audio itself lives in MusicPlayerProvider and keeps
  // playing when the user navigates back to the list or collapses the panel.
  const [musicViewOpen, setMusicViewOpen] = useState(false);
  const player = useMusicPlayer();
  const queryClient = useQueryClient();
  const { nameOf, users } = useUserMap();
  const presence = usePresenceMap();

  const canChat = isSuperAdmin() || hasPermission("chat.access");
  const canMusic = isSuperAdmin() || hasPermission("music.access");

  const { data: channels } = useQuery({
    queryKey: ["chat-channels"],
    queryFn: listChannels,
    enabled: canChat && !!user,
    refetchInterval: 60_000,
  });

  const { data: musicChannels } = useQuery({
    queryKey: ["music-channels"],
    queryFn: listMusicChannels,
    enabled: canMusic && !!user,
    refetchInterval: 60_000,
  });

  useRealtimeEvent(
    ["music.lobby"],
    () => queryClient.invalidateQueries({ queryKey: ["music-channels"] }),
    canMusic ? ["music-lobby"] : [],
  );

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--pmp-chat-width",
      canChat ? (open ? "420px" : "72px") : "0px",
    );
    return () => document.documentElement.style.setProperty("--pmp-chat-width", "72px");
  }, [canChat, open]);

  useEffect(() => {
    const openChat = (e?: Event) => {
      setOpen(true);
      const custom = e as CustomEvent<{ channelId?: UUID }>;
      if (custom?.detail?.channelId) {
        setActiveChannel(custom.detail.channelId);
      }
    };
    window.addEventListener("pmp:open-chat", openChat);
    return () => window.removeEventListener("pmp:open-chat", openChat);
  }, []);

  useRealtimeEvent(["chat.channel_activity", "notification.created"], () => {
    queryClient.invalidateQueries({ queryKey: ["chat-channels"] });
  });

  // Deep link: /?chat=<channelId> opens the panel on that conversation.
  useEffect(() => {
    const target = searchParams.get("chat");
    if (target) {
      setActiveChannel(target as UUID);
      setOpen(true);
    }
  }, [searchParams]);

  const totalUnread = useMemo(
    () => (channels ?? []).reduce((sum, c) => sum + c.unread_count, 0),
    [channels],
  );
  const directMessages = (channels ?? []).filter((c) => c.channel.type === "dm");

  if (!canChat) return null;

  const active = (channels ?? []).find((c) => c.channel.id === activeChannel);
  const displayName = (item: ChannelListItem) =>
    item.channel.type === "dm" ? nameOf(item.dm_user_id) : item.channel.name;
  const userMeta = (id?: UUID | null) => users.find((u) => u.id === id);

  return (
    <>
      {!open && (
        <aside
          className="pmp-chat-rail no-print"
          aria-label="Team chat"
          style={{
            width: 72,
            minWidth: 72,
            height: "100%",
            borderLeft: "1px solid var(--border-default)",
            background: "var(--surface-1)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 10,
            padding: "12px 8px",
          }}
        >
          <button onClick={() => setOpen(true)} title="Open team chat" aria-label="Open team chat" style={railButton}>
            <MessageSquare size={18} />
            {totalUnread > 0 && <UnreadBadge count={totalUnread} />}
          </button>
          {player.active && (
            <button
              onClick={() => {
                setOpen(true);
                setMusicViewOpen(true);
              }}
              title={`Listening: ${player.active.channel.name}`}
              aria-label={`Open music room ${player.active.channel.name}`}
              style={{
                ...railButton,
                borderColor: musicAccent(player.active.channel.color),
                color: musicAccent(player.active.channel.color),
                background: musicTint(player.active.channel.color, 12),
              }}
            >
              <Music size={17} />
            </button>
          )}
          <div style={{ width: 34, height: 1, background: "var(--border-subtle)" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center", overflowY: "auto", padding: "2px 0", width: "100%" }}>
            {directMessages.slice(0, 14).map((item) => {
              const uid = item.dm_user_id;
              const meta = userMeta(uid);
              const dmInfo = uid ? presence[uid] : undefined;
              const status = (dmInfo?.status ?? (meta?.presence_status as PresenceStatus) ?? "offline") as PresenceStatus;
              const statusEmoji = dmInfo?.status_emoji ?? meta?.status_emoji;
              const statusText = dmInfo?.status_text ?? meta?.status_text;
              const title = `${displayName(item)} - ${statusEmoji ? `${statusEmoji} ` : ""}${statusText ? `"${statusText}" · ` : ""}${PRESENCE_LABELS[status]}${meta?.job_title ? ` - ${meta.job_title}` : ""}`;
              return (
                <button
                  key={item.channel.id}
                  onClick={() => {
                    setActiveChannel(item.channel.id);
                    setOpen(true);
                  }}
                  title={title}
                  aria-label={`Open direct message with ${displayName(item)}`}
                  style={railAvatarButton}
                >
                  <Avatar name={displayName(item)} size={34} />
                  <PresenceDot status={status} overlay size={10} />
                  {item.unread_count > 0 && <UnreadBadge count={item.unread_count} small />}
                </button>
              );
            })}
            {directMessages.length === 0 && (
              <button onClick={() => setNewDmOpen(true)} title="Start a direct message" aria-label="Start a direct message" style={railButton}>
                <PenSquare size={17} />
              </button>
            )}
          </div>
        </aside>
      )}

      <Drawer open={open} width={420} className="pmp-chat-drawer" ariaLabel="Team communication">
        <div className="pmp-chat-header"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "0 12px",
            height: 56,
            borderBottom: "1px solid var(--border-default)",
            flexShrink: 0,
          }}
        >
          {musicViewOpen && player.active ? (
            <>
              <button onClick={() => setMusicViewOpen(false)} style={iconBtn} title="Back to channels (keeps playing)" aria-label="Back to channels">
                <ChevronLeft size={16} />
              </button>
              <Music size={16} style={{ color: musicAccent(player.active.channel.color) }} />
              <span style={{ fontWeight: 700, fontSize: 14, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {player.active.channel.name}
              </span>
              <button
                onClick={() => {
                  player.closeChannel();
                  setMusicViewOpen(false);
                }}
                style={iconBtn}
                title="Stop listening"
                aria-label="Stop listening"
              >
                <Square size={14} />
              </button>
            </>
          ) : active ? (
            <>
              <button onClick={() => setActiveChannel(null)} style={iconBtn} title="Back to channels" aria-label="Back to channels">
                <ChevronLeft size={16} />
              </button>
              {active.channel.type === "dm" ? (
                (() => {
                  const meta = active.dm_user_id ? userMeta(active.dm_user_id) : undefined;
                  const dmInfo = active.dm_user_id ? presence[active.dm_user_id] : undefined;
                  const statusVal = (dmInfo?.status ?? (meta?.presence_status as PresenceStatus) ?? "offline") as PresenceStatus;
                  const statusEmoji = dmInfo?.status_emoji ?? meta?.status_emoji;
                  const statusText = dmInfo?.status_text ?? meta?.status_text;
                  return (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                      <span style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
                        <Avatar name={nameOf(active.dm_user_id)} size={30} />
                        <PresenceDot status={statusVal} overlay size={10} />
                      </span>
                      <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontWeight: 700, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {displayName(active)}
                          </span>
                          {statusEmoji && (
                            <span
                              title={statusText ? `${statusEmoji} ${statusText}` : undefined}
                              style={{
                                fontSize: 11.5,
                                background: "var(--surface-3)",
                                padding: "0 5px",
                                borderRadius: "var(--radius-full)",
                                border: "1px solid var(--border-subtle)",
                                lineHeight: 1.3,
                              }}
                            >
                              {statusEmoji}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-tertiary)", display: "flex", alignItems: "center", gap: 5, marginTop: 1 }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                            <PresenceDot status={statusVal} size={7} glow={false} />
                            <span>{PRESENCE_LABELS[statusVal]}</span>
                          </span>
                          {statusText && (
                            <>
                              <span>·</span>
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-secondary)", fontStyle: "italic" }}>
                                {statusText}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()
              ) : (
                <>
                  <Hash size={16} style={{ color: "var(--text-tertiary)" }} />
                  <span style={{ fontWeight: 700, fontSize: 14, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {displayName(active)}
                  </span>
                </>
              )}
            </>
          ) : (
            <>
              <MessageSquare size={16} style={{ color: "var(--accent-secondary)" }} />
              <span style={{ fontWeight: 800, fontSize: 14, flex: 1 }}>Team Chat</span>
              <button onClick={() => setNewDmOpen(true)} style={iconBtn} title="New direct message" aria-label="New direct message">
                <PenSquare size={15} />
              </button>
            </>
          )}
          <button onClick={() => setOpen(false)} style={iconBtn} title="Close" aria-label="Close team chat">
            <X size={16} />
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          {musicViewOpen && player.active ? (
            <MusicChannelView
              item={
                musicChannels?.find((m) => m.channel.id === player.active?.channel.id) ??
                player.active
              }
            />
          ) : active ? (
            <ChannelConversation channelId={active.channel.id} channelName={displayName(active)} />
          ) : (
            <ChannelList
              channels={channels ?? []}
              musicChannels={canMusic ? musicChannels ?? [] : null}
              displayName={displayName}
              presence={presence}
              users={users}
              onOpen={(id) => {
                setMusicViewOpen(false);
                setActiveChannel(id);
              }}
              onOpenMusic={(item) => {
                setActiveChannel(null);
                if (player.active?.channel.id !== item.channel.id) player.openChannel(item);
                setMusicViewOpen(true);
              }}
              onNewMusic={() => setNewMusicOpen(true)}
              nowPlayingId={player.active?.channel.id ?? null}
            />
          )}
        </div>
      </Drawer>

      <NewDmModal
        open={newDmOpen}
        onClose={() => setNewDmOpen(false)}
        users={users.filter((u) => u.id !== user?.id)}
        presence={presence}
        onCreated={(channelId) => {
          setNewDmOpen(false);
          queryClient.invalidateQueries({ queryKey: ["chat-channels"] });
          setActiveChannel(channelId);
        }}
      />

      <NewMusicChannelModal
        open={newMusicOpen}
        onClose={() => setNewMusicOpen(false)}
        onCreated={(item) => {
          setNewMusicOpen(false);
          queryClient.invalidateQueries({ queryKey: ["music-channels"] });
          setActiveChannel(null);
          player.openChannel(item);
          setMusicViewOpen(true);
        }}
      />
    </>
  );
}

function ChannelList({
  channels,
  musicChannels,
  displayName,
  presence,
  users,
  onOpen,
  onOpenMusic,
  onNewMusic,
  nowPlayingId,
}: {
  channels: ChannelListItem[];
  musicChannels: MusicChannelListItem[] | null;
  displayName: (c: ChannelListItem) => string;
  presence: Record<string, UserPresenceInfo>;
  users: UserRead[];
  onOpen: (id: UUID) => void;
  onOpenMusic: (item: MusicChannelListItem) => void;
  onNewMusic: () => void;
  nowPlayingId: UUID | null;
}) {
  // One collapsible "Music" section, collapsed by default.
  const [musicExpanded, setMusicExpanded] = useState(false);
  const projects = channels.filter((c) => c.channel.type === "project");
  const dms = channels.filter((c) => c.channel.type === "dm");
  const anyPlaying = (musicChannels ?? []).some((m) => m.is_playing);

  const renderItem = (item: ChannelListItem) => {
    const meta = item.dm_user_id ? users.find((u) => u.id === item.dm_user_id) : undefined;
    const dmInfo = item.dm_user_id ? presence[item.dm_user_id] : undefined;
    const statusVal = (dmInfo?.status ?? (meta?.presence_status as PresenceStatus) ?? "offline") as PresenceStatus;
    const statusEmoji = dmInfo?.status_emoji ?? meta?.status_emoji;
    const statusText = dmInfo?.status_text ?? meta?.status_text;

    return (
      <button
        key={item.channel.id}
        onClick={() => onOpen(item.channel.id)}
        className="pmp-channel-row pmp-row"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 11,
          width: "100%",
          border: "none",
          background: "transparent",
          cursor: "pointer",
          padding: "9px 14px",
          textAlign: "left",
          color: "var(--text-primary)",
          borderRadius: "var(--radius-sm)",
          transition: "background 0.15s ease",
        }}
      >
        {item.channel.type === "dm" ? (
          <span style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
            <Avatar name={displayName(item)} size={32} />
            <PresenceDot status={statusVal} overlay size={10} />
          </span>
        ) : (
          <span
            style={{
              width: 32,
              height: 32,
              borderRadius: "var(--radius-2)",
              background: "var(--surface-2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-tertiary)",
              flexShrink: 0,
            }}
          >
            <Hash size={14} />
          </span>
        )}
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: item.unread_count > 0 ? 700 : 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span>{displayName(item)}</span>
              {statusEmoji && (
                <span
                  title={statusText ? `${statusEmoji} ${statusText}` : undefined}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 3,
                    padding: "0 5px",
                    borderRadius: "var(--radius-full)",
                    background: "var(--surface-3)",
                    border: "1px solid var(--border-subtle)",
                    fontSize: 11,
                    lineHeight: 1.3,
                    flexShrink: 0,
                  }}
                >
                  <span>{statusEmoji}</span>
                </span>
              )}
            </span>
            {item.last_message_at && (
              <span style={{ fontSize: 10.5, color: "var(--text-tertiary)", flexShrink: 0 }}>
                {relativeTime(item.last_message_at)}
              </span>
            )}
          </span>

          {item.last_message_preview ? (
            <span
              style={{
                display: "block",
                fontSize: 11.5,
                color: item.unread_count > 0 ? "var(--text-primary)" : "var(--text-tertiary)",
                fontWeight: item.unread_count > 0 ? 600 : 400,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                marginTop: 2,
              }}
            >
              {item.last_message_preview}
            </span>
          ) : statusText ? (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 11,
                color: "var(--text-secondary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                marginTop: 2,
              }}
            >
              <span style={{ color: "var(--text-tertiary)" }}>Status:</span>
              <span style={{ fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis" }}>{statusText}</span>
            </span>
          ) : meta?.job_title ? (
            <span
              style={{
                display: "block",
                fontSize: 11,
                color: "var(--text-tertiary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                marginTop: 2,
              }}
            >
              {meta.job_title}
            </span>
          ) : null}
        </span>
        {item.unread_count > 0 && (
          <span
            style={{
              minWidth: 18,
              height: 18,
              padding: "0 5px",
              borderRadius: "var(--radius-full)",
              background: "var(--accent-secondary)",
              color: "#fff",
              fontSize: 10.5,
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {item.unread_count}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="pmp-channel-list" style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
      <SectionLabel text="Project channels" />
      {projects.length === 0 && <EmptyHint text="You'll get a channel for every project you join." />}
      {projects.map(renderItem)}
      <SectionLabel text="Direct messages" />
      {dms.length === 0 && <EmptyHint text="Start a private conversation with ✎ above." />}
      {dms.map(renderItem)}

      {musicChannels !== null && (
        <>
          <button
            onClick={() => setMusicExpanded((v) => !v)}
            aria-expanded={musicExpanded}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              width: "100%",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              padding: "10px 14px 4px",
              fontSize: 10.5,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: 0.7,
              color: "var(--text-tertiary)",
            }}
          >
            {musicExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            <Music size={11} />
            <span style={{ flex: 1, textAlign: "left" }}>
              Music · {musicChannels.length}
            </span>
            {!musicExpanded && anyPlaying && (
              <span
                title="A room is playing"
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "var(--radius-full)",
                  background: "var(--accent-gold)",
                  boxShadow: "0 0 6px var(--accent-gold)",
                }}
              />
            )}
          </button>
          {musicExpanded && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "4px 12px 8px" }}>
              {musicChannels.map((item) => (
                <MusicChannelRow
                  key={item.channel.id}
                  item={item}
                  listening={item.channel.id === nowPlayingId}
                  onOpen={() => onOpenMusic(item)}
                />
              ))}
              <button
                onClick={onNewMusic}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  border: "1px dashed var(--border-default)",
                  background: "transparent",
                  color: "var(--text-tertiary)",
                  borderRadius: "var(--radius-3)",
                  padding: "9px 12px",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <Plus size={13} /> New music channel
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Colorized "fancy box" sidebar row for one music room. */
function MusicChannelRow({
  item,
  listening,
  onOpen,
}: {
  item: MusicChannelListItem;
  listening: boolean;
  onOpen: () => void;
}) {
  const accent = musicAccent(item.channel.color);
  return (
    <button
      onClick={onOpen}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        border: `1px solid ${listening ? accent : "var(--border-subtle)"}`,
        borderLeft: `3px solid ${accent}`,
        background: `linear-gradient(90deg, ${musicTint(item.channel.color, item.is_playing ? 16 : 9)}, transparent 70%)`,
        borderRadius: "var(--radius-3)",
        padding: "9px 12px",
        textAlign: "left",
        cursor: "pointer",
        color: "var(--text-primary)",
        boxShadow: item.is_playing ? "var(--shadow-sm)" : "none",
      }}
    >
      <span
        style={{
          width: 30,
          height: 30,
          borderRadius: "var(--radius-2)",
          background: musicTint(item.channel.color, 24),
          color: accent,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Music size={14} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {item.channel.name}
          </span>
          {listening && (
            <span style={{ fontSize: 9.5, fontWeight: 800, color: accent, flexShrink: 0 }}>LIVE</span>
          )}
        </span>
        <span style={{ display: "block", fontSize: 11, color: item.is_playing ? accent : "var(--text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {item.is_playing && item.now_playing
            ? `♪ ${item.now_playing.replace(/\.[a-z0-9]+$/i, "")}`
            : `${item.member_count} listener${item.member_count === 1 ? "" : "s"}`}
        </span>
      </span>
      {item.is_playing && (
        <span style={{ display: "inline-flex", alignItems: "flex-end", gap: 2, height: 12, flexShrink: 0 }} aria-label="Playing">
          <style>{`@keyframes pmp-eq-row { from { height: 25%; } to { height: 100%; } }`}</style>
          {["0s", "0.25s", "0.5s"].map((delay, i) => (
            <span
              key={i}
              style={{
                width: 2.5,
                height: ["60%", "100%", "40%"][i],
                background: accent,
                borderRadius: 1,
                animation: `pmp-eq-row 0.9s ease-in-out ${delay} infinite alternate`,
              }}
            />
          ))}
        </span>
      )}
    </button>
  );
}

function NewMusicChannelModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (item: MusicChannelListItem) => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("violet");
  const [folderUrl, setFolderUrl] = useState("");
  const [creating, setCreating] = useState(false);

  async function create() {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const channel = await createMusicChannel({
        name: name.trim(),
        color,
        drive_folder_id: folderUrl.trim() || undefined,
        drive_folder_name: folderUrl.trim() ? "Public Drive folder" : undefined,
      });
      onCreated({
        channel,
        member_count: 1,
        is_member: true,
        can_control: true,
        is_playing: false,
        now_playing: null,
      });
      setName("");
      setFolderUrl("");
      setColor("violet");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New music channel"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={!name.trim() || creating} onClick={create}>
            {creating ? "Creating…" : "Create channel"}
          </Button>
        </>
      }
    >
      <Field label="Channel name">
        <TextInput
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Focus beats"
          maxLength={200}
        />
      </Field>
      <Field label="Public Drive folder link">
        <TextInput
          value={folderUrl}
          onChange={(e) => setFolderUrl(e.target.value)}
          placeholder="Optional Google Drive folder URL"
        />
      </Field>
      <Field label="Color">
        <div style={{ display: "flex", gap: 8 }}>
          {Object.keys(MUSIC_COLORS).map((key) => (
            <button
              key={key}
              onClick={() => setColor(key)}
              title={key}
              aria-label={`Color ${key}`}
              style={{
                width: 28,
                height: 28,
                borderRadius: "var(--radius-full)",
                border: color === key ? "2px solid var(--text-primary)" : "2px solid transparent",
                background: musicAccent(key),
                cursor: "pointer",
              }}
            />
          ))}
        </div>
      </Field>
    </Modal>
  );
}

function SectionLabel({ text }: { text: string }) {
  return (
    <div style={{ padding: "10px 14px 4px", fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.7, color: "var(--text-tertiary)" }}>
      {text}
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <div style={{ padding: "4px 14px 8px", fontSize: 11.5, color: "var(--text-tertiary)" }}>{text}</div>;
}

function UnreadBadge({ count, small = false }: { count: number; small?: boolean }) {
  return (
    <span
      style={{
        position: "absolute",
        top: small ? -3 : -5,
        right: small ? -5 : -6,
        minWidth: small ? 17 : 20,
        height: small ? 17 : 20,
        padding: "0 5px",
        borderRadius: "var(--radius-full)",
        background: "var(--status-delayed)",
        color: "#fff",
        fontSize: small ? 9.5 : 10.5,
        fontWeight: 800,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: "2px solid var(--surface-1)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

function NewDmModal({
  open,
  onClose,
  users,
  presence,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  users: UserRead[];
  presence: Record<string, UserPresenceInfo>;
  onCreated: (channelId: UUID) => void;
}) {
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.full_name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.job_title && u.job_title.toLowerCase().includes(q)) ||
        (u.department_name && u.department_name.toLowerCase().includes(q)) ||
        (u.status_text && u.status_text.toLowerCase().includes(q))
    );
  }, [users, search]);

  async function handleSelect(uid: UUID) {
    setCreating(true);
    try {
      const channel = await createDm(uid);
      onCreated(channel.id);
    } finally {
      setCreating(false);
      setSearch("");
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Direct Message"
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ position: "relative" }}>
          <Search size={15} style={{ position: "absolute", left: 12, top: 11, color: "var(--text-tertiary)" }} />
          <TextInput
            placeholder="Search teammates by name, role, status…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 34 }}
            autoFocus
          />
        </div>

        <div style={{ maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: "20px 0", textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>
              No teammates found matching &ldquo;{search}&rdquo;
            </div>
          ) : (
            filtered.map((u) => {
              const live = presence[u.id];
              const statusVal = live?.status ?? u.presence_status ?? "offline";
              const emoji = live?.status_emoji ?? u.status_emoji;
              const statusText = live?.status_text ?? u.status_text;

              return (
                <button
                  key={u.id}
                  type="button"
                  disabled={creating}
                  onClick={() => handleSelect(u.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "9px 12px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid transparent",
                    background: "var(--surface-2)",
                    color: "var(--text-primary)",
                    cursor: creating ? "default" : "pointer",
                    textAlign: "left",
                    transition: "all 0.15s ease",
                  }}
                  className="pmp-row"
                >
                  <span style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
                    <Avatar name={u.full_name} size={34} />
                    <PresenceDot status={statusVal} overlay size={10} />
                  </span>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontWeight: 600, fontSize: 13.5 }}>{u.full_name}</span>
                      {emoji && (
                        <span
                          title={statusText || undefined}
                          style={{
                            fontSize: 11.5,
                            background: "var(--surface-3)",
                            padding: "0 5px",
                            borderRadius: "var(--radius-full)",
                            border: "1px solid var(--border-subtle)",
                            lineHeight: 1.3,
                          }}
                        >
                          {emoji}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", display: "flex", alignItems: "center", gap: 6, marginTop: 1 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <PresenceDot status={statusVal} size={7} glow={false} />
                        <span>{PRESENCE_LABELS[statusVal]}</span>
                      </span>
                      {statusText ? (
                        <>
                          <span>·</span>
                          <span style={{ fontStyle: "italic", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {statusText}
                          </span>
                        </>
                      ) : u.job_title ? (
                        <>
                          <span>·</span>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {u.job_title}
                          </span>
                        </>
                      ) : null}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </Modal>
  );
}

const iconBtn: React.CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: "var(--radius-2)",
  border: "none",
  background: "transparent",
  color: "var(--text-secondary)",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const railButton: React.CSSProperties = {
  position: "relative",
  width: 42,
  height: 42,
  borderRadius: "var(--radius-3)",
  border: "1px solid var(--border-default)",
  background: "var(--surface-2)",
  color: "var(--text-primary)",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const railAvatarButton: React.CSSProperties = {
  position: "relative",
  width: 42,
  height: 42,
  borderRadius: "var(--radius-3)",
  border: "1px solid transparent",
  background: "transparent",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
