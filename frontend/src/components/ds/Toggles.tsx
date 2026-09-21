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

export function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <span
      onClick={() => onChange(!checked)}
      style={{
        width: 38,
        height: 22,
        borderRadius: "var(--radius-full)",
        background: checked ? "var(--accent-primary)" : "var(--surface-3)",
        border: `1px solid ${checked ? "transparent" : "var(--border-default)"}`,
        display: "inline-flex",
        alignItems: "center",
        padding: "2px",
        cursor: "pointer",
        boxShadow: checked ? "0 0 12px rgba(75, 141, 255, 0.35)" : "none",
        transition: "background var(--duration-base) var(--ease-spring), border-color var(--duration-base) var(--ease-spring), box-shadow var(--duration-base) var(--ease-spring)",
      }}
    >
      <span
        style={{
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: "#fff",
          boxShadow: "0 1px 4px rgba(0, 0, 0, 0.35)",
          transform: checked ? "translateX(16px)" : "translateX(0)",
          transition: "transform var(--duration-base) var(--ease-bounce)",
        }}
      />
    </span>
  );
}
