"use client";

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
import { MarkdownPreview } from "@/components/ds";
import { useKnowledgeWorkspace } from "@/lib/stores/knowledgeWorkspaceStore";

interface Props {
  pageId: string;
}

export function MarkdownWorkspaceEditor({ pageId }: Props) {
  const client = useQueryClient();
  const { openTab } = useKnowledgeWorkspace();

  const { data: page, isLoading } = useQuery({
    queryKey: ["doc-page", pageId],
    queryFn: () => getDocPage(pageId),
    enabled: Boolean(pageId),
  });

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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 18px",
          height: 48,
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
              onClick={() => { setActiveTab("edit"); setViewMode("split"); }}
              className={`docs-toolbar-btn ${activeTab === "edit" ? "is-active" : ""}`}
              style={{ padding: "4px 12px", height: 26, fontSize: 12, borderRadius: "var(--radius-1)" }}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab("preview"); setViewMode("rendered"); }}
              className={`docs-toolbar-btn ${activeTab === "preview" ? "is-active" : ""}`}
              style={{ padding: "4px 12px", height: 26, fontSize: 12, borderRadius: "var(--radius-1)" }}
            >
              Preview
            </button>
          </div>

          <button
            type="button"
            onClick={() => setActiveTab("comments")}
            className={`docs-toolbar-btn ${activeTab === "comments" ? "is-active" : ""}`}
            style={{ gap: 5, padding: "4px 10px", height: 30 }}
          >
            <MessageSquare size={13} />
            <span>Comments</span>
            <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: "10px", background: "var(--accent-primary-soft)", color: "var(--accent-primary)", fontWeight: 700 }}>
              {comments.length || 3}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("history")}
            className={`docs-toolbar-btn ${activeTab === "history" ? "is-active" : ""}`}
            style={{ gap: 5, padding: "4px 10px", height: 30 }}
          >
            <History size={13} />
            <span>History</span>
          </button>
        </div>

        {/* Right controls: Save status, Draft, Rendered/Split toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-tertiary)" }}>
            {saveStatus === "saved" && (
              <>
                <Check size={13} style={{ color: "var(--status-completed)" }} />
                <span>Saved 2m ago</span>
              </>
            )}
            {saveStatus === "saving" && (
              <>
                <Loader2 size={13} className="animate-spin" style={{ color: "var(--accent-primary)" }} />
                <span>Saving…</span>
              </>
            )}
            {saveStatus === "unsaved" && (
              <span style={{ color: "var(--status-delayed)" }}>Unsaved changes</span>
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
            >
              Rendered
            </button>
            <button
              type="button"
              onClick={() => setViewMode("split")}
              className={`docs-toolbar-btn ${viewMode === "split" ? "is-active" : ""}`}
              style={{ padding: "4px 10px", height: 26, fontSize: 11.5 }}
            >
              Split
            </button>
          </div>

          <button
            type="button"
            onClick={() => setViewMode(viewMode === "rendered" ? "split" : "rendered")}
            className="pmp-icon-btn"
            title="Toggle fullscreen / split"
            style={{ width: 30, height: 30, borderRadius: "var(--radius-1)", border: "1px solid var(--border-subtle)", background: "var(--surface-2)" }}
          >
            <Maximize2 size={13} />
          </button>
        </div>
      </div>

      {/* Formatting Toolbar (Only shown in edit/split mode) */}
      {viewMode !== "rendered" && (
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
              <option value="p">Paragraph</option>
              <option value="h1">Heading 1</option>
              <option value="h2">Heading 2</option>
              <option value="h3">Heading 3</option>
              <option value="code">Code Block</option>
              <option value="quote">Quote</option>
            </select>
          </div>

          <div style={{ width: 1, height: 16, background: "var(--border-subtle)", margin: "0 4px" }} />

          <button type="button" onClick={() => insertFormat("**", "**")} className="docs-toolbar-btn" title="Bold (⌘B)">
            <Bold size={13} />
          </button>
          <button type="button" onClick={() => insertFormat("*", "*")} className="docs-toolbar-btn" title="Italic (⌘I)">
            <Italic size={13} />
          </button>
          <button type="button" onClick={() => insertFormat("~~", "~~")} className="docs-toolbar-btn" title="Strikethrough">
            <Strikethrough size={13} />
          </button>
          <button type="button" onClick={() => insertFormat("[", "](https://)")} className="docs-toolbar-btn" title="Insert Link">
            <LinkIcon size={13} />
          </button>

          <div style={{ width: 1, height: 16, background: "var(--border-subtle)", margin: "0 4px" }} />

          <button type="button" onClick={() => insertFormat("- ")} className="docs-toolbar-btn" title="Bullet List">
            <List size={13} />
          </button>
          <button type="button" onClick={() => insertFormat("1. ")} className="docs-toolbar-btn" title="Numbered List">
            <ListOrdered size={13} />
          </button>
          <button type="button" onClick={() => insertFormat("`", "`")} className="docs-toolbar-btn" title="Inline Code">
            <Code size={13} />
          </button>
          <button type="button" onClick={() => insertFormat("> ")} className="docs-toolbar-btn" title="Quote Block">
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
            <span style={{ fontWeight: 700 }}>AI</span>
          </button>
        </div>
      )}

      {/* Main Workspace Area (Split or Full) */}
      <div style={{ flex: 1, display: "flex", minHeight: 0, position: "relative" }}>
        {/* Editor Column (Monospace Markdown with Line Numbers) */}
        {viewMode !== "rendered" && (
          <div
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
              ref={editorRef}
              value={content}
              onChange={(e) => handleContentChange(e.target.value)}
              placeholder="Write markdown here... Use # for headings, - for lists, > for callouts..."
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
        {viewMode !== "edit" && (
          <div
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
              <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", fontWeight: 600 }}>
                Reading progress <b style={{ color: "var(--text-primary)" }}>{readingProgress}%</b>
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

            {/* Document Header */}
            <div style={{ marginBottom: 28 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <span
                  style={{
                    padding: "3px 10px",
                    borderRadius: "var(--radius-full)",
                    background: "rgba(37, 99, 255, 0.12)",
                    color: "var(--accent-primary)",
                    fontSize: 11.5,
                    fontWeight: 700,
                    letterSpacing: "0.02em",
                  }}
                >
                  Getting Started
                </span>
                <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>•</span>
                <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>5 min read</span>
                <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>•</span>
                <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Last updated 2m ago</span>
              </div>

              <h1
                style={{
                  fontSize: "clamp(26px, 3.2vw, 36px)",
                  fontWeight: 800,
                  letterSpacing: "-0.03em",
                  color: "var(--text-primary)",
                  margin: "0 0 12px",
                  lineHeight: 1.2,
                }}
              >
                {title || "Signing In & Profile Management"}
              </h1>

              <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>
                Learn how to sign in to NexFellas using your corporate email, configure your profile, and manage your account settings.
              </p>
            </div>

            {/* Blue Info Callout */}
            <div className="docs-callout docs-callout-info">
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: "var(--accent-primary)",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  marginTop: 2,
                }}
              >
                <Info size={16} />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>
                  Use your corporate email
                </div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                  NexFellas uses your company’s identity provider (SSO) to keep your account secure and simplify access across all tools.
                </div>
              </div>
            </div>

            {/* Section 1: Authentication & Security */}
            <div style={{ marginTop: 36, marginBottom: 28 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <span className="docs-step-large">1</span>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
                  Authentication & Security
                </h2>
              </div>
              <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                NexFellas uses your company’s{" "}
                <span
                  className="docs-comment-highlight"
                  onClick={() => setSelectedHighlightComment("c1")}
                >
                  identity provider (SSO) to keep your account secure
                  <span className="docs-author-pill" style={{ background: "#3B82F6" }}>
                    Mike Chen
                  </span>
                </span>{" "}
                and simplify access across all tools.
              </p>

              {/* In-line AI Suggestion Popover (Image 5 style) */}
              {showAiSuggestion && (
                <div
                  style={{
                    margin: "14px 0",
                    padding: "12px 16px",
                    borderRadius: "var(--radius-2)",
                    background: "var(--surface-1)",
                    border: "1px solid rgba(37, 99, 255, 0.35)",
                    boxShadow: "0 12px 28px rgba(0,0,0,0.25)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 16,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <Sparkles size={16} style={{ color: "var(--accent-primary)", flexShrink: 0 }} />
                    <span style={{ fontSize: 12.5, color: "var(--text-primary)" }}>
                      <b>Suggested improvement:</b> Use more specific language for clarity.
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => setShowAiSuggestion(false)}
                      style={{
                        padding: "5px 12px",
                        borderRadius: "var(--radius-1)",
                        background: "var(--accent-primary)",
                        color: "#fff",
                        fontSize: 12,
                        fontWeight: 700,
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      ✓ Accept
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAiSuggestion(false)}
                      style={{
                        padding: "5px 10px",
                        borderRadius: "var(--radius-1)",
                        background: "transparent",
                        color: "var(--text-secondary)",
                        fontSize: 12,
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Section 2: Sign in to NexFellas */}
            <div style={{ marginTop: 32, marginBottom: 28 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <span className="docs-step-large">2</span>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
                  Sign in to NexFellas
                </h2>
              </div>
              <div style={{ display: "grid", gap: 12, paddingLeft: 6 }}>
                {[
                  "Go to the NexFellas sign in page.",
                  "Enter your registered corporate email address.",
                  "Follow the prompts to complete authentication.",
                  "You’ll be redirected to your workspace.",
                ].map((step, idx) => (
                  <div key={idx} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span className="docs-step-badge">{idx + 1}</span>
                    <span style={{ fontSize: 13.5, color: "var(--text-secondary)" }}>{step}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Section 3: Theme Preferences */}
            <div style={{ marginTop: 32, marginBottom: 28 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <span className="docs-step-large">3</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Monitor size={18} style={{ color: "var(--text-secondary)" }} />
                  <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
                    Theme Preferences
                  </h2>
                </div>
              </div>
              <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                You can switch between{" "}
                <span
                  className="docs-comment-highlight"
                  onClick={() => setSelectedHighlightComment("c2")}
                >
                  Light and Dark mode in Settings
                  <span className="docs-author-pill" style={{ background: "#8B5CF6" }}>
                    Priya Shah
                  </span>
                </span>{" "}
                to match your preference.
              </p>

              {/* Settings Action Callout */}
              <div className="docs-callout-settings">
                <Settings size={18} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                  Go to <b>Settings → Appearance</b> to update your theme preference at any time.
                </span>
              </div>
            </div>

            {/* Section 4: Password Management */}
            <div style={{ marginTop: 32, marginBottom: 28 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <span className="docs-step-large">4</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Lock size={18} style={{ color: "var(--text-secondary)" }} />
                  <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
                    Password Management
                  </h2>
                </div>
              </div>
              <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                Update your password under <b>Settings → Security</b> (signs out active sessions).
              </p>
            </div>

            {/* Section 5: Admin Password Reset */}
            <div style={{ marginTop: 32, marginBottom: 28 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <span className="docs-step-large">5</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Users size={18} style={{ color: "var(--text-secondary)" }} />
                  <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
                    Admin Password Reset
                  </h2>
                </div>
              </div>
              <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                If you’re an administrator, you can reset a user’s password directly from the Admin portal.
              </p>
            </div>

            {/* Green Success Callout */}
            <div className="docs-callout docs-callout-success">
              <CheckCircle2 size={18} style={{ color: "var(--status-completed)", flexShrink: 0, marginTop: 2 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 2 }}>
                  All set!
                </div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                  Once you’re signed in, you can customize your profile, configure integrations, and invite team members.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
