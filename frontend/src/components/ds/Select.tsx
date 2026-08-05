import type { SelectHTMLAttributes } from "react";

interface Option {
  value: string;
  label: string;
}
interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
  options: Option[];
  placeholder?: string;
}

export function Select({ options, placeholder, style, ...rest }: Props) {
  return (
    <select
      {...rest}
      style={{
        minHeight: 44,
        padding: "0 32px 0 12px",
        borderRadius: "var(--radius-2)",
        border: "1px solid var(--border-default)",
        background:
          "var(--surface-2) url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path d='M1 1l4 4 4-4' stroke='%239CA3AF' stroke-width='1.5' fill='none'/></svg>\") no-repeat right 12px center",
        color: "var(--text-primary)",
        fontFamily: "var(--font-sans)",
        fontSize: 13.5,
        appearance: "none",
        cursor: "pointer",
        ...style,
      }}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
