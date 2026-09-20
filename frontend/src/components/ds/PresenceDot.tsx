import React from "react";
import type { PresenceStatus } from "@/lib/types";

const COLORS: Record<PresenceStatus, string> = {
  online: "#10b981", // Emerald-500
  busy: "#ef4444",   // Red-500
  away: "#f59e0b",   // Amber-500
  focus: "#8b5cf6",  // Violet-500
  offline: "#71717a", // Zinc-500
};

const GLOWS: Record<PresenceStatus, string> = {
  online: "0 0 6px rgba(16, 185, 129, 0.55)",
  busy: "0 0 6px rgba(239, 68, 68, 0.5)",
  away: "0 0 5px rgba(245, 158, 11, 0.45)",
  focus: "0 0 6px rgba(139, 92, 246, 0.55)",
  offline: "none",
};

export const PRESENCE_LABELS: Record<PresenceStatus, string> = {
  online: "Online",
  busy: "Busy",
  away: "Away",
  focus: "Focus mode",
  offline: "Offline",
};

interface Props {
  status: PresenceStatus;
  size?: number;
  /** Absolute-position it over an Avatar's corner. */
  overlay?: boolean;
  /** Show subtle glow effect */
  glow?: boolean;
  className?: string;
}

export function PresenceDot({ status, size = 10, overlay = false, glow = true, className }: Props) {
  const isOffline = status === "offline";

  return (
    <span
      title={PRESENCE_LABELS[status] || "Offline"}
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: "var(--radius-full)",
        background: isOffline ? "var(--surface-card, #1c1c21)" : COLORS[status] || COLORS.offline,
        border: isOffline
          ? `2px solid ${COLORS.offline}`
          : undefined,
        boxShadow: overlay
          ? `0 0 0 2px var(--surface-overlay, #111115), ${glow ? GLOWS[status] : "none"}`
          : glow
          ? GLOWS[status]
          : "none",
        display: "inline-block",
        flexShrink: 0,
        transition: "background 0.2s ease, box-shadow 0.2s ease",
        ...(overlay
          ? {
              position: "absolute",
              bottom: -1,
              right: -1,
              zIndex: 2,
            }
          : {}),
      }}
    />
  );
}
