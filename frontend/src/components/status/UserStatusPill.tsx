"use client";

import { PresenceDot } from "@/components/ds";
import type { PresenceStatus } from "@/lib/types";

interface Props {
  status?: PresenceStatus;
  emoji?: string | null;
  text?: string | null;
  onClick?: () => void;
  interactive?: boolean;
  size?: "sm" | "md" | "lg";
  showText?: boolean;
  className?: string;
  maxWidth?: number | string;
}

export function UserStatusPill({
  status = "offline",
  emoji,
  text,
  onClick,
  interactive = false,
  size = "md",
  showText = true,
  className = "",
  maxWidth = 180,
}: Props) {
  const isOnline = status === "online";
  const hasCustom = Boolean(emoji || text);

  const paddingY = size === "sm" ? "2px" : size === "lg" ? "6px" : "4px";
  const paddingX = size === "sm" ? "6px" : size === "lg" ? "10px" : "8px";
  const fontSize = size === "sm" ? 11 : size === "lg" ? 13 : 12;
  const dotSize = size === "sm" ? 6 : size === "lg" ? 9 : 7;

  return (
    <button
      type={interactive ? "button" : undefined}
      disabled={!interactive}
      onClick={interactive ? onClick : undefined}
      className={`pmp-status-pill ${isOnline ? "pmp-status-online" : ""} ${className}`}
      title={text ? `${emoji ? `${emoji} ` : ""}${text} (${status})` : `Status: ${status}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: `${paddingY} ${paddingX}`,
        borderRadius: "var(--radius-full)",
        border: `1px solid ${
          isOnline
            ? "color-mix(in srgb, var(--emerald-500) 35%, var(--border-subtle))"
            : status === "busy" || status === "focus"
            ? "color-mix(in srgb, var(--red-500) 35%, var(--border-subtle))"
            : status === "away"
            ? "color-mix(in srgb, var(--gold-400) 35%, var(--border-subtle))"
            : "var(--border-subtle)"
        }`,
        background: isOnline
          ? "color-mix(in srgb, var(--emerald-500) 10%, var(--surface-2))"
          : status === "busy" || status === "focus"
          ? "color-mix(in srgb, var(--red-500) 10%, var(--surface-2))"
          : status === "away"
          ? "color-mix(in srgb, var(--gold-400) 10%, var(--surface-2))"
          : "var(--surface-2)",
        color: "var(--text-secondary)",
        fontSize,
        fontWeight: 500,
        cursor: interactive ? "pointer" : "default",
        userSelect: "none",
        maxWidth,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        transition: "all 0.15s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      <PresenceDot status={status} size={dotSize} />
      {emoji && <span style={{ fontSize: fontSize + 1, lineHeight: 1 }}>{emoji}</span>}
      {showText && text && (
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: "var(--text-primary)",
            fontWeight: 600,
          }}
        >
          {text}
        </span>
      )}
      {showText && !text && (
        <span style={{ textTransform: "capitalize", color: "var(--text-secondary)" }}>
          {status}
        </span>
      )}
    </button>
  );
}
