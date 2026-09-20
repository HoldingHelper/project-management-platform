"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { semanticColor, toSemantic } from "@/lib/format";

export interface StatusChipProps {
  status: string; // any backend status; normalized to a semantic state
  label?: string;
  onChange?: (nextStatus: string) => void;
  disabled?: boolean;
  options?: { value: string; label: string }[];
  size?: "sm" | "md";
}

const DEFAULT_STATUS_OPTIONS = [
  { value: "NotStarted", label: "Not Started" },
  { value: "Ready", label: "Ready" },
  { value: "InProgress", label: "In Progress" },
  { value: "Waiting", label: "Waiting" },
  { value: "Blocked", label: "Blocked" },
  { value: "Review", label: "Review" },
  { value: "Testing", label: "Testing" },
  { value: "Done", label: "Done" },
];

export function StatusChip({
  status,
  label,
  onChange,
  disabled = false,
  options = DEFAULT_STATUS_OPTIONS,
  size = "md",
}: StatusChipProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const semantic = toSemantic(status);
  const { fg, bg, label: defLabel } = semanticColor(semantic);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const chipContent = (
    <span
      className="pmp-status-chip"
      data-status={semantic}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: size === "sm" ? 4 : 6,
        padding: size === "sm" ? "2px 7px" : "3px 9px",
        borderRadius: "var(--radius-full)",
        fontSize: size === "sm" ? 11 : 12,
        fontWeight: 650,
        color: fg,
        background: bg,
        whiteSpace: "nowrap",
        cursor: onChange && !disabled ? "pointer" : "default",
        userSelect: "none",
        transition: "all 140ms ease",
        border: `1px solid color-mix(in srgb, ${fg} 25%, transparent)`,
      }}
      onClick={(e) => {
        if (onChange && !disabled) {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }
      }}
      title={onChange && !disabled ? "Click to change status" : undefined}
    >
      <span
        className="pmp-status-dot"
        style={{
          width: size === "sm" ? 6 : 7,
          height: size === "sm" ? 6 : 7,
          borderRadius: "50%",
          background: fg,
          flexShrink: 0,
        }}
      />
      <span>{label ?? defLabel}</span>
      {onChange && !disabled && (
        <ChevronDown size={11} style={{ opacity: 0.7, marginLeft: -1 }} />
      )}
    </span>
  );

  if (!onChange) {
    return chipContent;
  }

  return (
    <div
      ref={containerRef}
      style={{ position: "relative", display: "inline-block", verticalAlign: "middle" }}
      onClick={(e) => e.stopPropagation()}
    >
      {chipContent}

      {open && (
        <div
          role="menu"
          aria-label="Select status"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            zIndex: 120,
            minWidth: 150,
            padding: 4,
            borderRadius: "var(--radius-2)",
            background: "var(--surface-1)",
            border: "1px solid var(--border-default)",
            boxShadow: "0 10px 28px rgba(0, 0, 0, 0.45)",
            display: "grid",
            gap: 2,
          }}
        >
          {options.map((opt) => {
            const optSem = toSemantic(opt.value);
            const optColor = semanticColor(optSem);
            const isSelected = opt.value.toLowerCase() === status.toLowerCase();
            return (
              <button
                key={opt.value}
                type="button"
                role="menuitem"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  padding: "6px 9px",
                  borderRadius: "var(--radius-1)",
                  border: "none",
                  background: isSelected ? "var(--surface-3)" : "transparent",
                  color: isSelected ? "var(--text-primary)" : "var(--text-secondary)",
                  fontSize: 12,
                  fontWeight: isSelected ? 700 : 500,
                  textAlign: "left",
                  cursor: "pointer",
                  transition: "background 100ms ease",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = isSelected ? "var(--surface-3)" : "transparent")
                }
                onClick={() => {
                  setOpen(false);
                  if (opt.value !== status) {
                    onChange(opt.value);
                  }
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: optColor.fg,
                    flexShrink: 0,
                  }}
                />
                <span style={{ flex: 1 }}>{opt.label}</span>
                {isSelected && (
                  <span style={{ color: "var(--accent-primary)", fontSize: 11, fontWeight: 800 }}>
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
