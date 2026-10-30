"use client";

import { useId, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDocComment, listDocComments } from "@/lib/api/docs";
import { apiFetch } from "@/lib/api/client";
import { useUserMap } from "@/lib/hooks";
import { useI18n, LocalizedRelativeTime } from "@/lib/i18n/I18nProvider";
import type { DocumentLifecycle } from "./DocumentLifecycleControls";

export function DocumentComments({ pageId }: { pageId: string }) {
  const { t } = useI18n();
  const inputId = useId();
  const client = useQueryClient();
  const { nameOf } = useUserMap();
  const [body, setBody] = useState("");
  const submitting = useRef(false);
  const comments = useQuery({ queryKey: ["doc-comments", pageId], queryFn: () => listDocComments(pageId), refetchInterval: 15000 });
  const access = useQuery({ queryKey: ["document-lifecycle", `/docs/pages/${pageId}`], queryFn: () => apiFetch<DocumentLifecycle>(`/docs/pages/${pageId}/lifecycle`), refetchInterval: 15000 });
  const mutation = useMutation({
    mutationFn: (text: string) => addDocComment(pageId, text),
    onSuccess: async () => { setBody(""); await client.invalidateQueries({ queryKey: ["doc-comments", pageId] }); },
  });
  return <section aria-label={t("Document comments")} style={{ display: "grid", gap: 16, minWidth: 0 }}>
    <h3 style={{ margin: 0 }}>{t("Comments")}</h3>
    {comments.isPending && <p role="status">{t("Loading comments…")}</p>}
    {(comments.isError || access.isError) && <p role="alert">{t("Could not load comments.")}</p>}
    {!comments.isPending && !comments.isError && !comments.data?.length && <p style={{ color: "var(--text-secondary)" }}>{t("No comments yet.")}</p>}
    {!comments.isError && comments.data?.map((comment) => <article key={comment.id} style={{ padding: 12, border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-2)", background: "var(--surface-2)", overflowWrap: "anywhere" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: 12 }}><strong>{nameOf(comment.author_user_id)}</strong><span style={{ color: "var(--text-tertiary)" }}><LocalizedRelativeTime value={comment.created_at} /></span></div>
      {comment.selected_text && <blockquote style={{ marginInline: 0, color: "var(--text-secondary)" }}>{comment.selected_text}</blockquote>}
      <p dir="auto" style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}>{comment.body}</p>
    </article>)}
    {access.data?.can_comment && <form onSubmit={async (event) => {
      event.preventDefault();
      if (!body.trim() || submitting.current) return;
      submitting.current = true;
      try { await mutation.mutateAsync(body.trim()); } catch { /* Error is shown below. */ }
      finally { submitting.current = false; }
    }} style={{ display: "grid", gap: 8 }}>
      <label htmlFor={inputId}>{t("Add a comment")}</label>
      <textarea id={inputId} dir="auto" maxLength={4000} rows={4} value={body} disabled={mutation.isPending} onChange={(event) => setBody(event.target.value)} style={{ width: "100%", boxSizing: "border-box", resize: "vertical", padding: 10, border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-2)", background: "var(--surface-1)", color: "var(--text-primary)", font: "inherit" }} />
      {mutation.isError && <p role="alert">{mutation.error instanceof Error ? mutation.error.message : t("Could not post comment.")}</p>}
      <button type="submit" disabled={!body.trim() || mutation.isPending} className="docs-toolbar-btn" style={{ justifySelf: "start", padding: "8px 12px", color: "var(--accent-primary)" }}>{t(mutation.isPending ? "Sending…" : "Post comment")}</button>
    </form>}
  </section>;
}
