"use client";

interface CheckboxProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}

export function Checkbox({ checked, onChange, label }: CheckboxProps) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13.5, userSelect: "none" }}>
      <span
        onClick={() => onChange(!checked)}
        style={{
          width: 18,
          height: 18,
          borderRadius: 6,
          border: `1px solid ${checked ? "var(--accent-primary)" : "var(--border-default)"}`,
          background: checked ? "var(--accent-primary)" : "transparent",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#04160b",
          fontSize: 12,
          fontWeight: 800,
          transition: "all var(--duration-fast) var(--ease-spring)",
          transform: checked ? "scale(1)" : "scale(0.96)",
          boxShadow: checked ? "0 0 10px var(--green-glow)" : "none",
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
      role="switch"
      aria-checked={checked}
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); onChange(!checked); } }}
      onClick={() => onChange(!checked)}
      style={{
        width: 40,
        height: 24,
        borderRadius: "var(--radius-full)",
        background: checked ? "var(--accent-primary)" : "var(--surface-3)",
        border: `1px solid ${checked ? "transparent" : "var(--border-default)"}`,
        display: "inline-flex",
        alignItems: "center",
        padding: "2px",
        cursor: "pointer",
        outline: "none",
        boxShadow: checked ? "0 0 12px var(--green-glow)" : "none",
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
