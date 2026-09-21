import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "tertiary" | "danger" | "ghost";
type Size = "sm" | "md" | "lg";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

const sizes: Record<Size, React.CSSProperties> = {
  sm: { minHeight: 40, padding: "0 12px", fontSize: 13, borderRadius: "var(--radius-2)" },
  md: { minHeight: 44, padding: "0 16px", fontSize: 13.5, borderRadius: "var(--radius-2)" },
  lg: { minHeight: 48, padding: "0 20px", fontSize: 14.5, borderRadius: "var(--radius-2)" },
};

const base: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  fontFamily: "var(--font-sans)",
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
  border: "1px solid transparent",
  transition:
    "background var(--duration-fast) var(--ease-spring), border-color var(--duration-fast) var(--ease-spring), transform var(--duration-fast) var(--ease-spring), box-shadow var(--duration-base) var(--ease-spring), opacity var(--duration-fast)",
};

const variants: Record<Variant, React.CSSProperties> = {
  primary: { background: "var(--accent-primary)", color: "var(--text-on-accent)", fontWeight: 700 },
  secondary: { background: "var(--surface-3)", color: "var(--text-primary)", borderColor: "var(--border-default)" },
  tertiary: { background: "transparent", color: "var(--text-secondary)", borderColor: "var(--border-default)" },
  ghost: { background: "transparent", color: "var(--text-secondary)" },
  danger: { background: "var(--status-blocked)", color: "#fff", fontWeight: 700 },
};

export function Button({ variant = "primary", size = "md", children, style, disabled, className, ...rest }: Props) {
  return (
    <button
      {...rest}
      disabled={disabled}
      className={`pmp-btn pmp-btn-${variant}${className ? ` ${className}` : ""}`}
      style={{
        ...base,
        ...sizes[size],
        ...variants[variant],
        ...(disabled ? { opacity: 0.45, cursor: "not-allowed" } : {}),
        ...style,
      }}
    >
      {children}
    </button>
  );
}
