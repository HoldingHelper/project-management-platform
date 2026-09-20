import { API_BASE_URL, apiFetch } from "./client";
import type { AuditLogRead, ExecutiveDashboard, PersonalDashboard, UUID } from "@/lib/types";

export function getPersonalDashboard() {
  return apiFetch<PersonalDashboard>("/analytics/personal-dashboard");
}

export function getExecutiveDashboard() {
  return apiFetch<ExecutiveDashboard>("/analytics/executive-dashboard");
}

export function listAuditLogs(limit = 50) {
  return apiFetch<AuditLogRead[]>(`/analytics/audit-logs?limit=${limit}`);
}

// ---- Rich Analytics & Core Series ----
export interface SeriesPoint {
  label: string;
  value: number;
}

export interface VelocityReport {
  weeks: SeriesPoint[];
  tasks_done: SeriesPoint[];
}

export interface BurndownReport {
  project_id?: UUID | null;
  days: SeriesPoint[];
}

export interface CompletionTrends {
  created: SeriesPoint[];
  completed: SeriesPoint[];
}

export interface WorkloadRow {
  user_id: UUID;
  open_tasks: number;
  in_progress: number;
  estimated_hours: number;
  open_blockers: number;
}

export interface ContributionRow {
  user_id: UUID;
  status_changes: number;
  tasks_completed: number;
}

export interface HeatmapCell {
  user_id: UUID;
  weekday: number;
  count: number;
}

export interface BottleneckItem {
  kind: string;
  id: UUID;
  title: string;
  detail: string;
  age_days: number;
  task_id?: UUID | null;
  project_id?: UUID | null;
}

export interface ProjectHealthReport {
  active: number;
  completed: number;
  on_hold: number;
  not_started: number;
  delayed: { id: UUID; name: string; progress: number }[];
  blocked: { id: UUID; name: string; progress: number }[];
}

// ============================================================================
// Enhanced KPI, DORA, Flow Framework & Predictability Types
// ============================================================================

export interface DORAMetricItem {
  name: string;
  value: number;
  display_value: string;
  unit: string;
  rating: "Elite" | "High" | "Medium" | "Low";
  benchmark: string;
  trend_percentage: number;
}

export interface DORAMetricsReport {
  deployment_frequency: DORAMetricItem;
  lead_time_for_changes: DORAMetricItem;
  change_failure_rate: DORAMetricItem;
  mean_time_to_recovery: DORAMetricItem;
  overall_rating: "Elite" | "High" | "Medium" | "Low";
  lead_time_breakdown_hours: Record<string, number>;
  history: SeriesPoint[];
}

export interface FlowItemTypeDistribution {
  features_percent: number;
  defects_percent: number;
  tech_debt_percent: number;
  infra_percent: number;
  features_points: number;
  defects_points: number;
  tech_debt_points: number;
  infra_points: number;
}

export interface CategoryDistributionItem {
  category: string;
  points: number;
  percentage: number;
  tasks_count: number;
  active_projects: number;
}

export interface FlowMetricsReport {
  velocity_total_points: number;
  velocity_tasks_completed: number;
  velocity_by_type: FlowItemTypeDistribution;
  category_distribution: CategoryDistributionItem[];
  wip_active_tasks: number;
  flow_load_status: "Optimal" | "High" | "Overloaded";
  flow_efficiency_percentage: number;
  active_working_hours: number;
  wait_hours: number;
}

export interface CFDPoint {
  date: string;
  backlog: number;
  in_progress: number;
  in_review: number;
  done: number;
}

export interface PredictabilityReport {
  predictability_score_percent: number;
  on_time_delivery_rate_percent: number;
  committed_points: number;
  completed_points: number;
  overdue_tasks_count: number;
  on_schedule_tasks_count: number;
  cfd_series: CFDPoint[];
}

export interface KPIExecutiveSummary {
  headline: string;
  velocity_trend: string;
  bottlenecks_summary: string;
  investment_mix_summary: string;
  dora_performance_summary: string;
  recommendations: string[];
}

