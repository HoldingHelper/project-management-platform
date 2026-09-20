"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ExternalLink, GripVertical, Link2, Plus, SlidersHorizontal, Ticket, X } from "lucide-react";
import {
  attachTask,
  detachTask,
  getProjectSprints,
  listProjects,
  listTasks,
  reorderTasks,
  updateTask,
  updateTaskStatus,
} from "@/lib/api/projects";
import {
  Avatar,
  Button,
  DataTable,
  Field,
  Modal,
  PriorityBadge,
  Select,
  StatusChip,
  Tabs,
  TextInput,
  useToast,
  type Column,
} from "@/components/ds";
import { TaskEditorModal } from "@/components/tasks/TaskEditorModal";
import { PageHeader, PAGE_STYLE, Spinner } from "@/components/ui/States";
import { useAuth } from "@/lib/auth/AuthProvider";
import { AppError } from "@/lib/api/client";
import { useTaskPartitions, useUserMap } from "@/lib/hooks";
import { TASK_SORT_OPTIONS, sortTasks, type TaskSortMode } from "@/lib/task-sort";
import type { TaskRead, UUID } from "@/lib/types";

const STATUS_OPTIONS = [
  "NotStarted", "Ready", "InProgress", "Waiting", "Blocked",
  "Review", "Testing", "Done", "Cancelled", "Archived",
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

export default function TasksPageWrapper() {
  return (
    <Suspense fallback={<Spinner label="Loading tasks…" />}>
      <TasksPage />
    </Suspense>
  );
}

function TasksPage() {
  const searchParams = useSearchParams();
  const { user, hasPermission, isSuperAdmin } = useAuth();
  const [view, setView] = useState<string>(searchParams.get("view") ?? "all");
  const [mode, setMode] = useState<string>("list");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [partition, setPartition] = useState<string>("all");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [createdMonth, setCreatedMonth] = useState("");
  const [dueMonth, setDueMonth] = useState("");
  const [label, setLabel] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [unattachedOnly, setUnattachedOnly] = useState(false);
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [page, setPage] = useState(1);
  const [attachTarget, setAttachTarget] = useState<TaskRead | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const { nameOf, users } = useUserMap();
  const { partitions } = useTaskPartitions();

  useEffect(() => {
    const nextView = searchParams.get("view");
    if (nextView) setView(nextView);
  }, [searchParams]);

  const canAttach = isSuperAdmin() || hasPermission("tasks.manage_all", "projects.manage_all");
  const canCreate = Boolean(user);

  const { data, error, isError, isFetching, isLoading, refetch } = useQuery({
    queryKey: ["tasks", partition, label, status, unattachedOnly, search],
    queryFn: () =>
      listTasks({
        partition: partition === "all" ? undefined : partition,
        label: label || undefined,
        status: status || undefined,
        unattached: unattachedOnly ? true : undefined,
        search: search || undefined,
        page: 1,
        page_size: 500,
      }),
  });
  const projects = useQuery({ queryKey: ["projects", "task-page"], queryFn: () => listProjects(1, 200) });
  const projectPhases = useQuery({
    queryKey: ["project-phases-map", projects.data?.items.map((p) => p.id).join(",")],
    queryFn: async () => {
      const rows = await Promise.all(
        (projects.data?.items ?? []).map(async (project) => ({
          project,
          phases: await getProjectSprints(project.id),
        })),
      );
      const phaseToProject = new Map<UUID, { id: UUID; name: string }>();
      for (const row of rows) {
        for (const phase of row.phases) phaseToProject.set(phase.id, { id: row.project.id, name: row.project.name });
      }
      return phaseToProject;
    },
    enabled: (projects.data?.items.length ?? 0) > 0,
  });

  const phaseToProject = projectPhases.data ?? new Map<UUID, { id: UUID; name: string }>();
  const allRows = data?.items ?? [];
  const filteredRows = useMemo(() => {
    let rows = allRows;
    if (view === "my" && user) rows = rows.filter((t) => t.assignee_user_ids.includes(user.id));
    if (view === "my-blocked" && user) rows = rows.filter((t) => t.assignee_user_ids.includes(user.id) && t.status === "Blocked");
    if (view === "my-done" && user) rows = rows.filter((t) => t.assignee_user_ids.includes(user.id) && t.status === "Done");
    if (view === "review" || view === "needs-review") rows = rows.filter((t) => ["Review", "Testing", "Waiting"].includes(String(t.status)));
    if (view === "blocked") rows = rows.filter((t) => t.status === "Blocked");
    if (view === "backlog") rows = rows.filter((t) => !t.phase_id);
    if (view === "due-week") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const week = new Date(today);
      week.setDate(today.getDate() + 7);
      rows = rows.filter((t) => {
        if (!t.due_date) return false;
        const due = new Date(t.due_date);
        return due >= today && due <= week;
      });
    }
    if (projectFilter !== "all") rows = rows.filter((t) => t.phase_id && phaseToProject.get(t.phase_id)?.id === projectFilter);
    if (assigneeFilter !== "all") {
      if (assigneeFilter === "unassigned") rows = rows.filter((t) => t.assignee_user_ids.length === 0);
      else rows = rows.filter((t) => t.assignee_user_ids.includes(assigneeFilter as UUID));
    }
    if (createdMonth) rows = rows.filter((t) => t.created_at?.slice(0, 7) === createdMonth);
    if (dueMonth) rows = rows.filter((t) => t.due_date?.slice(0, 7) === dueMonth);
    return rows;
  }, [allRows, view, user, projectFilter, phaseToProject, assigneeFilter, createdMonth, dueMonth]);
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / 50));
  const pageRows = filteredRows.slice((page - 1) * 50, page * 50);

  const queryClient = useQueryClient();
  const toast = useToast();

  const updateStatusMutation = useMutation({
    mutationFn: ({ taskId, nextStatus }: { taskId: UUID; nextStatus: string }) =>
      updateTaskStatus(taskId, nextStatus as any),
    onSuccess: (saved) => {
      toast.push(saved.status === "Done" ? "Task completed." : "Task status updated.", "success");
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["phase-tasks"] });
    },
    onError: () => toast.push("Could not update task status.", "error"),
  });

  const columns: Column<TaskRead>[] = useMemo(
    () => [
      {
        key: "title",
        header: "Task",
        sortValue: (t) => t.title.toLowerCase(),
        render: (t) => (
          <span style={{ display: "flex", alignItems: "center", gap: 8, maxWidth: 480 }}>
            <Link
              href={`/tasks/${t.id}`}
              style={{
                color: "var(--text-primary)",
                fontWeight: 750,
                fontSize: 14,
                overflow: "hidden",
                textDecoration: "none",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={t.title}
            >
              {t.title}
            </Link>
            {t.parent_task_id && (
              <Link
                href={`/tasks/${t.parent_task_id}`}
                title="Subtask — open parent task"
                onClick={(e) => e.stopPropagation()}
                style={subtaskBadge}
              >
                Subtask
              </Link>
            )}
            {t.github_url && (
              <a href={t.github_url} target="_blank" rel="noreferrer" title="Open GitHub issue" onClick={(e) => e.stopPropagation()}>
                <ExternalLink size={13} style={{ color: "var(--text-tertiary)" }} />
              </a>
            )}
          </span>
        ),
      },
      {
        key: "partition",
        header: "Partition",
        sortValue: (t) => t.partition ?? "",
        render: (t) =>
          t.partition ? (
            <span
              style={{
                  fontSize: 12,
                  padding: "3px 9px",
                borderRadius: "var(--radius-full)",
                background: t.partition === "tech" ? "var(--status-in-progress-bg)" : "rgba(196,139,139,0.16)",
                color: t.partition === "tech" ? "var(--status-in-progress)" : "var(--accent-secondary)",
                textTransform: "capitalize",
              }}
            >
              {t.partition}
            </span>
          ) : (
            "—"
          ),
      },
      {
        key: "labels",
        header: "Labels",
        sortValue: (t) => t.labels.join(", ").toLocaleLowerCase(),
        render: (t) => (
          <span style={{ display: "flex", gap: 4 }}>
            {t.labels.map((l) => (
              <span key={l} style={{ fontSize: 11, padding: "2px 8px", borderRadius: "var(--radius-full)", background: "var(--surface-2)", color: "var(--text-secondary)" }}>
                {l}
              </span>
            ))}
          </span>
        ),
      },
      {
        key: "status",
        header: "Status",
        sortValue: (t) => String(t.status),
        render: (t) => (
          <StatusChip
            status={String(t.status)}
            label={STATUS_LABELS[String(t.status)] ?? String(t.status)}
            onChange={
              canCreate
                ? (next) => updateStatusMutation.mutate({ taskId: t.id, nextStatus: next })
                : undefined
            }
          />
        ),
      },
      {
        key: "type",
        header: "Type",
        sortValue: (t) => String(t.task_type),
        render: (t) => (
          <span style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            <span style={smallPill}>{t.task_type}</span>
            {t.is_ticket && <span style={{ ...smallPill, color: "var(--primary)" }}><Ticket size={11} /> Ticket</span>}
          </span>
        ),
      },
      {
        key: "priority",
        header: "Priority",
        sortValue: (t) => ({ P0: 0, P1: 1, P2: 2, P3: 3 }[String(t.priority)] ?? 99),
        render: (t) => <PriorityBadge level={t.priority} compact />,
      },
      {
        key: "assignees",
        header: "Assignees",
        sortValue: (t) => t.assignee_user_ids.map((id) => nameOf(id)).sort().join(", ").toLocaleLowerCase(),
        render: (t) => (
          <span style={{ display: "flex" }}>
            {t.assignee_user_ids.slice(0, 4).map((id, i) => (
              <span key={id} style={{ marginLeft: i === 0 ? 0 : -8 }} title={nameOf(id)}>
                <Avatar name={nameOf(id)} size={24} />
              </span>
            ))}
            {t.assignee_user_ids.length === 0 && (
              <span style={{ color: "var(--text-tertiary)", fontSize: 12 }}>Unassigned</span>
            )}
          </span>
        ),
      },
      {
        key: "dates",
        header: "Dates",
        sortValue: (t) => t.due_date ?? t.created_at,
        render: (t) => (
          <span style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 11.5, color: "var(--text-tertiary)" }}>
            <span>Created {t.created_at.slice(0, 10)}</span>
            {t.due_date && <span>Due {t.due_date}</span>}
          </span>
        ),
      },
      {
        key: "attached",
        header: "Project",
        sortValue: (t) => t.phase_id ? phaseToProject.get(t.phase_id)?.name.toLocaleLowerCase() ?? "" : "zzzz",
        render: (t) =>
          t.phase_id ? (
            <span style={{ color: "var(--status-completed)", fontSize: 12 }}>
              {phaseToProject.get(t.phase_id)?.name ?? "Attached"}
            </span>
          ) : (
            <span style={{ color: "var(--text-tertiary)", fontSize: 12 }}>Backlog</span>
          ),
      },
      {
        key: "actions",
        header: "",
        align: "right",
        render: (t) =>
          canAttach ? (
            <Button variant="tertiary" aria-label={`${t.phase_id ? "Move" : "Attach"} task ${t.title}`} onClick={() => setAttachTarget(t)}>
              <Link2 size={13} /> {t.phase_id ? "Move" : "Attach"}
            </Button>
          ) : null,
      },
    ],
    [nameOf, canAttach, phaseToProject],
  );

  const hasFilters =
    view !== "all" ||
    partition !== "all" ||
    projectFilter !== "all" ||
    assigneeFilter !== "all" ||
    !!createdMonth ||
    !!dueMonth ||
    !!label ||
    !!status ||
    unattachedOnly ||
    !!search;

  const activeFilters = [
    view !== "all" ? `View: ${viewLabel(view)}` : null,
    partition !== "all" ? `Partition: ${partition}` : null,
    projectFilter !== "all" ? `Project: ${projects.data?.items.find((p) => p.id === projectFilter)?.name ?? "Selected"}` : null,
    assigneeFilter !== "all" ? `Assignee: ${assigneeFilter === "unassigned" ? "Unassigned" : nameOf(assigneeFilter)}` : null,
    createdMonth ? `Created: ${createdMonth}` : null,
    dueMonth ? `Due: ${dueMonth}` : null,
    label ? `Label: ${label}` : null,
    status ? `Status: ${STATUS_LABELS[status] ?? status}` : null,
    unattachedOnly ? "Backlog only" : null,
    search ? `Search: ${search}` : null,
  ].filter(Boolean) as string[];

  function clearFilters() {
    setView("all");
    setPartition("all");
    setProjectFilter("all");
    setAssigneeFilter("all");
    setCreatedMonth("");
    setDueMonth("");
    setLabel("");
    setStatus("");
    setUnattachedOnly(false);
    setSearch("");
    setPage(1);
  }

  function applySavedFilter(key: "my-blocked" | "due-week" | "needs-review" | "backlog") {
    clearFilters();
    window.setTimeout(() => {
      setView(key);
      if (key === "backlog") setUnattachedOnly(true);
    }, 0);
  }

  return (
    <div style={PAGE_STYLE}>
      <PageHeader
        title="Task Browser"
        subtitle={`${filteredRows.length} visible · ${data?.total_count ?? 0} loaded · imported from GitHub issues and created in-app.`}
        actions={
          canCreate ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus size={14} /> New task
            </Button>
          ) : undefined
        }
      />

      <Tabs
        items={[
          { key: "all", label: "All" },
          { key: "my", label: "My tasks" },
          { key: "my-done", label: "My done" },
          { key: "review", label: "Review queue" },
          { key: "blocked", label: "Blocked" },
          { key: "backlog", label: "Backlog" },
        ]}
        active={view}
        onChange={(key) => {
          setView(key);
          setPage(1);
        }}
      />
      <Tabs
        items={[
          { key: "list", label: "List" },
          { key: "monthly", label: "Monthly" },
        ]}
        active={mode}
        onChange={(key) => setMode(key)}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "var(--text-tertiary)", fontWeight: 700 }}>Saved filters</span>
        <Button variant="secondary" onClick={() => applySavedFilter("my-blocked")}>My blocked</Button>
        <Button variant="secondary" onClick={() => applySavedFilter("due-week")}>Due this week</Button>
        <Button variant="secondary" onClick={() => applySavedFilter("needs-review")}>Needs review</Button>
        <Button variant="secondary" onClick={() => applySavedFilter("backlog")}>Backlog</Button>
      </div>

      <button className="pmp-mobile-filter-trigger" type="button" onClick={() => setFiltersOpen(true)} aria-expanded={filtersOpen}>
        <SlidersHorizontal size={17} /> Filters
        {activeFilters.length > 0 && <span className="pmp-nav-badge">{activeFilters.length}</span>}
      </button>
      {filtersOpen && <button className="pmp-task-filter-scrim" aria-label="Close filters" onClick={() => setFiltersOpen(false)} />}
      <section className={`pmp-task-filter-panel ${filtersOpen ? "is-open" : ""}`} aria-label="Task filters">
        <div className="pmp-task-filter-header">
          <div><strong>Filter tasks</strong><small>Narrow the current queue</small></div>
          <button className="pmp-icon-btn" type="button" onClick={() => setFiltersOpen(false)} aria-label="Close filters"><X size={18} /></button>
        </div>
      <div className="pmp-task-filter-controls" style={{ display: "flex", gap: 10, margin: "14px 0", flexWrap: "wrap", alignItems: "center" }}>
        <TextInput
          aria-label="Search tasks by title"
          placeholder="Search title…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          style={{ width: 260 }}
        />
        <Select
          value={partition}
          aria-label="Filter tasks by partition"
          onChange={(e) => {
            setPartition(e.target.value);
            setPage(1);
          }}
          options={[
            { value: "all", label: "All partitions" },
            ...partitions.map((item) => ({ value: item.slug, label: item.name })),
          ]}
        />
        <Select
          value={projectFilter}
          aria-label="Filter tasks by project"
          onChange={(e) => {
            setProjectFilter(e.target.value);
            setPage(1);
          }}
          options={[
            { value: "all", label: "All projects" },
            ...(projects.data?.items ?? []).map((p) => ({ value: p.id, label: p.name })),
          ]}
        />
        <Select
          value={assigneeFilter}
          aria-label="Filter tasks by assignee"
          onChange={(e) => {
            setAssigneeFilter(e.target.value);
            setPage(1);
          }}
          options={[
            { value: "all", label: "All assignees" },
            { value: "unassigned", label: "Unassigned" },
            ...(users ?? []).map((u) => ({ value: u.id, label: u.full_name })),
          ]}
        />
        <Select
          value={label}
          aria-label="Filter tasks by label"
          onChange={(e) => setLabel(e.target.value)}
          placeholder="All labels"
          options={[
            { value: "Backend", label: "Backend" },
            { value: "Frontend", label: "Frontend" },
          ]}
        />
        <Select
          value={status}
          aria-label="Filter tasks by status"
          onChange={(e) => setStatus(e.target.value)}
          placeholder="All statuses"
          options={STATUS_OPTIONS.map((s) => ({ value: s, label: STATUS_LABELS[s] ?? s }))}
        />
        <TextInput
          type="month"
          aria-label="Filter tasks by created month"
          value={createdMonth}
          onChange={(e) => {
            setCreatedMonth(e.target.value);
            setPage(1);
          }}
          title="Created month"
          style={{ width: 150 }}
        />
        <TextInput
          type="month"
          aria-label="Filter tasks by due month"
          value={dueMonth}
          onChange={(e) => {
            setDueMonth(e.target.value);
            setPage(1);
          }}
          title="Due/end month"
          style={{ width: 150 }}
        />
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--text-secondary)", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={unattachedOnly}
            onChange={(e) => setUnattachedOnly(e.target.checked)}
          />
          Backlog only (no project)
        </label>
      </div>
        <div className="pmp-task-filter-actions">
          <Button variant="tertiary" onClick={clearFilters}>Clear all</Button>
          <Button onClick={() => setFiltersOpen(false)}>Show {filteredRows.length} tasks</Button>
        </div>
      </section>

      {activeFilters.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }} aria-label="Active task filters">
          {activeFilters.map((f) => (
            <span key={f} style={filterChip}>{f}</span>
          ))}
          <Button variant="tertiary" onClick={clearFilters}>Clear filters</Button>
        </div>
      )}

      {isLoading ? (
        <Spinner label="Loading tasks…" />
      ) : isError ? (
        <TaskLoadError error={error} isFetching={isFetching} onRetry={() => refetch()} />
      ) : mode === "monthly" ? (
        <MonthlyTaskPlanner rows={filteredRows} nameOf={nameOf} canAttach={canAttach} />
      ) : (
        <>
          <div style={{ background: "var(--surface-2)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-3)", overflow: "hidden" }}>
            <DataTable columns={columns} rows={pageRows} rowKey={(t) => t.id} emptyText={hasFilters ? "No tasks match these filters. Clear filters to see more work." : "No tasks yet."} />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
              Page {page} of {totalPages}
            </span>
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button
              variant="secondary"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </>
      )}

      <AttachModal task={attachTarget} onClose={() => setAttachTarget(null)} />
      <TaskEditorModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string) {
  if (key === "unscheduled") return "No month";
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString([], { month: "short", year: "numeric" });
}

