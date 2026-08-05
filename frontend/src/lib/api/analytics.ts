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

// ---- Rich analytics ----
export interface SeriesPoint { label: string; value: number }
export interface VelocityReport { weeks: SeriesPoint[]; tasks_done: SeriesPoint[] }
export interface BurndownReport { project_id?: UUID | null; days: SeriesPoint[] }
export interface CompletionTrends { created: SeriesPoint[]; completed: SeriesPoint[] }
export interface WorkloadRow { user_id: UUID; open_tasks: number; in_progress: number; estimated_hours: number; open_blockers: number }
export interface ContributionRow { user_id: UUID; status_changes: number; tasks_completed: number }
export interface HeatmapCell { user_id: UUID; weekday: number; count: number }
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
  active: number; completed: number; on_hold: number; not_started: number;
  delayed: { id: UUID; name: string; progress: number }[];
  blocked: { id: UUID; name: string; progress: number }[];
}

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
