"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  CalendarClock,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Diamond,
  ExternalLink,
  GitBranch,
  ListChecks,
  Lock,
  Pencil,
  Plus,
  ShieldAlert,
  Trash2,
  Unlock,
  Users,
} from "lucide-react";
import {
  addProjectMember,
  archiveProject,
  createMilestone,
  createPhase,
  deleteProject,
  getPhaseProgress,
  getPhaseTasks,
  getProjectOverview,
  getProjectPhases,
  getProjectTimeline,
  listProducts,
  removeProjectMember,
  updateMilestone,
  updateProject,
  updateTask,
  updateTaskStatus,
} from "@/lib/api/projects";
import { getBottlenecks } from "@/lib/api/analytics";
import { listBlockers } from "@/lib/api/blockers";
import { listChannels } from "@/lib/api/chat";
import { AppError } from "@/lib/api/client";
import { useUserMap } from "@/lib/hooks";
import { useRealtimeEvent } from "@/lib/ws/RealtimeProvider";
import {
  Avatar,
  Button,
  Card,
  Field,
  MarkdownPreview,
  MetricCard,
  Modal,
  PriorityBadge,
  ProgressBar,
  Select,
  StatusChip,
  Tabs,
  TextArea,
  TextInput,
  useToast,
} from "@/components/ds";
import { EmptyState, ErrorState, PAGE_STYLE, Spinner } from "@/components/ui/States";
import { GanttChart, type GanttBar } from "@/components/ds/GanttChart";
import { ChannelConversation } from "@/components/chat/ChannelConversation";
import { TaskEditorModal } from "@/components/tasks/TaskEditorModal";
import { KANBAN_COLUMNS, blockMeter, relativeTime } from "@/lib/format";
import { useAuth } from "@/lib/auth/AuthProvider";
import type { BlockerRead, ProjectLevel, ProjectRead, TaskRead, TaskStatus, UUID } from "@/lib/types";

const PROJECT_LEVELS: { value: ProjectLevel; label: string; detail: string }[] = [
  { value: "inter-team", label: "Inter-team", detail: "Inside one partition" },
  { value: "inter-partition", label: "Inter-partition", detail: "Across partitions" },
  { value: "organization", label: "Organization", detail: "Company-wide" },
];
const PROJECT_PARTITIONS = [
  { value: "tech", label: "Tech" },
  { value: "business", label: "Business" },
  { value: "marketing", label: "Marketing" },
  { value: "operations", label: "Operations" },
  { value: "sales", label: "Sales" },
];

function projectLevelFromTags(tags: string[] = []): ProjectLevel {
  const raw = tags.find((tag) => tag.startsWith("level:"))?.slice("level:".length);
  if (raw === "inter-team" || raw === "organization") return raw;
  return "inter-partition";
}

function tagsWithLevel(rawTags: string, level: ProjectLevel) {
  return [
    ...rawTags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .filter((tag) => !tag.startsWith("level:")),
    `level:${level}`,
  ];
}

function projectPartitionFromTags(tags: string[] = []) {
  return tags.find((tag) => tag.startsWith("partition:"))?.slice("partition:".length) ?? "tech";
}

function tagsWithTaxonomy(rawTags: string, level: ProjectLevel, partition: string) {
  return [
    ...rawTags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .filter((tag) => !tag.startsWith("level:") && !tag.startsWith("partition:")),
    `level:${level}`,
    `partition:${partition}`,
  ];
}

const TAB_KEYS = [
  { key: "overview", label: "Overview" },
  { key: "board", label: "Board" },
  { key: "timeline", label: "Timeline" },
  { key: "team", label: "Team" },
  { key: "milestones", label: "Milestones" },
  { key: "blockers", label: "Blockers" },
  { key: "discussions", label: "Discussions" },
];

const PROJECT_STATUS_OPTIONS = [
  { value: "not-started", label: "Not started" },
  { value: "in-progress", label: "In progress" },
  { value: "on-hold", label: "On hold" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "archived", label: "Archived" },
];
const HEALTH_STATUS_OPTIONS = [
  { value: "on-track", label: "On track" },
  { value: "at-risk", label: "At risk" },
  { value: "delayed", label: "Delayed" },
  { value: "blocked", label: "Blocked" },
  { value: "completed", label: "Completed" },
];

export default function ProjectWorkspacePage() {
  return (
    <Suspense fallback={<Spinner label="Loading project…" />}>
      <ProjectWorkspaceInner />
    </Suspense>
  );
}

const VALID_TABS = new Set(TAB_KEYS.map((t) => t.key));

