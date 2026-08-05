"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GitBranch, ListChecks, Plus } from "lucide-react";
import {
  createTask,
  getPhaseTasks,
  getProjectPhases,
  listProjects,
  listTasks,
  updateTask,
  updateTaskStatus,
} from "@/lib/api/projects";
import {
  Avatar,
  Button,
  Field,
  MarkdownPreview,
  Modal,
  PriorityBadge,
  Select,
  StatusChip,
  TextArea,
  TextInput,
  useToast,
} from "@/components/ds";
import { useUserMap } from "@/lib/hooks";
import type { TaskRead, TaskStatus, UUID } from "@/lib/types";

const TASK_STATUSES = [
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
const TASK_STATUS_LABELS: Record<string, string> = {
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
const TASK_TYPES = ["Feature", "Bug", "Enhancement", "Research", "Documentation", "Meeting", "Testing", "Deployment"];
const PARTITIONS = [
  { value: "tech", label: "Tech" },
  { value: "operations", label: "Operations" },
  { value: "business", label: "Business" },
  { value: "marketing", label: "Marketing" },
  { value: "sales", label: "Sales" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  task?: TaskRead | null;
  projectId?: UUID;
  phaseId?: UUID | null;
  onCreated?: (task: TaskRead) => void;
  onSaved?: (task: TaskRead) => void;
}

const emptyForm = {
  title: "",
  description: "",
  status: "Ready",
  task_type: "Feature",
  priority: "P2",
  partition: "tech",
  start_date: "",
  due_date: "",
  story_points: "",
  estimated_hours: "",
  github_url: "",
  reviewer_user_id: "",
  parent_task_id: "",
  assignee_user_ids: [] as UUID[],
  labels: "",
  checklist: "",
};

export function TaskEditorModal({ open, onClose, task, projectId, phaseId, onCreated, onSaved }: Props) {
  const toast = useToast();
  const qc = useQueryClient();
  const { users, nameOf } = useUserMap();
  const [selectedProjectId, setSelectedProjectId] = useState<UUID | "">(projectId ?? "");
  const [selectedPhaseId, setSelectedPhaseId] = useState<UUID | "">(phaseId ?? "");
  const [form, setForm] = useState(emptyForm);
  const isEdit = !!task;

  useEffect(() => {
    if (!open) return;
    setSelectedProjectId(projectId ?? "");
    setSelectedPhaseId((task?.phase_id ?? phaseId) ?? "");
    setForm(
      task
        ? {
            title: task.title,
            description: task.description ?? "",
            status: String(task.status),
            task_type: String(task.task_type),
            priority: String(task.priority),
            partition: task.partition ?? "tech",
            start_date: task.start_date ?? "",
            due_date: task.due_date ?? "",
            story_points: task.story_points != null ? String(task.story_points) : "",
            estimated_hours: task.estimated_hours != null ? String(task.estimated_hours) : "",
            github_url: task.github_url ?? "",
            reviewer_user_id: task.reviewer_user_id ?? "",
            parent_task_id: task.parent_task_id ?? "",
            assignee_user_ids: task.assignee_user_ids,
            labels: task.labels.join(", "),
            checklist: "",
          }
        : emptyForm,
    );
  }, [open, projectId, phaseId, task]);

  const projects = useQuery({
    queryKey: ["projects", "task-editor"],
    queryFn: () => listProjects(1, 200),
    enabled: open && !projectId,
  });
  const phases = useQuery({
    queryKey: ["project-phases", selectedProjectId, "task-editor"],
    queryFn: () => getProjectPhases(selectedProjectId as UUID),
    enabled: open && !!selectedProjectId,
  });
  const phaseTasks = useQuery({
    queryKey: ["phase-tasks", selectedPhaseId, "task-editor"],
    queryFn: () => getPhaseTasks(selectedPhaseId as UUID),
    enabled: open && !!selectedPhaseId,
  });
  const backlogTasks = useQuery({
    queryKey: ["tasks", "task-editor", "parents"],
    queryFn: () => listTasks({ page_size: 100 }),
    enabled: open && !selectedPhaseId,
  });

  const parentOptions = useMemo(() => {
    const tasks = selectedPhaseId ? phaseTasks.data ?? [] : backlogTasks.data?.items ?? [];
    return tasks.map((t) => ({ value: t.id, label: `${t.title.slice(0, 80)}${t.title.length > 80 ? "..." : ""}` }));
  }, [selectedPhaseId, phaseTasks.data, backlogTasks.data]);

  const toggleAssignee = (id: UUID) =>
    setForm((f) => ({
      ...f,
      assignee_user_ids: f.assignee_user_ids.includes(id)
        ? f.assignee_user_ids.filter((x) => x !== id)
        : [...f.assignee_user_ids, id],
    }));

  const create = useMutation({
    mutationFn: () =>
      createTask({
        phase_id: selectedPhaseId || null,
        parent_task_id: form.parent_task_id ? (form.parent_task_id as UUID) : null,
        title: form.title,
        description: form.description || undefined,
        task_type: form.task_type,
        priority: form.priority,
        status: form.status,
        story_points: form.story_points ? Number(form.story_points) : undefined,
        estimated_hours: form.estimated_hours ? Number(form.estimated_hours) : undefined,
        reviewer_user_id: form.reviewer_user_id ? (form.reviewer_user_id as UUID) : null,
        github_url: form.github_url || undefined,
        partition: form.partition || undefined,
        start_date: form.start_date || undefined,
        due_date: form.due_date || undefined,
        assignee_user_ids: form.assignee_user_ids,
        label_names: form.labels
          .split(",")
          .map((label) => label.trim())
          .filter(Boolean),
        checklist_items: form.checklist
          .split("\n")
          .map((text) => text.trim())
          .filter(Boolean)
          .map((text, order) => ({ text, order })),
      }),
    onSuccess: (task) => {
      toast.push("Task created.", "success");
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["phase-tasks"] });
      qc.invalidateQueries({ queryKey: ["phase-progress"] });
      qc.invalidateQueries({ queryKey: ["project-overview"] });
      setForm(emptyForm);
      onCreated?.(task);
      onClose();
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!task) throw new Error("No task selected.");
      let saved = await updateTask(task.id, {
        title: form.title,
        description: form.description || null,
        task_type: form.task_type,
        priority: form.priority,
        story_points: form.story_points ? Number(form.story_points) : null,
        estimated_hours: form.estimated_hours ? Number(form.estimated_hours) : null,
        reviewer_user_id: form.reviewer_user_id ? (form.reviewer_user_id as UUID) : null,
        partition: form.partition || null,
        start_date: form.start_date || null,
        due_date: form.due_date || null,
        assignee_user_ids: form.assignee_user_ids,
      });
      if (form.status !== task.status) {
        saved = await updateTaskStatus(task.id, form.status as TaskStatus);
      }
      return saved;
    },
    onSuccess: (saved) => {
      toast.push("Task updated.", "success");
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["task", saved.id] });
      qc.invalidateQueries({ queryKey: ["phase-tasks"] });
      qc.invalidateQueries({ queryKey: ["phase-progress"] });
      qc.invalidateQueries({ queryKey: ["project-overview"] });
      onSaved?.(saved);
      onClose();
    },
    onError: () => toast.push("Could not update task.", "error"),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit task" : "New task"}
      width={980}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!form.title.trim() || create.isPending || save.isPending}
            onClick={() => (isEdit ? save.mutate() : create.mutate())}
          >
            {isEdit ? (save.isPending ? "Saving..." : "Save changes") : create.isPending ? "Creating..." : "Create task"}
          </Button>
        </>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", gap: 18 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 style={sectionHeading}>Required</h2>
          <Field label="Title">
            <TextInput value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Short, action-oriented task title" />
          </Field>
          <Field label="Description (Markdown)">
            <TextArea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder={"## What\n\n## Acceptance criteria\n- \n\n## Notes / links"}
              style={{ minHeight: 170 }}
            />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
            <Field label="Status">
              <Select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} options={TASK_STATUSES.map((s) => ({ value: s, label: TASK_STATUS_LABELS[s] ?? s }))} />
            </Field>
            <Field label="Type">
              <Select value={form.task_type} onChange={(e) => setForm((f) => ({ ...f, task_type: e.target.value }))} options={TASK_TYPES.map((s) => ({ value: s, label: s }))} />
            </Field>
            <Field label="Priority">
              <Select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))} options={["P0", "P1", "P2", "P3"].map((s) => ({ value: s, label: s }))} />
            </Field>
            <Field label="Partition">
              <Select value={form.partition} onChange={(e) => setForm((f) => ({ ...f, partition: e.target.value }))} options={PARTITIONS} />
            </Field>
          </div>
          <h2 style={sectionHeading}>Scheduling</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
            <Field label="Start">
              <TextInput type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} />
            </Field>
            <Field label="Due / end">
              <TextInput type="date" value={form.due_date} onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} />
            </Field>
            <Field label="Story points">
              <TextInput type="number" min={0} value={form.story_points} onChange={(e) => setForm((f) => ({ ...f, story_points: e.target.value }))} />
            </Field>
            <Field label="Estimated hours">
              <TextInput type="number" min={0} value={form.estimated_hours} onChange={(e) => setForm((f) => ({ ...f, estimated_hours: e.target.value }))} />
            </Field>
          </div>
          <h2 style={sectionHeading}>GitHub / metadata</h2>
          <Field label="GitHub issue URL">
            <TextInput
              value={form.github_url}
              onChange={(e) => setForm((f) => ({ ...f, github_url: e.target.value }))}
              placeholder="https://github.com/org/repo/issues/123"
              disabled={isEdit}
              title={isEdit ? "GitHub URL is set when a task is created or imported." : undefined}
            />
          </Field>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 style={sectionHeading}>Assignment</h2>
          <div style={{ display: "grid", gridTemplateColumns: projectId ? "1fr" : "1fr 1fr", gap: 10 }}>
            {!projectId && (
              <Field label="Project">
                <Select
                  value={selectedProjectId}
                  onChange={(e) => {
                    setSelectedProjectId(e.target.value as UUID);
                    setSelectedPhaseId("");
                  }}
                  placeholder="Backlog or project..."
                  options={(projects.data?.items ?? []).map((p) => ({ value: p.id, label: p.name }))}
                />
              </Field>
            )}
            <Field label="Phase">
              <Select
                value={selectedPhaseId}
                onChange={(e) => setSelectedPhaseId(e.target.value as UUID)}
                placeholder={selectedProjectId ? "Choose phase..." : "Backlog task"}
                options={(phases.data ?? []).map((ph) => ({ value: ph.id, label: ph.name }))}
              />
            </Field>
          </div>
          <Field label="Parent task">
            <Select
              value={form.parent_task_id}
              onChange={(e) => setForm((f) => ({ ...f, parent_task_id: e.target.value }))}
              placeholder="Top-level task"
              options={parentOptions}
            />
          </Field>
          <Field label="Reviewer">
            <Select
              value={form.reviewer_user_id}
              onChange={(e) => setForm((f) => ({ ...f, reviewer_user_id: e.target.value }))}
              placeholder="No reviewer"
              options={users.map((u) => ({ value: u.id, label: u.full_name }))}
            />
          </Field>
          <div>
            <div style={sideLabel}>Assignees</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 150, overflowY: "auto" }}>
              {users.map((u) => (
                <label key={u.id} style={pickRow} title={u.full_name}>
                  <input type="checkbox" checked={form.assignee_user_ids.includes(u.id)} onChange={() => toggleAssignee(u.id)} />
                  <Avatar name={u.full_name} size={22} />
                  <span style={ellipsis}>{u.full_name}</span>
                </label>
              ))}
            </div>
          </div>
          <Field label="Labels">
            <TextInput
              value={form.labels}
              onChange={(e) => setForm((f) => ({ ...f, labels: e.target.value }))}
              placeholder="Backend, Frontend, API, Urgent"
              disabled={isEdit}
              title={isEdit ? "Labels are set when a task is created or imported." : undefined}
            />
          </Field>
          <h2 style={sectionHeading}>Advanced</h2>
          <Field label="Checklist">
            <TextArea value={form.checklist} onChange={(e) => setForm((f) => ({ ...f, checklist: e.target.value }))} placeholder={"One checklist item per line"} style={{ minHeight: 88 }} />
          </Field>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <StatusChip status={form.status} label={TASK_STATUS_LABELS[form.status] ?? form.status} />
            <PriorityBadge level={form.priority} compact />
            <span style={metaPill}><GitBranch size={12} /> {form.parent_task_id ? "Subtask" : "Top-level"}</span>
            {form.checklist.trim() && <span style={metaPill}><ListChecks size={12} /> {form.checklist.split("\n").filter(Boolean).length}</span>}
          </div>
          <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 10 }}>
            <div style={sideLabel}>Preview</div>
            <MarkdownPreview value={form.description} empty="Description preview appears here." />
          </div>
        </div>
      </div>
    </Modal>
  );
}

const sideLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "var(--text-tertiary)",
  marginBottom: 6,
};

const sectionHeading: React.CSSProperties = {
  margin: "2px 0 0",
  fontSize: 12,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--text-tertiary)",
};

const pickRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  minHeight: 32,
  padding: "5px 8px",
  borderRadius: "var(--radius-2)",
  background: "var(--surface-2)",
  color: "var(--text-secondary)",
  fontSize: 12.5,
  cursor: "pointer",
};

const ellipsis: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const metaPill: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  fontSize: 11,
  fontWeight: 700,
  color: "var(--text-secondary)",
  background: "var(--surface-2)",
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-full)",
  padding: "3px 8px",
};
