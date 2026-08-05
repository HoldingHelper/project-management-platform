import type { InputHTMLAttributes, ReactNode } from "react";

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  icon?: ReactNode;
  trailing?: ReactNode;
}

export function TextInput({ icon, trailing, style, ...rest }: Props) {
  return (
    <div className="pmp-text-input"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        minHeight: 44,
        padding: "0 12px",
        borderRadius: "var(--radius-2)",
        border: "1px solid var(--border-default)",
        background: "var(--surface-2)",
        ...style,
      }}
    >
      {icon && <span style={{ color: "var(--text-tertiary)", display: "flex", flexShrink: 0 }}>{icon}</span>}
      <input
        {...rest}
        style={{
          border: "none",
          outline: "none",
          background: "transparent",
          color: "var(--text-primary)",
          fontFamily: "var(--font-sans)",
          fontSize: 13.5,
          flex: 1,
          minWidth: 0,
        }}
      />
      {trailing && <span className="pmp-input-trailing">{trailing}</span>}
    </div>
  );
}
