"use client";

import { LocalizedDate } from "@/lib/i18n/I18nProvider";

import { useI18n } from "@/lib/i18n/I18nProvider";
import { LocalizedText } from "@/lib/i18n/I18nProvider";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CalendarDays, ExternalLink, GripVertical, Link2, Plus, SlidersHorizontal, Ticket, X } from "lucide-react";
import {
  attachTask,
  detachTask,
  getProjectSprints,
  listProjects,
  listAllProducts,
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
import { useViewState } from "@/lib/navigation";
import { useUrlView } from "@/lib/url-view";
import { calendarMonth, monthBoundary, shiftMonth } from "@/lib/i18n/calendar-month";

const TASK_VIEWS = ["all", "my", "my-blocked", "my-done", "review", "needs-review", "blocked", "backlog", "due-week"] as const;
const TASK_LAYOUTS = ["list", "monthly"] as const;

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
  const { t: translateUI, date: displayDate, number: displayNumber } = useI18n();

  return (
    <Suspense fallback={<Spinner label={translateUI("Loading tasks…")} />}>
      <TasksPage />
    </Suspense>
  );
}

function TasksPage() {
  const { t: localizeAttribute } = useI18n();

  const { t: translateUI, date: displayDate, number: displayNumber } = useI18n();

  const searchParams = useSearchParams();
  const { user, hasPermission, isSuperAdmin } = useAuth();
  const [view, setView] = useUrlView("view", TASK_VIEWS, "all");
  const [mode, setMode] = useUrlView("layout", TASK_LAYOUTS, "list");
  const [filtersOpen, setFiltersOpen] = useViewState("task-filters-open", false);
  const [partition, setPartition] = useViewState<string>("task-partition", "all");
  const [productFilter, setProductFilter] = useViewState<string>("task-product-line", "all");
  const [projectFilter, setProjectFilter] = useViewState<string>("task-project", "all");
  const [assigneeFilter, setAssigneeFilter] = useViewState<string>("task-assignee", "all");
  const [createdMonth, setCreatedMonth] = useViewState("task-created", "");
  const [dueMonth, setDueMonth] = useViewState("task-due", "");
  const [label, setLabel] = useViewState<string>("task-label", "");
  const [status, setStatus] = useViewState<string>("task-status", "");
  const [unattachedOnly, setUnattachedOnly] = useViewState("task-unattached", false);
  const [search, setSearch] = useViewState("task-search", searchParams.get("search") ?? "");
  const [page, setPage] = useViewState("task-page", 1);
  const [attachTarget, setAttachTarget] = useState<TaskRead | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const { nameOf, users } = useUserMap();
  const { partitions } = useTaskPartitions();

  const canAttach = isSuperAdmin() || hasPermission("tasks.manage_all", "projects.manage_all");
  const canCreate = Boolean(user);

  const { data, error, isError, isFetching, isLoading, refetch } = useQuery({
    queryKey: ["tasks", productFilter, partition, label, status, unattachedOnly, search],
    queryFn: () =>
      listTasks({
        product_id: productFilter === "all" ? undefined : productFilter as UUID,
        partition: partition === "all" ? undefined : partition,
        label: label || undefined,
        status: status || undefined,
        unattached: unattachedOnly ? true : undefined,
        search: search || undefined,
        page: 1,
        page_size: 100,
      }),
  });
  const products = useQuery({ queryKey: ["products"], queryFn: listAllProducts });
  const productNames = useMemo(() => new Map((products.data ?? []).map((product) => [product.id, product.name])), [products.data]);
  const projects = useQuery({
    queryKey: ["projects", "task-page"],
    queryFn: async () => {
      const first = await listProjects(1, 100);
      const items = [...first.items];
      for (let page = 2; items.length < first.total_count; page++) {
        const next = await listProjects(page, 100);
        if (!next.items.length) break;
        items.push(...next.items);
      }
      return { ...first, items };
    },
  });
  const projectPhases = useQuery({
    queryKey: ["project-phases-map", projects.data?.items.map((p) => `${p.id}:${p.product_id}:${p.name}`).join(",")],
    queryFn: async () => {
      const rows = await Promise.all(
        (projects.data?.items ?? []).map(async (project) => ({
          project,
          phases: await getProjectSprints(project.id),
        })),
      );
      const phaseToProject = new Map<UUID, { id: UUID; name: string; productId: UUID }>();
      for (const row of rows) {
        for (const phase of row.phases) phaseToProject.set(phase.id, { id: row.project.id, name: row.project.name, productId: row.project.product_id });
      }
      return phaseToProject;
    },
    enabled: (projects.data?.items.length ?? 0) > 0,
  });

  const phaseToProject = projectPhases.data ?? new Map<UUID, { id: UUID; name: string; productId: UUID }>();
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
                title={translateUI("Subtask — open parent task")}
                onClick={(e) => e.stopPropagation()}
                style={subtaskBadge}
              >{" "}<LocalizedText message={"Subtask"} />{" "}</Link>
            )}
            {t.github_url && (
              <a href={t.github_url} target="_blank" rel="noreferrer" title={translateUI("Open GitHub issue")} onClick={(e) => e.stopPropagation()}>
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
        key: "product_line",
        header: "Product line",
        sortValue: (t) => {
          const project = t.phase_id ? phaseToProject.get(t.phase_id) : undefined;
          return project ? productNames.get(project.productId)?.toLocaleLowerCase() ?? "" : "";
        },
        render: (t) => {
          const project = t.phase_id ? phaseToProject.get(t.phase_id) : undefined;
          const name = project ? productNames.get(project.productId) : undefined;
          return name ? (
            <span title={name} style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)" }}>{name}</span>
          ) : (
            <span style={{ color: "var(--text-tertiary)" }}>—</span>
          );
        },
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
          <span className="pmp-task-type" style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            <span style={smallPill}><LocalizedText message={String(t.task_type)} /></span>
            {t.is_ticket && <span style={{ ...smallPill, color: "var(--primary)" }}><Ticket size={11} />{" "}<LocalizedText message={"Ticket"} /></span>}
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
              <span className="pmp-task-assignee" key={id} style={{ marginLeft: i === 0 ? 0 : -8 }} title={nameOf(id)}>
                <Avatar name={nameOf(id)} size={24} />
              </span>
            ))}
            {t.assignee_user_ids.length === 0 && (
              <span style={{ color: "var(--text-tertiary)", fontSize: 12 }}><LocalizedText message={"Unassigned"} /></span>
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
            <span className="pmp-task-date-line"><LocalizedText message={"Created"} />{" "}{<LocalizedDate value={t.created_at} />}</span>
            {t.due_date && <span className="pmp-task-date-line"><LocalizedText message={"Due"} />{" "}{<LocalizedDate value={t.due_date} />}</span>}
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
              {phaseToProject.get(t.phase_id)?.name ?? translateUI("Attached")}
            </span>
          ) : (
            <span style={{ color: "var(--text-tertiary)", fontSize: 12 }}><LocalizedText message={"Backlog"} /></span>
          ),
      },
      {
        key: "actions",
        header: "",
        align: "right",
        render: (t) =>
          canAttach ? (
            <Button variant="tertiary" aria-label={`${t.phase_id ? "Move" : "Attach"} task ${t.title}`} onClick={() => setAttachTarget(t)}>
              <Link2 size={13} /> {t.phase_id ? <LocalizedText message={"Move"} /> : <LocalizedText message={"Attach"} />}
            </Button>
          ) : null,
      },
    ],
    [nameOf, canAttach, phaseToProject, productNames, translateUI],
  );

  const hasFilters =
    view !== "all" ||
    partition !== "all" ||
    productFilter !== "all" ||
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
    productFilter !== "all" ? translateUI("Product line: {name}", { name: productNames.get(productFilter as UUID) ?? translateUI("Selected") }) : null,
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
    setProductFilter("all");
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
        title={translateUI("Task Browser")}
        subtitle={translateUI("{visible} visible · {loaded} loaded · imported from GitHub issues and created in-app.", { visible: filteredRows.length, loaded: data?.total_count ?? 0 })}
        actions={
          canCreate ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus size={14} />{" "}<LocalizedText message={"New task"} />{" "}</Button>
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
          setView(key as (typeof TASK_VIEWS)[number]);
          setPage(1);
        }}
      />
      <Tabs
        items={[
          { key: "list", label: "List" },
          { key: "monthly", label: "Monthly" },
        ]}
        active={mode}
        onChange={(key) => setMode(key as (typeof TASK_LAYOUTS)[number])}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "var(--text-tertiary)", fontWeight: 700 }}><LocalizedText message={"Saved filters"} /></span>
        <Button variant={view === "my-blocked" ? "primary" : "secondary"} aria-pressed={view === "my-blocked"} onClick={() => applySavedFilter("my-blocked")}>{view === "my-blocked" && <Check size={15} aria-hidden />}<LocalizedText message={"My blocked"} /></Button>
        <Button variant={view === "due-week" ? "primary" : "secondary"} aria-pressed={view === "due-week"} onClick={() => applySavedFilter("due-week")}>{view === "due-week" && <Check size={15} aria-hidden />}<LocalizedText message={"Due this week"} /></Button>
        <Button variant={view === "needs-review" ? "primary" : "secondary"} aria-pressed={view === "needs-review"} onClick={() => applySavedFilter("needs-review")}>{view === "needs-review" && <Check size={15} aria-hidden />}<LocalizedText message={"Needs review"} /></Button>
        <Button variant={view === "backlog" ? "primary" : "secondary"} aria-pressed={view === "backlog"} onClick={() => applySavedFilter("backlog")}>{view === "backlog" && <Check size={15} aria-hidden />}<LocalizedText message={"Backlog"} /></Button>
      </div>

      <button className="pmp-mobile-filter-trigger" type="button" onClick={() => setFiltersOpen(true)} aria-expanded={filtersOpen}>
        <SlidersHorizontal size={17} />{" "}<LocalizedText message={"Filters"} />{" "}{activeFilters.length > 0 && <span className="pmp-nav-badge">{activeFilters.length}</span>}
      </button>
      {filtersOpen && <button className="pmp-task-filter-scrim" aria-label={translateUI("Close filters")} onClick={() => setFiltersOpen(false)} />}
      <section className={`pmp-task-filter-panel ${filtersOpen ? "is-open" : ""}`} aria-label={translateUI("Task filters")}>
        <div className="pmp-task-filter-header">
          <div><strong><LocalizedText message={"Filter tasks"} /></strong><small><LocalizedText message={"Narrow the current queue"} /></small></div>
          <button className="pmp-icon-btn" type="button" onClick={() => setFiltersOpen(false)} aria-label={translateUI("Close filters")}><X size={18} /></button>
        </div>
      <div className="pmp-task-filter-controls" style={{ display: "flex", gap: 10, margin: "14px 0", flexWrap: "wrap", alignItems: "center" }}>
        <TextInput
          aria-label={translateUI("Search tasks by title")}
          placeholder={translateUI("Search title…")}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          style={{ width: 260 }}
        />
        <Select
          value={partition}
          aria-label={translateUI("Filter tasks by partition")}
          onChange={(e) => {
            setPartition(e.target.value);
            setPage(1);
          }}
          options={[
            { translateLabel: true, value: "all", label: "All partitions" },
            ...partitions.map((item) => ({ value: item.slug, label: item.name })),
          ]}
        />
        <Select
          value={productFilter}
          aria-label={translateUI("Filter tasks by product line")}
          disabled={products.isPending || products.isError}
          onChange={(event) => {
            setProductFilter(event.target.value);
            setProjectFilter("all");
            setPage(1);
          }}
          options={[
            { translateLabel: true, value: "all", label: "All product lines" },
            ...(products.data ?? []).map((product) => ({ value: product.id, label: product.name })),
          ]}
        />
        <Select
          value={projectFilter}
          aria-label={translateUI("Filter tasks by project")}
          onChange={(e) => {
            setProjectFilter(e.target.value);
            setPage(1);
          }}
          options={[
            { translateLabel: true, value: "all", label: "All projects" },
            ...(projects.data?.items ?? []).filter((project) => productFilter === "all" || project.product_id === productFilter).map((p) => ({ value: p.id, label: p.name })),
          ]}
        />
        <Select
          value={assigneeFilter}
          aria-label={translateUI("Filter tasks by assignee")}
          onChange={(e) => {
            setAssigneeFilter(e.target.value);
            setPage(1);
          }}
          options={[
            { translateLabel: true, value: "all", label: "All assignees" },
            { translateLabel: true, value: "unassigned", label: "Unassigned" },
            ...(users ?? []).map((u) => ({ value: u.id, label: u.full_name })),
          ]}
        />
        <Select translateOptions
          value={label}
          aria-label={translateUI("Filter tasks by label")}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={translateUI("All labels")}
          options={[
            { value: "Backend", label: "Backend" },
            { value: "Frontend", label: "Frontend" },
          ]}
        />
        <Select translateOptions
          value={status}
          aria-label={translateUI("Filter tasks by status")}
          onChange={(e) => setStatus(e.target.value)}
          placeholder={translateUI("All statuses")}
          options={STATUS_OPTIONS.map((s) => ({ value: s, label: STATUS_LABELS[s] ?? s }))}
        />
        <TextInput
          type="month"
          aria-label={translateUI("Filter tasks by created month")}
          value={createdMonth}
          onChange={(e) => {
            setCreatedMonth(e.target.value);
            setPage(1);
          }}
          title={translateUI("Created month")}
          style={{ width: 150 }}
        />
        <TextInput
          type="month"
          aria-label={translateUI("Filter tasks by due month")}
          value={dueMonth}
          onChange={(e) => {
            setDueMonth(e.target.value);
            setPage(1);
          }}
          title={translateUI("Due/end month")}
          style={{ width: 150 }}
        />
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--text-secondary)", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={unattachedOnly}
            onChange={(e) => setUnattachedOnly(e.target.checked)}
          />{" "}<LocalizedText message={"Backlog only (no project)"} />{" "}</label>
      </div>
        <div className="pmp-task-filter-actions">
          <Button variant="tertiary" onClick={clearFilters}><LocalizedText message={"Clear all"} /></Button>
          <Button onClick={() => setFiltersOpen(false)}><LocalizedText message={"Show"} />{" "}{filteredRows.length}{" "}<LocalizedText message={"tasks"} /></Button>
        </div>
      </section>

      {activeFilters.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }} aria-label={translateUI("Active task filters")}>
          {activeFilters.map((f) => (
            <span key={f} style={filterChip}>{f}</span>
          ))}
          <Button variant="tertiary" onClick={clearFilters}><LocalizedText message={"Clear filters"} /></Button>
        </div>
      )}

      {isLoading ? (
        <Spinner label={translateUI("Loading tasks…")} />
      ) : isError ? (
        <TaskLoadError error={error} isFetching={isFetching} onRetry={() => refetch()} />
      ) : mode === "monthly" ? (
        <MonthlyTaskPlanner rows={filteredRows} nameOf={nameOf} canAttach={canAttach} />
      ) : (
        <>
          <div className="pmp-task-list" style={{ background: "var(--surface-2)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-3)", overflow: "hidden" }}>
            <DataTable columns={columns} rows={pageRows} rowKey={(t) => t.id} emptyText={hasFilters ? localizeAttribute("No tasks match these filters. Clear filters to see more work.") : localizeAttribute("No tasks yet.")} />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{" "}<LocalizedText message={"Page"} />{" "}{displayNumber(page)}{" "}<LocalizedText message={"of"} />{" "}{displayNumber(totalPages)}
            </span>
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>{" "}<LocalizedText message={"Previous"} />{" "}</Button>
            <Button
              variant="secondary"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >{" "}<LocalizedText message={"Next"} />{" "}</Button>
          </div>
        </>
      )}

      <AttachModal task={attachTarget} onClose={() => setAttachTarget(null)} />
      <TaskEditorModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
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
  const { t: translateUI, date: displayDate, number: displayNumber, calendar } = useI18n();

  const queryClient = useQueryClient();
  const toast = useToast();
  const [dragId, setDragId] = useState<UUID | null>(null);
  const [sortMode, setSortMode] = useState<TaskSortMode>("manual");
  const [monthOffset, setMonthOffset] = useState(0);

  const months = useMemo(() => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const current = calendarMonth(today, calendar);
    return Array.from({ length: 6 }, (_, index) => shiftMonth(current, monthOffset + index - 1));
  }, [monthOffset, calendar]);

  const moveTask = useMutation({
    mutationFn: async ({ task, targetMonth, groups }: { task: TaskRead; targetMonth: string; groups: UUID[][] }) => {
      const currentMonth = task.due_date ? calendarMonth(task.due_date, calendar) : "unscheduled";
      if (currentMonth !== targetMonth) {
        await updateTask(task.id, { due_date: targetMonth === "unscheduled" ? null : monthBoundary(targetMonth, calendar, true) });
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
      const key = task.due_date ? calendarMonth(task.due_date, calendar) : undefined;
      if (key && map.has(key)) map.get(key)!.push(task);
      else if (!key) map.get("unscheduled")!.push(task);
    }
    for (const [key, tasks] of map) map.set(key, sortTasks(tasks, sortMode, nameOf));
    return map;
  }, [rows, months, nameOf, sortMode, calendar]);

  const dropOn = (targetMonth: string, beforeId?: UUID) => {
    if (!dragId) return;
    if (beforeId === dragId) {
      setDragId(null);
      return;
    }
    const task = rows.find((row) => row.id === dragId);
    setDragId(null);
    if (!task) return;
    const current = task.due_date ? calendarMonth(task.due_date, calendar) : "unscheduled";
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
          <CalendarDays size={16} />{" "}<LocalizedText message={"Monthly delivery plan"} />{" "}</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <Select translateOptions
            aria-label={translateUI("Sort tasks in monthly planner")}
            value={sortMode}
            onChange={(event) => setSortMode(event.target.value as TaskSortMode)}
            options={TASK_SORT_OPTIONS}
          />
          <Button
            variant="secondary"
            onClick={() => setMonthOffset(current => current - 1)}
          >{" "}<LocalizedText message={"Previous"} />{" "}</Button>
          <Button
            variant="secondary"
            onClick={() => setMonthOffset(0)}
          >{" "}<LocalizedText message={"Today"} />{" "}</Button>
          <Button
            variant="secondary"
            onClick={() => setMonthOffset(current => current + 1)}
          >{" "}<LocalizedText message={"Next"} />{" "}</Button>
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
                <div style={{ fontSize: 13, fontWeight: 800 }}>{bucket === "unscheduled" ? translateUI("No month") : displayDate(monthBoundary(bucket, calendar), { day: undefined, month: "short", year: "numeric" })}</div>
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
                      <span title={translateUI("Drag to reorder or move")} aria-hidden="true" style={{ float: "right", color: "var(--text-tertiary)", cursor: "grab" }}>
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
                      {task.is_ticket && <span style={{ ...smallPill, color: "var(--primary)" }}><Ticket size={11} />{" "}<LocalizedText message={"Ticket"} /></span>}
                      <span style={smallPill}>{task.partition ?? "No partition"}</span>
                    </div>
                    <div style={{ marginTop: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                        {task.assignee_user_ids.length ? task.assignee_user_ids.map((id) => nameOf(id)).join(", ") : <LocalizedText message={"Unassigned"} />}
                      </span>
                      <PriorityBadge level={task.priority} compact />
                    </div>
                  </div>
                ))}
                {tasks.length === 0 && (
                  <div style={{ padding: "18px 8px", color: "var(--text-tertiary)", fontSize: 12.5, textAlign: "center" }}>{" "}<LocalizedText message={"Drop tasks here"} />{" "}</div>
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
        <div style={{ fontSize: 14, fontWeight: 800 }}><LocalizedText message={"Tasks could not be loaded."} /></div>
        <div style={{ marginTop: 4, fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>{" "}<LocalizedText message={"The task browser received an API error, so this is not being shown as an empty task list."} />{" "}</div>
        <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
          {details}
        </div>
      </div>
      <Button variant="secondary" disabled={isFetching} onClick={onRetry}>
        {isFetching ? <LocalizedText message={"Retrying..."} /> : <LocalizedText message={"Retry"} />}
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
  const { t: localizeAttribute } = useI18n();

  const { t: translateUI, date: displayDate, number: displayNumber } = useI18n();

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
            <Button variant="secondary" onClick={() => detach.mutate()} disabled={detach.isPending}>{" "}<LocalizedText message={"Detach to backlog"} />{" "}</Button>
          )}
          <Button variant="secondary" onClick={onClose}>{" "}<LocalizedText message={"Cancel"} />{" "}</Button>
          <Button disabled={!phaseId || attach.isPending} onClick={() => attach.mutate()}>
            {attach.isPending ? <LocalizedText message={"Attaching…"} /> : <LocalizedText message={"Attach"} />}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Field label={translateUI("Project")}>
          <Select
            value={projectId}
            onChange={(e) => {
              setProjectId(e.target.value as UUID);
              setPhaseId("");
            }}
            placeholder={translateUI("Choose a project…")}
            options={(projects?.items ?? []).map((p) => ({ value: p.id, label: p.name }))}
          />
        </Field>
        <Field label={translateUI("Sprint")}>
          <Select
            value={phaseId}
            onChange={(e) => setPhaseId(e.target.value as UUID)}
            placeholder={projectId ? localizeAttribute("Choose a sprint…") : localizeAttribute("Pick a project first")}
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
