import { PRIORITY_COLOR, PRIORITY_GLYPH } from "@/lib/format";

interface Props {
  level: string; // P0..P3
  compact?: boolean;
}

export function PriorityBadge({ level, compact = false }: Props) {
  const color = PRIORITY_COLOR[level] ?? "var(--text-tertiary)";
  const glyph = PRIORITY_GLYPH[level] ?? "•";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: compact ? "1px 7px" : "3px 10px",
        borderRadius: "var(--radius-full)",
        fontSize: 11.5,
        fontWeight: 700,
        fontFamily: "var(--font-mono)",
        color,
        background: `color-mix(in srgb, ${color} 16%, transparent)`,
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ fontSize: 9 }}>{glyph}</span>
      {level}
      {!compact && <span style={{ color: "var(--text-tertiary)", fontWeight: 500 }}>priority</span>}
    </span>
  );
}
