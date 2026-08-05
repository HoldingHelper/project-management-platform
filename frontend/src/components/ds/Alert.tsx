import { AlertTriangle, Info, CheckCircle2 } from "lucide-react";

type Kind = "info" | "critical" | "success" | "warning";

interface Props {
  kind?: Kind;
  title: string;
  description?: string;
  time?: string;
}

const map: Record<Kind, { color: string; bg: string; Icon: typeof Info }> = {
  info: { color: "var(--status-in-progress)", bg: "var(--status-in-progress-bg)", Icon: Info },
  critical: { color: "var(--status-delayed)", bg: "var(--status-delayed-bg)", Icon: AlertTriangle },
  warning: { color: "var(--status-blocked)", bg: "var(--status-blocked-bg)", Icon: AlertTriangle },
  success: { color: "var(--status-completed)", bg: "var(--status-completed-bg)", Icon: CheckCircle2 },
};

export function Alert({ kind = "info", title, description, time }: Props) {
  const { color, bg, Icon } = map[kind];
  return (
    <div
      className="pmp-alert"
      data-kind={kind}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "14px 16px",
        borderRadius: "var(--radius-3)",
        border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`,
        background: bg,
      }}
    >
      <Icon size={18} style={{ color, flexShrink: 0, marginTop: 1 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-primary)" }}>{title}</div>
        {description && (
          <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 2 }}>
            {description}
          </div>
        )}
      </div>
      {time && (
        <span style={{ fontSize: 11, color, fontWeight: 600, whiteSpace: "nowrap" }}>{time}</span>
      )}
    </div>
  );
}
