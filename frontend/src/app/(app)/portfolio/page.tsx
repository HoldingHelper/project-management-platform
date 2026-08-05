"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Bot, Layers3, Plus, Search, UsersRound } from "lucide-react";
import {
  addProjectMember,
  attachTask,
  createProduct,
  createPhase,
  createProject,
  getPortfolioGantt,
  listProducts,
  listProjects,
  listTasks,
} from "@/lib/api/projects";
import { useUserMap } from "@/lib/hooks";
import {
  Avatar,
  Button,
  Card,
  Field,
  FocusCard,
  MarkdownPreview,
  Modal,
  PriorityBadge,
  ProgressBar,
  Select,
  TextArea,
  StatusChip,
  Tabs,
  TextInput,
  useToast,
} from "@/components/ds";
import { EmptyState, PAGE_STYLE, PageHeader, Spinner } from "@/components/ui/States";
import { PortfolioGanttChart } from "@/components/gantt/PortfolioGanttChart";
import { relativeTime } from "@/lib/format";
import { useAuth } from "@/lib/auth/AuthProvider";
import type { PortfolioGantt, ProjectLevel, TaskRead, UUID } from "@/lib/types";

const PROJECT_LEVELS: { value: ProjectLevel; label: string; detail: string }[] = [
  { value: "inter-team", label: "Inter-team", detail: "Inside one partition" },
  { value: "inter-partition", label: "Inter-partition", detail: "Across partitions" },
  { value: "organization", label: "Organization", detail: "Company-wide" },
];
const PROJECT_PARTITIONS = [
  { value: "all", label: "All partitions" },
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

function ProjectLevelBadge({ level }: { level: ProjectLevel }) {
  const meta = PROJECT_LEVELS.find((item) => item.value === level)!;
  return (
    <span
      title={meta.detail}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        width: "fit-content",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-full)",
        background: "var(--surface-2)",
        color: "var(--text-secondary)",
        padding: "3px 8px",
        fontSize: 11.5,
        fontWeight: 800,
      }}
    >
      <Layers3 size={12} />
      {meta.label}
    </span>
  );
}

