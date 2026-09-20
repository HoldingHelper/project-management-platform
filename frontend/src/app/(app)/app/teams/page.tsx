"use client";

// Teams is the execution module inside the authenticated workspace.

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Activity, CalendarClock, CheckCircle2, Crosshair, TrendingUp, UserRound, Zap } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { getContributions, getExecutiveDashboard, getPersonalDashboard, getWorkload } from "@/lib/api/analytics";
import { getUserPendingWork } from "@/lib/api/blockers";
import { listProjects } from "@/lib/api/projects";
import { useUserMap } from "@/lib/hooks";
import { Alert, Avatar, MetricCard, PriorityBadge, ProgressBar, Select, StatusChip } from "@/components/ds";
import { EmptyState, PAGE_STYLE, PageHeader, Spinner } from "@/components/ui/States";
import { toSemantic } from "@/lib/format";
import type { UUID } from "@/lib/types";

export default function HomePage() {
  const { user, hasPermission } = useAuth();
  const canExec = hasPermission("reports.view_executive");

  const exec = useQuery({ queryKey: ["exec-dash"], queryFn: getExecutiveDashboard, enabled: canExec });
  const personal = useQuery({ queryKey: ["personal-dash"], queryFn: getPersonalDashboard });
  const pending = useQuery({ queryKey: ["pending-work", user?.id], queryFn: () => getUserPendingWork(user!.id), enabled: !!user });
  const projects = useQuery({ queryKey: ["projects"], queryFn: () => listProjects(1, 200) });
  const workload = useQuery({ queryKey: ["a-workload", "home"], queryFn: () => getWorkload(), enabled: canExec });
  const contributions = useQuery({ queryKey: ["a-contributions", "home"], queryFn: () => getContributions(8), enabled: canExec });
  const { nameOf, users } = useUserMap();
  const [selectedUserId, setSelectedUserId] = useState<UUID | "">("");

  const firstName = user?.first_name ?? "there";
  const atRisk = (projects.data?.items ?? []).filter((p) =>
    ["at-risk", "blocked", "delayed"].includes(toSemantic(p.health_status)) ||
    ["at-risk", "blocked", "delayed"].includes(p.health_status),
  );
  const pendingItems = pending.data?.pending_on_me ?? [];
  const personalLate = personal.data?.late_tasks?.length ?? 0;
  const personalUpcoming = personal.data?.upcoming_deadlines?.length ?? 0;
  const assignedTasks = personal.data?.assigned_tasks_total ?? 0;
  const openTasks = personal.data?.open_tasks ?? 0;
  const inProgressTasks = personal.data?.in_progress_tasks ?? 0;
  const completedTasks = personal.data?.completed_tasks ?? 0;
  const taskAttentionItems = personal.data?.attention_required_tasks ?? 0;
  const unscheduledOpenTasks = personal.data?.unscheduled_open_tasks ?? 0;
  const completionRate = personal.data?.completion_rate_percent ?? 0;
  const scheduleCoverage = openTasks === 0
    ? 100
    : Math.max(0, Math.round(((openTasks - unscheduledOpenTasks) / openTasks) * 100));
  const standaloneBlockers = pendingItems.filter((item) => item.kind === "blocker").length;
  const attentionItems = taskAttentionItems + standaloneBlockers;
  const selectedUser = selectedUserId || workload.data?.[0]?.user_id || users[0]?.id || "";
  const selectedWorkload = workload.data?.find((row) => row.user_id === selectedUser);
  const selectedContribution = contributions.data?.find((row) => row.user_id === selectedUser);
  const rankedPeople = useMemo(
    () =>
      (workload.data ?? [])
        .map((row) => ({
          ...row,
          contribution: contributions.data?.find((item) => item.user_id === row.user_id),
        }))
        .sort((a, b) => b.open_tasks + b.open_blockers * 2 - (a.open_tasks + a.open_blockers * 2))
        .slice(0, 6),
    [workload.data, contributions.data],
  );

  return (
    <div style={{ ...PAGE_STYLE, gap: 22 }}>
      <PageHeader
        title={`Good day, ${firstName}`}
        subtitle={`${openTasks} open task(s) · ${attentionItems} signal(s) need attention${
          exec.data ? ` across ${exec.data.active_projects} active projects.` : "."
        }`}
      />

      {atRisk.length > 0 && (
        <Alert
          kind="critical"
          title={`${atRisk.length} project(s) are at risk of missing their window`}
          description={atRisk.slice(0, 3).map((p) => p.name).join(", ")}
          time="live"
        />
      )}

      {/* Metric cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 16 }}>
        <MetricCard href="/tasks?view=my" label="Assigned tasks" value={assignedTasks} trend={`${openTasks} currently open`} icon={<Crosshair size={15} />} />
        <MetricCard href="/tasks?view=my-done" label="Completed" value={completedTasks} trend={`${personal.data?.velocity_points_completed ?? 0} estimated points`} tone="completed" icon={<CheckCircle2 size={15} />} />
        <MetricCard href="/tasks?view=my" label="In progress" value={inProgressTasks} trend="active assigned work" tone="in-progress" icon={<Activity size={15} />} />
        <MetricCard href="/tasks?view=my" label="Needs attention" value={attentionItems} tone={attentionItems > 0 ? "delayed" : "default"} trend="reviews, blockers and late work" icon={<Zap size={15} />} />
      </div>

      <section style={{ background: "var(--surface-2)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-3)", padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, marginBottom: 14, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800 }}>My KPI Pulse</div>
            <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>Only your personal delivery signals are shown here.</div>
          </div>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, color: "var(--text-secondary)", fontSize: 12.5, fontWeight: 700 }}>
            <UserRound size={15} /> {user?.full_name ?? firstName}
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14 }}>
          <KpiBar icon={<TrendingUp size={15} />} label="Completion rate" value={`${completionRate}%`} percent={completionRate} />
          <KpiBar icon={<Activity size={15} />} label="Active workload" value={`${openTasks} open`} percent={assignedTasks ? (openTasks / assignedTasks) * 100 : 0} />
          <KpiBar icon={<CalendarClock size={15} />} label="Schedule coverage" value={`${scheduleCoverage}%`} percent={scheduleCoverage} />
        </div>
      </section>

      {canExec && (
        <section style={{ background: "var(--surface-2)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-3)", padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800 }}>Executive Dashboard</div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>Org-wide KPIs with one-person zoom.</div>
            </div>
            <Select
              value={selectedUser}
              onChange={(e) => setSelectedUserId(e.target.value as UUID)}
              options={users.map((u) => ({ value: u.id, label: u.full_name }))}
              placeholder="Zoom on person"
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 16 }}>
            <MetricCard href="/dashboards/executive" label="Active projects" value={exec.data?.active_projects ?? "..."} tone="in-progress" />
            <MetricCard href="/dashboards/executive" label="Completed" value={exec.data?.completed_projects ?? "..."} tone="completed" />
            <MetricCard href="/dashboards/executive" label="Delayed" value={exec.data?.delayed_projects ?? "..."} tone="delayed" />
            <MetricCard href="/dashboards/executive" label="Blocked" value={exec.data?.blocked_projects ?? "..."} tone="blocked" />
          </div>
          <div className="pmp-two-col-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
            <div style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-2)", overflow: "hidden" }}>
              {rankedPeople.length === 0 ? (
                <EmptyState title="No workload data" hint="Assigned work will appear here." />
              ) : (
                rankedPeople.map((row) => (
                  <button
                    key={row.user_id}
                    type="button"
                    onClick={() => setSelectedUserId(row.user_id)}
                    className="pmp-row"
                    style={{ width: "100%", display: "grid", gridTemplateColumns: "minmax(150px, 1fr) 170px 70px", gap: 12, alignItems: "center", border: "none", borderTop: "1px solid var(--border-subtle)", background: row.user_id === selectedUser ? "var(--surface-2)" : "transparent", color: "inherit", padding: "10px 12px", textAlign: "left", cursor: "pointer" }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <Avatar name={nameOf(row.user_id)} size={24} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13, fontWeight: 700 }}>{nameOf(row.user_id)}</span>
                    </span>
                    <ProgressBar percent={Math.min(100, row.open_tasks * 8 + row.open_blockers * 14)} blocks={10} showLabel={false} />
                    <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-tertiary)", fontSize: 12 }}>{row.open_tasks} open</span>
                  </button>
                ))
              )}
            </div>
            <div style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-2)", padding: 14, background: "var(--surface-2)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}>
                <Avatar name={nameOf(selectedUser)} size={30} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800 }}>{nameOf(selectedUser)}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>8-week KPI zoom</div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                <Stat label="Open tasks" value={selectedWorkload?.open_tasks ?? "—"} />
                <Stat label="In progress" value={selectedWorkload?.in_progress ?? "—"} />
                <Stat label="Open blockers" value={selectedWorkload?.open_blockers ?? "—"} tone={(selectedWorkload?.open_blockers ?? 0) > 0 ? "delayed" : undefined} />
                <Stat label="Tasks completed" value={selectedContribution?.tasks_completed ?? "—"} />
                <Stat label="Status changes" value={selectedContribution?.status_changes ?? "—"} />
                <Stat label="Estimated hours" value={selectedWorkload?.estimated_hours ?? "—"} />
              </div>
            </div>
          </div>
        </section>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))", gap: 20, alignItems: "stretch" }}>
        {/* Pending On Me */}
        <section style={{ background: "var(--surface-2)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-3)", padding: 16, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Pending On Me</div>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--status-delayed)", background: "var(--status-delayed-bg)", borderRadius: "var(--radius-full)", padding: "2px 9px" }}>
              {pendingItems.length}
            </span>
          </div>
          {pending.isLoading ? (
            <Spinner />
          ) : pendingItems.length === 0 ? (
            <EmptyState title="Nothing pending on you" hint="You're all caught up." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {pendingItems.map((p) => {
                const inner = (
                  <>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--status-blocked)", flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--text-tertiary)", flexShrink: 0 }}>
                          {p.kind === "blocker" ? "BLOCK" : "TASK"}
                        </span>
                        <span style={{ fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{p.detail}</div>
                    </div>
                    <PriorityBadge level={p.priority} compact />
                  </>
                );
                const rowStyle: React.CSSProperties = {
                  display: "flex", alignItems: "center", gap: 12, textAlign: "left",
                  border: "none", borderTop: "1px solid var(--border-subtle)", background: "transparent",
                  padding: "11px 6px", borderRadius: 8, cursor: p.project_id ? "pointer" : "default", color: "inherit",
                };
                return p.project_id ? (
                  <Link key={p.id} href={`/projects/${p.project_id}`} className="pmp-row" style={rowStyle}>{inner}</Link>
                ) : (
                  <div key={p.id} className="pmp-row" style={rowStyle}>{inner}</div>
                );
              })}
            </div>
          )}
        </section>

        {/* Personal work summary from the personal dashboard endpoint */}
        <section style={{ background: "var(--surface-2)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-3)", padding: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>My Work Summary</div>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 16 }}>All work currently assigned to you</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 16 }}>
            <Stat label="Assigned tasks" value={assignedTasks} />
            <Stat label="Open tasks" value={openTasks} />
            <Stat label="In progress" value={inProgressTasks} />
            <Stat label="Completed" value={completedTasks} />
            <Stat label="Upcoming deadlines (7d)" value={personalUpcoming} />
            <Stat label="Late tasks" value={personalLate} tone="delayed" />
            <Stat label="Unscheduled open tasks" value={unscheduledOpenTasks} tone={unscheduledOpenTasks > 0 ? "delayed" : undefined} />
            <Stat label="Hours logged" value={personal.data?.hours_logged ?? "—"} />
          </div>
          <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 14 }}>
            Completed work carries {personal.data?.velocity_points_completed ?? 0} estimated point(s). Full trends live in the Executive dashboard.
          </div>
        </section>
      </div>

      {/* At Risk / Blocked Projects */}
      <section style={{ background: "var(--surface-2)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-3)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid var(--border-default)" }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>At Risk / Blocked Projects</div>
          <span style={{ fontSize: 12, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{atRisk.length} projects</span>
        </div>
        {projects.isLoading ? (
          <Spinner />
        ) : atRisk.length === 0 ? (
          <EmptyState title="No at-risk projects" hint="All projects are on track." />
        ) : (
          <>
            <div style={{ overflowX: "auto" }}>
              <div style={{ minWidth: 620 }}>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(200px,1.4fr) 150px 140px 90px", padding: "9px 18px", fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid var(--border-subtle)" }}>
                  <span>Project</span><span>Owner</span><span>Status</span><span>Priority</span>
                </div>
                {atRisk.map((p) => (
                  <Link key={p.id} href={`/projects/${p.id}`} className="pmp-row" style={{ display: "grid", gridTemplateColumns: "minmax(200px,1.4fr) 150px 140px 90px", alignItems: "center", borderBottom: "1px solid var(--border-subtle)", padding: "12px 18px", color: "inherit" }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600 }}>{p.name}</span>
                    <ProductOwner productId={p.product_id} nameOf={nameOf} />
                    <span><StatusChip status={p.health_status} /></span>
                    <span><PriorityBadge level={p.priority} compact /></span>
                  </Link>
                ))}
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "delayed" }) {
  return (
    <div style={{ background: "var(--surface-3)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-2)", padding: 14 }}>
      <div style={{ fontSize: 24, fontWeight: 800, color: tone === "delayed" ? "var(--status-delayed)" : "var(--text-primary)" }}>{value}</div>
      <div style={{ fontSize: 11.5, color: "var(--text-secondary)", marginTop: 2 }}>{label}</div>
    </div>
  );
}

function KpiBar({
  icon,
  label,
  value,
  percent,
  inverted = false,
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
  percent: number;
  inverted?: boolean;
}) {
  const safePercent = Math.max(0, Math.min(100, percent));
  return (
    <div style={{ background: "var(--surface-3)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-2)", padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "var(--text-secondary)", fontWeight: 800 }}>
          {icon}
          {label}
        </span>
        <span style={{ fontSize: 18, fontWeight: 900, color: inverted ? "var(--status-delayed)" : "var(--text-primary)" }}>{value}</span>
      </div>
      <ProgressBar percent={safePercent} blocks={12} showLabel={false} />
    </div>
  );
}

function ProductOwner({ productId, nameOf }: { productId: string; nameOf: (id?: string | null) => string }) {
  const { data } = useQuery({
    queryKey: ["product", productId],
    queryFn: async () => (await import("@/lib/api/projects")).getProduct(productId),
    staleTime: 5 * 60_000,
  });
  const owner = data ? nameOf(data.owner_user_id) : "—";
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)" }}>
      <Avatar name={owner} size={22} />
      {owner}
    </span>
  );
}
