"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, RotateCcw, Send } from "lucide-react";
import { Button, Modal, useToast } from "@/components/ds";
import { apiFetch } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n/I18nProvider";

export type DocumentLifecycle = { page_id: string; status: string; can_edit: boolean; can_publish: boolean; can_archive: boolean; can_restore: boolean };
export function DocumentLifecycleControls({ attachmentId, pageId, fileName, onArchived, beforePublish }: {
  attachmentId?: string; pageId?: string; fileName: string; onArchived?: () => void; beforePublish?: () => Promise<void>;
}) {
  const { t } = useI18n();
  const client = useQueryClient();
  const toast = useToast();
  const [action, setAction] = useState<"publish" | "archive" | "restore" | null>(null);
  const [busy, setBusy] = useState(false);
  const resource = pageId ? `/docs/pages/${pageId}` : `/files/${attachmentId}`;
  const access = useQuery({ queryKey: ["document-lifecycle", resource], queryFn: () => apiFetch<DocumentLifecycle>(`${resource}/lifecycle`), refetchInterval: 15000 });
  async function apply() {
    if (!action || busy || !access.data) return;
    setBusy(true);
    try {
      if (action === "publish") await beforePublish?.();
      await apiFetch(`/docs/pages/${access.data.page_id}/${action}`, { method: "POST" });
      const archived = action === "archive";
      setAction(null);
      await Promise.all(["doc-page", "doc-pages", "doc-attachments", "document-lifecycle", "entity-files", "entity-doc-links", "product-documentation", "products", "doc-archived"].map((key) => client.invalidateQueries({ queryKey: [key] })));
      if (archived) onArchived?.();
      toast.push(t("Document lifecycle updated."), "success");
    } catch (error) { toast.push(error instanceof Error ? error.message : t("Could not update the document."), "error"); }
    finally { setBusy(false); }
  }
  if (!access.data) return null;
  return <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
    <span role="status" style={{ fontSize: 12, color: "var(--text-secondary)" }}>{t(access.data.status === "published" ? "Published · Read-only" : access.data.status === "archived" ? "Archived · Read-only" : "Draft / On Publish")}</span>
    {access.data.can_publish && <Button type="button" size="sm" variant="secondary" onClick={() => setAction("publish")}><Send size={14} />{t("Publish document")}</Button>}
    {access.data.can_archive && <Button type="button" size="sm" variant="ghost" aria-label={t("Archive document {name}", { name: fileName })} onClick={() => setAction("archive")}><Archive size={14} />{t("Archive")}</Button>}
    {access.data.can_restore && <Button type="button" size="sm" variant="secondary" onClick={() => setAction("restore")}><RotateCcw size={14} />{t("Restore document")}</Button>}
    <Modal open={!!action} onClose={() => { if (!busy) setAction(null); }} title={t(action === "publish" ? "Publish document?" : action === "restore" ? "Restore document?" : "Archive document?")} footer={<><Button type="button" variant="secondary" disabled={busy} onClick={() => setAction(null)}>{t("Cancel")}</Button><Button type="button" disabled={busy} onClick={apply}>{t(busy ? "Saving…" : action === "publish" ? "Publish document" : action === "restore" ? "Restore document" : "Archive")}</Button></>}>
      <p style={{ overflowWrap: "anywhere" }}><strong>{fileName}</strong></p>
      <p>{t(action === "publish" ? "Publishing makes this document permanently read-only. Its current access stays unchanged." : action === "restore" ? "Restore the document to its previous publication state. Published content stays read-only." : "Archived documents are hidden from all regular users, including the author. Only a Super Admin can restore them.")}</p>
    </Modal>
  </div>;
}