export interface EnhancedExecutiveKPIReport {
  range_days: number;
  project_id?: UUID | null;
  category?: string | null;
  dora: DORAMetricsReport;
  flow: FlowMetricsReport;
  predictability: PredictabilityReport;
  summary: KPIExecutiveSummary;
}

// ---- Query Methods ----
export function getVelocity(weeks = 8, projectId?: UUID) {
  const q = new URLSearchParams({ weeks: String(weeks) });
  if (projectId) q.set("project_id", projectId);
  return apiFetch<VelocityReport>(`/analytics/velocity?${q.toString()}`);
}

export function getBurndown(days = 30, projectId?: UUID) {
  const q = new URLSearchParams({ days: String(days) });
  if (projectId) q.set("project_id", projectId);
  return apiFetch<BurndownReport>(`/analytics/burndown?${q.toString()}`);
}

export function getCompletionTrends(weeks = 12, projectId?: UUID) {
  const q = new URLSearchParams({ weeks: String(weeks) });
  if (projectId) q.set("project_id", projectId);
  return apiFetch<CompletionTrends>(`/analytics/completion-trends?${q.toString()}`);
}

export function getWorkload(partition?: string) {
  const q = partition ? `?partition=${encodeURIComponent(partition)}` : "";
  return apiFetch<WorkloadRow[]>(`/analytics/workload${q}`);
}

export function getContributions(weeks = 4) {
  return apiFetch<ContributionRow[]>(`/analytics/contributions?weeks=${weeks}`);
}

export function getHeatmap(weeks = 4) {
  return apiFetch<HeatmapCell[]>(`/analytics/heatmap?weeks=${weeks}`);
}

export function getBottlenecks(projectId?: UUID) {
  const q = projectId ? `?project_id=${projectId}` : "";
  return apiFetch<BottleneckItem[]>(`/analytics/bottlenecks${q}`);
}

export function getProjectHealth() {
  return apiFetch<ProjectHealthReport>("/analytics/project-health");
}

export function getDORAMetrics(rangeDays = 30, projectId?: UUID) {
  const q = new URLSearchParams({ range_days: String(rangeDays) });
  if (projectId) q.set("project_id", projectId);
  return apiFetch<DORAMetricsReport>(`/analytics/kpis/dora?${q.toString()}`);
}

export function getFlowMetrics(rangeDays = 30, projectId?: UUID) {
  const q = new URLSearchParams({ range_days: String(rangeDays) });
  if (projectId) q.set("project_id", projectId);
  return apiFetch<FlowMetricsReport>(`/analytics/kpis/flow?${q.toString()}`);
}

export function getPredictability(rangeDays = 30, projectId?: UUID) {
  const q = new URLSearchParams({ range_days: String(rangeDays) });
  if (projectId) q.set("project_id", projectId);
  return apiFetch<PredictabilityReport>(`/analytics/kpis/predictability?${q.toString()}`);
}

export function getEnhancedKPISummary(rangeDays = 30, projectId?: UUID, category?: string) {
  const q = new URLSearchParams({ range_days: String(rangeDays) });
  if (projectId) q.set("project_id", projectId);
  if (category) q.set("category", category);
  return apiFetch<EnhancedExecutiveKPIReport>(`/analytics/kpis/executive-summary?${q.toString()}`);
}

/** Download a CSV/Excel export with the auth header attached. */
export async function downloadExport(
  report: string,
  format: "csv" | "xlsx",
  params: Record<string, string> = {},
) {
  const { getAccessToken } = await import("@/lib/auth/token-store");
  const q = new URLSearchParams({ ...params, format });
  const res = await fetch(`${API_BASE_URL}/analytics/${report}?${q.toString()}`, {
    headers: { Authorization: `Bearer ${getAccessToken() ?? ""}` },
  });
  if (!res.ok) throw new Error(`Export failed (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${report}.${format}`;
  a.click();
  URL.revokeObjectURL(url);
}
