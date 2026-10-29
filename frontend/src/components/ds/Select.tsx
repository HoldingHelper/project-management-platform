"use client";
import type { SelectHTMLAttributes } from "react";
import { useI18n } from "@/lib/i18n/I18nProvider";

interface Option {
  value: string;
  label: string;
  translateLabel?: boolean;
}
interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
  options: Option[];
  placeholder?: string;
  translateOptions?: boolean;
}

export function Select({ options, placeholder, translateOptions = false, style, className, ...rest }: Props) {
  const { t } = useI18n();
  return (
    <select
      {...rest}
      className={`pmp-select ${className ?? ""}`.trim()}
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
      {placeholder && <option value="">{t(placeholder)}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.translateLabel || translateOptions ? t(o.label) : o.label}
        </option>
      ))}
    </select>
  );
}
