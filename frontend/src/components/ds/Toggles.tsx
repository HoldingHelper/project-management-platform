"use client";

interface CheckboxProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}

export function Checkbox({ checked, onChange, label }: CheckboxProps) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13.5 }}>
      <span
        onClick={() => onChange(!checked)}
        style={{
          width: 18,
          height: 18,
          borderRadius: 5,
          border: `1px solid ${checked ? "var(--accent-primary)" : "var(--border-default)"}`,
          background: checked ? "var(--accent-primary)" : "transparent",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          fontSize: 12,
          fontWeight: 800,
          transition: "all var(--duration-fast) var(--ease-spring)",
          transform: checked ? "scale(1)" : "scale(0.96)",
          boxShadow: checked ? "0 0 10px rgba(75, 141, 255, 0.35)" : "none",
        }}
      >
        {checked && (
          <span style={{ display: "inline-block", animation: "smoothCheckmark 240ms var(--ease-bounce)" }}>
            ✓
          </span>
        )}
      </span>
      {label && <span style={{ color: "var(--text-secondary)" }}>{label}</span>}
    </label>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      style={{
        position: "relative",
        width: 42,
        minWidth: 42,
        height: 26,
        flexShrink: 0,
        boxSizing: "border-box",
        borderRadius: "var(--radius-full)",
        background: checked ? "var(--accent-primary)" : "var(--surface-3)",
        border: `1px solid ${checked ? "transparent" : "var(--border-default)"}`,
        padding: 0,
        cursor: "pointer",
        transition: "background var(--duration-base) var(--ease-spring), border-color var(--duration-base) var(--ease-spring)",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          insetBlockStart: 3,
          insetInlineStart: checked ? "calc(100% - 21px)" : 3,
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: "#fff",
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.22)",
          transition: "inset-inline-start var(--duration-base) var(--ease-spring)",
        }}
      />
    </button>
  );
}
