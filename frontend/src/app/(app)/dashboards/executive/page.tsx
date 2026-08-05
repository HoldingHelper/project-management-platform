"use client";

/* Executive dashboard: KPI row, burndown, velocity, completion trends,
   workload distribution, activity heatmap and a bottleneck drill-down —
   all filterable, exportable (CSV / Excel / print-to-PDF). */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { Download, Printer } from "lucide-react";
import {
  downloadExport,
  getBottlenecks,
  getBurndown,
  getCompletionTrends,
  getHeatmap,
  getProjectHealth,
  getVelocity,
  getWorkload,
} from "@/lib/api/analytics";
import { listProjects } from "@/lib/api/projects";
import { Alert, Avatar, Button, Card, FocusCard, MetricCard, Select } from "@/components/ds";
import { PageHeader, PAGE_STYLE, Spinner } from "@/components/ui/States";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useUserMap } from "@/lib/hooks";
import type { UUID } from "@/lib/types";

// Recharts is heavy; load it client-side only, after the shell paints.
const Charts = dynamic(() => import("./charts"), {
  ssr: false,
  loading: () => <Spinner label="Loading charts…" />,
});
const WorkloadChart = dynamic(() => import("./charts").then((m) => m.WorkloadChart), {
  ssr: false,
  loading: () => <Spinner label="Loading chart…" />,
});

const RANGE_OPTIONS = [
  { value: "14", label: "Last 2 weeks" },
  { value: "30", label: "Last 30 days" },
  { value: "60", label: "Last 60 days" },
  { value: "90", label: "Last quarter" },
];

const PARTITION_OPTIONS = [
  { value: "", label: "All partitions" },
  { value: "business", label: "Business" },
  { value: "tech", label: "Tech" },
  { value: "operations", label: "Operations" },
  { value: "marketing", label: "Marketing" },
  { value: "sales", label: "Sales" },
];

