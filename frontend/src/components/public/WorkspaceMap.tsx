"use client";

import { useState } from "react";
import {
  ArrowRight,
  BookOpenText,
  Bot,
  Calendar,
  Check,
  CheckCircle2,
  Clock3,
  Flame,
  FolderKanban,
  MessageSquare,
  MessageSquareText,
  Play,
  Plus,
  Radio,
  Send,
  Share2,
  Sparkles,
  UsersRound,
} from "lucide-react";

type TabKey = "docs" | "board" | "timeline" | "chat";

export function WorkspaceMap() {
  const [activeTab, setActiveTab] = useState<TabKey>("board");

  // Interactive Checklist in Docs Tab
  const [docChecks, setDocChecks] = useState<Record<string, boolean>>({
    arch: true,
    auth: true,
    s3: true,
    deploy: false,
  });

  // Interactive Tasks in Board Tab
  const [tasks, setTasks] = useState([
    { id: "1", title: "API Backplane & Redis Stream", col: "progress", priority: "High", team: "Core" },
    { id: "2", title: "CloudFront CDN + S3 Invalidation", col: "progress", priority: "Urgent", team: "DevOps" },
    { id: "3", title: "Design System 2.0 Tokens", col: "done", priority: "Medium", team: "Frontend" },
    { id: "4", title: "Realtime WebSocket Mentions", col: "todo", priority: "High", team: "Collaboration" },
  ]);

  // Interactive Chat State
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState([
    { id: "1", sender: "Alex (Tech Lead)", text: "Team, the new CI/CD workflow is validated on staging! 🚀", isAi: false, time: "10:41 AM" },
    { id: "2", sender: "Platform Copilot", text: "✅ 3 migrations executed. Database health 100%. Ready for release tagging.", isAi: true, time: "10:42 AM" },
  ]);

  const toggleCheck = (key: string) => {
    setDocChecks((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const cycleTaskCol = (id: string) => {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const nextCol = t.col === "todo" ? "progress" : t.col === "progress" ? "done" : "todo";
        return { ...t, col: nextCol };
      })
    );
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const userMsg = {
      id: String(Date.now()),
      sender: "You",
      text: chatInput.trim(),
      isAi: false,
      time: "Just now",
    };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput("");

    // Simulated AI response
    setTimeout(() => {
      setChatMessages((prev) => [
        ...prev,
        {
          id: String(Date.now() + 1),
          sender: "Platform Copilot",
          text: `Got it! Task item updated and linked to document reference.`,
          isAi: true,
          time: "Just now",
        },
      ]);
    }, 600);
  };

  return (
    <div className="workspace-hero-showcase" aria-label="Interactive Workspace Preview">
      {/* Top Window Header */}
      <div className="hero-showcase-bar">
        <div className="hero-showcase-dots">
          <span className="window-dot dot-red" />
          <span className="window-dot dot-yellow" />
          <span className="window-dot dot-green" />
        </div>

        {/* Interactive Tabs */}
        <div className="hero-showcase-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "board"}
            className={`hero-tab-btn ${activeTab === "board" ? "active" : ""}`}
            onClick={() => setActiveTab("board")}
          >
            <FolderKanban size={13} />
            <span>Execution Board</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "docs"}
            className={`hero-tab-btn ${activeTab === "docs" ? "active" : ""}`}
            onClick={() => setActiveTab("docs")}
          >
            <BookOpenText size={13} />
            <span>Knowledge Hub</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "timeline"}
            className={`hero-tab-btn ${activeTab === "timeline" ? "active" : ""}`}
            onClick={() => setActiveTab("timeline")}
          >
            <Calendar size={13} />
            <span>Roadmap</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "chat"}
            className={`hero-tab-btn ${activeTab === "chat" ? "active" : ""}`}
            onClick={() => setActiveTab("chat")}
          >
            <Sparkles size={13} />
            <span>AI Copilot & Chat</span>
          </button>
        </div>

        <div className="hero-showcase-status">
          <span className="live-pulsing-dot" />
          <span className="hero-live-text">Live Sync</span>
        </div>
      </div>

      {/* Main Interactive Stage */}
      <div className="hero-showcase-viewport">
        {/* TAB 1: BOARD */}
        {activeTab === "board" && (
          <div className="hero-board-view animate-fade-in">
            <div className="hero-view-top">
              <div>
                <div className="hero-view-kicker">Sprint 14 · Active Delivery</div>
                <div className="hero-view-heading">Platform Infrastructure & Launch</div>
              </div>
              <span className="hero-badge-pill">
                <Flame size={12} /> 85% Velocity
              </span>
            </div>

            <div className="hero-kanban-cols">
              {/* Col: Todo */}
              <div className="hero-kanban-col">
                <div className="hero-col-title">
                  <span>To Do</span>
                  <small>{tasks.filter((t) => t.col === "todo").length}</small>
                </div>
                {tasks
                  .filter((t) => t.col === "todo")
                  .map((task) => (
                    <div
                      key={task.id}
                      className="hero-task-card"
                      onClick={() => cycleTaskCol(task.id)}
                      title="Click to advance status"
                    >
                      <div className="hero-task-badge">{task.team}</div>
                      <div className="hero-task-name">{task.title}</div>
                      <div className="hero-task-meta">
                        <span className={`priority-tag ${task.priority.toLowerCase()}`}>{task.priority}</span>
                        <span className="click-advance-hint">Click → In Progress</span>
                      </div>
                    </div>
                  ))}
              </div>

              {/* Col: In Progress */}
              <div className="hero-kanban-col in-progress">
                <div className="hero-col-title">
                  <span>In Progress</span>
                  <small>{tasks.filter((t) => t.col === "progress").length}</small>
                </div>
                {tasks
                  .filter((t) => t.col === "progress")
                  .map((task) => (
                    <div
                      key={task.id}
                      className="hero-task-card active-card"
                      onClick={() => cycleTaskCol(task.id)}
                      title="Click to advance status"
                    >
                      <div className="hero-task-badge">{task.team}</div>
                      <div className="hero-task-name">{task.title}</div>
                      <div className="hero-task-meta">
                        <span className={`priority-tag ${task.priority.toLowerCase()}`}>{task.priority}</span>
                        <span className="click-advance-hint">Click → Done</span>
                      </div>
                    </div>
                  ))}
              </div>

              {/* Col: Done */}
              <div className="hero-kanban-col done">
                <div className="hero-col-title">
                  <span>Done</span>
                  <small>{tasks.filter((t) => t.col === "done").length}</small>
                </div>
                {tasks
                  .filter((t) => t.col === "done")
                  .map((task) => (
                    <div
                      key={task.id}
                      className="hero-task-card done-card"
                      onClick={() => cycleTaskCol(task.id)}
                      title="Click to reset"
                    >
                      <div className="hero-task-badge">{task.team}</div>
                      <div className="hero-task-name">
                        <CheckCircle2 size={13} className="hero-done-icon" />
                        {task.title}
                      </div>
                      <div className="hero-task-meta">
                        <span className="priority-tag done">Resolved</span>
                        <span className="click-advance-hint">Click to reset</span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: DOCS */}
        {activeTab === "docs" && (
          <div className="hero-doc-view animate-fade-in">
            <div className="hero-doc-header">
              <div className="hero-doc-icon-wrapper">
                <BookOpenText size={18} />
              </div>
              <div className="hero-doc-title-block">
                <span className="hero-doc-crumbs">Knowledge / Engineering / Launch Specs</span>
                <h3>Production Readiness & Deployment Standard</h3>
              </div>
              <div className="hero-doc-presence">
                <span className="avatar-chip dot-online">MB</span>
                <span className="avatar-chip">HA</span>
                <span className="avatar-chip">+3</span>
              </div>
            </div>

            <div className="hero-doc-body">
              <p className="hero-doc-lead">
                This specification outlines the decoupled S3/CloudFront and EC2 containerized stack for Project Management Platform ecosystem apps.
              </p>

              <div className="hero-interactive-checklist">
                <div className="checklist-heading">Pre-flight Checklist (Click to toggle)</div>
                <label className="check-item" onClick={() => toggleCheck("arch")}>
                  <span className={`custom-checkbox ${docChecks.arch ? "checked" : ""}`}>
                    {docChecks.arch && <Check size={12} />}
                  </span>
                  <span className={docChecks.arch ? "line-done" : ""}>Decoupled S3 static asset delivery with CloudFront TLS</span>
                </label>
                <label className="check-item" onClick={() => toggleCheck("auth")}>
                  <span className={`custom-checkbox ${docChecks.auth ? "checked" : ""}`}>
                    {docChecks.auth && <Check size={12} />}
                  </span>
                  <span className={docChecks.auth ? "line-done" : ""}>Dual JWT access/refresh token rotation & RBAC matrix</span>
                </label>
                <label className="check-item" onClick={() => toggleCheck("s3")}>
                  <span className={`custom-checkbox ${docChecks.s3 ? "checked" : ""}`}>
                    {docChecks.s3 && <Check size={12} />}
                  </span>
                  <span className={docChecks.s3 ? "line-done" : ""}>Asset bucket integration: project-managment-assests</span>
                </label>
                <label className="check-item" onClick={() => toggleCheck("deploy")}>
                  <span className={`custom-checkbox ${docChecks.deploy ? "checked" : ""}`}>
                    {docChecks.deploy && <Check size={12} />}
                  </span>
                  <span className={docChecks.deploy ? "line-done" : ""}>Release dispatch to production EC2 target</span>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: TIMELINE */}
        {activeTab === "timeline" && (
          <div className="hero-timeline-view animate-fade-in">
            <div className="hero-view-top">
              <div>
                <div className="hero-view-kicker">Quarterly Roadmap</div>
                <div className="hero-view-heading">Engineering Milestones & Delivery</div>
              </div>
              <span className="hero-badge-pill">On Schedule</span>
            </div>

            <div className="hero-gantt-bars">
              <div className="gantt-row">
                <div className="gantt-label">Sprint 1: Architecture & RBAC</div>
                <div className="gantt-track">
                  <div className="gantt-fill fill-100" style={{ width: "100%" }}>
                    <span>100% Completed</span>
                  </div>
                </div>
              </div>
              <div className="gantt-row">
                <div className="gantt-label">Sprint 2: Realtime WebSocket Bus</div>
                <div className="gantt-track">
                  <div className="gantt-fill fill-80" style={{ width: "85%" }}>
                    <span>85% In Progress</span>
                  </div>
                </div>
              </div>
              <div className="gantt-row">
                <div className="gantt-label">Sprint 3: S3/CloudFront & CI/CD</div>
                <div className="gantt-track">
                  <div className="gantt-fill fill-90" style={{ width: "90%" }}>
                    <span>90% Staging Testing</span>
                  </div>
                </div>
              </div>
              <div className="gantt-row">
                <div className="gantt-label">Sprint 4: Global Production Launch</div>
                <div className="gantt-track">
                  <div className="gantt-fill fill-30" style={{ width: "35%" }}>
                    <span>Scheduled Next</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: CHAT & AI */}
        {activeTab === "chat" && (
          <div className="hero-chat-view animate-fade-in">
            <div className="hero-chat-messages">
              {chatMessages.map((msg) => (
                <div key={msg.id} className={`hero-chat-bubble ${msg.isAi ? "ai-bubble" : "user-bubble"}`}>
                  <div className="bubble-header">
                    <span className="sender-name">
                      {msg.isAi && <Sparkles size={11} className="ai-sparkle" />} {msg.sender}
                    </span>
                    <span className="msg-time">{msg.time}</span>
                  </div>
                  <div className="bubble-text">{msg.text}</div>
                </div>
              ))}
            </div>

            <form onSubmit={handleSendChat} className="hero-chat-input-bar">
              <input
                type="text"
                placeholder="Ask Platform Copilot or send a team message…"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
              />
              <button type="submit" aria-label="Send message">
                <Send size={14} />
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Showcase Bottom Status Footer */}
      <div className="hero-showcase-foot">
        <div className="foot-metric">
          <span className="metric-label">Latency</span>
          <span className="metric-val">&lt; 14ms</span>
        </div>
        <div className="foot-metric">
          <span className="metric-label">Knowledge Sync</span>
          <span className="metric-val">Continuous</span>
        </div>
        <div className="foot-metric">
          <span className="metric-label">Security</span>
          <span className="metric-val">Enterprise RBAC & Audit</span>
        </div>
        <div className="foot-interactive-tip">
          <span>✨ Click any tab or task card to interact live</span>
        </div>
      </div>
    </div>
  );
}
