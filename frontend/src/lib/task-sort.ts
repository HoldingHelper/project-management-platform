import type { TaskRead } from "@/lib/types";

export type TaskSortMode =
  | "manual"
  | "title-asc"
  | "title-desc"
  | "priority-asc"
  | "priority-desc"
  | "due-asc"
  | "due-desc"
  | "created-asc"
  | "created-desc"
  | "assignee-asc"
  | "assignee-desc";

export const TASK_SORT_OPTIONS: { value: TaskSortMode; label: string }[] = [
  { value: "manual", label: "Manual order" },
  { value: "title-asc", label: "Title A–Z" },
  { value: "title-desc", label: "Title Z–A" },
  { value: "priority-asc", label: "Priority (P0 first)" },
  { value: "priority-desc", label: "Priority (P3 first)" },
  { value: "due-asc", label: "Due date (earliest)" },
  { value: "due-desc", label: "Due date (latest)" },
  { value: "created-asc", label: "Oldest created" },
  { value: "created-desc", label: "Newest created" },
  { value: "assignee-asc", label: "Assignee A–Z" },
  { value: "assignee-desc", label: "Assignee Z–A" },
];

export function sortTasks(
  tasks: TaskRead[],
  mode: TaskSortMode,
  nameOf: (id?: string | null) => string,
) {
  const priorities = { P0: 0, P1: 1, P2: 2, P3: 3 } as Record<string, number>;
  const value = (task: TaskRead) => {
    switch (mode) {
      case "title-asc":
      case "title-desc":
        return task.title.toLocaleLowerCase();
      case "priority-asc":
      case "priority-desc":
        return priorities[String(task.priority)] ?? 99;
      case "due-asc":
      case "due-desc":
        return task.due_date ?? "9999-12-31";
      case "created-asc":
      case "created-desc":
        return task.created_at;
      case "assignee-asc":
      case "assignee-desc":
        return task.assignee_user_ids.length
          ? task.assignee_user_ids.map((id) => nameOf(id)).sort().join(", ").toLocaleLowerCase()
          : "zzzz";
      default:
        return task.board_order ?? 0;
    }
  };
  const direction = mode.endsWith("-desc") ? -1 : 1;
  return [...tasks].sort((a, b) => {
    if ((mode === "due-asc" || mode === "due-desc") && !a.due_date !== !b.due_date) {
      return a.due_date ? -1 : 1;
    }
    const aValue = value(a);
    const bValue = value(b);
    if (aValue < bValue) return -direction;
    if (aValue > bValue) return direction;
    return a.created_at.localeCompare(b.created_at);
  });
}
