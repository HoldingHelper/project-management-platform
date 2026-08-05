"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Activity, CheckSquare, FolderKanban, Search, ShieldAlert, User, X } from "lucide-react";
import { listBlockers } from "@/lib/api/blockers";
import { listProjects, listTasks } from "@/lib/api/projects";
import { listUsers } from "@/lib/api/users";

const PAGES = [
  { title: "Home Dashboard", href: "/", kind: "Page", Icon: Activity },
  { title: "Projects", href: "/portfolio", kind: "Page", Icon: FolderKanban },
  { title: "Tasks", href: "/tasks", kind: "Page", Icon: CheckSquare },
  { title: "Timeline", href: "/timeline", kind: "Page", Icon: Activity },
  { title: "Executive Dashboard", href: "/dashboards/executive", kind: "Page", Icon: Activity },
  { title: "Team Performance", href: "/performance", kind: "Page", Icon: User },
  { title: "Notifications", href: "/notifications", kind: "Page", Icon: Activity },
  { title: "Admin Users", href: "/admin/users", kind: "Page", Icon: User },
];

export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const enabled = open && q.length >= 2;

  const tasks = useQuery({
    queryKey: ["global-search", "tasks", q],
    queryFn: () => listTasks({ search: q, page_size: 8 }),
    enabled,
  });
  const projects = useQuery({
    queryKey: ["global-search", "projects"],
    queryFn: () => listProjects(1, 200),
    enabled: open,
  });
  const users = useQuery({
    queryKey: ["global-search", "users", q],
    queryFn: () => listUsers({ search: q, page_size: 8 }),
    enabled,
    retry: false,
  });
  const blockers = useQuery({
    queryKey: ["global-search", "blockers"],
    queryFn: () => listBlockers(),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 40);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const results = useMemo(() => {
    if (!q) {
      return PAGES.map((p) => ({ ...p, subtitle: p.href }));
    }
    const pageRows = PAGES.filter((p) => p.title.toLowerCase().includes(q)).map((p) => ({
      ...p,
      subtitle: p.href,
    }));
    const projectRows = (projects.data?.items ?? [])
      .filter((p) => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q))
      .slice(0, 8)
      .map((p) => ({
        title: p.name,
        subtitle: `Project · ${p.status}`,
        href: `/projects/${p.id}`,
        kind: "Project",
        Icon: FolderKanban,
      }));
    const taskRows = (tasks.data?.items ?? []).map((t) => ({
      title: t.title,
      subtitle: `Task · ${t.status}${t.partition ? ` · ${t.partition}` : ""}`,
      href: `/tasks?search=${encodeURIComponent(t.title)}`,
      kind: "Task",
      Icon: CheckSquare,
    }));
    const userRows = (users.data?.items ?? []).map((u) => ({
      title: u.full_name,
      subtitle: `User · ${u.job_title ?? u.roles.join(", ")}`,
      href: `/profile/${u.id}`,
      kind: "User",
      Icon: User,
    }));
    const blockerRows = (blockers.data ?? [])
      .filter((b) => `${b.title} ${b.description ?? ""}`.toLowerCase().includes(q))
      .slice(0, 8)
      .map((b) => ({
        title: b.title,
        subtitle: `Blocker · ${b.status} · ${b.priority}`,
        href: "/tasks?view=blocked",
        kind: "Blocker",
        Icon: ShieldAlert,
      }));
    return [...pageRows, ...projectRows, ...taskRows, ...userRows, ...blockerRows];
  }, [q, projects.data, tasks.data, users.data, blockers.data]);

  function go(href: string) {
    router.push(href);
    onClose();
    setQuery("");
  }

  if (!open) return null;

  return (
    <div className="pmp-command-backdrop" role="dialog" aria-modal="true" aria-label="Global search">
      <div className="pmp-command-panel">
        <div className="pmp-command-search">
          <Search size={18} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tasks, projects, users, blockers, and pages..."
            aria-label="Search tasks, projects, users, blockers, and pages"
          />
          <button type="button" aria-label="Close global search" onClick={onClose} className="pmp-command-close">
            <X size={17} />
          </button>
        </div>
        <div className="pmp-command-results">
          {results.length === 0 && (
            <div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>
              No matching results.
            </div>
          )}
          {results.map((r, index) => (
            <button
              key={`${r.kind}-${r.href}-${index}`}
              type="button"
              onClick={() => go(r.href)}
              className="pmp-command-row"
              aria-label={`Open ${r.kind.toLowerCase()} ${r.title}`}
            >
              <span className="pmp-command-icon">
                <r.Icon size={16} />
              </span>
              <span style={{ minWidth: 0 }}>
                <span className="pmp-command-title">{r.title}</span>
                <span className="pmp-command-subtitle">{r.subtitle}</span>
              </span>
              <span className="pmp-command-kind">{r.kind}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
