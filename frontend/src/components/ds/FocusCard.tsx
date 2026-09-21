"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Maximize2, Minimize2 } from "lucide-react";
import { Card } from "./Card";

interface Props {
  title: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  focusChildren?: ReactNode;
  padded?: boolean;
  bodyStyle?: React.CSSProperties;
}

export function FocusCard({
  title,
  right,
  children,
  focusChildren,
  padded = true,
  bodyStyle,
}: Props) {
  const [focused, setFocused] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!focused) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFocused(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [focused]);

  const action = (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      {right}
      <button
        type="button"
        className="hig-icon-btn"
        onClick={() => setFocused(true)}
        title="Focus chart"
        aria-label={`Focus ${String(title)} chart`}
        style={iconBtn}
      >
        <Maximize2 size={15} />
      </button>
    </span>
  );

  return (
    <>
      <Card title={title} right={action} padded={padded} style={{ minWidth: 0 }}>
        <div style={bodyStyle}>{children}</div>
      </Card>
      {mounted && focused
        ? createPortal(
            <div className="hig-focus-backdrop" role="dialog" aria-modal="true" aria-label="Focused chart">
              <section className="hig-focus-panel">
                <div className="hig-focus-header">
                  <div style={{ fontSize: 18, fontWeight: 800, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {title}
                  </div>
                  <button
                    type="button"
                    className="hig-icon-btn"
                    onClick={() => setFocused(false)}
                    title="Exit focus"
                    aria-label="Exit chart focus"
                    style={iconBtn}
                  >
                    <Minimize2 size={16} />
                  </button>
                </div>
                <div className="hig-focus-body">{focusChildren ?? children}</div>
              </section>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

const iconBtn: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: "var(--radius-2)",
  border: "1px solid var(--border-default)",
  background: "var(--surface-2)",
  color: "var(--text-secondary)",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  transition: "transform var(--duration-fast) var(--ease-spring), color var(--duration-fast), background var(--duration-fast), border-color var(--duration-fast)",
};
