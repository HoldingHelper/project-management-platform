import { LocalizedText } from "@/lib/i18n/I18nProvider";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpenText, CalendarDays, CheckCircle2, FolderKanban, Search, ShieldCheck, UsersRound, Zap } from "lucide-react";
import { PublicShell } from "@/components/public/PublicShell";
import { WorkspaceMap } from "@/components/public/WorkspaceMap";

export const metadata: Metadata = {
  title: "Project Management Platform · Tasks, Docs & Projects",
  description: "A connected workspace for project delivery, team knowledge, and day-to-day collaboration.",
};

const principles = [
  { icon: CheckCircle2, title: "Clarity", copy: "Turn ideas into a shared path forward." },
  { icon: Zap, title: "Momentum", copy: "Keep decisions and delivery moving in one flow." },
  { icon: UsersRound, title: "Collaboration", copy: "Work together across teams and time zones." },
  { icon: BookOpenText, title: "Structure", copy: "Keep knowledge connected to the work it shapes." },
  { icon: ShieldCheck, title: "Trust", copy: "Protect work with explicit roles and permissions." },
];

const capabilities = [
  { icon: FolderKanban, eyebrow: "Projects & tasks", title: "Plan the work. See what moves next.", copy: "Shape projects, run sprints, manage dependencies, and keep every handoff visible from one delivery surface.", href: "/product" },
  { icon: BookOpenText, eyebrow: "Docs & knowledge", title: "Keep context in the workstream.", copy: "Create durable team knowledge, connect it to execution, and find the right answer without changing tools.", href: "/docs" },
  { icon: UsersRound, eyebrow: "Team & collaboration", title: "Bring people, plans, and decisions together.", copy: "Coordinate in real time with shared conversations, presence, meetings, and a clear record of what changed.", href: "/features" },
];

export default function LandingPage() {
  return (
    <PublicShell>
      <header id="top" className="pp-hero">
        <div className="pp-orbit" aria-hidden="true"><i /><i /><i /></div>
        <div className="public-container pp-hero-grid">
          <div className="pp-hero-copy">
            <p className="pp-kicker"><LocalizedText message={"Tasks · Docs · Projects"} /></p>
            <h1><LocalizedText message={"Engineering that carries"} />{" "}<span><LocalizedText message={"weight, memory"} /></span>{" "}<LocalizedText message={"and momentum."} /></h1>
            <p className="pp-hero-lead"><LocalizedText message={"Project Management Platform gives modern teams one clear place to turn plans and knowledge into measurable progress."} /></p>
            <div className="pp-hero-actions">
              <Link href="/app" className="pp-button pp-button-primary"><LocalizedText message={"Open your workspace"} />{" "}<ArrowRight size={17} /></Link>
              <Link href="/docs" className="pp-button pp-button-secondary"><LocalizedText message={"Explore documentation"} /></Link>
            </div>
          </div>
          <aside className="pp-hero-note" aria-label="Platform promise">
            <span><LocalizedText message={"A more productive tomorrow, together."} /></span>
            <p><LocalizedText message={"People"} /><br /><LocalizedText message={"Ideas"} /><br /><LocalizedText message={"Work"} /><br /><b><LocalizedText message={"A clearer way forward"} /></b></p>
          </aside>
        </div>

        <div className="public-container pp-principles" aria-label="Product principles">
          {principles.map(({ icon: Icon, title, copy }) => (
            <article key={title}><span><Icon size={21} /></span><h2>{title}</h2><p>{copy}</p></article>
          ))}
        </div>

        <div className="public-container pp-workspace-frame">
          <div className="pp-frame-label"><span><LocalizedText message={"Live workspace"} /></span><small><LocalizedText message={"Knowledge and execution, connected"} /></small></div>
          <WorkspaceMap />
        </div>
      </header>

      <section id="method" className="pp-statement">
        <div className="public-container pp-statement-grid">
          <p className="pp-kicker"><LocalizedText message={"One operating system"} /></p>
          <h2><LocalizedText message={"Work keeps its context."} /><br /><span><LocalizedText message={"Teams keep their momentum."} /></span></h2>
          <p><LocalizedText message={"Project tools usually show what is happening. Knowledge tools explain why. Project Platform keeps both sides close enough to strengthen every decision."} /></p>
        </div>
      </section>

      <section id="workspaces" className="pp-capabilities public-container">
        <header className="pp-section-heading"><p className="pp-kicker"><LocalizedText message={"Core workspaces"} /></p><h2><LocalizedText message={"Everything your team needs."} /><br /><span><LocalizedText message={"Nothing disconnected."} /></span></h2></header>
        <div className="pp-capability-list">
          {capabilities.map(({ icon: Icon, eyebrow, title, copy, href }, index) => (
            <article key={title}>
              <div className="pp-cap-index">0{index + 1}</div>
              <div className="pp-cap-icon"><Icon size={24} /></div>
              <div><p>{eyebrow}</p><h3>{title}</h3><span>{copy}</span></div>
              <Link href={href} aria-label={`Explore ${eyebrow}`}><ArrowRight size={20} /></Link>
            </article>
          ))}
        </div>
      </section>

      <section id="capabilities" className="pp-feature-band">
        <div className="public-container pp-feature-grid">
          <div><Search size={22} /><strong><LocalizedText message={"One search surface"} /></strong><span><LocalizedText message={"Find tasks, docs, projects, and people without remembering where they live."} /></span></div>
          <div><CalendarDays size={22} /><strong><LocalizedText message={"Shared operating rhythm"} /></strong><span><LocalizedText message={"Keep meetings, milestones, and delivery windows in the same working context."} /></span></div>
          <div><ShieldCheck size={22} /><strong><LocalizedText message={"Authority by design"} /></strong><span><LocalizedText message={"Server-enforced access protects every resource, action, and confidential space."} /></span></div>
        </div>
      </section>

      <section className="pp-final-cta">
        <div className="public-container"><p className="pp-kicker"><LocalizedText message={"Built for what is next"} /></p><h2><LocalizedText message={"Make progress,"} /><br /><span><LocalizedText message={"together."} /></span></h2><p><LocalizedText message={"Bring your plans, your knowledge, and your team into one focused workspace."} /></p><Link href="/app" className="pp-button pp-button-primary"><LocalizedText message={"Start in the workspace"} />{" "}<ArrowRight size={17} /></Link></div>
      </section>
    </PublicShell>
  );
}
