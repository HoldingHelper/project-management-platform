"use client";
import { LocalizedText } from "@/lib/i18n/I18nProvider";

import { useState } from "react";
import {
  ArrowRight,
  BookOpenText,
  Bot,
  Check,
  CheckCircle2,
  Code2,
  Cpu,
  Eye,
  FileCode2,
  FolderKanban,
  KeyRound,
  Layers,
  Lock,
  MessageSquare,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";

type RoleName = "Admin" | "Product Manager" | "Tech Lead" | "Developer" | "Guest";

const AI_TEMPLATES: Record<string, { sprints: number; tasks: number; summary: string; tags: string[] }> = {
  "Logistics Delivery Tracking": {
    sprints: 4,
    tasks: 18,
    summary: "Complete fleet tracking with driver dispatching, GPS webhooks, and push alerts.",
    tags: ["FastAPI", "Postgres", "Redis Pub/Sub", "Next.js"],
  },
  "B2B Supplier Portal": {
    sprints: 3,
    tasks: 14,
    summary: "Multi-tenant B2B ordering catalog with ERP sync, PDF quotes, and role-based permissions.",
    tags: ["Next.js App Router", "S3 Storage", "RBAC", "TypeScript"],
  },
  "Realtime Chat & Collaboration": {
    sprints: 3,
    tasks: 12,
    summary: "High-concurrency chat with presence backplane, file attachments, and mention routing.",
    tags: ["WebSocket", "AsyncPG", "MinIO / S3", "Tailwind 4"],
  },
};

const ROLES_PERMISSIONS: Record<RoleName, { read: boolean; write: boolean; admin: boolean; invite: boolean; delete: boolean }> = {
  Admin: { read: true, write: true, admin: true, invite: true, delete: true },
  "Product Manager": { read: true, write: true, admin: false, invite: true, delete: false },
  "Tech Lead": { read: true, write: true, admin: false, invite: true, delete: true },
  Developer: { read: true, write: true, admin: false, invite: false, delete: false },
  Guest: { read: true, write: false, admin: false, invite: false, delete: false },
};

export function InteractiveBento() {
  // AI Prompt State
  const [selectedPrompt, setSelectedPrompt] = useState("Logistics Delivery Tracking");
  const [isGenerating, setIsGenerating] = useState(false);

  // Markdown Toggle State
  const [mdMode, setMdMode] = useState<"write" | "preview">("preview");

  // RBAC State
  const [selectedRole, setSelectedRole] = useState<RoleName>("Tech Lead");

  const handleSelectPrompt = (prompt: string) => {
    setIsGenerating(true);
    setSelectedPrompt(prompt);
    setTimeout(() => setIsGenerating(false), 350);
  };

  const aiData = AI_TEMPLATES[selectedPrompt];
  const perms = ROLES_PERMISSIONS[selectedRole];

  return (
    <section className="bento-section" aria-labelledby="bento-heading">
      <div className="public-container">
        <div className="public-section-heading">
          <div>
            <span className="public-kicker"><LocalizedText message={"Platform Superpowers"} /></span>
            <h2 id="bento-heading"><LocalizedText message={"Architected for engineering velocity & clarity."} /></h2>
          </div>
          <p>{" "}<LocalizedText message={"Experience how modern engineering teams break down complex roadmaps, connect decisions to code, and maintain complete data governance."} />{" "}</p>
        </div>

        <div className="bento-grid">
          {/* BENTO CARD 1: AI Project Generator (Spans 2 cols) */}
          <article className="bento-card bento-hero-card">
            <div className="bento-card-header">
              <span className="bento-icon-pill">
                <Sparkles size={16} />
              </span>
              <div className="bento-title-group">
                <span className="bento-kicker"><LocalizedText message={"AI Project Generator"} /></span>
                <h3><LocalizedText message={"Turn natural outcomes into executable delivery boards"} /></h3>
              </div>
            </div>

            <p className="bento-desc">{" "}<LocalizedText message={"Describe your project outcome. Our LangGraph-powered generation worker crafts sprint roadmaps, task hierarchies, and acceptance criteria in seconds."} />{" "}</p>

            <div className="bento-interactive-box">
              <div className="bento-prompt-selector">
                <span className="prompt-label"><LocalizedText message={"Try sample prompt:"} /></span>
                <div className="prompt-chips">
                  {Object.keys(AI_TEMPLATES).map((key) => (
                    <button
                      key={key}
                      type="button"
                      className={`prompt-chip ${selectedPrompt === key ? "active" : ""}`}
                      onClick={() => handleSelectPrompt(key)}
                    >
                      {key}
                    </button>
                  ))}
                </div>
              </div>

              <div className={`bento-ai-result ${isGenerating ? "generating" : ""}`}>
                <div className="ai-result-top">
                  <span className="ai-pill-status">
                    <Bot size={13} /> {isGenerating ? <LocalizedText message={"Analyzing architecture…"} /> : <LocalizedText message={"Generated Roadmap"} />}
                  </span>
                  <div className="ai-counts">
                    <span>{aiData.sprints}{" "}<LocalizedText message={"Sprints"} /></span>
                    <span>·</span>
                    <span>{aiData.tasks}{" "}<LocalizedText message={"Tasks"} /></span>
                  </div>
                </div>

                <div className="ai-result-body">
                  <p className="ai-summary">{aiData.summary}</p>
                  <div className="ai-tags">
                    {aiData.tags.map((tag) => (
                      <span key={tag} className="tech-tag">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </article>

          {/* BENTO CARD 2: Dual Knowledge & Execution */}
          <article className="bento-card">
            <div className="bento-card-header">
              <span className="bento-icon-pill">
                <BookOpenText size={16} />
              </span>
              <div className="bento-title-group">
                <span className="bento-kicker"><LocalizedText message={"Interactive Docs"} /></span>
                <h3><LocalizedText message={"Living Specifications"} /></h3>
              </div>
            </div>

            <p className="bento-desc">{" "}<LocalizedText message={"Write rich markdown with live task mentions, embedded diagrams, and dual internal/public publishing."} />{" "}</p>

            <div className="bento-interactive-box">
              <div className="bento-md-toolbar">
                <div className="md-toggle-group">
                  <button
                    type="button"
                    className={mdMode === "write" ? "active" : ""}
                    onClick={() => setMdMode("write")}
                  >
                    <Code2 size={12} />{" "}<LocalizedText message={"Markdown"} />{" "}</button>
                  <button
                    type="button"
                    className={mdMode === "preview" ? "active" : ""}
                    onClick={() => setMdMode("preview")}
                  >
                    <Eye size={12} />{" "}<LocalizedText message={"Rendered"} />{" "}</button>
                </div>
                <span className="md-tag"><LocalizedText message={"RFC-2026.4"} /></span>
              </div>

              <div className="bento-md-content">
                {mdMode === "write" ? (
                  <pre className="md-raw-code">
                    <code>
                      {`## Architecture Decisions
- [x] Redis Pub/Sub for WebSockets
- [x] @mention real-time alerts
- [ ] Multi-region S3 file asset sync
> Reference: [API Contract](/tasks/1)`}
                    </code>
                  </pre>
                ) : (
                  <div className="md-preview-view">
                    <h4><LocalizedText message={"Architecture Decisions"} /></h4>
                    <ul className="md-preview-checklist">
                      <li className="checked">
                        <Check size={12} />{" "}<LocalizedText message={"Redis Pub/Sub for WebSockets"} />{" "}</li>
                      <li className="checked">
                        <Check size={12} />{" "}<LocalizedText message={"@mention real-time alerts"} />{" "}</li>
                      <li className="pending">
                        <span className="pending-box" />{" "}<LocalizedText message={"Multi-region S3 file asset sync"} />{" "}</li>
                    </ul>
                    <div className="md-ref-badge">
                      <FolderKanban size={12} />{" "}<LocalizedText message={"Linked to Task: API Contract"} />{" "}</div>
                  </div>
                )}
              </div>
            </div>
          </article>

          {/* BENTO CARD 3: Realtime Backplane & Presence */}
          <article className="bento-card">
            <div className="bento-card-header">
              <span className="bento-icon-pill">
                <Zap size={16} />
              </span>
              <div className="bento-title-group">
                <span className="bento-kicker"><LocalizedText message={"Sub-millisecond Sync"} /></span>
                <h3><LocalizedText message={"Realtime Presence & WebSockets"} /></h3>
              </div>
            </div>

            <p className="bento-desc">{" "}<LocalizedText message={"Every card move, comment mention, and presence update broadcasts across cluster replicas instantly via Redis backplane."} />{" "}</p>

            <div className="bento-interactive-box">
              <div className="bento-presence-demo">
                <div className="presence-active-users">
                  <div className="user-presence-card">
                    <span className="user-avatar user-green"><LocalizedText message={"MB"} /></span>
                    <div className="user-info">
                      <b><LocalizedText message={"Alex Morgan"} /></b>
                      <small><LocalizedText message={"Editing Sprint 14 Board"} /></small>
                    </div>
                    <span className="pulse-dot-green" />
                  </div>

                  <div className="user-presence-card">
                    <span className="user-avatar user-blue"><LocalizedText message={"HA"} /></span>
                    <div className="user-info">
                      <b><LocalizedText message={"Sam Taylor"} /></b>
                      <small><LocalizedText message={"Reviewing PR #42"} /></small>
                    </div>
                    <span className="pulse-dot-green" />
                  </div>

                  <div className="user-presence-card">
                    <span className="user-avatar user-purple"><LocalizedText message={"AI"} /></span>
                    <div className="user-info">
                      <b><LocalizedText message={"Platform Copilot"} /></b>
                      <small><LocalizedText message={"Running healthcheck"} /></small>
                    </div>
                    <span className="pulse-dot-green" />
                  </div>
                </div>

                <div className="presence-stats-bar">
                  <span><LocalizedText message={"⚡ Broadcast: <12ms"} /></span>
                  <span><LocalizedText message={"🔄 Reconnect: Automatic"} /></span>
                </div>
              </div>
            </div>
          </article>

          {/* BENTO CARD 4: Role-Based Access Control (RBAC) */}
          <article className="bento-card bento-hero-card">
            <div className="bento-card-header">
              <span className="bento-icon-pill">
                <ShieldCheck size={16} />
              </span>
              <div className="bento-title-group">
                <span className="bento-kicker"><LocalizedText message={"Enterprise Security"} /></span>
                <h3><LocalizedText message={"Granular Role-Based Access Matrix"} /></h3>
              </div>
            </div>

            <p className="bento-desc">{" "}<LocalizedText message={"Control permissions with precision. Assign specific roles to team members or invite external stakeholders with link-based tokens."} />{" "}</p>

            <div className="bento-interactive-box">
              <div className="bento-role-tabs">
                <span className="role-tabs-label"><LocalizedText message={"Inspect Role:"} /></span>
                <div className="role-buttons">
                  {(Object.keys(ROLES_PERMISSIONS) as RoleName[]).map((r) => (
                    <button
                      key={r}
                      type="button"
                      className={`role-btn ${selectedRole === r ? "active" : ""}`}
                      onClick={() => setSelectedRole(r)}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bento-permission-matrix">
                <div className="matrix-row">
                  <span className="perm-name"><LocalizedText message={"Read Workspaces & Docs"} /></span>
                  <span className={`perm-status ${perms.read ? "allowed" : "denied"}`}>
                    {perms.read ? <Check size={12} /> : <Lock size={12} />} {perms.read ? <LocalizedText message={"Allowed"} /> : <LocalizedText message={"Restricted"} />}
                  </span>
                </div>
                <div className="matrix-row">
                  <span className="perm-name"><LocalizedText message={"Create & Edit Tasks"} /></span>
                  <span className={`perm-status ${perms.write ? "allowed" : "denied"}`}>
                    {perms.write ? <Check size={12} /> : <Lock size={12} />} {perms.write ? <LocalizedText message={"Allowed"} /> : <LocalizedText message={"Restricted"} />}
                  </span>
                </div>
                <div className="matrix-row">
                  <span className="perm-name"><LocalizedText message={"Generate Invite Links"} /></span>
                  <span className={`perm-status ${perms.invite ? "allowed" : "denied"}`}>
                    {perms.invite ? <Check size={12} /> : <Lock size={12} />} {perms.invite ? <LocalizedText message={"Allowed"} /> : <LocalizedText message={"Restricted"} />}
                  </span>
                </div>
                <div className="matrix-row">
                  <span className="perm-name"><LocalizedText message={"Delete Resources & Projects"} /></span>
                  <span className={`perm-status ${perms.delete ? "allowed" : "denied"}`}>
                    {perms.delete ? <Check size={12} /> : <Lock size={12} />} {perms.delete ? <LocalizedText message={"Allowed"} /> : <LocalizedText message={"Restricted"} />}
                  </span>
                </div>
                <div className="matrix-row">
                  <span className="perm-name"><LocalizedText message={"Manage Workspace & System Roles"} /></span>
                  <span className={`perm-status ${perms.admin ? "allowed" : "denied"}`}>
                    {perms.admin ? <Check size={12} /> : <Lock size={12} />} {perms.admin ? <LocalizedText message={"Allowed"} /> : <LocalizedText message={"Restricted"} />}
                  </span>
                </div>
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
