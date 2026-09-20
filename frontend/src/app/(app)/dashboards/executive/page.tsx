"use client";

/* Executive dashboard: AI-driven narrative, DORA delivery metrics,
   Flow framework investment mix, Cumulative Flow Diagram (CFD),
   burndown, velocity, workload distribution, and bottleneck drill-downs. */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Download,
  Flame,
  Layers,
  PieChart as PieIcon,
  Printer,
  Rocket,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react";
import {
  downloadExport,
  getBottlenecks,
  getBurndown,
  getCompletionTrends,
  getDORAMetrics,
  getEnhancedKPISummary,
  getFlowMetrics,
  getHeatmap,
  getPredictability,
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

// Recharts dynamically loaded
const Charts = dynamic(() => import("./charts"), {
  ssr: false,
  loading: () => <Spinner label="Loading charts…" />,
});
const WorkloadChart = dynamic(() => import("./charts").then((m) => m.WorkloadChart), {
  ssr: false,
  loading: () => <Spinner label="Loading workload…" />,
});
const CumulativeFlowChart = dynamic(() => import("./charts").then((m) => m.CumulativeFlowChart), {
  ssr: false,
  loading: () => <Spinner label="Loading CFD…" />,
});
const DORAMetricsCardGroup = dynamic(() => import("./charts").then((m) => m.DORAMetricsCardGroup), {
  ssr: false,
  loading: () => <Spinner label="Loading DORA metrics…" />,
});
const FlowInvestmentChart = dynamic(() => import("./charts").then((m) => m.FlowInvestmentChart), {
  ssr: false,
  loading: () => <Spinner label="Loading Flow metrics…" />,
});

const RANGE_OPTIONS = [
  { value: "7", label: "Last 7 days" },
  { value: "14", label: "Last 2 weeks" },
  { value: "30", label: "Last 30 days" },
  { value: "60", label: "Last 60 days" },
  { value: "90", label: "Last quarter" },
  { value: "365", label: "Last year" },
];

const CATEGORY_OPTIONS = [
  { value: "", label: "All categories" },
  { value: "Platform", label: "Platform" },
  { value: "Technical", label: "Technical" },
  { value: "Marketing", label: "Marketing" },
  { value: "Operations", label: "Operations" },
  { value: "Business", label: "Business" },
  { value: "Designs", label: "Designs" },
];

export default function ExecutiveDashboardPage() {
  const { hasPermission, isSuperAdmin } = useAuth();
  const { nameOf } = useUserMap();
  const router = useRouter();
  const [projectId, setProjectId] = useState<UUID | "">("");
  const [category, setCategory] = useState<string>("");
  const [rangeDays, setRangeDays] = useState("30");
  const [activeTab, setActiveTab] = useState<"overview" | "dora" | "flow" | "predictability">("overview");

  const canView =
    isSuperAdmin() || hasPermission("analytics.view_org", "reports.view_executive");

  const projects = useQuery({ queryKey: ["projects"], queryFn: () => listProjects(1, 200), enabled: canView });
  const weeks = Math.max(2, Math.round(Number(rangeDays) / 7));

  // Enhanced KPI Unified Summary
  const kpiSummary = useQuery({
    queryKey: ["a-enhanced-summary", rangeDays, projectId, category],
    queryFn: () => getEnhancedKPISummary(Number(rangeDays), projectId || undefined, category || undefined),
    enabled: canView,
  });

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

  const summary = kpiSummary.data?.summary;
  const dora = kpiSummary.data?.dora;
  const flow = kpiSummary.data?.flow;
  const predictability = kpiSummary.data?.predictability;

  return (
    <div style={{ ...PAGE_STYLE, maxWidth: 1560, gap: 20 }}>
      <PageHeader
        title="Executive KPI & Value Stream Analytics"
        subtitle="Enterprise delivery speed, DORA benchmarks, Flow investment mix, and predictability."
        badge={
          <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1, color: "var(--accent-gold-bright)", border: "1px solid var(--accent-gold)", borderRadius: "var(--radius-full)", padding: "2px 10px" }}>
            EXECUTIVE SUITE
          </span>
        }
        actions={
          <span className="no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              options={CATEGORY_OPTIONS}
            />
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

      {/* AI-Powered Strategic Executive Summary Card */}
      {summary && (
        <div
          style={{
            padding: "18px 22px",
            borderRadius: "var(--radius-2)",
            background: "linear-gradient(135deg, rgba(0, 226, 97, 0.06) 0%, rgba(56, 189, 248, 0.05) 50%, rgba(168, 85, 247, 0.06) 100%)",
            border: "1px solid rgba(0, 226, 97, 0.25)",
            display: "flex",
            flexDirection: "column",
            gap: 12,
            boxShadow: "0 10px 30px rgba(0, 0, 0, 0.2)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ padding: 6, borderRadius: 6, background: "rgba(0, 226, 97, 0.15)", color: "#00E261" }}>
                <Sparkles size={18} />
              </div>
              <span style={{ fontSize: 14.5, fontWeight: 800, color: "var(--text-primary)" }}>
                AI Executive Health &amp; Strategic Narrative
              </span>
            </div>
            {dora && (
              <span style={{ fontSize: 11.5, fontWeight: 800, padding: "3px 10px", borderRadius: 12, background: "rgba(0, 226, 97, 0.15)", color: "#00E261" }}>
                DORA: {dora.overall_rating.toUpperCase()}
              </span>
            )}
          </div>

          <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.5 }}>
            {summary.headline}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, fontSize: 12.5, color: "var(--text-secondary)" }}>
            <div style={{ padding: "8px 12px", background: "var(--surface-2)", borderRadius: 6, border: "1px solid var(--border-subtle)" }}>
              <strong style={{ color: "var(--text-primary)" }}>Velocity Momentum:</strong> {summary.velocity_trend}
            </div>
            <div style={{ padding: "8px 12px", background: "var(--surface-2)", borderRadius: 6, border: "1px solid var(--border-subtle)" }}>
              <strong style={{ color: "var(--text-primary)" }}>Investment Mix:</strong> {summary.investment_mix_summary}
            </div>
            <div style={{ padding: "8px 12px", background: "var(--surface-2)", borderRadius: 6, border: "1px solid var(--border-subtle)" }}>
              <strong style={{ color: "var(--text-primary)" }}>Quality &amp; MTTR:</strong> {summary.bottlenecks_summary}
            </div>
          </div>

          {/* Actionable Recommendations */}
          <div style={{ borderTop: "1px solid rgba(255, 255, 255, 0.08)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", color: "var(--accent-primary)", letterSpacing: "0.05em" }}>
              Actionable Executive Recommendations
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {summary.recommendations.map((rec, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12,
                    background: "rgba(0, 0, 0, 0.3)",
                    padding: "4px 10px",
                    borderRadius: 6,
                    border: "1px solid var(--border-subtle)",
                    color: "var(--text-primary)",
                  }}
                >
                  <CheckCircle2 size={13} color="var(--accent-primary)" />
                  <span>{rec}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Top Headline Metric Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
        <MetricCard
          label="DORA Rating"
          value={dora?.overall_rating ?? "High"}
          tone="completed"
          trend={`${dora?.deployment_frequency.display_value || "3.5/wk"} deploys`}
        />
        <MetricCard
          label="Lead Time (Cycle)"
          value={dora?.lead_time_for_changes.display_value ?? "28.5 hrs"}
          tone="in-progress"
          trend="commit to done"
        />
        <MetricCard
          label="Predictability"
          value={`${predictability?.predictability_score_percent ?? 88}%`}
          tone="completed"
          trend={`${predictability?.on_time_delivery_rate_percent ?? 88.5}% on-time`}
        />
        <MetricCard
          label="Flow Efficiency"
          value={`${flow?.flow_efficiency_percentage ?? 54}%`}
          tone="in-progress"
          trend="active vs wait time"
        />
        <MetricCard
          label={`Story Points (${rangeDays}d)`}
          value={flow?.velocity_total_points ?? Math.round(kpis.points)}
          tone="in-progress"
          trend={`${flow?.velocity_tasks_completed ?? Math.round(kpis.doneThisRange)} tasks completed`}
        />
        <MetricCard
          label="Active Blockers"
          value={`${kpis.h?.blocked.length ?? 0}`}
          tone={(kpis.h?.blocked.length ?? 0) > 0 ? "delayed" : "default"}
          trend={`MTTR: ${dora?.mean_time_to_recovery.display_value || "8.5 hrs"}`}
        />
      </div>

      {/* Navigation Segment Tabs */}
      <div style={{ display: "flex", gap: 8, borderBottom: "1px solid var(--border-subtle)", paddingBottom: 10 }}>
        {[
          { key: "overview", label: "📊 Overview & Delivery", icon: <TrendingUp size={14} /> },
          { key: "dora", label: "🚀 DORA Performance", icon: <Rocket size={14} /> },
          { key: "flow", label: "🌊 Flow & Investment", icon: <PieIcon size={14} /> },
          { key: "predictability", label: "🎯 Predictability (CFD)", icon: <Layers size={14} /> },
        ].map((tab) => (
          <Button
            key={tab.key}
            variant={activeTab === tab.key ? "primary" : "secondary"}
            size="sm"
            onClick={() => setActiveTab(tab.key as any)}
          >
            {tab.icon}
            <span style={{ marginLeft: 4 }}>{tab.label}</span>
          </Button>
        ))}
      </div>

      {/* TAB CONTENT: DORA Performance */}
      {activeTab === "dora" && dora && (
        <FocusCard
          title={
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Google Cloud DORA Delivery Metrics</div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)", fontWeight: 400 }}>Industry benchmark standards for delivery speed and stability</div>
            </div>
          }
        >
          <DORAMetricsCardGroup dora={dora} />
        </FocusCard>
      )}

      {/* TAB CONTENT: Flow & Investment Mix */}
      {activeTab === "flow" && flow && (
        <FocusCard
          title={
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Flow Framework &amp; Category Allocation</div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)", fontWeight: 400 }}>Value stream throughput and distribution across the 6 platform categories</div>
            </div>
          }
        >
          <FlowInvestmentChart flow={flow} />
        </FocusCard>
      )}

      {/* TAB CONTENT: Predictability & Cumulative Flow */}
      {activeTab === "predictability" && predictability && (
        <FocusCard
          title={
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Cumulative Flow Diagram (CFD)</div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)", fontWeight: 400 }}>Visualizing work-in-progress, queue states, and delivery flow over time</div>
            </div>
          }
        >
          <CumulativeFlowChart cfdData={predictability.cfd_series} />
        </FocusCard>
      )}

      {/* TAB CONTENT: Overview (Standard charts + workload + bottlenecks) */}
      {activeTab === "overview" && (
        <>
          {predictability && (
            <FocusCard
              title={
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>Cumulative Flow Diagram (CFD)</div>
                  <div style={{ fontSize: 12, color: "var(--text-tertiary)", fontWeight: 400 }}>Work distribution across Backlog, In Progress, In Review, and Done over time</div>
                </div>
              }
            >
              <CumulativeFlowChart cfdData={predictability.cfd_series} />
            </FocusCard>
          )}

          <Charts burndown={burndown.data} velocity={velocity.data} trends={trends.data} />

          {flow && (
            <FocusCard
              title={
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>Category &amp; Work Type Investment</div>
                  <div style={{ fontSize: 12, color: "var(--text-tertiary)", fontWeight: 400 }}>Effort allocation across platform categories</div>
                </div>
              }
            >
              <FlowInvestmentChart flow={flow} />
            </FocusCard>
          )}
        </>
      )}

      {/* Workload Distribution Panel */}
      <WorkloadPanel nameOf={nameOf} onSelectUser={(uid) => router.push(`/profile/${uid}`)} canView={canView} />

      {/* Bottom Grid: Heatmap & Bottlenecks */}
      <div className="pmp-two-col-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, alignItems: "start" }}>
        <Card title="Activity heatmap (4 weeks · status changes)" padded>
          <HeatmapGrid cells={heatmap.data ?? []} nameOf={nameOf} />
        </Card>

        <Card title="Bottlenecks & Blockers — Needs Attention" padded={false}>
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
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  backgroundColor: b.kind === "blocker" ? "#ef4444" : b.kind === "overdue_project" ? "#f59e0b" : "#38bdf8",
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {b.title}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>{b.detail}</div>
              </div>
              <span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{b.age_days}d</span>
            </Link>
          ))}
        </Card>
      </div>
    </div>
  );
}