function ProjectWorkspaceInner() {
  const { projectId } = useParams<{ projectId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const urlTab = searchParams.get("tab");
  const tab = urlTab && VALID_TABS.has(urlTab) ? urlTab : "overview";
  const setTab = (key: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", key);
    // replace so tab switches don't stack history; task push adds one entry to go back to.
    router.replace(`/projects/${projectId}?${params.toString()}`);
  };
  const [editOpen, setEditOpen] = useState(false);
  const { hasPermission, isSuperAdmin } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();

  const overview = useQuery({
    queryKey: ["project-overview", projectId],
    queryFn: () => getProjectOverview(projectId),
  });

  const archive = useMutation({
    mutationFn: () => archiveProject(projectId),
    onSuccess: () => {
      toast.push("Project archived.", "success");
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["portfolio-gantt"] });
      qc.invalidateQueries({ queryKey: ["project-overview", projectId] });
      overview.refetch();
    },
    onError: () => toast.push("Could not archive project.", "error"),
  });

  const removeProject = useMutation({
    mutationFn: () => deleteProject(projectId),
    onSuccess: () => {
      toast.push("Project deleted.", "success");
      qc.removeQueries({ queryKey: ["project-overview", projectId] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["portfolio-gantt"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["phase-tasks"] });
      router.push("/portfolio");
    },
    onError: () => toast.push("Could not delete project.", "error"),
  });

  const confirmDeleteProject = () => {
    if (window.confirm(`Delete "${overview.data?.project.name ?? "this project"}" and all of its tasks? This cannot be undone.`)) {
      removeProject.mutate();
    }
  };

  if (overview.isLoading)
    return (
      <div style={PAGE_STYLE}>
        <Spinner label="Loading project…" />
      </div>
    );
  if (overview.isError || !overview.data)
    return (
      <div style={PAGE_STYLE}>
        <ErrorState message="Could not load this project." />
      </div>
    );

  const o = overview.data;
  const p = o.project;
  const canManage = isSuperAdmin() || hasPermission("projects.manage_all", "projects.manage_assigned");

  return (
    <div style={{ ...PAGE_STYLE, maxWidth: "none" }}>
      <div>
        <Link
          href="/portfolio"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--text-tertiary)", fontSize: 12.5, marginBottom: 10 }}
        >
          <ChevronLeft size={14} /> Portfolio
        </Link>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>{p.name}</div>
              <StatusChip status={p.health_status} />
              <PriorityBadge level={p.priority} />
              <span style={partitionBadge}>{projectPartitionFromTags(p.tags)}</span>
              <span style={levelBadge}>{PROJECT_LEVELS.find((level) => level.value === projectLevelFromTags(p.tags))?.label}</span>
              {o.current_phase && (
                <span style={{ fontSize: 12, color: "var(--accent-gold-bright)", background: "rgba(212,169,55,0.12)", padding: "3px 10px", borderRadius: "var(--radius-full)" }}>
                  Phase: {o.current_phase.name}
                </span>
              )}
            </div>
            <div style={{ fontSize: 13.5, color: "var(--text-secondary)", marginTop: 4 }}>
              {p.status}
              {p.start_date && ` · ${p.start_date} -> ${p.end_date ?? "?"}`}
              {p.actual_completion_date && ` · completed ${p.actual_completion_date}`}
            </div>
          </div>
          {canManage && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {p.status !== "archived" && (
                <Button variant="secondary" disabled={archive.isPending} onClick={() => archive.mutate()}>
                  <Archive size={14} /> {archive.isPending ? "Archiving..." : "Archive"}
                </Button>
              )}
              <Button variant="secondary" onClick={() => setEditOpen(true)}>
                <Pencil size={14} /> Edit project
              </Button>
              <Button
                variant="secondary"
                disabled={removeProject.isPending}
                onClick={confirmDeleteProject}
                style={dangerButton}
              >
                <Trash2 size={14} /> {removeProject.isPending ? "Deleting..." : "Delete"}
              </Button>
            </div>
          )}
        </div>
      </div>

      <Tabs items={TAB_KEYS} active={tab} onChange={setTab} />

      {tab === "overview" && <OverviewTab projectId={projectId} />}
      {tab === "board" && <BoardTab projectId={projectId} canManage={canManage} />}
      {tab === "timeline" && <TimelineTab projectId={projectId} canManage={canManage} />}
      {tab === "team" && <TeamTab projectId={projectId} canManage={canManage} />}
      {tab === "milestones" && <MilestonesTab projectId={projectId} canManage={canManage} />}
      {tab === "blockers" && <BlockersTab projectId={projectId} />}
      {tab === "discussions" && <DiscussionsTab projectId={projectId} />}
      <EditProjectModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        project={p}
        onSaved={() => overview.refetch()}
      />
    </div>
  );
}

function EditProjectModal({
  open,
  onClose,
  project,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  project: ProjectRead;
  onSaved: () => void;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const products = useQuery({ queryKey: ["products"], queryFn: () => listProducts(1, 200), enabled: open });
  const [form, setForm] = useState({
    product_id: project.product_id,
    name: project.name,
    description: project.description ?? "",
    priority: String(project.priority),
    risk_level: String(project.risk_level),
    status: String(project.status),
    health_status: String(project.health_status),
    start_date: project.start_date ?? "",
    end_date: project.end_date ?? "",
    actual_completion_date: project.actual_completion_date ?? "",
    level: projectLevelFromTags(project.tags),
    partition: projectPartitionFromTags(project.tags),
    tags: project.tags.filter((tag) => !tag.startsWith("level:") && !tag.startsWith("partition:")).join(", "),
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      product_id: project.product_id,
      name: project.name,
      description: project.description ?? "",
      priority: String(project.priority),
      risk_level: String(project.risk_level),
      status: String(project.status),
      health_status: String(project.health_status),
      start_date: project.start_date ?? "",
      end_date: project.end_date ?? "",
      actual_completion_date: project.actual_completion_date ?? "",
      level: projectLevelFromTags(project.tags),
      partition: projectPartitionFromTags(project.tags),
      tags: project.tags.filter((tag) => !tag.startsWith("level:") && !tag.startsWith("partition:")).join(", "),
    });
  }, [open, project]);

  const save = useMutation({
    mutationFn: () =>
      updateProject(project.id, {
        product_id: form.product_id,
        name: form.name,
        description: form.description || null,
        priority: form.priority,
        risk_level: form.risk_level,
        status: form.status,
        health_status: form.health_status,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        estimated_completion_date: form.end_date || null,
        actual_completion_date: form.actual_completion_date || null,
        tags: tagsWithTaxonomy(form.tags, form.level, form.partition),
      }),
    onSuccess: () => {
      toast.push("Project updated.", "success");
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["portfolio-gantt"] });
      qc.invalidateQueries({ queryKey: ["project-overview", project.id] });
      onSaved();
      onClose();
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit project"
      width={860}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={!form.name.trim() || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Saving..." : "Save changes"}
          </Button>
        </>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.1fr) minmax(280px, 0.9fr)", gap: 18 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label="Project name">
            <TextInput value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </Field>
          <Field label="Product line">
            <Select
              value={form.product_id}
              onChange={(e) => setForm((f) => ({ ...f, product_id: e.target.value as UUID }))}
              options={(products.data?.items ?? []).map((p) => ({ value: p.id, label: p.name }))}
            />
          </Field>
          <Field label="Project level">
            <Select
              value={form.level}
              onChange={(e) => setForm((f) => ({ ...f, level: e.target.value as ProjectLevel }))}
              options={PROJECT_LEVELS.map((level) => ({ value: level.value, label: `${level.label} · ${level.detail}` }))}
            />
          </Field>
          <Field label="Project partition">
            <Select
              value={form.partition}
              onChange={(e) => setForm((f) => ({ ...f, partition: e.target.value }))}
              options={PROJECT_PARTITIONS}
            />
          </Field>
          <Field label="Description (Markdown)">
            <TextArea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
            <Field label="Status">
              <Select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} options={PROJECT_STATUS_OPTIONS} />
            </Field>
            <Field label="Health">
              <Select value={form.health_status} onChange={(e) => setForm((f) => ({ ...f, health_status: e.target.value }))} options={HEALTH_STATUS_OPTIONS} />
            </Field>
            <Field label="Priority">
              <Select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))} options={["P0", "P1", "P2", "P3"].map((p) => ({ value: p, label: p }))} />
            </Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
            <Field label="Start date">
              <TextInput type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} />
            </Field>
            <Field label="End date">
              <TextInput type="date" value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} />
            </Field>
            <Field label="Actual completion">
              <TextInput type="date" value={form.actual_completion_date} onChange={(e) => setForm((f) => ({ ...f, actual_completion_date: e.target.value }))} />
            </Field>
          </div>
          <Field label="Tags">
            <TextInput value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} />
          </Field>
        </div>
        <Card title="Project description preview" padded>
          <MarkdownPreview value={form.description} />
        </Card>
      </div>
    </Modal>
  );
}

