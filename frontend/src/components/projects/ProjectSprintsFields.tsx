"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Field, Select, TextInput } from "@/components/ds";
import { getProjectSprints, updateSprint } from "@/lib/api/projects";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { sprintSchedule, SPRINT_DURATIONS } from "@/lib/sprint-schedule";
import type { UUID } from "@/lib/types";

type SprintDraft = { name?: string; start_date?: string; duration_days?: number };

export function useProjectSprintsDraft(projectId: UUID, open: boolean, canManage: boolean) {
  const qc = useQueryClient();
  const queryKey = ["project-phases", projectId];
  const query = useQuery({ queryKey, queryFn: () => getProjectSprints(projectId), enabled: open });
  const [drafts, setDrafts] = useState<Record<string, SprintDraft>>({});
  useEffect(() => { setDrafts({}); }, [open, projectId]);
  const sprints = (query.data ?? []).map((sprint) => ({ ...sprint, ...drafts[sprint.id] }));
  const valid = sprints.filter((sprint) => drafts[sprint.id]).every((sprint) => sprint.name.trim() && (!sprint.is_sprint || sprintSchedule(sprint.start_date ?? "", [sprint.duration_days ?? 14]).length));

  async function save() {
    if (!canManage) return;
    try {
      for (const [id, draft] of Object.entries(drafts)) {
        await updateSprint(id as UUID, { ...draft, ...(draft.name !== undefined ? { name: draft.name.trim() } : {}) });
        setDrafts((current) => { const remaining = { ...current }; delete remaining[id]; return remaining; });
      }
    } finally {
      await Promise.all([
        qc.invalidateQueries({ queryKey }),
        qc.invalidateQueries({ queryKey: ["project-overview", projectId] }),
        qc.invalidateQueries({ queryKey: ["project-timeline", projectId] }),
        qc.invalidateQueries({ queryKey: ["portfolio-gantt"] }),
      ]);
    }
  }

  return {
    query, sprints, valid, canManage, save, ready: query.isSuccess,
    update(id: UUID, patch: Partial<SprintDraft>) {
      setDrafts((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
    },
  };
}

export function ProjectSprintsFields({ editor, disabled }: { editor: ReturnType<typeof useProjectSprintsDraft>; disabled: boolean }) {
  const { t } = useI18n();
  return <Card title={t("Sprints")} padded>
    <div style={{ display: "grid", gap: 14 }}>
      {editor.query.isPending && <span>{t("Loading…")}</span>}
      {editor.query.isError && <Button variant="secondary" onClick={() => editor.query.refetch()}>{t("Retry")}</Button>}
      {editor.query.isSuccess && !editor.sprints.length && <span>{t("No sprints yet")}</span>}
      {editor.sprints.map((sprint, index) => <fieldset key={sprint.id} aria-label={`${t("Edit sprint")} ${index + 1}`} disabled={disabled || !editor.canManage} style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-2)", padding: 12, margin: 0, minWidth: 0, display: "grid", gap: 10 }}>
        <legend>{sprint.name}</legend>
        <Field label={t("Sprint name")}><TextInput value={sprint.name} onChange={(event) => editor.update(sprint.id, { name: event.target.value })} /></Field>
        {sprint.is_sprint ? <>
          <Field label={t("Start date")}><TextInput type="date" value={sprint.start_date ?? ""} onChange={(event) => editor.update(sprint.id, { start_date: event.target.value })} /></Field>
          <Field label={t("Sprint duration")}><Select value={String(sprint.duration_days ?? 14)} options={SPRINT_DURATIONS.map((days) => ({ value: String(days), label: t("{days} days", { days }) }))} onChange={(event) => editor.update(sprint.id, { duration_days: Number(event.target.value) })} /></Field>
          <Field label={t("Calculated end date")}><TextInput type="date" readOnly value={sprintSchedule(sprint.start_date ?? "", [sprint.duration_days ?? 14]).at(-1)?.end_date ?? ""} /></Field>
        </> : <span>{t("Legacy schedule")}</span>}
      </fieldset>)}
    </div>
  </Card>;
}
