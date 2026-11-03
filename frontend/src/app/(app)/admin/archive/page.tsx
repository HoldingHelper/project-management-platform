"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, RotateCcw } from "lucide-react";
import { Button, Modal } from "@/components/ds";
import { EntityHistory } from "@/components/history/EntityHistory";
import { PageHeader, PAGE_STYLE, Spinner } from "@/components/ui/States";
import { apiFetch } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { UUID } from "@/lib/types";

type Item = { id: string; name: string; space_id?: string; source_type?: string | null; type?: string };
type Kind = "products" | "projects" | "tasks" | "documents" | "organization";
type ArchiveData = Record<Kind, Item[]>;
const sections: { kind: Kind; label: string }[] = [
  { kind: "products", label: "Product lines" },
  { kind: "projects", label: "Projects" },
  { kind: "tasks", label: "Tasks" },
  { kind: "documents", label: "Documents and attachments" },
  { kind: "organization", label: "Organization scopes" },
];

export default function ArchivePage() {
  const { t } = useI18n();
  const { isSuperAdmin, loading } = useAuth();
  const client = useQueryClient();
  const [history, setHistory] = useState<{ type: "product" | "project" | "task"; item: Item } | null>(null);
  const items = useQuery({ queryKey: ["admin-archive"], queryFn: () => apiFetch<ArchiveData>("/projects/archive/items"), enabled: !loading && isSuperAdmin() });
  const restore = useMutation({
    mutationFn: ({ kind, id }: { kind: Kind; id: string }) => apiFetch(`/projects/archive/${kind}/${id}/restore`, { method: "POST" }),
    onSuccess: async () => { await Promise.all(["admin-archive", "projects", "project", "tasks", "doc-archived", "document-lifecycle", "entity-files", "org"].map(key => client.invalidateQueries({ queryKey: [key] }))); },
  });
  if (loading) return <div style={PAGE_STYLE}><Spinner label={t("Loading…")} /></div>;
  if (!isSuperAdmin()) return <div style={PAGE_STYLE} role="alert">{t("Only a Super Admin can view archived items.")}</div>;
  return <div style={{ ...PAGE_STYLE, maxWidth: 1200, gap: 20 }}>
    <PageHeader title={t("Archive")} subtitle={t("View and restore archived items by category.")} badge={<Archive size={20} />} />
    {items.isLoading && <Spinner label={t("Loading…")} />}
    {items.isError && <div role="alert">{t("Could not load archived items.")} <Button variant="secondary" onClick={() => items.refetch()}>{t("Retry")}</Button></div>}
    {restore.isError && <div role="alert">{restore.error instanceof Error ? restore.error.message : t("Could not restore item.")}</div>}
    {items.data && sections.map(({ kind, label }) => <section key={kind} style={{ background: "var(--surface-1)", border: "1px solid var(--border-default)", borderRadius: 14, padding: 20 }}>
      <h2 style={{ margin: "0 0 14px", fontSize: 17 }}>{t(label)} <span style={{ color: "var(--text-secondary)", fontSize: 13 }}>({items.data[kind].length})</span></h2>
      {items.data[kind].length === 0 ? <p style={{ color: "var(--text-secondary)", margin: 0 }}>{t("No archived items.")}</p> : <div style={{ display: "grid", gap: 8 }}>
        {items.data[kind].map(item => {
          const href = kind === "projects" ? `/projects/${item.id}` : kind === "tasks" ? `/tasks/${item.id}` : kind === "documents" && item.space_id ? `/app/docs/spaces/${item.space_id}/${item.id}` : null;
          return <div key={item.id} className="pmp-archived" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, padding: 12, borderRadius: 10, border: "1px solid var(--border-default)" }}>
            <div style={{ minWidth: 0, overflowWrap: "anywhere" }}>{href ? <Link href={href}>{item.name}</Link> : <strong>{item.name}</strong>} <span style={{ color: "var(--text-secondary)", fontSize: 12 }}> · {t("Archived")}{item.source_type ? ` · ${t(item.source_type)}` : item.type ? ` · ${t(item.type)}` : ""}</span></div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(kind === "products" || kind === "projects" || kind === "tasks") && <Button type="button" variant="tertiary" size="sm" onClick={() => setHistory({ type: kind === "products" ? "product" : kind === "projects" ? "project" : "task", item })}>{t("History & Changes")}</Button>}
              <Button type="button" variant="secondary" size="sm" disabled={restore.isPending} onClick={() => restore.mutate({ kind, id: item.id })}><RotateCcw size={14} />{t("Restore")}</Button>
            </div>
          </div>;
        })}
      </div>}
    </section>)}
    <Modal open={!!history} onClose={() => setHistory(null)} title={t("History & Changes")}>{history && <><h3>{history.item.name}</h3><EntityHistory entityType={history.type} entityId={history.item.id as UUID} /></>}</Modal>
  </div>;
}
