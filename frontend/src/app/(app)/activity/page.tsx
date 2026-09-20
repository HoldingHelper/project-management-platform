"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity as ActivityIcon,
  FilePlus2,
  PencilLine,
  Trash2,
} from "lucide-react";
import { listAuditLogs } from "@/lib/api/analytics";
import { Alert, Avatar, Select } from "@/components/ds";
import { EmptyState, PageHeader, PAGE_STYLE, Spinner } from "@/components/ui/States";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useUserMap } from "@/lib/hooks";
import { relativeTime } from "@/lib/format";
import type { AuditLogRead } from "@/lib/types";

const ACTION_ICON: Record<string, typeof FilePlus2> = {
  Create: FilePlus2,
  Update: PencilLine,
  Delete: Trash2,
};

const ACTION_COLOR: Record<string, string> = {
  Create: "var(--status-completed)",
  Update: "var(--status-in-progress)",
  Delete: "var(--status-delayed)",
};

const FIELD_LABELS: Record<string, string> = {
  phase_id: "Sprint",
  product_id: "Product line",
  project_id: "Project",
  parent_task_id: "Parent task",
  lead_assignee_user_id: "Sprint lead",
  reviewer_user_id: "Reviewer",
  pending_on_user_id: "Pending on",
  owner_user_id: "Owner",
  reported_by_user_id: "Reporter",
  presence_status: "Presence",
  health_status: "Health",
  progress_percentage: "Progress",
  story_points: "Story points",
  estimated_hours: "Estimated hours",
  actual_hours: "Actual hours",
  earliest_start: "Earliest start",
  earliest_finish: "Earliest finish",
  latest_start: "Latest start",
  latest_finish: "Latest finish",
  total_slack: "Total slack",
  is_critical: "Critical path",
  due_date: "Due date",
  start_date: "Start date",
  end_date: "End date",
  updated_at: "Updated",
  created_at: "Created",
};

const ENTITY_LABELS: Record<string, string> = {
  TaskItem: "Task",
  ProjectMember: "Project member",
  TaskAssignee: "Task assignee",
  TaskLabel: "Task label",
  TaskStatusTransition: "Task status",
};

function humanize(value: string) {
  return FIELD_LABELS[value] ?? ENTITY_LABELS[value] ?? value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_id$/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function describe(log: AuditLogRead): string {
  const entity = humanize(log.entity_type.split(".").pop() ?? log.entity_type);
  return `${log.action_type}d ${entity}`;
}

function changedFields(log: AuditLogRead): string[] {
  try {
    const parsed = JSON.parse(log.changes_json) as Record<string, unknown>;
    return Object.keys(parsed).slice(0, 6);
  } catch {
    return [];
  }
}

export default function ActivityPage() {
  const { hasPermission, isSuperAdmin } = useAuth();
  const { nameOf } = useUserMap();
  const [entityFilter, setEntityFilter] = useState("");

  const canView = isSuperAdmin() || hasPermission("system.view_audit_logs");

  const { data, isLoading } = useQuery({
    queryKey: ["audit-logs"],
    queryFn: () => listAuditLogs(150),
    enabled: canView,
    refetchInterval: 60_000,
  });

  const entityTypes = useMemo(
    () => Array.from(new Set((data ?? []).map((l) => l.entity_type))).sort(),
    [data],
  );
  const filtered = (data ?? []).filter(
    (l) => !entityFilter || l.entity_type === entityFilter,
  );

  if (!canView) {
    return (
      <div style={PAGE_STYLE}>
        <PageHeader title="Activity Feed" subtitle="Organization-wide change history." />
        <Alert
          kind="warning"
          title="No access"
          description="The activity feed requires audit-log access (managers and administrators)."
        />
      </div>
    );
  }

  return (
    <div style={PAGE_STYLE}>
      <PageHeader
        title="Activity Feed"
        subtitle="Every create, update and delete across the platform — captured automatically."
        actions={
          <Select
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
            placeholder="All entities"
            aria-label="Filter activity by entity type"
            options={entityTypes.map((t) => ({ value: t, label: humanize(t.split(".").pop() ?? t) }))}
          />
        }
      />

      {isLoading && <Spinner label="Loading activity…" />}
      {!isLoading && filtered.length === 0 && (
        <EmptyState title="No activity yet" hint="Changes appear here as your team works." />
      )}

      <div style={{ position: "relative", paddingLeft: 22 }}>
        <div
          style={{
            position: "absolute",
            left: 8,
            top: 6,
            bottom: 6,
            width: 2,
            background: "var(--border-default)",
            borderRadius: 2,
          }}
        />
        {filtered.map((log) => {
          const Icon = ACTION_ICON[log.action_type] ?? ActivityIcon;
          const color = ACTION_COLOR[log.action_type] ?? "var(--text-secondary)";
          const fields = changedFields(log);
          return (
            <div key={log.id} style={{ position: "relative", marginBottom: 14 }}>
              <span
                style={{
                  position: "absolute",
                  left: -22,
                  top: 10,
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: "var(--surface-1)",
                  border: `2px solid ${color}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color,
                }}
              >
                <Icon size={9} />
              </span>
              <div
                style={{
                  background: "var(--surface-1)",
                  border: "1px solid var(--border-default)",
                  borderRadius: "var(--radius-2)",
                  padding: "10px 14px",
                  marginLeft: 6,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <Avatar name={log.user_id ? nameOf(log.user_id) : "System"} size={20} />
                  <span style={{ fontSize: 13, fontWeight: 600 }}>
                    {log.user_id ? nameOf(log.user_id) : "System"}
                  </span>
                  <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>{describe(log)}</span>
                  <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginLeft: "auto" }}>
                    {relativeTime(log.occurred_at)}
                  </span>
                </div>
                {fields.length > 0 && log.action_type === "Update" && (
                  <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
                    {fields.map((f) => (
                      <span
                        key={f}
                        style={{
                          fontSize: 10.5,
                          fontFamily: "var(--font-mono)",
                          padding: "1px 7px",
                          borderRadius: "var(--radius-full)",
                          background: "var(--surface-2)",
                          color: "var(--text-tertiary)",
                        }}
                      >
                        {humanize(f)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
