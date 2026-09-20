import { apiFetch } from "./client";
import { displayName } from "@/lib/format";
import type {
  InvitationPublicRead,
  InvitationRead,
  Page,
  PermissionRead,
  PresenceStatus,
  RoleRead,
  TokenResponse,
  UserRead,
  UserSettingsRead,
  UUID,
} from "@/lib/types";

function normalizeUser(user: UserRead): UserRead {
  const full_name = displayName(user.full_name);
  return {
    ...user,
    first_name: user.first_name === "-" ? "" : user.first_name,
    last_name: user.last_name === "-" ? "" : user.last_name,
    full_name,
  };
}

function normalizeUserPage(page: Page<UserRead>): Page<UserRead> {
  return { ...page, items: page.items.map(normalizeUser) };
}

export function getMe() {
  return apiFetch<UserRead>("/users/me").then(normalizeUser);
}

export function listUsers(params: { search?: string; page?: number; page_size?: number } = {}) {
  const q = new URLSearchParams();
  if (params.search) q.set("search", params.search);
  q.set("page", String(params.page ?? 1));
  q.set("page_size", String(params.page_size ?? 100));
  return apiFetch<Page<UserRead>>(`/users?${q.toString()}`).then(normalizeUserPage);
}

export function getUser(userId: UUID) {
  return apiFetch<UserRead>(`/users/${userId}`).then(normalizeUser);
}

export function listRoles() {
  return apiFetch<RoleRead[]>("/roles");
}

export function listPermissions() {
  return apiFetch<PermissionRead[]>("/permissions");
}

export function createRole(input: {
  name: string;
  description?: string;
  permission_codes: string[];
}) {
  return apiFetch<RoleRead>("/roles", { method: "POST", body: input });
}

export function updateRolePermissions(roleId: UUID, permission_codes: string[]) {
  return apiFetch<RoleRead>(`/roles/${roleId}`, {
    method: "PATCH",
    body: { permission_codes },
  });
}

// ---- Admin: user management ----
export function createUser(input: {
  email: string;
  username?: string;
  password: string;
  first_name: string;
  last_name: string;
  job_title?: string;
  department_id?: UUID | null;
  team_id?: UUID | null;
  manager_id?: UUID | null;
  role_names: string[];
}) {
  return apiFetch<UserRead>("/users", { method: "POST", body: input }).then(normalizeUser);
}

export function assignRoles(userId: UUID, role_names: string[]) {
  return apiFetch<UserRead>(`/users/${userId}/roles`, {
    method: "PUT",
    body: { role_names },
  }).then(normalizeUser);
}

export function deleteUser(userId: UUID) {
  return apiFetch<void>(`/users/${userId}`, { method: "DELETE" });
}

export function adminUpdateUser(
  userId: UUID,
  input: {
    first_name?: string;
    last_name?: string;
    username?: string;
    email?: string;
    job_title?: string;
    department_id?: UUID | null;
    team_id?: UUID | null;
    manager_id?: UUID | null;
    bio?: string;
    is_active?: boolean;
    role_names?: string[];
  },
) {
  return apiFetch<UserRead>(`/users/${userId}`, {
    method: "PATCH",
    body: input,
  }).then(normalizeUser);
}

export function adminResetPassword(userId: UUID, new_password: string) {
  return apiFetch<void>(`/users/${userId}/reset-password`, {
    method: "POST",
    body: { new_password },
  });
}

// ---- Invitations ----
export function createInvitation(
  email: string,
  role_name: string,
  department_id?: UUID | null,
  team_id?: UUID | null,
  manager_id?: UUID | null,
) {
  return apiFetch<InvitationRead>("/users/invitations", {
    method: "POST",
    body: { email, role_name, department_id, team_id, manager_id },
  });
}
export function listInvitations() {
  return apiFetch<InvitationRead[]>("/users/invitations");
}
export function revokeInvitation(id: UUID) {
  return apiFetch<void>(`/users/invitations/${id}`, { method: "DELETE" });
}
export function verifyInvitation(token: string) {
  return apiFetch<InvitationPublicRead>(`/auth/invitations/${token}`, { auth: false });
}
export function acceptInvitation(
  token: string,
  input: { first_name: string; last_name: string; password: string; username?: string },
) {
  return apiFetch<TokenResponse>(`/auth/invitations/${token}/accept`, {
    method: "POST",
    body: input,
    auth: false,
  });
}

// ---- Profile & settings ----
export function updateMyProfile(input: {
  first_name?: string;
  last_name?: string;
  job_title?: string;
  avatar_url?: string;
  bio?: string;
  phone?: string;
  location?: string;
}) {
  return apiFetch<UserRead>("/users/me/profile", { method: "PATCH", body: input }).then(normalizeUser);
}
export function changeMyEmail(new_email: string, current_password: string) {
  return apiFetch<UserRead>("/users/me/email", {
    method: "PATCH",
    body: { new_email, current_password },
  }).then(normalizeUser);
}
export function changeMyPassword(current_password: string, new_password: string) {
  return apiFetch<void>("/users/me/password", {
    method: "PATCH",
    body: { current_password, new_password },
  });
}
export function getMySettings() {
  return apiFetch<UserSettingsRead>("/users/me/settings");
}
export function updateMySettings(input: {
  notification_prefs?: Record<string, unknown>;
  theme?: string;
  github_username?: string;
}) {
  return apiFetch<UserSettingsRead>("/users/me/settings", {
    method: "PATCH",
    body: input,
  });
}

// ---- Presence & Status ----
export function setMyPresence(status: PresenceStatus) {
  return apiFetch<void>("/users/me/presence", { method: "POST", body: { status } });
}
export function updateMyStatus(input: {
  presence_status?: PresenceStatus;
  status_text?: string | null;
  status_emoji?: string | null;
  clear_after_minutes?: number | null;
}) {
  return apiFetch<UserRead>("/users/me/status", {
    method: "PUT",
    body: input,
  }).then(normalizeUser);
}
export function clearMyStatus() {
  return apiFetch<UserRead>("/users/me/status", { method: "DELETE" }).then(normalizeUser);
}
export function getPresenceSnapshot() {
  return apiFetch<Record<string, PresenceStatus | { status: PresenceStatus; custom_status?: { text?: string; emoji?: string; expires_at?: string } }>>("/users/presence");
}
