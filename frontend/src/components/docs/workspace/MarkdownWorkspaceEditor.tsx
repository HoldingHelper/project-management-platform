"use client";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { LocalizedText } from "@/lib/i18n/I18nProvider";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bold,
  Italic,
  Strikethrough,
  Link as LinkIcon,
  List,
  ListOrdered,
  Code,
  Quote,
  MoreHorizontal,
  Sparkles,
  Columns,
  Eye,
  Edit3,
  Check,
  Clock,
  MessageSquare,
  History,
  Maximize2,
  Minimize2,
  ChevronDown,
  Monitor,
  Lock,
  Users,
  Info,
  CheckCircle2,
  Settings,
  Share2,
  ThumbsUp,
  X,
  Send,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getDocPage, updateDocPage, listDocComments, addDocComment, type DocPage, type DocComment } from "@/lib/api/docs";
import { DocumentComments } from "../DocumentComments";
import { UploadedDocumentView } from "./UploadedDocumentView";
import { DocumentLifecycleControls, type DocumentLifecycle } from "../DocumentLifecycleControls";
import { DocumentAttachments } from "../DocumentAttachments";
import { apiFetch } from "@/lib/api/client";
import { MarkdownPreview } from "@/components/ds";
import { useKnowledgeWorkspace } from "@/lib/stores/knowledgeWorkspaceStore";

interface Props {
  pageId: string;
}

