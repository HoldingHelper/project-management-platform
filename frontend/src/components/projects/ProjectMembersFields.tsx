"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Field, Select } from "@/components/ds";
import { addProjectMember, getProductMembers, getProjectMembers, removeProjectMember } from "@/lib/api/projects";
import { useUserMap } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { ProjectMemberRead, UUID } from "@/lib/types";

const roles = ["TeamLead", "Developer", "QA", "UIUX", "BusinessAnalyst", "Client", "Observer"];

export function useProjectMembersDraft(projectId: UUID, productId: UUID, open: boolean, canManage: boolean) {
  const qc = useQueryClient();
  const queryKey = ["project-members", projectId];
  const query = useQuery({ queryKey, queryFn: () => getProjectMembers(projectId), enabled: open });
  const candidates = useQuery({ queryKey: ["product-members", productId], queryFn: () => getProductMembers(productId), enabled: open && canManage });
  const [draft, setDraft] = useState<ProjectMemberRead[] | null>(null);
  useEffect(() => { setDraft(null); }, [open, projectId]);
  const members = draft ?? query.data ?? [];

  async function save() {
    if (!canManage || draft === null) return;
    // Read current membership so retrying a partially successful save is safe.
    const current = await getProjectMembers(projectId);
    try {
      for (const member of draft.filter((item) => !current.some((existing) => existing.user_id === item.user_id))) {
        await addProjectMember(projectId, member.user_id, member.role);
      }
      for (const member of current.filter((item) => !draft.some((selected) => selected.user_id === item.user_id))) {
        await removeProjectMember(projectId, member.user_id);
      }
    } finally {
      await Promise.all([
        qc.invalidateQueries({ queryKey }),
        qc.invalidateQueries({ queryKey: ["project-overview", projectId] }),
        qc.invalidateQueries({ queryKey: ["assignment-candidates"] }),
      ]);
    }
  }

  return {
    members, query, candidates, canManage, save,
    ready: query.isSuccess,
    add: (userId: UUID, role: string) => setDraft([...members, { project_id: projectId, user_id: userId, role }]),
    remove: (userId: UUID) => setDraft(members.filter((member) => member.user_id !== userId)),
  };
}

export function ProjectMembersFields({ editor, disabled }: { editor: ReturnType<typeof useProjectMembersDraft>; disabled: boolean }) {
  const { t } = useI18n();
  const { nameOf } = useUserMap();
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState("Developer");
  const candidates = (editor.candidates.data ?? []).filter((person) => person.is_active && !editor.members.some((member) => member.user_id === person.id));
  return <Card title={t("Members")} padded>
    <fieldset disabled={disabled} style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: "grid", gap: 10 }}>
      {editor.query.isPending && <span>{t("Loading…")}</span>}
      {editor.query.isError && <Button variant="secondary" onClick={() => editor.query.refetch()}>{t("Retry loading members")}</Button>}
      {editor.members.map((member) => <div key={member.user_id} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ flex: 1 }}>{editor.candidates.data?.find((person) => person.id === member.user_id)?.full_name ?? nameOf(member.user_id)}</span>
        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{t(member.role)}</span>
        {editor.canManage && member.role !== "ProjectManager" && <Button type="button" variant="ghost" size="sm" aria-label={`${t("Remove member")}: ${nameOf(member.user_id)}`} onClick={() => editor.remove(member.user_id)}>{t("Remove member")}</Button>}
      </div>)}
      {editor.canManage && <>
        <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)" }}>{t("Only Product Line members can join this project.")}</p>
        {editor.candidates.isError && <Button variant="secondary" onClick={() => editor.candidates.refetch()}>{t("Retry loading members")}</Button>}
        <Field label={t("User")}><Select value={userId} onChange={(event) => setUserId(event.target.value)} placeholder={t("Choose a user…")} options={candidates.map((person) => ({ value: person.id, label: person.full_name }))} /></Field>
        <Field label={t("Project role")}><Select value={role} onChange={(event) => setRole(event.target.value)} options={roles.map((value) => ({ value, label: t(value) }))} /></Field>
        <Button type="button" variant="secondary" disabled={!editor.ready || editor.candidates.isFetching || !candidates.some((person) => person.id === userId)} onClick={() => { editor.add(userId as UUID, role); setUserId(""); }}>{t("Add member")}</Button>
      </>}
    </fieldset>
  </Card>;
}
