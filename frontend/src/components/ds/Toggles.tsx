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
          color: "#04160b",
          fontSize: 12,
          fontWeight: 800,
        }}
      >
        {checked ? "✓" : ""}
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
        display: "inline-flex",
        alignItems: "center",
        padding: 2,
        cursor: "pointer",
        transition: "background var(--duration-fast)",
      }}
    >
      <span
        style={{
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: "#fff",
          transform: checked ? "translateX(16px)" : "translateX(0)",
          transition: "transform var(--duration-fast) var(--ease-standard)",
        }}
      />
    </span>
  );
}