export default function PortfolioPage() {
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [timelinePartition, setTimelinePartition] = useState<string>("all");
  const [showArchived, setShowArchived] = useState(false);
  const { hasPermission, isSuperAdmin } = useAuth();
  const projects = useQuery({ queryKey: ["projects"], queryFn: () => listProjects(1, 200) });
  const products = useQuery({ queryKey: ["products"], queryFn: () => listProducts(1, 200) });
  const gantt = useQuery({
    queryKey: ["portfolio-gantt", showArchived],
    queryFn: () => getPortfolioGantt(showArchived),
  });
  const { nameOf } = useUserMap();

  const canCreate = isSuperAdmin() || hasPermission("projects.manage_all");
  const canGenerate =
    isSuperAdmin() ||
    hasPermission("projects.manage_assigned", "phases.manage_team", "tasks.manage_team", "tasks.manage_all");

  const ownerByProduct = useMemo(() => {
    const m = new Map<UUID, UUID>();
    for (const p of products.data?.items ?? []) m.set(p.id, p.owner_user_id);
    return m;
  }, [products.data]);
  const items = projects.data?.items ?? [];
  const q = search.trim().toLowerCase();
  const filtered = q
    ? items.filter((p) => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q))
    : items;
  const visibleGantt = useMemo(() => {
    const source = gantt.data ?? { projects: [], links: [] };
    const match = (p: (typeof source.projects)[number]) => {
      return timelinePartition === "all" || projectPartitionFromTags(p.tags) === timelinePartition;
    };
    const modeProjects = source.projects.filter(match);
    const ids = new Set(modeProjects.map((p) => p.id));
    return {
      projects: modeProjects,
      links: source.links.filter((l) => ids.has(l.predecessor_project_id) && ids.has(l.successor_project_id)),
    };
  }, [gantt.data, timelinePartition]);

  return (
    <div style={{ ...PAGE_STYLE, gap: 18 }}>
      <PageHeader
        title="Project Portfolio"
        subtitle={`${items.length} projects · organization-wide.`}
        actions={
          canCreate || canGenerate ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {canGenerate && (
                <Link href="/projects/ai-generator" style={{ textDecoration: "none" }}>
                  <Button variant="secondary">
                    <Bot size={14} /> AI project
                  </Button>
                </Link>
              )}
              {canCreate && (
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus size={14} /> New project
                </Button>
              )}
            </div>
          ) : undefined
        }
      />

      <FocusCard
        title="Portfolio timeline"
        focusChildren={
          <TimelinePanel
            timelinePartition={timelinePartition}
            setTimelinePartition={setTimelinePartition}
            showArchived={showArchived}
            setShowArchived={setShowArchived}
            loading={gantt.isLoading}
            data={visibleGantt}
            focused
          />
        }
      >
        <TimelinePanel
          timelinePartition={timelinePartition}
          setTimelinePartition={setTimelinePartition}
          showArchived={showArchived}
          setShowArchived={setShowArchived}
          loading={gantt.isLoading}
          data={visibleGantt}
        />
      </FocusCard>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <TextInput
          icon={<Search size={15} />}
          placeholder="Filter by name or ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 220, maxWidth: 380 }}
        />
      </div>

      <section style={{ background: "var(--surface-2)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-3)", overflowX: "auto", overflowY: "hidden" }}>
        <div style={{ minWidth: 1060 }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(220px,1.35fr) 150px 120px 150px 260px 140px 90px 110px", padding: "11px 18px", fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid var(--border-subtle)", background: "var(--surface-1)" }}>
          <span>Project</span><span>Owner</span><span>Partition</span><span>Level</span><span>Progress & team</span><span>Status</span><span>Priority</span><span style={{ textAlign: "right" }}>Updated</span>
        </div>

        {projects.isLoading ? (
          <Spinner label="Loading projects…" />
        ) : filtered.length === 0 ? (
          <EmptyState
            title={items.length === 0 ? "No projects yet" : `No projects match “${search}”`}
            hint={items.length === 0 ? (canCreate ? "Create the first project to group imported tasks." : "An administrator creates projects here.") : undefined}
          />
        ) : (
          filtered.map((p) => {
            const owner = nameOf(ownerByProduct.get(p.product_id));
            const archived = p.status === "archived";
            const level = projectLevelFromTags(p.tags);
            const partition = projectPartitionFromTags(p.tags);
            return (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className="pmp-row"
                style={{ display: "grid", gridTemplateColumns: "minmax(220px,1.35fr) 150px 120px 150px 260px 140px 90px 110px", alignItems: "center", padding: "13px 18px", borderBottom: "1px solid var(--border-subtle)", opacity: archived ? 0.68 : 1 }}
              >
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                  <span style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{p.id.slice(0, 8)}</span>
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <Avatar name={owner} size={24} />
                  <span style={{ fontSize: 12.5, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{owner}</span>
                </span>
                <span style={{ ...partitionBadge, textTransform: "capitalize" }}>{partition}</span>
                <ProjectLevelBadge level={level} />
                <span style={{ paddingRight: 18, display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ flex: 1, minWidth: 120 }}>
                    <ProgressBar percent={Number(p.progress_percentage)} blocks={14} />
                  </span>
                  <span title="Owner accountable for this progress" style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--text-tertiary)", fontSize: 11.5 }}>
                    <UsersRound size={13} />
                    <Avatar name={owner} size={20} />
                  </span>
                </span>
                <span>
                  <StatusChip
                    status={String(p.status === "in-progress" ? p.health_status : p.status)}
                    label={p.status === "archived" ? "Archived" : undefined}
                  />
                </span>
                <span><PriorityBadge level={String(p.priority)} compact /></span>
                <span style={{ textAlign: "right", fontSize: 12, color: "var(--text-tertiary)" }}>{relativeTime(p.updated_at)}</span>
              </Link>
            );
          })
        )}
        </div>
      </section>

      <CreateProjectModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

function TimelinePanel({
  timelinePartition,
  setTimelinePartition,
  showArchived,
  setShowArchived,
  loading,
  data,
  focused = false,
}: {
  timelinePartition: string;
  setTimelinePartition: (key: string) => void;
  showArchived: boolean;
  setShowArchived: (show: boolean) => void;
  loading: boolean;
  data: PortfolioGantt;
  focused?: boolean;
}) {
  return (
    <div style={{ minHeight: focused ? 560 : undefined }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <Tabs
          items={PROJECT_PARTITIONS.map((partition) => ({ key: partition.value, label: partition.label }))}
          active={timelinePartition}
          onChange={setTimelinePartition}
        />
        <Button
          variant={showArchived ? "primary" : "secondary"}
          onClick={() => setShowArchived(!showArchived)}
          style={{ height: 32 }}
        >
          <Archive size={14} /> {showArchived ? "Hide archives" : "Show archives"}
        </Button>
      </div>
      {loading ? (
        <Spinner label="Loading timeline…" />
      ) : (
        <PortfolioGanttChart data={data} />
      )}
      <div style={{ display: "flex", gap: 18, marginTop: 12, fontSize: 11.5, color: "var(--text-tertiary)", flexWrap: "wrap" }}>
        <span>Filtered by project partition</span>
        <span>◆ milestone (gold = open, green = done)</span>
        <span style={{ color: "var(--accent-secondary)" }}>┄→ cross-project dependency</span>
        <span style={{ color: "var(--status-delayed)" }}>│ today</span>
        <span>pulsing bar = blocked / delayed</span>
      </div>
    </div>
  );
}

const PRODUCT_LINES = ["Core Product", "Client Work", "Internal"];
const DEFAULT_PHASES = ["Discovery", "Design", "Build", "Launch"];
const PROJECT_STATUSES = [
  { value: "not-started", label: "Not started" },
  { value: "in-progress", label: "In progress" },
  { value: "on-hold", label: "On hold" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "archived", label: "Archived" },
];
const HEALTH_STATUSES = [
  { value: "on-track", label: "On track" },
  { value: "at-risk", label: "At risk" },
  { value: "delayed", label: "Delayed" },
  { value: "blocked", label: "Blocked" },
  { value: "completed", label: "Completed" },
];

function CreateProjectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { users, nameOf } = useUserMap();
  const products = useQuery({ queryKey: ["products"], queryFn: () => listProducts(1, 200), enabled: open });
  const backlog = useQuery({
    queryKey: ["tasks", "unattached", "project-create"],
    queryFn: () => listTasks({ unattached: true, page_size: 16 }),
    enabled: open,
  });
  const [form, setForm] = useState({
    product_line: "Core Product",
    name: "",
    description: "",
    priority: "P2",
    risk_level: "Medium",
    status: "not-started",
    health_status: "on-track",
    start_date: "",
    end_date: "",
    actual_completion_date: "",
    phase_count: "4",
    phase_names: DEFAULT_PHASES.join("\n"),
    project_manager_id: "",
    lead_ids: [] as UUID[],
    task_ids: [] as UUID[],
    level: "inter-partition" as ProjectLevel,
    partition: "tech",
    tags: "",
  });

  const create = useMutation({
    mutationFn: async () => {
      const line = form.product_line || "Core Product";
      const existingProduct = (products.data?.items ?? []).find(
        (p) => p.name.trim().toLowerCase() === line.trim().toLowerCase(),
      );
      let productId = existingProduct?.id;
      if (!productId) {
        const createdProduct = await createProduct({
          name: line,
          owner_user_id: user!.id,
          description:
            line === "Internal"
              ? "Shared product line for internal and cross-functional work."
              : `${line} product line`,
        });
        productId = createdProduct.id;
      }

      const project = await createProject({
        product_id: productId as UUID,
        name: form.name,
        description: form.description || undefined,
        priority: form.priority,
        risk_level: form.risk_level,
        status: form.status,
        health_status: form.health_status,
        start_date: form.start_date || undefined,
        end_date: form.end_date || undefined,
        estimated_completion_date: form.end_date || undefined,
        actual_completion_date: form.actual_completion_date || undefined,
        tags: tagsWithTaxonomy(form.tags, form.level, form.partition),
      });

      const memberRoles = new Map<UUID, string>();
      if (user?.id) memberRoles.set(user.id, "ProjectManager");
      if (form.project_manager_id) memberRoles.set(form.project_manager_id as UUID, "ProjectManager");
      for (const id of form.lead_ids) memberRoles.set(id, "TeamLead");
      await Promise.all(
        [...memberRoles.entries()].map(([memberId, role]) =>
          addProjectMember(project.id, memberId, role).catch(() => undefined),
        ),
      );

      const count = Math.max(1, Math.min(12, Number(form.phase_count) || 1));
      const phaseNames = form.phase_names
        .split("\n")
        .map((name) => name.trim())
        .filter(Boolean);
      while (phaseNames.length < count) phaseNames.push(`Phase ${phaseNames.length + 1}`);
      const createdPhases = [];
      for (let i = 0; i < count; i += 1) {
        createdPhases.push(
          await createPhase({
            project_id: project.id,
            name: phaseNames[i],
            phase_type: i === 0 ? "Requirements" : i === count - 1 ? "Deployment" : "Development",
            sequence: i + 1,
            start_date: i === 0 ? form.start_date || undefined : undefined,
            end_date: i === count - 1 ? form.end_date || undefined : undefined,
            lead_assignee_user_id: form.lead_ids[i % Math.max(form.lead_ids.length, 1)],
          }),
        );
      }

      const targetPhase = createdPhases[0]?.id;
      if (targetPhase) {
        await Promise.all(form.task_ids.map((taskId) => attachTask(taskId, targetPhase).catch(() => undefined)));
      }

      return project;
    },
    onSuccess: () => {
      toast.push("Project created with phases, members, and selected tasks.", "success");
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio-gantt"] });
      queryClient.invalidateQueries({ queryKey: ["chat-channels"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      onClose();
    },
  });

  const toggleLead = (id: UUID) =>
    setForm((f) => ({
      ...f,
      lead_ids: f.lead_ids.includes(id) ? f.lead_ids.filter((x) => x !== id) : [...f.lead_ids, id],
    }));
  const toggleTask = (id: UUID) =>
    setForm((f) => ({
      ...f,
      task_ids: f.task_ids.includes(id) ? f.task_ids.filter((x) => x !== id) : [...f.task_ids, id],
    }));

  const valid = form.name.trim().length > 0 && form.product_line.trim().length > 0;
  const unattachedTasks = backlog.data?.items ?? [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New project"
      width={900}
      footer={
        <>
          <Link href="/projects/ai-generator" style={{ textDecoration: "none" }} onClick={onClose}>
            <Button variant="secondary">
              <Bot size={14} /> Use AI generator
            </Button>
          </Link>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={!valid || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? "Creating…" : "Create project"}
          </Button>
        </>
      }
    >
      <div style={aiGeneratorHint}>
        <Bot size={16} style={{ color: "var(--accent-primary)", flexShrink: 0 }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, color: "var(--text-primary)", fontSize: 13 }}>
            Want AI to create the full project and task plan?
          </div>
          <div style={{ color: "var(--text-secondary)", fontSize: 12.5, marginTop: 2 }}>
            Use the AI generator to upload a brief, include Google Sheets links, review the draft, then commit it.
          </div>
        </div>
        <Link href="/projects/ai-generator" style={{ textDecoration: "none" }} onClick={onClose}>
          <Button variant="secondary" style={{ height: 32 }}>
            Open
          </Button>
        </Link>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.15fr) minmax(280px, 0.85fr)", gap: 18 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label="Project name">
            <TextInput value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Customer Portal" />
          </Field>
          <Field label="Product line">
            <Select
              value={form.product_line}
              onChange={(e) => setForm((f) => ({ ...f, product_line: e.target.value }))}
              options={PRODUCT_LINES.map((p) => ({ value: p, label: p }))}
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
              options={PROJECT_PARTITIONS.filter((partition) => partition.value !== "all").map((partition) => ({ value: partition.value, label: partition.label }))}
            />
          </Field>
          <Field label="Description (Markdown)">
            <TextArea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder={"## Goal\n- What changes?\n- Who is involved?\n- Links, risks, decisions..."}
            />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
            <Field label="Status">
              <Select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} options={PROJECT_STATUSES} />
            </Field>
            <Field label="Health">
              <Select value={form.health_status} onChange={(e) => setForm((f) => ({ ...f, health_status: e.target.value }))} options={HEALTH_STATUSES} />
            </Field>
            <Field label="Priority">
              <Select
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                options={["P0", "P1", "P2", "P3"].map((p) => ({ value: p, label: p }))}
              />
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
            <TextInput value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} placeholder="planning, migration, customer-facing" />
          </Field>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Card title="Markdown preview" padded>
            <MarkdownPreview value={form.description} />
          </Card>
          <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: 10 }}>
            <Field label="Phases">
              <TextInput
                type="number"
                min={1}
                max={12}
                value={form.phase_count}
                onChange={(e) => setForm((f) => ({ ...f, phase_count: e.target.value }))}
              />
            </Field>
            <Field label="Phase names">
              <TextArea
                value={form.phase_names}
                onChange={(e) => setForm((f) => ({ ...f, phase_names: e.target.value }))}
                style={{ minHeight: 88 }}
              />
            </Field>
          </div>
          <Field label="Project manager">
            <Select
              value={form.project_manager_id}
              onChange={(e) => setForm((f) => ({ ...f, project_manager_id: e.target.value }))}
              placeholder={user ? `Creator: ${user.full_name}` : "Choose a manager..."}
              options={users.map((u) => ({ value: u.id, label: u.full_name }))}
            />
          </Field>
          <div>
            <div style={sectionLabel}>Leads to add and notify</div>
            <div style={pickerGrid}>
              {users.slice(0, 12).map((u) => (
                <label key={u.id} style={checkRow} title={`${u.full_name}${u.job_title ? ` - ${u.job_title}` : ""}`}>
                  <input type="checkbox" checked={form.lead_ids.includes(u.id)} onChange={() => toggleLead(u.id)} />
                  <Avatar name={u.full_name} size={22} />
                  <span style={ellipsis}>{u.full_name}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <div style={sectionLabel}>Attach existing standalone tasks</div>
            <div style={pickerGrid}>
              {unattachedTasks.length === 0 && <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>No unattached tasks found.</span>}
              {unattachedTasks.map((task: TaskRead) => (
                <label key={task.id} style={checkRow} title={task.title}>
                  <input type="checkbox" checked={form.task_ids.includes(task.id)} onChange={() => toggleTask(task.id)} />
                  <span style={ellipsis}>{task.title}</span>
                  <PriorityBadge level={task.priority} compact />
                </label>
              ))}
            </div>
            {form.task_ids.length > 0 && (
              <div style={{ marginTop: 6, fontSize: 11.5, color: "var(--text-tertiary)" }}>
                {form.task_ids.length} task(s) will land in the first phase.
              </div>
            )}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
            Creator: {nameOf(user?.id)}. Added members join the project channel automatically.
          </div>
        </div>
      </div>
    </Modal>
  );
}

const sectionLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "var(--text-tertiary)",
  marginBottom: 6,
};

const pickerGrid: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  maxHeight: 160,
  overflowY: "auto",
  paddingRight: 4,
};

const checkRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  minHeight: 34,
  padding: "6px 8px",
  borderRadius: "var(--radius-2)",
  background: "var(--surface-3)",
  border: "1px solid var(--border-subtle)",
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

const partitionBadge: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "fit-content",
  border: "1px solid color-mix(in srgb, var(--accent-primary) 28%, var(--border-subtle))",
  borderRadius: "var(--radius-full)",
  background: "var(--accent-primary-soft)",
  color: "var(--accent-primary)",
  padding: "3px 9px",
  fontSize: 11.5,
  fontWeight: 800,
};

const aiGeneratorHint: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  marginBottom: 16,
  padding: 12,
  border: "1px solid color-mix(in srgb, var(--accent-primary) 30%, transparent)",
  borderRadius: "var(--radius-2)",
  background: "var(--accent-primary-soft)",
};
