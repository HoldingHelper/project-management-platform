"use client";

import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Bot, Download, FileText, Plus, Sparkles, Trash2, Upload } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import {
  confirmGeneration,
  downloadAiTemplate,
  generateProjectDraft,
  getGenerationDraft,
  getGenerationJob,
  type GeneratedProject,
  type GeneratedTask,
  type GenerationDraftResponse,
  type GenerationJobResponse,
} from "@/lib/api/projects";
import { Alert, Button, Field, Select, StatusChip, TextArea, TextInput, useToast } from "@/components/ds";
import { PageHeader, PAGE_STYLE } from "@/components/ui/States";

const priorityOptions = ["P0", "P1", "P2", "P3"].map((value) => ({ value, label: value }));
const riskOptions = ["Low", "Medium", "High", "Critical"].map((value) => ({ value, label: value }));
const statusOptions = ["NotStarted", "Ready", "InProgress", "Waiting", "Blocked", "Review", "Testing", "Done", "Cancelled", "Archived"].map((value) => ({ value, label: value }));
const taskTypeOptions = ["Feature", "Bug", "Enhancement", "Research", "Documentation", "Meeting", "Testing", "Deployment"].map((value) => ({ value, label: value }));
const partitionOptions = ["tech", "operations", "business", "marketing", "sales"].map((value) => ({ value, label: value }));

