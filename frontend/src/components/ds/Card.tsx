import type { CSSProperties, ReactNode } from "react";

interface Props {
  className?: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  padded?: boolean;
  style?: CSSProperties;
}

/** Standard elevated surface panel used across the app. */
export function Card({ className, title, subtitle, right, children, padded = true, style }: Props) {
  return (
    <section
      className={`pmp-card pmp-surface-panel${className ? ` ${className}` : ""}`}
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-3)",
        overflow: "hidden",
        ...style,
      }}
    >
      {(title || right) && (
        <div className="pmp-card-header"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "14px 18px",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-0.01em" }}>{title}</div>
            {subtitle && (
              <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>{subtitle}</div>
            )}
          </div>
          {right}
        </div>
      )}
      <div className="pmp-card-body" style={{ minWidth: 0, ...(padded ? { padding: 18 } : {}) }}>{children}</div>
    </section>
  );
}
