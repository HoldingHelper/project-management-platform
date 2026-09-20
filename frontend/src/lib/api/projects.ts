import { API_BASE_URL, apiFetch } from "./client";
import type {
  MilestoneRead,
  Page,
  PhaseRead,
  PortfolioGantt,
  ProductRead,
  ProgressBreakdown,
  ProjectDependencyRead,
  ProjectMemberRead,
  ProjectOverview,
  ProjectRead,
  ProjectTimeline,
  TaskRead,
  TaskPartitionRead,
  TaskStatus,
  UUID,
} from "@/lib/types";

// ---- Task partitions ----
export function listTaskPartitions() {
  return apiFetch<TaskPartitionRead[]>("/partitions");
}

export function createTaskPartition(input: { name: string; description?: string; display_order?: number }) {
  return apiFetch<TaskPartitionRead>("/partitions", { method: "POST", body: input });
}

export function updateTaskPartition(id: UUID, input: { name?: string; description?: string | null; display_order?: number }) {
  return apiFetch<TaskPartitionRead>(`/partitions/${id}`, { method: "PATCH", body: input });
}

export function deleteTaskPartition(id: UUID, replacementPartitionId?: UUID) {
  const query = replacementPartitionId ? `?replacement_partition_id=${replacementPartitionId}` : "";
  return apiFetch<void>(`/partitions/${id}${query}`, { method: "DELETE" });
}

// ---- Products ----
export function listProducts(page = 1, page_size = 100) {
  return apiFetch<Page<ProductRead>>(`/products?page=${page}&page_size=${page_size}`);
}
export function getProduct(id: UUID) {
  return apiFetch<ProductRead>(`/products/${id}`);
}

// ---- Projects ----
export function listProjects(page = 1, page_size = 100) {
  return apiFetch<Page<ProjectRead>>(`/projects?page=${page}&page_size=${page_size}`);
}
export function getProject(id: UUID) {
  return apiFetch<ProjectRead>(`/projects/${id}`);
}
export function getProjectPhases(id: UUID) {
  return apiFetch<PhaseRead[]>(`/projects/${id}/phases`);
}
export function getProjectSprints(id: UUID) {
  return apiFetch<PhaseRead[]>(`/projects/${id}/sprints`);
}
export function getProjectTimeline(id: UUID) {
  return apiFetch<ProjectTimeline>(`/projects/${id}/timeline`);
}

export interface GeneratedTask {
  title: string;
  description: string;
  assignee?: string | null;
  assignee_user_id?: UUID | null;
  priority: string;
  estimated_hours?: number | null;
  due_date?: string | null;
  dependencies: string[];
  tags: string[];
  status: string;
  task_type: string;
  partition: string;
}

export interface GeneratedMilestone {
  name: string;
  description?: string | null;
  due_date?: string | null;
}

export interface GeneratedProject {
  name: string;
  description: string;
  goal: string;
  stakeholders: string[];
  timeline_start?: string | null;
  timeline_end?: string | null;
  constraints?: string | null;
  priority: string;
  risk_level: string;
  tags: string[];
  milestones: GeneratedMilestone[];
  tasks: GeneratedTask[];
  unresolved_fields: string[];
}

export interface GenerationDraftResponse {
  generation_run_id: UUID;
  status: string;
  operation: string;
  project?: GeneratedProject | null;
  validation_errors: { field: string; message: string }[];
  change_set: { path: string; before?: unknown; after?: unknown; change_type: string }[];
  prompt_storage_key?: string | null;
}

export interface GenerationJobResponse {
  job_id: UUID;
  project_id: UUID;
  status: string;
  error?: string | null;
}

export function aiTemplateUrl() {
  return "/api/v1/projects/ai-template";
}

