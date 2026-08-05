"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { KeyRound, Mail, Moon, Sun } from "lucide-react";
import {
  changeMyEmail,
  changeMyPassword,
  getMySettings,
  updateMySettings,
} from "@/lib/api/users";
import { AppError } from "@/lib/api/client";
import { Button, Card, Field, Switch, TextInput, useToast } from "@/components/ds";
import { PageHeader, PAGE_STYLE } from "@/components/ui/States";
import { useAuth } from "@/lib/auth/AuthProvider";
import { applyTheme, getStoredTheme, type Theme } from "@/lib/theme";
import { useRouter } from "next/navigation";

const NOTIF_PREFS: { key: string; label: string; hint: string }[] = [
  { key: "mentions", label: "Mentions", hint: "When someone @mentions you in comments or chat." },
  { key: "task_assigned", label: "Task assignments", hint: "When a task or dependency is assigned to you." },
  { key: "blockers", label: "Blockers", hint: "When something is blocked waiting on you." },
  { key: "project_updates", label: "Project updates", hint: "Status changes on projects you belong to." },
  { key: "dms", label: "Direct messages", hint: "New private messages." },
];

export default function SettingsPage() {
  const toast = useToast();
  const router = useRouter();
  const { user, setUser, logout } = useAuth();
  const [theme, setTheme] = useState<Theme>("dark");
  const [emailForm, setEmailForm] = useState({ new_email: "", current_password: "" });
  const [pwForm, setPwForm] = useState({ current_password: "", new_password: "", confirm: "" });
  const [github, setGithub] = useState("");
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});

  useEffect(() => setTheme(getStoredTheme()), []);

  const { data: settings } = useQuery({ queryKey: ["my-settings"], queryFn: getMySettings });
  useEffect(() => {
    if (settings) {
      setGithub(settings.github_username ?? "");
      const stored = (settings.notification_prefs ?? {}) as Record<string, boolean>;
      const initial: Record<string, boolean> = {};
      for (const p of NOTIF_PREFS) initial[p.key] = stored[p.key] ?? true;
      setPrefs(initial);
    }
  }, [settings]);

  const saveSettings = useMutation({
    mutationFn: () =>
      updateMySettings({ notification_prefs: prefs, theme, github_username: github || undefined }),
    onSuccess: () => toast.push("Settings saved.", "success"),
  });

  const changeEmail = useMutation({
    mutationFn: () => changeMyEmail(emailForm.new_email, emailForm.current_password),
    onSuccess: (updated) => {
      setUser(updated);
      setEmailForm({ new_email: "", current_password: "" });
      toast.push("Email updated.", "success");
    },
    onError: (e) =>
      toast.push(e instanceof AppError ? e.message : "Could not change email.", "error"),
  });

  const changePassword = useMutation({
    mutationFn: () => changeMyPassword(pwForm.current_password, pwForm.new_password),
    onSuccess: async () => {
      toast.push("Password changed. Please sign in again.", "success");
      await logout();
      router.replace("/login");
    },
    onError: (e) =>
      toast.push(e instanceof AppError ? e.message : "Could not change password.", "error"),
  });

  function switchTheme(next: Theme) {
    setTheme(next);
    applyTheme(next);
  }

  return (
    <div style={PAGE_STYLE}>
      <PageHeader title="Settings" subtitle={`Signed in as ${user?.email ?? ""}.`} />

      <div className="pmp-settings-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <Card title="Appearance" padded>
            <div style={{ display: "flex", gap: 10 }}>
              {(["dark", "light"] as Theme[]).map((t) => (
                <button
                  key={t}
                  onClick={() => switchTheme(t)}
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    padding: "14px 0",
                    borderRadius: "var(--radius-2)",
                    border: `1px solid ${theme === t ? "var(--accent-primary)" : "var(--border-default)"}`,
                    background: theme === t ? "var(--status-in-progress-bg)" : "var(--surface-2)",
                    color: "var(--text-primary)",
                    cursor: "pointer",
                    fontSize: 13.5,
                    fontWeight: 600,
                  }}
                >
                  {t === "dark" ? <Moon size={15} /> : <Sun size={15} />}
                  {t === "dark" ? "Dark" : "Light"}
                </button>
              ))}
            </div>
          </Card>

          <Card title="Notification preferences" padded>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {NOTIF_PREFS.map((p) => (
                <div key={p.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>{p.label}</div>
                    <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{p.hint}</div>
                  </div>
                  <Switch
                    checked={prefs[p.key] ?? true}
                    onChange={(v) => setPrefs((prev) => ({ ...prev, [p.key]: v }))}
                  />
                </div>
              ))}
            </div>
          </Card>

          <Card title="Integrations" padded>
            <Field label="GitHub username" hint="Links your account to imported GitHub issues. Full GitHub sync is planned.">
              <TextInput value={github} onChange={(e) => setGithub(e.target.value)} placeholder="your-github-handle" />
            </Field>
          </Card>

          <div>
            <Button onClick={() => saveSettings.mutate()} disabled={saveSettings.isPending}>
              {saveSettings.isPending ? "Saving…" : "Save preferences"}
            </Button>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <Card title="Change email" padded>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Field label="New email">
                <TextInput
                  value={emailForm.new_email}
                  onChange={(e) => setEmailForm((f) => ({ ...f, new_email: e.target.value }))}
                  placeholder="you@example.com"
                />
              </Field>
              <Field label="Current password">
                <TextInput
                  type="password"
                  value={emailForm.current_password}
                  onChange={(e) => setEmailForm((f) => ({ ...f, current_password: e.target.value }))}
                />
              </Field>
              <div>
                <Button
                  variant="secondary"
                  disabled={!emailForm.new_email || !emailForm.current_password || changeEmail.isPending}
                  onClick={() => changeEmail.mutate()}
                >
                  <Mail size={14} /> Update email
                </Button>
              </div>
            </div>
          </Card>

          <Card title="Security — change password" padded>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Field label="Current password">
                <TextInput
                  type="password"
                  value={pwForm.current_password}
                  onChange={(e) => setPwForm((f) => ({ ...f, current_password: e.target.value }))}
                />
              </Field>
              <Field label="New password (min 8 characters)">
                <TextInput
                  type="password"
                  value={pwForm.new_password}
                  onChange={(e) => setPwForm((f) => ({ ...f, new_password: e.target.value }))}
                />
              </Field>
              <Field label="Confirm new password">
                <TextInput
                  type="password"
                  value={pwForm.confirm}
                  onChange={(e) => setPwForm((f) => ({ ...f, confirm: e.target.value }))}
                />
              </Field>
              {pwForm.confirm && pwForm.confirm !== pwForm.new_password && (
                <div style={{ fontSize: 12, color: "var(--status-delayed)" }}>Passwords do not match.</div>
              )}
              <div>
                <Button
                  variant="secondary"
                  disabled={
                    !pwForm.current_password ||
                    pwForm.new_password.length < 8 ||
                    pwForm.new_password !== pwForm.confirm ||
                    changePassword.isPending
                  }
                  onClick={() => changePassword.mutate()}
                >
                  <KeyRound size={14} /> Change password
                </Button>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                Changing your password signs you out of all sessions.
              </div>
            </div>
          </Card>

          <Card title="Account" padded>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: 6 }}>
              <div>Email: <b style={{ color: "var(--text-primary)" }}>{user?.email}</b></div>
              {user?.username && (
                <div>Username: <b style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>{user.username}</b></div>
              )}
              <div>Roles: <b style={{ color: "var(--text-primary)" }}>{user?.roles.join(", ")}</b></div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
