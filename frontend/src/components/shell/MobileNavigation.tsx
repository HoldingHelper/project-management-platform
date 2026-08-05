"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { MessageSquare, MoreHorizontal, X } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { getUserPendingWork } from "@/lib/api/blockers";
import { useNotifications } from "@/lib/stores/notifications";
import { Avatar, PresenceDot } from "@/components/ds";
import { usePresence } from "@/lib/stores/presence";
import { MOBILE_PRIMARY_HREFS, NAV_GROUPS, PERSONAL_NAV, type AppNavItem } from "./navigation";

export function MobileNavigation() {
  const pathname = usePathname();
  const { user, hasPermission, isSuperAdmin } = useAuth();
  const { unreadCount } = useNotifications();
  const presence = usePresence(user?.id);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const { data: pending } = useQuery({
    queryKey: ["pending-work", user?.id],
    queryFn: () => getUserPendingWork(user!.id),
    enabled: Boolean(user),
  });
  const pendingCount = pending?.pending_on_me.length ?? 0;

  const canSee = (item: AppNavItem) =>
    !item.anyPermission || isSuperAdmin() || item.anyPermission.some((permission) => hasPermission(permission));
  const allItems = [...NAV_GROUPS.flatMap((group) => group.items), ...PERSONAL_NAV].filter(canSee);
  const primary = MOBILE_PRIMARY_HREFS.map((href) => allItems.find((item) => item.href === href)).filter(Boolean) as AppNavItem[];
  const secondaryGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => canSee(item) && !MOBILE_PRIMARY_HREFS.includes(item.href as (typeof MOBILE_PRIMARY_HREFS)[number])),
  })).filter((group) => group.items.length > 0);

  const badgeFor = (item: AppNavItem) => item.badge === "pending" ? pendingCount : item.badge === "notifications" ? unreadCount : 0;
  const moreActive = [...secondaryGroups.flatMap((group) => group.items), ...PERSONAL_NAV].some((item) => item.match(pathname));

  useEffect(() => {
    if (!moreOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMoreOpen(false);
      if (event.key === "Tab" && moreRef.current) {
        const controls = [...moreRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')];
        if (!controls.length) return;
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    requestAnimationFrame(() => moreRef.current?.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
      moreButtonRef.current?.focus();
    };
  }, [moreOpen]);

  return (
    <>
      <nav className="pmp-mobile-bottom-nav no-print" aria-label="Mobile primary navigation">
        {primary.map((item) => <MobileNavLink key={item.href} item={item} pathname={pathname} badge={badgeFor(item)} />)}
        <button
          ref={moreButtonRef}
          type="button"
          className={`pmp-mobile-bottom-item ${moreOpen || moreActive ? "is-active" : ""}`}
          onClick={() => setMoreOpen(true)}
          aria-expanded={moreOpen}
          aria-controls="mobile-more-sheet"
        >
          <MoreHorizontal size={20} />
          <span>More</span>
        </button>
      </nav>

      {moreOpen && (
        <div className="pmp-sheet-backdrop no-print" role="presentation" onMouseDown={() => setMoreOpen(false)}>
          <section
            ref={moreRef}
            id="mobile-more-sheet"
            className="pmp-mobile-more-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="More navigation"
            tabIndex={-1}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="pmp-mobile-more-handle" aria-hidden />
            <div className="pmp-mobile-more-header">
              <Link href={`/profile/${user?.id}`} className="pmp-mobile-profile" onClick={() => setMoreOpen(false)}>
                <span className="pmp-avatar-wrap">
                  <Avatar name={user?.full_name ?? "User"} size={40} />
                  <PresenceDot status={presence} overlay size={9} />
                </span>
                <span>
                  <strong>{user?.full_name ?? "User"}</strong>
                  <small>{user?.job_title ?? user?.roles[0] ?? "View profile"}</small>
                </span>
              </Link>
              <button className="pmp-icon-btn pmp-touch-target" onClick={() => setMoreOpen(false)} aria-label="Close more navigation"><X size={18} /></button>
            </div>

            <button
              className="pmp-mobile-chat-action"
              type="button"
              onClick={() => {
                setMoreOpen(false);
                window.dispatchEvent(new CustomEvent("pmp:open-chat"));
              }}
            >
              <span className="pmp-mobile-nav-icon"><MessageSquare size={19} /></span>
              <span><strong>Team communication</strong><small>Channels, direct messages and music rooms</small></span>
            </button>

            <div className="pmp-mobile-more-scroll">
              {secondaryGroups.map((group) => (
                <div key={group.label} className="pmp-mobile-more-group">
                  <div className="pmp-eyebrow">{group.label}</div>
                  {group.items.map((item) => <MoreLink key={item.href} item={item} pathname={pathname} badge={badgeFor(item)} close={() => setMoreOpen(false)} />)}
                </div>
              ))}
              <div className="pmp-mobile-more-group">
                <div className="pmp-eyebrow">Personal</div>
                {PERSONAL_NAV.map((item) => <MoreLink key={item.href} item={item} pathname={pathname} badge={0} close={() => setMoreOpen(false)} />)}
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function MobileNavLink({ item, pathname, badge }: { item: AppNavItem; pathname: string; badge: number }) {
  const active = item.match(pathname);
  const Icon = item.icon;
  return (
    <Link href={item.href} className={`pmp-mobile-bottom-item ${active ? "is-active" : ""}`} aria-current={active ? "page" : undefined}>
      <span className="pmp-mobile-bottom-icon"><Icon size={20} />{badge > 0 && <Badge count={badge} />}</span>
      <span>{item.label}</span>
    </Link>
  );
}

function MoreLink({ item, pathname, badge, close }: { item: AppNavItem; pathname: string; badge: number; close: () => void }) {
  const Icon = item.icon;
  const active = item.match(pathname);
  return (
    <Link href={item.href} className={`pmp-mobile-more-link ${active ? "is-active" : ""}`} onClick={close} aria-current={active ? "page" : undefined}>
      <span className="pmp-mobile-nav-icon"><Icon size={18} /></span>
      <span>{item.label}</span>
      {badge > 0 && <Badge count={badge} />}
    </Link>
  );
}

function Badge({ count }: { count: number }) {
  return <span className="pmp-nav-badge" aria-label={`${count} pending`}>{count > 99 ? "99+" : count}</span>;
}
