"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  getContributions,
  getExecutiveDashboard,
  getVelocity,
  getWorkload,
} from "@/lib/api/analytics";
import { listBlockers } from "@/lib/api/blockers";
import { listUsers } from "@/lib/api/users";
import { Alert, Avatar, Button, FocusCard, MetricCard } from "@/components/ds";
import { EmptyState, PAGE_STYLE, PageHeader, Spinner } from "@/components/ui/States";
import type { UUID } from "@/lib/types";

export default function PerformancePage() {
  const { hasPermission } = useAuth();
  const canView = hasPermission("reports.view_executive");
  const [showAllBlockerLoad, setShowAllBlockerLoad] = useState(false);

  const users = useQuery({ queryKey: ["users", "all"], queryFn: () => listUsers({ page_size: 200 }), enabled: canView });
  const blockers = useQuery({ queryKey: ["blockers", "all"], queryFn: () => listBlockers(), enabled: canView });
  const exec = useQuery({ queryKey: ["exec-dash"], queryFn: getExecutiveDashboard, enabled: canView });
  const velocity = useQuery({ queryKey: ["a-velocity", 4], queryFn: () => getVelocity(4), enabled: canView });
  const workload = useQuery({ queryKey: ["a-workload"], queryFn: () => getWorkload(), enabled: canView });
  const contributions = useQuery({ queryKey: ["a-contrib"], queryFn: () => getContributions(4), enabled: canView });

  // Real, API-backed proxy for "load": open blockers pending on each user.
  const loadByUser = useMemo(() => {
    const m = new Map<UUID, number>();
    for (const b of blockers.data ?? []) {
      if (b.status?.toLowerCase() !== "resolved" && b.status?.toLowerCase() !== "closed") {
        m.set(b.pending_on_user_id, (m.get(b.pending_on_user_id) ?? 0) + 1);
      }
    }
    return m;
  }, [blockers.data]);

  if (!canView) {
    return (
      <div style={PAGE_STYLE}>
        <PageHeader title="Team Performance" />
        <Alert kind="warning" title="Admin access required" description="This view needs the reports.view_executive permission." />
      </div>
    );
  }

  const userList = users.data?.items ?? [];
  const maxLoad = Math.max(1, ...Array.from(loadByUser.values()));
  const activeBlockers = (blockers.data ?? []).filter((b) => !["resolved", "closed"].includes((b.status ?? "").toLowerCase())).length;
  const blockerLoadUsers = showAllBlockerLoad
    ? userList
    : userList.filter((u) => (loadByUser.get(u.id) ?? 0) > 0);

  return (
    <div style={{ ...PAGE_STYLE, gap: 20 }}>
      <PageHeader
        title="Team Performance"
        subtitle={`${userList.length} contributors · organization-wide visibility.`}
        badge={
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.04em", color: "var(--accent-primary)", background: "var(--status-in-progress-bg)", border: "1px solid color-mix(in srgb, var(--accent-primary) 40%, transparent)", borderRadius: "var(--radius-full)", padding: "2px 10px" }}>
            ADMIN
          </span>
        }
      />

      <div className="pmp-kpi-grid" style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 16 }}>
        <MetricCard label="Contributors" value={userList.length || "—"} trend="all departments" />
        <MetricCard label="Active Blockers" value={activeBlockers} tone="blocked" trend="open across org" />
        <MetricCard label="Active Projects" value={exec.data?.active_projects ?? "—"} trend="in flight" />
        <MetricCard label="Completed Projects" value={exec.data?.completed_projects ?? "—"} tone="completed" trend="delivered" />
        <MetricCard
          label="Velocity (4 wks)"
          value={Math.round((velocity.data?.weeks ?? []).reduce((s, p) => s + p.value, 0))}
          tone="in-progress"
          trend="story points"
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 20 }}>
        <FocusCard
          title="Blocker Load by Contributor"
          right={
            activeBlockers > 0 ? (
              <Button variant="tertiary" onClick={() => setShowAllBlockerLoad((value) => !value)}>
                {showAllBlockerLoad ? "Show active only" : "Show all"}
              </Button>
            ) : undefined
          }
          focusChildren={
          <div style={{ minHeight: 520 }}>
            {users.isLoading ? (
              <Spinner />
            ) : blockerLoadUsers.length === 0 ? (
              <EmptyState title="No active blocker load" hint="No contributors are currently waiting on open blockers." />
            ) : (
              <BlockerLoadBars userList={blockerLoadUsers} loadByUser={loadByUser} maxLoad={maxLoad} focused />
            )}
          </div>
        }>
          {users.isLoading ? (
            <Spinner />
          ) : blockerLoadUsers.length === 0 ? (
            <EmptyState title="No active blocker load" hint="No contributors are currently waiting on open blockers." />
          ) : (
            <BlockerLoadBars userList={blockerLoadUsers} loadByUser={loadByUser} maxLoad={maxLoad} />
          )}
        </FocusCard>

        <FocusCard
          title="Open Task Load & Contributions (4 weeks)"
          right={
            <Link href="/dashboards/executive">
              <Button variant="tertiary">Full executive dashboard →</Button>
            </Link>
          }
          focusChildren={
            <WorkloadContributionBars
              workload={workload.data ?? []}
              contributions={contributions.data ?? []}
              userList={userList}
              focused
            />
          }
        >
          <WorkloadContributionBars
            workload={workload.data ?? []}
            contributions={contributions.data ?? []}
            userList={userList}
          />
        </FocusCard>
      </div>
    </div>
  );
}

