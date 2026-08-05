"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Edit3, ExternalLink, GitBranch, ListChecks, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  createTask,
  deleteTask,
  getTask,
  listTasks,
  updateChecklistItem,
  updateTaskStatus,
} from "@/lib/api/projects";
import {
  Avatar,
  Button,
  Field,
  MarkdownPreview,
  Select,
  StatusChip,
  TextInput,
  useToast,
} from "@/components/ds";
import { ErrorState, PageHeader, PAGE_STYLE, Spinner } from "@/components/ui/States";
import { TaskEditorModal } from "@/components/tasks/TaskEditorModal";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useUserMap } from "@/lib/hooks";
import type { TaskRead, TaskStatus, UUID } from "@/lib/types";

const STATUS_OPTIONS: TaskStatus[] = [
  "NotStarted",
  "Ready",
  "InProgress",
  "Waiting",
  "Blocked",
  "Review",
  "Testing",
  "Done",
  "Cancelled",
  "Archived",
];

const STATUS_LABELS: Record<string, string> = {
  NotStarted: "Not Started",
  Ready: "Ready",
  InProgress: "In Progress",
  Waiting: "Waiting",
  Blocked: "Blocked",
  Review: "Review",
  Testing: "Testing",
  Done: "Done",
  Cancelled: "Cancelled",
  Archived: "Archived",
};

