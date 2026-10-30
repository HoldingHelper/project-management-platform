"use client";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { LocalizedText } from "@/lib/i18n/I18nProvider";

import { useState } from "react";
import {
  List,
  MessageSquare,
  Link as LinkIcon,
  Sparkles,
  Info,
  ThumbsUp,
  ThumbsDown,
  ExternalLink,
  CheckCircle2,
  Clock,
  UserPlus,
  Send,
  CornerDownRight,
  FileText,
  Shield,
  Key,
  User,
  Check,
  RotateCcw,
  BookOpen,
  Hash,
  ChevronDown,
  X,
  Keyboard,
  Lightbulb,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getDocPage, listDocComments, type DocComment } from "@/lib/api/docs";
import { DocumentComments } from "../DocumentComments";
import { Avatar } from "@/components/ds";

interface Props {
  activePageId?: string;
}

type TabType = "outline" | "comments" | "backlinks" | "ai";

export function ContextInspector({ activePageId }: Props) {
  const { t: translateUI } = useI18n();

  const [activeTab, setActiveTab] = useState<TabType>("outline");
  const [helpfulFeedback, setHelpfulFeedback] = useState<boolean | null>(null);
  const [commentFilter, setCommentFilter] = useState<"all" | "unresolved" | "resolved">("all");
  const [replyText, setReplyText] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");

  const { data: page } = useQuery({
    queryKey: ["doc-page", activePageId],
    queryFn: () => (activePageId ? getDocPage(activePageId) : null),
    enabled: Boolean(activePageId),
  });

  const { data: comments = [] } = useQuery({
    queryKey: ["doc-comments", activePageId],
    queryFn: () => (activePageId ? listDocComments(activePageId) : []),
    enabled: Boolean(activePageId),
  });

  return (
    <aside
      className="pmp-sidebar"
      style={{
        width: "100%",
        flex: 1,
        minHeight: 0,
        background: "var(--surface-1)",
        borderLeft: "1px solid var(--border-subtle)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        fontSize: 12.5,
      }}
    >
      {/* Top Tabs: Outline, Comments (3), Backlinks, AI Assistant */}
      <div className="knowledge-workspace-inspector-tabs"
        style={{
          display: "flex",
          borderBottom: "1px solid var(--border-subtle)",
          background: "var(--surface-1)",
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab("outline")}
          style={{
            flex: 1,
            padding: "0 4px",
            fontSize: 12,
            fontWeight: activeTab === "outline" ? 700 : 500,
            color: activeTab === "outline" ? "var(--accent-primary)" : "var(--text-secondary)",
            background: "transparent",
            border: "none",
            borderBottom: `2px solid ${activeTab === "outline" ? "var(--accent-primary)" : "transparent"}`,
            cursor: "pointer",
            transition: "all var(--duration-fast) var(--ease-spring)",
          }}
        >{" "}<LocalizedText message={"Outline"} />{" "}</button>

        <button
          type="button"
          onClick={() => setActiveTab("comments")}
          style={{
            flex: 1,
            padding: "0 4px",
            fontSize: 12,
            fontWeight: activeTab === "comments" ? 700 : 500,
            color: activeTab === "comments" ? "var(--accent-primary)" : "var(--text-secondary)",
            background: "transparent",
            border: "none",
            borderBottom: `2px solid ${activeTab === "comments" ? "var(--accent-primary)" : "transparent"}`,
            cursor: "pointer",
            transition: "all var(--duration-fast) var(--ease-spring)",
          }}
        >{" "}<LocalizedText message={"Comments"} />{" "}<span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 8, background: "var(--accent-primary-soft)", color: "var(--accent-primary)", fontWeight: 700 }}>{comments.length}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("backlinks")}
          style={{
            flex: 1,
            padding: "0 4px",
            fontSize: 12,
            fontWeight: activeTab === "backlinks" ? 700 : 500,
            color: activeTab === "backlinks" ? "var(--accent-primary)" : "var(--text-secondary)",
            background: "transparent",
            border: "none",
            borderBottom: `2px solid ${activeTab === "backlinks" ? "var(--accent-primary)" : "transparent"}`,
            cursor: "pointer",
            transition: "all var(--duration-fast) var(--ease-spring)",
          }}
        >{" "}<LocalizedText message={"Backlinks"} />{" "}</button>

        <button
          type="button"
          onClick={() => setActiveTab("ai")}
          style={{
            flex: 1,
            padding: "0 4px",
            fontSize: 12,
            fontWeight: activeTab === "ai" ? 700 : 500,
            color: activeTab === "ai" ? "var(--accent-primary)" : "var(--text-secondary)",
            background: "transparent",
            border: "none",
            borderBottom: `2px solid ${activeTab === "ai" ? "var(--accent-primary)" : "transparent"}`,
            cursor: "pointer",
            transition: "all var(--duration-fast) var(--ease-spring)",
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Sparkles size={12} />{" "}<LocalizedText message={"AI"} />{" "}</span>
        </button>
      </div>

      {/* Tab Contents */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 14px", display: "flex", flexDirection: "column", gap: 20 }}>
        {/* ================= OUTLINE TAB ================= */}
        {activeTab === "outline" && (
          <>
            {/* Table of Contents */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-tertiary)", marginBottom: 12 }}>{" "}<LocalizedText message={"Table of Contents"} />{" "}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3, borderLeft: "2px solid var(--border-subtle)", paddingLeft: 10 }}>
                <a
                  href="#signing-in"
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: "var(--accent-primary)",
                    textDecoration: "none",
                    padding: "4px 0",
                  }}
                >{" "}<LocalizedText message={"Signing In & Profile Management"} />{" "}</a>
                <div style={{ paddingLeft: 10, display: "flex", flexDirection: "column", gap: 4 }}>
                  <a href="#authentication" style={{ fontSize: 12, color: "var(--text-secondary)", textDecoration: "none" }}>{" "}<LocalizedText message={"Authentication & Security"} />{" "}</a>
                  <a href="#sign-in" style={{ fontSize: 12, color: "var(--text-tertiary)", textDecoration: "none", paddingLeft: 8 }}>{" "}<LocalizedText message={"Sign in to NexFellas"} />{" "}</a>
                  <a href="#theme-preferences" style={{ fontSize: 12, color: "var(--text-secondary)", textDecoration: "none" }}>{" "}<LocalizedText message={"Theme Preferences"} />{" "}</a>
                  <a href="#password-management" style={{ fontSize: 12, color: "var(--text-secondary)", textDecoration: "none" }}>{" "}<LocalizedText message={"Password Management"} />{" "}</a>
                  <a href="#admin-password-reset" style={{ fontSize: 12, color: "var(--text-secondary)", textDecoration: "none" }}>{" "}<LocalizedText message={"Admin Password Reset"} />{" "}</a>
                </div>
              </div>
            </div>

            {/* Keyboard Shortcuts Card (Image 2 style) */}
            <div
              style={{
                padding: "12px 14px",
                borderRadius: "var(--radius-2)",
                background: "var(--surface-2)",
                border: "1px solid var(--border-subtle)",
                display: "grid",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>
                <Keyboard size={14} style={{ color: "var(--accent-primary)" }} />
                <span><LocalizedText message={"Keyboard shortcuts"} /></span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 11.5, color: "var(--text-secondary)" }}><LocalizedText message={"Next section"} /></span>
                <kbd style={{ padding: "2px 6px", borderRadius: 4, background: "var(--surface-3)", border: "1px solid var(--border-subtle)", fontSize: 10, fontFamily: "var(--font-mono)" }}><LocalizedText message={"J"} /></kbd>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 11.5, color: "var(--text-secondary)" }}><LocalizedText message={"Previous section"} /></span>
                <kbd style={{ padding: "2px 6px", borderRadius: 4, background: "var(--surface-3)", border: "1px solid var(--border-subtle)", fontSize: 10, fontFamily: "var(--font-mono)" }}><LocalizedText message={"K"} /></kbd>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 11.5, color: "var(--text-secondary)" }}><LocalizedText message={"Search docs"} /></span>
                <kbd style={{ padding: "2px 6px", borderRadius: 4, background: "var(--surface-3)", border: "1px solid var(--border-subtle)", fontSize: 10, fontFamily: "var(--font-mono)" }}>/</kbd>
              </div>
            </div>

            {/* Related Articles Card (Image 1 & 2) */}
            <div
              style={{
                padding: "12px 14px",
                borderRadius: "var(--radius-2)",
                background: "var(--surface-2)",
                border: "1px solid var(--border-subtle)",
                display: "grid",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>
                <BookOpen size={14} style={{ color: "var(--accent-primary)" }} />
                <span><LocalizedText message={"Related Articles"} /></span>
              </div>
              {[
                "Account Security Best Practices",
                "Managing Your Workspace Profile",
                "Two-Factor Authentication",
                "SSO Setup Guide",
              ].map((art) => (
                <div key={art} style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-secondary)", cursor: "pointer" }}>
                  <FileText size={12} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
                  <span style={{ fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{art}</span>
                </div>
              ))}
            </div>

            {/* Was this helpful? Card */}
            <div className="knowledge-helpful-card"
              style={{
                padding: "12px 14px",
                borderRadius: "var(--radius-2)",
                background: "var(--surface-2)",
                border: "1px solid var(--border-subtle)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Lightbulb size={16} style={{ color: "#F59E0B" }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}><LocalizedText message={"Was this helpful?"} /></div>
                  <div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}><LocalizedText message={"Help us improve this doc."} /></div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button
                  type="button"
                  aria-label={translateUI("This document was helpful")}
                  aria-pressed={helpfulFeedback === true}
                  onClick={() => setHelpfulFeedback(true)}
                  className="pmp-icon-btn"
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    background: helpfulFeedback === true ? "rgba(16, 185, 129, 0.18)" : "var(--surface-3)",
                    color: helpfulFeedback === true ? "var(--status-completed)" : "var(--text-secondary)",
                    border: "none",
                  }}
                >
                  <ThumbsUp size={13} />
                </button>
                <button
                  type="button"
                  aria-label={translateUI("This document was not helpful")}
                  aria-pressed={helpfulFeedback === false}
                  onClick={() => setHelpfulFeedback(false)}
                  className="pmp-icon-btn"
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    background: helpfulFeedback === false ? "rgba(239, 68, 68, 0.18)" : "var(--surface-3)",
                    color: helpfulFeedback === false ? "var(--status-blocked)" : "var(--text-secondary)",
                    border: "none",
                  }}
                >
                  <ThumbsDown size={13} />
                </button>
              </div>
            </div>
          </>
        )}

        {activeTab === "comments" && activePageId && <DocumentComments key={activePageId} pageId={activePageId} />}

        {/* ================= BACKLINKS & METADATA TAB (Image 4) ================= */}
        {activeTab === "backlinks" && (
          <>
            {/* Linked From */}
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>{" "}<LocalizedText message={"Linked from (12)"} />{" "}</div>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{" "}<LocalizedText message={"Documents that reference this page."} />{" "}</div>

              {[
                { title: "Authentication & Security", space: "Security & Compliance" },
                { title: "SSO Setup Guide", space: "Security & Compliance" },
                { title: "Two-Factor Authentication", space: "Security & Compliance" },
                { title: "Workspace Profile", space: "Projects & Workspaces" },
                { title: "Admin Password Reset", space: "Security & Compliance" },
              ].map((doc) => (
                <div
                  key={doc.title}
                  style={{
                    padding: "8px 10px",
                    borderRadius: "var(--radius-1)",
                    background: "var(--surface-2)",
                    border: "1px solid var(--border-subtle)",
                    display: "grid",
                    gap: 2,
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontWeight: 650, color: "var(--text-primary)", fontSize: 12 }}>{doc.title}</div>
                  <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{doc.space}</div>
                </div>
              ))}
            </div>

            {/* Related Concepts (8) Tags */}
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>{" "}<LocalizedText message={"Related Concepts (8)"} />{" "}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {[
                  "Authentication",
                  "SSO",
                  "Two-Factor Auth",
                  "Password Policy",
                  "User Profile",
                  "Workspace Settings",
                  "Admin Portal",
                  "Integrations",
                ].map((tag) => (
                  <span
                    key={tag}
                    style={{
                      padding: "3px 8px",
                      borderRadius: "var(--radius-full)",
                      background: "var(--surface-2)",
                      border: "1px solid var(--border-subtle)",
                      fontSize: 11,
                      color: "var(--text-secondary)",
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            {/* Document Metadata */}
            <div
              style={{
                padding: "12px 14px",
                borderRadius: "var(--radius-2)",
                background: "var(--surface-2)",
                border: "1px solid var(--border-subtle)",
                display: "grid",
                gap: 8,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>{" "}<LocalizedText message={"Document Metadata"} />{" "}</div>
              <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-secondary)" }}>
                <span style={{ color: "var(--text-tertiary)" }}><LocalizedText message={"Type"} /></span>
                <b><LocalizedText message={"Guide"} /></b>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-secondary)" }}>
                <span style={{ color: "var(--text-tertiary)" }}><LocalizedText message={"Last updated"} /></span>
                <span><LocalizedText message={"2 days ago"} /></span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-secondary)" }}>
                <span style={{ color: "var(--text-tertiary)" }}><LocalizedText message={"Owner"} /></span>
                <span><LocalizedText message={"NexFellas Team"} /></span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-secondary)" }}>
                <span style={{ color: "var(--text-tertiary)" }}><LocalizedText message={"Total views"} /></span>
                <span>1,284</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-secondary)" }}>
                <span style={{ color: "var(--text-tertiary)" }}><LocalizedText message={"Language"} /></span>
                <span><LocalizedText message={"English"} /></span>
              </div>
            </div>
          </>
        )}

        {/* ================= AI ASSISTANT TAB (Image 5) ================= */}
        {activeTab === "ai" && (
          <>
            {/* Header */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <Sparkles size={16} style={{ color: "var(--accent-primary)" }} />
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}><LocalizedText message={"NexFellas AI"} /></div>
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", lineHeight: 1.4 }}>{" "}<LocalizedText message={"Your AI writing partner for better documentation."} />{" "}</div>
            </div>

            {/* Quick Actions 2x3 Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[
                { title: "Summarize", desc: "Get a quick overview" },
                { title: "Rewrite", desc: "Improve tone or style" },
                { title: "Improve clarity", desc: "Make it easier to read" },
                { title: "Generate outline", desc: "Create a structured plan" },
                { title: "Translate", desc: "Convert to another language" },
                { title: "Extract action items", desc: "Find tasks and next steps" },
              ].map((action) => (
                <button
                  key={action.title}
                  type="button"
                  onClick={() => setAiPrompt(action.title)}
                  style={{
                    padding: "10px",
                    borderRadius: "var(--radius-2)",
                    background: "var(--surface-2)",
                    border: "1px solid var(--border-subtle)",
                    textAlign: "left",
                    cursor: "pointer",
                    transition: "all var(--duration-fast) var(--ease-spring)",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--accent-primary)")}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border-subtle)")}
                >
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-primary)", marginBottom: 2 }}>
                    {action.title}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-tertiary)", lineHeight: 1.25 }}>
                    {action.desc}
                  </div>
                </button>
              ))}
            </div>

            {/* Chat Input */}
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>{" "}<LocalizedText message={"Ask about this document"} />{" "}</div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 12px",
                  borderRadius: "var(--radius-2)",
                  background: "var(--surface-2)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <input
                  type="text"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder={translateUI("Ask a question about this document…")}
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    color: "var(--text-primary)",
                    fontSize: 12,
                  }}
                />
                <button
                  type="button"
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: "var(--radius-1)",
                    background: "var(--accent-primary)",
                    color: "#fff",
                    border: "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                  }}
                >
                  <Send size={12} />
                </button>
              </div>
            </div>

            {/* Quick Prompt Chips */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[
                "Summarize this document",
                "Make this more concise",
                "What are the key steps to sign in?",
                "Extract all action items",
                "Translate to Spanish",
              ].map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setAiPrompt(chip)}
                  style={{
                    textAlign: "left",
                    padding: "6px 10px",
                    borderRadius: "var(--radius-1)",
                    background: "transparent",
                    border: "1px solid var(--border-subtle)",
                    fontSize: 11.5,
                    color: "var(--text-secondary)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <Sparkles size={11} style={{ color: "var(--accent-primary)" }} />
                  <span>{chip}</span>
                </button>
              ))}
            </div>

            <div style={{ fontSize: 10, color: "var(--text-tertiary)", textAlign: "center", marginTop: "auto" }}>{" "}<LocalizedText message={"AI can make mistakes. Always review important information."} />{" "}</div>
          </>
        )}
      </div>
    </aside>
  );
}
