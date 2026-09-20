import type { ReactNode } from "react";
import { PlatformLogo } from "@/components/brand/PlatformLogo";

export function AccessShell({ eyebrow, title, description, children, footer }: { eyebrow?: string; title: string; description?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="pmp-access-shell">
      <section className="pmp-access-brand" aria-label="Project Management Platform">
        <PlatformLogo size={52} />
        <div>
          <div className="pmp-access-logo">Project Management <span>Platform</span></div>
          <p>Turn plans, knowledge, and team decisions into work that keeps moving.</p>
        </div>
        <div className="pmp-access-signal" aria-hidden>
          <span>Plan</span><i /><span>Deliver</span><i /><span>Improve</span>
        </div>
      </section>
      <section className="pmp-access-panel">
        <div className="pmp-access-card">
          <div className="pmp-access-mobile-brand"><PlatformLogo size={34} /><strong>Project Management <span>Platform</span></strong></div>
          {eyebrow && <div className="pmp-eyebrow">{eyebrow}</div>}
          <h1>{title}</h1>
          {description && <div className="pmp-access-description">{description}</div>}
          {children}
          {footer && <div className="pmp-access-footer">{footer}</div>}
        </div>
      </section>
    </main>
  );
}
