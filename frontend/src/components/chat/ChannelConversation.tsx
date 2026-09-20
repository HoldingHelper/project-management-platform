"use client";

/* Full conversation view for one channel: message list (day separators,
   threads, reactions, voice bubbles), composer with @mention hints, voice
   recording and live updates over the shared websocket. */

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CornerDownRight,
  FileText,
  Image as ImageIcon,
  Paperclip,
  SendHorizonal,
  SmilePlus,
  Sticker,
  Video,
  X,
} from "lucide-react";
import {
  addReaction,
  listMessages,
  markChannelRead,
  sendMessage,
} from "@/lib/api/chat";
import { getFileDownloadUrl, listFiles, uploadFile } from "@/lib/api/collaboration";
import { Avatar, PresenceDot, useToast } from "@/components/ds";
import { VoiceRecorder } from "@/components/voice/VoiceRecorder";
import { VoiceBubble } from "@/components/chat/VoiceBubble";
import { useRealtimeEvent } from "@/lib/ws/RealtimeProvider";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useUserMap } from "@/lib/hooks";
import { usePresenceMap } from "@/lib/stores/presence";
import type { FileAttachmentRead, MessageRead, PresenceStatus, UUID } from "@/lib/types";

const QUICK_EMOJI = ["👍", "🎉", "❤️", "😂", "👀", "✅"];
const COMPOSER_EMOJI = ["👍", "🎉", "❤️", "😂", "👀", "✅", "🔥", "🙏", "💡", "🚀", "⚠️", "📌", "✅", "🤝", "✨", "🧠"];
const STICKERS = ["🚀 Ship it", "✅ Approved", "👀 Reviewing", "⚡ Urgent", "🎯 On target", "🧊 Blocked", "🙌 Nice work", "📌 Pin this"];

