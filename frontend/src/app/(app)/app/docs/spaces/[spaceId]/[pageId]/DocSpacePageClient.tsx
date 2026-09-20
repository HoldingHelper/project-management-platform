"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  BookOpenText,
  Check,
  Clock3,
  Edit3,
  Eye,
  FileText,
  Globe2,
  History,
  Link2,
  LockKeyhole,
  MessageSquare,
  MessageSquareText,
  Paperclip,
  RotateCcw,
  Save,
  Send,
  ShieldCheck,
  Star,
  Upload,
  User,
  Video,
  X,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, MarkdownPreview, Select, TextArea, TextInput } from "@/components/ds";
import { SearchSuggestionInput, type SearchSuggestion } from "@/components/docs/SearchSuggestionInput";
import { AppError } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useStaticExportParams } from "@/lib/static-export-route";
import { listUsers } from "@/lib/api/users";
import { listDepartments, listTeams } from "@/lib/api/organization";
import { listProjects, listTasks } from "@/lib/api/projects";
import {
  addDocAttachment,
  addAnchoredDocComment,
  addDocComment,
  addDocLink,
  favoriteDocPage,
  getDocPage,
  listDocAttachments,
  listDocComments,
  listDocLinks,
  listDocPermissions,
  listDocRevisions,
  getDocAttachmentDownloadUrl,
  publishDocPage,
  replaceDocPermissions,
  restoreDocRevision,
  updateDocPage,
  uploadDocAttachment,
  type DocPermission,
} from "@/lib/api/docs";

const slashItems = [
  { label: "Heading", value: "## " },
  { label: "Checklist", value: "- [ ] " },
  { label: "Callout", value: "> " },
  { label: "Divider", value: "\n---\n" },
  { label: "Code", value: "```\n\n```" },
  { label: "Video", value: "[Video title](https://youtube.com/)" },
];