export default function TaskDetailPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const toast = useToast();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { hasPermission, isSuperAdmin } = useAuth();
  const { nameOf } = useUserMap();
  const [editOpen, setEditOpen] = useState(false);
  const [subtaskTitle, setSubtaskTitle] = useState("");

  const task = useQuery({
    queryKey: ["task", taskId],
    queryFn: () => getTask(taskId as UUID),
  });

  const subtasks = useQuery({
    queryKey: ["subtasks", taskId],
    queryFn: () => listTasks({ parent_task_id: taskId as UUID, page_size: 200 }),
  });

  const canEdit =
    isSuperAdmin() ||
    hasPermission(
      "tasks.manage_all",
      "tasks.manage_team",
      "tasks.edit_assigned",
      "tasks.manage_testing",
      "tasks.manage_design",
    );

  const changeStatus = useMutation({
    mutationFn: (status: TaskStatus) => updateTaskStatus(taskId as UUID, status),
    onSuccess: (saved) => {
      toast.push(saved.status === "Done" ? "Task completed." : "Task status updated.", "success");
      queryClient.invalidateQueries({ queryKey: ["task", taskId] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["phase-tasks"] });
    },
    onError: () => toast.push("Could not update task status.", "error"),
  });

  const toggleChecklist = useMutation({
    mutationFn: ({ itemId, isDone }: { itemId: UUID; isDone: boolean }) =>
      updateChecklistItem(taskId as UUID, itemId, isDone),
    onSuccess: (saved) => {
      queryClient.setQueryData(["task", taskId], saved);
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["phase-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["phase-progress"] });
      queryClient.invalidateQueries({ queryKey: ["project-overview"] });
      toast.push(saved.status === "Done" ? "Checklist complete. Task done." : "Checklist updated.", "success");
    },
    onError: () => toast.push("Could not update checklist.", "error"),
  });

  const addSubtask = useMutation({
    mutationFn: (title: string) =>
      createTask({ title, parent_task_id: taskId as UUID, partition: task.data?.partition ?? undefined }),
    onSuccess: () => {
      setSubtaskTitle("");
      toast.push("Subtask created.", "success");
      queryClient.invalidateQueries({ queryKey: ["subtasks", taskId] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: () => toast.push("Could not create subtask.", "error"),
  });

  const removeTask = useMutation({
    mutationFn: () => deleteTask(taskId as UUID),
    onSuccess: () => {
      toast.push("Task deleted.", "success");
      queryClient.removeQueries({ queryKey: ["task", taskId] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["phase-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["project-overview"] });
      router.push("/tasks");
    },
    onError: () => toast.push("Could not delete task.", "error"),
  });

  const confirmDeleteTask = () => {
    if (window.confirm(`Delete "${task.data?.title ?? "this task"}"? This cannot be undone.`)) {
      removeTask.mutate();
    }
  };

  if (task.isLoading) return <Spinner label="Loading task..." />;

  if (task.isError || !task.data) {
    return (
      <div style={PAGE_STYLE}>
        <BackLink router={router} />
        <ErrorState message="Task could not be loaded. It may have been deleted, or you may not have access." />
      </div>
    );
  }

  const row = task.data;

  return (
    <div style={PAGE_STYLE}>
      <BackLink router={router} />

      {row.parent_task_id && (
        <Link href={`/tasks/${row.parent_task_id}`} style={parentLink}>
          <GitBranch size={13} /> Subtask — open parent task
        </Link>
      )}

      <PageHeader
        title={row.title}
        subtitle={`Task ${row.id}`}
        badge={<StatusChip status={String(row.status)} label={STATUS_LABELS[String(row.status)] ?? String(row.status)} />}
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {row.github_url && (
              <a href={row.github_url} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                <Button variant="secondary">
                  <ExternalLink size={14} /> GitHub
                </Button>
              </a>
            )}
            {canEdit && (
              <>
                <Button variant="secondary" onClick={() => setEditOpen(true)}>
                  <Edit3 size={14} /> Edit
                </Button>
                <Button
                  variant="secondary"
                  disabled={removeTask.isPending}
                  onClick={confirmDeleteTask}
                  style={dangerButton}
                >
                  <Trash2 size={14} /> {removeTask.isPending ? "Deleting..." : "Delete"}
                </Button>
                <Button
                  disabled={row.status === "Done" || changeStatus.isPending}
                  onClick={() => changeStatus.mutate("Done")}
                >
                  <CheckCircle2 size={14} /> {row.status === "Done" ? "Complete" : "Complete task"}
                </Button>
              </>
            )}
          </div>
        }
      />

      <section className="pmp-task-detail-grid" style={detailGrid}>
        <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
          <div>
            <h2 style={sectionTitle}>Description</h2>
            <MarkdownPreview value={row.description ?? ""} empty="No description." />
          </div>

          <div>
            <h2 style={sectionTitle}>Assignees</h2>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {row.assignee_user_ids.length === 0 && <span style={muted}>Unassigned</span>}
              {row.assignee_user_ids.map((id) => (
                <span key={id} style={personPill}>
                  <Avatar name={nameOf(id)} size={24} />
                  {nameOf(id)}
                </span>
              ))}
            </div>
          </div>

          <div>
            <h2 style={sectionTitle}>Checklist</h2>
            {row.checklist_items.length === 0 ? (
              <span style={muted}>No checklist items.</span>
            ) : (
              <div style={checklistBox}>
                {row.checklist_items.map((item) => (
                  <label key={item.id} style={checklistRow}>
                    <input
                      type="checkbox"
                      checked={item.is_done}
                      disabled={!canEdit || toggleChecklist.isPending}
                      onChange={(event) =>
                        toggleChecklist.mutate({ itemId: item.id, isDone: event.target.checked })
                      }
                      style={checkboxStyle}
                    />
                    <span style={{ textDecoration: item.is_done ? "line-through" : undefined, color: item.is_done ? "var(--text-tertiary)" : "var(--text-primary)" }}>
                      {item.text}
                    </span>
                  </label>
                ))}
                <div style={checklistHint}>
                  <ListChecks size={13} /> All items checked marks task Done.
                </div>
              </div>
            )}
          </div>

          <div>
            <h2 style={sectionTitle}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <GitBranch size={13} /> Subtasks
                {(subtasks.data?.items.length ?? 0) > 0 && (
                  <span style={countPill}>{subtasks.data!.items.length}</span>
                )}
              </span>
            </h2>
            <div style={subtaskBox}>
              {subtasks.isLoading ? (
                <span style={muted}>Loading subtasks…</span>
              ) : (subtasks.data?.items.length ?? 0) === 0 ? (
                <span style={muted}>No subtasks yet.</span>
              ) : (
                subtasks.data!.items.map((sub) => (
                  <Link key={sub.id} href={`/tasks/${sub.id}`} style={subtaskRow}>
                    <span style={subtaskTitleText} title={sub.title}>
                      {sub.title}
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ display: "flex" }}>
                        {sub.assignee_user_ids.slice(0, 3).map((id, i) => (
                          <span key={id} style={{ marginLeft: i === 0 ? 0 : -8 }} title={nameOf(id)}>
                            <Avatar name={nameOf(id)} size={22} />
                          </span>
                        ))}
                        {sub.assignee_user_ids.length === 0 && (
                          <span style={{ ...muted, fontSize: 12 }}>Unassigned</span>
                        )}
                      </span>
                      <StatusChip status={String(sub.status)} label={STATUS_LABELS[String(sub.status)] ?? String(sub.status)} />
                    </span>
                  </Link>
                ))
              )}

              {canEdit && (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const title = subtaskTitle.trim();
                    if (title) addSubtask.mutate(title);
                  }}
                  style={subtaskForm}
                >
                  <TextInput
                    aria-label="New subtask title"
                    placeholder="Add a subtask…"
                    value={subtaskTitle}
                    onChange={(event) => setSubtaskTitle(event.target.value)}
                    style={{ flex: 1 }}
                  />
                  <Button type="submit" disabled={!subtaskTitle.trim() || addSubtask.isPending}>
                    <Plus size={14} /> {addSubtask.isPending ? "Adding…" : "Add"}
                  </Button>
                </form>
              )}
            </div>
          </div>
        </div>

        <aside style={sidePanel}>
          {canEdit && (
            <Field label="Status">
              <Select
                value={String(row.status)}
                onChange={(event) => changeStatus.mutate(event.target.value as TaskStatus)}
                disabled={changeStatus.isPending}
                options={STATUS_OPTIONS.map((status) => ({
                  value: status,
                  label: STATUS_LABELS[status] ?? status,
                }))}
              />
            </Field>
          )}
          <TaskFact label="Type" value={String(row.task_type)} />
          <TaskFact label="Priority" value={String(row.priority)} />
          <TaskFact label="Level" value={row.partition ?? "None"} />
          <TaskFact label="Created" value={row.created_at.slice(0, 10)} />
          <TaskFact label="Updated" value={row.updated_at.slice(0, 10)} />
          <TaskFact label="Start" value={row.start_date ?? "Not set"} />
          <TaskFact label="Due" value={row.due_date ?? "Not set"} />
          <TaskFact label="Completed" value={row.completed_at?.slice(0, 10) ?? "Not complete"} />
          <TaskFact label="Estimate" value={row.estimated_hours != null ? `${row.estimated_hours}h` : "Not set"} />
          <TaskFact label="Story points" value={row.story_points != null ? String(row.story_points) : "Not set"} />
          <TaskFact label="Project phase" value={row.phase_id ?? "Backlog"} mono />
          <TaskFact label="Subtasks" value={String(subtasks.data?.items.length ?? 0)} />
          <div>
            <div style={factLabel}>Labels</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
              {row.labels.length === 0 && <span style={muted}>None</span>}
              {row.labels.map((label) => (
                <span key={label} style={labelPill}>{label}</span>
              ))}
            </div>
          </div>
        </aside>
      </section>

      <TaskEditorModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        task={row}
        onSaved={(saved: TaskRead) => queryClient.setQueryData(["task", taskId], saved)}
      />
    </div>
  );
}

/** Back to wherever the user came from (project board, task browser, …).
 *  Uses browser history when it exists; falls back to the task browser on a
 *  cold deep-link so we never leave the app. */
function BackLink({ router }: { router: ReturnType<typeof useRouter> }) {
  const [canGoBack, setCanGoBack] = useState(false);
  useEffect(() => {
    setCanGoBack(window.history.length > 1);
  }, []);

  if (canGoBack) {
    return (
      <button type="button" onClick={() => router.back()} style={{ ...backLink, border: "none", background: "none", cursor: "pointer" }}>
        <ArrowLeft size={14} /> Back
      </button>
    );
  }
  return (
    <Link href="/tasks" style={backLink}>
      <ArrowLeft size={14} /> Tasks
    </Link>
  );
}

function TaskFact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div style={factLabel}>{label}</div>
      <div style={{ ...factValue, fontFamily: mono ? "var(--font-mono)" : undefined }}>{value}</div>
    </div>
  );
}

