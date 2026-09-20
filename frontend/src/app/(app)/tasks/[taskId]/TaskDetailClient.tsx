"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Edit3,
  ExternalLink,
  Flame,
  GitBranch,
  Layers,
  Link as LinkIcon,
  Github,
  ListChecks,
  MessageSquare,
  MessageSquareText,
  Plus,
  Send,
  Share2,
  Shield,
  Sparkles,
  Tag,
  Ticket,
  Trash2,
  User,
  Users,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  createTask,
  deleteTask,
  getTask,
  listTasks,
  updateChecklistItem,
  updateTask,
  updateTaskStatus,
} from "@/lib/api/projects";
import { addComment, listComments } from "@/lib/api/collaboration";
import { GitHubMentionPicker } from "@/components/github/GitHubMentionPicker";
import {
  Avatar,
  Button,
  Field,
  MarkdownPreview,
  PriorityBadge,
  Select,
  StatusChip,
  TextArea,
  TextInput,
  useToast,
} from "@/components/ds";
import { ErrorState, PageHeader, PAGE_STYLE, Spinner } from "@/components/ui/States";
import { TaskEditorModal } from "@/components/tasks/TaskEditorModal";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useUserMap } from "@/lib/hooks";
import { relativeTime } from "@/lib/format";
import { useStaticExportParams } from "@/lib/static-export-route";
import type { TaskRead, TaskStatus, UUID, Priority } from "@/lib/types";

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

const PRIORITY_OPTIONS: { value: Priority; label: string; color: string }[] = [
  { value: "P0", label: "P0 · Urgent / Blocker", color: "#EF4444" },
  { value: "P1", label: "P1 · High Priority", color: "#F59E0B" },
  { value: "P2", label: "P2 · Medium", color: "#00E261" },
  { value: "P3", label: "P3 · Low", color: "#38BDF8" },
];

interface TaskDetailClientProps {
  taskId?: UUID;
  embedded?: boolean;
  onClose?: () => void;
}

