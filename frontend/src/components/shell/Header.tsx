"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, CheckCheck, LogOut, Search, Settings, User as UserIcon } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { markAllNotificationsRead } from "@/lib/api/collaboration";
import { setMyPresence } from "@/lib/api/users";
import { Avatar, PresenceDot, PRESENCE_LABELS } from "@/components/ds";
import { useNotifications } from "@/lib/stores/notifications";
import { usePresence } from "@/lib/stores/presence";
import type { PresenceStatus } from "@/lib/types";
import { relativeTime } from "@/lib/format";
import { getRouteMeta } from "./navigation";

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
  const { notifications, unreadCount, refresh } = useNotifications();
  const myPresence = usePresence(user?.id);

  const menuRef = useClickOutside(() => setMenuOpen(false));
  const bellRef = useClickOutside(() => setBellOpen(false));

  const match = getRouteMeta(pathname);

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
      className="pmp-app-header no-print"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        height: "var(--pmp-header-height)",
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
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{ fontSize: 11, color: "var(--text-tertiary)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
          {match.crumb}
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, lineHeight: "20px" }}>{match.title}</div>
      </div>

      <div style={{ flex: 1 }} />

      <button
        type="button"
        aria-label="Open global search"
        onClick={onOpenSearch}
        className="pmp-global-search-trigger pmp-row"
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
        <span className="pmp-search-kbd">⌘K</span>
      </button>

      <div ref={bellRef} style={{ position: "relative" }}>
        <button
          className="pmp-icon-btn"
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
              borderRadius: "var(--radius-2)",
              boxShadow: "var(--shadow-lg)",
              zIndex: 20,
              overflow: "hidden",
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
                You're all caught up.
              </div>
            )}
            {recent.map((n) => (
              <Link
                key={n.id}
                href="/notifications"
                onClick={() => setBellOpen(false)}
                className="pmp-row"
                style={{ display: "block", padding: "10px 12px", borderBottom: "1px solid var(--border-subtle)" }}
              >
                <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                  {!n.is_read && (
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--accent-primary)", flexShrink: 0 }} />
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {n.title}
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{relativeTime(n.created_at)}</div>
                  </div>
                </div>
              </Link>
            ))}
            <Link
              href="/notifications"
              onClick={() => setBellOpen(false)}
              className="pmp-row"
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
              borderRadius: "var(--radius-2)",
              boxShadow: "var(--shadow-lg)",
              minWidth: 220,
              zIndex: 20,
              overflow: "hidden",
            }}
          >
            <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-subtle)" }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{user?.full_name}</div>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{user?.email}</div>
            </div>
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
              className="pmp-row"
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", fontSize: 13, color: "var(--text-secondary)" }}
            >
              <UserIcon size={15} /> My profile
            </Link>
            <Link
              href="/settings"
              onClick={() => setMenuOpen(false)}
              className="pmp-row"
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", fontSize: 13, color: "var(--text-secondary)" }}
            >
              <Settings size={15} /> Settings
            </Link>
            <button
              onClick={handleLogout}
              className="pmp-row"
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
    </header>
  );
}
