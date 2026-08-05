import type { PresenceStatus } from "@/lib/types";

const COLORS: Record<PresenceStatus, string> = {
  online: "var(--presence-online)",
  busy: "var(--presence-busy)",
  away: "var(--presence-away)",
  focus: "var(--presence-focus)",
  offline: "var(--presence-offline)",
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
}

export function PresenceDot({ status, size = 9, overlay = false }: Props) {
  return (
    <span
      title={PRESENCE_LABELS[status]}
      style={{
        width: size,
        height: size,
        borderRadius: "var(--radius-full)",
        background: COLORS[status],
        display: "inline-block",
        flexShrink: 0,
        ...(overlay
          ? {
              position: "absolute",
              bottom: -1,
              right: -1,
              border: "2px solid var(--surface-1)",
            }
          : {}),
      }}
    />
  );
}