export default function AiProjectGeneratorPage() {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [extraContext, setExtraContext] = useState("");
  const [job, setJob] = useState<GenerationJobResponse | null>(null);
  const [draft, setDraft] = useState<GenerationDraftResponse | null>(null);
  const [committedProjectId, setCommittedProjectId] = useState<string | null>(null);
  const hasInput = Boolean(file || extraContext.trim());
  const project = draft?.project ?? null;

  const generate = useMutation({
    mutationFn: () => generateProjectDraft(file, extraContext),
    onSuccess: (result) => {
      setJob(result);
      setDraft(null);
      setCommittedProjectId(null);
      toast.push("Generation queued.", "success");
    },
    onError: () => toast.push("Could not generate project draft.", "error"),
  });

  const jobStatus = useQuery({
    queryKey: ["generation-job", job?.job_id],
    queryFn: () => getGenerationJob(job!.job_id),
    enabled: Boolean(job?.job_id) && !draft,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "queued" || status === "running" ? 2500 : false;
    },
  });

  const readyJob = jobStatus.data?.status === "draft" || jobStatus.data?.status === "validation_failed";
  const draftQuery = useQuery({
    queryKey: ["generation-draft", job?.job_id],
    queryFn: () => getGenerationDraft(job!.job_id),
    enabled: Boolean(job?.job_id) && readyJob && !draft,
  });

  useEffect(() => {
    if (!jobStatus.data) return;
    setJob(jobStatus.data);
    if (jobStatus.data.status === "failed") {
      toast.push(jobStatus.data.error || "AI generation failed.", "error");
    }
  }, [jobStatus.data, toast]);

  useEffect(() => {
    if (!draftQuery.data) return;
    const generated = draftQuery.data.project;
    setDraft({
      ...draftQuery.data,
      project: generated ? { ...generated, milestones: generated.milestones ?? [] } : generated,
    });
    toast.push(
      draftQuery.data.status === "draft" ? "AI draft generated." : "Brief needs fixes.",
      draftQuery.data.status === "draft" ? "success" : "error",
    );
  }, [draftQuery.data, toast]);

  const confirm = useMutation({
    mutationFn: () => confirmGeneration(draft!.generation_run_id, draft!.project),
    onSuccess: (result) => {
      setDraft(null);
      setJob(null);
      setCommittedProjectId(result.project_id);
      toast.push("Project committed. Notification sent.", "success");
    },
    onError: () => toast.push("Could not commit generated project.", "error"),
  });

  const template = useMutation({
    mutationFn: downloadAiTemplate,
    onError: () => toast.push("Could not download the template.", "error"),
  });

  const updateProject = (patch: Partial<GeneratedProject>) => {
    setDraft((current) => {
      if (!current?.project) return current;
      return { ...current, project: { ...current.project, ...patch } };
    });
  };

  const updateTask = (index: number, patch: Partial<GeneratedTask>) => {
    if (!project) return;
    updateProject({
      tasks: project.tasks.map((task, taskIndex) => (taskIndex === index ? { ...task, ...patch } : task)),
    });
  };

  const addTask = () => {
    if (!project) return;
    updateProject({
      tasks: [
        ...project.tasks,
        {
          title: "New task",
          description: "Describe the generated task before committing.",
          assignee: null,
          assignee_user_id: null,
          priority: "P2",
          estimated_hours: null,
          due_date: null,
          dependencies: [],
          tags: [],
          status: "Ready",
          task_type: "Feature",
          partition: "business",
        },
      ],
    });
  };

  const removeTask = (index: number) => {
    if (!project || project.tasks.length <= 1) return;
    updateProject({ tasks: project.tasks.filter((_, taskIndex) => taskIndex !== index) });
  };

  const updateMilestone = (index: number, patch: { name?: string; description?: string | null; due_date?: string | null }) => {
    if (!project) return;
    updateProject({
      milestones: (project.milestones ?? []).map((milestone, milestoneIndex) =>
        milestoneIndex === index ? { ...milestone, ...patch } : milestone,
      ),
    });
  };

  return (
    <div style={PAGE_STYLE}>
      <PageHeader
        title="AI Project Generator"
        subtitle="Paste a shared Google Sheet URL, add notes, or upload a brief. Review and edit the generated plan before anything is committed."
        badge={<span style={badge}><Bot size={14} /> LangGraph</span>}
        actions={
          <Button variant="secondary" disabled={template.isPending} onClick={() => template.mutate()}>
            <Download size={14} /> {template.isPending ? "Downloading..." : "Template"}
          </Button>
        }
      />

      <section style={guideBand}>
        <div style={guideColumn}>
          <h2 style={sectionTitle}>Brief guide</h2>
          <p style={bodyText}>Paste a shared Google Sheet URL directly, upload a brief, or combine both.</p>
          <div style={guideGrid}>
            <GuideItem title="Helpful fields" text="Name, goal, stakeholders, timeline, team members, constraints can come from the brief or Sheet." />
            <GuideItem title="Voice friendly" text="You can dictate into GPT or Claude, paste the transcript into the template, then upload." />
            <GuideItem title="Sheets context" text="Paste shared Google Sheets URLs in the brief; private sheets are rejected for review." />
            <GuideItem title="Assignees" text="Use names or emails from your workspace. Unknown people are left unresolved for manual review." />
          </div>
        </div>
      </section>

      <section style={uploadBand}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
          <h2 style={sectionTitle}>Optional brief file</h2>
          <label style={fileBox}>
            <Upload size={18} />
            <span style={{ fontWeight: 700 }}>{file ? file.name : "Choose .md or .txt"}</span>
            <input
              type="file"
              accept=".md,.txt,text/markdown,text/plain"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              style={{ display: "none" }}
            />
          </label>
        </div>
        <div style={{ flex: "1 1 360px", minWidth: 280 }}>
          <Field label="Google Sheet URL / notes">
            <TextArea
              value={extraContext}
              onChange={(event) => setExtraContext(event.target.value)}
              placeholder="Paste a shared Google Sheets URL here, plus any project notes..."
              style={{ minHeight: 96 }}
            />
          </Field>
        </div>
        <Button disabled={!hasInput || generate.isPending || job?.status === "queued" || job?.status === "running"} onClick={() => generate.mutate()}>
          <Sparkles size={14} /> {generate.isPending ? "Queuing..." : "Generate draft"}
        </Button>
      </section>

      {committedProjectId ? (
        <Alert
          kind="success"
          title="Generated project committed"
          description="Draft review cleared and the creator was notified."
        />
      ) : null}
      {committedProjectId ? <Link href={`/projects/${committedProjectId}`} style={primaryLink}>Open committed project</Link> : null}

      {job && !draft && job.status !== "failed" ? (
        <Alert
          kind="info"
          title={job.status === "queued" ? "Generation queued" : "Generation running"}
          description={`Project ${job.project_id} is ready as a placeholder. Draft review will appear here when generation finishes.`}
        />
      ) : null}

      {job?.status === "failed" ? (
        <Alert kind="critical" title="Generation failed" description={job.error || "Unexpected background execution failure."} />
      ) : null}

      {draft?.validation_errors.length ? (
        <Alert
          kind="critical"
          title="Brief needs fixes"
          description={draft.validation_errors.map((e) => `${e.field}: ${e.message}`).join(" ")}
        />
      ) : null}

      {project ? (
        <section style={draftBand}>
          <div style={draftHeader}>
            <div>
              <h2 style={{ ...sectionTitle, fontSize: 18, color: "var(--text-primary)" }}>Editable draft</h2>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                <StatusChip status={project.priority} label={project.priority} />
                <span style={badge}>{project.tasks.length} tasks</span>
                {project.timeline_end ? <span style={badge}>Due {project.timeline_end}</span> : null}
              </div>
            </div>
            <Button disabled={confirm.isPending || !project.tasks.length} onClick={() => confirm.mutate()}>
              <FileText size={14} /> {confirm.isPending ? "Committing..." : "Commit edited project"}
            </Button>
          </div>

          <div style={formGrid}>
            <Field label="Project name">
              <TextInput value={project.name} onChange={(event) => updateProject({ name: event.target.value })} />
            </Field>
            <Field label="Priority">
              <Select value={project.priority} options={priorityOptions} onChange={(event) => updateProject({ priority: event.target.value })} />
            </Field>
            <Field label="Risk">
              <Select value={project.risk_level} options={riskOptions} onChange={(event) => updateProject({ risk_level: event.target.value })} />
            </Field>
            <Field label="Start date">
              <TextInput type="date" value={project.timeline_start ?? ""} onChange={(event) => updateProject({ timeline_start: event.target.value || null })} />
            </Field>
            <Field label="End date">
              <TextInput type="date" value={project.timeline_end ?? ""} onChange={(event) => updateProject({ timeline_end: event.target.value || null })} />
            </Field>
            <Field label="Tags">
              <TextInput value={toListText(project.tags)} onChange={(event) => updateProject({ tags: toList(event.target.value) })} />
            </Field>
          </div>

          <Field label="Description">
            <TextArea value={project.description} onChange={(event) => updateProject({ description: event.target.value })} />
          </Field>
          <Field label="Goal">
            <TextArea value={project.goal} onChange={(event) => updateProject({ goal: event.target.value })} style={{ minHeight: 76 }} />
          </Field>
          <div style={formGrid}>
            <Field label="Stakeholders">
              <TextInput value={toListText(project.stakeholders)} onChange={(event) => updateProject({ stakeholders: toList(event.target.value) })} />
            </Field>
            <Field label="Constraints">
              <TextInput value={project.constraints ?? ""} onChange={(event) => updateProject({ constraints: event.target.value || null })} />
            </Field>
          </div>

          {project.unresolved_fields.length > 0 ? (
            <Alert kind="warning" title="Manual review needed" description={project.unresolved_fields.join(" ")} />
          ) : null}

          <div style={sectionHeader}>
            <h3 style={sectionTitle}>Milestones</h3>
            <Button
              variant="secondary"
              onClick={() => updateProject({ milestones: [...(project.milestones ?? []), { name: "New milestone", description: null, due_date: null }] })}
            >
              <Plus size={14} /> Add milestone
            </Button>
          </div>
          {(project.milestones ?? []).map((milestone, index) => (
            <div key={`${milestone.name}-${index}`} style={detailRow}>
              <div style={formGrid}>
                <Field label="Name">
                  <TextInput value={milestone.name} onChange={(event) => updateMilestone(index, { name: event.target.value })} />
                </Field>
                <Field label="Due date">
                  <TextInput type="date" value={milestone.due_date ?? ""} onChange={(event) => updateMilestone(index, { due_date: event.target.value || null })} />
                </Field>
              </div>
              <Field label="Description">
                <TextArea value={milestone.description ?? ""} onChange={(event) => updateMilestone(index, { description: event.target.value || null })} style={{ minHeight: 70 }} />
              </Field>
              <Button variant="ghost" onClick={() => updateProject({ milestones: (project.milestones ?? []).filter((_, milestoneIndex) => milestoneIndex !== index) })}>
                <Trash2 size={14} /> Remove milestone
              </Button>
            </div>
          ))}

          <div style={sectionHeader}>
            <h3 style={sectionTitle}>Tasks</h3>
            <Button variant="secondary" onClick={addTask}><Plus size={14} /> Add task</Button>
          </div>
          <div style={taskList}>
            {project.tasks.map((task, index) => (
              <div key={`${task.title}-${index}`} style={taskRow}>
                <div style={taskRowHeader}>
                  <strong style={{ color: "var(--text-primary)" }}>Task {index + 1}</strong>
                  <Button variant="ghost" disabled={project.tasks.length <= 1} onClick={() => removeTask(index)}>
                    <Trash2 size={14} /> Remove
                  </Button>
                </div>
                <div style={formGrid}>
                  <Field label="Title">
                    <TextInput value={task.title} onChange={(event) => updateTask(index, { title: event.target.value })} />
                  </Field>
                  <Field label="Assignee">
                    <TextInput value={task.assignee ?? ""} onChange={(event) => updateTask(index, { assignee: event.target.value || null })} />
                  </Field>
                  <Field label="Priority">
                    <Select value={task.priority} options={priorityOptions} onChange={(event) => updateTask(index, { priority: event.target.value })} />
                  </Field>
                  <Field label="Status">
                    <Select value={task.status} options={statusOptions} onChange={(event) => updateTask(index, { status: event.target.value })} />
                  </Field>
                  <Field label="Type">
                    <Select value={task.task_type} options={taskTypeOptions} onChange={(event) => updateTask(index, { task_type: event.target.value })} />
                  </Field>
                  <Field label="Partition">
                    <Select value={task.partition} options={partitionOptions} onChange={(event) => updateTask(index, { partition: event.target.value })} />
                  </Field>
                  <Field label="Hours">
                    <TextInput type="number" min={0} value={task.estimated_hours ?? ""} onChange={(event) => updateTask(index, { estimated_hours: event.target.value === "" ? null : Number(event.target.value) })} />
                  </Field>
                  <Field label="Due date">
                    <TextInput type="date" value={task.due_date ?? ""} onChange={(event) => updateTask(index, { due_date: event.target.value || null })} />
                  </Field>
                  <Field label="Tags">
                    <TextInput value={toListText(task.tags)} onChange={(event) => updateTask(index, { tags: toList(event.target.value) })} />
                  </Field>
                  <Field label="Dependencies">
                    <TextInput value={toListText(task.dependencies)} onChange={(event) => updateTask(index, { dependencies: toList(event.target.value) })} />
                  </Field>
                </div>
                <Field label="Description">
                  <TextArea value={task.description} onChange={(event) => updateTask(index, { description: event.target.value })} style={{ minHeight: 76 }} />
                </Field>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <Link href="/portfolio" style={backLink}>Back to projects</Link>
    </div>
  );
}

function GuideItem({ title, text }: { title: string; text: string }) {
  return (
    <div style={guideItem}>
      <div style={{ fontWeight: 800, color: "var(--text-primary)", fontSize: 13 }}>{title}</div>
      <div style={{ color: "var(--text-secondary)", fontSize: 12.5, marginTop: 4 }}>{text}</div>
    </div>
  );
}

function toList(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function toListText(value?: string[] | null) {
  return (value ?? []).join(", ");
}

const guideBand: CSSProperties = {
  padding: 18,
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-3)",
  background: "var(--surface-1)",
};

const guideColumn: CSSProperties = { display: "flex", flexDirection: "column", gap: 10 };

const guideGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))",
  gap: 10,
};

const guideItem: CSSProperties = {
  padding: 12,
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-2)",
  background: "var(--surface-2)",
};

