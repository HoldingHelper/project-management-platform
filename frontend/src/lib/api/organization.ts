import { apiFetch } from "./client";
import type {
  DepartmentCreate,
  DepartmentRead,
  DepartmentUpdate,
  EmployeeRead,
  OrgTreeResponse,
  SkillRead,
  TeamCreate,
  TeamRead,
  TeamUpdate,
  UUID,
} from "@/lib/types";

export function listDepartments() {
  return apiFetch<DepartmentRead[]>("/departments");
}

export function getDepartment(departmentId: UUID) {
  return apiFetch<DepartmentRead>(`/departments/${departmentId}`);
}

export function createDepartment(body: DepartmentCreate) {
  return apiFetch<DepartmentRead>("/departments", { method: "POST", body });
}

export function updateDepartment(departmentId: UUID, body: DepartmentUpdate) {
  return apiFetch<DepartmentRead>(`/departments/${departmentId}`, { method: "PATCH", body });
}

export function deleteDepartment(departmentId: UUID) {
  return apiFetch<void>(`/departments/${departmentId}`, { method: "DELETE" });
}

export function listDepartmentMembers(departmentId: UUID) {
  return apiFetch<EmployeeRead[]>(`/departments/${departmentId}/members`);
}

export function listTeams(departmentId?: UUID) {
  const q = departmentId ? `?department_id=${departmentId}` : "";
  return apiFetch<TeamRead[]>(`/teams${q}`);
}

export function getTeam(teamId: UUID) {
  return apiFetch<TeamRead>(`/teams/${teamId}`);
}

export function createTeam(body: TeamCreate) {
  return apiFetch<TeamRead>("/teams", { method: "POST", body });
}

export function updateTeam(teamId: UUID, body: TeamUpdate) {
  return apiFetch<TeamRead>(`/teams/${teamId}`, { method: "PATCH", body });
}

export function deleteTeam(teamId: UUID) {
  return apiFetch<void>(`/teams/${teamId}`, { method: "DELETE" });
}

export function getOrganizationTree() {
  return apiFetch<OrgTreeResponse>("/organization/tree");
}

export function listEmployees(params?: { teamId?: UUID; departmentId?: UUID }) {
  const q = new URLSearchParams();
  if (params?.teamId) q.set("team_id", params.teamId);
  if (params?.departmentId) q.set("department_id", params.departmentId);
  const qs = q.toString();
  return apiFetch<EmployeeRead[]>(`/employees${qs ? `?${qs}` : ""}`);
}

export function createEmployee(input: {
  user_id: UUID;
  department_id?: UUID | null;
  team_id?: UUID | null;
  manager_employee_id?: UUID | null;
  job_title?: string | null;
  hire_date?: string | null;
}) {
  return apiFetch<EmployeeRead>("/employees", { method: "POST", body: input });
}

export function updateEmployee(
  employeeId: UUID,
  body: Partial<{
    department_id?: UUID | null;
    team_id?: UUID | null;
    manager_employee_id?: UUID | null;
    job_title?: string | null;
    hire_date?: string | null;
    status?: string;
  }>
) {
  return apiFetch<EmployeeRead>(`/employees/${employeeId}`, { method: "PATCH", body });
}

export function listSkills() {
  return apiFetch<SkillRead[]>("/skills");
}