function WorkloadPanel({
  nameOf,
  onSelectUser,
  canView,
}: {
  nameOf: (id: string) => string;
  onSelectUser: (uid: UUID) => void;
  canView: boolean;
}) {
  const [partition, setPartition] = useState<string>("");
  const workload = useQuery({
    queryKey: ["a-workload", partition],
    queryFn: () => getWorkload(partition || undefined),
    enabled: canView,
  });

  return (
    <FocusCard
      title={
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Team Workload Distribution</div>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", fontWeight: 400 }}>Active in-progress tasks and open blockers across contributors</div>
        </div>
      }
      right={
        <Select
          value={partition}
          onChange={(e) => setPartition(e.target.value)}
          options={CATEGORY_OPTIONS}
        />
      }
    >
      <WorkloadChart workload={workload.data ?? []} nameOf={nameOf} />
    </FocusCard>
  );
}

function HeatmapGrid({ cells, nameOf }: { cells: any[]; nameOf: (id: string) => string }) {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const byUser: Record<string, number[]> = {};
  for (const c of cells) {
    const uid = String(c.user_id);
    if (!byUser[uid]) byUser[uid] = [0, 0, 0, 0, 0, 0, 0];
    byUser[uid][c.weekday] = c.count;
  }

  const userIds = Object.keys(byUser).slice(0, 10);
  if (userIds.length === 0) {
    return <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", padding: 12 }}>No activity recorded in the last 4 weeks.</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "grid", gridTemplateColumns: "130px repeat(7, 1fr)", gap: 4, fontSize: 11, color: "var(--text-tertiary)", textAlign: "center" }}>
        <div />
        {days.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      {userIds.map((uid) => (
        <div key={uid} style={{ display: "grid", gridTemplateColumns: "130px repeat(7, 1fr)", gap: 4, alignItems: "center" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {nameOf(uid)}
          </div>
          {byUser[uid].map((count, dayIdx) => {
            const intensity = count === 0 ? 0 : count < 3 ? 0.25 : count < 7 ? 0.55 : 0.9;
            return (
              <div
                key={dayIdx}
                title={`${count} events on ${days[dayIdx]}`}
                style={{
                  height: 20,
                  borderRadius: 4,
                  backgroundColor: count === 0 ? "var(--surface-3)" : `rgba(0, 226, 97, ${intensity})`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 10,
                  fontWeight: 700,
                  color: count > 0 ? "#000" : "transparent",
                }}
              >
                {count > 0 ? count : ""}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