const backLink: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  color: "var(--text-secondary)",
  fontSize: 13,
  fontWeight: 700,
  textDecoration: "none",
  width: "fit-content",
};

const detailGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(280px, 360px)",
  gap: 24,
  alignItems: "start",
};

const sidePanel: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 14,
  padding: 16,
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-3)",
  background: "var(--surface-2)",
};

const sectionTitle: React.CSSProperties = {
  margin: "0 0 8px",
  fontSize: 13,
  fontWeight: 800,
  color: "var(--text-secondary)",
};

const factLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "var(--text-tertiary)",
};

const factValue: React.CSSProperties = {
  marginTop: 4,
  color: "var(--text-primary)",
  fontSize: 13,
  overflowWrap: "anywhere",
};

const personPill: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "5px 9px",
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-full)",
  background: "var(--surface-3)",
  color: "var(--text-secondary)",
  fontSize: 12.5,
  fontWeight: 700,
};

const labelPill: React.CSSProperties = {
  padding: "3px 8px",
  borderRadius: "var(--radius-full)",
  background: "var(--surface-3)",
  color: "var(--text-secondary)",
  fontSize: 12,
  fontWeight: 700,
};

const checklistBox: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: 12,
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-2)",
  background: "var(--surface-3)",
};

const checklistRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  fontSize: 13.5,
  color: "var(--text-primary)",
};

