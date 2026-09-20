"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Briefcase,
  Copy,
  Edit3,
  KeyRound,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  RefreshCw,
  Save,
  ShieldCheck,
  UserCog,
} from "lucide-react";
import {
  adminResetPassword,
  adminUpdateUser,
  assignRoles,
  getUser,
  listRoles,
  updateMyProfile,
} from "@/lib/api/users";
import { listTasks } from "@/lib/api/projects";
import { createDm } from "@/lib/api/chat";
import { AppError } from "@/lib/api/client";
import { useParams, useRouter } from "next/navigation";
import {
  Avatar,
  Button,
  Card,
  Field,
  Modal,
  PresenceDot,
  PRESENCE_LABELS,
  Select,
  StatusChip,
  TextInput,
  useToast,
} from "@/components/ds";
import { PageHeader, PAGE_STYLE, Spinner } from "@/components/ui/States";
import { useAuth } from "@/lib/auth/AuthProvider";
import { usePresence, useUserStatus } from "@/lib/stores/presence";
import { useStaticExportParams } from "@/lib/static-export-route";
import { UserStatusPickerModal, UserStatusPill } from "@/components/status";
import type { UserRead, UUID } from "@/lib/types";

export default function ProfilePage() {
  const { userId: exportedUserId } = useParams<{ userId: string }>();
  const [userId] = useStaticExportParams([exportedUserId], ["profile"]);
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { user: me, setUser, hasPermission, isSuperAdmin } = useAuth();
  const presence = usePresence(userId as UUID);
  const statusInfo = useUserStatus(userId as UUID);
  const isMe = me?.id === userId;
  const canManage = isSuperAdmin() || hasPermission("system.manage_users");

  const [editing, setEditing] = useState(false);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [adminEditOpen, setAdminEditOpen] = useState(false);
  const [adminPasswordOpen, setAdminPasswordOpen] = useState(false);
  const [adminRolesOpen, setAdminRolesOpen] = useState(false);
  const [startingDm, setStartingDm] = useState(false);
  const [form, setForm] = useState({ bio: "", phone: "", location: "", job_title: "" });

  const { data: user, isLoading, refetch } = useQuery({
    queryKey: ["user", userId],
    queryFn: () => getUser(userId as UUID),
    enabled: Boolean(userId),
  });

  const { data: roles } = useQuery({ queryKey: ["roles"], queryFn: listRoles });
  const roleNames = (roles ?? []).map((r) => r.name);

  const { data: tasks } = useQuery({
    queryKey: ["user-tasks", userId],
    queryFn: () => listTasks({ assignee_user_id: userId as UUID, page_size: 10 }),
    enabled: Boolean(userId),
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
    try {
      setStartingDm(true);
      const channel = await createDm(userId as UUID);
      queryClient.invalidateQueries({ queryKey: ["chat-channels"] });
      window.dispatchEvent(
        new CustomEvent("pmp:open-chat", {
          detail: { channelId: channel.id },
        })
      );
    } catch (err) {
      toast.push(
        err instanceof AppError ? err.message : "Could not open direct message.",
        "error"
      );
    } finally {
      setStartingDm(false);
    }
  }

  if (!userId || isLoading || !user) {
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
          <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {canManage && (
              <>
                <Button variant="secondary" onClick={() => setAdminEditOpen(true)} title="Edit user name, username, email">
                  <Edit3 size={14} /> Edit User
                </Button>
                <Button variant="secondary" onClick={() => setAdminPasswordOpen(true)} title="Set new password directly">
                  <KeyRound size={14} /> Reset Password
                </Button>
                <Button variant="secondary" onClick={() => setAdminRolesOpen(true)} title="Change user roles">
                  <ShieldCheck size={14} /> Roles
                </Button>
              </>
            )}
            {isMe ? (
              <>
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
              </>
            ) : (
              <Button onClick={startDm} disabled={startingDm}>
                <MessageSquare size={14} /> {startingDm ? "Opening…" : "Message"}
              </Button>
            )}
          </span>
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

            {/* Vivid User Status Pill */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <UserStatusPill
                status={statusInfo.status || presence}
                emoji={statusInfo.status_emoji || user.status_emoji}
                text={statusInfo.status_text || user.status_text}
                interactive={isMe}
                onClick={isMe ? () => setStatusModalOpen(true) : undefined}
                size="lg"
                maxWidth={280}
              />
              {isMe && (
                <button
                  type="button"
                  onClick={() => setStatusModalOpen(true)}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "var(--accent-primary)",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                    padding: "2px 6px",
                  }}
                >
                  Edit status
                </button>
              )}
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

      {canManage && (
        <>
          <EditUserModal
            user={adminEditOpen ? user : null}
            onClose={() => setAdminEditOpen(false)}
            roleNames={roleNames}
            onDone={() => {
              toast.push("User details updated successfully.", "success");
              setAdminEditOpen(false);
              refetch();
              queryClient.invalidateQueries({ queryKey: ["admin-users"] });
            }}
          />

          <AdminResetPasswordModal
            user={adminPasswordOpen ? user : null}
            onClose={() => setAdminPasswordOpen(false)}
            onDone={() => {
              toast.push("User password reset successfully.", "success");
              setAdminPasswordOpen(false);
            }}
          />

          <EditRolesModal
            user={adminRolesOpen ? user : null}
            onClose={() => setAdminRolesOpen(false)}
            roleNames={roleNames}
            onDone={() => {
              toast.push("Roles updated successfully.", "success");
              setAdminRolesOpen(false);
              refetch();
              queryClient.invalidateQueries({ queryKey: ["admin-users"] });
            }}
          />

          <UserStatusPickerModal
            isOpen={statusModalOpen}
            onClose={() => setStatusModalOpen(false)}
            onSuccess={() => {
              refetch();
              queryClient.invalidateQueries({ queryKey: ["user", userId] });
            }}
          />
        </>
      )}
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

function EditUserModal({
  user,
  onClose,
  roleNames,
  onDone,
}: {
  user: UserRead | null;
  onClose: () => void;
  roleNames: string[];
  onDone: () => void;
}) {
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    username: "",
    email: "",
    job_title: "",
    bio: "",
    is_active: true,
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setForm({
        first_name: user.first_name || "",
        last_name: user.last_name || "",
        username: user.username || "",
        email: user.email || "",
        job_title: user.job_title || "",
        bio: user.bio || "",
        is_active: user.is_active,
      });
      setError(null);
    }
  }, [user]);

  const set = (k: keyof typeof form) => (v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const mutation = useMutation({
    mutationFn: () =>
      adminUpdateUser(user!.id, {
        first_name: form.first_name.trim() || undefined,
        last_name: form.last_name.trim() || undefined,
        username: form.username.trim() || undefined,
        email: form.email.trim().toLowerCase() || undefined,
        job_title: form.job_title.trim() || undefined,
        bio: form.bio.trim() || undefined,
        is_active: form.is_active,
      }),
    onSuccess: onDone,
    onError: (e) =>
      setError(
        e instanceof AppError ? e.fieldErrors().join(" ") || e.message : "Failed to update user.",
      ),
  });

  const valid = form.first_name.trim() && form.last_name.trim() && form.email.trim();

  return (
    <Modal
      open={!!user}
      onClose={onClose}
      title={`Edit User — ${user?.full_name ?? ""}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!valid || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Saving…" : "Save changes"}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="First name">
            <TextInput value={form.first_name} onChange={(e) => set("first_name")(e.target.value)} />
          </Field>
          <Field label="Last name">
            <TextInput value={form.last_name} onChange={(e) => set("last_name")(e.target.value)} />
          </Field>
        </div>

        <Field label="Username">
          <TextInput
            placeholder="e.g. jdoe"
            value={form.username}
            onChange={(e) => set("username")(e.target.value)}
          />
        </Field>

        <Field label="Email address">
          <TextInput
            type="email"
            value={form.email}
            onChange={(e) => set("email")(e.target.value)}
          />
        </Field>

        <Field label="Job title">
          <TextInput
            placeholder="e.g. Senior Frontend Engineer"
            value={form.job_title}
            onChange={(e) => set("job_title")(e.target.value)}
          />
        </Field>

        <Field label="Account status">
          <Select
            value={form.is_active ? "active" : "deactivated"}
            onChange={(e) => set("is_active")(e.target.value === "active")}
            options={[
              { value: "active", label: "Active (Can log in)" },
              { value: "deactivated", label: "Deactivated (Blocked from logging in)" },
            ]}
          />
        </Field>

        {error && <div style={{ fontSize: 12.5, color: "var(--status-delayed)" }}>{error}</div>}
      </div>
    </Modal>
  );
}

function AdminResetPasswordModal({
  user,
  onClose,
  onDone,
}: {
  user: UserRead | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const toast = useToast();

  useEffect(() => {
    setPassword("");
    setError(null);
    setCopied(false);
  }, [user]);

  const generatePassword = () => {
    const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*";
    let pass = "";
    for (let i = 0; i < 14; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setPassword(pass);
  };

  const copyPassword = async () => {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      toast.push("Password copied to clipboard!", "success");
      setTimeout(() => setCopied(false), 3000);
    } catch {
      toast.push("Could not copy password.", "error");
    }
  };

  const mutation = useMutation({
    mutationFn: () => adminResetPassword(user!.id, password),
    onSuccess: () => {
      onDone();
    },
    onError: (e) =>
      setError(
        e instanceof AppError ? e.fieldErrors().join(" ") || e.message : "Failed to reset password.",
      ),
  });

  return (
    <Modal
      open={!!user}
      onClose={onClose}
      title={`Reset Password — ${user?.full_name ?? ""}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={password.length < 8 || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Setting password…" : "Set new password"}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.55 }}>
          As administrator, you can directly override the password for <b>{user?.full_name}</b> ({user?.email}). Any active sessions for this user will be revoked.
        </p>

        <Field label="New Password (min 8 characters)">
          <div style={{ display: "flex", gap: 8 }}>
            <TextInput
              type="text"
              placeholder="Enter new secure password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: 13 }}
            />
            <Button type="button" variant="secondary" size="sm" onClick={generatePassword} title="Generate random password">
              <RefreshCw size={13} /> Generate
            </Button>
            {password && (
              <Button type="button" variant="secondary" size="sm" onClick={copyPassword} title="Copy password">
                <Copy size={13} /> {copied ? "Copied" : "Copy"}
              </Button>
            )}
          </div>
        </Field>

        {error && <div style={{ fontSize: 12.5, color: "var(--status-delayed)" }}>{error}</div>}

        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
          💡 Tip: Click <b>Generate</b> to create a secure password and <b>Copy</b> to share it securely with the user.
        </div>
      </div>
    </Modal>
  );
}

function EditRolesModal({
  user,
  onClose,
  roleNames,
  onDone,
}: {
  user: UserRead | null;
  onClose: () => void;
  roleNames: string[];
  onDone: () => void;
}) {
  const [selected, setSelected] = useState<string[] | null>(null);
  const current = selected ?? user?.roles ?? [];
  const mutation = useMutation({
    mutationFn: () => assignRoles(user!.id, current),
    onSuccess: () => {
      setSelected(null);
      onDone();
    },
  });

  function toggle(role: string) {
    setSelected(current.includes(role) ? current.filter((r) => r !== role) : [...current, role]);
  }

  return (
    <Modal
      open={!!user}
      onClose={() => {
        setSelected(null);
        onClose();
      }}
      title={`Roles — ${user?.full_name ?? ""}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={mutation.isPending || current.length === 0}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Saving…" : "Save roles"}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {roleNames.map((role) => {
          const on = current.includes(role);
          return (
            <button
              key={role}
              onClick={() => toggle(role)}
              style={{
                padding: "6px 12px",
                borderRadius: "var(--radius-full)",
                border: `1px solid ${on ? "var(--accent-primary)" : "var(--border-default)"}`,
                background: on ? "var(--status-in-progress-bg)" : "transparent",
                color: on ? "var(--text-primary)" : "var(--text-secondary)",
                fontSize: 12.5,
                cursor: "pointer",
              }}
            >
              {role}
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