export default function ExecutiveDashboardPage() {
  const { hasPermission, isSuperAdmin } = useAuth();
  const { nameOf } = useUserMap();
  const router = useRouter();
  const [projectId, setProjectId] = useState<UUID | "">("");
  const [rangeDays, setRangeDays] = useState("30");

  const canView =
    isSuperAdmin() || hasPermission("analytics.view_org", "reports.view_executive");

  const projects = useQuery({ queryKey: ["projects"], queryFn: () => listProjects(1, 200), enabled: canView });
  const weeks = Math.max(2, Math.round(Number(rangeDays) / 7));

  const burndown = useQuery({
    queryKey: ["a-burndown", rangeDays, projectId],
    queryFn: () => getBurndown(Number(rangeDays), projectId || undefined),
    enabled: canView,
  });
  const velocity = useQuery({
    queryKey: ["a-velocity", weeks, projectId],
    queryFn: () => getVelocity(weeks, projectId || undefined),
    enabled: canView,
  });
  const trends = useQuery({
    queryKey: ["a-trends", weeks, projectId],
    queryFn: () => getCompletionTrends(Math.max(8, weeks), projectId || undefined),
    enabled: canView,
  });
  const heatmap = useQuery({ queryKey: ["a-heatmap"], queryFn: () => getHeatmap(4), enabled: canView });
  const bottlenecks = useQuery({ queryKey: ["a-bottlenecks"], queryFn: () => getBottlenecks(), enabled: canView });
  const health = useQuery({ queryKey: ["a-health"], queryFn: getProjectHealth, enabled: canView });

  const kpis = useMemo(() => {
    const h = health.data;
    const doneThisRange = (velocity.data?.tasks_done ?? []).reduce((s, p) => s + p.value, 0);
    const points = (velocity.data?.weeks ?? []).reduce((s, p) => s + p.value, 0);
    const openNow = burndown.data?.days.at(-1)?.value ?? 0;
    return { h, doneThisRange, points, openNow };
  }, [health.data, velocity.data, burndown.data]);

  if (!canView) {
    return (
      <div style={PAGE_STYLE}>
        <PageHeader title="Executive Dashboard" />
        <Alert kind="warning" title="No access" description="This dashboard is for executives and managers (analytics access required)." />
      </div>
    );
  }

  return (
    <div style={{ ...PAGE_STYLE, maxWidth: 1500 }}>
      <PageHeader
        title="Executive Dashboard"
        subtitle="Organization-wide delivery health, velocity and bottlenecks."
        badge={
          <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1, color: "var(--accent-gold-bright)", border: "1px solid var(--accent-gold)", borderRadius: "var(--radius-full)", padding: "2px 10px" }}>
            C-LEVEL
          </span>
        }
        actions={
          <span className="no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value as UUID)}
              placeholder="All projects"
              options={(projects.data?.items ?? []).map((p) => ({ value: p.id, label: p.name }))}
            />
            <Select
              value={rangeDays}
              onChange={(e) => setRangeDays(e.target.value)}
              options={RANGE_OPTIONS}
            />
            <Button variant="secondary" onClick={() => downloadExport("velocity", "csv", { weeks: String(weeks) })}>
              <Download size={14} /> CSV
            </Button>
            <Button variant="secondary" onClick={() => downloadExport("workload", "xlsx")}>
              <Download size={14} /> Excel
            </Button>
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer size={14} /> PDF
            </Button>
          </span>
        }
      />

      {/* KPI row — gold accents reserved for the headline figures */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
        <MetricCard label="Active projects" value={kpis.h?.active ?? "—"} tone="in-progress" />
        <MetricCard label="Completed projects" value={kpis.h?.completed ?? "—"} tone="completed" />
        <MetricCard label="Open tasks now" value={Math.round(kpis.openNow)} />
        <MetricCard label={`Tasks done (${rangeDays}d)`} value={Math.round(kpis.doneThisRange)} />
        <MetricCard label={`Story points (${rangeDays}d)`} value={Math.round(kpis.points)} />
        <MetricCard
          label="Delayed / blocked"
          value={`${kpis.h?.delayed.length ?? 0} / ${kpis.h?.blocked.length ?? 0}`}
          tone={(kpis.h?.delayed.length ?? 0) + (kpis.h?.blocked.length ?? 0) > 0 ? "delayed" : "default"}
        />
      </div>

      <Charts burndown={burndown.data} velocity={velocity.data} trends={trends.data} />

      <WorkloadPanel nameOf={nameOf} onSelectUser={(uid) => router.push(`/profile/${uid}`)} canView={canView} />

      <div className="pmp-two-col-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, alignItems: "start" }}>
        <Card title="Activity heatmap (4 weeks · status changes)" padded>
          <HeatmapGrid cells={heatmap.data ?? []} nameOf={nameOf} />
        </Card>

        <Card title="Bottlenecks — needs attention" padded={false}>
          {(bottlenecks.data ?? []).length === 0 && (
            <div style={{ padding: 18, fontSize: 12.5, color: "var(--text-tertiary)" }}>No bottlenecks right now.</div>
          )}
          {(bottlenecks.data ?? []).slice(0, 10).map((b) => (
            <Link
              key={`${b.kind}-${b.id}`}
              href={
                b.kind === "overdue_project"
                  ? `/projects/${b.id}`
                  : b.task_id
                    ? `/tasks/${b.task_id}`
                    : "/tasks"
              }
              className="pmp-row"
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 16px", borderBottom: "1px solid var(--border-subtle)" }}
            >
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  padding: "2px 8px",
                  borderRadius: "var(--radius-full)",
                  background: b.kind === "blocker" ? "var(--status-blocked-bg)" : "var(--status-delayed-bg)",
                  color: b.kind === "blocker" ? "var(--status-blocked)" : "var(--status-delayed)",
                  flexShrink: 0,
                }}
              >
                {b.kind.replace("_", " ")}
              </span>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {b.title}
              </span>
              <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", flexShrink: 0 }}>{b.detail}</span>
            </Link>
          ))}
        </Card>
      </div>

      {(kpis.h?.delayed.length || kpis.h?.blocked.length) ? (
        <Card title="Delayed & blocked projects" padded={false}>
          {[...(kpis.h?.delayed ?? []).map((p) => ({ ...p, kind: "Delayed" })), ...(kpis.h?.blocked ?? []).map((p) => ({ ...p, kind: "Blocked" }))].map((p) => (
            <Link
              key={p.id}
              href={`/projects/${p.id}`}
              className="pmp-row"
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 16px", borderBottom: "1px solid var(--border-subtle)" }}
            >
              <span style={{ fontSize: 11, color: p.kind === "Delayed" ? "var(--status-delayed)" : "var(--status-blocked)", fontWeight: 700, width: 64 }}>
                {p.kind}
              </span>
              <span style={{ flex: 1, fontWeight: 600, fontSize: 13.5 }}>{p.name}</span>
              <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
                {Math.round(p.progress)}%
              </span>
            </Link>
          ))}
        </Card>
      ) : null}
    </div>
  );
}

