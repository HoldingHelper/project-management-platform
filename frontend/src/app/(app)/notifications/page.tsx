"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, CheckCheck, CircleCheckBig, Reply } from "lucide-react";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  replyToNotification,
  resolveNotification,
  uploadFile,
} from "@/lib/api/collaboration";
import { Button, Tabs, TextInput, useToast } from "@/components/ds";
import { EmptyState, PageHeader, PAGE_STYLE, Spinner } from "@/components/ui/States";
import { VoiceRecorder } from "@/components/voice/VoiceRecorder";
import { formatNotificationBody, relativeTime } from "@/lib/format";
import { useNotifications } from "@/lib/stores/notifications";
import type { NotificationRead } from "@/lib/types";

const TYPE_LABEL: Record<string, string> = {
  mention: "Mention",
  chat_mention: "Chat mention",
  dm: "Direct message",
  task_assigned: "Task assigned",
  blocker_raised: "Waiting on you",
  dependency_assigned: "Dependency",
  project_update: "Project update",
};

export default function NotificationsPage() {
  const [tab, setTab] = useState("all");
  const queryClient = useQueryClient();
  const toast = useToast();
  const { actionRequiredCount, refresh } = useNotifications();

  const { data, isLoading } = useQuery({
    queryKey: ["notifications-page", tab],
    queryFn: () => listNotifications(tab as "all" | "unread" | "action_required"),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["notifications-page"] });
    refresh();
  };

  return (
    <div style={PAGE_STYLE}>
      <PageHeader
        title="Notification Center"
        subtitle={
          actionRequiredCount > 0
            ? `${actionRequiredCount} item(s) waiting on you.`
            : "Everything that needs your attention, in one place."
        }
        actions={
          <Button
            variant="secondary"
            onClick={async () => {
              await markAllNotificationsRead();
              invalidate();
              toast.push("All notifications marked read.", "success");
            }}
          >
            <CheckCheck size={14} /> Mark all read
          </Button>
        }
      />

      <Tabs
        items={[
          { key: "all", label: "All" },
          { key: "unread", label: "Unread" },
          { key: "action_required", label: `Action required${actionRequiredCount ? ` (${actionRequiredCount})` : ""}` },
        ]}
        active={tab}
        onChange={setTab}
      />

      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        {isLoading && <Spinner label="Loading notifications…" />}
        {!isLoading && (data ?? []).length === 0 && (
          <EmptyState title="You're all caught up" hint="New mentions, blockers and updates will appear here." />
        )}
        {(data ?? []).map((n) => (
          <NotificationCard key={n.id} notification={n} onChange={invalidate} />
        ))}
      </div>
    </div>
  );
}

function NotificationCard({
  notification: n,
  onChange,
}: {
  notification: NotificationRead;
  onChange: () => void;
}) {
  const toast = useToast();
  const router = useRouter();
  const [replyOpen, setReplyOpen] = useState(false);
  const [body, setBody] = useState("");
  const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null);

  const canReply = !!n.entity_type && !!n.entity_id;
  const actionable = n.requires_action && !n.resolved_at;

  const reply = useMutation({
    mutationFn: async () => {
      let attachmentId: string | undefined;
      if (voiceBlob) {
        const uploaded = await uploadFile(
          "notification_reply",
          n.id,
          voiceBlob,
          `voice-${Date.now()}.webm`,
        );
        attachmentId = uploaded.id;
      }
      return replyToNotification(n.id, {
        body: body || undefined,
        attachment_id: attachmentId,
      });
    },
    onSuccess: () => {
      toast.push("Reply sent.", "success");
      setReplyOpen(false);
      setBody("");
      setVoiceBlob(null);
      onChange();
    },
    onError: () => toast.push("Could not send the reply.", "error"),
  });

  const resolve = useMutation({
    mutationFn: () => resolveNotification(n.id),
    onSuccess: () => {
      toast.push("Marked as resolved.", "success");
      onChange();
    },
  });

  return (
    <div
      style={{
        background: "var(--surface-2)",
        border: `1px solid ${actionable ? "var(--accent-gold)" : "var(--border-subtle)"}`,
        borderRadius: "var(--radius-3)",
        padding: "14px 16px",
        boxShadow: actionable ? "var(--shadow-gold)" : undefined,
        opacity: n.is_read && !actionable ? 0.75 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <span
          style={{
            width: 34,
            height: 34,
            borderRadius: "var(--radius-2)",
            background: actionable ? "rgba(212,169,55,0.14)" : "var(--surface-3)",
            color: actionable ? "var(--accent-gold-bright)" : "var(--text-secondary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <BellRing size={16} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, fontSize: 13.5 }}>{n.title}</span>
            <span
              style={{
                fontSize: 10.5,
                padding: "1px 8px",
                borderRadius: "var(--radius-full)",
                background: "var(--surface-3)",
                color: "var(--text-tertiary)",
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              {TYPE_LABEL[n.type] ?? n.type}
            </span>
            <span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{relativeTime(n.created_at)}</span>
            {n.resolved_at && (
              <span style={{ fontSize: 11.5, color: "var(--status-completed)" }}>Resolved</span>
            )}
          </div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>{formatNotificationBody(n.body)}</div>

          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            {n.link && (
              <Button
                variant="tertiary"
                onClick={async () => {
                  if (!n.is_read) await markNotificationRead(n.id);
                  onChange();
                  router.push(n.link!);
                }}
              >
                Open
              </Button>
            )}
            {canReply && (
              <Button variant="tertiary" onClick={() => setReplyOpen((o) => !o)}>
                <Reply size={13} /> Reply
              </Button>
            )}
            {actionable && (
              <Button variant="tertiary" onClick={() => resolve.mutate()} disabled={resolve.isPending}>
                <CircleCheckBig size={13} /> Resolve
              </Button>
            )}
            {!n.is_read && (
              <Button
                variant="tertiary"
                onClick={async () => {
                  await markNotificationRead(n.id);
                  onChange();
                }}
              >
                Mark read
              </Button>
            )}
          </div>

          {replyOpen && (
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <TextInput
                  placeholder="Write a reply… (text, voice, or both)"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (body || voiceBlob)) reply.mutate();
                  }}
                  style={{ flex: 1 }}
                />
                <VoiceRecorder onRecorded={setVoiceBlob} onClear={() => setVoiceBlob(null)} />
                <Button
                  disabled={(!body && !voiceBlob) || reply.isPending}
                  onClick={() => reply.mutate()}
                >
                  {reply.isPending ? "Sending…" : "Send"}
                </Button>
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
                Replies are posted back to the source — a comment on the task/blocker, or a chat message.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
