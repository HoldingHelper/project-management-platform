import { apiFetch } from "./client";
import type { DepartmentRead, EmployeeRead, SkillRead, TeamRead, UUID } from "@/lib/types";

export function listDepartments() {
  return apiFetch<DepartmentRead[]>("/departments");
}
export function listTeams(departmentId?: UUID) {
  const q = departmentId ? `?department_id=${departmentId}` : "";
  return apiFetch<TeamRead[]>(`/teams${q}`);
}
export function listEmployees(teamId?: UUID) {
  const q = teamId ? `?team_id=${teamId}` : "";
  return apiFetch<EmployeeRead[]>(`/employees${q}`);
}
export function createEmployee(input: {
  user_id: UUID;
  team_id?: UUID | null;
  manager_employee_id?: UUID | null;
  job_title?: string | null;
  hire_date?: string | null;
}) {
  return apiFetch<EmployeeRead>("/employees", { method: "POST", body: input });
}
export function listSkills() {
  return apiFetch<SkillRead[]>("/skills");
}
