"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Layers3 } from "lucide-react";
import { getPortfolioGantt, updateProject } from "@/lib/api/projects";
import { Button, Card, FocusCard, MetricCard, ProgressBar, StatusChip, Tabs, useToast } from "@/components/ds";
import { EmptyState, PAGE_STYLE, PageHeader, Spinner } from "@/components/ui/States";
import { PortfolioGanttChart } from "@/components/gantt/PortfolioGanttChart";
import { useAuth } from "@/lib/auth/AuthProvider";
import type { PortfolioGantt, PortfolioGanttProject, ProjectLevel, UUID } from "@/lib/types";

const PROJECT_LEVELS: { value: ProjectLevel; label: string; detail: string }[] = [
  { value: "inter-team", label: "Inter-team", detail: "Projects inside one partition" },
  { value: "inter-partition", label: "Inter-partition", detail: "Cross-partition projects" },
  { value: "organization", label: "Organization", detail: "Company-wide projects" },
];

function projectLevel(project: Pick<PortfolioGanttProject, "tags" | "level">): ProjectLevel {
  if (project.level === "inter-team" || project.level === "organization") return project.level;
  const raw = project.tags.find((tag) => tag.startsWith("level:"))?.slice("level:".length);
  if (raw === "inter-team" || raw === "organization") return raw;
  return "inter-partition";
}

const VALID_LEVELS = new Set<ProjectLevel>(["inter-team", "inter-partition", "organization"]);

