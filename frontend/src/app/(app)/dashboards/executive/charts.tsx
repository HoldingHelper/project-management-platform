"use client";

/* Recharts chart panel for the executive dashboard. Kept in its own chunk
   (next/dynamic) so the chart library loads lazily. Colors come from the
   validated --chart-N tokens; grids/axes are recessive; every chart has a
   hover tooltip and a single y-axis. */

import React from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Cpu,
  Layers,
  PieChart as PieIcon,
  Rocket,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { FocusCard } from "@/components/ds";
import type {
  BurndownReport,
  CFDPoint,
  CategoryDistributionItem,
  CompletionTrends,
  DORAMetricsReport,
  FlowMetricsReport,
  PredictabilityReport,
  VelocityReport,
  WorkloadRow,
} from "@/lib/api/analytics";

const C1 = "var(--chart-1)";
const C2 = "var(--chart-2)";
const C3 = "var(--chart-3)";
const C4 = "var(--chart-4)";
const C5 = "var(--chart-5)";
const GRID = "var(--chart-grid)";
const INK = "var(--text-secondary)";

const CATEGORY_COLORS: Record<string, string> = {
  Technical: "#38bdf8",
  Platform: "#00E261",
  Marketing: "#f59e0b",
  Operations: "#a855f7",
  Business: "#ec4899",
  Designs: "#06b6d4",
};

const tooltipStyle: React.CSSProperties = {
  background: "rgba(18, 21, 28, 0.94)",
  backdropFilter: "blur(14px)",
  border: "1px solid var(--border-strong)",
  borderRadius: 8,
  padding: "8px 12px",
  fontSize: 12,
  color: "var(--text-primary)",
  boxShadow: "0 12px 32px rgba(0, 0, 0, 0.5)",
};

const axisProps = {
  stroke: "transparent",
  tick: { fill: INK, fontSize: 11 },
  tickLine: false,
} as const;

