import type { ReactNode } from "react";

export function AccessShell({ eyebrow, title, description, children, footer }: { eyebrow?: string; title: string; description?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="pmp-access-shell">
      <section className="pmp-access-brand" aria-label="Project Management Platform">
        <div className="pmp-brand-mark" aria-hidden>H</div>
        <div>
          <div className="pmp-access-logo">Hi<span>G</span> Platform</div>
          <p>One workspace for projects, delivery, collaboration and operational clarity.</p>
        </div>
        <div className="pmp-access-signal" aria-hidden>
          <span>Plan</span><i /><span>Deliver</span><i /><span>Improve</span>
        </div>
      </section>
      <section className="pmp-access-panel">
        <div className="pmp-access-card">
          <div className="pmp-access-mobile-brand"><span className="pmp-brand-mark">H</span><strong>Hi<span>G</span></strong></div>
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