const uploadBand: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "end",
  gap: 16,
  flexWrap: "wrap",
};

const fileBox: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 10,
  minHeight: 48,
  padding: "0 14px",
  border: "1px dashed var(--border-default)",
  borderRadius: "var(--radius-2)",
  color: "var(--text-secondary)",
  background: "var(--surface-2)",
  cursor: "pointer",
};

const draftBand: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 16,
  padding: 18,
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-3)",
  background: "var(--surface-1)",
};

const draftHeader: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};

const formGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))",
  gap: 12,
};

const sectionHeader: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};

const detailRow: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  padding: "12px 0",
  borderTop: "1px solid var(--border-subtle)",
};

const taskList: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  borderTop: "1px solid var(--border-subtle)",
};

const taskRow: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  padding: "14px 0",
  borderBottom: "1px solid var(--border-subtle)",
};

const taskRowHeader: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};

const sectionTitle: CSSProperties = {
  margin: 0,
  color: "var(--text-secondary)",
  fontSize: 13,
  fontWeight: 800,
};

const bodyText: CSSProperties = {
  color: "var(--text-secondary)",
  fontSize: 13.5,
  lineHeight: 1.6,
};

const badge: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "4px 9px",
  borderRadius: "var(--radius-full)",
  background: "var(--surface-2)",
  color: "var(--text-secondary)",
  fontSize: 12,
  fontWeight: 800,
};

const primaryLink: CSSProperties = {
  color: "var(--accent-600)",
  fontSize: 13,
  fontWeight: 800,
  textDecoration: "none",
};

const backLink: CSSProperties = {
  color: "var(--text-secondary)",
  fontSize: 13,
  fontWeight: 700,
  textDecoration: "none",
};
