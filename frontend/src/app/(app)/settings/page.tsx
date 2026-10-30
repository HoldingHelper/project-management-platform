"use client";
import { useI18n } from "@/lib/i18n/I18nProvider";

import { LanguageSelector } from "@/components/LanguageSelector";
import { LocalizedText } from "@/lib/i18n/I18nProvider";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Bot,
  Calendar,
  CheckCircle2,
  Code2,
  ExternalLink,
  FolderGit2,
  FolderOpen,
  GitBranch,
  Github,
  KeyRound,
  Link2,
  Lock,
  Mail,
  MessageSquare,
  Moon,
  Phone,
  Play,
  Plus,
  RefreshCw,
  Send,
  Sun,
  Unlink,
  Zap,
} from "lucide-react";
import {
  changeMyEmail,
  changeMyPassword,
  getMySettings,
  updateMySettings,
} from "@/lib/api/users";
import {
  disconnectCalendar,
  getCalendarAuthUrl,
  getCalendarStatus,
  syncCalendar,
} from "@/lib/api/calendar";
import {
  integrationsApi,
  type ConfigureGitHubRepoPayload,
  type TelegramLinkCodeResponse,
} from "@/lib/api/integrations";
import { AppError } from "@/lib/api/client";
import { Button, Card, Field, Switch, TextInput, useToast } from "@/components/ds";
import { PageHeader, PAGE_STYLE } from "@/components/ui/States";
import { GitHubBadge } from "@/components/github/GitHubBadge";
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
  const { t: translateUI } = useI18n();

  const toast = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, setUser, logout } = useAuth();
  const [theme, setTheme] = useState<Theme>("dark");
  const [emailForm, setEmailForm] = useState({ new_email: "", current_password: "" });
  const [pwForm, setPwForm] = useState({ current_password: "", new_password: "", confirm: "" });
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});

  // WhatsApp form
  const [waPhone, setWaPhone] = useState("");
  const [waMeetings, setWaMeetings] = useState(true);
  const [waMentions, setWaMentions] = useState(true);
  const [waBlockers, setWaBlockers] = useState(true);
  const [waDms, setWaDms] = useState(true);

  // Telegram Code
  const [telegramCode, setTelegramCode] = useState<TelegramLinkCodeResponse | null>(null);

  // GitHub Repo Link form
  const [showAddRepo, setShowAddRepo] = useState(false);
  const [repoOwner, setRepoOwner] = useState("");
  const [repoName, setRepoName] = useState("");

  useEffect(() => setTheme(getStoredTheme()), []);

  const { data: settings } = useQuery({ queryKey: ["my-settings"], queryFn: getMySettings });
  const { data: integrationsStatus } = useQuery({
    queryKey: ["integrations-status"],
    queryFn: integrationsApi.getStatus,
  });
  const { data: calendarStatus } = useQuery({
    queryKey: ["calendar-status"],
    queryFn: getCalendarStatus,
  });
  const { data: waSettings } = useQuery({
    queryKey: ["whatsapp-settings"],
    queryFn: integrationsApi.getWhatsAppSettings,
  });
  const { data: userRepos } = useQuery({
    queryKey: ["user-github-repos"],
    queryFn: integrationsApi.listUserGitHubRepos,
    enabled: !!integrationsStatus?.github.is_connected,
  });
  const { data: githubRepos } = useQuery({
    queryKey: ["github-repos"],
    queryFn: integrationsApi.listGitHubRepos,
  });

  useEffect(() => {
    if (waSettings) {
      setWaPhone(waSettings.phone_number || "");
      setWaMeetings(waSettings.notify_meetings);
      setWaMentions(waSettings.notify_mentions);
      setWaBlockers(waSettings.notify_blockers);
      setWaDms(waSettings.notify_dms);
    }
  }, [waSettings]);

  useEffect(() => {
    if (settings) {
      const stored = (settings.notification_prefs ?? {}) as Record<string, boolean>;
      const initial: Record<string, boolean> = {};
      for (const p of NOTIF_PREFS) initial[p.key] = stored[p.key] ?? true;
      setPrefs(initial);
    }
  }, [settings]);

  // --- GitHub OAuth Mutations ---
  const connectGitHub = async () => {
    try {
      const redirectUri = `${window.location.origin}/github/callback`;
      const { url } = await integrationsApi.getGitHubAuthUrl(redirectUri);
      window.location.href = url;
    } catch {
      toast.push("Failed to initialize GitHub OAuth.", "error");
    }
  };

  const disconnectGitHubMutation = useMutation({
    mutationFn: integrationsApi.disconnectGitHub,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrations-status"] });
      queryClient.invalidateQueries({ queryKey: ["user-github-repos"] });
      toast.push("GitHub account disconnected.", "success");
    },
    onError: () => toast.push("Failed to disconnect GitHub.", "error"),
  });

  // --- Telegram Mutations ---
  const connectTelegramMutation = useMutation({
    mutationFn: integrationsApi.generateTelegramLinkCode,
    onSuccess: (res) => {
      setTelegramCode(res);
      window.open(res.deep_link, "_blank");
      toast.push("Telegram bot opened! Send /start in Telegram to complete linking.", "info");
    },
    onError: () => toast.push("Failed to generate Telegram link code.", "error"),
  });

  const disconnectTelegramMutation = useMutation({
    mutationFn: integrationsApi.disconnectTelegram,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrations-status"] });
      setTelegramCode(null);
      toast.push("Telegram disconnected.", "success");
    },
    onError: () => toast.push("Failed to disconnect Telegram.", "error"),
  });

  const testTelegramMutation = useMutation({
    mutationFn: integrationsApi.sendTestTelegramMessage,
    onSuccess: (res) => {
      if (res.success) {
        toast.push(res.message, "success");
      } else {
        toast.push(res.message, "error");
      }
    },
    onError: () => toast.push("Failed to dispatch test Telegram message.", "error"),
  });

  // --- Google Calendar Mutations ---
  const syncCalMutation = useMutation({
    mutationFn: syncCalendar,
    onSuccess: (res) => {
      queryClient.setQueryData(["calendar-status"], res);
      queryClient.invalidateQueries({ queryKey: ["calendar-upcoming"] });
      queryClient.invalidateQueries({ queryKey: ["integrations-status"] });
      toast.push("Calendar synchronized.", "success");
    },
    onError: (e) =>
      toast.push(e instanceof AppError ? e.message : "Failed to sync calendar.", "error"),
  });

  const disconnectCalMutation = useMutation({
    mutationFn: disconnectCalendar,
    onSuccess: () => {
      queryClient.setQueryData(["calendar-status"], { connected: false, is_active: false });
      queryClient.invalidateQueries({ queryKey: ["calendar-upcoming"] });
      queryClient.invalidateQueries({ queryKey: ["integrations-status"] });
      toast.push("Google Calendar disconnected.", "success");
    },
    onError: (e) =>
      toast.push(e instanceof AppError ? e.message : "Failed to disconnect calendar.", "error"),
  });

  // --- Google Drive Mutations ---
  const connectDrive = async () => {
    try {
      const { url } = await integrationsApi.getDriveAuthUrl();
      window.open(url, "DriveAuth", "width=600,height=700");
    } catch {
      toast.push("Failed to initialize Google Drive OAuth.", "error");
    }
  };

  const disconnectDriveMutation = useMutation({
    mutationFn: integrationsApi.disconnectDrive,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrations-status"] });
      toast.push("Google Drive disconnected.", "success");
    },
    onError: () => toast.push("Failed to disconnect Google Drive.", "error"),
  });

  // --- WhatsApp Mutations ---
  const saveWaMutation = useMutation({
    mutationFn: () =>
      integrationsApi.updateWhatsAppSettings({
        phone_number: waPhone,
        notify_meetings: waMeetings,
        notify_mentions: waMentions,
        notify_blockers: waBlockers,
        notify_dms: waDms,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-settings"] });
      queryClient.invalidateQueries({ queryKey: ["integrations-status"] });
      toast.push("WhatsApp settings saved.", "success");
    },
    onError: (e) =>
      toast.push(e instanceof AppError ? e.message : "Failed to save WhatsApp settings.", "error"),
  });

  const testWaMutation = useMutation({
    mutationFn: integrationsApi.sendTestWhatsAppMessage,
    onSuccess: (res) => {
      if (res.delivered) {
        toast.push("Test WhatsApp alert delivered successfully!", "success");
      } else {
        toast.push("WhatsApp alert simulated or API token pending.", "info");
      }
    },
    onError: (e) =>
      toast.push(e instanceof AppError ? e.message : "Failed to dispatch WhatsApp alert.", "error"),
  });

  const linkRepoMutation = useMutation({
    mutationFn: (payload: ConfigureGitHubRepoPayload) =>
      integrationsApi.configureGitHubRepo(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["github-repos"] });
      setShowAddRepo(false);
      toast.push("GitHub repository configured.", "success");
    },
    onError: (e) =>
      toast.push(e instanceof AppError ? e.message : "Failed to link repo.", "error"),
  });

  const saveSettings = useMutation({
    mutationFn: () => updateMySettings({ notification_prefs: prefs }),
    onSuccess: () => toast.push("Preferences saved.", "success"),
    onError: (e) =>
      toast.push(e instanceof AppError ? e.message : "Failed to save preferences.", "error"),
  });

  const changeEmail = useMutation({
    mutationFn: () => changeMyEmail(emailForm.new_email, emailForm.current_password),
    onSuccess: (updated) => {
      setUser(updated);
      setEmailForm({ new_email: "", current_password: "" });
      toast.push("Email updated.", "success");
    },
    onError: (e) =>
      toast.push(e instanceof AppError ? e.message : "Failed to update email.", "error"),
  });

  const changePassword = useMutation({
    mutationFn: () =>
      changeMyPassword(pwForm.current_password, pwForm.new_password),
    onSuccess: () => {
      setPwForm({ current_password: "", new_password: "", confirm: "" });
      toast.push("Password updated.", "success");
    },
    onError: (e) =>
      toast.push(e instanceof AppError ? e.message : "Failed to update password.", "error"),
  });

  const isGitHubConnected = !!integrationsStatus?.github.is_connected;
  const isTelegramConnected = !!integrationsStatus?.telegram.is_connected;
  const isCalendarConnected = !!(calendarStatus?.connected || integrationsStatus?.google_calendar.is_connected);
  const isDriveConnected = !!integrationsStatus?.google_drive.is_connected;

  return (
    <div style={PAGE_STYLE}>
      <PageHeader
        title={translateUI("Settings & Integrations")}
        subtitle={translateUI("Manage your account profile, theme preferences, and connected third-party tools (GitHub, Telegram, Calendar, Drive).")}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 20 }}>

        {/* =========================================================================
            LEFT COLUMN: Connected Accounts & Integrations
           ========================================================================= */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Section Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 4 }}>
            <Link2 size={20} color="var(--accent-primary)" />
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>{" "}<LocalizedText message={"Connected Accounts & Tools"} />{" "}</h2>
          </div>

          {/* 1. GitHub User Integration */}
          <Card title={translateUI("GitHub Account & Issue Mentions")} padded>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>{" "}<LocalizedText message={"Connect your personal GitHub account to mention private/public repository issues and PRs in task comments and chat with live status badge previews."} />{" "}</p>

              {isGitHubConnected ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 12px",
                      background: "var(--surface-2)",
                      borderRadius: "var(--radius-2)",
                      border: "1px solid var(--border-subtle)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <img
                        src={integrationsStatus?.github.avatar_url || "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png"}
                        alt="GitHub Avatar"
                        style={{ width: 34, height: 34, borderRadius: "50%", border: "1px solid var(--border-subtle)" }}
                      />
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#10b981" }} />
                          <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-primary)" }}>
                            @{integrationsStatus?.github.account_name}
                          </span>
                        </div>
                        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 2 }}>
                          {userRepos?.length || 3}{" "}<LocalizedText message={"repositories accessible for mentions"} />{" "}</div>
                      </div>
                    </div>

                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => disconnectGitHubMutation.mutate()}
                      disabled={disconnectGitHubMutation.isPending}
                    >
                      <Unlink size={13} />{" "}<LocalizedText message={"Disconnect"} />{" "}</Button>
                  </div>

                  {/* Mention Live Preview */}
                  <div style={{ padding: "10px 12px", background: "rgba(0, 226, 97, 0.04)", borderRadius: 8, border: "1px solid rgba(0, 226, 97, 0.15)" }}>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--accent-primary)", marginBottom: 6 }}>{" "}<LocalizedText message={"LIVE MENTION PREVIEW IN COMMENTS"} />{" "}</div>
                    <div style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.6 }}>{" "}<LocalizedText message={"Example mention resolved:"} />{" "}<GitHubBadge repo="ali-Eskandarian/project-management-platform" number={42} />
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <Button onClick={connectGitHub}>
                    <Github size={15} />{" "}<LocalizedText message={"Connect to GitHub"} />{" "}</Button>
                </div>
              )}
            </div>
          </Card>

          {/* 2. Telegram Bot Notifications */}
          <Card title={translateUI("Telegram Bot & Instant Alerts")} padded>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>{" "}<LocalizedText message={"Connect your administrator-configured Telegram bot to receive real-time push pings for assignments, blockers, and mentions, and query tasks via"} />{" "}<code>/mywork</code>.
              </p>

              {isTelegramConnected ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 12px",
                      background: "var(--surface-2)",
                      borderRadius: "var(--radius-2)",
                      border: "1px solid var(--border-subtle)",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#10b981" }} />
                        <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-primary)" }}>{" "}<LocalizedText message={"Connected: @"} />{integrationsStatus?.telegram.account_name || "Telegram User"}
                        </span>
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 2 }}>{" "}<LocalizedText message={"Chat ID:"} />{" "}{integrationsStatus?.telegram.account_id}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8 }}>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => testTelegramMutation.mutate()}
                        disabled={testTelegramMutation.isPending}
                      >
                        <Send size={13} />{" "}<LocalizedText message={"Test Ping"} />{" "}</Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => disconnectTelegramMutation.mutate()}
                        disabled={disconnectTelegramMutation.isPending}
                      >
                        <Unlink size={13} />{" "}<LocalizedText message={"Disconnect"} />{" "}</Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <Button
                    onClick={() => connectTelegramMutation.mutate()}
                    disabled={connectTelegramMutation.isPending}
                  >
                    <Send size={15} />{" "}<LocalizedText message={"Connect Telegram Bot"} />{" "}</Button>
                  {telegramCode && (
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{" "}<LocalizedText message={"Link Code:"} />{" "}<b style={{ color: "var(--accent-primary)" }}>{telegramCode.link_code}</b>{" "}<LocalizedText message={"(Valid for 30m)"} />{" "}</div>
                  )}
                </div>
              )}
            </div>
          </Card>

          {/* 3. Google Calendar */}
          <Card title={translateUI("Google Calendar & Smart Meetings")} padded>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {isCalendarConnected ? (
                <div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 12,
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981" }} />
                        <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-primary)" }}>{" "}<LocalizedText message={"Connected"} />{" "}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                        {calendarStatus?.google_email || integrationsStatus?.google_calendar.account_name || "Google account linked"}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8 }}>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => syncCalMutation.mutate()}
                        disabled={syncCalMutation.isPending}
                      >
                        <RefreshCw size={13} className={syncCalMutation.isPending ? "animate-spin" : ""} />{" "}<LocalizedText message={"Sync now"} />{" "}</Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => disconnectCalMutation.mutate()}
                        disabled={disconnectCalMutation.isPending}
                      >{" "}<LocalizedText message={"Disconnect"} />{" "}</Button>
                    </div>
                  </div>

                  <div style={{ fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.5 }}>{" "}<LocalizedText message={"Smart 10-minute and 2-minute meeting alerts with 1-click Google Meet joins are active."} />{" "}</div>
                </div>
              ) : (
                <div>
                  <p style={{ margin: "0 0 12px", fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>{" "}<LocalizedText message={"Connect your Google Calendar to see upcoming meetings in the top header and receive real-time notifications with Google Meet links before calls start."} />{" "}</p>
                  <Button
                    onClick={async () => {
                      try {
                        const res = await getCalendarAuthUrl();
                        window.location.href = res.auth_url;
                      } catch (err) {
                        toast.push(err instanceof Error ? err.message : "Could not initialize Google OAuth.", "error");
                      }
                    }}
                  >
                    <Calendar size={15} />{" "}<LocalizedText message={"Connect Google Calendar"} />{" "}</Button>
                </div>
              )}
            </div>
          </Card>

          {/* 4. Google Drive */}
          <Card title={translateUI("Google Drive Attachments")} padded>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>{" "}<LocalizedText message={"Connect your Google Drive to browse files and attach cloud documents directly to tasks, doc spaces, and comments."} />{" "}</p>

              {isDriveConnected ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 12px",
                    background: "var(--surface-2)",
                    borderRadius: "var(--radius-2)",
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#10b981" }} />
                      <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-primary)" }}>{" "}<LocalizedText message={"Connected"} />{" "}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                      {integrationsStatus?.google_drive.account_name || "Drive account linked"}
                    </div>
                  </div>

                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => disconnectDriveMutation.mutate()}
                    disabled={disconnectDriveMutation.isPending}
                  >
                    <Unlink size={13} />{" "}<LocalizedText message={"Disconnect"} />{" "}</Button>
                </div>
              ) : (
                <Button onClick={connectDrive}>
                  <FolderOpen size={15} />{" "}<LocalizedText message={"Connect Google Drive"} />{" "}</Button>
              )}
            </div>
          </Card>

          {/* 5. WhatsApp Notifications */}
          <Card title={translateUI("WhatsApp Notifications")} padded>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>{" "}<LocalizedText message={"Receive instant WhatsApp alerts for upcoming meetings, direct messages, blockers, and @mentions."} />{" "}</p>

              <Field label={translateUI("Phone Number (E.164 with Country Code)")} hint={translateUI("e.g. +14155552671 or +905321234567")}>
                <TextInput
                  type="tel"
                  dir="ltr"
                  value={waPhone}
                  onChange={(e) => setWaPhone(e.target.value)}
                  placeholder="+14155552671"
                />
              </Field>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, minHeight: 36 }}>
                  <span style={{ fontSize: 13, color: "var(--text-primary)" }}><LocalizedText message={"Meeting Reminders (T-10m & T-2m)"} /></span>
                  <Switch label={translateUI("Meeting Reminders (T-10m & T-2m)")} checked={waMeetings} onChange={setWaMeetings} />
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, minHeight: 36 }}>
                  <span style={{ fontSize: 13, color: "var(--text-primary)" }}><LocalizedText message={"Direct Messages & @Mentions"} /></span>
                  <Switch label={translateUI("Direct Messages & @Mentions")} checked={waMentions} onChange={setWaMentions} />
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, minHeight: 36 }}>
                  <span style={{ fontSize: 13, color: "var(--text-primary)" }}><LocalizedText message={"Blockers Waiting On You"} /></span>
                  <Switch label={translateUI("Blockers Waiting On You")} checked={waBlockers} onChange={setWaBlockers} />
                </div>
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                <Button size="sm" style={{ whiteSpace: "normal", minWidth: 0, flex: "1 1 180px", paddingBlock: 10 }} onClick={() => saveWaMutation.mutate()} disabled={saveWaMutation.isPending}>{" "}<LocalizedText message={"Save WhatsApp Settings"} />{" "}</Button>
                <Button
                  size="sm"
                  variant="secondary"
                  style={{ whiteSpace: "normal", minWidth: 0, flex: "1 1 160px", paddingBlock: 10 }}
                  onClick={() => testWaMutation.mutate()}
                  disabled={!waPhone || testWaMutation.isPending}
                >
                  <Play size={13} />{" "}<LocalizedText message={"Send Test Alert"} />{" "}</Button>
              </div>
            </div>
          </Card>

        </div>

        {/* =========================================================================
            RIGHT COLUMN: Appearance, Notifications & Security
           ========================================================================= */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Section Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 4 }}>
            <KeyRound size={20} color="var(--accent-primary)" />
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>{" "}<LocalizedText message={"Account & Preferences"} />{" "}</h2>
          </div>

          {/* Theme & Appearance */}
          <Card title={translateUI("Language and region")} padded><LanguageSelector regional /></Card>
