"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/AuthProvider";
import { getUserPendingWork } from "@/lib/api/blockers";
import { Avatar, PresenceDot } from "@/components/ds";
import { useNotifications } from "@/lib/stores/notifications";
import { usePresence } from "@/lib/stores/presence";
import { NAV_GROUPS, type AppNavItem } from "./navigation";
import { PlatformLogo } from "@/components/brand/PlatformLogo";

export function Sidebar({
  mobile = false,
  onNavigate,
}: {
  mobile?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { user, hasPermission, isSuperAdmin } = useAuth();
  const { unreadCount } = useNotifications();
  const myPresence = usePresence(user?.id);

  const { data: pending } = useQuery({
    queryKey: ["pending-work", user?.id],
    queryFn: () => getUserPendingWork(user!.id),
    enabled: !!user,
  });
  const pendingCount = pending?.pending_on_me.length ?? 0;

  const canSee = (item: AppNavItem) =>
    !item.anyPermission || isSuperAdmin() || item.anyPermission.some((perm) => hasPermission(perm));

  const visibleGroups = NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter(canSee) })).filter(
    (g) => g.items.length > 0,
  );

  return (
    <aside
      className={mobile ? "pmp-sidebar pmp-sidebar-mobile" : "pmp-sidebar"}
      aria-label={mobile ? "Mobile primary navigation" : "Primary navigation"}
      style={{
        width: mobile ? "100%" : "var(--pmp-sidebar-width)",
        flexShrink: 0,
        height: "100%",
        background: "var(--surface-1)",
        borderRight: "1px solid var(--border-subtle)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Brand */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          height: "var(--pmp-header-height)",
          padding: "0 18px",
          flexShrink: 0,
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <PlatformLogo size={29} />
        <span className="pmp-sidebar-wordmark"><span>Project <b>Platform</b></span><small>Management workspace</small></span>
      </div>

      {/* Grouped nav */}
      <nav
        aria-label="Primary navigation"
        style={{ display: "flex", flexDirection: "column", gap: 4, padding: "12px 10px", flex: 1, overflowY: "auto" }}
      >
        {visibleGroups.map((group) => (
          <div key={group.label} style={{ marginBottom: 6 }}>
            <div
              className="pmp-eyebrow"
              style={{ padding: "6px 10px 4px" }}
            >
              {group.label}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {group.items.map((item) => {
                const active = item.match(pathname);
                const Icon = item.icon;
                const badge =
                  item.badge === "pending"
                    ? pendingCount
                    : item.badge === "notifications"
                      ? unreadCount
                      : 0;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="pmp-nav-btn"
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    title={item.label}
                    style={{
                      position: "relative",
                      display: "flex",
                      alignItems: "center",
                      gap: 11,
                      padding: "8px 10px",
                      borderRadius: "var(--radius-2)",
                      background: active ? "var(--accent-primary-soft)" : "transparent",
                      color: active ? "var(--accent-primary)" : "var(--text-secondary)",
                      fontSize: 13.5,
                      fontWeight: active ? 700 : 500,
                    }}
                  >
                    {active && (
                      <span
                        aria-hidden
                        style={{
                          position: "absolute",
                          left: 0,
                          top: 8,
                          bottom: 8,
                          width: 3,
                          borderRadius: "0 var(--radius-full) var(--radius-full) 0",
                          background: "var(--accent-primary)",
                        }}
                      />
                    )}
                    <Icon size={18} style={{ flexShrink: 0, opacity: active ? 1 : 0.85 }} />
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.label}
                    </span>
                    {badge > 0 && (
                      <span
                        aria-label={`${badge} pending`}
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: "var(--status-delayed)",
                          background: "var(--status-delayed-bg)",
                          borderRadius: "var(--radius-full)",
                          padding: "1px 7px",
                        }}
                      >
                        {badge > 99 ? "99+" : badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User */}
      <Link
        href={`/profile/${user?.id}`}
        onClick={onNavigate}
        className="pmp-interactive"
        style={{
          padding: 12,
          borderTop: "1px solid var(--border-subtle)",
          display: "flex",
          alignItems: "center",
          gap: 10,
          overflow: "hidden",
          color: "inherit",
        }}
      >
        <span style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
          <Avatar name={user?.full_name ?? "User"} size={32} />
          <PresenceDot status={myPresence} overlay size={9} />
        </span>
        <div style={{ overflow: "hidden" }}>
          <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {user?.full_name ?? "—"}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {user?.job_title ?? user?.roles[0] ?? ""}
          </div>
        </div>
      </Link>
    </aside>
  );
}