function endOfMonthIso(key: string) {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month, 0).toISOString().slice(0, 10);
}

function MonthlyTaskPlanner({
  rows,
  nameOf,
  canAttach,
}: {
  rows: TaskRead[];
  nameOf: (id?: string | null) => string;
  canAttach: boolean;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [dragId, setDragId] = useState<UUID | null>(null);
  const [sortMode, setSortMode] = useState<TaskSortMode>("manual");
  const [anchor, setAnchor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const months = useMemo(() => {
    const start = new Date(anchor);
    start.setMonth(start.getMonth() - 1);
    return Array.from({ length: 6 }, (_, index) => {
      const next = new Date(start);
      next.setMonth(start.getMonth() + index);
      return monthKey(next);
    });
  }, [anchor]);

  const moveTask = useMutation({
    mutationFn: async ({ task, targetMonth, groups }: { task: TaskRead; targetMonth: string; groups: UUID[][] }) => {
      const currentMonth = task.due_date?.slice(0, 7) ?? "unscheduled";
      if (currentMonth !== targetMonth) {
        await updateTask(task.id, { due_date: targetMonth === "unscheduled" ? null : endOfMonthIso(targetMonth) });
      }
      await Promise.all(groups.filter((group) => group.length > 0).map((group) => reorderTasks(group)));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["project-overview"] });
    },
    onError: () => toast.push("Could not move task to that month.", "error"),
  });

  const grouped = useMemo(() => {
    const map = new Map<string, TaskRead[]>([["unscheduled", []], ...months.map((m) => [m, [] as TaskRead[]] as const)]);
    for (const task of rows) {
      const key = task.due_date?.slice(0, 7);
      if (key && map.has(key)) map.get(key)!.push(task);
      else if (!key) map.get("unscheduled")!.push(task);
    }
    for (const [key, tasks] of map) map.set(key, sortTasks(tasks, sortMode, nameOf));
    return map;
  }, [rows, months, nameOf, sortMode]);

  const dropOn = (targetMonth: string, beforeId?: UUID) => {
    if (!dragId) return;
    if (beforeId === dragId) {
      setDragId(null);
      return;
    }
    const task = rows.find((row) => row.id === dragId);
    setDragId(null);
    if (!task) return;
    const current = task.due_date?.slice(0, 7) ?? "unscheduled";
    const sourceOrder = (grouped.get(current) ?? []).filter((item) => item.id !== task.id).map((item) => item.id);
    const targetOrder = (grouped.get(targetMonth) ?? []).filter((item) => item.id !== task.id).map((item) => item.id);
    const insertAt = beforeId ? targetOrder.indexOf(beforeId) : targetOrder.length;
    targetOrder.splice(insertAt < 0 ? targetOrder.length : insertAt, 0, task.id);
    setSortMode("manual");
    moveTask.mutate({ task, targetMonth, groups: current === targetMonth ? [targetOrder] : [sourceOrder, targetOrder] });
  };

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--text-secondary)", fontSize: 13, fontWeight: 700 }}>
          <CalendarDays size={16} /> Monthly delivery plan
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <Select
            aria-label="Sort tasks in monthly planner"
            value={sortMode}
            onChange={(event) => setSortMode(event.target.value as TaskSortMode)}
            options={TASK_SORT_OPTIONS}
          />
          <Button
            variant="secondary"
            onClick={() => setAnchor((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
          >
            Previous
          </Button>
          <Button
            variant="secondary"
            onClick={() => setAnchor(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}
          >
            Today
          </Button>
          <Button
            variant="secondary"
            onClick={() => setAnchor((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
          >
            Next
          </Button>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(240px, 0.9fr) repeat(6, minmax(240px, 1fr))", gap: 12, overflowX: "auto", paddingBottom: 6 }}>
        {["unscheduled", ...months].map((bucket) => {
          const tasks = grouped.get(bucket) ?? [];
          return (
            <div
              key={bucket}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => dropOn(bucket)}
              style={{
                minHeight: 280,
                border: `1px solid ${dragId ? "var(--border-strong)" : "var(--border-subtle)"}`,
                borderRadius: "var(--radius-3)",
                background: bucket === "unscheduled" ? "var(--surface-1)" : "var(--surface-2)",
                padding: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 800 }}>{monthLabel(bucket)}</div>
                <div style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--text-tertiary)" }}>{tasks.length}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    draggable={canAttach}
                    onDragStart={() => setDragId(task.id)}
                    onDragEnd={() => setDragId(null)}
                    onDragOver={(event) => {
                      if (canAttach) event.preventDefault();
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      dropOn(bucket, task.id);
                    }}
                    style={{
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "var(--radius-2)",
                      background: "var(--surface-3)",
                      padding: 11,
                      cursor: canAttach ? "grab" : "default",
                    }}
                  >
                    {canAttach && (
                      <span title="Drag to reorder or move" aria-hidden="true" style={{ float: "right", color: "var(--text-tertiary)", cursor: "grab" }}>
                        <GripVertical size={15} />
                      </span>
                    )}
                    <Link
                      href={`/tasks/${task.id}`}
                      style={{ display: "block", color: "var(--text-primary)", textDecoration: "none", fontSize: 13.5, fontWeight: 800, lineHeight: "18px" }}
                    >
                      {task.title}
                    </Link>
                    <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <StatusChip status={String(task.status)} label={STATUS_LABELS[String(task.status)] ?? String(task.status)} />
                      {task.is_ticket && <span style={{ ...smallPill, color: "var(--primary)" }}><Ticket size={11} /> Ticket</span>}
                      <span style={smallPill}>{task.partition ?? "No partition"}</span>
                    </div>
                    <div style={{ marginTop: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                        {task.assignee_user_ids.length ? task.assignee_user_ids.map((id) => nameOf(id)).join(", ") : "Unassigned"}
                      </span>
                      <PriorityBadge level={task.priority} compact />
                    </div>
                  </div>
                ))}
                {tasks.length === 0 && (
                  <div style={{ padding: "18px 8px", color: "var(--text-tertiary)", fontSize: 12.5, textAlign: "center" }}>
                    Drop tasks here
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function TaskLoadError({
  error,
  isFetching,
  onRetry,
}: {
  error: Error | null;
  isFetching: boolean;
  onRetry: () => void;
}) {
  const details =
    error instanceof AppError
      ? `${error.status} ${error.message}`
      : error?.message || "The task request failed.";
  return (
    <section
      role="alert"
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 16,
        padding: 18,
        borderRadius: "var(--radius-3)",
        border: "1px solid color-mix(in srgb, var(--status-delayed) 44%, var(--border-default))",
        background: "var(--status-delayed-bg)",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 800 }}>Tasks could not be loaded.</div>
        <div style={{ marginTop: 4, fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
          The task browser received an API error, so this is not being shown as an empty task list.
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
          {details}
        </div>
      </div>
      <Button variant="secondary" disabled={isFetching} onClick={onRetry}>
        {isFetching ? "Retrying..." : "Retry"}
      </Button>
    </section>
  );
}

function viewLabel(view: string) {
  const labels: Record<string, string> = {
    all: "All",
    my: "My tasks",
    "my-blocked": "My blocked",
    "my-done": "My done",
    review: "Review queue",
    "needs-review": "Needs review",
    blocked: "Blocked",
    backlog: "Backlog",
    "due-week": "Due this week",
  };
  return labels[view] ?? view;
}

function AttachModal({ task, onClose }: { task: TaskRead | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [projectId, setProjectId] = useState<UUID | "">("");
  const [phaseId, setPhaseId] = useState<UUID | "">("");

  const { data: projects } = useQuery({
    queryKey: ["projects"],
    queryFn: () => listProjects(1, 100),
    enabled: !!task,
  });
  const { data: phases } = useQuery({
    queryKey: ["project-phases", projectId],
    queryFn: () => getProjectSprints(projectId as UUID),
    enabled: !!projectId,
  });

  const attach = useMutation({
    mutationFn: () => attachTask(task!.id, phaseId as UUID),
    onSuccess: () => {
      toast.push("Task attached to project.", "success");
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      onClose();
    },
  });
  const detach = useMutation({
    mutationFn: () => detachTask(task!.id),
    onSuccess: () => {
      toast.push("Task moved back to backlog.", "success");
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      onClose();
    },
  });

  return (
    <Modal
      open={!!task}
      onClose={onClose}
      title={`Attach — ${task?.title ?? ""}`}
      footer={
        <>
          {task?.phase_id && (
            <Button variant="secondary" onClick={() => detach.mutate()} disabled={detach.isPending}>
              Detach to backlog
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!phaseId || attach.isPending} onClick={() => attach.mutate()}>
            {attach.isPending ? "Attaching…" : "Attach"}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Field label="Project">
          <Select
            value={projectId}
            onChange={(e) => {
              setProjectId(e.target.value as UUID);
              setPhaseId("");
            }}
            placeholder="Choose a project…"
            options={(projects?.items ?? []).map((p) => ({ value: p.id, label: p.name }))}
          />
        </Field>
        <Field label="Sprint">
          <Select
            value={phaseId}
            onChange={(e) => setPhaseId(e.target.value as UUID)}
            placeholder={projectId ? "Choose a sprint…" : "Pick a project first"}
            options={(phases ?? []).map((ph) => ({ value: ph.id, label: ph.name }))}
          />
        </Field>
      </div>
    </Modal>
  );
}

const smallPill: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  fontSize: 11,
  fontWeight: 700,
  color: "var(--text-secondary)",
  background: "var(--surface-2)",
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-full)",
  padding: "2px 8px",
};

const subtaskBadge: React.CSSProperties = {
  flexShrink: 0,
  fontSize: 10.5,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.03em",
  padding: "2px 7px",
  borderRadius: "var(--radius-full)",
  background: "var(--surface-2)",
  border: "1px solid var(--border-subtle)",
  color: "var(--text-tertiary)",
  textDecoration: "none",
};

const filterChip: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 26,
  padding: "3px 9px",
  borderRadius: "var(--radius-full)",
  border: "1px solid var(--border-default)",
  background: "var(--surface-2)",
  color: "var(--text-secondary)",
  fontSize: 12,
  fontWeight: 600,
};
