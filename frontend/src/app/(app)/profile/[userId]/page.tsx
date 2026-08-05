"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Briefcase, Mail, MapPin, MessageSquare, Phone, Save } from "lucide-react";
import { getUser, updateMyProfile } from "@/lib/api/users";
import { listTasks } from "@/lib/api/projects";
import { createDm } from "@/lib/api/chat";
import { useRouter } from "next/navigation";
import {
  Avatar,
  Button,
  Card,
  Field,
  PresenceDot,
  PRESENCE_LABELS,
  StatusChip,
  TextInput,
  useToast,
} from "@/components/ds";
import { PageHeader, PAGE_STYLE, Spinner } from "@/components/ui/States";
import { useAuth } from "@/lib/auth/AuthProvider";
import { usePresence } from "@/lib/stores/presence";
import type { UUID } from "@/lib/types";

export default function ProfilePage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = use(params);
  const router = useRouter();
  const toast = useToast();
  const { user: me, setUser } = useAuth();
  const presence = usePresence(userId as UUID);
  const isMe = me?.id === userId;
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ bio: "", phone: "", location: "", job_title: "" });

  const { data: user, isLoading, refetch } = useQuery({
    queryKey: ["user", userId],
    queryFn: () => getUser(userId as UUID),
  });

  const { data: tasks } = useQuery({
    queryKey: ["user-tasks", userId],
    queryFn: () => listTasks({ assignee_user_id: userId as UUID, page_size: 10 }),
  });

  const save = useMutation({
    mutationFn: () =>
      updateMyProfile({
        bio: form.bio || undefined,
        phone: form.phone || undefined,
        location: form.location || undefined,
        job_title: form.job_title || undefined,
      }),
    onSuccess: (updated) => {
      setUser(updated);
      toast.push("Profile updated.", "success");
      setEditing(false);
      refetch();
    },
  });

  async function startDm() {
    const channel = await createDm(userId as UUID);
    router.push(`/?chat=${channel.id}`);
  }

  if (isLoading || !user) {
    return (
      <div style={PAGE_STYLE}>
        <Spinner label="Loading profile…" />
      </div>
    );
  }

  return (
    <div style={PAGE_STYLE}>
      <PageHeader
        title={user.full_name}
        subtitle={user.job_title ?? user.roles.join(", ")}
        actions={
          isMe ? (
            <span style={{ display: "flex", gap: 8 }}>
              <Link href="/settings">
                <Button variant="secondary">Settings</Button>
              </Link>
              <Button
                onClick={() => {
                  setForm({
                    bio: user.bio ?? "",
                    phone: user.phone ?? "",
                    location: user.location ?? "",
                    job_title: user.job_title ?? "",
                  });
                  setEditing((e) => !e);
                }}
              >
                {editing ? "Cancel" : "Edit profile"}
              </Button>
            </span>
          ) : (
            <Button onClick={startDm}>
              <MessageSquare size={14} /> Message
            </Button>
          )
        }
      />

      <div className="pmp-profile-grid" style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 18, alignItems: "start" }}>
        <Card padded>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "10px 0" }}>
            <span style={{ position: "relative", display: "inline-flex" }}>
              <Avatar name={user.full_name} size={84} />
              <PresenceDot status={presence} overlay size={16} />
            </span>
            <div style={{ fontWeight: 800, fontSize: 18 }}>{user.full_name}</div>
            <div style={{ fontSize: 12.5, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 6 }}>
              <PresenceDot status={presence} size={8} /> {PRESENCE_LABELS[presence]}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
              {user.roles.map((r) => (
                <span
                  key={r}
                  style={{
                    fontSize: 11,
                    padding: "2px 10px",
                    borderRadius: "var(--radius-full)",
                    background: "var(--surface-2)",
                    color: "var(--text-secondary)",
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  {r}
                </span>
              ))}
            </div>
          </div>

          <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            <InfoRow icon={<Mail size={14} />} text={user.email} />
            {user.username && <InfoRow icon={<Briefcase size={14} />} text={`@${user.username}`} mono />}
            {user.phone && <InfoRow icon={<Phone size={14} />} text={user.phone} />}
            {user.location && <InfoRow icon={<MapPin size={14} />} text={user.location} />}
          </div>
        </Card>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {editing ? (
            <Card title="Edit profile" padded>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <Field label="Job title">
                  <TextInput value={form.job_title} onChange={(e) => setForm((f) => ({ ...f, job_title: e.target.value }))} />
                </Field>
                <Field label="Bio">
                  <textarea
                    value={form.bio}
                    onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
                    rows={4}
                    style={{
                      padding: 12,
                      borderRadius: "var(--radius-2)",
                      border: "1px solid var(--border-default)",
                      background: "var(--surface-2)",
                      color: "var(--text-primary)",
                      fontSize: 13.5,
                      resize: "vertical",
                      outline: "none",
                    }}
                  />
                </Field>
                <div className="pmp-form-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <Field label="Phone">
                    <TextInput value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
                  </Field>
                  <Field label="Location">
                    <TextInput value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} />
                  </Field>
                </div>
                <div>
                  <Button onClick={() => save.mutate()} disabled={save.isPending}>
                    <Save size={14} /> {save.isPending ? "Saving…" : "Save changes"}
                  </Button>
                </div>
              </div>
            </Card>
          ) : (
            <Card title="About" padded>
              <div style={{ fontSize: 13.5, color: user.bio ? "var(--text-primary)" : "var(--text-tertiary)", lineHeight: 1.6 }}>
                {user.bio || "No bio yet."}
              </div>
            </Card>
          )}

          <Card title="Assigned tasks" padded={false}>
            {(tasks?.items ?? []).length === 0 && (
              <div style={{ padding: 18, fontSize: 12.5, color: "var(--text-tertiary)" }}>No assigned tasks.</div>
            )}
            {(tasks?.items ?? []).map((t) => (
              <div
                key={t.id}
                className="pmp-row"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "11px 16px",
                  borderBottom: "1px solid var(--border-subtle)",
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {t.title}
                </span>
                <StatusChip status={String(t.status)} />
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ icon, text, mono }: { icon: React.ReactNode; text: string; mono?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--text-secondary)" }}>
      <span style={{ color: "var(--text-tertiary)", display: "flex" }}>{icon}</span>
      <span style={{ fontFamily: mono ? "var(--font-mono)" : undefined, overflow: "hidden", textOverflow: "ellipsis" }}>{text}</span>
    </div>
  );
}
