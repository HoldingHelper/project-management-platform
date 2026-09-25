"use client";

import { Building2, ChevronDown, LockKeyhole } from "lucide-react";
import { useScope } from "@/lib/scope/ScopeContext";

export function ScopeSwitcher() {
  const { current, nodes, loading, setScope } = useScope();
  const scopes = nodes.filter((node) => ["holding", "venture", "function"].includes(node.type) && node.status === "active");

  return (
    <label className="scope-switcher">
      <span className="sr-only">Current holding scope</span>
      <Building2 size={15} aria-hidden />
      <select
        value={current?.id ?? ""}
        onChange={(event) => setScope(event.target.value)}
        disabled={loading || scopes.length === 0}
        aria-label="Current holding scope"
      >
        {!current && <option value="">Select scope</option>}
        {scopes.map((node) => (
          <option key={node.id} value={node.id}>
            {node.type === "holding" ? "Holding" : node.type === "function" ? "Function" : "Venture"} · {node.name}
          </option>
        ))}
      </select>
      {current?.confidentiality !== "standard" ? <LockKeyhole size={13} aria-label={`${current?.confidentiality} scope`} /> : <ChevronDown size={13} aria-hidden />}
    </label>
  );
}
