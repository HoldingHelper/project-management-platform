"use client";

import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ds";
import { getEntityHistory } from "@/lib/api/analytics";
import { useUserMap } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { UUID } from "@/lib/types";
import styles from "./EntityHistory.module.css";

const labels: Record<string, string> = {
  name: "Name", title: "Title", description: "Description", status: "Status",
  priority: "Priority", health_status: "Health", risk_level: "Risk", budget: "Budget",
  start_date: "Start date", end_date: "End date", due_date: "Due date",
  estimated_completion_date: "Estimated completion", actual_completion_date: "Actual end date",
  completed_at: "Completed", progress_percentage: "Progress", tags: "Tags",
  product_id: "Product line", phase_id: "Sprint", parent_task_id: "Parent task",
  assignee_user_ids: "Assignees", reviewer_user_id: "Reviewer", user_id: "User",
  members: "Members", role: "Project role", sprints: "Sprints", milestones: "Milestones",
  label_ids: "Labels", label_id: "Label", checklist_items: "Checklist", is_done: "Completed",
  text: "Text", order: "Order", documents: "Connected documents", attachments: "Attachments",
  file_name: "File name", size_bytes: "Size", content_type: "File type", version: "Version",
  comments: "Comments", body: "Comment", author_user_id: "User", is_deleted: "Deleted",
  story_points: "Story points", estimated_hours: "Estimated hours", actual_hours: "Actual hours",
  partition: "Partition", board_order: "Order", github_url: "GitHub URL",
  lead_assignee_user_id: "Sprint lead", sequence: "Order", is_ticket: "Ticket",
};

function parseChanges(raw: string): Record<string, { old: unknown; new: unknown }> {
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const changes: Record<string, { old: unknown; new: unknown }> = {};
    for (const [key, change] of Object.entries(value)) {
      if (change && typeof change === "object" && "old" in change && "new" in change) {
        changes[key] = { old: change.old, new: change.new };
      }
    }
    return changes;
  } catch { return {}; }
}

export function EntityHistory({ entityType, entityId }: { entityType: "project" | "task"; entityId: UUID }) {
  const { t, date } = useI18n();
  const { nameOf } = useUserMap();
  const history = useQuery({
    queryKey: ["entity-history", entityType, entityId],
    queryFn: () => getEntityHistory(entityType, entityId),
    refetchInterval: 5000,
  });
  const label = (field: string) => t(labels[field] ?? field.replace(/_/g, " "));
  function display(value: unknown): string {
    if (value == null || value === "") return "—";
    if (typeof value === "boolean") return t(value ? "Yes" : "No");
    if (Array.isArray(value)) return value.length ? value.map(display).join("\n") : "—";
    if (typeof value === "object") return Object.entries(value).filter(([key]) => key !== "id").map(([key, item]) => `${label(key)}: ${display(item)}`).join("\n");
    if (typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value)) {
      const name = nameOf(value as UUID);
      return name === "Unknown" ? value : name;
    }
    return String(value);
  }
  return <section aria-label={t("History & Changes")} className={styles.history}>
    <div className={styles.toolbar}><Button type="button" variant="secondary" size="sm" disabled={history.isFetching} onClick={() => history.refetch()}>{t("Refresh")}</Button></div>
    {history.isPending && <p role="status">{t("Loading…")}</p>}
    {history.isError && <p role="alert">{t("Could not load change history.")} <Button type="button" variant="secondary" onClick={() => history.refetch()}>{t("Retry")}</Button></p>}
    {history.isSuccess && history.data.length === 0 && <p>{t("No recorded changes yet.")}</p>}
    <ol className={styles.entries}>
      {(history.data ?? []).map((entry) => <li key={entry.id} className={styles.entry}>
        <div className={styles.meta}>
          <b>{t(({ Create: "Created", Update: "Updated", Delete: "Deleted" } as Record<string, string>)[entry.action_type] ?? entry.action_type)}</b>
          <span>{entry.user_name || (entry.user_id ? nameOf(entry.user_id) : t("System"))}</span>
          <time dateTime={entry.occurred_at}>{date(entry.occurred_at, { dateStyle: "medium", timeStyle: "medium" })}</time>
        </div>
        <dl className={styles.changes}>{Object.entries(parseChanges(entry.changes_json)).map(([field, change]) => <div key={field} className={styles.change}>
          <dt>{label(field)}</dt>
          <dd className={styles.values}>
            <div><small>{t("Previous value")}</small><div className={styles.value}>{display(change.old)}</div></div>
            <div><small>{t("New value")}</small><div className={styles.value}>{display(change.new)}</div></div>
          </dd>
        </div>)}</dl>
      </li>)}
    </ol>
  </section>;
}