export default function DocumentEditor() {
  const { spaceId: exportedSpaceId, pageId: exportedPageId } = useParams<{
    spaceId: string;
    pageId: string;
  }>();
  const [spaceId, pageId] = useStaticExportParams(
    [exportedSpaceId, exportedPageId],
    ["app", "docs", "spaces"]
  );
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, hasPermission, isSuperAdmin } = useAuth();

  const page = useQuery({
    queryKey: ["doc-page", pageId],
    queryFn: () => getDocPage(pageId),
    enabled: Boolean(pageId),
  });

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [visibility, setVisibility] = useState("inherit");
  // Default always to "preview" as requested by user
  const [tab, setTab] = useState<"write" | "preview">("preview");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [panel, setPanel] = useState<"comments" | "history" | "access" | "links" | "files" | null>(null);
  const [commentHovered, setCommentHovered] = useState(false);
  const [comment, setComment] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [subjectSearch, setSubjectSearch] = useState("");
  const [subjectType, setSubjectType] = useState<DocPermission["subject_type"]>("user");
  const [permission, setPermission] = useState<DocPermission["permission"]>("view");
  const [entityId, setEntityId] = useState("");
  const [entitySearch, setEntitySearch] = useState("");
  const [entityType, setEntityType] = useState<"project" | "task" | "team" | "user">("project");
  const [fileName, setFileName] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [localFile, setLocalFile] = useState<File | null>(null);
  const [commentAnchor, setCommentAnchor] = useState<{
    selection_start: number;
    selection_end: number;
    selected_text: string;
  } | null>(null);

  // Check creator & editor authorization
  const isCreator = Boolean(
    user &&
      (isSuperAdmin ||
        hasPermission("docs.manage") ||
        hasPermission("docs.admin") ||
        user.id === page.data?.created_by)
  );

  const comments = useQuery({
    queryKey: ["doc-comments", pageId],
    queryFn: () => listDocComments(pageId),
    enabled: Boolean(pageId),
  });
  const revisions = useQuery({
    queryKey: ["doc-revisions", pageId],
    queryFn: () => listDocRevisions(pageId),
    enabled: Boolean(pageId) && panel === "history",
  });
  const permissions = useQuery({
    queryKey: ["doc-permissions", pageId],
    queryFn: () => listDocPermissions(pageId),
    enabled: Boolean(pageId) && panel === "access",
    retry: false,
  });
  const links = useQuery({
    queryKey: ["doc-links", pageId],
    queryFn: () => listDocLinks(pageId),
    enabled: Boolean(pageId) && panel === "links",
  });
  const attachments = useQuery({
    queryKey: ["doc-attachments", pageId],
    queryFn: () => listDocAttachments(pageId),
    enabled: Boolean(pageId) && panel === "files",
  });
  const accessUsers = useQuery({
    queryKey: ["doc-access-users"],
    queryFn: () => listUsers({ page_size: 200 }),
    enabled: panel === "access" || panel === "links",
  });
  const accessTeams = useQuery({
    queryKey: ["doc-access-teams"],
    queryFn: () => listTeams(),
    enabled: panel === "access" || panel === "links",
  });
  const accessDepartments = useQuery({
    queryKey: ["doc-access-departments"],
    queryFn: listDepartments,
    enabled: panel === "access",
  });
  const linkProjects = useQuery({
    queryKey: ["doc-link-projects"],
    queryFn: () => listProjects(1, 200),
    enabled: panel === "links" && entityType === "project",
  });
  const linkTasks = useQuery({
    queryKey: ["doc-link-tasks", entitySearch],
    queryFn: () => listTasks({ search: entitySearch || undefined, page_size: 30 }),
    enabled: panel === "links" && entityType === "task",
  });

  const accessOptions = useMemo<SearchSuggestion[]>(() => {
    if (subjectType === "user") {
      return (accessUsers.data?.items ?? []).map((item) => ({ id: item.id, label: item.full_name, detail: item.email }));
    }
    if (subjectType === "team") {
      return (accessTeams.data ?? []).map((item) => ({ id: item.id, label: item.name, detail: "Team" }));
    }
    if (subjectType === "department") {
      return (accessDepartments.data ?? []).map((item) => ({ id: item.id, label: item.name, detail: "Department" }));
    }
    return [];
  }, [subjectType, accessUsers.data, accessTeams.data, accessDepartments.data]);

  const linkedWorkOptions = useMemo<SearchSuggestion[]>(() => {
    if (entityType === "project") {
      return (linkProjects.data?.items ?? []).map((item) => ({ id: item.id, label: item.name, detail: "Project" }));
    }
    if (entityType === "task") {
      return (linkTasks.data?.items ?? []).map((item) => ({ id: item.id, label: item.title, detail: "Task" }));
    }
    if (entityType === "team") {
      return (accessTeams.data ?? []).map((item) => ({ id: item.id, label: item.name, detail: "Team" }));
    }
    return (accessUsers.data?.items ?? []).map((item) => ({ id: item.id, label: item.full_name, detail: item.email }));
  }, [entityType, linkProjects.data, linkTasks.data, accessTeams.data, accessUsers.data]);

  useEffect(() => {
    if (page.data) {
      setTitle(page.data.title);
      setContent(page.data.content);
      setVisibility(page.data.visibility);
    }
  }, [page.data]);

  const dirty = useMemo(
    () =>
      Boolean(
        page.data &&
          (title !== page.data.title ||
            content !== page.data.content ||
            visibility !== page.data.visibility)
      ),
    [page.data, title, content, visibility]
  );

  const slashOpen = tab === "write" && /(^|\n)\/$/.test(content);

  useEffect(() => {
    const before = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [dirty]);

  async function save() {
    if (!isCreator) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const saved = await updateDocPage(pageId, { title, content, visibility });
      await queryClient.invalidateQueries({ queryKey: ["doc-page", pageId] });
      setMessage(saved.status === "published" ? "Saved and published publicly" : "Changes saved");
    } catch (err) {
      setError(
        err instanceof AppError
          ? err.message
          : "Changes could not be saved. Your draft remains here; reconnect and retry."
      );
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    if (!isCreator) return;
    setSaving(true);
    setError("");
    try {
      if (dirty) await updateDocPage(pageId, { title, content, visibility });
      const result = await publishDocPage(pageId, page.data?.status !== "published");
      await queryClient.setQueryData(["doc-page", pageId], result);
      setMessage(result.status === "published" ? "Published publicly" : "Moved back to internal");
    } catch (err) {
      setError(
        err instanceof AppError
          ? err.message
          : "Publishing failed. The page remains in its previous state; retry when connected."
      );
    } finally {
      setSaving(false);
    }
  }

  async function addComment() {
    if (!comment.trim()) return;
    setSaving(true);
    setError("");
    try {
      if (commentAnchor) {
        await addAnchoredDocComment(pageId, comment.trim(), commentAnchor);
      } else {
        await addDocComment(pageId, comment.trim());
      }
      setComment("");
      setCommentAnchor(null);
      await comments.refetch();
      setMessage("Comment posted");
    } catch (err) {
      setError(err instanceof AppError ? err.message : "The comment could not be added.");
    } finally {
      setSaving(false);
    }
  }

  async function restore(revisionId: string) {
    if (!isCreator) return;
    setSaving(true);
    setError("");
    try {
      const restored = await restoreDocRevision(pageId, revisionId);
      await queryClient.setQueryData(["doc-page", pageId], restored);
      await revisions.refetch();
      setMessage("Revision restored; the previous version remains in history.");
    } catch (err) {
      setError(err instanceof AppError ? err.message : "The revision could not be restored.");
    } finally {
      setSaving(false);
    }
  }

  async function grantAccess() {
    if (!subjectId.trim()) return;
    setSaving(true);
    setError("");
    try {
      const current = (permissions.data ?? []).map(({ subject_type, subject_id, permission }) => ({
        subject_type,
        subject_id,
        permission,
      }));
      await replaceDocPermissions(pageId, [
        ...current,
        { subject_type: subjectType, subject_id: subjectId.trim(), permission },
      ]);
      if (visibility === "private") {
        await updateDocPage(pageId, { visibility: "selected" });
        setVisibility("selected");
        await queryClient.invalidateQueries({ queryKey: ["doc-page", pageId] });
      }
      setSubjectId("");
      setSubjectSearch("");
      await permissions.refetch();
      setMessage("Access rules updated");
    } catch (err) {
      setError(err instanceof AppError ? err.message : "Access could not be updated.");
    } finally {
      setSaving(false);
    }
  }

  async function revokeAccess(target: DocPermission) {
    setSaving(true);
    setError("");
    try {
      const remaining = (permissions.data ?? [])
        .filter((item) => item.id !== target.id)
        .map(({ subject_type, subject_id, permission: grantedPermission }) => ({
          subject_type,
          subject_id,
          permission: grantedPermission,
        }));
      await replaceDocPermissions(pageId, remaining);
      await permissions.refetch();
      setMessage("Access removed");
    } catch (err) {
      setError(err instanceof AppError ? err.message : "Access could not be removed.");
    } finally {
      setSaving(false);
    }
  }

  async function setAccessScope(scope: "private" | "workspace" | "public") {
    setSaving(true);
    setError("");
    try {
      const saved = await updateDocPage(pageId, { title, content, visibility: scope });
      setVisibility(saved.visibility);
      queryClient.setQueryData(["doc-page", pageId], saved);
      setMessage(
        scope === "private"
          ? "Only you can see this document"
          : scope === "workspace"
            ? "Visible to all internal teams"
            : "Published without sign-in",
      );
    } catch (err) {
      setError(err instanceof AppError ? err.message : "The access scope could not be changed.");
    } finally {
      setSaving(false);
    }
  }

  async function connectEntity() {
    if (!entityId.trim()) return;
    setSaving(true);
    setError("");
    try {
      await addDocLink(pageId, { entity_type: entityType, entity_id: entityId.trim() });
      setEntityId("");
      setEntitySearch("");
      await links.refetch();
      setMessage("Work item connected");
    } catch (err) {
      setError(err instanceof AppError ? err.message : "The work item could not be connected.");
    } finally {
      setSaving(false);
    }
  }

  async function attachFile() {
    if (!fileName.trim() || !fileUrl.trim()) return;
    setSaving(true);
    setError("");
    try {
      await addDocAttachment(pageId, {
        file_name: fileName.trim(),
        file_url: fileUrl.trim(),
        mime_type: "application/octet-stream",
      });
      setFileName("");
      setFileUrl("");
      await attachments.refetch();
      setMessage("Attachment added");
    } catch (err) {
      setError(err instanceof AppError ? err.message : "The attachment could not be added.");
    } finally {
      setSaving(false);
    }
  }

  async function uploadLocalFile() {
    if (!localFile) return;
    setSaving(true);
    setError("");
    try {
      await uploadDocAttachment(pageId, localFile);
      setLocalFile(null);
      await attachments.refetch();
      setMessage("File uploaded securely");
    } catch (err) {
      setError(err instanceof AppError ? err.message : "The local file could not be uploaded.");
    } finally {
      setSaving(false);
    }
  }

  async function openAttachment(item: { id: string; file_url?: string | null; stored?: boolean }) {
    try {
      if (item.stored) {
        const { url } = await getDocAttachmentDownloadUrl(item.id);
        window.open(url, "_blank", "noopener,noreferrer");
      } else if (item.file_url) {
        window.open(item.file_url, "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      setError(err instanceof AppError ? err.message : "The attachment could not be opened.");
    }
  }

  function captureSelection(selectedText: string, selectionStart?: number, selectionEnd?: number) {
    const text = selectedText.trim();
    if (!text) return;
    const start = selectionStart ?? content.indexOf(text);
    const end = selectionEnd ?? (start >= 0 ? start + text.length : -1);
    if (start < 0 || end <= start) return;
    setCommentAnchor({ selection_start: start, selection_end: end, selected_text: content.slice(start, end) });
    setPanel("comments");
    setCommentHovered(true);
  }

  if (!pageId || page.isLoading) {
    return (
      <div className="doc-editor-state">
        <BookOpenText size={25} />
        <span>Loading document…</span>
      </div>
    );
  }

  if (page.isError || !page.data) {
    return (
      <div className="doc-editor-state error" role="alert">
        <h1>Document unavailable</h1>
        <p>It may have moved, you may not have access, or the service is offline.</p>
        <Button onClick={() => page.refetch()}>Retry</Button>
      </div>
    );
  }

  const commentCount = comments.data?.length ?? 0;

  return (
    <div className="doc-editor" style={{ position: "relative" }}>
      <header className="doc-editor-header">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Back"
          className="doc-icon-action"
          style={{
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-2)",
            width: 44,
            height: 44,
            display: "grid",
            placeItems: "center",
            cursor: "pointer",
            background: "transparent",
            color: "var(--text-primary)",
          }}
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <span>
            {page.data.status === "published" ? <Globe2 size={14} /> : <LockKeyhole size={14} />}{" "}
            {page.data.status}
          </span>
          {dirty && <small>Unsaved changes</small>}
          {message && (
            <small className="success">
              <Check size={13} />
              {message}
            </small>
          )}
        </div>
        <div>
          <Link
            href={`/app/docs?pageId=${pageId}&spaceId=${spaceId}`}
            className="doc-icon-action"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "0 12px",
              height: 38,
              borderRadius: "var(--radius-2, 8px)",
              background: "rgba(99, 102, 241, 0.15)",
              color: "var(--accent-primary, #818cf8)",
              border: "1px solid rgba(99, 102, 241, 0.3)",
              fontSize: 12,
              fontWeight: 600,
              textDecoration: "none",
            }}
            title="Open in connected Knowledge Workspace"
          >
            <BookOpenText size={15} />
            <span>Workspace</span>
          </Link>
          <button
            type="button"
            className="doc-icon-action"
            aria-label="Favorite this page"
            onClick={async () => {
              await favoriteDocPage(pageId);
              setMessage("Added to favorites");
            }}
          >
            <Star size={16} />
          </button>
          {isCreator && (
            <>
              <Button variant="secondary" onClick={save} disabled={!dirty || saving}>
                <Save size={15} />
                {saving ? "Saving…" : "Save"}
              </Button>
              <Button onClick={publish} disabled={saving}>
                {page.data.status === "published" ? "Unpublish" : "Publish"}
              </Button>
            </>
          )}
        </div>
      </header>

      {error && (
        <div className="doc-editor-error" role="alert">
          {error}
          <button type="button" onClick={() => setError("")}>
            Dismiss
          </button>
        </div>
      )}

      <div className="doc-editor-toolbar">
        <div role="tablist" aria-label="Editor mode">
          {isCreator && (
            <button
              role="tab"
              aria-selected={tab === "write"}
              onClick={() => setTab("write")}
              title="Edit document content (Creator only)"
            >
              <Edit3 size={15} />
              Write
            </button>
          )}
          <button
            role="tab"
            aria-selected={tab === "preview"}
            onClick={() => setTab("preview")}
            title="Preview rendered document"
          >
            <Eye size={15} />
            Preview
          </button>
        </div>
        {isCreator ? (
          <label>
            <span>Visibility</span>
            <Select
              value={visibility}
              onChange={(event) => setVisibility(event.target.value)}
              options={[
                { value: "private", label: "Private to me" },
                { value: "selected", label: "Selected users, teams or departments" },
                { value: "workspace", label: "Internal: all teams" },
                { value: "public", label: "Public: no sign-in required" },
                { value: "admins", label: "Administrators only" },
                { value: "inherit", label: "Inherit from space" },
              ]}
            />
          </label>
        ) : (
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", display: "flex", alignItems: "center", gap: 6 }}>
            <LockKeyhole size={13} />
            <span>Read-only (Managed by Author)</span>
          </div>
        )}
      </div>

      <nav className="doc-editor-tools" aria-label="Document collaboration tools">
        <button
          type="button"
          aria-pressed={panel === "comments"}
          onClick={() => setPanel((current) => (current === "comments" ? null : "comments"))}
          style={{ position: "relative" }}
        >
          <MessageSquareText size={15} />
          Comments {commentCount > 0 && <span style={commentBadgeStyle}>{commentCount}</span>}
        </button>
        {([
          { key: "history", label: "History", icon: History },
          { key: "access", label: "Access", icon: ShieldCheck },
          { key: "links", label: "Linked work", icon: Link2 },
          { key: "files", label: "Files", icon: Paperclip },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            type="button"
            key={key}
            aria-pressed={panel === key}
            onClick={() => setPanel((current) => (current === key ? null : key))}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </nav>

      {/* Floating Hover/Click Comments Trigger & Drawer */}
      <div
        className="doc-floating-comments-container"
        onMouseEnter={() => setCommentHovered(true)}
        onMouseLeave={() => setCommentHovered(false)}
        style={{
          position: "fixed",
          bottom: 24,
          right: 28,
          zIndex: 60,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 10,
        }}
      >
        {/* Hover/Flyout Comments Drawer */}
        {(commentHovered || panel === "comments") && (
          <div
            className="doc-comments-popover"
            style={{
              width: 360,
              maxHeight: 480,
              borderRadius: "var(--radius-3, 14px)",
              border: "1px solid var(--border-default, rgba(255,255,255,0.12))",
              background: "var(--surface-1, #0f172a)",
              boxShadow: "0 12px 36px rgba(0,0,0,0.45)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              animation: "fadeIn 0.18s ease-out",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 16px",
                borderBottom: "1px solid var(--border-subtle, rgba(255,255,255,0.08))",
                background: "var(--surface-2, rgba(255,255,255,0.03))",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <MessageSquare size={16} style={{ color: "var(--accent-primary)" }} />
                <span style={{ fontWeight: 700, fontSize: 13, color: "var(--text-primary)" }}>
                  Document Discussion ({commentCount})
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPanel(null);
                  setCommentHovered(false);
                }}
                style={{ background: "transparent", border: 0, color: "var(--text-tertiary)", cursor: "pointer" }}
              >
                <X size={15} />
              </button>
            </div>

            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: 12,
                display: "flex",
                flexDirection: "column",
                gap: 10,
                maxHeight: 280,
              }}
            >
              {comments.isLoading ? (
                <p style={{ color: "var(--text-tertiary)", fontSize: 12, textAlign: "center" }}>Loading comments…</p>
              ) : comments.data?.length ? (
                comments.data.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      padding: "10px 12px",
                      borderRadius: "var(--radius-2, 8px)",
                      background: "var(--surface-deepest, #080c14)",
                      border: "1px solid var(--border-subtle, rgba(255,255,255,0.06))",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent-gold-bright, #facc15)" }}>
                        User {item.author_user_id.slice(0, 8)}
                      </span>
                      <small style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
                        {new Date(item.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </small>
                    </div>
                    <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                      {item.body}
                    </p>
                    {item.selected_text && (
                      <button
                        type="button"
                        onClick={() => document.getElementById(`doc-comment-${item.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
                        style={{ marginTop: 7, width: "100%", border: "1px solid rgba(234,179,8,.35)", borderRadius: 6, background: "rgba(250,204,21,.08)", color: "var(--text-secondary)", padding: "6px 8px", textAlign: "left", cursor: "pointer", fontSize: 11 }}
                      >
                        “{item.selected_text}”
                      </button>
                    )}
                  </div>
                ))
              ) : (
                <div style={{ textAlign: "center", padding: "20px 0", color: "var(--text-tertiary)", fontSize: 12 }}>
                  No comments yet. Start the review conversation!
                </div>
              )}
            </div>

            <div
              style={{
                padding: "10px 12px",
                borderTop: "1px solid var(--border-subtle, rgba(255,255,255,0.08))",
                background: "var(--surface-2, rgba(255,255,255,0.02))",
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              {commentAnchor && (
                <div style={{ width: "100%", padding: "6px 8px", borderRadius: 6, background: "rgba(250,204,21,.1)", color: "var(--text-secondary)", fontSize: 11, display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span>Commenting on “{commentAnchor.selected_text}”</span>
                  <button type="button" onClick={() => setCommentAnchor(null)} style={{ border: 0, background: "transparent", color: "inherit", cursor: "pointer" }}>Clear</button>
                </div>
              )}
              <input
                type="text"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    addComment();
                  }
                }}
                placeholder="Write a comment… (Enter to post)"
                style={{
                  flex: 1,
                  background: "var(--surface-deepest, #080c14)",
                  border: "1px solid var(--border-default, rgba(255,255,255,0.12))",
                  borderRadius: "var(--radius-1, 6px)",
                  padding: "8px 12px",
                  fontSize: 12,
                  color: "var(--text-primary)",
                  outline: "none",
                }}
              />
              <button
                type="button"
                onClick={addComment}
                disabled={saving || !comment.trim()}
                style={{
                  background: "var(--accent-primary, #6366f1)",
                  color: "#fff",
                  border: 0,
                  borderRadius: "var(--radius-1, 6px)",
                  padding: "0 12px",
                  cursor: comment.trim() ? "pointer" : "default",
                  opacity: comment.trim() ? 1 : 0.5,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Send size={13} />
              </button>
            </div>
          </div>
        )}

        {/* Floating Toggle Button */}
        <button
          type="button"
          onClick={() => setPanel((c) => (c === "comments" ? null : "comments"))}
          style={{
            height: 44,
            padding: "0 16px",
            borderRadius: "var(--radius-full, 999px)",
            background: "linear-gradient(135deg, var(--accent-primary, #6366f1) 0%, var(--accent-indigo, #4f46e5) 100%)",
            color: "#ffffff",
            border: "1px solid rgba(255,255,255,0.2)",
            boxShadow: "0 4px 18px rgba(99,102,241,0.4)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            fontWeight: 700,
            transition: "transform 0.15s ease",
          }}
        >
          <MessageSquareText size={16} />
          <span>Comments</span>
          {commentCount > 0 && (
            <span
              style={{
                background: "rgba(255,255,255,0.25)",
                padding: "1px 7px",
                borderRadius: 12,
                fontSize: 11,
              }}
            >
              {commentCount}
            </span>
          )}
        </button>
      </div>

      {panel && panel !== "comments" && (
        <section className="doc-editor-panel" aria-label={`${panel} panel`}>
          {panel === "history" && (
            <>
              <header>
                <div>
                  <h2>Version history</h2>
                  <p>Every save preserves the version it replaced.</p>
                </div>
              </header>
              <div className="doc-panel-list">
                {revisions.isLoading ? (
                  <p>Loading revisions…</p>
                ) : revisions.data?.length ? (
                  revisions.data.map((item) => (
                    <article key={item.id}>
                      <b>
                        Revision {item.revision_number} · {item.title}
                      </b>
                      <small>{new Date(item.created_at).toLocaleString()}</small>
                      {isCreator && (
                        <button type="button" onClick={() => restore(item.id)} disabled={saving}>
                          <RotateCcw size={14} />
                          Restore
                        </button>
                      )}
                    </article>
                  ))
                ) : (
                  <p>No previous revisions yet.</p>
                )}
              </div>
            </>
          )}

          {panel === "access" && (
            <>
              <header>
                <div>
                  <h2>Page access</h2>
                  <p>Private by default. Search users, teams, or departments, or choose an organization-wide scope.</p>
                </div>
              </header>
              {permissions.isError ? (
                <p role="alert">You do not have permission to manage access for this page.</p>
              ) : (
                <>
                  <div className="doc-panel-list">
                    {permissions.data?.map((item) => (
                      <article key={item.id ?? `${item.subject_type}-${item.subject_id}-${item.permission}`}>
                        <b>
                          {item.subject_type}: {item.subject_id}
                        </b>
                        <small>{item.permission}</small>
                        {isCreator && item.id && (
                          <button type="button" onClick={() => revokeAccess(item)} disabled={saving}>
                            Remove
                          </button>
                        )}
                      </article>
                    ))}
                  </div>
                  {isCreator && (
                    <div className="doc-panel-form" style={{ display: "grid", gap: 10 }}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <Button variant={visibility === "private" ? "primary" : "secondary"} onClick={() => setAccessScope("private")} disabled={saving}>Private to me</Button>
                        <Button variant={visibility === "workspace" ? "primary" : "secondary"} onClick={() => setAccessScope("workspace")} disabled={saving}>Internal: all teams</Button>
                        <Button variant={visibility === "public" ? "primary" : "secondary"} onClick={() => setAccessScope("public")} disabled={saving}>Public without sign-in</Button>
                      </div>
                      <div className="inline" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <Select
                          value={subjectType}
                          onChange={(event) => {
                            setSubjectType(event.target.value as DocPermission["subject_type"]);
                            setSubjectId("");
                            setSubjectSearch("");
                          }}
                          options={[
                            { value: "user", label: "User" },
                            { value: "team", label: "Team" },
                            { value: "department", label: "Department" },
                          ]}
                        />
                        <SearchSuggestionInput
                          value={subjectSearch}
                          options={accessOptions}
                          placeholder={`Search ${subjectType}s…`}
                          ariaLabel="Search access subjects"
                          onChange={(value) => {
                            setSubjectSearch(value);
                            setSubjectId("");
                          }}
                          onSelect={(option) => {
                            setSubjectId(option.id);
                            setSubjectSearch(option.label);
                          }}
                        />
                        <Select
                          value={permission}
                          onChange={(event) =>
                            setPermission(event.target.value as DocPermission["permission"])
                          }
                          options={[
                            { value: "view", label: "Can view" },
                            { value: "comment", label: "Can comment" },
                            { value: "edit", label: "Can edit" },
                            { value: "manage", label: "Can manage" },
                          ]}
                        />
                        <Button onClick={grantAccess} disabled={saving || !subjectId}>
                          Grant
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {panel === "links" && (
            <>
              <header>
                <div>
                  <h2>Linked work</h2>
                  <p>Connect this knowledge to execution without duplicating it.</p>
                </div>
              </header>
              <div className="doc-panel-list">
                {links.data?.length ? (
                  links.data.map((item) => (
                    <article key={item.id}>
                      <b>{item.entity_type}</b>
                      <small>{item.entity_id}</small>
                    </article>
                  ))
                ) : (
                  <p>No linked work yet.</p>
                )}
              </div>
              {isCreator && (
                <div className="doc-panel-form inline">
                  <Select
                    value={entityType}
                    onChange={(event) => {
                      setEntityType(event.target.value as typeof entityType);
                      setEntityId("");
                      setEntitySearch("");
                    }}
                    options={[
                      { value: "project", label: "Project" },
                      { value: "task", label: "Task" },
                      { value: "team", label: "Team" },
                      { value: "user", label: "User" },
                    ]}
                  />
                  <SearchSuggestionInput
                    value={entitySearch}
                    options={linkedWorkOptions}
                    placeholder={`Search ${entityType}s…`}
                    ariaLabel="Search linked work"
                    onChange={(value) => {
                      setEntitySearch(value);
                      setEntityId("");
                    }}
                    onSelect={(option) => {
                      setEntityId(option.id);
                      setEntitySearch(option.label);
                    }}
                  />
                  <Button onClick={connectEntity} disabled={saving || !entityId}>
                    Connect
                  </Button>
                </div>
              )}
            </>
          )}

          {panel === "files" && (
            <>
              <header>
                <div>
                  <h2>Attachments</h2>
                  <p>Upload from this device to MinIO in development or S3 in production. External HTTPS links remain supported.</p>
                </div>
              </header>
              <div className="doc-panel-list">
                {attachments.data?.length ? (
                  attachments.data.map((item) => (
                    <article key={item.id}>
                      <button type="button" onClick={() => openAttachment(item)} style={{ border: 0, background: "transparent", color: "var(--text-link)", cursor: "pointer", padding: 0, textAlign: "left" }}>
                        <b>{item.file_name}</b>
                      </button>
                      <small>{item.mime_type}{item.size_bytes ? ` · ${(item.size_bytes / 1024).toFixed(1)} KB` : ""}</small>
                    </article>
                  ))
                ) : (
                  <p>No attachments yet.</p>
                )}
              </div>
              {isCreator && (
                <div className="doc-panel-form" style={{ display: "grid", gap: 12 }}>
                  <div className="inline" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <input
                      type="file"
                      aria-label="Choose local attachment"
                      onChange={(event) => setLocalFile(event.target.files?.[0] ?? null)}
                      style={{ flex: 1, minWidth: 240 }}
                    />
                    <Button onClick={uploadLocalFile} disabled={saving || !localFile}>
                      <Upload size={14} /> Upload file
                    </Button>
                  </div>
                  <div className="inline" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <TextInput
                      value={fileName}
                      onChange={(event) => setFileName(event.target.value)}
                      placeholder="External file name"
                      aria-label="Attachment name"
                    />
                    <TextInput
                      value={fileUrl}
                      onChange={(event) => setFileUrl(event.target.value)}
                      placeholder="https://…"
                      aria-label="External file URL"
                    />
                    <Button variant="secondary" onClick={attachFile} disabled={saving || !fileName.trim() || !fileUrl.trim()}>
                      Add link
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      )}

      <div className="doc-editor-canvas">
        {isCreator && tab === "write" ? (
          <TextInput
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            aria-label="Document title"
            className="doc-title-input"
          />
        ) : (
          <h1
            style={{
              fontSize: "clamp(24px, 3.2vw, 36px)",
              fontWeight: 800,
              color: "var(--text-primary)",
              letterSpacing: "-0.02em",
              margin: "0 0 16px",
            }}
          >
            {title || "Untitled Document"}
          </h1>
        )}

        {tab === "write" && isCreator ? (
          <div className="doc-writing-area">
            <TextArea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              onSelect={(event) => {
                const target = event.currentTarget;
                if (target.selectionEnd > target.selectionStart) {
                  captureSelection(
                    target.value.slice(target.selectionStart, target.selectionEnd),
                    target.selectionStart,
                    target.selectionEnd,
                  );
                }
              }}
              aria-label="Document content"
              placeholder="Start writing, or type / for blocks… Select any text to attach an inline comment."
            />
            {slashOpen && (
              <div className="slash-menu" role="listbox" aria-label="Insert content block">
                <span>Insert block</span>
                {slashItems.map((item) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected="false"
                    key={item.label}
                    onClick={() => setContent((current) => current.slice(0, -1) + item.value)}
                  >
                    {item.label}
                    {item.label === "Video" && <Video size={14} />}
                  </button>
                ))}
              </div>
            )}
            <p className="doc-editor-hint">
              Markdown supported · Type <kbd>/</kbd> on a new line for blocks
            </p>
          </div>
        ) : (
          <article
            className="doc-preview"
            style={{ minHeight: 400 }}
            onMouseUp={() => captureSelection(window.getSelection()?.toString() ?? "")}
          >
            <MarkdownPreview
              value={content}
              empty="Nothing to preview yet. Return to Write and add the first section."
              highlights={(comments.data ?? [])
                .filter((item) => item.selected_text)
                .map((item) => ({ id: item.id, text: item.selected_text! }))}
            />
          </article>
        )}

        <footer className="doc-editor-meta">
          <span>
            <Clock3 size={14} />
            Revision history is created whenever you save.
          </span>
          <span>Last updated {new Date(page.data.updated_at).toLocaleString()}</span>
        </footer>
      </div>
    </div>
  );
}

const commentBadgeStyle: React.CSSProperties = {
  marginLeft: 5,
  padding: "1px 6px",
  borderRadius: "var(--radius-full, 99px)",
  background: "var(--accent-primary-soft, rgba(99,102,241,0.2))",
  color: "var(--accent-primary, #818cf8)",
  fontWeight: 700,
  fontSize: 10,
};