function BlockerLoadBars({
  userList,
  loadByUser,
  maxLoad,
  focused = false,
}: {
  userList: import("@/lib/types").UserRead[];
  loadByUser: Map<UUID, number>;
  maxLoad: number;
  focused?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: focused ? 16 : 12 }}>
      {[...userList]
        .sort((a, b) => (loadByUser.get(b.id) ?? 0) - (loadByUser.get(a.id) ?? 0))
        .map((u) => {
        const load = loadByUser.get(u.id) ?? 0;
        return (
          <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8, width: focused ? 260 : 200, flexShrink: 0, minWidth: 0 }}>
              <Avatar name={u.full_name} size={focused ? 32 : 26} />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: focused ? 14 : 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{u.full_name}</span>
                <span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{u.roles[0] ?? u.job_title ?? ""}</span>
              </span>
            </span>
            <div style={{ flex: 1, height: focused ? 13 : 9, borderRadius: "var(--radius-full)", background: "var(--surface-3)", overflow: "hidden" }}>
              <div style={{ width: `${(load / maxLoad) * 100}%`, height: "100%", background: load >= maxLoad && load > 0 ? "var(--status-delayed)" : "var(--accent-primary)" }} />
            </div>
            <span style={{ width: 100, textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 12.5, color: "var(--text-secondary)", flexShrink: 0 }}>
              {load} blocker{load === 1 ? "" : "s"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function WorkloadContributionBars({
  workload,
  contributions,
  userList,
  focused = false,
}: {
  workload: import("@/lib/api/analytics").WorkloadRow[];
  contributions: import("@/lib/api/analytics").ContributionRow[];
  userList: import("@/lib/types").UserRead[];
  focused?: boolean;
}) {
  if (workload.length === 0) return <EmptyState title="No workload data yet" />;
  const maxOpen = Math.max(1, ...workload.map((x) => x.open_tasks));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: focused ? 16 : 12, minHeight: focused ? 520 : undefined }}>
      {workload.slice(0, focused ? 24 : 12).map((w) => {
        const contrib = contributions.find((c) => c.user_id === w.user_id);
        const u = userList.find((x) => x.id === w.user_id);
        return (
          <div key={w.user_id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8, width: focused ? 260 : 200, flexShrink: 0, minWidth: 0 }}>
              <Avatar name={u?.full_name ?? "?"} size={focused ? 32 : 26} />
              <span style={{ fontSize: focused ? 14 : 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {u?.full_name ?? w.user_id.slice(0, 8)}
              </span>
            </span>
            <div style={{ flex: 1, height: focused ? 13 : 9, borderRadius: "var(--radius-full)", background: "var(--surface-3)", overflow: "hidden" }}>
              <div style={{ width: `${(w.open_tasks / maxOpen) * 100}%`, height: "100%", background: "var(--chart-1)" }} />
            </div>
            <span style={{ width: focused ? 190 : 170, textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-secondary)", flexShrink: 0 }}>
              {w.open_tasks} open · {contrib?.tasks_completed ?? 0} done
            </span>
          </div>
        );
      })}
    </div>
  );
}
