/* Presentation helpers: enum → label/color, the signature block meter,
   relative time, deterministic avatar hue, and status normalization. */

import type { SemanticStatus, TaskStatus } from "@/lib/types";

/** The discrete block progress meter: ██████░░░░ */
export function blockMeter(percent: number, blocks = 20): string {
  const pct = Math.max(0, Math.min(100, percent));
  const filled = Math.round((pct / 100) * blocks);
  return "█".repeat(filled) + "░".repeat(blocks - filled);
}

const STATUS_COLOR: Record<SemanticStatus, { fg: string; bg: string; label: string }> = {
  "not-started": { fg: "var(--status-not-started)", bg: "var(--status-not-started-bg)", label: "Not Started" },
  "in-progress": { fg: "var(--status-in-progress)", bg: "var(--status-in-progress-bg)", label: "In Progress" },
  completed: { fg: "var(--status-completed)", bg: "var(--status-completed-bg)", label: "Completed" },
  blocked: { fg: "var(--status-blocked)", bg: "var(--status-blocked-bg)", label: "Blocked" },
  delayed: { fg: "var(--status-delayed)", bg: "var(--status-delayed-bg)", label: "Delayed" },
};

export function semanticColor(status: SemanticStatus) {
  return STATUS_COLOR[status] ?? STATUS_COLOR["not-started"];
}

/** Normalize any backend status string to one of the 5 semantic states. */
export function toSemantic(status: string): SemanticStatus {
  const s = status.toLowerCase().replace(/_/g, "-");
  if (["completed", "done", "closed", "resolved"].includes(s)) return "completed";
  if (["blocked", "on-hold", "cancelled"].includes(s)) return "blocked";
  if (["delayed", "at-risk", "overdue", "late", "review", "testing"].includes(s)) return "delayed";
  if (["in-progress", "inprogress", "active", "waiting"].includes(s)) return "in-progress";
  return "not-started";
}

export const PRIORITY_COLOR: Record<string, string> = {
  P0: "var(--priority-p0)",
  P1: "var(--priority-p1)",
  P2: "var(--priority-p2)",
  P3: "var(--priority-p3)",
};
export const PRIORITY_GLYPH: Record<string, string> = { P0: "◆", P1: "▲", P2: "●", P3: "▼" };

/** Kanban column bucketing for TaskStatus. */
export const KANBAN_COLUMNS: { title: string; statuses: TaskStatus[]; dot: string }[] = [
  { title: "To Do", statuses: ["NotStarted", "Ready"], dot: "var(--status-not-started)" },
  { title: "In Progress", statuses: ["InProgress", "Waiting"], dot: "var(--status-in-progress)" },
  { title: "Blocked", statuses: ["Blocked"], dot: "var(--status-blocked)" },
  { title: "Review", statuses: ["Review", "Testing"], dot: "var(--priority-p1)" },
  { title: "Done", statuses: ["Done", "Archived"], dot: "var(--status-completed)" },
];

export function columnForStatus(status: string): string {
  const col = KANBAN_COLUMNS.find((c) => c.statuses.includes(status as TaskStatus));
  return col?.title ?? "To Do";
}

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

/** Deterministic hue from a name (mirrors the DS Avatar hashing). */
export function avatarHue(name: string): number {
  name = displayName(name);
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

export function displayName(name?: string | null): string {
  const cleaned = (name ?? "")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part && part !== "-" && part !== "—")
    .join(" ")
    .replace(/\s+-\s*$/g, "")
    .trim();
  return cleaned || "Unknown";
}

export function initials(name: string): string {
  const parts = displayName(name).split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
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
