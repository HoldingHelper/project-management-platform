import { apiFetch } from "./client";
import type { HoldingCockpit, ObjectiveRead, OrgNodeRead, UUID, VisionRead, WorkRequestRead } from "@/lib/types";

export function listOrgNodes(filters: { parent?: UUID; type?: string } = {}) {
  const params = new URLSearchParams();
  if (filters.parent) params.set("parent", filters.parent);
  if (filters.type) params.set("type", filters.type);
  const query = params.size ? `?${params}` : "";
  return apiFetch<OrgNodeRead[]>(`/org/nodes${query}`);
}

export function getOrgNode(nodeId: UUID) {
  return apiFetch<OrgNodeRead>(`/org/nodes/${nodeId}`);
}

export function getHoldingCockpit() {
  return apiFetch<HoldingCockpit>("/org/cockpit");
}

export function createOrgNode(payload: {
  type: string;
  parent_id?: UUID | null;
  name: string;
  confidentiality: string;
}) {
  return apiFetch<OrgNodeRead>("/org/nodes", { method: "POST", body: payload });
}

export function getVision(nodeId: UUID) {
  return apiFetch<VisionRead | null>(`/strategy/visions/${nodeId}`);
}

export function listObjectives(nodeId: UUID, period?: string) {
  const params = new URLSearchParams({ scope: nodeId });
  if (period) params.set("period", period);
  return apiFetch<ObjectiveRead[]>(`/strategy/objectives?${params}`);
}

export function listWorkRequests(nodeId: UUID) {
  return apiFetch<WorkRequestRead[]>(`/work/requests?scope=${nodeId}`);
}

export function acceptWorkRequest(requestId: UUID) {
  return apiFetch<WorkRequestRead>(`/work/requests/${requestId}/accept`, { method: "POST" });
}