function shortLabel(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function compactName(name: string) {
  return name.length > 18 ? `${name.slice(0, 16)}…` : name;
}

// ============================================================================
// Cumulative Flow Diagram (CFD)
// ============================================================================
export function CumulativeFlowChart({
  cfdData,
}: {
  cfdData?: CFDPoint[];
}) {
  const data = (cfdData ?? []).map((p) => ({
    date: shortLabel(p.date),
    Done: p.done,
    "In Review": p.in_review,
    "In Progress": p.in_progress,
    Backlog: p.backlog,
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 12, right: 26, bottom: 8, left: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="date" {...axisProps} interval="preserveStartEnd" />
        <YAxis {...axisProps} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 6 }} />
        <Area type="monotone" dataKey="Done" stackId="1" stroke="#10b981" fill="#10b981" fillOpacity={0.7} />
        <Area type="monotone" dataKey="In Review" stackId="1" stroke="#a855f7" fill="#a855f7" fillOpacity={0.7} />
        <Area type="monotone" dataKey="In Progress" stackId="1" stroke="#38bdf8" fill="#38bdf8" fillOpacity={0.7} />
        <Area type="monotone" dataKey="Backlog" stackId="1" stroke="#64748b" fill="#64748b" fillOpacity={0.7} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ============================================================================
// DORA Metrics Visual Cards
// ============================================================================
export function DORAMetricsCardGroup({ dora }: { dora: DORAMetricsReport }) {
  const ratingBadge = (rating: string) => {
    const isElite = rating === "Elite";
    const isHigh = rating === "High";
    const bg = isElite ? "rgba(0, 226, 97, 0.15)" : isHigh ? "rgba(56, 189, 248, 0.15)" : "rgba(245, 158, 11, 0.15)";
    const color = isElite ? "#00E261" : isHigh ? "#38bdf8" : "#f59e0b";
    return (
      <span style={{ fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 4, background: bg, color }}>
        {rating.toUpperCase()}
      </span>
    );
  };

  const metrics = [
    {
      label: "Deployment Frequency",
      value: dora.deployment_frequency.display_value,
      rating: dora.deployment_frequency.rating,
      benchmark: dora.deployment_frequency.benchmark,
      icon: <Rocket size={18} color="#00E261" />,
    },
    {
      label: "Lead Time for Changes",
      value: dora.lead_time_for_changes.display_value,
      rating: dora.lead_time_for_changes.rating,
      benchmark: dora.lead_time_for_changes.benchmark,
      icon: <Clock size={18} color="#38bdf8" />,
    },
    {
      label: "Change Failure Rate",
      value: dora.change_failure_rate.display_value,
      rating: dora.change_failure_rate.rating,
      benchmark: dora.change_failure_rate.benchmark,
      icon: <AlertTriangle size={18} color="#f59e0b" />,
    },
    {
      label: "Mean Time to Restore (MTTR)",
      value: dora.mean_time_to_recovery.display_value,
      rating: dora.mean_time_to_recovery.rating,
      benchmark: dora.mean_time_to_recovery.benchmark,
      icon: <Activity size={18} color="#a855f7" />,
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 4 DORA Gauges Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
        {metrics.map((m, idx) => (
          <div
            key={idx}
            style={{
              padding: 16,
              borderRadius: "var(--radius-2)",
              background: "var(--surface-2)",
              border: "1px solid var(--border-subtle)",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {m.icon}
                <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)" }}>{m.label}</span>
              </div>
              {ratingBadge(m.rating)}
            </div>

            <div style={{ fontSize: 24, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
              {m.value}
            </div>

            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: "auto" }}>
              Benchmark: {m.benchmark}
            </div>
          </div>
        ))}
      </div>

      {/* Lead Time Breakdown */}
      {dora.lead_time_breakdown_hours && (
        <div style={{ padding: "12px 16px", borderRadius: "var(--radius-2)", background: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 10 }}>
            CYCLE TIME COMPOSITION (MEDIAN {dora.lead_time_for_changes.display_value})
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, textAlign: "center" }}>
            <div style={{ padding: "8px 12px", borderRadius: 6, background: "rgba(56, 189, 248, 0.08)", border: "1px solid rgba(56, 189, 248, 0.2)" }}>
              <div style={{ fontSize: 11, color: "#38bdf8", fontWeight: 600 }}>Coding & Commit</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginTop: 4 }}>
                {dora.lead_time_breakdown_hours.coding ?? 12}h
              </div>
            </div>
            <div style={{ padding: "8px 12px", borderRadius: 6, background: "rgba(168, 85, 247, 0.08)", border: "1px solid rgba(168, 85, 247, 0.2)" }}>
              <div style={{ fontSize: 11, color: "#a855f7", fontWeight: 600 }}>PR & Code Review</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginTop: 4 }}>
                {dora.lead_time_breakdown_hours.review ?? 8}h
              </div>
            </div>
            <div style={{ padding: "8px 12px", borderRadius: 6, background: "rgba(0, 226, 97, 0.08)", border: "1px solid rgba(0, 226, 97, 0.2)" }}>
              <div style={{ fontSize: 11, color: "#00E261", fontWeight: 600 }}>CI/CD & Verify</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginTop: 4 }}>
                {dora.lead_time_breakdown_hours.deploy_verify ?? 6}h
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Flow Distribution & Investment Mix
// ============================================================================
export function FlowInvestmentChart({ flow }: { flow: FlowMetricsReport }) {
  const typeData = [
    { name: "Features", value: flow.velocity_by_type.features_percent, color: "#00E261" },
    { name: "Defects", value: flow.velocity_by_type.defects_percent, color: "#ef4444" },
    { name: "Tech Debt", value: flow.velocity_by_type.tech_debt_percent, color: "#f59e0b" },
    { name: "Infra/Sec", value: flow.velocity_by_type.infra_percent, color: "#38bdf8" },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      {/* Category Allocation */}
      <div style={{ padding: 16, borderRadius: "var(--radius-2)", background: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 12 }}>
          Department & Category Allocation
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {flow.category_distribution.map((cat) => (
            <div key={cat.category} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{cat.category}</span>
                <span style={{ color: "var(--text-secondary)" }}>{cat.percentage}% ({cat.points} pts)</span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: "var(--surface-3)", overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${cat.percentage}%`,
                    backgroundColor: CATEGORY_COLORS[cat.category] || "#38bdf8",
                    borderRadius: 3,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Work Item Type Distribution */}
      <div style={{ padding: 16, borderRadius: "var(--radius-2)", background: "var(--surface-2)", border: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 12 }}>
          Flow Item Distribution (Work Types)
        </div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie
                data={typeData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={70}
                paddingAngle={4}
              >
                {typeData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Core Executive Charts & Workload
// ============================================================================
export default function ExecutiveCharts({
  burndown,
  velocity,
  trends,
}: {
  burndown?: BurndownReport;
  velocity?: VelocityReport;
  trends?: CompletionTrends;
}) {
  const burndownData = (burndown?.days ?? []).map((p) => ({ label: shortLabel(p.label), open: p.value }));
  const velocityData = (velocity?.weeks ?? []).map((p, i) => ({
    label: shortLabel(p.label),
    points: p.value,
    tasks: velocity?.tasks_done[i]?.value ?? 0,
  }));
  const trendData = (trends?.created ?? []).map((p, i) => ({
    label: shortLabel(p.label),
    created: p.value,
    completed: trends?.completed[i]?.value ?? 0,
  }));

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <FocusCard
        title={
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>Sprint Burndown</div>
            <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", fontWeight: 400 }}>Remaining open tasks over time</div>
          </div>
        }
      >
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={burndownData} margin={{ top: 12, right: 26, bottom: 8, left: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" />
            <YAxis {...axisProps} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Area type="monotone" dataKey="open" name="Open tasks" stroke={C1} strokeWidth={2} fill={C1} fillOpacity={0.14} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </FocusCard>

      <FocusCard
        title={
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>Weekly Velocity</div>
            <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", fontWeight: 400 }}>Story points and delivered tasks</div>
          </div>
        }
      >
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={velocityData} margin={{ top: 12, right: 26, bottom: 8, left: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" />
            <YAxis {...axisProps} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 6 }} />
            <Bar dataKey="points" name="Story points" fill="#38bdf8" radius={[4, 4, 0, 0]} />
            <Bar dataKey="tasks" name="Tasks completed" fill="#00E261" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </FocusCard>
    </div>
  );
}

export function WorkloadChart({
  workload,
  nameOf,
}: {
  workload: WorkloadRow[];
  nameOf: (id: string) => string;
}) {
  const data = workload.map((w) => ({
    name: compactName(nameOf(String(w.user_id))),
    "In progress": w.in_progress,
    "Open tasks": w.open_tasks,
    "Open blockers": w.open_blockers,
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, bottom: 8, left: 40 }}>
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis type="number" {...axisProps} allowDecimals={false} />
        <YAxis dataKey="name" type="category" {...axisProps} width={110} />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 6 }} />
        <Bar dataKey="In progress" fill="#38bdf8" stackId="a" radius={[0, 0, 0, 0]} />
        <Bar dataKey="Open tasks" fill="#64748b" stackId="a" radius={[0, 0, 0, 0]} />
        <Bar dataKey="Open blockers" fill="#ef4444" stackId="a" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
