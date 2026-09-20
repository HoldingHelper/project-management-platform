"use client";

import { useId, useMemo, useState } from "react";

export type SearchSuggestion = { id: string; label: string; detail?: string };

export function SearchSuggestionInput({
  value,
  options,
  placeholder,
  ariaLabel,
  onChange,
  onSelect,
}: {
  value: string;
  options: SearchSuggestion[];
  placeholder: string;
  ariaLabel: string;
  onChange(value: string): void;
  onSelect(option: SearchSuggestion): void;
}) {
  const [focused, setFocused] = useState(false);
  const listboxId = useId();
  const matches = useMemo(() => {
    const needle = value.trim().toLowerCase();
    return options
      .filter((option) => !needle || `${option.label} ${option.detail ?? ""}`.toLowerCase().includes(needle))
      .slice(0, 8);
  }, [options, value]);

  return (
    <div style={{ position: "relative", minWidth: 240, flex: 1 }}>
      <input
        role="combobox"
        aria-label={ariaLabel}
        aria-controls={listboxId}
        aria-expanded={focused && matches.length > 0}
        aria-autocomplete="list"
        value={value}
        placeholder={placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => window.setTimeout(() => setFocused(false), 120)}
        onChange={(event) => onChange(event.target.value)}
        style={{
          width: "100%",
          padding: "10px 12px",
          borderRadius: "var(--radius-2)",
          border: "1px solid var(--border-default)",
          background: "var(--surface-2)",
          color: "var(--text-primary)",
        }}
      />
      {focused && (
        <div
          id={listboxId}
          role="listbox"
          style={{
            position: "absolute",
            zIndex: 80,
            top: "calc(100% + 5px)",
            left: 0,
            right: 0,
            maxHeight: 240,
            overflowY: "auto",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-2)",
            background: "var(--surface-1)",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          {matches.length ? matches.map((option) => (
            <button
              type="button"
              role="option"
              aria-selected="false"
              key={option.id}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onSelect(option);
                setFocused(false);
              }}
              style={{
                display: "flex",
                flexDirection: "column",
                width: "100%",
                padding: "9px 12px",
                border: 0,
                borderBottom: "1px solid var(--border-subtle)",
                background: "transparent",
                color: "var(--text-primary)",
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              <b>{option.label}</b>
              {option.detail && <small style={{ color: "var(--text-tertiary)" }}>{option.detail}</small>}
            </button>
          )) : (
            <div style={{ padding: 12, color: "var(--text-tertiary)", fontSize: 12 }}>No matching options</div>
          )}
        </div>
      )}
    </div>
  );
}