const checkboxStyle: React.CSSProperties = {
  width: 18,
  height: 18,
  accentColor: "var(--accent-primary)",
};

const checklistHint: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  paddingTop: 6,
  borderTop: "1px solid var(--border-subtle)",
  color: "var(--text-tertiary)",
  fontSize: 12,
};

const muted: React.CSSProperties = {
  color: "var(--text-tertiary)",
  fontSize: 12.5,
};

const dangerButton: React.CSSProperties = {
  color: "var(--status-delayed)",
  borderColor: "rgba(239, 68, 68, 0.35)",
};

const parentLink: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  width: "fit-content",
  padding: "4px 10px",
  borderRadius: "var(--radius-full)",
  border: "1px solid var(--border-subtle)",
  background: "var(--surface-2)",
  color: "var(--text-secondary)",
  fontSize: 12.5,
  fontWeight: 700,
  textDecoration: "none",
};

const subtaskBox: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: 12,
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-2)",
  background: "var(--surface-3)",
};

const subtaskRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  padding: "9px 11px",
  borderRadius: "var(--radius-2)",
  border: "1px solid var(--border-subtle)",
  background: "var(--surface-2)",
  color: "var(--text-primary)",
  textDecoration: "none",
};

const subtaskTitleText: React.CSSProperties = {
  fontSize: 13.5,
  fontWeight: 700,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  minWidth: 0,
};

const subtaskForm: React.CSSProperties = {
  display: "flex",
  gap: 8,
  marginTop: 4,
  paddingTop: 10,
  borderTop: "1px solid var(--border-subtle)",
};

const countPill: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  padding: "1px 7px",
  borderRadius: "var(--radius-full)",
  background: "var(--surface-3)",
  color: "var(--text-secondary)",
};