/* Workload distribution: collapsed shows the top 10; fullscreen shows everyone
   and adds a partition filter. Names are clickable → the person's profile. */
function WorkloadPanel({
  nameOf,
  onSelectUser,
  canView,
}: {
  nameOf: (id?: string | null) => string;
  onSelectUser: (userId: string) => void;
  canView: boolean;
}) {
  const [partition, setPartition] = useState("");
  const workload = useQuery({
    queryKey: ["a-workload", partition],
    queryFn: () => getWorkload(partition || undefined),
    enabled: canView,
  });

  const partitionSelect = (
    <Select
      value={partition}
      onChange={(e) => setPartition(e.target.value)}
      options={PARTITION_OPTIONS}
      aria-label="Filter workload by partition"
    />
  );

  return (
    <FocusCard
        title="Workload distribution — top 10"
        right={<span className="no-print">{partitionSelect}</span>}
        focusChildren={
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>{partitionSelect}</div>
            <WorkloadChart
              workload={workload.data}
              nameOf={nameOf}
              onSelectUser={onSelectUser}
              height={560}
              focused
            />
          </div>
        }
      >
        <WorkloadChart
          workload={workload.data}
          nameOf={nameOf}
          onSelectUser={onSelectUser}
          height={280}
          limit={10}
        />
      </FocusCard>
  );
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function HeatmapGrid({
  cells,
  nameOf,
}: {
  cells: { user_id: UUID; weekday: number; count: number }[];
  nameOf: (id?: string | null) => string;
}) {
  const users = Array.from(new Set(cells.map((c) => c.user_id)));
  const byKey = new Map(cells.map((c) => [`${c.user_id}-${c.weekday}`, c.count]));
  const max = Math.max(1, ...cells.map((c) => c.count));

  if (users.length === 0) {
    return <div style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>No activity recorded yet.</div>;
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "separate", borderSpacing: 3, fontSize: 11.5 }}>
        <thead>
          <tr>
            <th />
            {WEEKDAYS.map((d) => (
              <th key={d} style={{ color: "var(--text-tertiary)", fontWeight: 600, padding: "0 2px" }}>{d}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {users.map((uid) => (
            <tr key={uid}>
              <td style={{ paddingRight: 8, whiteSpace: "nowrap" }}>
                <Link
                  href={`/profile/${uid}`}
                  className="pmp-row"
                  title={`Open ${nameOf(uid)}'s profile`}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--text-secondary)" }}
                >
                  <Avatar name={nameOf(uid)} size={18} />
                  <span>{nameOf(uid)}</span>
                </Link>
              </td>
              {WEEKDAYS.map((_, wd) => {
                const count = byKey.get(`${uid}-${wd}`) ?? 0;
                // Sequential single-hue ramp (denim), light→dark by magnitude.
                const alpha = count === 0 ? 0.06 : 0.2 + 0.8 * (count / max);
                return (
                  <td key={wd}>
                    <span
                      title={`${nameOf(uid)} · ${WEEKDAYS[wd]}: ${count} change(s)`}
                      style={{
                        display: "block",
                        width: 26,
                        height: 20,
                        borderRadius: 4,
                        background: `color-mix(in srgb, var(--chart-1) ${Math.round(alpha * 100)}%, transparent)`,
                      }}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
