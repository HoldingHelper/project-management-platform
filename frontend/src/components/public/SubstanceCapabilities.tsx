"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Sparkles } from "lucide-react";

const capabilities = [
  {
    num: "01",
    title: "Outcome & Roadmap Systems",
    desc: "Multi-tier roadmaps, portfolio milestones, and velocity tracking mapped to execution.",
    tag: "Strategy",
    badge: "Roadmap",
  },
  {
    num: "02",
    title: "Living Technical Specifications",
    desc: "Markdown documentation spaces with slash commands, version diffs, and attached tasks.",
    tag: "Knowledge",
    badge: "Living Specs",
  },
  {
    num: "03",
    title: "Jira-Standard Sprint Boards",
    desc: "Interactive Kanban columns, 1-click status transitions, story points, and reviewer assignments.",
    tag: "Execution",
    badge: "Sprint Boards",
  },
  {
    num: "04",
    title: "Sub-14ms WebSocket Telemetry",
    desc: "Real-time Redis event broadcasting, live typing indicators, and synchronized team chat.",
    tag: "Realtime",
    badge: "< 14ms Telemetry",
  },
  {
    num: "05",
    title: "Granular Enterprise RBAC",
    desc: "Strict role-based access control, cryptographic invitation links, and audited permission tiers.",
    tag: "Security",
    badge: "Zero Trust",
  },
  {
    num: "06",
    title: "AI Architecture Generator",
    desc: "Convert high-level requirements into two-week sprint milestones, tasks, and dependency trees.",
    tag: "AI Copilot",
    badge: "Gemini / AI Core",
  },
];

export function SubstanceCapabilities() {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  return (
    <section id="capabilities" className="substance-capabilities-section">
      <div className="public-container">
        <div className="capabilities-header">
          <p className="substance-kicker">Capabilities</p>
          <div className="capabilities-title-row">
            <h2>
              The full operating system for{" "}
              <em className="font-instrument italic">high-velocity engineering.</em>
            </h2>
            <span className="capabilities-count">06 Core Engines</span>
          </div>
        </div>

        <div className="capabilities-list">
          {capabilities.map((cap, idx) => (
            <Link
              key={cap.num}
              href="/app"
              className={`capability-row ${activeIdx === idx ? "is-hovered" : ""}`}
              onMouseEnter={() => setActiveIdx(idx)}
              onMouseLeave={() => setActiveIdx(null)}
            >
              <div className="capability-row-left">
                <span className="cap-num">{cap.num}</span>
                <span className="cap-title">{cap.title}</span>
              </div>
              <p className="cap-desc">{cap.desc}</p>
              <div className="capability-row-right">
                <span className="cap-badge">{cap.badge}</span>
                <span className="cap-arrow">
                  <ArrowUpRight size={18} />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
