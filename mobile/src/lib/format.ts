import { colors } from "@/theme/colors";
import type { TaskStatus, TaskPriority } from "./types";

export function relativeTime(iso?: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diff = Date.now() - then;
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function formatNotificationBody(body?: string | null): string {
  if (!body) return "";
  const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
  let text = body.replace(uuidRegex, "").replace(/\s{2,}/g, " ").trim();
  text = text
    .replace(/^Task\s+was assigned to you\.?/i, "You were assigned to this task.")
    .replace(/^Task\s+is blocked/i, "This task is blocked")
    .replace(/Task\s+now depends on task\.?/i, "This task now depends on a predecessor task.")
    .replace(/\s+\./g, ".");
  return text || body;
}

export function getStatusTheme(status: TaskStatus) {
  switch (status) {
    case "Done":
    case "Archived":
      return { fg: colors.statusCompleted, bg: colors.statusCompletedBg, label: "Done" };
    case "InProgress":
    case "Waiting":
      return { fg: colors.statusInProgress, bg: colors.statusInProgressBg, label: "In Progress" };
    case "Blocked":
      return { fg: colors.statusBlocked, bg: colors.statusBlockedBg, label: "Blocked" };
    case "Review":
    case "Testing":
      return { fg: colors.statusDelayed, bg: colors.statusDelayedBg, label: "Review" };
    default:
      return { fg: colors.statusNotStarted, bg: colors.statusNotStartedBg, label: "To Do" };
  }
}

export function getPriorityColor(priority: TaskPriority) {
  switch (priority) {
    case "P0":
      return colors.p0;
    case "P1":
      return colors.p1;
    case "P2":
      return colors.p2;
    default:
      return colors.p3;
  }
}

export function initials(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
