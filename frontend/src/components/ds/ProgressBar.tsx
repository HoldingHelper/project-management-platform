import { blockMeter } from "@/lib/format";

interface Props {
  percent: number;
  blocks?: number;
  showLabel?: boolean;
}

/** The signature discrete block meter: ██████░░░░ 68% */
export function ProgressBar({ percent, blocks = 20, showLabel = true }: Props) {
  const pct = Math.round(Math.max(0, Math.min(100, percent)));
  return (
    <span className="pmp-progress" style={{ display: "inline-flex", alignItems: "center", gap: 10, width: "100%" }}>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          letterSpacing: 0.5,
          color: "var(--accent-primary)",
          overflow: "hidden",
          whiteSpace: "nowrap",
          flex: 1,
          minWidth: 0,
        }}
      >
        {blockMeter(pct, blocks)}
      </span>
      {showLabel && (
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            fontWeight: 700,
            color: "var(--text-primary)",
            width: 40,
            textAlign: "right",
            flexShrink: 0,
          }}
        >
          {pct}%
        </span>
      )}
    </span>
  );
}