export function ChannelConversation({
  channelId,
  channelName,
}: {
  channelId: UUID;
  channelName: string;
}) {
  const { user } = useAuth();
  const { nameOf, users } = useUserMap();
  const presence = usePresenceMap();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [voiceKey, setVoiceKey] = useState(0);
  const [threadOf, setThreadOf] = useState<MessageRead | null>(null);
  const [sending, setSending] = useState(false);
  const [emojiFor, setEmojiFor] = useState<UUID | null>(null);
  const [composerPanel, setComposerPanel] = useState<"emoji" | "stickers" | null>(null);
  const [dragging, setDragging] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: messages } = useQuery({
    queryKey: ["chat-messages", channelId],
    queryFn: () => listMessages(channelId, { limit: 60 }),
  });
  const { data: threadMessages } = useQuery({
    queryKey: ["chat-thread", threadOf?.id],
    queryFn: () => listMessages(channelId, { thread_of: threadOf!.id, limit: 100 }),
    enabled: !!threadOf,
  });
  const voiceFiles = useQuery({
    queryKey: ["chat-files", "voice", channelId],
    queryFn: () => listFiles("chat_message", channelId),
  });
  const channelFiles = useQuery({
    queryKey: ["chat-files", "channel", channelId],
    queryFn: () => listFiles("chat_channel", channelId),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["chat-messages", channelId] });
    queryClient.invalidateQueries({ queryKey: ["chat-thread"] });
    queryClient.invalidateQueries({ queryKey: ["chat-channels"] });
    queryClient.invalidateQueries({ queryKey: ["chat-files", "voice", channelId] });
    queryClient.invalidateQueries({ queryKey: ["chat-files", "channel", channelId] });
  };

  useRealtimeEvent(
    ["chat.message", "chat.reaction", "chat.read"],
    () => refresh(),
    [`chat:${channelId}`],
  );

  // Chronological (API returns newest first).
  const ordered = useMemo(() => [...(messages ?? [])].reverse(), [messages]);
  const orderedThread = useMemo(
    () => [...(threadMessages ?? [])].reverse(),
    [threadMessages],
  );
  const fileById = useMemo(() => {
    const map = new Map<UUID, FileAttachmentRead>();
    for (const f of voiceFiles.data ?? []) map.set(f.id, f);
    for (const f of channelFiles.data ?? []) map.set(f.id, f);
    return map;
  }, [voiceFiles.data, channelFiles.data]);

  // Mark read + autoscroll when new messages arrive.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    const last = ordered[ordered.length - 1];
    if (last && user && last.sender_user_id !== user.id) {
      markChannelRead(channelId, last.id).catch(() => {});
    }
  }, [ordered.length, channelId, user, ordered]);

  function addFiles(files: FileList | File[]) {
    const next = Array.from(files);
    if (next.length === 0) return;
    setPendingFiles((current) => [...current, ...next]);
  }

  function mentionedIds(text: string) {
    const lower = text.toLowerCase();
    return users
      .filter((u) => {
        const handles = [
          u.username,
          u.email?.split("@")[0],
          u.full_name,
          u.full_name.replace(/\s+/g, ""),
        ]
          .filter(Boolean)
          .map((x) => String(x).toLowerCase());
        return handles.some((h) => lower.includes(`@${h}`));
      })
      .map((u) => u.id);
  }

  function appendToken(token: string) {
    setBody((current) => (current ? `${current} ${token}` : token));
  }

  async function submit() {
    const trimmed = body.trim();
    if ((!trimmed && !voiceBlob && pendingFiles.length === 0) || sending) return;
    setSending(true);
    try {
      if (voiceBlob) {
        const uploaded = await uploadFile(
          "chat_message",
          channelId,
          voiceBlob,
          `voice-${Date.now()}.webm`,
        );
        await sendMessage(channelId, {
          body: trimmed,
          message_type: "voice",
          attachment_id: uploaded.id,
          parent_message_id: threadOf?.id,
          mentioned_user_ids: mentionedIds(trimmed),
        });
      }
      if (pendingFiles.length > 0) {
        for (let i = 0; i < pendingFiles.length; i += 1) {
          const file = pendingFiles[i];
          const uploaded = await uploadFile("chat_channel", channelId, file, file.name);
          await sendMessage(channelId, {
            body: i === 0 && !voiceBlob ? trimmed : "",
            message_type: "file",
            attachment_id: uploaded.id,
            parent_message_id: threadOf?.id,
            mentioned_user_ids: i === 0 && !voiceBlob ? mentionedIds(trimmed) : [],
          });
        }
      }
      if (!voiceBlob && pendingFiles.length === 0 && trimmed) {
        await sendMessage(channelId, {
          body: trimmed,
          message_type: "text",
          parent_message_id: threadOf?.id,
          mentioned_user_ids: mentionedIds(trimmed),
        });
      }
      setBody("");
      setVoiceBlob(null);
      setPendingFiles([]);
      setComposerPanel(null);
      setVoiceKey((k) => k + 1);
      refresh();
    } catch {
      toast.push("Message failed to send.", "error");
    } finally {
      setSending(false);
    }
  }

  async function react(messageId: UUID, emoji: string) {
    setEmojiFor(null);
    try {
      await addReaction(messageId, emoji);
      refresh();
    } catch {
      /* ignore */
    }
  }

  function renderMessage(m: MessageRead, inThread = false) {
    const mine = m.sender_user_id === user?.id;
    const senderPresence = m.sender_user_id ? presence[m.sender_user_id] : undefined;
    const senderMeta = users.find((u) => u.id === m.sender_user_id);
    const statusVal = (senderPresence?.status ?? (senderMeta?.presence_status as PresenceStatus) ?? "offline") as PresenceStatus;
    const statusEmoji = senderPresence?.status_emoji ?? senderMeta?.status_emoji;
    const statusText = senderPresence?.status_text ?? senderMeta?.status_text;

    const grouped: Record<string, number> = {};
    for (const r of m.reactions) grouped[r.emoji] = (grouped[r.emoji] ?? 0) + 1;
    return (
      <div key={m.id} className={`pmp-chat-message ${mine ? "is-mine" : ""} ${inThread ? "is-thread" : ""}`} style={{ display: "flex", gap: 10, padding: "6px 14px" }}>
        <span style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
          <Avatar name={nameOf(m.sender_user_id)} size={28} />
          <PresenceDot status={statusVal} overlay size={8} />
        </span>
        <div className="pmp-chat-message-content" style={{ flex: 1, minWidth: 0 }}>
          <div className="pmp-chat-message-meta" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 13, display: "inline-flex", alignItems: "center", gap: 5 }}>
              {nameOf(m.sender_user_id)}
              {statusEmoji && (
                <span
                  title={statusText ? `${statusEmoji} ${statusText}` : undefined}
                  style={{
                    fontSize: 11,
                    background: "var(--surface-3)",
                    padding: "0 4px",
                    borderRadius: "var(--radius-full)",
                    border: "1px solid var(--border-subtle)",
                    lineHeight: 1.2,
                  }}
                >
                  {statusEmoji}
                </span>
              )}
            </span>
            <span style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>
              {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
          {m.deleted_at ? (
            <div style={{ fontSize: 13, color: "var(--text-tertiary)", fontStyle: "italic" }}>Message deleted</div>
          ) : (
            <>
              {m.body && (
                <div className="pmp-chat-bubble" style={{ fontSize: 13.5, lineHeight: 1.5, wordBreak: "break-word", whiteSpace: "pre-wrap", color: "var(--text-primary)" }}>
                  {m.body}
                </div>
              )}
              {m.message_type === "voice" && m.attachment_id && <VoiceBubble attachmentId={m.attachment_id} />}
              {m.message_type === "file" && m.attachment_id && (
                <MessageAttachment attachmentId={m.attachment_id} file={fileById.get(m.attachment_id)} />
              )}
            </>
          )}
          <div className="pmp-chat-message-actions" style={{ display: "flex", gap: 6, marginTop: 4, alignItems: "center", flexWrap: "wrap" }}>
            {Object.entries(grouped).map(([emoji, count]) => (
              <button
                key={emoji}
                className="pmp-reaction-chip"
                onClick={() => react(m.id, emoji)}
                style={{
                  border: "1px solid var(--border-default)",
                  background: "var(--surface-2)",
                  borderRadius: "var(--radius-full)",
                  padding: "1px 8px",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                {emoji} {count}
              </button>
            ))}
            <span style={{ position: "relative", display: "inline-flex" }}>
              <button
                onClick={() => setEmojiFor(emojiFor === m.id ? null : m.id)}
                title="Add reaction"
                aria-label={`Add reaction to message from ${nameOf(m.sender_user_id)}`}
                style={{ border: "none", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer", display: "flex", padding: 2 }}
              >
                <SmilePlus size={14} />
              </button>
              {emojiFor === m.id && (
                <span
                  style={{
                    position: "absolute",
                    bottom: 22,
                    left: 0,
                    display: "flex",
                    gap: 4,
                    background: "var(--surface-2)",
                    border: "1px solid var(--border-default)",
                    borderRadius: "var(--radius-full)",
                    padding: "4px 8px",
                    boxShadow: "var(--shadow-md)",
                    zIndex: 5,
                  }}
                >
                  {QUICK_EMOJI.map((e) => (
                    <button key={e} aria-label={`React with ${e}`} onClick={() => react(m.id, e)} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 15 }}>
                      {e}
                    </button>
                  ))}
                </span>
              )}
            </span>
            {!inThread && (
              <button
                onClick={() => setThreadOf(m)}
                aria-label={`Reply to message from ${nameOf(m.sender_user_id)}`}
                style={{ border: "none", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 11.5 }}
              >
                <CornerDownRight size={12} />
                {m.reply_count > 0 ? `${m.reply_count} repl${m.reply_count === 1 ? "y" : "ies"}` : "Reply"}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  let lastDay = "";
  const mentionFragment = body.match(/@([\w.-]{0,24})$/)?.[1]?.toLowerCase();
  const mentionSuggestions =
    mentionFragment == null
      ? []
      : users
          .filter((u) => {
            const handle = u.username ?? u.email.split("@")[0] ?? u.full_name.replace(/\s+/g, "");
            return handle.toLowerCase().startsWith(mentionFragment) || u.full_name.toLowerCase().includes(mentionFragment);
          })
          .slice(0, 5);
  const canSend = !!body.trim() || !!voiceBlob || pendingFiles.length > 0;

  return (
    <div className="pmp-conversation" style={{ display: "flex", height: "100%", minHeight: 0, minWidth: 0, overflow: "hidden" }}>
      <div style={{ flex: "1 1 0", display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
        <div className="pmp-message-scroll" style={{ flex: "1 1 0", minHeight: 0, overflowY: "auto", overflowX: "hidden", padding: "10px 0" }}>
          {ordered.map((m) => {
            const day = new Date(m.created_at).toDateString();
            const sep = day !== lastDay;
            lastDay = day;
            return (
              <div key={m.id}>
                {sep && (
                  <div className="pmp-day-separator" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px" }}>
                    <span style={{ flex: 1, height: 1, background: "var(--border-subtle)" }} />
                    <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{day}</span>
                    <span style={{ flex: 1, height: 1, background: "var(--border-subtle)" }} />
                  </div>
                )}
                {renderMessage(m)}
              </div>
            );
          })}
          {ordered.length === 0 && (
            <div style={{ padding: 24, textAlign: "center", fontSize: 12.5, color: "var(--text-tertiary)" }}>
              No messages yet in #{channelName}. Say hello!
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div
          className={`pmp-message-composer ${dragging ? "is-dragging" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            addFiles(e.dataTransfer.files);
          }}
          style={{
            borderTop: "1px solid var(--border-default)",
            padding: 10,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            minWidth: 0,
            flexShrink: 0,
            background: dragging ? "color-mix(in srgb, var(--accent-primary) 10%, transparent)" : "transparent",
          }}
        >
          {threadOf && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-secondary)", background: "var(--surface-2)", borderRadius: "var(--radius-2)", padding: "6px 10px" }}>
              <CornerDownRight size={12} />
              Replying in thread to <b>{nameOf(threadOf.sender_user_id)}</b>
              <button onClick={() => setThreadOf(null)} aria-label="Cancel thread reply" style={{ marginLeft: "auto", border: "none", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer", display: "flex" }}>
                <X size={13} />
              </button>
            </div>
          )}
          {pendingFiles.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {pendingFiles.map((file, index) => (
                <span
                  key={`${file.name}-${file.size}-${index}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    maxWidth: 220,
                    padding: "5px 8px",
                    borderRadius: "var(--radius-full)",
                    border: "1px solid var(--border-default)",
                    background: "var(--surface-2)",
                    fontSize: 12,
                  }}
                >
                  {file.type.startsWith("image/") ? <ImageIcon size={13} /> : file.type.startsWith("video/") ? <Video size={13} /> : <FileText size={13} />}
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</span>
                  <button
                    type="button"
                    onClick={() => setPendingFiles((current) => current.filter((_, i) => i !== index))}
                    title="Remove attachment"
                    aria-label={`Remove attachment ${file.name}`}
                    style={{ border: "none", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer", display: "flex", padding: 0 }}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
          {composerPanel && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: 8, border: "1px solid var(--border-default)", borderRadius: "var(--radius-2)", background: "var(--surface-2)" }}>
              {(composerPanel === "emoji" ? COMPOSER_EMOJI : STICKERS).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => appendToken(item)}
                  aria-label={`Insert ${composerPanel === "emoji" ? "emoji" : "sticker"} ${item}`}
                  style={{
                    border: "1px solid var(--border-subtle)",
                    background: "var(--surface-1)",
                    color: "var(--text-primary)",
                    borderRadius: "var(--radius-full)",
                    padding: composerPanel === "emoji" ? "4px 8px" : "5px 10px",
                    cursor: "pointer",
                    fontSize: composerPanel === "emoji" ? 16 : 12,
                  }}
                >
                  {item}
                </button>
              ))}
            </div>
          )}
          <div className="pmp-composer-shell" style={{ position: "relative", border: "1px solid var(--border-default)", borderRadius: "var(--radius-2)", background: "var(--surface-2)", overflow: "hidden", minWidth: 0 }}>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              onPaste={(e) => {
                if (e.clipboardData.files.length > 0) addFiles(e.clipboardData.files);
              }}
              placeholder={`Message #${channelName} — use @username to mention`}
              style={{
                width: "100%",
                minHeight: 54,
                maxHeight: 132,
                resize: "vertical",
                padding: "10px 12px",
                border: "none",
                background: "transparent",
                color: "var(--text-primary)",
                fontSize: 13.5,
                lineHeight: 1.45,
                outline: "none",
              }}
            />
            {mentionSuggestions.length > 0 && (
              <div style={{ position: "absolute", left: 8, right: 8, bottom: 44, border: "1px solid var(--border-default)", borderRadius: "var(--radius-2)", background: "var(--surface-1)", boxShadow: "var(--shadow-md)", overflow: "hidden", zIndex: 6 }}>
                {mentionSuggestions.map((u) => {
                  const handle = u.username ?? u.email.split("@")[0] ?? u.full_name.replace(/\s+/g, "");
                  return (
                    <button
                      key={u.id}
                      type="button"
                      aria-label={`Mention ${u.full_name}`}
                      onClick={() => setBody((current) => current.replace(/@([\w.-]{0,24})$/, `@${handle} `))}
                      style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, border: "none", background: "transparent", color: "var(--text-primary)", cursor: "pointer", padding: "7px 9px", textAlign: "left" }}
                    >
                      <Avatar name={u.full_name} size={22} />
                      <span style={{ fontSize: 12.5, fontWeight: 700 }}>{u.full_name}</span>
                      <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--text-tertiary)" }}>@{handle}</span>
                    </button>
                  );
                })}
              </div>
            )}
            <div className="pmp-composer-toolbar" style={{ display: "flex", alignItems: "center", gap: 6, borderTop: "1px solid var(--border-subtle)", padding: 6, minWidth: 0, overflowX: "auto" }}>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                style={{ display: "none" }}
                onChange={(e) => {
                  if (e.target.files) addFiles(e.target.files);
                  e.currentTarget.value = "";
                }}
              />
              <button type="button" onClick={() => fileInputRef.current?.click()} title="Attach files" aria-label="Attach files" style={composerIconBtn}>
                <Paperclip size={15} />
              </button>
              <button type="button" onClick={() => setComposerPanel(composerPanel === "emoji" ? null : "emoji")} title="Emoji" aria-label="Open emoji picker" style={composerIconBtn}>
                <SmilePlus size={15} />
              </button>
              <button type="button" onClick={() => setComposerPanel(composerPanel === "stickers" ? null : "stickers")} title="Stickers" aria-label="Open sticker picker" style={composerIconBtn}>
                <Sticker size={15} />
              </button>
              <VoiceRecorder key={voiceKey} onRecorded={setVoiceBlob} onClear={() => setVoiceBlob(null)} />
              <span style={{ flex: 1 }} />
              <button
                className="pmp-send-button"
                onClick={submit}
                disabled={!canSend || sending}
                title="Send"
                aria-label="Send message"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: "var(--radius-2)",
                  border: "none",
                  background: "var(--accent-primary)",
                  color: "var(--text-on-accent)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: !canSend || sending ? 0.5 : 1,
                  flexShrink: 0,
                }}
              >
                <SendHorizonal size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {threadOf && (
        <div className="pmp-chat-thread" style={{ width: 300, maxWidth: "48%", borderLeft: "1px solid var(--border-default)", display: "flex", flexDirection: "column", minHeight: 0, minWidth: 220, flexShrink: 0 }}>
          <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border-default)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>Thread</span>
            <button onClick={() => setThreadOf(null)} aria-label="Close thread" style={{ border: "none", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer", display: "flex" }}>
              <X size={14} />
            </button>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
            {renderMessage(threadOf, true)}
            <div style={{ borderTop: "1px solid var(--border-subtle)", margin: "4px 14px" }} />
            {orderedThread.map((m) => renderMessage(m, true))}
          </div>
        </div>
      )}
    </div>
  );
}

