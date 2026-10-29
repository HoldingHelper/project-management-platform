"use client";

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { Button, Modal, useToast } from "@/components/ds";
import { apiFetch } from "@/lib/api/client";

export function DeleteDocumentButton({ attachmentId, pageId, fileName, onDeleted }: { attachmentId?: string; pageId?: string; fileName: string; onDeleted?: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const client = useQueryClient();
  const toast = useToast();
  const resource = pageId ? `/docs/pages/${pageId}` : `/files/${attachmentId}`;
  const access = useQuery({ queryKey: ["document-delete-permission", resource], queryFn: () => apiFetch<{ can_delete: boolean }>(`${resource}/delete-permission`) });
  async function remove() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    try {
      await apiFetch(resource, { method: "DELETE" });
      setOpen(false);
      onDeleted?.();
      await Promise.all(["entity-files", "doc-pages", "doc-spaces", "entity-doc-links", "product-documentation", "products", "holding"].map((key) => client.invalidateQueries({ queryKey: [key] })));
      toast.push("Document deleted.", "success");
    } catch { toast.push("Could not delete the document. Check your access and try again.", "error"); }
    finally { submitting.current = false; setBusy(false); }
  }
  if (!access.data?.can_delete) return null;
  return <>
    <Button type="button" variant="ghost" size="sm" aria-label={`Delete document ${fileName}`} onClick={() => setOpen(true)} style={{ color: "var(--status-blocked)" }}><Trash2 size={15} aria-hidden />Delete</Button>
    <Modal open={open} onClose={() => { if (!busy) setOpen(false); }} title="Delete document?" footer={<><Button type="button" variant="secondary" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button><Button type="button" variant="danger" disabled={busy} onClick={remove}>{busy ? "Deleting…" : "Delete document"}</Button></>}>
      <p style={{ overflowWrap: "anywhere" }}>Delete <strong>{fileName}</strong>? {pageId ? "This permanently removes this document and its connected links." : "This permanently removes the uploaded file and its connected Docs entry."} This cannot be undone.</p>
    </Modal>
  </>;
}