export function MarkdownWorkspaceEditor({ pageId }: Props) {
  const { t: translateUI } = useI18n();

  const client = useQueryClient();
  const { openTab, tabs, closeTab } = useKnowledgeWorkspace();

  const { data: page, isLoading, isError } = useQuery({
    queryKey: ["doc-page", pageId],
    queryFn: () => getDocPage(pageId),
    enabled: Boolean(pageId),
    refetchInterval: 15000,
  });

  const lifecycle = useQuery({ queryKey: ["document-lifecycle", `/docs/pages/${pageId}`], queryFn: () => apiFetch<DocumentLifecycle>(`/docs/pages/${pageId}/lifecycle`), refetchInterval: 15000 });
  const editable = !!lifecycle.data?.can_edit;
  const { data: comments = [] } = useQuery({
    queryKey: ["doc-comments", pageId],
    queryFn: () => listDocComments(pageId),
    enabled: Boolean(pageId),
  });

  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [viewMode, setViewMode] = useState<"split" | "rendered" | "edit">("split");
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const [activeTab, setActiveTab] = useState<"edit" | "preview" | "comments" | "history">("edit");
  const [showAiSuggestion, setShowAiSuggestion] = useState(true);
  const [readingProgress, setReadingProgress] = useState(0);
  const [selectedHighlightComment, setSelectedHighlightComment] = useState<string | null>(null);

  const editorRef = useRef<HTMLTextAreaElement>(null);
  const previewScrollRef = useRef<HTMLDivElement>(null);

  // Initialize content from page
  useEffect(() => {
    if (page) {
      setTitle(page.title || "");
      setContent(page.content || "");
      setSaveStatus("saved");
    }
  }, [page]);

  useEffect(() => {
    if (!editable) { setViewMode("rendered"); setActiveTab("preview"); }
  }, [editable]);
  useEffect(() => () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); }, [pageId]);
  // Track reading scroll progress
  const handleScroll = () => {
    if (!previewScrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = previewScrollRef.current;
    if (scrollHeight <= clientHeight) {
      setReadingProgress(100);
      return;
    }
    const pct = Math.round((scrollTop / (scrollHeight - clientHeight)) * 100);
    setReadingProgress(Math.min(100, Math.max(0, pct)));
  };

  // Split content into lines for line numbers
  const lines = useMemo(() => {
    return content.split("\n");
  }, [content]);

  // Auto-save debounce
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const handleContentChange = (newContent: string) => {
    if (!editable) return;
    setContent(newContent);
    setSaveStatus("unsaved");

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(async () => {
      if (!page) return;
      setSaveStatus("saving");
      try {
        await updateDocPage(page.id, { content: newContent, title });
        await client.invalidateQueries({ queryKey: ["doc-page", pageId] });
        setSaveStatus("saved");
      } catch (err) {
        console.error("Failed to save doc page", err);
        setSaveStatus("unsaved");
      }
    }, 800);
  };

  // Insert formatting helper
  const insertFormat = (prefix: string, suffix: string = "") => {
    if (!editorRef.current) return;
    const { selectionStart, selectionEnd, value } = editorRef.current;
    const selected = value.substring(selectionStart, selectionEnd);
    const replacement = `${prefix}${selected || "text"}${suffix}`;
    const newContent = value.substring(0, selectionStart) + replacement + value.substring(selectionEnd);
    handleContentChange(newContent);

    setTimeout(() => {
      if (editorRef.current) {
        editorRef.current.focus();
        editorRef.current.setSelectionRange(
          selectionStart + prefix.length,
          selectionStart + prefix.length + (selected.length || 4)
        );
      }
    }, 10);
  };

  if (isLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-tertiary)" }}>
        <Loader2 size={24} className="animate-spin" />
      </div>
    );
  }

  if (isError || !page) return <div role="alert" style={{ padding: 24 }}>{translateUI("This document is unavailable or archived.")}</div>;

  if (page?.source_attachment_id) return <UploadedDocumentView page={page} />;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--surface-deepest)",
        color: "var(--text-primary)",
        overflow: "hidden",
      }}
    >
      {/* Top Bar: Tabs, View Toggle, Status */}
      <div className="knowledge-editor-topbar"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 18px",
          minHeight: 48,
          flexWrap: "wrap",
          gap: 8,
          paddingBlock: 8,
          borderBottom: "1px solid var(--border-subtle)",
          background: "var(--surface-1)",
          flexShrink: 0,
        }}
      >
        {/* Left tabs: Edit, Preview, Comments, History */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              background: "var(--surface-2)",
              padding: "2px",
              borderRadius: "var(--radius-2)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <button
              type="button"
              disabled={!editable}
              onClick={() => { if (editable) { setActiveTab("edit"); setViewMode("split"); } }}
              className={`docs-toolbar-btn ${activeTab === "edit" ? "is-active" : ""}`}
              style={{ padding: "4px 12px", height: 26, fontSize: 12, borderRadius: "var(--radius-1)" }}
            >{" "}<LocalizedText message={"Edit"} />{" "}</button>
            <button
              type="button"
              onClick={() => { setActiveTab("preview"); setViewMode("rendered"); }}
              className={`docs-toolbar-btn ${activeTab === "preview" ? "is-active" : ""}`}
              style={{ padding: "4px 12px", height: 26, fontSize: 12, borderRadius: "var(--radius-1)" }}
            >{" "}<LocalizedText message={"Preview"} />{" "}</button>
          </div>

          <button
            type="button"
            onClick={() => setActiveTab("comments")}
            aria-label={translateUI("Document comments")} title={translateUI("Document comments")}
            className={`knowledge-editor-comments docs-toolbar-btn ${activeTab === "comments" ? "is-active" : ""}`}
            style={{ gap: 5, padding: "4px 10px", height: 30 }}
          >
            <MessageSquare size={13} />
            <span><LocalizedText message={"Comments"} /></span>
            <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: "10px", background: "var(--accent-primary-soft)", color: "var(--accent-primary)", fontWeight: 700 }}>
              {comments.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("history")}
            aria-label={translateUI("Document history")} title={translateUI("Document history")}
            className={`knowledge-editor-history docs-toolbar-btn ${activeTab === "history" ? "is-active" : ""}`}
            style={{ gap: 5, padding: "4px 10px", height: 30 }}
          >
            <History size={13} />
            <span><LocalizedText message={"History"} /></span>
          </button>
        </div>

        {/* Right controls: Save status, Draft, Rendered/Split toggle */}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-tertiary)" }}>
            {saveStatus === "saved" && (
              <>
                <Check size={13} style={{ color: "var(--status-completed)" }} />
                <span><LocalizedText message={"Saved 2m ago"} /></span>
              </>
            )}
            {saveStatus === "saving" && (
              <>
                <Loader2 size={13} className="animate-spin" style={{ color: "var(--accent-primary)" }} />
                <span><LocalizedText message={"Saving…"} /></span>
              </>
            )}
            {saveStatus === "unsaved" && (
              <span style={{ color: "var(--status-delayed)" }}><LocalizedText message={"Unsaved changes"} /></span>
            )}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              background: "var(--surface-2)",
              padding: "2px",
              borderRadius: "var(--radius-2)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <button
              type="button"
              onClick={() => setViewMode("rendered")}
              className={`docs-toolbar-btn ${viewMode === "rendered" ? "is-active" : ""}`}
              style={{ padding: "4px 10px", height: 26, fontSize: 11.5 }}
            >{" "}<LocalizedText message={"Rendered"} />{" "}</button>
            <button
              type="button"
              disabled={!editable}
              onClick={() => { if (editable) setViewMode("split"); }}
              className={`docs-toolbar-btn ${viewMode === "split" ? "is-active" : ""}`}
              style={{ padding: "4px 10px", height: 26, fontSize: 11.5 }}
            >{" "}<LocalizedText message={"Split"} />{" "}</button>
          </div>

          {page && <DocumentLifecycleControls pageId={page.id} fileName={page.title} beforePublish={async () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); await updateDocPage(page.id, { content, title }); setSaveStatus("saved"); }} onArchived={() => tabs.filter((tab) => tab.pageId === page.id).forEach((tab) => closeTab(tab.id))} />}
          <button
            type="button"
            disabled={!editable}
            onClick={() => { if (editable) setViewMode(viewMode === "rendered" ? "split" : "rendered"); }}
            className="pmp-icon-btn"
            title={translateUI("Toggle fullscreen / split")}
            style={{ width: 30, height: 30, borderRadius: "var(--radius-1)", border: "1px solid var(--border-subtle)", background: "var(--surface-2)" }}
          >
            <Maximize2 size={13} />
          </button>
        </div>
      </div>

      <DocumentAttachments pageId={pageId} />

      {/* Formatting Toolbar (Only shown in edit/split mode) */}
      {editable && viewMode !== "rendered" && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "6px 18px",
            borderBottom: "1px solid var(--border-subtle)",
            background: "var(--surface-1)",
            flexShrink: 0,
            overflowX: "auto",
          }}
        >
          {/* Paragraph dropdown */}
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginRight: 6 }}>
            <select
              onChange={(e) => {
                const val = e.target.value;
                if (val === "h1") insertFormat("# ");
                else if (val === "h2") insertFormat("## ");
                else if (val === "h3") insertFormat("### ");
                else if (val === "code") insertFormat("```\n", "\n```");
                else if (val === "quote") insertFormat("> ");
              }}
              style={{
                padding: "3px 8px",
                borderRadius: "var(--radius-1)",
                background: "var(--surface-2)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-primary)",
                fontSize: 12,
                fontWeight: 600,
                outline: "none",
                cursor: "pointer",
              }}
            >
              <option value="p"><LocalizedText message={"Paragraph"} /></option>
              <option value="h1"><LocalizedText message={"Heading 1"} /></option>
              <option value="h2"><LocalizedText message={"Heading 2"} /></option>
              <option value="h3"><LocalizedText message={"Heading 3"} /></option>
              <option value="code"><LocalizedText message={"Code Block"} /></option>
              <option value="quote"><LocalizedText message={"Quote"} /></option>
            </select>
          </div>

          <div style={{ width: 1, height: 16, background: "var(--border-subtle)", margin: "0 4px" }} />

          <button type="button" onClick={() => insertFormat("**", "**")} className="docs-toolbar-btn" title={translateUI("Bold (⌘B)")}>
            <Bold size={13} />
          </button>
          <button type="button" onClick={() => insertFormat("*", "*")} className="docs-toolbar-btn" title={translateUI("Italic (⌘I)")}>
            <Italic size={13} />
          </button>
          <button type="button" onClick={() => insertFormat("~~", "~~")} className="docs-toolbar-btn" title={translateUI("Strikethrough")}>
            <Strikethrough size={13} />
          </button>
          <button type="button" onClick={() => insertFormat("[", "](https://)")} className="docs-toolbar-btn" title={translateUI("Insert Link")}>
            <LinkIcon size={13} />
          </button>

          <div style={{ width: 1, height: 16, background: "var(--border-subtle)", margin: "0 4px" }} />

          <button type="button" onClick={() => insertFormat("- ")} className="docs-toolbar-btn" title={translateUI("Bullet List")}>
            <List size={13} />
          </button>
          <button type="button" onClick={() => insertFormat("1. ")} className="docs-toolbar-btn" title={translateUI("Numbered List")}>
            <ListOrdered size={13} />
          </button>
          <button type="button" onClick={() => insertFormat("`", "`")} className="docs-toolbar-btn" title={translateUI("Inline Code")}>
            <Code size={13} />
          </button>
          <button type="button" onClick={() => insertFormat("> ")} className="docs-toolbar-btn" title={translateUI("Quote Block")}>
            <Quote size={13} />
          </button>

          <div style={{ width: 1, height: 16, background: "var(--border-subtle)", margin: "0 4px" }} />

          {/* AI Assistant Button */}
          <button
            type="button"
            onClick={() => setShowAiSuggestion((prev) => !prev)}
            className="docs-toolbar-btn is-active"
            style={{ gap: 5, padding: "0 10px", marginLeft: "auto", background: "rgba(37, 99, 255, 0.12)", color: "var(--accent-primary)" }}
          >
            <Sparkles size={13} />
            <span style={{ fontWeight: 700 }}><LocalizedText message={"AI"} /></span>
          </button>
        </div>
      )}

      {activeTab === "comments" ? <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 20 }}><DocumentComments key={pageId} pageId={pageId} /></div> : <>
      {/* Main Workspace Area (Split or Full) */}
      <div className="knowledge-editor-body" style={{ flex: 1, display: "flex", minHeight: 0, position: "relative" }}>
        {/* Editor Column (Monospace Markdown with Line Numbers) */}
        {editable && viewMode !== "rendered" && (
          <div className="knowledge-editor-source"
            style={{
              flex: viewMode === "split" ? "0 0 45%" : "1 0 100%",
              display: "flex",
              borderRight: viewMode === "split" ? "1px solid var(--border-subtle)" : "none",
              background: "var(--surface-1)",
              overflow: "hidden",
            }}
          >
            {/* Line numbers gutter */}
            <div className="docs-line-gutter">
              {lines.map((_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>

            {/* Textarea */}
            <textarea
              dir="auto"
              ref={editorRef}
              value={content}
              readOnly={!editable}
              onChange={(e) => handleContentChange(e.target.value)}
              placeholder={translateUI("Write markdown here... Use # for headings, - for lists, > for callouts...")}
              style={{
                flex: 1,
                padding: "16px 18px",
                border: "none",
                outline: "none",
                background: "transparent",
                color: "var(--text-primary)",
                fontFamily: "var(--font-mono)",
                fontSize: 13,
                lineHeight: "24px",
                resize: "none",
                overflowY: "auto",
                whiteSpace: "pre-wrap",
              }}
              spellCheck={false}
            />
          </div>
        )}

        {/* Live Rendered View Column */}
        {(!editable || viewMode !== "edit") && (
          <div
            className="knowledge-editor-preview"
            ref={previewScrollRef}
            onScroll={handleScroll}
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "36px clamp(24px, 5vw, 64px)",
              background: "var(--surface-deepest)",
              position: "relative",
            }}
          >
            {/* Reading progress bar */}
            <div
              style={{
                position: "sticky",
                top: -36,
                zIndex: 10,
                margin: "-36px -64px 28px",
                padding: "10px 64px",
                background: "color-mix(in srgb, var(--surface-deepest) 88%, transparent)",
                backdropFilter: "blur(12px)",
                borderBottom: "1px solid var(--border-subtle)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", fontWeight: 600 }}>{" "}<LocalizedText message={"Reading progress"} />{" "}<b style={{ color: "var(--text-primary)" }}>{readingProgress}%</b>
              </span>
              <div style={{ width: 140, height: 4, borderRadius: 2, background: "var(--surface-3)", overflow: "hidden" }}>
                <div
                  style={{
                    width: `${readingProgress}%`,
                    height: "100%",
                    background: "var(--accent-primary)",
                    transition: "width 100ms ease",
                  }}
                />
              </div>
            </div>

            <h1 style={{ fontSize: "clamp(24px, 3vw, 34px)", marginBlock: "0 16px", overflowWrap: "anywhere" }}>{title}</h1>
            {page.excerpt && <p style={{ color: "var(--text-secondary)" }}>{page.excerpt}</p>}
            <MarkdownPreview value={content} empty={translateUI("This draft has no content yet.")} />

          </div>
        )}
      </div>
      </>}
    </div>
  );
}
