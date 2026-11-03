"use client";
import { EntityHistory } from "@/components/history/EntityHistory";
import { LocalizedRelativeTime, LocalizedDate } from "@/lib/i18n/I18nProvider";

import { useI18n } from "@/lib/i18n/I18nProvider";
import { LocalizedText } from "@/lib/i18n/I18nProvider";

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
  Download,
  Edit3,
  ExternalLink,
  FileText,
  Flame,
  GitBranch,
  Image as ImageIcon,
  Layers,
  Link as LinkIcon,
  Github,
  ListChecks,
  MessageSquare,
  MessageSquareText,
  Mic,
  Paperclip,
  Plus,
  Send,
  Share2,
  Shield,
  Sparkles,
  Tag,
  Ticket,
  Upload,
  User,
  Users,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  createTask,
  getTask,
  listTasks,
  updateTask,
  updateTaskStatus,
  getTaskAssignmentCandidates,
} from "@/lib/api/projects";
import {
  addComment,
  downloadFile,
  listComments,
  listFiles,
  uploadFile,
} from "@/lib/api/collaboration";
import { VoiceBubble } from "@/components/chat/VoiceBubble";
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
import { DocumentationFiles } from "@/components/docs/DocumentationUpload";
import { TaskChecklist } from "@/components/tasks/TaskChecklist";
import { TaskEditorModal } from "@/components/tasks/TaskEditorModal";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useUserMap } from "@/lib/hooks";
import { relativeTime } from "@/lib/format";
import { useStaticExportParams } from "@/lib/static-export-route";
import type { TaskRead, TaskStatus, UUID, Priority } from "@/lib/types";
import { goBack } from "@/lib/navigation";

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
  const { t: translateUI } = useI18n();

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
  const [newComment, setNewComment] = useState("");
  const [showGitHubPicker, setShowGitHubPicker] = useState(false);
  const [activeTab, setActiveTab] = useState<"comments" | "attachments" | "history">("comments");
  const [priorityMenuOpen, setPriorityMenuOpen] = useState(false);
  const [assigneeMenuOpen, setAssigneeMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);

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

  const attachments = useQuery({
    queryKey: ["entity-files", "task", taskId],
    queryFn: () => listFiles("task", taskId as UUID),
    enabled: Boolean(taskId),
  });

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !taskId) return;
    setIsUploadingFile(true);
    try {
      await uploadFile("task", taskId as UUID, file, file.name);
      toast.push(translateUI("Attachment uploaded successfully"), "success");
      queryClient.invalidateQueries({ queryKey: ["entity-files", "task", taskId] });
    } catch {
      toast.push(translateUI("Could not upload file. Please try again."), "error");
    } finally {
      setIsUploadingFile(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDownloadFile = async (attachmentId: UUID, fileName: string) => {
    setDownloadingFileId(attachmentId);
    try {
      const blob = await downloadFile(attachmentId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toast.push(translateUI("Could not download file."), "error");
    } finally {
      setDownloadingFileId(null);
    }
  };

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
      if (saved.status === "Archived") { if (embedded) onClose?.(); else router.push("/tasks"); }
    },
    onError: () => toast.push("Could not update task status.", "error"),
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

  const copyTaskLink = () => {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(`${window.location.origin}/tasks/${taskId}`);
      toast.push("Task link copied to clipboard.", "info");
    }
  };

  const assignmentCandidates = useQuery({ queryKey: ["assignment-candidates", taskId], queryFn: () => getTaskAssignmentCandidates(taskId as UUID) , enabled: !!taskId });

  if (!taskId || task.isLoading) return <Spinner label={translateUI("Loading task details...")} />;

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
  const eligibleAssignees = assignmentCandidates.data ?? [];
  const assignmentOptions = [...eligibleAssignees, ...(assignmentCandidates.data ? (task.data?.assignee_user_ids ?? []).filter((id) => !eligibleAssignees.some((u) => u.id === id)).map((id) => ({ id, full_name: nameOf(id) })) : [])];
  const canManageAssignees = isSuperAdmin() || hasPermission("tasks.assign");
  const canEdit = canManageTask || isAssignedToCurrentUser;
  const canSelfAssign = Boolean(currentUser && hasPermission("tasks.edit_assigned") && eligibleAssignees.some((person) => person.id === currentUser.id));

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
              <X size={13} />{" "}<LocalizedText message={"Close"} />{" "}</button>
          ) : (
            <BackLink router={router} />
          )}
          <span className="nav-separator">/</span>
          {row.parent_task_id ? (
            <Link href={`/tasks/${row.parent_task_id}`} className="task-parent-badge">
              <GitBranch size={12} />
              <span><LocalizedText message={"Parent Task"} /></span>
            </Link>
          ) : (
            <span className="task-key-tag"><LocalizedText message={"TASK-"} />{row.id.slice(0, 8).toUpperCase()}</span>
          )}
        </div>

        <div className="task-nav-actions">
          <button type="button" onClick={copyTaskLink} className="task-action-btn" title={translateUI("Copy task link")}>
            <Share2 size={13} />
            <span><LocalizedText message={"Share"} /></span>
          </button>
          {row.github_url && (
            <a href={row.github_url} target="_blank" rel="noreferrer" className="task-action-btn" title={translateUI("Open GitHub")}>
              <ExternalLink size={13} />
              <span><LocalizedText message={"GitHub"} /></span>
            </a>
          )}
          {canEdit && (
            <>
              <button type="button" onClick={() => setEditOpen(true)} className="task-action-btn">
                <Edit3 size={13} />
                <span><LocalizedText message={"Full Edit"} /></span>
              </button>
              {row.status !== "Archived" && <button type="button" className="task-action-btn" disabled={changeStatus.isPending} onClick={() => { if (window.confirm(translateUI("Only a Super Admin can restore an archived task. Continue?"))) changeStatus.mutate("Archived"); }}>
                <span><LocalizedText message="Archive" /></span>
              </button>}
              {row.status !== "Done" ? (
                <button
                  type="button"
                  onClick={() => changeStatus.mutate("Done")}
                  disabled={changeStatus.isPending}
                  className="task-action-btn primary"
                >
                  <CheckCircle2 size={13} />
                  <span><LocalizedText message={"Mark Done"} /></span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => changeStatus.mutate("InProgress")}
                  disabled={changeStatus.isPending}
                  className="task-action-btn reopen"
                >
                  <AlertCircle size={13} />
                  <span><LocalizedText message={"Reopen"} /></span>
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
            >{" "}<LocalizedText message={"Save"} />{" "}</Button>
            <Button variant="secondary" size="sm" onClick={() => setIsEditingTitle(false)}>{" "}<LocalizedText message={"Cancel"} />{" "}</Button>
          </div>
        ) : (
          <div className="task-title-display-row" onClick={() => canEdit && setIsEditingTitle(true)}>
            <h1 className="task-title-heading">{row.title}</h1>
            {canEdit && (
              <button type="button" className="task-title-pencil" aria-label={translateUI("Edit title")}>
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
                {row.assignee_user_ids.length === 0 && <span className="unassigned-text"><LocalizedText message={"Unassigned"} /></span>}
              </div>
              <span className="prop-label"><LocalizedText message={"Assignee"} /></span>
            </button>
            {assigneeMenuOpen && (
              <div className="quick-popover-menu assignee-menu animate-fade-in">
                <div className="popover-heading"><LocalizedText message={"Assign Teammate"} /></div>
                {!isAssignedToCurrentUser && canSelfAssign && currentUser && (
                  <button
                    type="button"
                    onClick={() => {
                      assignToMe.mutate();
                      setAssigneeMenuOpen(false);
                    }}
                    className="popover-item highlight-btn"
                  >
                    <User size={13} />
                    <span><LocalizedText message={"Assign to me"} /></span>
                  </button>
                )}
                {assignmentCandidates.isError && <button type="button" onClick={() => assignmentCandidates.refetch()}>{translateUI("Retry loading members")}</button>}
                {canManageAssignees && assignmentOptions.map((u) => {
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
            <div className="quick-prop-pill points-pill" title={translateUI("Story Points")}>
              <Flame size={12} className="text-amber-400" />
              <span>{row.story_points}{" "}<LocalizedText message={"pts"} /></span>
            </div>
          )}

          {/* Due Date Indicator */}
          {row.due_date && (
            <div className="quick-prop-pill date-pill" title={`Due on ${row.due_date}`}>
              <Calendar size={12} />
              <span><LocalizedText message={"Due"} />{" "}<LocalizedDate value={row.due_date} /></span>
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
              <span className="card-title"><LocalizedText message={"Description"} /></span>
              {canEdit && !isEditingDesc && (
                <button type="button" onClick={() => setIsEditingDesc(true)} className="card-edit-btn">
                  <Edit3 size={13} />{" "}<LocalizedText message={"Edit"} />{" "}</button>
              )}
            </div>

            {isEditingDesc ? (
              <div className="desc-editor-wrap">
                <TextArea
                  value={descDraft}
                  onChange={(e) => setDescDraft(e.target.value)}
                  placeholder={translateUI("Add a detailed description in Markdown...")}
                  style={{ minHeight: 140, fontSize: 13.5 }}
                />
                <div className="desc-editor-actions">
                  <span className="text-xs text-neutral-400"><LocalizedText message={"Markdown supported"} /></span>
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" onClick={() => setIsEditingDesc(false)}>{" "}<LocalizedText message={"Cancel"} />{" "}</Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        updateTaskFields.mutate({ description: descDraft });
                        setIsEditingDesc(false);
                      }}
                    >{" "}<LocalizedText message={"Save description"} />{" "}</Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="desc-preview-wrap">
                <MarkdownPreview value={row.description ?? ""} empty="No description provided for this task." />
              </div>
            )}
          </div>

          <div className="task-content-card">
            <div className="card-top-bar"><span className="card-title"><LocalizedText message={"Uploaded documentation"} /></span></div>
            <div style={{ padding: 16 }}><DocumentationFiles entityType="task" entityId={row.id} /></div>
          </div>

          <TaskChecklist key={row.id} task={row} canEdit={canEdit} />

          {/* SUBTASKS HIERARCHY WITH PROGRESS */}
          <div className="task-content-card">
            <div className="card-top-bar">
              <div className="flex items-center gap-2">
                <GitBranch size={15} className="text-emerald-400" />
                <span className="card-title"><LocalizedText message={"Subtasks"} /></span>
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
                <span className="text-xs text-neutral-500"><LocalizedText message={"Loading subtasks…"} /></span>
              ) : subtaskList.length === 0 ? (
                <span className="text-xs text-neutral-500"><LocalizedText message={"No subtasks created yet."} /></span>
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
                    aria-label={translateUI("New subtask title")}
                    placeholder={translateUI("Add a new subtask…")}
                    value={subtaskTitle}
                    onChange={(event) => setSubtaskTitle(event.target.value)}
                    style={{ flex: 1 }}
                  />
                  <Button type="submit" size="sm" disabled={!subtaskTitle.trim() || addSubtask.isPending}>
                    <Plus size={14} /> {addSubtask.isPending ? <LocalizedText message={"Adding…"} /> : <LocalizedText message={"Add Subtask"} />}
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
                  <span><LocalizedText message={"Comments ("} />{(comments.data?.length ?? 0)})</span>
                </button>
                <button
                  type="button"
                  className={`tab-pill-btn ${activeTab === "attachments" ? "active" : ""}`}
                  onClick={() => setActiveTab("attachments")}
                >
                  <Paperclip size={13} />
                  <span><LocalizedText message={"Attachments"} /> ({(attachments.data?.length ?? 0)})</span>
                </button>
                <button
                  type="button"
                  className={`tab-pill-btn ${activeTab === "history" ? "active" : ""}`}
                  onClick={() => setActiveTab("history")}
                >
                  <Clock size={13} />
                  <span><LocalizedText message={"History & Changes"} /></span>
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
                      placeholder={translateUI("Add a comment… Type @name to mention a teammate")}
                      style={{ minHeight: 76, fontSize: 13.5 }}
                    />

                    {/* Mentions Dropdown */}
                    {mentionSuggestions.length > 0 && (
                      <div className="mentions-dropdown animate-fade-in">
                        <div className="mentions-header"><LocalizedText message={"Mention Teammate"} /></div>
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
                          title={translateUI("Mention GitHub Issue or Pull Request")}
                        >
                          <Github size={12} />{" "}<LocalizedText message={"Mention Issue/PR"} />{" "}</Button>
                        <span className="mention-tip">{" "}<LocalizedText message={"Tip: Type"} />{" "}<strong className="text-emerald-400"><LocalizedText message={"@user"} /></strong>{" "}<LocalizedText message={"to notify teammates."} />{" "}</span>
                      </div>
                      {newComment.trim() && (
                        <div className="flex gap-2">
                          <Button variant="secondary" size="sm" onClick={() => setNewComment("")}>{" "}<LocalizedText message={"Cancel"} />{" "}</Button>
                          <Button
                            variant="primary"
                            size="sm"
                            disabled={!newComment.trim() || postComment.isPending}
                            onClick={() => postComment.mutate(newComment.trim())}
                          >
                            <Send size={12} /> {postComment.isPending ? <LocalizedText message={"Posting…"} /> : <LocalizedText message={"Save comment"} />}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Comments List */}
                <div className="comments-list">
                  {comments.isLoading ? (
                    <span className="text-xs text-neutral-500"><LocalizedText message={"Loading comments…"} /></span>
                  ) : (comments.data?.length ?? 0) === 0 ? (
                    <div className="empty-comments-state">
                      <MessageSquareText size={24} className="text-neutral-500 mb-2" />
                      <p><LocalizedText message={"No comments yet. Start the conversation!"} /></p>
                    </div>
                  ) : (
                    comments.data!.map((c) => (
                      <div key={c.id} className="comment-bubble-card">
                        <Avatar name={nameOf(c.author_user_id)} size={30} />
                        <div className="comment-bubble-content">
                          <div className="comment-header">
                            <span className="comment-author">{nameOf(c.author_user_id)}</span>
                            <span className="comment-time">{<LocalizedRelativeTime value={c.created_at} />}</span>
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
            ) : activeTab === "attachments" ? (
              <div className="attachments-tab-view" style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
                {/* Upload Action Bar */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, paddingBottom: 12, borderBottom: "1px solid var(--border-default, #27272a)" }}>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                      <LocalizedText message={"Task Attachments & Media"} />
                    </span>
                    <p style={{ fontSize: 12, color: "var(--text-muted, #71717a)", margin: "2px 0 0" }}>
                      <LocalizedText message={"Voice recordings, screenshots, documents, and files attached to this task."} />
                    </p>
                  </div>
                  <div>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      style={{ display: "none" }}
                    />
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      disabled={isUploadingFile}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload size={13} /> {isUploadingFile ? <LocalizedText message={"Uploading…"} /> : <LocalizedText message={"Upload Attachment"} />}
                    </Button>
                  </div>
                </div>

                {/* Attachments List */}
                {attachments.isLoading ? (
                  <div style={{ padding: "32px 0", textAlign: "center", color: "var(--text-muted, #71717a)", fontSize: 13 }}>
                    <LocalizedText message={"Loading attachments…"} />
                  </div>
                ) : (attachments.data?.length ?? 0) === 0 ? (
                  <div className="empty-comments-state" style={{ padding: "40px 0", textAlign: "center" }}>
                    <Paperclip size={32} className="text-neutral-500 mb-2 opacity-60" style={{ margin: "0 auto 8px" }} />
                    <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted, #71717a)" }}>
                      <LocalizedText message={"No attachments yet. Click 'Upload Attachment' or attach files/voice notes via Telegram."} />
                    </p>
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
                    {attachments.data!.map((file) => {
                      const isVoice = file.file_name.endsWith(".ogg") || file.content_type.startsWith("audio/");
                      const isImage = file.content_type.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/i.test(file.file_name);
                      const isPdf = file.content_type.includes("pdf") || file.file_name.endsWith(".pdf");

                      return (
                        <div
                          key={file.id}
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 10,
                            padding: 12,
                            borderRadius: 8,
                            border: "1px solid var(--border-default, #27272a)",
                            background: "var(--surface-2, rgba(255,255,255,0.03))",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                              {isVoice ? (
                                <Mic size={18} style={{ color: "#F59E0B", flexShrink: 0 }} />
                              ) : isImage ? (
                                <ImageIcon size={18} style={{ color: "#38BDF8", flexShrink: 0 }} />
                              ) : (
                                <FileText size={18} style={{ color: isPdf ? "#EF4444" : "#00E261", flexShrink: 0 }} />
                              )}
                              <div style={{ minWidth: 0 }}>
                                <div
                                  style={{
                                    fontSize: 13,
                                    fontWeight: 500,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                  title={file.file_name}
                                >
                                  {file.file_name}
                                </div>
                                <div style={{ fontSize: 11, color: "var(--text-muted, #71717a)" }}>
                                  {(file.size_bytes / 1024).toFixed(1)} KB · <LocalizedDate value={file.created_at} />
                                </div>
                              </div>
                            </div>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              disabled={downloadingFileId === file.id}
                              onClick={() => handleDownloadFile(file.id, file.file_name)}
                              title={translateUI("Download file")}
                            >
                              <Download size={13} />
                              {downloadingFileId === file.id ? <LocalizedText message={"Downloading…"} /> : <LocalizedText message={"Download"} />}
                            </Button>
                          </div>

                          {/* Voice player for voice messages */}
                          {isVoice && (
                            <div style={{ marginTop: 2 }}>
                              <VoiceBubble attachmentId={file.id} />
                            </div>
                          )}

                          {/* Image preview thumbnail */}
                          {isImage && (
                            <div
                              style={{
                                marginTop: 4,
                                borderRadius: 6,
                                overflow: "hidden",
                                background: "rgba(0,0,0,0.2)",
                                maxHeight: 160,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <img
                                src={`/api/v1/files/${file.id}/download`}
                                alt={file.file_name}
                                style={{ maxWidth: "100%", maxHeight: 160, objectFit: "contain", display: "block" }}
                                loading="lazy"
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <EntityHistory entityType="task" entityId={row.id} />
            )}
          </div>
        </div>

        {/* RIGHT INSPECTOR PANEL (JIRA DETAILS ASIDE) */}
        <aside className="task-inspector-panel">
          {/* Card: Workflow & Status */}
          <div className="inspector-card">
            <span className="inspector-heading"><LocalizedText message={"Workflow & Status"} /></span>
            {canEdit && (
              <Field label={translateUI("Status")}>
                <Select translateOptions
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

            <Field label={translateUI("Priority")}>
              <Select translateOptions
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
              <span className="inspector-heading"><LocalizedText message={"Ownership"} /></span>
              {!isAssignedToCurrentUser && canSelfAssign && currentUser && (
                <button
                  type="button"
                  onClick={() => assignToMe.mutate()}
                  disabled={assignToMe.isPending}
                  className="quick-assign-btn"
                >{" "}<LocalizedText message={"Assign to me"} />{" "}</button>
              )}
            </div>

            <div className="people-field">
              <span className="field-label"><LocalizedText message={"Assignees"} /></span>
              <div className="people-list">
                {row.assignee_user_ids.length === 0 ? (
                  <span className="unassigned-muted"><LocalizedText message={"Unassigned"} /></span>
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
              <span className="field-label"><LocalizedText message={"Reporter"} /></span>
              <div className="person-row">
                <Avatar name={nameOf(row.created_by) || "System"} size={22} />
                <span className="person-name">{nameOf(row.created_by) || row.created_by || "System"}</span>
              </div>
            </div>

            <div className="people-field">
              <span className="field-label"><LocalizedText message={"Reviewer"} /></span>
              <div className="person-row">
                {row.reviewer_user_id ? (
                  <>
                    <Avatar name={nameOf(row.reviewer_user_id)} size={22} />
                    <span className="person-name">{nameOf(row.reviewer_user_id)}</span>
                  </>
                ) : (
                  <span className="unassigned-muted"><LocalizedText message={"No reviewer assigned"} /></span>
                )}
              </div>
            </div>
          </div>

          {/* Card: Planning & Time Tracking */}
          <div className="inspector-card">
            <span className="inspector-heading"><LocalizedText message={"Planning & Estimates"} /></span>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="field-label"><LocalizedText message={"Story Points"} /></span>
                <span className="field-val">{row.story_points != null ? `${row.story_points} pts` : "—"}</span>
              </div>
              <div>
                <span className="field-label"><LocalizedText message={"Est. Hours"} /></span>
                <span className="field-val">{row.estimated_hours != null ? `${row.estimated_hours}h` : "—"}</span>
              </div>
            </div>

            <div>
              <span className="field-label"><LocalizedText message={"Partition / Level"} /></span>
              <span className="field-val capitalize">{row.partition ? row.partition : <LocalizedText message={"Tech"} />}</span>
            </div>

            <div>
              <span className="field-label"><LocalizedText message={"Task Type"} /></span>
              <span className="field-val" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {row.is_ticket && <><Ticket size={13} />{" "}<LocalizedText message={"Ticket ·"} />{" "}</>}
                {String(row.task_type)}
              </span>
            </div>
          </div>

          {/* Card: Dates & Metadata */}
          <div className="inspector-card">
            <span className="inspector-heading"><LocalizedText message={"Dates & Schedule"} /></span>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="field-label"><LocalizedText message={"Start Date"} /></span>
                <span className="field-val"><LocalizedDate value={row.start_date} /></span>
              </div>
              <div>
                <span className="field-label"><LocalizedText message={"Due Date"} /></span>
                <span className="field-val"><LocalizedDate value={row.due_date} /></span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="field-label"><LocalizedText message={"Created"} /></span>
                <span className="field-val text-xs text-neutral-400">{<LocalizedDate value={row.created_at} />}</span>
              </div>
              <div>
                <span className="field-label"><LocalizedText message={"Updated"} /></span>
                <span className="field-val text-xs text-neutral-400">{<LocalizedDate value={row.updated_at} />}</span>
              </div>
            </div>
          </div>

          {/* Card: Labels */}
          <div className="inspector-card">
            <span className="inspector-heading"><LocalizedText message={"Labels"} /></span>
            <div className="labels-wrap">
              {row.labels.length === 0 ? (
                <span className="unassigned-muted"><LocalizedText message={"No labels"} /></span>
              ) : (
                row.labels.map((label) => (
                  <span key={label} className="task-label-tag">
                    <Tag size={10} /> {label}
                  </span>
                ))
              )}
            </div>
          </div>

          {/* Card: Attachments Quick Access */}
          <div className="inspector-card">
            <div className="flex items-center justify-between">
              <span className="inspector-heading"><LocalizedText message={"Attachments"} /></span>
              <button
                type="button"
                onClick={() => {
                  setActiveTab("attachments");
                  fileInputRef.current?.click();
                }}
                className="quick-assign-btn"
                title={translateUI("Upload file")}
              >
                <Plus size={11} /> <LocalizedText message={"Add"} />
              </button>
            </div>
            {attachments.isLoading ? (
              <span className="text-xs text-neutral-500"><LocalizedText message={"Loading…"} /></span>
            ) : (attachments.data?.length ?? 0) === 0 ? (
              <span className="unassigned-muted"><LocalizedText message={"No attachments"} /></span>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                {attachments.data!.slice(0, 4).map((att) => (
                  <div
                    key={att.id}
                    onClick={() => setActiveTab("attachments")}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 12,
                      cursor: "pointer",
                      padding: "4px 8px",
                      borderRadius: 4,
                      background: "rgba(255,255,255,0.03)",
                    }}
                  >
                    <Paperclip size={12} style={{ color: "var(--accent-primary, #00E261)", flexShrink: 0 }} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={att.file_name}>
                      {att.file_name}
                    </span>
                  </div>
                ))}
                {attachments.data!.length > 4 && (
                  <button
                    type="button"
                    onClick={() => setActiveTab("attachments")}
                    style={{ fontSize: 11, color: "var(--accent-secondary, #38BDF8)", textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: "2px 8px" }}
                  >
                    +{attachments.data!.length - 4} <LocalizedText message={"more files"} />…
                  </button>
                )}
              </div>
            )}
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
  return (
    <button type="button" onClick={() => goBack("/tasks")} className="task-back-btn">
      <ArrowLeft size={13} />{" "}<LocalizedText message={"Back"} />{" "}</button>
  );
}
