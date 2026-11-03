"use client";
import { LocalizedText } from "@/lib/i18n/I18nProvider";

import { useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileText, Upload, X } from "lucide-react";
import { Button, useToast } from "@/components/ds";
import { downloadFile, listFiles, uploadFile } from "@/lib/api/collaboration";
import styles from "@/components/holding/ProductDocumentationUpload.module.css";
import { DocumentLifecycleControls } from "./DocumentLifecycleControls";

const formats = /\.(pdf|docx?|txt|md|markdown|rtf|odt)$/i;
function size(bytes: number) { return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${(bytes / 1024).toFixed(1)} KB`; }

export async function uploadDocumentationFiles(type: "task" | "project", id: string, files: File[]) {
  const failed: File[] = [];
  for (const file of files) {
    try { await uploadFile(type, id, file, file.name, true); }
    catch { failed.push(file); }
  }
  return failed;
}

export function DocumentationUpload({ files, onChange, disabled = false, entityType, entityId }: {
  files: File[]; onChange: (files: File[]) => void; disabled?: boolean;
  entityType: "task" | "project"; entityId?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const [error, setError] = useState("");
  return <div className={styles.field}>
    <label htmlFor={id} className={styles.label}><LocalizedText message={"Upload documentation"} /></label>
    <input hidden id={id} ref={input} type="file" multiple disabled={disabled} accept=".pdf,.doc,.docx,.txt,.md,.markdown,.rtf,.odt" aria-describedby={`${id}-hint`} onChange={(event) => {
      const chosen = Array.from(event.target.files ?? []);
      const invalid = chosen.filter((file) => !formats.test(file.name) || !file.size || file.size > 25 * 1024 * 1024);
      setError(invalid.length ? `Not added: ${invalid.map((file) => file.name).join(", ")}. Choose supported, non-empty documents up to 25 MB each.` : "");
      const next = [...files];
      for (const file of chosen.filter((file) => !invalid.includes(file))) {
        if (!next.some((item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified)) next.push(file);
      }
      onChange(next);
      event.target.value = "";
    }} />
    <div className={styles.control}>
      <span className={styles.icon}><Upload size={20} aria-hidden /></span>
      <div className={styles.details}><span className={styles.title}><LocalizedText message={"Add documentation"} /></span><span className={styles.caption}><LocalizedText message={"Guides, specifications, or references"} /></span></div>
      <div className={styles.actions}><Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={() => input.current?.click()}><Upload size={15} aria-hidden /><LocalizedText message={"Choose files"} /></Button></div>
    </div>
    <span id={`${id}-hint`} className={styles.hint}><LocalizedText message={"PDF, Word, text, Markdown, RTF, or ODT · Max 25 MB per file. Uploaded when you save."} /></span>
    {error && <span role="alert" style={{ fontSize: 12, color: "var(--status-blocked)" }}>{error}</span>}
    {files.map((file, index) => <div key={`${file.name}-${index}`} style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
      <FileText size={16} aria-hidden style={{ flexShrink: 0, color: "var(--accent-primary)" }} />
      <span className={styles.details}><span className={styles.title} title={file.name}>{file.name}</span><span className={styles.caption}>{size(file.size)}{" "}<LocalizedText message={"· Ready to save"} /></span></span>
      <Button type="button" variant="ghost" size="sm" disabled={disabled} aria-label={`Remove selected file ${file.name}`} onClick={() => onChange(files.filter((_, i) => i !== index))}><X size={15} aria-hidden /></Button>
    </div>)}
    {entityId && <DocumentationFiles entityType={entityType} entityId={entityId} />}
  </div>;
}

export function DocumentationFiles({ entityType, entityId }: { entityType: "task" | "project"; entityId: string }) {
  const toast = useToast();
  const [downloading, setDownloading] = useState<string | null>(null);
  const documents = useQuery({ queryKey: ["entity-files", entityType, entityId], queryFn: () => listFiles(entityType, entityId) });
  async function download(id: string, name: string) {
    setDownloading(id);
    try {
      const blob = await downloadFile(id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { toast.push("Could not download the document. Please try again.", "error"); }
    finally { setDownloading(null); }
  }
  return <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
    {documents.isLoading && <span className={styles.caption}><LocalizedText message={"Loading documents…"} /></span>}
    {documents.data?.length === 0 && <span className={styles.caption}><LocalizedText message={"No uploaded documents yet."} /></span>}
    {documents.isError && <span role="alert" className={styles.caption}><LocalizedText message={"Could not load uploaded documents."} />{" "}<button type="button" onClick={() => documents.refetch()}><LocalizedText message={"Retry"} /></button></span>}
    {(documents.data ?? []).map((file) => <div key={file.id} className={styles.documentRow} data-archive-container="">
      <div className={styles.documentInfo}>
        <FileText size={16} aria-hidden style={{ flexShrink: 0, color: "var(--accent-primary)" }} />
        <span className={styles.details}><span className={styles.title} title={file.file_name}><bdi>{file.file_name}</bdi></span><span className={styles.caption}><bdi>{size(file.size_bytes)}</bdi></span></span>
      </div>
      <div className={styles.documentActions}>
        <Button type="button" variant="tertiary" size="sm" disabled={!!downloading || !file.download_share_enabled} aria-label={`Download ${file.file_name}`} onClick={() => download(file.id, file.file_name)}><Download size={14} aria-hidden />{downloading === file.id ? <LocalizedText message={"Downloading…"} /> : <LocalizedText message={"Download"} />}</Button>
        <DocumentLifecycleControls attachmentId={file.id} fileName={file.file_name} />
      </div>
    </div>)}
  </div>;
}
