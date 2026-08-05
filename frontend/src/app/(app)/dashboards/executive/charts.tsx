"use client";

/* Recharts chart panel for the executive dashboard. Kept in its own chunk
   (next/dynamic) so the chart library loads lazily. Colors come from the
   validated --chart-N tokens; grids/axes are recessive; every chart has a
   hover tooltip and a single y-axis. */

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { FocusCard } from "@/components/ds";
import type {
  BurndownReport,
  CompletionTrends,
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

const tooltipStyle: React.CSSProperties = {
  background: "var(--surface-2)",
  border: "1px solid var(--border-default)",
  borderRadius: 10,
  fontSize: 12,
  color: "var(--text-primary)",
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

function hasUsefulTrend(values: number[]) {
  const nonZero = values.filter((value) => value > 0).length;
  const distinct = new Set(values).size;
  return values.length >= 3 && nonZero >= 2 && distinct >= 2;
}

function looksBackfilled(values: number[]) {
  if (values.length < 5) return false;
  const beforeTail = values.slice(0, -2);
  const tail = values.slice(-2);
  return beforeTail.every((value) => value === 0) && tail.some((value) => value > 0);
}

function ChartNotice({ title, detail }: { title: string; detail: string }) {
  return (
    <div
      style={{
        minHeight: 220,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 6,
        padding: 24,
        border: "1px dashed var(--border-default)",
        borderRadius: "var(--radius-2)",
        background: "var(--surface-2)",
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 800 }}>{title}</div>
      <div style={{ maxWidth: 560, fontSize: 13, lineHeight: 1.55, color: "var(--text-secondary)" }}>{detail}</div>
    </div>
  );
}

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
  const burndownValues = burndownData.map((point) => point.open);
  const velocityValues = velocityData.map((point) => point.points + point.tasks);
  const trendValues = trendData.map((point) => point.created + point.completed);

  const burndownChart = (height: number) => (
    looksBackfilled(burndownValues) || !hasUsefulTrend(burndownValues) ? (
      <ChartNotice
        title="Not enough historical task data"
        detail="Open tasks exist, but the selected range does not contain enough day-by-day movement to read as a burndown trend yet."
      />
    ) : (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={burndownData} margin={{ top: 12, right: 26, bottom: 8, left: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" />
        <YAxis {...axisProps} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: INK, strokeDasharray: "3 3" }} />
        <Area type="monotone" dataKey="open" name="Open tasks" stroke={C1} strokeWidth={2} fill={C1} fillOpacity={0.14} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
    )
  );

  const velocityChart = (height: number) => (
    !hasUsefulTrend(velocityValues) ? (
      <ChartNotice
        title="Velocity needs more completed work"
        detail="This view will show weekly throughput after multiple weeks have completed tasks or story points."
      />
    ) : (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={velocityData} margin={{ top: 12, right: 26, bottom: 8, left: 0 }} barGap={2}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" />
        <YAxis {...axisProps} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: GRID }} />
        <Legend wrapperStyle={{ fontSize: 12, color: INK }} />
        <Bar dataKey="points" name="Story points" fill={C1} radius={[4, 4, 0, 0]} maxBarSize={26} />
        <Bar dataKey="tasks" name="Tasks done" fill={C4} radius={[4, 4, 0, 0]} maxBarSize={26} />
      </BarChart>
    </ResponsiveContainer>
    )
  );

  const trendChart = (height: number) => (
    looksBackfilled(trendValues) || !hasUsefulTrend(trendValues) ? (
      <ChartNotice
        title="No reliable completion trend yet"
        detail="Created and completed counts are too sparse in this range, so the dashboard is holding the trend line until there is enough signal."
      />
    ) : (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={trendData} margin={{ top: 12, right: 26, bottom: 8, left: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" />
        <YAxis {...axisProps} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: INK, strokeDasharray: "3 3" }} />
        <Legend wrapperStyle={{ fontSize: 12, color: INK }} />
        <Line type="monotone" dataKey="created" name="Created" stroke={C2} strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="completed" name="Completed" stroke={C5} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
    )
  );

  return (
    <>
      <div className="pmp-two-col-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <FocusCard title="Burndown — open tasks" focusChildren={burndownChart(560)}>
          {burndownChart(260)}
        </FocusCard>

        <FocusCard title="Velocity — per week" focusChildren={velocityChart(560)}>
          {velocityChart(260)}
        </FocusCard>
      </div>

      <FocusCard title="Completion trend — created vs completed" focusChildren={trendChart(560)}>
        {trendChart(260)}
      </FocusCard>
    </>
  );
}

/* Standalone workload chart, driven by the page (which owns the partition
   filter + query). Y-axis names are clickable → open that person's profile.
   `focused` = fullscreen: taller rows, show everyone (no top-N slice). */
export function WorkloadChart({
  workload,
  nameOf,
  onSelectUser,
  height = 280,
  focused = false,
  limit,
}: {
  workload?: WorkloadRow[];
  nameOf: (id?: string | null) => string;
  onSelectUser?: (userId: string) => void;
  height?: number;
  focused?: boolean;
  limit?: number;
}) {
  const all = (workload ?? []).map((w) => ({
    userId: w.user_id as string,
    name: nameOf(w.user_id),
    open: w.open_tasks - w.in_progress,
    inProgress: w.in_progress,
    blockers: w.open_blockers,
  }));
  const workloadData = limit ? all.slice(0, limit) : all;
  const idByName = new Map(workloadData.map((w) => [w.name, w.userId]));

  if (workloadData.length === 0) {
    return (
      <ChartNotice
        title="No workload data"
        detail="Open task load will appear here once tasks are assigned to contributors."
      />
    );
  }

  // Clickable Y-axis tick → onSelectUser(userId).
  const NameTick = (props: { x?: number; y?: number; payload?: { value?: string } }) => {
    const { x = 0, y = 0, payload } = props;
    const name = payload?.value ?? "";
    const uid = idByName.get(name);
    return (
      <text
        x={x}
        y={y}
        dy={4}
        textAnchor="end"
        fill={onSelectUser && uid ? "var(--text-primary)" : INK}
        fontSize={11}
        style={{ cursor: onSelectUser && uid ? "pointer" : "default", textDecoration: onSelectUser && uid ? "underline" : "none" }}
        onClick={onSelectUser && uid ? () => onSelectUser(uid) : undefined}
      >
        {compactName(name)}
      </text>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={Math.max(height, workloadData.length * (focused ? 44 : 32) + 84)}>
      <BarChart
        data={workloadData}
        layout="vertical"
        margin={{ top: 8, right: focused ? 42 : 24, bottom: 10, left: focused ? 42 : 12 }}
        barCategoryGap={focused ? 12 : 8}
      >
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis type="number" {...axisProps} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="name"
          {...axisProps}
          tick={<NameTick />}
          width={focused ? 176 : 142}
        />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: GRID }} />
        <Legend wrapperStyle={{ fontSize: 12, color: INK }} />
        <Bar dataKey="open" name="Open" stackId="w" fill={C1} maxBarSize={focused ? 22 : 16} />
        <Bar dataKey="inProgress" name="In progress" stackId="w" fill={C3} maxBarSize={focused ? 22 : 16} />
        <Bar dataKey="blockers" name="Blockers pending" stackId="w" fill={C4} radius={[0, 4, 4, 0]} maxBarSize={focused ? 22 : 16} />
      </BarChart>
    </ResponsiveContainer>
  );
}
