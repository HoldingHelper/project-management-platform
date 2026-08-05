import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

type Tone = "default" | "completed" | "blocked" | "delayed" | "in-progress";

interface Props {
  label: string;
  value: string | number;
  trend?: string;
  tone?: Tone;
  href?: string;
  icon?: ReactNode;
}

const toneColor: Record<Tone, string> = {
  default: "var(--text-primary)",
  completed: "var(--status-completed)",
  blocked: "var(--status-blocked)",
  delayed: "var(--status-delayed)",
  "in-progress": "var(--status-in-progress)",
};

const toneBg: Record<Tone, string> = {
  default: "var(--surface-3)",
  completed: "var(--status-completed-bg)",
  blocked: "var(--status-blocked-bg)",
  delayed: "var(--status-delayed-bg)",
  "in-progress": "var(--status-in-progress-bg)",
};

export function MetricCard({ label, value, trend, tone = "default", href, icon }: Props) {
  const style: CSSProperties = {
    background: "var(--surface-2)",
    border: "1px solid var(--border-subtle)",
    borderRadius: "var(--radius-3)",
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    minHeight: 100,
  };
  const content = (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500 }}>{label}</div>
        {icon && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 28,
              height: 28,
              borderRadius: "var(--radius-2)",
              background: toneBg[tone],
              color: toneColor[tone],
              flexShrink: 0,
            }}
          >
            {icon}
          </span>
        )}
      </div>
      <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1, color: toneColor[tone] }}>
        {value}
      </div>
      {trend && <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{trend}</div>}
    </>
  );
  if (href) {
    return (
      <Link href={href} className="pmp-metric-card pmp-interactive is-clickable" data-tone={tone} aria-label={`Open ${label}`} style={style}>
        {content}
      </Link>
    );
  }
  return <div className="pmp-metric-card" data-tone={tone} style={style}>{content}</div>;
}
