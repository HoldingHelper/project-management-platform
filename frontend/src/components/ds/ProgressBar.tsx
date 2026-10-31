"use client";
import { useI18n } from "@/lib/i18n/I18nProvider";
interface Props {
  percent: number;
  blocks?: number;
  showLabel?: boolean;
  variant?: "standard" | "timeline";
}

/** Accessible continuous progress indicator used for projects and sprints. */
export function ProgressBar({ percent, blocks = 20, showLabel = true, variant = "standard" }: Props) {
  const { t, number } = useI18n();
  const pct = Math.round(Math.max(0, Math.min(100, percent)));
  void blocks;
  return (
    <span
      className="pmp-progress"
      data-progress-variant={variant}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={t("Progress: {percent}%", { percent: pct })}
      style={{ display: "inline-flex", alignItems: "center", gap: 10, width: "100%" }}
    >
      <span
        className="pmp-progress-track"
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
          className="pmp-progress-fill"
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
          <bdi>{number(pct / 100, { style: "percent", maximumFractionDigits: 0 })}</bdi>
        </span>
      )}
    </span>
  );
}
