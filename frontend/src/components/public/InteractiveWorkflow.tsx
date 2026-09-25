"use client";

import { useState } from "react";
import {
  ArrowRight,
  BookOpenText,
  CheckCircle2,
  Cpu,
  FileCheck2,
  FolderKanban,
  GitPullRequest,
  Rocket,
  ShieldAlert,
  Sparkles,
  Users,
} from "lucide-react";

interface WorkflowStep {
  id: string;
  stepNumber: string;
  title: string;
  subtitle: string;
  description: string;
  role: string;
  deliverable: string;
  accentIcon: any;
  bullets: string[];
}

const STEPS: WorkflowStep[] = [
  {
    id: "plan",
    stepNumber: "01",
    title: "Clarify Outcomes & Roadmaps",
    subtitle: "Turn ambiguous objectives into concrete two-week sprint milestones",
    description:
      "Start by outlining target business goals. Use the built-in AI Project Generator to formulate hierarchical milestones, task breakdowns, and critical paths.",
    role: "Product Managers & Tech Leads",
    deliverable: "Outcome-based Project Roadmap",
    accentIcon: FolderKanban,
    bullets: [
      "AI-assisted breakdown of architectural epics into bite-sized stories",
      "Assign cross-functional owners and target quarter delivery dates",
      "Track confidence scores and milestone dependencies",
    ],
  },
  {
    id: "document",
    stepNumber: "02",
    title: "Author Living Specifications",
    subtitle: "Write once, publish with clear access boundaries",
    description:
      "Maintain all technical context, API schemas, and architectural decision records (ADRs) directly attached to your project delivery trees.",
    role: "Engineering Leads & Developers",
    deliverable: "Public & Internal Documentation Spaces",
    accentIcon: BookOpenText,
    bullets: [
      "Rich Markdown with live task status backlinks & team @mentions",
      "One-click publishing from internal drafts to public customer docs",
      "Immutable revision history with rollbacks and diff view",
    ],
  },
  {
    id: "execute",
    stepNumber: "03",
    title: "Agile Sprint Execution",
    subtitle: "Move tasks across flexible boards with real-time sync",
    description:
      "Developers pick up tasks with full Jira-like issue context: checklists, attachments, priority badges, estimated hours, and comment threads.",
    role: "Full-Stack Engineering Teams",
    deliverable: "Sprint Velocity & Completed Tasks",
    accentIcon: Sparkles,
    bullets: [
      "Jira-standard task statuses (Todo, In Progress, Review, Done)",
      "Realtime WebSocket board updates — zero page refreshes needed",
      "Instant task filtering by assignee, priority, and month",
    ],
  },
  {
    id: "collaborate",
    stepNumber: "04",
    title: "Context-Rich Collaboration",
    subtitle: "Keep discussion right where code and decisions happen",
    description:
      "Direct message team members, comment directly under task tickets with @user auto-complete, and broadcast alerts across the Redis backplane.",
    role: "Cross-Functional Squads",
    deliverable: "Decisions & Resolved Comment Threads",
    accentIcon: Users,
    bullets: [
      "Typeahead `@mention` popup with instantaneous notification delivery",
      "Dedicated DM channels and workspace team chat",
      "Live user presence indicators across all active screens",
    ],
  },
  {
    id: "deliver",
    stepNumber: "05",
    title: "Automated Deploy & Verification",
    subtitle: "CI/CD releases to high-availability infrastructure",
    description:
      "Tag releases with automatic multi-arch ECR builds, S3 asset synchronization, CloudFront cache invalidation, and zero-downtime remote compose deploys.",
    role: "DevOps & Release Engineers",
    deliverable: "Automated Production Deployments",
    accentIcon: Rocket,
    bullets: [
      "Deployment workflows configured by your team",
      "Zero-downtime database migrations on release tagging",
      "Global CDN caching with fast edge invalidation",
    ],
  },
];

export function InteractiveWorkflow() {
  const [activeStepId, setActiveStepId] = useState("plan");
  const activeStep = STEPS.find((s) => s.id === activeStepId) || STEPS[0];
  const Icon = activeStep.accentIcon;

  return (
    <section className="workflow-section" aria-labelledby="workflow-heading">
      <div className="public-container">
        <div className="public-section-heading">
          <div>
            <span className="public-kicker">Operating Rhythm</span>
            <h2 id="workflow-heading">From initial idea to verified delivery.</h2>
          </div>
          <p>
            A repeatable 5-step lifecycle that eliminates tool switching, aligns engineering with product, and protects institutional knowledge.
          </p>
        </div>

        {/* Step Navigation Pill Bar */}
        <div className="workflow-nav-bar" role="tablist">
          {STEPS.map((step) => (
            <button
              key={step.id}
              type="button"
              role="tab"
              aria-selected={activeStepId === step.id}
              className={`workflow-step-btn ${activeStepId === step.id ? "active" : ""}`}
              onClick={() => setActiveStepId(step.id)}
            >
              <span className="step-num">{step.stepNumber}</span>
              <span className="step-title">{step.title.split(" ")[0]}</span>
            </button>
          ))}
        </div>

        {/* Active Step Showcase Card */}
        <div className="workflow-display-card animate-fade-in" key={activeStep.id}>
          <div className="workflow-card-left">
            <div className="workflow-meta-pill">
              <Icon size={14} /> Step {activeStep.stepNumber} · {activeStep.role}
            </div>

            <h3>{activeStep.title}</h3>
            <p className="workflow-subtitle">{activeStep.subtitle}</p>
            <p className="workflow-desc">{activeStep.description}</p>

            <ul className="workflow-bullets">
              {activeStep.bullets.map((bullet, idx) => (
                <li key={idx}>
                  <CheckCircle2 size={16} className="bullet-check" />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>

            <div className="workflow-foot-deliverable">
              <span className="deliverable-label">Key Output:</span>
              <span className="deliverable-val">{activeStep.deliverable}</span>
            </div>
          </div>

          <div className="workflow-card-right">
            <div className="workflow-diagram-mock">
              <div className="mock-top-bar">
                <span className="mock-dot" />
                <span className="mock-dot" />
                <span className="mock-dot" />
                <span className="mock-title">{activeStep.title}</span>
              </div>

              <div className="mock-content">
                <div className="mock-badge">
                  <Icon size={24} />
                </div>
                <div className="mock-heading">{activeStep.deliverable}</div>
                <p className="mock-sub">Synchronized across Project Management Platform ecosystem</p>
                <div className="mock-status-pill">
                  <span className="pulse-green" /> Status: Verified Ready
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
