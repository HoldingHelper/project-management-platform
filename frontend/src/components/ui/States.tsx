import type { ReactNode } from "react";
import { DocumentTitle } from "./DocumentTitle";

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="pmp-loading-state" role="status" aria-live="polite">
      <span className="pmp-spinner" aria-hidden />
      {label && <span style={{ fontSize: 13 }}>{label}</span>}
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  icon,
  action,
}: {
  title: string;
  hint?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="pmp-empty-state">
      {icon && (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 44,
            height: 44,
            marginBottom: 8,
            borderRadius: "var(--radius-3)",
            background: "var(--surface-3)",
            color: "var(--text-tertiary)",
          }}
        >
          {icon}
        </span>
      )}
      <div style={{ fontSize: 14, color: "var(--text-primary)", fontWeight: 600 }}>{title}</div>
      {hint && <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", maxWidth: 340 }}>{hint}</div>}
      {action && <div style={{ marginTop: 12 }}>{action}</div>}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="pmp-error-state" role="alert">
      {message}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  badge,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <div className="pmp-page-header">
      <DocumentTitle title={title} />
      <div className="pmp-page-heading">
        <div className="pmp-page-title-row">
          <h1>{title}</h1>
          {badge}
        </div>
        {subtitle && <div className="pmp-page-subtitle">{subtitle}</div>}
      </div>
      {actions}
    </div>
  );
}

export const PAGE_STYLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 24,
  padding: "clamp(16px, 2.5vw, 32px)",
  maxWidth: 1440,
  width: "100%",
  minWidth: 0,
};
