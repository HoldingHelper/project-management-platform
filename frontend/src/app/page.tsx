import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpenText,
  CheckCircle2,
  Cpu,
  FolderKanban,
  GitBranch,
  Layers,
  Quote,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { PublicShell } from "@/components/public/PublicShell";
import { WorkspaceMap } from "@/components/public/WorkspaceMap";
import { InteractiveBento } from "@/components/public/InteractiveBento";
import { SubstanceCapabilities } from "@/components/public/SubstanceCapabilities";
import { SubstanceContactForm } from "@/components/public/SubstanceContactForm";
import { InteractiveFaq } from "@/components/public/InteractiveFaq";
import { PUBLIC_DOCS } from "@/lib/docs/content";

export const metadata: Metadata = {
  title: "Project Management Platform · Projects, Docs & Teams",
  description:
    "An open enterprise collaboration platform for projects, sprint execution, technical documentation, realtime chat, and team access management.",
};


export default function LandingPage() {
  return (
    <PublicShell>
      {/* ============ HERO (SUBSTANCE LAB PATTERN) ============ */}
      <header id="top" className="substance-hero-section relative min-h-screen overflow-hidden flex flex-col justify-between">
        {/* Floating translucent drifting bubbles */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-0" aria-hidden="true">
          <div className="drift-a absolute top-[12%] left-[8%] w-44 h-44 sm:w-64 sm:h-64 rounded-full bg-gradient-to-br from-white/20 to-white/5 backdrop-blur-md border border-white/20 shadow-[inset_0_0_60px_rgba(255,255,255,0.2)]" />
          <div className="drift-b absolute top-[28%] right-[10%] w-32 h-32 sm:w-48 sm:h-48 rounded-[40%] bg-gradient-to-tl from-[#00F562]/20 to-white/10 backdrop-blur-md border border-white/20 shadow-[inset_0_0_40px_rgba(0,245,98,0.25)]" />
          <div className="drift-c absolute top-[54%] left-[42%] w-24 h-24 sm:w-36 sm:h-36 rounded-full bg-gradient-to-b from-white/15 to-transparent backdrop-blur-[3px] border border-white/25" />
          <div className="drift-b absolute top-[8%] left-[55%] w-16 h-16 sm:w-24 sm:h-24 rounded-[45%] bg-white/10 backdrop-blur-sm border border-white/20" />
          <div className="drift-a absolute bottom-[28%] right-[24%] w-20 h-20 sm:w-28 sm:h-28 rounded-full bg-gradient-to-br from-[#00F562]/15 to-transparent backdrop-blur-sm border border-white/15" />
        </div>

        {/* Ambient Gradient Masks */}
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--public-bg)] via-[var(--public-bg)]/60 to-transparent pointer-events-none z-0" />

        {/* Hero Content */}
        <div className="relative z-10 max-w-7xl mx-auto w-full px-6 sm:px-10 pt-36 pb-16">
          <div className="max-w-3xl">
            <p className="substance-kicker mb-6">
              Digital Engineering &amp; Design Practice — Project Management Platform Ecosystem
            </p>

            <h1 className="substance-hero-title">
              Engineering that carries weight, memory
              <br />
              and <em className="font-instrument italic font-normal text-emerald-400">substance.</em>
            </h1>

            <p className="substance-hero-lead mt-6">
              One coherent workspace connecting living specifications, Jira-speed execution, real-time collaboration, and granular enterprise access.
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-5">
              <Link href="/app" className="substance-btn-primary">
                <span>Start in Workspace</span>
                <ArrowRight size={16} />
              </Link>
              <Link href="/docs" className="substance-btn-ghost">
                <span>View Documentation</span>
                <ArrowUpRight size={15} />
              </Link>
            </div>
          </div>

          {/* Embedded Interactive Substance Command Center */}
          <div className="mt-16 w-full">
            <WorkspaceMap />
          </div>
        </div>

        {/* Giant Cropped Background Wordmark */}
        <div className="substance-giant-wordmark" aria-hidden="true">
          <p>WORKSPACE</p>
        </div>
      </header>

      {/* ============ PROJECT / WORKSPACE REEL ============ */}
      <section id="workspaces" className="substance-workspaces-reel">
        <div className="public-container">
          <div className="reel-header">
            <h2>
              Selected <em className="font-instrument italic font-normal">workspaces</em>
            </h2>
            <span className="reel-years">2025 — 2026</span>
          </div>

          {/* Panel 01: Execution Engine */}
          <div className="reel-panel-card large-aspect">
            <div className="panel-overlay" />
            <div className="panel-content">
              <span className="panel-num">01</span>
              <h3>Sprint Execution Engine</h3>
              <p>Jira-standard Agile Kanban, story point tracking, one-click status transitions, and reviewer sign-offs.</p>
              <div className="panel-tags">
                <span>Kanban</span>
                <span>Agile</span>
                <span>Jira Parity</span>
              </div>
            </div>
          </div>

          {/* Panels 02 & 03: Overlapping grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 my-8">
            <div className="lg:col-span-7 reel-panel-card medium-aspect">
              <div className="panel-overlay" />
              <div className="panel-content">
                <span className="panel-num">02</span>
                <h3>Living Technical Specifications</h3>
                <p>Knowledge spaces, slash block commands, revision diffs, and real-time co-authoring.</p>
                <div className="panel-tags">
                  <span>Markdown</span>
                  <span>Spaces</span>
                  <span>Docs</span>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 reel-panel-card tall-aspect">
              <div className="panel-overlay" />
              <div className="panel-content">
                <span className="panel-num">03</span>
                <h3>Sub-14ms Real-time Collaboration</h3>
                <p>Redis WebSocket backplane powering instant presence, synchronized typing, and team chat channels.</p>
                <div className="panel-tags">
                  <span>WebSockets</span>
                  <span>Redis</span>
                  <span>Presence</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ STUDIO METHOD (#E4EFDA SAGE GREEN THEME) ============ */}
      <section id="method" className="substance-method-section">
        <div className="public-container">
          <div className="method-header">
            <p className="substance-kicker">Method</p>
            <h2>
              We give digital execution{" "}
              <em className="font-instrument italic font-normal">physical memory.</em>
            </h2>
            <p className="method-lead">
              Isolated tools forget. Unified architectures don&apos;t. Every project connects strategic roadmaps directly to durable technical context.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="method-card">
              <div className="method-card-index">A</div>
              <h3>Connected Context Systems</h3>
              <p>
                Technical specifications, decision records, and task cards live together in one database. No more stale Confluence pages.
              </p>
            </div>

            <div className="method-card">
              <div className="method-card-index">B</div>
              <h3>Real-Time Interaction Physics</h3>
              <p>
                Drag, status transitions, and collaborator presence tuned for instant tactile response with sub-14ms WebSocket latency.
              </p>
            </div>

            <div className="method-card">
              <div className="method-card-index">C</div>
              <h3>Enterprise Launch Surfaces</h3>
              <p>
                Production-grade multi-tier RBAC, audit trails, and automated GitHub CI/CD workflows ready for multi-region scale.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ============ INTERACTIVE BENTO GRID ============ */}
      <InteractiveBento />

      {/* ============ CAPABILITIES SECTION (#1E4D33 FOREST GREEN) ============ */}
      <SubstanceCapabilities />

      {/* ============ INTERACTIVE FAQ ============ */}
      <InteractiveFaq />

      {/* ============ CONTACT & BRIEF SUBMISSION ============ */}
      <section id="contact" className="substance-contact-section">
        <div className="substance-contact-wordmark" aria-hidden="true">
          <p>MAKE IT FEEL REAL</p>
        </div>

        <div className="public-container substance-contact-inner">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-14 items-start">
            <div className="lg:col-span-5">
              <p className="substance-kicker">Get Started</p>
              <h2>
                Make it
                <br />
                <em className="font-instrument italic font-normal text-emerald-400">feel real.</em>
              </h2>
              <p className="contact-lead">
                Bring an ambitious project, a complex specification, or a team that needs clear operating rhythm. Launch your workspace in seconds.
              </p>
              <Link href="/app" className="substance-btn-primary">
                <span>Launch Workspace Now</span>
                <ArrowRight size={16} />
              </Link>
            </div>

            <div className="lg:col-span-6 lg:col-start-7">
              <SubstanceContactForm />
            </div>
          </div>
        </div>
      </section>
    </PublicShell>
  );
}
