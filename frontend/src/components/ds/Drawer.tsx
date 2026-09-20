"use client";

import type { CSSProperties, ReactNode } from "react";

interface Props {
  open: boolean;
  width?: number;
  children: ReactNode;
  side?: "right" | "left";
  style?: CSSProperties;
  className?: string;
  ariaLabel?: string;
}

/** In-flow side panel (used by the chat rail): animates its width so the
    main content reflows instead of being overlapped. */
export function Drawer({ open, width = 380, children, side = "right", style, className = "", ariaLabel }: Props) {
  return (
    <aside
      aria-label={ariaLabel}
      className={`${className} ${open ? "is-open" : ""}`.trim()}
      style={{
        width: open ? width : 0,
        minWidth: open ? width : 0,
        overflow: "hidden",
        transition: "width var(--duration-base) var(--ease-standard), min-width var(--duration-base) var(--ease-standard)",
        borderLeft: side === "right" && open ? "1px solid var(--border-default)" : "none",
        borderRight: side === "left" && open ? "1px solid var(--border-default)" : "none",
        background: "var(--surface-1)",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        ...style,
      }}
    >
      {open && children}
    </aside>
  );
}
