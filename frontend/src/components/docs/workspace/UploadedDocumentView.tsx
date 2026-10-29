"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileText } from "lucide-react";
import { Button, useToast } from "@/components/ds";
import { listDocAttachments, type DocPage } from "@/lib/api/docs";
import { downloadFile } from "@/lib/api/collaboration";
import { DeleteDocumentButton } from "../DeleteDocumentButton";
import { useKnowledgeWorkspace } from "@/lib/stores/knowledgeWorkspaceStore";

export function UploadedDocumentView({ page }: { page: DocPage }) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const { tabs, closeTab } = useKnowledgeWorkspace();
  const files = useQuery({ queryKey: ["doc-attachments", page.id], queryFn: () => listDocAttachments(page.id) });
  async function download() {
    setBusy(true);
    try {
      const file = files.data?.[0];
      const blob = await downloadFile(page.source_attachment_id!);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = file?.file_name ?? page.title; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { toast.push("Could not download the file. Please try again.", "error"); }
    finally { setBusy(false); }
  }
  return <section style={{ padding: "32px clamp(20px, 4vw, 56px)", overflowY: "auto", height: "100%", background: "var(--surface-1)", color: "var(--text-primary)" }}>
    <p style={{ color: "var(--text-secondary)", fontSize: 12 }}>Uploaded documentation</p>
    <h1 style={{ fontSize: 24, overflowWrap: "anywhere" }}>{page.title}</h1>
    <div style={{ display: "flex", alignItems: "center", gap: 16, padding: 20, border: "1px solid var(--border-subtle)", borderRadius: 12, flexWrap: "wrap" }}>
      <FileText size={32} color="var(--accent-primary)" aria-hidden />
      <div style={{ flex: 1, minWidth: 120 }}><strong>{files.data?.[0]?.file_name ?? page.title}</strong><p style={{ fontSize: 12, color: "var(--text-secondary)" }}>{files.data?.[0]?.size_bytes != null ? `${(files.data[0].size_bytes! / 1024).toFixed(1)} KB · ` : ""}Original uploaded file</p></div>
      <Button disabled={busy} onClick={download}><Download size={16} aria-hidden />{busy ? "Downloading…" : "Download file"}</Button>
      <DeleteDocumentButton attachmentId={page.source_attachment_id!} fileName={page.title} onDeleted={() => tabs.filter((tab) => tab.pageId === page.id).forEach((tab) => closeTab(tab.id))} />
    </div>
    <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 20 }}>This file is connected to its {page.source_entity_type === "product" ? "product line" : page.source_entity_type}. Access follows the original item’s permissions.</p>
  </section>;
}
