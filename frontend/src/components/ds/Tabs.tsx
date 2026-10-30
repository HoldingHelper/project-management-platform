"use client";
import { useI18n } from "@/lib/i18n/I18nProvider";

import { LocalizedText } from "@/lib/i18n/I18nProvider";
interface TabItem {
  key: string;
  label: string;
}
interface Props {
  items: TabItem[];
  active: string;
  onChange: (key: string) => void;
}

export function Tabs({ items, active, onChange }: Props) {
  const { t: translateUI, locale } = useI18n();

  const move = (direction: 1 | -1, container: HTMLDivElement) => {
    if (!items.length) return;
    const current = Math.max(0, items.findIndex((item) => item.key === active));
    const next = (current + direction + items.length) % items.length;
    onChange(items[next].key);
    container.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  };
  return (
    <div
      className="pmp-tabs-scroll"
      role="tablist"
      aria-label={translateUI("Page sections")}
      onKeyDown={(event) => {
        if (!items.length) return;
        if (event.key === "ArrowRight") { event.preventDefault(); move(locale === "fa" ? -1 : 1, event.currentTarget); }
        if (event.key === "ArrowLeft") { event.preventDefault(); move(locale === "fa" ? 1 : -1, event.currentTarget); }
        if (event.key === "Home") { event.preventDefault(); onChange(items[0].key); event.currentTarget.querySelector<HTMLButtonElement>('[role="tab"]')?.focus(); }
        if (event.key === "End") { event.preventDefault(); onChange(items[items.length - 1].key); event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[items.length - 1]?.focus(); }
      }}
    >
      {items.map((it) => {
        const isActive = it.key === active;
        return (
          <button
            key={it.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            className="pmp-tab"
            onClick={() => onChange(it.key)}
          >
            {<LocalizedText message={it.label} />}
          </button>
        );
      })}
    </div>
  );
}
