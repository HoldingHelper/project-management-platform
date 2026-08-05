import { semanticColor, toSemantic } from "@/lib/format";

interface Props {
  status: string; // any backend status; normalized to a semantic state
  label?: string;
}

export function StatusChip({ status, label }: Props) {
  const semantic = toSemantic(status);
  const { fg, bg, label: defLabel } = semanticColor(semantic);
  return (
    <span
      className="pmp-status-chip"
      data-status={semantic}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 10px",
        borderRadius: "var(--radius-full)",
        fontSize: 12,
        fontWeight: 600,
        color: fg,
        background: bg,
        whiteSpace: "nowrap",
      }}
    >
      <span className="pmp-status-dot" style={{ width: 7, height: 7, borderRadius: "50%", background: fg }} />
      {label ?? defLabel}
    </span>
  );
}