export default function TaskDetailPage({
  taskId: providedTaskId,
  embedded = false,
  onClose,
}: TaskDetailClientProps = {}) {
  const { taskId: exportedTaskId } = useParams<{ taskId?: string }>();
  const [routeTaskId] = useStaticExportParams([exportedTaskId ?? "_"], ["tasks"]);
  const taskId = providedTaskId ?? routeTaskId;
  const toast = useToast();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { user: currentUser, hasPermission, isSuperAdmin } = useAuth();
  const { users, nameOf } = useUserMap();

  // State
  const [editOpen, setEditOpen] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState("");
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [newChecklistText, setNewChecklistText] = useState("");
  const [newComment, setNewComment] = useState("");
  const [showGitHubPicker, setShowGitHubPicker] = useState(false);
  const [activeTab, setActiveTab] = useState<"comments" | "history">("comments");
  const [priorityMenuOpen, setPriorityMenuOpen] = useState(false);
  const [assigneeMenuOpen, setAssigneeMenuOpen] = useState(false);

  const task = useQuery({
    queryKey: ["task", taskId],
    queryFn: () => getTask(taskId as UUID),
    enabled: Boolean(taskId),
  });

  const subtasks = useQuery({
    queryKey: ["subtasks", taskId],
    queryFn: () => listTasks({ parent_task_id: taskId as UUID, page_size: 200 }),
    enabled: Boolean(taskId),
  });

  const comments = useQuery({
    queryKey: ["task-comments", taskId],
    queryFn: () => listComments("task", taskId as UUID),
    enabled: Boolean(taskId),
  });

  // Sync drafts when task loads
  useEffect(() => {
    if (task.data) {
      setTitleDraft(task.data.title);
      setDescDraft(task.data.description ?? "");
    }
  }, [task.data]);

  // Mention suggestions in comment composer
  const mentionFragment = newComment.match(/@([\w.-]{0,24})$/)?.[1]?.toLowerCase();
  const mentionSuggestions =
    mentionFragment == null
      ? []
      : users
          .filter((u) => {
            const handle = u.username ?? u.email.split("@")[0] ?? u.full_name.replace(/\s+/g, "");
            return (
              handle.toLowerCase().startsWith(mentionFragment) ||
              u.full_name.toLowerCase().includes(mentionFragment)
            );
          })
          .slice(0, 5);

  function getMentionedIds(text: string): UUID[] {
    const lower = text.toLowerCase();
    return users
      .filter((u) => {
        const handles = [
          u.username,
          u.email?.split("@")[0],
          u.full_name,
          u.full_name.replace(/\s+/g, ""),
        ]
          .filter(Boolean)
          .map((x) => String(x).toLowerCase());
        return handles.some((h) => lower.includes(`@${h}`));
      })
      .map((u) => u.id as UUID);
  }

  // Mutations
  const updateTaskFields = useMutation({
    mutationFn: (fields: Record<string, unknown>) => updateTask(taskId as UUID, fields),
    onSuccess: (saved) => {
      queryClient.setQueryData(["task", taskId], saved);
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["phase-tasks"] });
      toast.push("Task updated.", "success");
    },
    onError: () => toast.push("Could not update task.", "error"),
  });

  const postComment = useMutation({
    mutationFn: (body: string) =>
      addComment({
        entity_type: "task",
        entity_id: taskId as UUID,
        body,
        mentioned_user_ids: getMentionedIds(body),
      }),
    onSuccess: () => {
      setNewComment("");
      toast.push("Comment posted.", "success");
      queryClient.invalidateQueries({ queryKey: ["task-comments", taskId] });
    },
    onError: () => toast.push("Could not post comment.", "error"),
  });

  const assignToMe = useMutation({
    mutationFn: async () => {
      if (!currentUser || !task.data) return;
      const ids = Array.from(new Set([...task.data.assignee_user_ids, currentUser.id]));
      return updateTask(taskId as UUID, { assignee_user_ids: ids });
    },
    onSuccess: (saved) => {
      if (saved) {
        queryClient.setQueryData(["task", taskId], saved);
        queryClient.invalidateQueries({ queryKey: ["tasks"] });
        toast.push("Assigned to you.", "success");
      }
    },
    onError: () => toast.push("Could not update assignee.", "error"),
  });

  const toggleAssignee = (userId: UUID) => {
    if (!task.data || !canManageAssignees) return;
    const current = task.data.assignee_user_ids;
    const next = current.includes(userId)
      ? current.filter((id) => id !== userId)
      : [...current, userId];
    updateTaskFields.mutate({ assignee_user_ids: next });
  };

  const canCreateTasks = Boolean(currentUser);

  const changeStatus = useMutation({
    mutationFn: (status: TaskStatus) => updateTaskStatus(taskId as UUID, status),
    onSuccess: (saved) => {
      toast.push(saved.status === "Done" ? "Task completed 🎉" : "Task status updated.", "success");
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
      toast.push(saved.status === "Done" ? "Checklist complete. Task Done!" : "Checklist updated.", "success");
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
      if (embedded) onClose?.();
      else router.push("/tasks");
    },
    onError: () => toast.push("Could not delete task.", "error"),
  });

  const confirmDeleteTask = () => {
    if (window.confirm(`Delete "${task.data?.title ?? "this task"}"? This cannot be undone.`)) {
      removeTask.mutate();
    }
  };

  const copyTaskLink = () => {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(`${window.location.origin}/tasks/${taskId}`);
      toast.push("Task link copied to clipboard.", "info");
    }
  };

  if (!taskId || task.isLoading) return <Spinner label="Loading task details..." />;

  if (task.isError || !task.data) {
    return (
      <div style={embedded ? { padding: 8 } : PAGE_STYLE}>
        {!embedded && <BackLink router={router} />}
        <ErrorState message="Task could not be loaded. It may have been deleted, or you may lack access permissions." />
      </div>
    );
  }

  const row = task.data;
  const isAssignedToCurrentUser = currentUser ? row.assignee_user_ids.includes(currentUser.id) : false;
  const canManageTask = isSuperAdmin() || hasPermission(
    "tasks.manage_all",
    "tasks.manage_team",
    "tasks.manage_testing",
    "tasks.manage_design",
  );
  const canManageAssignees = isSuperAdmin() || hasPermission("tasks.assign");
  const canEdit = canManageTask || isAssignedToCurrentUser;
  const canSelfAssign = Boolean(currentUser && hasPermission("tasks.edit_assigned"));

  // Checklist Calculations
  const checklistTotal = row.checklist_items.length;
  const checklistCompleted = row.checklist_items.filter((i) => i.is_done).length;
  const checklistPercent = checklistTotal > 0 ? Math.round((checklistCompleted / checklistTotal) * 100) : 0;

  // Subtask Calculations
  const subtaskList = subtasks.data?.items ?? [];
  const subtaskTotal = subtaskList.length;
  const subtaskCompleted = subtaskList.filter((s) => s.status === "Done").length;
  const subtaskPercent = subtaskTotal > 0 ? Math.round((subtaskCompleted / subtaskTotal) * 100) : 0;

  return (
    <div
      style={embedded ? { ...PAGE_STYLE, padding: 0, maxWidth: "none" } : PAGE_STYLE}
      className="pmp-task-detail-page"
    >
      {/* 1. TOP BREADCRUMB & HEADER ACTIONS */}
      <div className="task-top-nav-bar">
        <div className="task-nav-left">
          {embedded ? (
            <button type="button" onClick={onClose} className="task-back-btn">
              <X size={13} /> Close
            </button>
          ) : (
            <BackLink router={router} />
          )}
          <span className="nav-separator">/</span>
          {row.parent_task_id ? (
            <Link href={`/tasks/${row.parent_task_id}`} className="task-parent-badge">
              <GitBranch size={12} />
              <span>Parent Task</span>
            </Link>
          ) : (
            <span className="task-key-tag">TASK-{row.id.slice(0, 8).toUpperCase()}</span>
          )}
        </div>

        <div className="task-nav-actions">
          <button type="button" onClick={copyTaskLink} className="task-action-btn" title="Copy task link">
            <Share2 size={13} />
            <span>Share</span>
          </button>
          {row.github_url && (
            <a href={row.github_url} target="_blank" rel="noreferrer" className="task-action-btn" title="Open GitHub">
              <ExternalLink size={13} />
              <span>GitHub</span>
            </a>
          )}
          {canEdit && (
            <>
              <button type="button" onClick={() => setEditOpen(true)} className="task-action-btn">
                <Edit3 size={13} />
                <span>Full Edit</span>
              </button>
              <button
                type="button"
                onClick={confirmDeleteTask}
                disabled={removeTask.isPending}
                className="task-action-btn danger"
              >
                <Trash2 size={13} />
                <span>Delete</span>
              </button>
              {row.status !== "Done" ? (
                <button
                  type="button"
                  onClick={() => changeStatus.mutate("Done")}
                  disabled={changeStatus.isPending}
                  className="task-action-btn primary"
                >
                  <CheckCircle2 size={13} />
                  <span>Mark Done</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => changeStatus.mutate("InProgress")}
                  disabled={changeStatus.isPending}
                  className="task-action-btn reopen"
                >
                  <AlertCircle size={13} />
                  <span>Reopen</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* 2. TASK TITLE & JIRA QUICK PROPERTIES BAR */}
      <div className="task-hero-block">
        {isEditingTitle ? (
          <div className="task-title-edit-row">
            <input
              type="text"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (titleDraft.trim() && titleDraft !== row.title) {
                    updateTaskFields.mutate({ title: titleDraft.trim() });
                  }
                  setIsEditingTitle(false);
                } else if (e.key === "Escape") {
                  setTitleDraft(row.title);
                  setIsEditingTitle(false);
                }
              }}
              autoFocus
              className="task-title-input"
            />
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                if (titleDraft.trim() && titleDraft !== row.title) {
                  updateTaskFields.mutate({ title: titleDraft.trim() });
                }
                setIsEditingTitle(false);
              }}
            >
              Save
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setIsEditingTitle(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className="task-title-display-row" onClick={() => canEdit && setIsEditingTitle(true)}>
            <h1 className="task-title-heading">{row.title}</h1>
            {canEdit && (
              <button type="button" className="task-title-pencil" aria-label="Edit title">
                <Edit3 size={15} />
              </button>
            )}
          </div>
        )}

        {/* JIRA QUICK PROPERTY PILL BAR */}
        <div className="task-quick-props-bar">
          {/* Interactive Status Chip */}
          <StatusChip
            status={String(row.status)}
            label={STATUS_LABELS[String(row.status)] ?? String(row.status)}
            onChange={canEdit ? (next) => changeStatus.mutate(next as TaskStatus) : undefined}
          />

          {/* Priority Pill */}
          <div className="relative inline-block">
            <button
              type="button"
              onClick={() => canEdit && setPriorityMenuOpen((v) => !v)}
              className="quick-prop-pill priority-pill"
            >
              <PriorityBadge level={row.priority} />
            </button>
            {priorityMenuOpen && (
              <div className="quick-popover-menu animate-fade-in">
                {PRIORITY_OPTIONS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    className={`popover-item ${row.priority === p.value ? "active" : ""}`}
                    onClick={() => {
                      updateTaskFields.mutate({ priority: p.value });
                      setPriorityMenuOpen(false);
                    }}
                  >
                    <span className="priority-color-dot" style={{ background: p.color }} />
                    <span>{p.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Assignee Avatar Stack */}
          <div className="relative inline-block">
            <button
              type="button"
              onClick={() => (canManageAssignees || canSelfAssign) && setAssigneeMenuOpen((v) => !v)}
              className="quick-prop-pill assignee-pill"
            >
              <div className="avatar-stack">
                {row.assignee_user_ids.slice(0, 3).map((id, i) => (
                  <span key={id} style={{ marginLeft: i === 0 ? 0 : -8 }} title={nameOf(id)}>
                    <Avatar name={nameOf(id)} size={20} />
                  </span>
                ))}
                {row.assignee_user_ids.length === 0 && <span className="unassigned-text">Unassigned</span>}
              </div>
              <span className="prop-label">Assignee</span>
            </button>
            {assigneeMenuOpen && (
              <div className="quick-popover-menu assignee-menu animate-fade-in">
                <div className="popover-heading">Assign Teammate</div>
                {!isAssignedToCurrentUser && currentUser && (
                  <button
                    type="button"
                    onClick={() => {
                      assignToMe.mutate();
                      setAssigneeMenuOpen(false);
                    }}
                    className="popover-item highlight-btn"
                  >
                    <User size={13} />
                    <span>Assign to me</span>
                  </button>
                )}
                {canManageAssignees && users.map((u) => {
                  const isAssigned = row.assignee_user_ids.includes(u.id as UUID);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => toggleAssignee(u.id as UUID)}
                      className={`popover-item user-item ${isAssigned ? "active" : ""}`}
                    >
                      <Avatar name={u.full_name} size={22} />
                      <span className="user-name">{u.full_name}</span>
                      {isAssigned && <Check size={14} className="text-emerald-400 ml-auto" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Story Points Pill */}
          {row.story_points != null && (
            <div className="quick-prop-pill points-pill" title="Story Points">
              <Flame size={12} className="text-amber-400" />
              <span>{row.story_points} pts</span>
            </div>
          )}

          {/* Due Date Indicator */}
          {row.due_date && (
            <div className="quick-prop-pill date-pill" title={`Due on ${row.due_date}`}>
              <Calendar size={12} />
              <span>Due {row.due_date}</span>
            </div>
          )}
        </div>
      </div>

      {/* 3. TWO-COLUMN JIRA WORKSPACE LAYOUT */}
      <section className="pmp-task-workspace-grid">
        {/* LEFT CANVAS: Description, Checklist, Subtasks, Activity & Comments */}
        <div className="task-main-canvas">
          {/* DESCRIPTION BOX */}
          <div className="task-content-card">
            <div className="card-top-bar">
              <span className="card-title">Description</span>
              {canEdit && !isEditingDesc && (
                <button type="button" onClick={() => setIsEditingDesc(true)} className="card-edit-btn">
                  <Edit3 size={13} /> Edit
                </button>
              )}
            </div>

            {isEditingDesc ? (
              <div className="desc-editor-wrap">
                <TextArea
                  value={descDraft}
                  onChange={(e) => setDescDraft(e.target.value)}
                  placeholder="Add a detailed description in Markdown..."
                  style={{ minHeight: 140, fontSize: 13.5 }}
                />
                <div className="desc-editor-actions">
                  <span className="text-xs text-neutral-400">Markdown supported</span>
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" onClick={() => setIsEditingDesc(false)}>
                      Cancel
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        updateTaskFields.mutate({ description: descDraft });
                        setIsEditingDesc(false);
                      }}
                    >
                      Save description
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="desc-preview-wrap">
                <MarkdownPreview value={row.description ?? ""} empty="No description provided for this task." />
              </div>
            )}
          </div>

          {/* INTERACTIVE CHECKLIST WITH PROGRESS BAR */}
          <div className="task-content-card">
            <div className="card-top-bar">
              <div className="flex items-center gap-2">
                <ListChecks size={15} className="text-emerald-400" />
                <span className="card-title">Checklist</span>
                {checklistTotal > 0 && (
                  <span className="progress-fraction">
                    {checklistCompleted}/{checklistTotal} ({checklistPercent}%)
                  </span>
                )}
              </div>
            </div>

            {checklistTotal > 0 && (
              <div className="checklist-progress-track">
                <div
                  className="checklist-progress-fill"
                  style={{ width: `${checklistPercent}%` }}
                />
              </div>
            )}

            <div className="checklist-items-list">
              {row.checklist_items.length === 0 ? (
                <span className="text-xs text-neutral-500">No checklist items defined yet.</span>
              ) : (
                row.checklist_items.map((item) => (
                  <label key={item.id} className="checklist-item-row">
                    <input
                      type="checkbox"
                      checked={item.is_done}
                      disabled={!canEdit || toggleChecklist.isPending}
                      onChange={(event) =>
                        toggleChecklist.mutate({ itemId: item.id, isDone: event.target.checked })
                      }
                      className="task-custom-checkbox"
                    />
                    <span className={`checklist-item-text ${item.is_done ? "is-done" : ""}`}>
                      {item.text}
                    </span>
                  </label>
                ))
              )}
            </div>

            {checklistTotal > 0 && (
              <div className="checklist-hint">
                <CheckCircle2 size={12} /> Checking all items automatically advances task to Done.
              </div>
            )}
          </div>

          {/* SUBTASKS HIERARCHY WITH PROGRESS */}
          <div className="task-content-card">
            <div className="card-top-bar">
              <div className="flex items-center gap-2">
                <GitBranch size={15} className="text-emerald-400" />
                <span className="card-title">Subtasks</span>
                {subtaskTotal > 0 && (
                  <span className="progress-fraction">
                    {subtaskCompleted}/{subtaskTotal} ({subtaskPercent}%)
                  </span>
                )}
              </div>
            </div>

            {subtaskTotal > 0 && (
              <div className="checklist-progress-track">
                <div className="checklist-progress-fill" style={{ width: `${subtaskPercent}%` }} />
              </div>
            )}

            <div className="subtasks-list">
              {subtasks.isLoading ? (
                <span className="text-xs text-neutral-500">Loading subtasks…</span>
              ) : subtaskList.length === 0 ? (
                <span className="text-xs text-neutral-500">No subtasks created yet.</span>
              ) : (
                subtaskList.map((sub) => (
                  <Link key={sub.id} href={`/tasks/${sub.id}`} className="subtask-item-card">
                    <span className="subtask-title" title={sub.title}>
                      {sub.title}
                    </span>
                    <div className="subtask-right-meta">
                      <div className="avatar-stack">
                        {sub.assignee_user_ids.slice(0, 2).map((id, i) => (
                          <span key={id} style={{ marginLeft: i === 0 ? 0 : -6 }} title={nameOf(id)}>
                            <Avatar name={nameOf(id)} size={18} />
                          </span>
                        ))}
                      </div>
                      <StatusChip
                        status={String(sub.status)}
                        label={STATUS_LABELS[String(sub.status)] ?? String(sub.status)}
                      />
                    </div>
                  </Link>
                ))
              )}

              {canCreateTasks && (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const title = subtaskTitle.trim();
                    if (title) addSubtask.mutate(title);
                  }}
                  className="subtask-add-form"
                >
                  <TextInput
                    aria-label="New subtask title"
                    placeholder="Add a new subtask…"
                    value={subtaskTitle}
                    onChange={(event) => setSubtaskTitle(event.target.value)}
                    style={{ flex: 1 }}
                  />
                  <Button type="submit" size="sm" disabled={!subtaskTitle.trim() || addSubtask.isPending}>
                    <Plus size={14} /> {addSubtask.isPending ? "Adding…" : "Add Subtask"}
                  </Button>
                </form>
              )}
            </div>
          </div>

          {/* JIRA ACTIVITY & COMMENTS */}
          <div className="task-content-card">
            <div className="card-top-bar">
              <div className="tab-pill-group">
                <button
                  type="button"
                  className={`tab-pill-btn ${activeTab === "comments" ? "active" : ""}`}
                  onClick={() => setActiveTab("comments")}
                >
                  <MessageSquare size={13} />
                  <span>Comments ({(comments.data?.length ?? 0)})</span>
                </button>
                <button
                  type="button"
                  className={`tab-pill-btn ${activeTab === "history" ? "active" : ""}`}
                  onClick={() => setActiveTab("history")}
                >
                  <Clock size={13} />
                  <span>History &amp; Changes</span>
                </button>
              </div>
            </div>

            {activeTab === "comments" ? (
              <div className="comments-stream-wrap">
                {/* Comment Composer */}
                <div className="comment-composer-box">
                  <Avatar name={currentUser?.full_name ?? "User"} size={32} />
                  <div className="composer-input-area">
                    <TextArea
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Add a comment… Type @name to mention a teammate"
                      style={{ minHeight: 76, fontSize: 13.5 }}
                    />

                    {/* Mentions Dropdown */}
                    {mentionSuggestions.length > 0 && (
                      <div className="mentions-dropdown animate-fade-in">
                        <div className="mentions-header">Mention Teammate</div>
                        {mentionSuggestions.map((u) => {
                          const handle =
                            u.username ?? u.email.split("@")[0] ?? u.full_name.replace(/\s+/g, "");
                          return (
                            <button
                              key={u.id}
                              type="button"
                              onClick={() =>
                                setNewComment((current) =>
                                  current.replace(/@([\w.-]{0,24})$/, `@${handle} `)
                                )
                              }
                              className="mention-row-item"
                            >
                              <Avatar name={u.full_name} size={22} />
                              <span className="mention-name">{u.full_name}</span>
                              <span className="mention-handle">@{handle}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* GitHub Mentions Picker */}
                    {showGitHubPicker && (
                      <GitHubMentionPicker
                        onSelect={(repo, item) => {
                          setNewComment((prev) => `${prev} [#${item.number} ${item.title}](${item.html_url}) `);
                          setShowGitHubPicker(false);
                        }}
                        onClose={() => setShowGitHubPicker(false)}
                      />
                    )}

                    <div className="composer-bottom-bar">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setShowGitHubPicker((v) => !v)}
                          title="Mention GitHub Issue or Pull Request"
                        >
                          <Github size={12} /> Mention Issue/PR
                        </Button>
                        <span className="mention-tip">
                          Tip: Type <strong className="text-emerald-400">@user</strong> to notify teammates.
                        </span>
                      </div>
                      {newComment.trim() && (
                        <div className="flex gap-2">
                          <Button variant="secondary" size="sm" onClick={() => setNewComment("")}>
                            Cancel
                          </Button>
                          <Button
                            variant="primary"
                            size="sm"
                            disabled={!newComment.trim() || postComment.isPending}
                            onClick={() => postComment.mutate(newComment.trim())}
                          >
                            <Send size={12} /> {postComment.isPending ? "Posting…" : "Save comment"}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Comments List */}
                <div className="comments-list">
                  {comments.isLoading ? (
                    <span className="text-xs text-neutral-500">Loading comments…</span>
                  ) : (comments.data?.length ?? 0) === 0 ? (
                    <div className="empty-comments-state">
                      <MessageSquareText size={24} className="text-neutral-500 mb-2" />
                      <p>No comments yet. Start the conversation!</p>
                    </div>
                  ) : (
                    comments.data!.map((c) => (
                      <div key={c.id} className="comment-bubble-card">
                        <Avatar name={nameOf(c.author_user_id)} size={30} />
                        <div className="comment-bubble-content">
                          <div className="comment-header">
                            <span className="comment-author">{nameOf(c.author_user_id)}</span>
                            <span className="comment-time">{relativeTime(c.created_at)}</span>
                          </div>
                          <div className="comment-body">
                            <MarkdownPreview value={c.body} />
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="history-tab-view">
                <div className="history-row">
                  <span className="history-dot" />
                  <div className="history-text">
                    <b>Task created</b> on {new Date(row.created_at).toLocaleDateString()} by{" "}
                    {row.created_by ? nameOf(row.created_by) || row.created_by : "System"}
                  </div>
                </div>
                <div className="history-row">
                  <span className="history-dot" />
                  <div className="history-text">
                    <b>Last modified</b> on {new Date(row.updated_at).toLocaleDateString()}
                  </div>
                </div>
                {row.completed_at && (
                  <div className="history-row">
                    <span className="history-dot green" />
                    <div className="history-text">
                      <b>Completed</b> on {new Date(row.completed_at).toLocaleDateString()}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT INSPECTOR PANEL (JIRA DETAILS ASIDE) */}
        <aside className="task-inspector-panel">
          {/* Card: Workflow & Status */}
          <div className="inspector-card">
            <span className="inspector-heading">Workflow &amp; Status</span>
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

            <Field label="Priority">
              <Select
                value={String(row.priority)}
                onChange={(event) => updateTaskFields.mutate({ priority: event.target.value })}
                disabled={!canEdit || updateTaskFields.isPending}
                options={PRIORITY_OPTIONS.map((p) => ({
                  value: p.value,
                  label: p.label,
                }))}
              />
            </Field>
          </div>

          {/* Card: People & Ownership */}
          <div className="inspector-card">
            <div className="flex items-center justify-between">
              <span className="inspector-heading">Ownership</span>
              {!isAssignedToCurrentUser && currentUser && (
                <button
                  type="button"
                  onClick={() => assignToMe.mutate()}
                  disabled={assignToMe.isPending}
                  className="quick-assign-btn"
                >
                  Assign to me
                </button>
              )}
            </div>

            <div className="people-field">
              <span className="field-label">Assignees</span>
              <div className="people-list">
                {row.assignee_user_ids.length === 0 ? (
                  <span className="unassigned-muted">Unassigned</span>
                ) : (
                  row.assignee_user_ids.map((id) => (
                    <div key={id} className="person-row">
                      <Avatar name={nameOf(id)} size={22} />
                      <span className="person-name">{nameOf(id)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="people-field">
              <span className="field-label">Reporter</span>
              <div className="person-row">
                <Avatar name={nameOf(row.created_by) || "System"} size={22} />
                <span className="person-name">{nameOf(row.created_by) || row.created_by || "System"}</span>
              </div>
            </div>

            <div className="people-field">
              <span className="field-label">Reviewer</span>
              <div className="person-row">
                {row.reviewer_user_id ? (
                  <>
                    <Avatar name={nameOf(row.reviewer_user_id)} size={22} />
                    <span className="person-name">{nameOf(row.reviewer_user_id)}</span>
                  </>
                ) : (
                  <span className="unassigned-muted">No reviewer assigned</span>
                )}
              </div>
            </div>
          </div>

          {/* Card: Planning & Time Tracking */}
          <div className="inspector-card">
            <span className="inspector-heading">Planning &amp; Estimates</span>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="field-label">Story Points</span>
                <span className="field-val">{row.story_points != null ? `${row.story_points} pts` : "—"}</span>
              </div>
              <div>
                <span className="field-label">Est. Hours</span>
                <span className="field-val">{row.estimated_hours != null ? `${row.estimated_hours}h` : "—"}</span>
              </div>
            </div>

            <div>
              <span className="field-label">Partition / Level</span>
              <span className="field-val capitalize">{row.partition ? row.partition : "Tech"}</span>
            </div>

            <div>
              <span className="field-label">Task Type</span>
              <span className="field-val" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {row.is_ticket && <><Ticket size={13} /> Ticket · </>}
                {String(row.task_type)}
              </span>
            </div>
          </div>

          {/* Card: Dates & Metadata */}
          <div className="inspector-card">
            <span className="inspector-heading">Dates &amp; Schedule</span>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="field-label">Start Date</span>
                <span className="field-val">{row.start_date ?? "—"}</span>
              </div>
              <div>
                <span className="field-label">Due Date</span>
                <span className="field-val">{row.due_date ?? "—"}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="field-label">Created</span>
                <span className="field-val text-xs text-neutral-400">{row.created_at.slice(0, 10)}</span>
              </div>
              <div>
                <span className="field-label">Updated</span>
                <span className="field-val text-xs text-neutral-400">{row.updated_at.slice(0, 10)}</span>
              </div>
            </div>
          </div>

          {/* Card: Labels */}
          <div className="inspector-card">
            <span className="inspector-heading">Labels</span>
            <div className="labels-wrap">
              {row.labels.length === 0 ? (
                <span className="unassigned-muted">No labels</span>
              ) : (
                row.labels.map((label) => (
                  <span key={label} className="task-label-tag">
                    <Tag size={10} /> {label}
                  </span>
                ))
              )}
            </div>
          </div>
        </aside>
      </section>

      {/* FULL TASK EDITOR MODAL */}
      <TaskEditorModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        task={row}
        canManageAssignees={canManageAssignees}
        onSaved={(saved: TaskRead) => queryClient.setQueryData(["task", taskId], saved)}
      />
    </div>
  );
}

/** Smart Back Navigation */
function BackLink({ router }: { router: ReturnType<typeof useRouter> }) {
  const [canGoBack, setCanGoBack] = useState(false);
  useEffect(() => {
    setCanGoBack(window.history.length > 1);
  }, []);

  if (canGoBack) {
    return (
      <button type="button" onClick={() => router.back()} className="task-back-btn">
        <ArrowLeft size={13} /> Back
      </button>
    );
  }
  return (
    <Link href="/tasks" className="task-back-btn">
      <ArrowLeft size={13} /> Tasks
    </Link>
  );
}
