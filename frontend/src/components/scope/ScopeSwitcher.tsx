"use client";

import { useI18n } from "@/lib/i18n/I18nProvider";
import { LocalizedText } from "@/lib/i18n/I18nProvider";

import { Building2, ChevronDown, LockKeyhole } from "lucide-react";
import { useScope } from "@/lib/scope/ScopeContext";

export function ScopeSwitcher() {
  const { t: translateUI } = useI18n();

  const { current, nodes, loading, setScope } = useScope();
  const scopes = nodes.filter((node) => ["holding", "venture", "function"].includes(node.type) && node.status === "active");

  return (
    <label className="scope-switcher">
      <span className="sr-only"><LocalizedText message={"Current holding scope"} /></span>
      <Building2 size={15} aria-hidden />
      <select
        value={current?.id ?? ""}
        onChange={(event) => setScope(event.target.value)}
        disabled={loading || scopes.length === 0}
        aria-label={translateUI("Current holding scope")}
      >
        {!current && <option value=""><LocalizedText message={"Select scope"} /></option>}
        {scopes.map((node) => (
          <option key={node.id} value={node.id}>
            {node.type === "holding" ? <LocalizedText message={"Holding"} /> : node.type === "function" ? <LocalizedText message={"Function"} /> : <LocalizedText message={"Venture"} />} · {node.name}
          </option>
        ))}
      </select>
      {current?.confidentiality !== "standard" ? <LockKeyhole size={13} aria-label={`${current?.confidentiality} scope`} /> : <ChevronDown size={13} aria-hidden />}
    </label>
  );
}
