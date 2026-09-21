"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, BookOpenText, CheckCheck, FolderKanban, LogOut, Search, Settings, Sparkles, User as UserIcon } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { markAllNotificationsRead } from "@/lib/api/collaboration";
import { setMyPresence } from "@/lib/api/users";
import { Avatar, PresenceDot, PRESENCE_LABELS } from "@/components/ds";
import { UserStatusPickerModal, UserStatusPill } from "@/components/status";
import { useNotifications } from "@/lib/stores/notifications";
import { usePresence, useUserStatus } from "@/lib/stores/presence";
import type { PresenceStatus } from "@/lib/types";
import { formatNotificationBody, relativeTime } from "@/lib/format";
import { getRouteMeta } from "./navigation";
import { HeaderMeetingPill } from "@/components/calendar/HeaderMeetingPill";

const PRESENCE_OPTIONS: PresenceStatus[] = ["online", "busy", "away", "focus"];

function useClickOutside(onOutside: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  });
  return ref;
}

export function Header({
  onOpenSearch,
}: {
  onOpenSearch: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const { notifications, unreadCount, refresh } = useNotifications();
  const myPresence = usePresence(user?.id);
  const myStatus = useUserStatus(user?.id);

  const menuRef = useClickOutside(() => setMenuOpen(false));
  const bellRef = useClickOutside(() => setBellOpen(false));

  const match = getRouteMeta(pathname);
  const docsModule = pathname.startsWith("/app/docs");

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  async function pickPresence(status: PresenceStatus) {
    try {
      await setMyPresence(status);
    } catch {
      /* non-fatal */
    }
  }

  const recent = notifications.slice(0, 6);

  return (
    <header
      className="hig-app-header no-print"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        height: "var(--hig-header-height)",
        padding: "0 20px",
        flexShrink: 0,
        borderBottom: "1px solid var(--border-subtle)",
        background: "color-mix(in srgb, var(--surface-deepest) 72%, transparent)",
        backdropFilter: "blur(14px)",
        position: "sticky",
        top: 0,
        zIndex: "var(--z-sticky)",
      }}
    >
      <div className="workspace-module-switcher" aria-label="Workspace modules">
        <Link href="/app/docs" aria-current={docsModule ? "page" : undefined} onClick={() => window.localStorage.setItem("workspace.last-module", "docs")}><BookOpenText size={15}/>Docs</Link>
        <Link href="/app/teams" aria-current={!docsModule ? "page" : undefined} onClick={() => window.localStorage.setItem("workspace.last-module", "teams")}><FolderKanban size={15}/>Teams</Link>
      </div>

      <div className="hig-header-route" style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{ fontSize: 11, color: "var(--text-tertiary)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
          {docsModule ? "Knowledge" : match.crumb}
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, lineHeight: "20px" }}>{docsModule ? "Internal Docs" : match.title}</div>
      </div>

      <div style={{ flex: 1 }} />

      {!docsModule && <button
        type="button"
        aria-label="Open global search"
        onClick={onOpenSearch}
        className="hig-global-search-trigger hig-row"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          height: 38,
          padding: "0 12px",
          borderRadius: "var(--radius-2)",
          border: "1px solid var(--border-subtle)",
          background: "var(--surface-3)",
          width: 320,
          maxWidth: "34vw",
          cursor: "pointer",
          color: "var(--text-secondary)",
        }}
      >
        <Search size={15} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
        <span style={{ fontSize: 13.5, flex: 1, minWidth: 0, textAlign: "left" }}>Search projects, tasks, people…</span>
        <span className="hig-search-kbd">⌘K</span>
      </button>}

      <HeaderMeetingPill />

      <div ref={bellRef} style={{ position: "relative" }}>
        <button
          className="hig-icon-btn"
          title="Notifications"
          aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
          onClick={() => setBellOpen((o) => !o)}
          style={{
            position: "relative",
            width: 38,
            height: 38,
            borderRadius: "var(--radius-2)",
            border: "1px solid var(--border-default)",
            background: "transparent",
            color: "var(--text-secondary)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Bell size={18} />
          {unreadCount > 0 && (
            <span
              style={{
                position: "absolute",
                top: 4,
                right: 4,
                minWidth: 15,
                height: 15,
                padding: "0 3px",
                borderRadius: "var(--radius-full)",
                background: "var(--status-delayed)",
                color: "#fff",
                fontSize: 9.5,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "2px solid var(--surface-1)",
              }}
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
        {bellOpen && (
          <div
            style={{
              position: "absolute",
              right: 0,
              top: 44,
              width: 340,
              background: "var(--surface-2)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-3)",
              boxShadow: "0 20px 48px -8px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.08)",
              zIndex: 20,
              overflow: "hidden",
              animation: "smoothScaleUp var(--duration-fast) var(--ease-spring)",
              transformOrigin: "top right",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 12px",
                borderBottom: "1px solid var(--border-subtle)",
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 700 }}>Notifications</span>
              <button
                onClick={async () => {
                  await markAllNotificationsRead();
                  refresh();
                }}
                title="Mark all read"
                aria-label="Mark all notifications as read"
                style={{
                  border: "none",
                  background: "transparent",
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 11.5,
                }}
              >
                <CheckCheck size={13} /> Mark all read
              </button>
            </div>
            {recent.length === 0 && (
              <div style={{ padding: 18, fontSize: 12.5, color: "var(--text-tertiary)", textAlign: "center" }}>
                You&apos;re all caught up.
              </div>
            )}
            {recent.map((n) => (
              <Link
                key={n.id}
                href="/notifications"
                onClick={() => setBellOpen(false)}
                className="hig-row"
                style={{ display: "block", padding: "10px 12px", borderBottom: "1px solid var(--border-subtle)" }}
              >
                <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                  {!n.is_read && (
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--accent-primary)", flexShrink: 0 }} />
                  )}
                    <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {n.title}
                    </div>
                    {n.body && (
                      <div style={{ fontSize: 11.5, color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {formatNotificationBody(n.body)}
                      </div>
                    )}
                    <div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{relativeTime(n.created_at)}</div>
                </div>
              </Link>
            ))}
            <Link
              href="/notifications"
              onClick={() => setBellOpen(false)}
              className="hig-row"
              style={{
                display: "block",
                padding: "10px 12px",
                textAlign: "center",
                fontSize: 12.5,
                fontWeight: 600,
                color: "var(--text-link)",
              }}
            >
              Open notification center
            </Link>
          </div>
        )}
      </div>

      {/* Live Custom Status Pill in Top Right Header */}
      <UserStatusPill
        status={myStatus.status || myPresence}
        emoji={user?.status_emoji || myStatus.status_emoji}
        text={user?.status_text || myStatus.status_text}
        interactive
        onClick={() => setStatusModalOpen(true)}
        size="md"
        maxWidth={200}
      />

      <div ref={menuRef} style={{ position: "relative" }}>
        <button
          onClick={() => setMenuOpen((o) => !o)}
          aria-label={`Open profile menu for ${user?.full_name ?? "current user"}`}
          style={{ border: "none", background: "transparent", cursor: "pointer", padding: 0, display: "flex", position: "relative" }}
        >
          <span style={{ position: "relative", display: "inline-flex" }}>
            <Avatar name={user?.full_name ?? "User"} size={34} />
            <PresenceDot status={myPresence} overlay />
          </span>
        </button>
        {menuOpen && (
          <div
            style={{
              position: "absolute",
              right: 0,
              top: 44,
              background: "var(--surface-2)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-3)",
              boxShadow: "0 20px 48px -8px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.08)",
              minWidth: 220,
              zIndex: 20,
              overflow: "hidden",
              animation: "smoothScaleUp var(--duration-fast) var(--ease-spring)",
              transformOrigin: "top right",
            }}
          >
            <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-subtle)" }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{user?.full_name}</div>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{user?.email}</div>
            </div>

            {/* Custom status shortcut */}
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setStatusModalOpen(true);
              }}
              className="hig-row"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                border: "none",
                background: "transparent",
                color: "var(--text-primary)",
                cursor: "pointer",
                padding: "9px 12px",
                fontSize: 12.5,
                fontWeight: 600,
                textAlign: "left",
                borderBottom: "1px solid var(--border-subtle)",
              }}
            >
              <Sparkles size={14} style={{ color: "var(--accent-primary)" }} />
              <span>Set custom status…</span>
            </button>

            <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border-subtle)" }}>
              <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>
                Presence
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {PRESENCE_OPTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => pickPresence(s)}
                    title={PRESENCE_LABELS[s]}
                    aria-label={`Set presence to ${PRESENCE_LABELS[s]}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      border: `1px solid ${myPresence === s ? "var(--accent-primary)" : "var(--border-default)"}`,
                      background: myPresence === s ? "var(--status-in-progress-bg)" : "transparent",
                      color: "var(--text-secondary)",
                      borderRadius: "var(--radius-full)",
                      padding: "3px 8px",
                      fontSize: 11,
                      cursor: "pointer",
                    }}
                  >
                    <PresenceDot status={s} size={7} />
                    {PRESENCE_LABELS[s].split(" ")[0]}
                  </button>
                ))}
              </div>
            </div>
            <Link
              href={`/profile/${user?.id}`}
              onClick={() => setMenuOpen(false)}
              className="hig-row"
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", fontSize: 13, color: "var(--text-secondary)" }}
            >
              <UserIcon size={15} /> My profile
            </Link>
            <Link
              href="/settings"
              onClick={() => setMenuOpen(false)}
              className="hig-row"
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", fontSize: 13, color: "var(--text-secondary)" }}
            >
              <Settings size={15} /> Settings
            </Link>
            <button
              onClick={handleLogout}
              className="hig-row"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                border: "none",
                background: "transparent",
                color: "var(--text-secondary)",
                cursor: "pointer",
                padding: "10px 12px",
                fontSize: 13,
                textAlign: "left",
                borderTop: "1px solid var(--border-subtle)",
              }}
            >
              <LogOut size={15} /> Log out
            </button>
          </div>
        )}
      </div>

      <UserStatusPickerModal
        isOpen={statusModalOpen}
        onClose={() => setStatusModalOpen(false)}
      />
    </header>
  );
}