function MessageAttachment({
  attachmentId,
  file,
}: {
  attachmentId: UUID;
  file?: FileAttachmentRead;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const kind = mediaKind(file?.content_type ?? "");

  async function loadUrl() {
    if (url || loading) return url;
    setLoading(true);
    try {
      const res = await getFileDownloadUrl(attachmentId);
      setUrl(res.url);
      return res.url;
    } catch {
      setError(true);
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function openDownload() {
    const nextUrl = await loadUrl();
    if (nextUrl) window.open(nextUrl, "_blank", "noopener,noreferrer");
  }

  const Icon = kind === "image" ? ImageIcon : kind === "video" ? Video : FileText;

  return (
    <div
      style={{
        marginTop: 6,
        border: "1px solid var(--border-default)",
        background: "var(--surface-2)",
        borderRadius: "var(--radius-2)",
        overflow: "hidden",
        maxWidth: 320,
      }}
    >
      <button
        type="button"
        onClick={kind === "file" ? openDownload : loadUrl}
        style={{
          width: "100%",
          border: "none",
          background: "transparent",
          color: "var(--text-primary)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 12px",
          textAlign: "left",
        }}
      >
        <span
          style={{
            width: 32,
            height: 32,
            borderRadius: "var(--radius-2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "color-mix(in srgb, var(--accent-primary) 14%, transparent)",
            color: "var(--accent-primary)",
            flexShrink: 0,
          }}
        >
          <Icon size={16} />
        </span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ display: "block", fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {file?.file_name ?? "Attachment"}
          </span>
          <span style={{ display: "block", fontSize: 11.5, color: "var(--text-tertiary)" }}>
            {file ? `${file.content_type || "file"} · ${formatBytes(file.size_bytes)}` : "Loading file details…"}
          </span>
        </span>
        <span style={{ fontSize: 11.5, color: "var(--text-secondary)", flexShrink: 0 }}>
          {loading ? "Loading" : kind === "file" ? "Open" : url ? "Loaded" : "Preview"}
        </span>
      </button>
      {error && <div style={{ padding: "0 12px 10px", fontSize: 12, color: "var(--status-delayed)" }}>Attachment unavailable.</div>}
      {url && kind === "image" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={file?.file_name ?? "Attachment preview"} style={{ display: "block", width: "100%", maxHeight: 260, objectFit: "contain", background: "var(--surface-deepest)" }} />
      )}
      {url && kind === "video" && (
        <video controls src={url} style={{ display: "block", width: "100%", maxHeight: 260, background: "var(--surface-deepest)" }} />
      )}
    </div>
  );
}

function mediaKind(contentType: string) {
  if (contentType.startsWith("image/")) return "image";
  if (contentType.startsWith("video/")) return "video";
  return "file";
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

const composerIconBtn: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: "var(--radius-2)",
  border: "1px solid var(--border-default)",
  background: "var(--surface-1)",
  color: "var(--text-secondary)",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};
