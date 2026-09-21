"use client";

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
import { Avatar } from "@/components/ds";

interface Props {
  activePageId?: string;
}

type TabType = "outline" | "comments" | "backlinks" | "ai";

export function ContextInspector({ activePageId }: Props) {
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
        height: "100%",
        background: "var(--surface-1)",
        borderLeft: "1px solid var(--border-subtle)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        fontSize: 12.5,
      }}
    >
      {/* Top Tabs: Outline, Comments (3), Backlinks, AI Assistant */}
      <div
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
            padding: "11px 4px",
            fontSize: 12,
            fontWeight: activeTab === "outline" ? 700 : 500,
            color: activeTab === "outline" ? "var(--accent-primary)" : "var(--text-secondary)",
            background: "transparent",
            border: "none",
            borderBottom: `2px solid ${activeTab === "outline" ? "var(--accent-primary)" : "transparent"}`,
            cursor: "pointer",
            transition: "all var(--duration-fast) var(--ease-spring)",
          }}
        >
          Outline
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("comments")}
          style={{
            flex: 1,
            padding: "11px 4px",
            fontSize: 12,
            fontWeight: activeTab === "comments" ? 700 : 500,
            color: activeTab === "comments" ? "var(--accent-primary)" : "var(--text-secondary)",
            background: "transparent",
            border: "none",
            borderBottom: `2px solid ${activeTab === "comments" ? "var(--accent-primary)" : "transparent"}`,
            cursor: "pointer",
            transition: "all var(--duration-fast) var(--ease-spring)",
          }}
        >
          Comments <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 8, background: "var(--accent-primary-soft)", color: "var(--accent-primary)", fontWeight: 700 }}>3</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("backlinks")}
          style={{
            flex: 1,
            padding: "11px 4px",
            fontSize: 12,
            fontWeight: activeTab === "backlinks" ? 700 : 500,
            color: activeTab === "backlinks" ? "var(--accent-primary)" : "var(--text-secondary)",
            background: "transparent",
            border: "none",
            borderBottom: `2px solid ${activeTab === "backlinks" ? "var(--accent-primary)" : "transparent"}`,
            cursor: "pointer",
            transition: "all var(--duration-fast) var(--ease-spring)",
          }}
        >
          Backlinks
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("ai")}
          style={{
            flex: 1,
            padding: "11px 4px",
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
            <Sparkles size={12} /> AI
          </span>
        </button>
      </div>

      {/* Tab Contents */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 14px", display: "flex", flexDirection: "column", gap: 20 }}>
        {/* ================= OUTLINE TAB ================= */}
        {activeTab === "outline" && (
          <>
            {/* Table of Contents */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-tertiary)", marginBottom: 12 }}>
                Table of Contents
              </div>
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
                >
                  Signing In & Profile Management
                </a>
                <div style={{ paddingLeft: 10, display: "flex", flexDirection: "column", gap: 4 }}>
                  <a href="#authentication" style={{ fontSize: 12, color: "var(--text-secondary)", textDecoration: "none" }}>
                    Authentication & Security
                  </a>
                  <a href="#sign-in" style={{ fontSize: 12, color: "var(--text-tertiary)", textDecoration: "none", paddingLeft: 8 }}>
                    Sign in to NexFellas
                  </a>
                  <a href="#theme-preferences" style={{ fontSize: 12, color: "var(--text-secondary)", textDecoration: "none" }}>
                    Theme Preferences
                  </a>
                  <a href="#password-management" style={{ fontSize: 12, color: "var(--text-secondary)", textDecoration: "none" }}>
                    Password Management
                  </a>
                  <a href="#admin-password-reset" style={{ fontSize: 12, color: "var(--text-secondary)", textDecoration: "none" }}>
                    Admin Password Reset
                  </a>
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
                <span>Keyboard shortcuts</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>Next section</span>
                <kbd style={{ padding: "2px 6px", borderRadius: 4, background: "var(--surface-3)", border: "1px solid var(--border-subtle)", fontSize: 10, fontFamily: "var(--font-mono)" }}>J</kbd>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>Previous section</span>
                <kbd style={{ padding: "2px 6px", borderRadius: 4, background: "var(--surface-3)", border: "1px solid var(--border-subtle)", fontSize: 10, fontFamily: "var(--font-mono)" }}>K</kbd>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>Search docs</span>
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
                <span>Related Articles</span>
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
            <div
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
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>Was this helpful?</div>
                  <div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>Help us improve this doc.</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button
                  type="button"
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

        {/* ================= COMMENTS & REVIEW TAB (Image 3) ================= */}
        {activeTab === "comments" && (
          <>
            {/* Review Status Widget */}
            <div
              style={{
                padding: "14px",
                borderRadius: "var(--radius-2)",
                background: "var(--surface-2)",
                border: "1px solid var(--border-subtle)",
                display: "grid",
                gap: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>Review Status</div>
                <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "2px 8px", borderRadius: 10, background: "rgba(245, 158, 11, 0.12)", color: "#F59E0B", fontSize: 11, fontWeight: 700 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#F59E0B" }} />
                  <span>In Review</span>
                </div>
              </div>

              <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                2 of 4 approvals • Due Apr 25, 2026
              </div>

              {/* Reviewers List */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, textAlign: "center" }}>
                {[
                  { name: "Sarah Chen", initials: "SC", status: "Approved", color: "#10B981" },
                  { name: "Mike Chen", initials: "MK", status: "Pending", color: "#F59E0B" },
                  { name: "Priya Shah", initials: "PS", status: "Approved", color: "#10B981" },
                  { name: "Alex Rivera", initials: "AR", status: "Pending", color: "#F59E0B" },
                ].map((rev) => (
                  <div key={rev.name} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        background: "var(--surface-3)",
                        border: `2px solid ${rev.color}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 700,
                        fontSize: 11,
                        color: "var(--text-primary)",
                      }}
                    >
                      {rev.initials}
                    </div>
                    <span style={{ fontSize: 10, color: "var(--text-primary)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", width: "100%" }}>
                      {rev.name.split(" ")[0]}
                    </span>
                    <span style={{ fontSize: 9, color: rev.color, fontWeight: 700 }}>{rev.status}</span>
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button
                  type="button"
                  style={{
                    flex: 1,
                    padding: "6px 8px",
                    borderRadius: "var(--radius-1)",
                    background: "var(--surface-3)",
                    border: "1px solid var(--border-subtle)",
                    color: "var(--text-primary)",
                    fontSize: 11.5,
                    fontWeight: 650,
                    cursor: "pointer",
                  }}
                >
                  Request approval
                </button>
                <button
                  type="button"
                  style={{
                    flex: 1,
                    padding: "6px 8px",
                    borderRadius: "var(--radius-1)",
                    background: "var(--accent-primary)",
                    border: "none",
                    color: "#fff",
                    fontSize: 11.5,
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 4,
                    cursor: "pointer",
                  }}
                >
                  <UserPlus size={12} /> Add reviewers
                </button>
              </div>
            </div>

            {/* Comment Threads */}
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>Comments</span>
                <select
                  value={commentFilter}
                  onChange={(e) => setCommentFilter(e.target.value as any)}
                  style={{ padding: "2px 6px", borderRadius: 4, background: "var(--surface-2)", border: "1px solid var(--border-subtle)", fontSize: 11, color: "var(--text-secondary)" }}
                >
                  <option value="all">All comments</option>
                  <option value="unresolved">Unresolved (2)</option>
                  <option value="resolved">Resolved (1)</option>
                </select>
              </div>

              {[
                {
                  id: "1",
                  author: "Daniel Kim",
                  time: "2m ago",
                  text: "Should we mention SAML as well? Some enterprise customers use SAML instead of OAuth.",
                  status: "unresolved",
                  section: "# Authentication & Security",
                },
                {
                  id: "2",
                  author: "Priya Shah",
                  time: "10m ago",
                  text: "Consider linking to a short guide on choosing a theme. This could help new users.",
                  status: "unresolved",
                  section: "# Theme Preferences",
                },
                {
                  id: "3",
                  author: "Alex Rivera",
                  time: "1h ago",
                  text: "Let's simplify this wording for clarity.",
                  status: "resolved",
                  section: "# Sign in to NexFellas",
                },
              ].map((c) => (
                <div
                  key={c.id}
                  style={{
                    padding: "10px 12px",
                    borderRadius: "var(--radius-2)",
                    background: "var(--surface-2)",
                    border: "1px solid var(--border-subtle)",
                    display: "grid",
                    gap: 6,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{c.author}</span>
                      <span style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>{c.time}</span>
                    </div>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: c.status === "resolved" ? "var(--status-completed)" : "var(--accent-primary)",
                      }}
                    >
                      ● {c.status === "resolved" ? "Resolved" : "Unresolved"}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.45 }}>{c.text}</p>
                  <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{c.section}</div>
                </div>
              ))}
            </div>

            {/* Suggested Edits Card (Image 3) */}
            <div
              style={{
                padding: "12px 14px",
                borderRadius: "var(--radius-2)",
                background: "var(--surface-2)",
                border: "1px solid var(--border-subtle)",
                display: "grid",
                gap: 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>Suggested edits</span>
                <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 8, background: "var(--accent-primary-soft)", color: "var(--accent-primary)", fontWeight: 700 }}>2</span>
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>
                  Replace &quot;company&apos;s&quot; with &quot;organization&apos;s&quot;
                </span>
                <button
                  type="button"
                  style={{
                    padding: "3px 8px",
                    borderRadius: 4,
                    background: "var(--accent-primary)",
                    border: "none",
                    color: "#fff",
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Apply
                </button>
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>
                  Add link to theme guide
                </span>
                <button
                  type="button"
                  style={{
                    padding: "3px 8px",
                    borderRadius: 4,
                    background: "var(--accent-primary)",
                    border: "none",
                    color: "#fff",
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Apply
                </button>
              </div>
            </div>
          </>
        )}

        {/* ================= BACKLINKS & METADATA TAB (Image 4) ================= */}
        {activeTab === "backlinks" && (
          <>
            {/* Linked From */}
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>
                Linked from (12)
              </div>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                Documents that reference this page.
              </div>

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
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>
                Related Concepts (8)
              </div>
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
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>
                Document Metadata
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-secondary)" }}>
                <span style={{ color: "var(--text-tertiary)" }}>Type</span>
                <b>Guide</b>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-secondary)" }}>
                <span style={{ color: "var(--text-tertiary)" }}>Last updated</span>
                <span>2 days ago</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-secondary)" }}>
                <span style={{ color: "var(--text-tertiary)" }}>Owner</span>
                <span>NexFellas Team</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-secondary)" }}>
                <span style={{ color: "var(--text-tertiary)" }}>Total views</span>
                <span>1,284</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-secondary)" }}>
                <span style={{ color: "var(--text-tertiary)" }}>Language</span>
                <span>English</span>
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
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>NexFellas AI</div>
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", lineHeight: 1.4 }}>
                Your AI writing partner for better documentation.
              </div>
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
              <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>
                Ask about this document
              </div>
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
                  placeholder="Ask a question about this document…"
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

            <div style={{ fontSize: 10, color: "var(--text-tertiary)", textAlign: "center", marginTop: "auto" }}>
              AI can make mistakes. Always review important information.
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
