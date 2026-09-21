interface Props {
  percent: number;
  blocks?: number;
  showLabel?: boolean;
}

/** Accessible continuous progress indicator used for projects and sprints. */
export function ProgressBar({ percent, blocks = 20, showLabel = true }: Props) {
  const pct = Math.round(Math.max(0, Math.min(100, percent)));
  void blocks;
  return (
    <span
      className="hig-progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={`Progress: ${pct}%`}
      style={{ display: "inline-flex", alignItems: "center", gap: 10, width: "100%" }}
    >
      <span
        style={{
          position: "relative",
          height: 8,
          borderRadius: "var(--radius-full)",
          background: "var(--surface-3)",
          overflow: "hidden",
          flex: 1,
          minWidth: 0,
        }}
      >
        <span
          style={{
            position: "absolute",
            inset: 0,
            width: `${pct}%`,
            borderRadius: "inherit",
            background:
              "linear-gradient(90deg, var(--accent-primary), color-mix(in srgb, var(--accent-primary) 72%, var(--accent-secondary)))",
            transition: "width var(--duration-slow) var(--ease-spring)",
          }}
        />
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