export default function TimelinePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Level lives in the URL so browser Back (from an opened project) restores the
  // exact view the user left.
  const urlLevel = searchParams.get("level");
  const level: ProjectLevel = urlLevel && VALID_LEVELS.has(urlLevel as ProjectLevel) ? (urlLevel as ProjectLevel) : "inter-partition";
  const setLevel = (next: ProjectLevel) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("level", next);
    router.replace(`/timeline?${params.toString()}`);
  };
  const [showArchived, setShowArchived] = useState(false);
  const { user, isSuperAdmin, hasPermission } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const gantt = useQuery({
    queryKey: ["portfolio-gantt", showArchived],
    queryFn: () => getPortfolioGantt(showArchived),
  });

  // C-levels (and admins) may reschedule projects directly on the portfolio Gantt.
  const canSchedule =
    isSuperAdmin() || !!user?.roles.includes("CLevel") || hasPermission("projects.manage_all");

  const reschedule = useMutation({
    mutationFn: ({ id, start_date, end_date }: { id: UUID; start_date: string; end_date: string }) =>
      updateProject(id, { start_date, end_date }),
    onSuccess: () => {
      toast.push("Project rescheduled.", "success");
      qc.invalidateQueries({ queryKey: ["portfolio-gantt"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: () => toast.push("Could not reschedule project.", "error"),
  });
  const onSchedule = (id: string, dates: { start_date: string; end_date: string }) =>
    reschedule.mutate({ id: id as UUID, start_date: dates.start_date, end_date: dates.end_date });

  const filtered = useMemo<PortfolioGantt>(() => {
    const source = gantt.data ?? { projects: [], links: [] };
    const projects = source.projects.filter((project) => projectLevel(project) === level);
    const ids = new Set(projects.map((project) => project.id));
    return {
      projects,
      links: source.links.filter((link) => ids.has(link.predecessor_project_id) && ids.has(link.successor_project_id)),
    };
  }, [gantt.data, level]);

  const levelCounts = useMemo(() => {
    const counts = new Map<ProjectLevel, number>(PROJECT_LEVELS.map((item) => [item.value, 0]));
    for (const project of gantt.data?.projects ?? []) {
      counts.set(projectLevel(project), (counts.get(projectLevel(project)) ?? 0) + 1);
    }
    return counts;
  }, [gantt.data]);

  const avgProgress =
    filtered.projects.length === 0
      ? 0
      : filtered.projects.reduce((sum, project) => sum + Number(project.progress_percentage), 0) / filtered.projects.length;
  const blocked = filtered.projects.filter((project) => ["blocked", "delayed", "at-risk"].includes(String(project.health_status))).length;

  return (
    <div style={{ ...PAGE_STYLE, gap: 18, maxWidth: "none" }}>
      <PageHeader
        title="Portfolio Timeline"
        subtitle="Project-only Gantt filtered by required project level."
        actions={
          <Button variant={showArchived ? "primary" : "secondary"} onClick={() => setShowArchived((value) => !value)}>
            <Archive size={14} /> {showArchived ? "Hide archives" : "Show archives"}
          </Button>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
        {PROJECT_LEVELS.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setLevel(item.value)}
            className="pmp-row"
            style={{
              textAlign: "left",
              border: `1px solid ${level === item.value ? "var(--accent-primary)" : "var(--border-default)"}`,
              borderRadius: "var(--radius-2)",
              background: level === item.value ? "color-mix(in srgb, var(--accent-primary) 12%, var(--surface-1))" : "var(--surface-1)",
              padding: 14,
              color: "inherit",
              cursor: "pointer",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 800 }}>
                <Layers3 size={15} /> {item.label}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-tertiary)", fontSize: 12 }}>{levelCounts.get(item.value) ?? 0}</span>
            </span>
            <span style={{ display: "block", marginTop: 5, color: "var(--text-secondary)", fontSize: 12 }}>{item.detail}</span>
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <MetricCard label="Projects in view" value={filtered.projects.length} />
        <MetricCard label="Average progress" value={`${Math.round(avgProgress)}%`} tone="in-progress" />
        <MetricCard label="At risk / blocked" value={blocked} tone={blocked > 0 ? "delayed" : "default"} />
      </div>

      <FocusCard
        title={`${PROJECT_LEVELS.find((item) => item.value === level)?.label ?? "Project"} Gantt`}
        right={<TimelineLegend />}
        focusChildren={<TimelineBody loading={gantt.isLoading} data={filtered} editable={canSchedule} onSchedule={onSchedule} />}
      >
        <TimelineBody loading={gantt.isLoading} data={filtered} editable={canSchedule} onSchedule={onSchedule} />
      </FocusCard>

      <Card title="Projects in this level" padded={false}>
        {gantt.isLoading ? (
          <Spinner />
        ) : filtered.projects.length === 0 ? (
          <EmptyState title="No projects in this level" hint="Edit a project and set its level to place it here." />
        ) : (
          filtered.projects.map((project) => (
            <div
              key={project.id}
              className="pmp-responsive-record-row"
              style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1fr) 220px 150px", gap: 14, alignItems: "center", padding: "12px 16px", borderTop: "1px solid var(--border-subtle)" }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{project.name}</div>
                <div style={{ marginTop: 2, fontSize: 11.5, color: "var(--text-tertiary)" }}>
                  {project.start_date ?? "No start"} to {project.end_date ?? "No end"}
                </div>
              </div>
              <ProgressBar percent={Number(project.progress_percentage)} blocks={12} />
              <StatusChip status={String(project.status === "in-progress" ? project.health_status : project.status)} />
            </div>
          ))
        )}
      </Card>
    </div>
  );
}

function TimelineBody({
  loading,
  data,
  editable,
  onSchedule,
}: {
  loading: boolean;
  data: PortfolioGantt;
  editable?: boolean;
  onSchedule?: (id: string, dates: { start_date: string; end_date: string }) => void;
}) {
  if (loading) return <Spinner label="Loading project timeline..." />;
  if (data.projects.length === 0) return <EmptyState title="No projects to chart" hint="This level has no scheduled projects yet." />;
  return <PortfolioGanttChart data={data} editable={editable} onSchedule={onSchedule} />;
}

function TimelineLegend() {
  return (
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: "var(--text-secondary)" }}>
      <span>Project rows only</span>
      <span>◆ milestone</span>
      <span style={{ color: "var(--accent-secondary)" }}>dashed arrow = dependency</span>
      <span style={{ color: "var(--status-delayed)" }}>today line</span>
    </div>
  );
}