export async function downloadAiTemplate() {
  const { getAccessToken } = await import("@/lib/auth/token-store");
  const res = await fetch(`${API_BASE_URL}/projects/ai-template`, {
    headers: { Authorization: `Bearer ${getAccessToken() ?? ""}` },
  });
  if (!res.ok) throw new Error(`Template download failed (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "project_brief_template.md";
  a.click();
  URL.revokeObjectURL(url);
}

export function generateProjectDraft(file?: File | null, extraContext?: string) {
  const form = new FormData();
  if (file) form.set("prompt_file", file);
  if (extraContext?.trim()) form.set("extra_context", extraContext.trim());
  return apiFetch<GenerationJobResponse>("/projects/generate", {
    method: "POST",
    formData: form,
  });
}

export function getGenerationJob(jobId: UUID) {
  return apiFetch<GenerationJobResponse>(`/projects/generation-jobs/${jobId}`);
}

export function getGenerationDraft(jobId: UUID) {
  return apiFetch<GenerationDraftResponse>(`/projects/generation-jobs/${jobId}/draft`);
}

export function confirmGeneration(generationRunId: UUID, project?: GeneratedProject | null) {
  return apiFetch<{ project_id: UUID; task_ids: UUID[]; generation_run_id: UUID }>(
    `/projects/generation-jobs/${generationRunId}/confirm`,
    { method: "POST", body: project ? { project } : undefined },
  );
}

export function regenerateProjectDraft(projectId: UUID, file?: File | null, extraContext?: string) {
  const form = new FormData();
  if (file) form.set("prompt_file", file);
  if (extraContext?.trim()) form.set("extra_context", extraContext.trim());
  return apiFetch<GenerationJobResponse>(`/projects/${projectId}/regenerate`, {
    method: "POST",
    formData: form,
  });
}

export function confirmRegeneration(projectId: UUID, generationRunId: UUID) {
  return apiFetch<{ project_id: UUID; task_ids: UUID[]; generation_run_id: UUID }>(
    `/projects/${projectId}/regenerate/confirm?generation_run_id=${generationRunId}`,
    { method: "POST" },
  );
}

// ---- Phases ----
export function getPhase(id: UUID) {
  return apiFetch<PhaseRead>(`/phases/${id}`);
}
export function getPhaseTasks(id: UUID) {
  return apiFetch<TaskRead[]>(`/phases/${id}/tasks`);
}
export function getPhaseProgress(id: UUID) {
  return apiFetch<ProgressBreakdown>(`/phases/${id}/progress`);
}
export function getSprint(id: UUID) {
  return apiFetch<PhaseRead>(`/sprints/${id}`);
}
export function getSprintTasks(id: UUID) {
  return apiFetch<TaskRead[]>(`/sprints/${id}/tasks`);
}
export function getSprintProgress(id: UUID) {
  return apiFetch<ProgressBreakdown>(`/sprints/${id}/progress`);
}

// ---- Tasks ----
export function getTask(id: UUID) {
  return apiFetch<TaskRead>(`/tasks/${id}`);
}
export function updateTaskStatus(id: UUID, status: TaskStatus) {
  return apiFetch<TaskRead>(`/tasks/${id}/status`, {
    method: "PUT",
    body: { status },
  });
}

export function reorderTasks(task_ids: UUID[]) {
  return apiFetch<void>("/tasks/reorder", {
    method: "PUT",
    body: { task_ids },
  });
}

export function updateChecklistItem(taskId: UUID, checklistItemId: UUID, is_done: boolean) {
  return apiFetch<TaskRead>(`/tasks/${taskId}/checklist/${checklistItemId}`, {
    method: "PUT",
    body: { is_done },
  });
}

export interface TaskListFilters {
  partition?: string;
  label?: string;
  assignee_user_id?: UUID;
  status?: string;
  unattached?: boolean;
  parent_task_id?: UUID;
  search?: string;
  page?: number;
  page_size?: number;
}

export function listTasks(filters: TaskListFilters = {}) {
  const q = new URLSearchParams();
  if (filters.partition) q.set("partition", filters.partition);
  if (filters.label) q.set("label", filters.label);
  if (filters.assignee_user_id) q.set("assignee_user_id", filters.assignee_user_id);
  if (filters.status) q.set("status", filters.status);
  if (filters.unattached !== undefined) q.set("unattached", String(filters.unattached));
  if (filters.parent_task_id) q.set("parent_task_id", filters.parent_task_id);
  if (filters.search) q.set("search", filters.search);
  q.set("page", String(filters.page ?? 1));
  q.set("page_size", String(filters.page_size ?? 50));
  return apiFetch<Page<TaskRead>>(`/tasks?${q.toString()}`);
}

export function createTask(input: {
  phase_id?: UUID | null;
  parent_task_id?: UUID | null;
  title: string;
  description?: string;
  task_type?: string;
  priority?: string;
  status?: string;
  story_points?: number;
  estimated_hours?: number;
  reviewer_user_id?: UUID | null;
  github_url?: string;
  partition?: string;
  start_date?: string;
  due_date?: string;
  assignee_user_ids?: UUID[];
  is_ticket?: boolean;
  ticket_recipient_user_ids?: UUID[];
  ticket_recipient_team_ids?: UUID[];
  label_names?: string[];
  checklist_items?: { text: string; order: number }[];
}) {
  return apiFetch<TaskRead>("/tasks", { method: "POST", body: input });
}

export function updateTask(id: UUID, input: Record<string, unknown>) {
  return apiFetch<TaskRead>(`/tasks/${id}`, { method: "PUT", body: input });
}

export function deleteTask(id: UUID) {
  return apiFetch<void>(`/tasks/${id}`, { method: "DELETE" });
}

export function attachTask(id: UUID, phase_id: UUID) {
  return apiFetch<TaskRead>(`/tasks/${id}/attach`, { method: "POST", body: { phase_id } });
}

export function detachTask(id: UUID) {
  return apiFetch<TaskRead>(`/tasks/${id}/detach`, { method: "POST" });
}

// ---- Project / product / phase management (admin) ----
export function createProduct(input: { name: string; owner_user_id: UUID; description?: string }) {
  return apiFetch<ProductRead>("/products", { method: "POST", body: input });
}

export function createProject(input: {
  product_id: UUID;
  name: string;
  description?: string;
  priority?: string;
  risk_level?: string;
  start_date?: string;
  end_date?: string;
  estimated_completion_date?: string;
  actual_completion_date?: string;
  health_status?: string;
  status?: string;
  budget?: number;
  tags?: string[];
  sprints?: {
    name: string;
    start_date: string;
    end_date: string;
    lead_assignee_user_id?: UUID;
  }[];
}) {
  return apiFetch<ProjectRead>("/projects", { method: "POST", body: input });
}

export function updateProject(id: UUID, input: Record<string, unknown>) {
  return apiFetch<ProjectRead>(`/projects/${id}`, { method: "PUT", body: input });
}

export function archiveProject(id: UUID) {
  return apiFetch<ProjectRead>(`/projects/${id}/archive`, { method: "POST" });
}

export function deleteProject(id: UUID) {
  return apiFetch<void>(`/projects/${id}`, { method: "DELETE" });
}

export function createPhase(input: {
  project_id: UUID;
  name: string;
  phase_type?: string;
  sequence?: number;
  start_date?: string;
  end_date?: string;
  lead_assignee_user_id?: UUID;
}) {
  return apiFetch<PhaseRead>("/phases", { method: "POST", body: input });
}

export function createSprint(input: {
  project_id: UUID;
  name: string;
  sequence?: number;
  start_date?: string;
  end_date?: string;
  lead_assignee_user_id?: UUID;
}) {
  return apiFetch<PhaseRead>("/sprints", { method: "POST", body: input });
}

export function getProjectOverview(id: UUID) {
  return apiFetch<ProjectOverview>(`/projects/${id}/overview`);
}

export function getProjectMembers(id: UUID) {
  return apiFetch<ProjectMemberRead[]>(`/projects/${id}/members`);
}

export function addProjectMember(id: UUID, user_id: UUID, role: string) {
  return apiFetch<void>(`/projects/${id}/members`, {
    method: "POST",
    body: { user_id, role },
  });
}

export function removeProjectMember(id: UUID, user_id: UUID) {
  return apiFetch<void>(`/projects/${id}/members/${user_id}`, { method: "DELETE" });
}

export function transferProjectAdmin(
  id: UUID,
  new_admin_user_id: UUID,
  previous_admin_role: string,
) {
  return apiFetch<ProjectMemberRead>(`/projects/${id}/admin`, {
    method: "PUT",
    body: { new_admin_user_id, previous_admin_role },
  });
}

// ---- Milestones ----
export function listMilestones(projectId: UUID) {
  return apiFetch<MilestoneRead[]>(`/projects/${projectId}/milestones`);
}
export function createMilestone(
  projectId: UUID,
  input: { name: string; description?: string; due_date?: string; sequence?: number },
) {
  return apiFetch<MilestoneRead>(`/projects/${projectId}/milestones`, {
    method: "POST",
    body: input,
  });
}
export function updateMilestone(id: UUID, input: Record<string, unknown>) {
  return apiFetch<MilestoneRead>(`/projects/milestones/${id}`, {
    method: "PATCH",
    body: input,
  });
}
export function deleteMilestone(id: UUID) {
  return apiFetch<void>(`/projects/milestones/${id}`, { method: "DELETE" });
}

// ---- Portfolio Gantt + project dependencies ----
export function getPortfolioGantt(includeArchived = false) {
  const q = includeArchived ? "?include_archived=true" : "";
  return apiFetch<PortfolioGantt>(`/portfolio/gantt${q}`);
}
export function createProjectDependency(
  projectId: UUID,
  input: { predecessor_project_id: UUID; successor_project_id: UUID; dependency_type?: string; lag_days?: number },
) {
  return apiFetch<ProjectDependencyRead>(`/projects/${projectId}/dependencies`, {
    method: "POST",
    body: input,
  });
}
export function deleteProjectDependency(dependencyId: UUID) {
  return apiFetch<void>(`/projects/dependencies/${dependencyId}`, { method: "DELETE" });
}