<Card title={translateUI("Appearance")} padded>
            <div style={{ display: "flex", gap: 10 }}>
              {(["dark", "light", "system"] as Theme[]).map((t) => (
                <Button
                  key={t}
                  variant={theme === t ? "primary" : "secondary"}
                  size="sm"
                  onClick={() => {
                    setTheme(t);
                    applyTheme(t);
                  }}
                >
                  {t === "dark" ? <Moon size={14} /> : t === "light" ? <Sun size={14} /> : <Code2 size={14} />}
                  <span style={{ textTransform: "capitalize", marginLeft: 4 }}><LocalizedText message={t} /></span>
                </Button>
              ))}
            </div>
          </Card>

          {/* In-App Notification Preferences */}
          <Card title={translateUI("In-App Notification Preferences")} padded>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {NOTIF_PREFS.map((p) => (
                <div key={p.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>{translateUI(p.label)}</div>
                    <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{translateUI(p.hint)}</div>
                  </div>
                  <Switch
                    checked={prefs[p.key] ?? true}
                    onChange={(v) => setPrefs((prev) => ({ ...prev, [p.key]: v }))}
                  />
                </div>
              ))}
              <div>
                <Button size="sm" onClick={() => saveSettings.mutate()} disabled={saveSettings.isPending}>
                  {saveSettings.isPending ? <LocalizedText message={"Saving…"} /> : <LocalizedText message={"Save In-App Preferences"} />}
                </Button>
              </div>
            </div>
          </Card>

          {/* Change Email */}
          <Card title={translateUI("Change Email")} padded>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Field label={translateUI("New email")}>
                <TextInput
                  value={emailForm.new_email}
                  onChange={(e) => setEmailForm((f) => ({ ...f, new_email: e.target.value }))}
                  placeholder={translateUI("you@company.com")}
                />
              </Field>
              <Field label={translateUI("Current password")}>
                <TextInput
                  type="password"
                  value={emailForm.current_password}
                  onChange={(e) => setEmailForm((f) => ({ ...f, current_password: e.target.value }))}
                />
              </Field>
              <div>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!emailForm.new_email || !emailForm.current_password || changeEmail.isPending}
                  onClick={() => changeEmail.mutate()}
                >
                  <Mail size={14} />{" "}<LocalizedText message={"Update Email"} />{" "}</Button>
              </div>
            </div>
          </Card>

          {/* Change Password */}
          <Card title={translateUI("Security — Change Password")} padded>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Field label={translateUI("Current password")}>
                <TextInput
                  type="password"
                  value={pwForm.current_password}
                  onChange={(e) => setPwForm((f) => ({ ...f, current_password: e.target.value }))}
                />
              </Field>
              <Field label={translateUI("New password (min 8 characters)")}>
                <TextInput
                  type="password"
                  value={pwForm.new_password}
                  onChange={(e) => setPwForm((f) => ({ ...f, new_password: e.target.value }))}
                />
              </Field>
              <Field label={translateUI("Confirm new password")}>
                <TextInput
                  type="password"
                  value={pwForm.confirm}
                  onChange={(e) => setPwForm((f) => ({ ...f, confirm: e.target.value }))}
                />
              </Field>
              {pwForm.confirm && pwForm.confirm !== pwForm.new_password && (
                <div style={{ fontSize: 12, color: "var(--status-delayed)" }}><LocalizedText message={"Passwords do not match."} /></div>
              )}
              <div>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={
                    !pwForm.current_password ||
                    pwForm.new_password.length < 8 ||
                    pwForm.new_password !== pwForm.confirm ||
                    changePassword.isPending
                  }
                  onClick={() => changePassword.mutate()}
                >
                  <KeyRound size={14} />{" "}<LocalizedText message={"Change Password"} />{" "}</Button>
              </div>
            </div>
          </Card>

          {/* Model Context Protocol (MCP) Server */}
          <Card title={translateUI("Model Context Protocol (MCP) Setup")} padded>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>{" "}<LocalizedText message={"Connect Codex, Claude, Cursor, or another MCP client as your own Platform user. Generate a revocable token, limit its permissions, and copy a ready-made configuration with the token included."} />{" "}</p>
              <div style={{ padding: 12, borderRadius: 9, border: "1px solid var(--border-subtle)", background: "var(--surface-2)", color: "var(--text-secondary)", fontSize: 12, lineHeight: 1.55 }}>{" "}<LocalizedText message={"The agent automatically discovers an identity-aware"} />{" "}<code>SKILL.md</code>{" "}<LocalizedText message={"resource and can never see more projects, tasks, or documents than your account."} />{" "}</div>
              <div>
                <Button onClick={() => router.push("/settings/mcp")}>
                  <Bot size={15} />{" "}<LocalizedText message={"Open AI & MCP connections"} />{" "}</Button>
              </div>
            </div>
          </Card>

        </div>

      </div>
    </div>
  );
}