/* ------------------------------ Overview ------------------------------ */
function OverviewTab({ projectId }: { projectId: string }) {
  const { nameOf } = useUserMap();
  const { hasPermission, isSuperAdmin } = useAuth();
  const canSeeBottlenecks = isSuperAdmin() || hasPermission("analytics.view_org", "reports.view_executive");
  const { data: o, refetch } = useQuery({
    queryKey: ["project-overview", projectId],
    queryFn: () => getProjectOverview(projectId),
  });
  const bottlenecks = useQuery({
    queryKey: ["project-bottlenecks", projectId],
    queryFn: () => getBottlenecks(projectId as UUID),
    enabled: canSeeBottlenecks,
  });
  const tasks = useQuery({
    queryKey: ["project-tasks", projectId, o?.phases.map((phase) => phase.id).join(",")],
    queryFn: async () => (await Promise.all((o?.phases ?? []).map((phase) => getPhaseTasks(phase.id)))).flat(),
    enabled: !!o,
  });
  useRealtimeEvent(
    ["task.status_changed"],
    () => refetch(),
    [`project-${projectId}`],
  );
  if (!o) return null;
  const p = o.project;
  const pct = Number(p.progress_percentage);
  const remainingTasks = (tasks.data ?? []).filter((task) => !["Done", "Cancelled", "Archived"].includes(String(task.status)));
  const loadRows = [...remainingTasks.reduce((map, task) => {
    const assignees = task.assignee_user_ids.length ? task.assignee_user_ids : ["unassigned"];
    for (const id of assignees) {
      const current = map.get(id) ?? { id, tasks: 0, points: 0, blocked: 0, overdue: 0 };
      current.tasks += 1;
      current.points += task.story_points ?? 0;
      if (task.status === "Blocked") current.blocked += 1;
      if (task.due_date && new Date(task.due_date) < new Date()) current.overdue += 1;
      map.set(id, current);
    }
    return map;
  }, new Map<string, { id: string; tasks: number; points: number; blocked: number; overdue: number }>()).values()]
    .sort((a, b) => b.tasks - a.tasks)
    .slice(0, 6);
  const partitionRows = [...remainingTasks.reduce((map, task) => {
    const key = task.partition ?? "unpartitioned";
    map.set(key, (map.get(key) ?? 0) + 1);
    return map;
  }, new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <Card title="Project brief" padded>
        <MarkdownPreview value={p.description} />
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
        <MetricCard label="Completion" value={`${Math.round(pct)}%`} tone="in-progress" />
        <MetricCard label="Tasks done" value={`${o.task_stats.done}/${o.task_stats.total}`} />
        <MetricCard label="In progress" value={String(o.task_stats.in_progress)} />
        <MetricCard label="Blocked" value={String(o.task_stats.blocked)} tone={o.task_stats.blocked > 0 ? "blocked" : "default"} />
        <MetricCard label="Overdue" value={String(o.task_stats.overdue)} tone={o.task_stats.overdue > 0 ? "delayed" : "default"} />
        <MetricCard label="Open blockers" value={String(o.open_blockers)} tone={o.open_blockers > 0 ? "blocked" : "default"} />
      </div>

      <Card title="Project progress" padded>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 15, letterSpacing: 2, color: "var(--accent-primary)", marginBottom: 12, overflow: "hidden", whiteSpace: "nowrap" }}>
          {blockMeter(pct, 32)}{" "}
          <span style={{ color: "var(--text-primary)", fontWeight: 700, letterSpacing: "normal" }}>{Math.round(pct)}%</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {o.phases.map((ph) => (
            <div key={ph.id} style={{ display: "grid", gridTemplateColumns: "180px minmax(160px, 1fr) 150px 90px", gap: 12, alignItems: "center" }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {ph.name}
              </span>
              <ProgressBar percent={Number(ph.progress_percentage)} blocks={22} showLabel={false} />
              <span style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                {ph.lead_assignee_user_id ? (
                  <>
                    <Avatar name={nameOf(ph.lead_assignee_user_id)} size={22} />
                    <span style={{ fontSize: 12, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {nameOf(ph.lead_assignee_user_id)}
                    </span>
                  </>
                ) : (
                  <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>No lead</span>
                )}
              </span>
              <StatusChip status={String(ph.status)} />
            </div>
          ))}
          {o.phases.length === 0 && (
            <div style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>No phases yet — create one in the Board tab.</div>
          )}
        </div>
      </Card>

      <div className="pmp-two-col-grid" style={{ display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: 18, alignItems: "start" }}>
        <Card title="Remaining ownership" padded>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {loadRows.map((row) => {
              const max = Math.max(1, ...loadRows.map((item) => item.tasks));
              const percent = (row.tasks / max) * 100;
              const name = row.id === "unassigned" ? "Unassigned" : nameOf(row.id);
              return (
                <div key={row.id} style={{ display: "grid", gridTemplateColumns: "minmax(130px, 0.8fr) minmax(160px, 1fr) 90px", gap: 10, alignItems: "center" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    {row.id !== "unassigned" && <Avatar name={name} size={24} />}
                    <span style={{ fontSize: 12.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
                  </span>
                  <span style={{ height: 10, borderRadius: "var(--radius-full)", background: "var(--surface-3)", overflow: "hidden" }}>
                    <span style={{ display: "block", width: `${percent}%`, height: "100%", background: row.blocked || row.overdue ? "var(--status-delayed)" : "var(--accent-primary)" }} />
                  </span>
                  <span style={{ fontSize: 12, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", textAlign: "right" }}>
                    {row.tasks} open
                  </span>
                  {(row.blocked > 0 || row.overdue > 0 || row.points > 0) && (
                    <span style={{ gridColumn: "2 / 4", fontSize: 11.5, color: "var(--text-tertiary)" }}>
                      {row.points > 0 ? `${row.points} pts` : "No points"} · {row.blocked} blocked · {row.overdue} overdue
                    </span>
                  )}
                </div>
              );
            })}
            {!tasks.isLoading && loadRows.length === 0 && (
              <div style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>No remaining assigned work.</div>
            )}
          </div>
        </Card>

        <Card title="Partition pressure" padded>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {partitionRows.map(([partition, count]) => (
              <div key={partition} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ ...taskPill, textTransform: "capitalize", minWidth: 98, justifyContent: "center" }}>{partition}</span>
                <span style={{ flex: 1 }}>
                  <ProgressBar percent={(count / Math.max(1, remainingTasks.length)) * 100} blocks={10} showLabel={false} />
                </span>
                <span style={{ width: 54, textAlign: "right", fontSize: 12, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{count}</span>
              </div>
            ))}
            {!tasks.isLoading && partitionRows.length === 0 && (
              <div style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>No open partition load.</div>
            )}
          </div>
        </Card>
      </div>

      <div className="pmp-two-col-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, alignItems: "start" }}>
        <Card title="Upcoming deadlines" padded={false}>
          {o.upcoming_deadlines.length === 0 && (
            <div style={{ padding: 16, fontSize: 12.5, color: "var(--text-tertiary)" }}>No upcoming deadlines.</div>
          )}
          {o.upcoming_deadlines.map((d) => (
            <Link
              key={d.task_id}
              href={`/tasks/${d.task_id}`}
              className="pmp-row"
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderBottom: "1px solid var(--border-subtle)", textDecoration: "none" }}
            >
              <CalendarClock size={14} style={{ color: "var(--accent-gold)", flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as React.CSSProperties}>
                {d.title}
              </span>
              <span style={{ fontSize: 12, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{d.due_date}</span>
              <StatusChip status={d.status} />
            </Link>
          ))}
        </Card>

        <Card title="Milestones & team" padded>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {o.milestones.slice(0, 5).map((m) => (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Diamond size={13} style={{ color: m.completed_at ? "var(--status-completed)" : "var(--accent-gold)", flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 600, textDecoration: m.completed_at ? "line-through" : undefined, color: m.completed_at ? "var(--text-tertiary)" : undefined }}>
                  {m.name}
                </span>
                <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginLeft: "auto" }}>{m.due_date ?? ""}</span>
              </div>
            ))}
            {o.milestones.length === 0 && <div style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>No milestones yet.</div>}
            <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 12, display: "flex", alignItems: "center", gap: 4 }}>
              <Users size={13} style={{ color: "var(--text-tertiary)", marginRight: 6 }} />
              {o.members.slice(0, 8).map((m, i) => (
                <span key={m.user_id} style={{ marginLeft: i === 0 ? 0 : -8 }} title={`${nameOf(m.user_id)} · ${m.role}`}>
                  <Avatar name={nameOf(m.user_id)} size={26} />
                </span>
              ))}
              <span style={{ fontSize: 12, color: "var(--text-tertiary)", marginLeft: 8 }}>
                {o.members.length} member(s)
              </span>
            </div>
          </div>
        </Card>
      </div>

      {canSeeBottlenecks && (
        <Card title="Bottlenecks — needs attention" padded={false}>
          {(bottlenecks.data ?? []).length === 0 ? (
            <div style={{ padding: 18, fontSize: 12.5, color: "var(--text-tertiary)" }}>
              No bottlenecks in this project right now.
            </div>
          ) : (
            (bottlenecks.data ?? []).map((b) => (
              <Link
                key={`${b.kind}-${b.id}`}
                href={b.kind === "overdue_project" ? `/projects/${b.id}` : b.task_id ? `/tasks/${b.task_id}` : "#"}
                className="pmp-row"
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 16px", borderBottom: "1px solid var(--border-subtle)", textDecoration: "none" }}
              >
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    padding: "2px 8px",
                    borderRadius: "var(--radius-full)",
                    background: b.kind === "blocker" ? "var(--status-blocked-bg)" : "var(--status-delayed-bg)",
                    color: b.kind === "blocker" ? "var(--status-blocked)" : "var(--status-delayed)",
                    flexShrink: 0,
                  }}
                >
                  {b.kind.replace("_", " ")}
                </span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {b.title}
                </span>
                <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", flexShrink: 0 }}>{b.detail}</span>
              </Link>
            ))
          )}
        </Card>
      )}
    </div>
  );
}

/* ------------------------------ Timeline ------------------------------ */
const GANTT_LABEL_WIDTH = 200;

function TimelineTab({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const [timelineLocked, setTimelineLocked] = useState(true);
  const timeline = useQuery({
    queryKey: ["project-timeline", projectId],
    queryFn: () => getProjectTimeline(projectId as UUID),
  });

  const invalidateSchedule = () => {
    qc.invalidateQueries({ queryKey: ["project-timeline", projectId] });
    qc.invalidateQueries({ queryKey: ["tasks"] });
    qc.invalidateQueries({ queryKey: ["project-overview", projectId] });
  };

  const updateDue = useMutation({
    mutationFn: ({ id, dueDate }: { id: UUID; dueDate: string }) => updateTask(id, { due_date: dueDate }),
    onSuccess: () => {
      toast.push("Deadline updated.", "success");
      invalidateSchedule();
    },
    onError: () => toast.push("Could not update deadline.", "error"),
  });

  const reschedule = useMutation({
    mutationFn: ({ id, start_date, due_date }: { id: UUID; start_date: string; due_date: string }) =>
      updateTask(id, { start_date, due_date }),
    onSuccess: () => {
      toast.push("Task rescheduled.", "success");
      invalidateSchedule();
    },
    onError: () => toast.push("Could not reschedule task.", "error"),
  });

  // Measure the container so the day grid stretches to fill the card (no dead
  // space on the right), while never shrinking a day below a readable width.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setContainerWidth(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const chart = useMemo(() => {
    const rows = timeline.data?.tasks ?? [];
    const scheduled = rows.filter((t) => t.start_date);
    if (scheduled.length === 0)
      return { bars: [] as GanttBar[], days: 0, todayOffset: null as number | null, startDate: null as string | null };

    const dayMs = 86_400_000;
    const now = Date.now();
    const startOf = (d: string) => new Date(d).setHours(0, 0, 0, 0);
    const isDone = (s: string) => ["done", "closed", "resolved", "completed"].includes(s.toLowerCase());

    const starts = scheduled.map((t) => startOf(t.start_date as string));
    const ends = scheduled.map(
      (t) => startOf(t.start_date as string) + Math.max(t.duration_days, 1) * dayMs,
    );
    const chartStart = Math.min(...starts);
    // End 7 days past the last task (project deadline) so there is margin on the
    // right; never earlier than today so the today line always has room.
    const lastEnd = Math.max(...ends);
    const chartEnd = Math.max(lastEnd + 7 * dayMs, now);
    const days = Math.max(1, Math.ceil((chartEnd - chartStart) / dayMs));

    const bars: GanttBar[] = scheduled
      .map((t) => {
        const barStart = startOf(t.start_date as string);
        const duration = Math.max(t.duration_days, 1);
        const barEnd = barStart + duration * dayMs;
        const due = t.due_date ? startOf(t.due_date) : barEnd;
        // Unfinished and past due: red tail from bar end to today.
        const overdueDays =
          !isDone(t.status) && now > due ? Math.round((now - Math.max(barEnd, due)) / dayMs) : 0;
        return {
          id: t.id,
          name: t.text,
          startOffset: Math.round((barStart - chartStart) / dayMs),
          duration,
          status: t.status,
          progress: t.progress,
          critical: t.is_critical,
          overdueDays,
          doneLate: t.done_late,
          dueDate: t.due_date ?? null,
        };
      })
      .sort((a, b) => a.startOffset - b.startOffset);

    const todayOffset = now >= chartStart && now <= chartEnd ? Math.round((now - chartStart) / dayMs) : null;

    return { bars, days, todayOffset, startDate: new Date(chartStart).toISOString() };
  }, [timeline.data]);

  if (timeline.isLoading) return <Spinner label="Loading timeline…" />;
  if (timeline.isError) return <ErrorState message="Timeline could not be loaded." />;

  const unscheduled = (timeline.data?.tasks.length ?? 0) - chart.bars.length;

  return (
    <Card
      title="Project timeline"
      right={
        <div className="pmp-gantt-header-actions">
          <span className="pmp-gantt-legend">
            <span style={{ color: "var(--status-delayed)" }}>● critical path</span>
            <span style={{ color: "var(--status-delayed)" }}>today line</span>
          </span>
          <button
            type="button"
            className={`pmp-timeline-lock ${timelineLocked ? "is-locked" : "is-unlocked"}`}
            onClick={() => canManage && setTimelineLocked((locked) => !locked)}
            disabled={!canManage}
            aria-pressed={!timelineLocked}
            aria-label={timelineLocked ? "Unlock timeline editing" : "Lock timeline editing"}
            title={
              !canManage
                ? "You do not have permission to reschedule tasks"
                : timelineLocked
                  ? "Unlock to zoom, pan and drag tasks"
                  : "Lock timeline to prevent accidental changes"
            }
          >
            {timelineLocked ? <Lock size={15} /> : <Unlock size={15} />}
            <span>{timelineLocked ? "Locked" : "Editing"}</span>
          </button>
        </div>
      }
      padded
    >
      {chart.bars.length === 0 ? (
        <EmptyState
          title="No scheduled tasks"
          hint="Give tasks a due date and an estimate to place them on the timeline."
        />
      ) : (
        <div ref={containerRef}>
          <GanttChart
            tasks={chart.bars}
            days={chart.days}
            todayOffset={chart.todayOffset}
            startDate={chart.startDate}
            labelWidth={GANTT_LABEL_WIDTH}
            dayWidth={
              containerWidth > 0
                ? Math.max(34, (containerWidth - GANTT_LABEL_WIDTH) / chart.days)
                : 34
            }
            onOpen={(id) => router.push(`/tasks/${id}`)}
            onUpdateDue={canManage && !timelineLocked ? (id, dueDate) => updateDue.mutate({ id: id as UUID, dueDate }) : undefined}
            editable={canManage && !timelineLocked}
            interactionLocked={timelineLocked}
            onSchedule={canManage && !timelineLocked ? (id, dates) =>
              reschedule.mutate({ id: id as UUID, start_date: dates.start_date, due_date: dates.due_date }) : undefined
            }
          />
          {canManage && (
            <div className={`pmp-gantt-help ${timelineLocked ? "is-locked" : "is-unlocked"}`}>
              {timelineLocked ? <Lock size={13} /> : <Unlock size={13} />}
              {timelineLocked
                ? "Timeline is fixed. Scroll horizontally to inspect dates; unlock it to make changes."
                : "Editing enabled: wheel to zoom, drag empty space to pan, drag a bar to move it, or drag its edges to resize it."}
            </div>
          )}
          {unscheduled > 0 && (
            <div style={{ marginTop: 12, fontSize: 12, color: "var(--text-tertiary)" }}>
              {unscheduled} task{unscheduled === 1 ? "" : "s"} without a due date are not shown.
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/* ------------------------------ Board ------------------------------ */
function BoardTab({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const qc = useQueryClient();
  const router = useRouter();
  const toast = useToast();
  const { nameOf } = useUserMap();
  const [phaseId, setPhaseId] = useState<UUID | null>(null);
  const [dragId, setDragId] = useState<UUID | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newPhaseOpen, setNewPhaseOpen] = useState(false);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskRead | null>(null);
  const [phaseName, setPhaseName] = useState("");

  const phases = useQuery({ queryKey: ["phases", projectId], queryFn: () => getProjectPhases(projectId) });

  useEffect(() => {
    if (!phaseId && phases.data && phases.data.length > 0) setPhaseId(phases.data[0].id);
  }, [phases.data, phaseId]);

  const tasks = useQuery({
    queryKey: ["phase-tasks", phaseId],
    queryFn: () => getPhaseTasks(phaseId!),
    enabled: !!phaseId,
  });
  const progress = useQuery({
    queryKey: ["phase-progress", phaseId],
    queryFn: () => getPhaseProgress(phaseId!),
    enabled: !!phaseId,
  });

  useRealtimeEvent(
    ["task.status_changed"],
    () => {
      qc.invalidateQueries({ queryKey: ["phase-tasks", phaseId] });
      qc.invalidateQueries({ queryKey: ["phase-progress", phaseId] });
    },
    [`project-${projectId}`],
  );

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: UUID; status: TaskStatus }) => updateTaskStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["phase-tasks", phaseId] });
      qc.invalidateQueries({ queryKey: ["phase-progress", phaseId] });
      qc.invalidateQueries({ queryKey: ["project-overview", projectId] });
    },
    onError: (e) => {
      setError(
        e instanceof AppError
          ? e.status === 403
            ? "You don't have permission to move this task."
            : e.message
          : "Failed to update task.",
      );
      setTimeout(() => setError(null), 4000);
    },
  });

  const addPhase = useMutation({
    mutationFn: () =>
      createPhase({ project_id: projectId as UUID, name: phaseName, sequence: (phases.data?.length ?? 0) + 1 }),
    onSuccess: () => {
      toast.push("Phase created.", "success");
      setNewPhaseOpen(false);
      setPhaseName("");
      phases.refetch();
    },
  });

  function onDrop(columnStatuses: TaskStatus[]) {
    if (!dragId) return;
    const task = (tasks.data ?? []).find((t) => t.id === dragId);
    setDragId(null);
    if (!task) return;
    if (columnStatuses.includes(task.status as TaskStatus)) return;
    statusMutation.mutate({ id: task.id, status: columnStatuses[0] });
  }

  const byColumn = KANBAN_COLUMNS.map((col) => ({
    ...col,
    tasks: (tasks.data ?? []).filter((t) => col.statuses.includes(t.status as TaskStatus)),
  }));
  const activePhase = (phases.data ?? []).find((ph) => ph.id === phaseId);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {error && <ErrorState message={error} />}

      {phases.isLoading ? (
        <Spinner />
      ) : (phases.data?.length ?? 0) === 0 ? (
        <div
          style={{
            padding: 24,
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-3)",
            background: "var(--surface-2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <EmptyState title="No phases yet" hint={canManage ? "Create the first phase to start planning work." : "An administrator needs to create a phase first."} />
          {canManage && (
            <Button onClick={() => setNewPhaseOpen(true)}>
              <Plus size={14} /> Create phase
            </Button>
          )}
        </div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <Tabs
                items={(phases.data ?? []).map((ph) => ({ key: ph.id, label: ph.name }))}
                active={phaseId ?? ""}
                onChange={setPhaseId}
              />
            </div>
            {canManage && (
              <div style={{ display: "flex", gap: 8 }}>
                <Button variant="secondary" onClick={() => setNewTaskOpen(true)} disabled={!phaseId}>
                  <Plus size={14} /> Task
                </Button>
                <Button variant="secondary" onClick={() => setNewPhaseOpen(true)}>
                  <Plus size={14} /> Phase
                </Button>
              </div>
            )}
          </div>

          <div style={{ background: "var(--surface-2)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-3)", padding: 18 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Phase Progress
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                {activePhase?.lead_assignee_user_id ? (
                  <>
                    <Avatar name={nameOf(activePhase.lead_assignee_user_id)} size={22} />
                    <span style={{ fontSize: 12.5, color: "var(--text-secondary)", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {nameOf(activePhase.lead_assignee_user_id)}
                    </span>
                  </>
                ) : (
                  <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>No phase lead</span>
                )}
              </div>
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 15, letterSpacing: 2, color: "var(--accent-primary)", marginBottom: 12, overflow: "hidden", whiteSpace: "nowrap" }}>
              {blockMeter(progress.data?.percentage ?? 0, 28)}{" "}
              <span style={{ color: "var(--text-primary)", fontWeight: 700, letterSpacing: "normal" }}>
                {Math.round(progress.data?.percentage ?? 0)}%
              </span>
            </div>
            <ProgressBar percent={progress.data?.percentage ?? 0} blocks={28} showLabel={false} />
          </div>

          {tasks.isLoading ? (
            <Spinner label="Loading tasks…" />
          ) : (
            <div style={{ display: "flex", gap: 14, alignItems: "flex-start", overflowX: "auto", paddingBottom: 6 }}>
              {byColumn.map((col) => (
                <div
                  key={col.title}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => onDrop(col.statuses)}
                  style={{ flex: 1, minWidth: 268, background: "var(--surface-2)", borderRadius: "var(--radius-3)", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 4px" }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: col.dot }} />
                    <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.03em", textTransform: "uppercase", color: "var(--text-secondary)" }}>
                      {col.title}
                    </span>
                    <span style={{ fontSize: 12, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{col.tasks.length}</span>
                  </div>
                  {col.tasks.map((t) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      nameOf={nameOf}
                      onOpen={() => router.push(`/tasks/${t.id}`)}
                      onDragStart={() => setDragId(t.id)}
                    />
                  ))}
                  {col.tasks.length === 0 && <div style={{ fontSize: 12, color: "var(--text-tertiary)", padding: "8px 4px" }}>No tasks</div>}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <Modal
        open={newPhaseOpen}
        onClose={() => setNewPhaseOpen(false)}
        title="New phase"
        footer={
          <>
            <Button variant="secondary" onClick={() => setNewPhaseOpen(false)}>Cancel</Button>
            <Button disabled={!phaseName || addPhase.isPending} onClick={() => addPhase.mutate()}>
              {addPhase.isPending ? "Creating…" : "Create phase"}
            </Button>
          </>
        }
      >
        <Field label="Phase name">
          <TextInput value={phaseName} onChange={(e) => setPhaseName(e.target.value)} placeholder="e.g. Development" />
        </Field>
      </Modal>
      <TaskEditorModal
        open={newTaskOpen}
        onClose={() => setNewTaskOpen(false)}
        projectId={projectId as UUID}
        phaseId={phaseId}
        onCreated={() => {
          qc.invalidateQueries({ queryKey: ["phase-tasks", phaseId] });
          qc.invalidateQueries({ queryKey: ["phase-progress", phaseId] });
          qc.invalidateQueries({ queryKey: ["project-overview", projectId] });
        }}
      />
      <TaskDetailModal task={selectedTask} nameOf={nameOf} onClose={() => setSelectedTask(null)} />
    </div>
  );
}

function TaskCard({
  task,
  nameOf,
  onOpen,
  onDragStart,
}: {
  task: TaskRead;
  nameOf: (id?: string | null) => string;
  onOpen: () => void;
  onDragStart: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const assignee = task.assignee_user_ids[0];
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={() => setExpanded((value) => !value)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setExpanded((value) => !value);
        }
      }}
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      aria-label={`${expanded ? "Collapse" : "Expand"} ${task.title}`}
      className="pmp-row"
      style={{ background: "var(--surface-2)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-2)", padding: 14, display: "flex", flexDirection: "column", gap: 11, cursor: "pointer", minHeight: 118 }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <span style={{ color: "var(--text-tertiary)", display: "inline-flex", marginTop: 2 }}>
          {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </span>
        <div style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 800, lineHeight: "21px" }}>{task.title}</div>
        {task.github_url && (
          <a href={task.github_url} target="_blank" rel="noreferrer" title="View in GitHub" aria-label={`View ${task.title} in GitHub`} onClick={(e) => e.stopPropagation()}>
            <ExternalLink size={15} style={{ color: "var(--text-tertiary)", marginTop: 2 }} />
          </a>
        )}
        <button
          type="button"
          title="Open task page"
          aria-label={`Open task page for ${task.title}`}
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          style={{ border: "none", background: "transparent", color: "var(--text-tertiary)", padding: 0, cursor: "pointer", display: "inline-flex", marginTop: 2 }}
        >
          <ExternalLink size={15} />
        </button>
      </div>
      {expanded && task.description && (
        <div style={{ maxHeight: 62, overflow: "hidden" }}>
          <MarkdownPreview value={task.description} />
        </div>
      )}
      {expanded && (
        <>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            <span style={taskPill}>{task.task_type}</span>
            {task.partition && <span style={taskPill}>{task.partition}</span>}
            {task.parent_task_id && (
              <span style={taskPill}>
                <GitBranch size={11} /> Subtask
              </span>
            )}
            {task.labels.slice(0, 4).map((label) => (
              <span key={label} style={labelPill}>{label}</span>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--text-tertiary)" }}>{task.id.slice(0, 8)}</span>
            <PriorityBadge level={task.priority} compact />
          </div>
          {(task.start_date || task.due_date || task.estimated_hours != null) && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 11.5, color: "var(--text-tertiary)" }}>
              {task.start_date && <span>Start {task.start_date}</span>}
              {task.due_date && <span>Due {task.due_date}</span>}
              {task.estimated_hours != null && <span>{task.estimated_hours}h est</span>}
            </div>
          )}
        </>
      )}
      {!expanded && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-tertiary)", fontSize: 12.5 }}>
          <PriorityBadge level={task.priority} compact />
          {task.due_date && <span>Due {task.due_date}</span>}
          {task.estimated_hours != null && <span>{task.estimated_hours}h</span>}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid var(--border-subtle)", paddingTop: 9 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {assignee ? <Avatar name={nameOf(assignee)} size={26} /> : <span style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>Unassigned</span>}
          {task.assignee_user_ids.length > 1 && <span style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>+{task.assignee_user_ids.length - 1}</span>}
          {task.is_critical && <span title="Critical path" style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--status-delayed)" }} />}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {task.labels.length > 4 && <span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>+{task.labels.length - 4}</span>}
          {task.story_points != null && (
            <span style={{ fontSize: 12.5, fontWeight: 800, fontFamily: "var(--font-mono)", color: "var(--text-secondary)", background: "var(--surface-3)", borderRadius: "var(--radius-full)", padding: "3px 10px" }}>
              {task.story_points} pts
            </span>
          )}
          {task.labels.length > 0 && <ListChecks size={15} style={{ color: "var(--text-tertiary)" }} />}
        </div>
      </div>
    </div>
  );
}

function TaskDetailModal({
  task,
  nameOf,
  onClose,
}: {
  task: TaskRead | null;
  nameOf: (id?: string | null) => string;
  onClose: () => void;
}) {
  return (
    <Modal
      open={!!task}
      onClose={onClose}
      title={task?.title ?? "Task details"}
      width={760}
      footer={
        <>
          {task?.github_url && (
            <a href={task.github_url} target="_blank" rel="noreferrer">
              <Button variant="secondary">
                <ExternalLink size={14} /> View in GitHub
              </Button>
            </a>
          )}
          <Button onClick={onClose}>Close</Button>
        </>
      }
    >
      {task && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <StatusChip status={String(task.status)} label={String(task.status)} />
            <PriorityBadge level={String(task.priority)} compact />
            <span style={taskPill}>{task.task_type}</span>
            {task.partition && <span style={taskPill}>{task.partition}</span>}
            {task.is_critical && <span style={{ ...taskPill, color: "var(--status-delayed)" }}>Critical path</span>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
            <TaskFact label="Created" value={task.created_at.slice(0, 10)} />
            <TaskFact label="Start" value={task.start_date ?? "Not set"} />
            <TaskFact label="Due" value={task.due_date ?? "Not set"} />
            <TaskFact label="Estimate" value={task.estimated_hours != null ? `${task.estimated_hours}h` : "Not set"} />
            <TaskFact label="Story points" value={task.story_points != null ? String(task.story_points) : "Not set"} />
            <TaskFact label="Task ID" value={task.id.slice(0, 8)} mono />
          </div>
          <div>
            <div style={detailLabel}>Assignees</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {task.assignee_user_ids.length === 0 && <span style={{ color: "var(--text-tertiary)", fontSize: 13 }}>Unassigned</span>}
              {task.assignee_user_ids.map((id) => (
                <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 9px", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-full)", background: "var(--surface-2)" }}>
                  <Avatar name={nameOf(id)} size={22} />
                  <span style={{ fontSize: 12.5, fontWeight: 700 }}>{nameOf(id)}</span>
                </span>
              ))}
            </div>
          </div>
          <div>
            <div style={detailLabel}>Description</div>
            <div style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-2)", padding: 12, background: "var(--surface-2)" }}>
              <MarkdownPreview value={task.description} empty="No description provided." />
            </div>
          </div>
          {task.labels.length > 0 && (
            <div>
              <div style={detailLabel}>Labels</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {task.labels.map((label) => <span key={label} style={labelPill}>{label}</span>)}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function TaskFact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-2)", padding: 10, background: "var(--surface-2)" }}>
      <div style={{ fontSize: 11, color: "var(--text-tertiary)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 13, color: "var(--text-primary)", fontWeight: 700, fontFamily: mono ? "var(--font-mono)" : undefined }}>{value}</div>
    </div>
  );
}

const taskPill: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  fontSize: 12,
  fontWeight: 800,
  color: "var(--text-secondary)",
  background: "var(--surface-2)",
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-full)",
  padding: "3px 8px",
};

const labelPill: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  fontSize: 12,
  fontWeight: 800,
  color: "var(--accent-secondary)",
  background: "color-mix(in srgb, var(--accent-secondary) 13%, transparent)",
  borderRadius: "var(--radius-full)",
  padding: "3px 8px",
};

const detailLabel: React.CSSProperties = {
  fontSize: 11,
  color: "var(--text-tertiary)",
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  marginBottom: 8,
};

/* ------------------------------ Team ------------------------------ */
const MEMBER_ROLES = ["ProjectManager", "TeamLead", "Developer", "QA", "UIUX", "BusinessAnalyst", "Client", "Observer"];

function TeamTab({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const toast = useToast();
  const { nameOf, users } = useUserMap();
  const [addOpen, setAddOpen] = useState(false);
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState("Developer");

  const overview = useQuery({
    queryKey: ["project-overview", projectId],
    queryFn: () => getProjectOverview(projectId),
  });
  const members = overview.data?.members ?? [];

  const add = useMutation({
    mutationFn: () => addProjectMember(projectId as UUID, userId as UUID, role),
    onSuccess: () => {
      toast.push("Member added — they now have access to the project channel.", "success");
      setAddOpen(false);
      overview.refetch();
    },
  });
  const remove = useMutation({
    mutationFn: (uid: UUID) => removeProjectMember(projectId as UUID, uid),
    onSuccess: () => {
      toast.push("Member removed.", "success");
      overview.refetch();
    },
  });

  const nonMembers = users.filter((u) => !members.some((m) => m.user_id === u.id));

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        {canManage && (
          <Button onClick={() => setAddOpen(true)}>
            <Plus size={14} /> Add member
          </Button>
        )}
      </div>
      <Card padded={false}>
        {members.length === 0 && <div style={{ padding: 18, fontSize: 12.5, color: "var(--text-tertiary)" }}>No members yet.</div>}
        {members.map((m) => (
          <div key={m.user_id} className="pmp-row" style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 16px", borderBottom: "1px solid var(--border-subtle)" }}>
            <Avatar name={nameOf(m.user_id)} size={30} />
            <Link href={`/profile/${m.user_id}`} style={{ fontWeight: 600, fontSize: 13.5, flex: 1 }}>
              {nameOf(m.user_id)}
            </Link>
            <span style={{ fontSize: 12, color: "var(--text-secondary)", background: "var(--surface-2)", padding: "2px 10px", borderRadius: "var(--radius-full)" }}>
              {m.role}
            </span>
            {canManage && (
              <button
                onClick={() => remove.mutate(m.user_id)}
                title="Remove member"
                style={{ border: "none", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer", display: "flex" }}
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
      </Card>

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add project member"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button disabled={!userId || add.isPending} onClick={() => add.mutate()}>
              {add.isPending ? "Adding…" : "Add member"}
            </Button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label="User">
            <Select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="Choose a user…"
              options={nonMembers.map((u) => ({ value: u.id, label: u.full_name }))}
            />
          </Field>
          <Field label="Project role">
            <Select value={role} onChange={(e) => setRole(e.target.value)} options={MEMBER_ROLES.map((r) => ({ value: r, label: r }))} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

/* ------------------------------ Milestones ------------------------------ */
function MilestonesTab({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const toast = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: "", due_date: "" });

  const overview = useQuery({
    queryKey: ["project-overview", projectId],
    queryFn: () => getProjectOverview(projectId),
  });
  const milestones = overview.data?.milestones ?? [];

  const create = useMutation({
    mutationFn: () =>
      createMilestone(projectId as UUID, {
        name: form.name,
        due_date: form.due_date || undefined,
        sequence: milestones.length + 1,
      }),
    onSuccess: () => {
      toast.push("Milestone created.", "success");
      setCreateOpen(false);
      setForm({ name: "", due_date: "" });
      overview.refetch();
    },
  });
  const toggle = useMutation({
    mutationFn: ({ id, completed }: { id: UUID; completed: boolean }) => updateMilestone(id, { completed }),
    onSuccess: () => overview.refetch(),
  });

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        {canManage && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus size={14} /> Milestone
          </Button>
        )}
      </div>
      <Card padded={false}>
        {milestones.length === 0 && <div style={{ padding: 18, fontSize: 12.5, color: "var(--text-tertiary)" }}>No milestones yet.</div>}
        {milestones.map((m) => (
          <div key={m.id} className="pmp-row" style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid var(--border-subtle)" }}>
            <button
              onClick={() => canManage && toggle.mutate({ id: m.id, completed: !m.completed_at })}
              title={m.completed_at ? "Mark incomplete" : "Mark complete"}
              style={{ border: "none", background: "transparent", cursor: canManage ? "pointer" : "default", display: "flex" }}
            >
              <Diamond size={16} style={{ color: m.completed_at ? "var(--status-completed)" : "var(--accent-gold)" }} fill={m.completed_at ? "var(--status-completed)" : "none"} />
            </button>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 13.5, textDecoration: m.completed_at ? "line-through" : undefined, color: m.completed_at ? "var(--text-tertiary)" : undefined }}>
                {m.name}
              </div>
              {m.description && <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{m.description}</div>}
            </div>
            <span style={{ fontSize: 12, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{m.due_date ?? "no date"}</span>
          </div>
        ))}
      </Card>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New milestone"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button disabled={!form.name || create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? "Creating…" : "Create milestone"}
            </Button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label="Name">
            <TextInput value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Beta release" />
          </Field>
          <Field label="Due date">
            <TextInput type="date" value={form.due_date} onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

/* ------------------------------ Blockers ------------------------------ */
const REASON_LABEL: Record<string, string> = {
  waiting_on_person: "Waiting on person",
  technical: "Technical",
  business: "Business",
  external: "External",
};

function BlockersTab({ projectId }: { projectId: string }) {
  const { nameOf } = useUserMap();
  const { data: blockers } = useQuery({ queryKey: ["blockers"], queryFn: () => listBlockers() });
  const { data: phases } = useQuery({ queryKey: ["phases", projectId], queryFn: () => getProjectPhases(projectId) });

  const phaseIds = useMemo(() => new Set((phases ?? []).map((p) => p.id)), [phases]);
  const taskQueries = useQuery({
    queryKey: ["project-task-ids", projectId, phases?.length],
    queryFn: async () => {
      const all: TaskRead[] = [];
      for (const ph of phases ?? []) {
        all.push(...(await getPhaseTasks(ph.id)));
      }
      return all;
    },
    enabled: (phases?.length ?? 0) > 0,
  });
  const taskById = new Map((taskQueries.data ?? []).map((t) => [t.id, t]));
  const projectBlockers = (blockers ?? []).filter((b) => taskById.has(b.blocked_task_id));
  void phaseIds;

  return (
    <div style={{ maxWidth: 860, display: "flex", flexDirection: "column", gap: 10 }}>
      {projectBlockers.length === 0 && <EmptyState title="No blockers" hint="Nothing in this project is blocked. Keep it that way!" />}
      {projectBlockers.map((b: BlockerRead) => (
        <div
          key={b.id}
          style={{
            background: "var(--surface-2)",
            border: `1px solid ${b.status === "Resolved" ? "var(--border-subtle)" : "var(--status-blocked)"}`,
            borderRadius: "var(--radius-3)",
            padding: "14px 16px",
            display: "flex",
            gap: 12,
            alignItems: "flex-start",
            opacity: b.status === "Resolved" ? 0.7 : 1,
          }}
        >
          <ShieldAlert size={17} style={{ color: "var(--status-blocked)", flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
              <span style={{ fontWeight: 700, fontSize: 13.5 }}>{b.title}</span>
              <StatusChip status={b.status === "Resolved" ? "completed" : "blocked"} label={b.status} />
              {b.block_reason && (
                <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: "var(--radius-full)", background: "var(--surface-2)", color: "var(--text-secondary)" }}>
                  {REASON_LABEL[b.block_reason] ?? b.block_reason}
                </span>
              )}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 4 }}>
              Blocks: {taskById.get(b.blocked_task_id)?.title ?? b.blocked_task_id.slice(0, 8)}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 4, display: "flex", gap: 14, flexWrap: "wrap" }}>
              <span>Pending on <b style={{ color: "var(--text-secondary)" }}>{nameOf(b.pending_on_user_id)}</b></span>
              {b.estimated_unblock_date && <span>ETA {b.estimated_unblock_date}</span>}
              <span>Raised {relativeTime(b.created_at)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------ Discussions ------------------------------ */
function DiscussionsTab({ projectId }: { projectId: string }) {
  const { data: channels } = useQuery({ queryKey: ["chat-channels"], queryFn: listChannels });
  const channel = (channels ?? []).find((c) => c.channel.project_id === projectId)?.channel;

  if (!channel) {
    return (
      <EmptyState
        title="No project channel"
        hint="You may not be a member of this project. Project channels are created automatically and are member-only."
      />
    );
  }
  return (
    <div style={{ height: 560, border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-3)", overflow: "hidden", background: "var(--surface-2)" }}>
      <ChannelConversation channelId={channel.id} channelName={channel.name} />
    </div>
  );
}

const dangerButton: React.CSSProperties = {
  color: "var(--status-delayed)",
  borderColor: "rgba(239, 68, 68, 0.35)",
};

const partitionBadge: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid color-mix(in srgb, var(--accent-primary) 28%, var(--border-subtle))",
  borderRadius: "var(--radius-full)",
  background: "var(--accent-primary-soft)",
  color: "var(--accent-primary)",
  padding: "3px 9px",
  fontSize: 11.5,
  fontWeight: 800,
  textTransform: "capitalize",
};

const levelBadge: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-full)",
  background: "var(--surface-2)",
  color: "var(--text-secondary)",
  padding: "3px 9px",
  fontSize: 11.5,
  fontWeight: 800,
};
