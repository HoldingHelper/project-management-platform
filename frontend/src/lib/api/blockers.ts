import { apiFetch } from "./client";
import type { BlockerRead, UserPendingWork, UUID } from "@/lib/types";

export function listBlockers(status?: string) {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiFetch<BlockerRead[]>(`/blockers${q}`);
}

export function resolveBlocker(id: UUID, actual_resolution_date?: string) {
  return apiFetch<BlockerRead>(`/blockers/${id}/resolve`, {
    method: "PUT",
    body: { actual_resolution_date: actual_resolution_date ?? null },
  });
}

export function getUserPendingWork(userId: UUID) {
  return apiFetch<UserPendingWork>(`/users/${userId}/pending-work`);
}
