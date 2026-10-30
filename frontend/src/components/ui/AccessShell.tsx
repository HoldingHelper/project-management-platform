"use client";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { LocalizedText } from "@/lib/i18n/I18nProvider";
import type { ReactNode } from "react";
import { PlatformLogo } from "@/components/brand/PlatformLogo";

export function AccessShell({ eyebrow, title, description, children, footer }: { eyebrow?: string; title: string; description?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  const { t: translateUI } = useI18n();

  return (
    <main className="pmp-access-shell">
      <section className="pmp-access-brand" aria-label={translateUI("Project Management Platform")}>
        <PlatformLogo size={52} />
        <div>
          <div className="pmp-access-logo"><LocalizedText message={"Project Management"} />{" "}<span><LocalizedText message={"Platform"} /></span></div>
          <p><LocalizedText message={"Turn plans, knowledge, and team decisions into work that keeps moving."} /></p>
        </div>
        <div className="pmp-access-signal" aria-hidden>
          <span><LocalizedText message={"Plan"} /></span><i /><span><LocalizedText message={"Deliver"} /></span><i /><span><LocalizedText message={"Improve"} /></span>
        </div>
      </section>
      <section className="pmp-access-panel">
        <div className="pmp-access-card">
          <div className="pmp-access-mobile-brand"><PlatformLogo size={34} /><strong><LocalizedText message={"Project Management"} />{" "}<span><LocalizedText message={"Platform"} /></span></strong></div>
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
