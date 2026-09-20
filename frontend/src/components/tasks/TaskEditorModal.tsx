"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GitBranch, Link2, ListChecks, Search, Ticket, UsersRound, X } from "lucide-react";
import {
  createTask,
  getProjectSprints,
  getSprintTasks,
  listProjects,
  listTasks,
  updateTask,
  updateTaskStatus,
} from "@/lib/api/projects";
import {
  addDocLink,
  deleteDocLink,
  listDocPages,
  listEntityDocLinks,
  searchDocPages,
} from "@/lib/api/docs";
import { listTeams } from "@/lib/api/organization";
import { SearchSuggestionInput } from "@/components/docs/SearchSuggestionInput";
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
import { useTaskPartitions, useUserMap } from "@/lib/hooks";
import { useAuth } from "@/lib/auth/AuthProvider";
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
const FALLBACK_PARTITIONS = [
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
  /** Users without task-assignment management may only change their own assignment. */
  canManageAssignees?: boolean;
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
  actual_hours: "",
  github_url: "",
  reviewer_user_id: "",
  parent_task_id: "",
  assignee_user_ids: [] as UUID[],
  labels: "",
  checklist: "",
  is_ticket: false,
};

export function TaskEditorModal({ open, onClose, task, projectId, phaseId, onCreated, onSaved, canManageAssignees }: Props) {
  const toast = useToast();
  const qc = useQueryClient();
  const { user: currentUser, hasPermission, isSuperAdmin } = useAuth();
  const canAssignAnyone = canManageAssignees ?? (isSuperAdmin() || hasPermission("tasks.assign"));
  const { users, nameOf } = useUserMap();
  const { partitions } = useTaskPartitions();
  const [selectedProjectId, setSelectedProjectId] = useState<UUID | "">(projectId ?? "");
  const [selectedPhaseId, setSelectedPhaseId] = useState<UUID | "">(phaseId ?? "");
  const [form, setForm] = useState(emptyForm);
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const [docSearch, setDocSearch] = useState("");
  const [ticketRecipientSearch, setTicketRecipientSearch] = useState("");
  const [ticketRecipientUserIds, setTicketRecipientUserIds] = useState<UUID[]>([]);
  const [ticketRecipientTeamIds, setTicketRecipientTeamIds] = useState<UUID[]>([]);
  const [selectedDocs, setSelectedDocs] = useState<{ id: string; title: string; linkId?: string }[]>([]);
  const isEdit = !!task;

  useEffect(() => {
    if (!open) return;
    setSelectedProjectId(projectId ?? "");
    setSelectedPhaseId((task?.phase_id ?? phaseId) ?? "");
    setAssigneeSearch("");
    setDocSearch("");
    setTicketRecipientSearch("");
    setTicketRecipientUserIds([]);
    setTicketRecipientTeamIds([]);
    if (!task) setSelectedDocs([]);
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
            actual_hours: task.actual_hours != null ? String(task.actual_hours) : "",
            github_url: task.github_url ?? "",
            reviewer_user_id: task.reviewer_user_id ?? "",
            parent_task_id: task.parent_task_id ?? "",
            assignee_user_ids: task.assignee_user_ids,
            labels: task.labels.join(", "),
            checklist: task.checklist_items.map((item) => item.text).join("\n"),
            is_ticket: task.is_ticket,
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
    queryFn: () => getProjectSprints(selectedProjectId as UUID),
    enabled: open && !!selectedProjectId,
  });
  const phaseTasks = useQuery({
    queryKey: ["phase-tasks", selectedPhaseId, "task-editor"],
    queryFn: () => getSprintTasks(selectedPhaseId as UUID),
    enabled: open && !!selectedPhaseId,
  });
  const linkedDocs = useQuery({
    queryKey: ["entity-doc-links", "task", task?.id],
    queryFn: () => listEntityDocLinks("task", task!.id),
    enabled: open && Boolean(task?.id),
  });
  const docs = useQuery({
    queryKey: ["task-doc-search", docSearch],
    queryFn: () => docSearch.trim().length >= 2 ? searchDocPages(docSearch.trim()) : listDocPages(),
    enabled: open,
  });
  const teams = useQuery({
    queryKey: ["teams", "task-ticket-picker"],
    queryFn: () => listTeams(),
    enabled: open && !isEdit,
  });

  useEffect(() => {
    if (!open || !task || !linkedDocs.data) return;
    setSelectedDocs(
      linkedDocs.data.map((link) => ({ id: link.page_id, title: link.title, linkId: link.id })),
    );
  }, [open, task, linkedDocs.data]);
  const backlogTasks = useQuery({
    queryKey: ["tasks", "task-editor", "parents"],
    queryFn: () => listTasks({ page_size: 100 }),
    enabled: open && !selectedPhaseId,
  });

  const parentOptions = useMemo(() => {
    const tasks = selectedPhaseId ? phaseTasks.data ?? [] : backlogTasks.data?.items ?? [];
    return tasks.map((t) => ({ value: t.id, label: `${t.title.slice(0, 80)}${t.title.length > 80 ? "..." : ""}` }));
  }, [selectedPhaseId, phaseTasks.data, backlogTasks.data]);

  const partitionOptions = useMemo(() => {
    const available = partitions.length
      ? partitions.map((partition) => ({ value: partition.slug, label: partition.name }))
      : FALLBACK_PARTITIONS;
    return form.partition && !available.some((option) => option.value === form.partition)
      ? [...available, { value: form.partition, label: form.partition }]
      : available;
  }, [form.partition, partitions]);

  const assignmentUsers = useMemo(() => {
    const query = assigneeSearch.trim().toLocaleLowerCase();
    if (!query) return users;
    return users.filter((user) => {
      const searchable = [
        user.full_name,
        user.email,
        user.username ?? "",
        ...user.roles,
      ].join(" ").toLocaleLowerCase();
      return searchable.includes(query)
        || form.assignee_user_ids.includes(user.id)
        || form.reviewer_user_id === user.id;
    });
  }, [assigneeSearch, form.assignee_user_ids, form.reviewer_user_id, users]);

  const toggleAssignee = (id: UUID) => {
    if (!canAssignAnyone && id !== currentUser?.id) return;
    setForm((f) => ({
      ...f,
      assignee_user_ids: f.assignee_user_ids.includes(id)
        ? f.assignee_user_ids.filter((x) => x !== id)
        : [...f.assignee_user_ids, id],
    }));
  };

  const create = useMutation({
    mutationFn: async () => {
      const created = await createTask({
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
        is_ticket: form.is_ticket,
        ticket_recipient_user_ids: ticketRecipientUserIds,
        ticket_recipient_team_ids: ticketRecipientTeamIds,
        label_names: form.labels
          .split(",")
          .map((label) => label.trim())
          .filter(Boolean),
        checklist_items: form.checklist
          .split("\n")
          .map((text) => text.trim())
          .filter(Boolean)
          .map((text, order) => ({ text, order })),
      });
      const docResults = await Promise.allSettled(
        selectedDocs.map((doc) => addDocLink(doc.id, { entity_type: "task", entity_id: created.id })),
      );
      return { task: created, docLinkFailures: docResults.filter((result) => result.status === "rejected").length };
    },
    onSuccess: ({ task, docLinkFailures }) => {
      toast.push(
        docLinkFailures ? `Task created, but ${docLinkFailures} document link(s) failed.` : "Task created.",
        docLinkFailures ? "error" : "success",
      );
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["phase-tasks"] });
      qc.invalidateQueries({ queryKey: ["phase-progress"] });
      qc.invalidateQueries({ queryKey: ["project-overview"] });
      qc.invalidateQueries({ queryKey: ["entity-doc-links", "task", task.id] });
      setForm(emptyForm);
      setTicketRecipientUserIds([]);
      setTicketRecipientTeamIds([]);
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
        actual_hours: form.actual_hours ? Number(form.actual_hours) : null,
        reviewer_user_id: form.reviewer_user_id ? (form.reviewer_user_id as UUID) : null,
        github_url: form.github_url || null,
        partition: form.partition || null,
        start_date: form.start_date || null,
        due_date: form.due_date || null,
        assignee_user_ids: form.assignee_user_ids,
        label_names: form.labels.split(",").map((label) => label.trim()).filter(Boolean),
        checklist_items: form.checklist.split("\n").map((text) => text.trim()).filter(Boolean).map((text, order) => ({ text, order })),
      });
      if (form.status !== task.status) {
        saved = await updateTaskStatus(task.id, form.status as TaskStatus);
      }
      const initialLinks = linkedDocs.data ?? [];
      const selectedIds = new Set(selectedDocs.map((doc) => doc.id));
      await Promise.all([
        ...selectedDocs
          .filter((doc) => !doc.linkId)
          .map((doc) => addDocLink(doc.id, { entity_type: "task", entity_id: task.id })),
        ...initialLinks
          .filter((link) => !selectedIds.has(link.page_id))
          .map((link) => deleteDocLink(link.page_id, link.id)),
      ]);
      return saved;
    },
    onSuccess: (saved) => {
      toast.push("Task updated.", "success");
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["task", saved.id] });
      qc.invalidateQueries({ queryKey: ["phase-tasks"] });
      qc.invalidateQueries({ queryKey: ["phase-progress"] });
      qc.invalidateQueries({ queryKey: ["project-overview"] });
      qc.invalidateQueries({ queryKey: ["entity-doc-links", "task", saved.id] });
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
            disabled={
              !form.title.trim()
              || create.isPending
              || save.isPending
              || (!isEdit && form.is_ticket && ticketRecipientUserIds.length === 0 && ticketRecipientTeamIds.length === 0)
            }
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
              <Select value={form.partition} onChange={(e) => setForm((f) => ({ ...f, partition: e.target.value }))} options={partitionOptions} />
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
            <Field label="Actual hours">
              <TextInput type="number" min={0} value={form.actual_hours} onChange={(e) => setForm((f) => ({ ...f, actual_hours: e.target.value }))} />
            </Field>
          </div>
          <h2 style={sectionHeading}>GitHub / metadata</h2>
          <Field label="GitHub issue URL">
            <TextInput
              value={form.github_url}
              onChange={(e) => setForm((f) => ({ ...f, github_url: e.target.value }))}
              placeholder="https://github.com/org/repo/issues/123"
            />
          </Field>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 style={sectionHeading}>Assignment</h2>
          {!isEdit && (
            <div
              style={{
                border: `1px solid ${form.is_ticket ? "color-mix(in srgb, var(--primary) 55%, var(--border-default))" : "var(--border-subtle)"}`,
                borderRadius: "var(--radius-md)",
                background: form.is_ticket ? "color-mix(in srgb, var(--primary) 7%, var(--surface-2))" : "var(--surface-2)",
                padding: 11,
                display: "flex",
                flexDirection: "column",
                gap: 9,
              }}
            >
              <label style={{ display: "flex", alignItems: "flex-start", gap: 9, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={form.is_ticket}
                  onChange={(event) => setForm((current) => ({ ...current, is_ticket: event.target.checked }))}
                  style={{ marginTop: 2 }}
                />
                <span>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 750 }}>
                    <Ticket size={14} /> Send as a ticket
                  </span>
                  <span style={{ display: "block", marginTop: 2, fontSize: 11.5, color: "var(--text-tertiary)" }}>
                    Notify selected people or every active member of a team and add it to their dashboard.
                  </span>
                </span>
              </label>
              {form.is_ticket && (
                <>
                  <SearchSuggestionInput
                    value={ticketRecipientSearch}
                    options={[
                      ...users
                        .filter((person) => person.id !== currentUser?.id && !ticketRecipientUserIds.includes(person.id))
                        .map((person) => ({
                          id: `user:${person.id}`,
                          label: person.full_name,
                          detail: person.email,
                        })),
                      ...(teams.data ?? [])
                        .filter((team) => !ticketRecipientTeamIds.includes(team.id))
                        .map((team) => ({
                          id: `team:${team.id}`,
                          label: team.name,
                          detail: `${team.member_count ?? 0} team member(s)`,
                        })),
                    ]}
                    placeholder="Search people or teams…"
                    ariaLabel="Search ticket recipients"
                    onChange={setTicketRecipientSearch}
                    onSelect={(option) => {
                      const [kind, id] = option.id.split(":") as ["user" | "team", UUID];
                      if (kind === "user") setTicketRecipientUserIds((current) => [...current, id]);
                      if (kind === "team") setTicketRecipientTeamIds((current) => [...current, id]);
                      setTicketRecipientSearch("");
                    }}
                  />
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {ticketRecipientUserIds.map((userId) => (
                      <button
                        key={userId}
                        type="button"
                        style={recipientPill}
                        onClick={() => setTicketRecipientUserIds((current) => current.filter((id) => id !== userId))}
                        aria-label={`Remove ${nameOf(userId)} from ticket recipients`}
                      >
                        <Avatar name={nameOf(userId)} size={18} /> {nameOf(userId)} <X size={12} />
                      </button>
                    ))}
                    {ticketRecipientTeamIds.map((teamId) => {
                      const team = teams.data?.find((item) => item.id === teamId);
                      return (
                        <button
                          key={teamId}
                          type="button"
                          style={recipientPill}
                          onClick={() => setTicketRecipientTeamIds((current) => current.filter((id) => id !== teamId))}
                          aria-label={`Remove ${team?.name ?? "team"} from ticket recipients`}
                        >
                          <UsersRound size={14} /> {team?.name ?? "Team"} <X size={12} />
                        </button>
                      );
                    })}
                  </div>
                  {ticketRecipientUserIds.length === 0 && ticketRecipientTeamIds.length === 0 && (
                    <span style={{ fontSize: 11.5, color: "var(--status-delayed)" }}>
                      Select at least one person or team.
                    </span>
                  )}
                </>
              )}
            </div>
          )}
          {isEdit && task?.is_ticket && (
            <span style={{ ...metaPill, alignSelf: "flex-start", color: "var(--primary)" }}>
              <Ticket size={12} /> Ticket
            </span>
          )}
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
            <Field label="Sprint">
              <Select
                value={selectedPhaseId}
                onChange={(e) => setSelectedPhaseId(e.target.value as UUID)}
                placeholder={selectedProjectId ? "Choose sprint..." : "Backlog task"}
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
              options={assignmentUsers.map((u) => ({ value: u.id, label: u.full_name }))}
            />
          </Field>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={sideLabel}>Assignees</div>
            <TextInput
              icon={<Search size={14} />}
              aria-label="Search people to assign"
              value={assigneeSearch}
              onChange={(event) => setAssigneeSearch(event.target.value)}
              placeholder="Search assignees…"
              style={{ minHeight: 36, fontSize: 12.5 }}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 150, overflowY: "auto" }}>
              {assignmentUsers.map((u) => (
                <label key={u.id} style={pickRow} title={u.full_name}>
                  <input type="checkbox" checked={form.assignee_user_ids.includes(u.id)} onChange={() => toggleAssignee(u.id)} disabled={!canAssignAnyone && u.id !== currentUser?.id} />
                  <Avatar name={u.full_name} size={22} />
                  <span style={ellipsis}>{u.full_name}</span>
                </label>
              ))}
              {assignmentUsers.length === 0 && (
                <div style={{ padding: "10px 8px", color: "var(--text-tertiary)", fontSize: 12.5 }}>
                  No matching people.
                </div>
              )}
            </div>
          </div>
          <Field label="Labels">
            <TextInput
              value={form.labels}
              onChange={(e) => setForm((f) => ({ ...f, labels: e.target.value }))}
              placeholder="Backend, Frontend, API, Urgent"
            />
          </Field>
          <h2 style={sectionHeading}>Connected documents</h2>
          <SearchSuggestionInput
            value={docSearch}
            options={(docs.data ?? [])
              .filter((doc) => !selectedDocs.some((selected) => selected.id === doc.id))
              .map((doc) => ({ id: doc.id, label: doc.title, detail: doc.excerpt ?? "Internal Docs" }))}
            placeholder="Search documents…"
            ariaLabel="Search documents to connect to task"
            onChange={setDocSearch}
            onSelect={(option) => {
              setSelectedDocs((current) => [...current, { id: option.id, title: option.label }]);
              setDocSearch("");
            }}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {selectedDocs.map((doc) => (
              <button
                key={doc.id}
                type="button"
                style={docRow}
                onClick={() => setSelectedDocs((current) => current.filter((item) => item.id !== doc.id))}
                aria-label={`Remove document ${doc.title}`}
              >
                <Link2 size={13} /> <span style={ellipsis}>{doc.title}</span> <X size={13} />
              </button>
            ))}
          </div>
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

const recipientPill: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-full)",
  background: "var(--surface-3)",
  color: "var(--text-secondary)",
  padding: "3px 7px",
  fontSize: 11.5,
  cursor: "pointer",
};

const docRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "auto minmax(0, 1fr) auto",
  alignItems: "center",
  gap: 7,
  width: "100%",
  padding: "7px 9px",
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-2)",
  background: "var(--surface-2)",
  color: "var(--text-secondary)",
  cursor: "pointer",
};
