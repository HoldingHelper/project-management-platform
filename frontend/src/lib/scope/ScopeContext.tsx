"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { listOrgNodes } from "@/lib/api/org";
import type { OrgNodeRead, UUID } from "@/lib/types";

interface ScopeValue {
  current: OrgNodeRead | null;
  nodes: OrgNodeRead[];
  loading: boolean;
  setScope: (nodeId: UUID) => void;
}

const ScopeContext = createContext<ScopeValue | null>(null);
const STORAGE_KEY = "pmp.current-scope";

function routeFor(node: OrgNodeRead, nodes: OrgNodeRead[]): string {
  if (node.type === "holding") return `/h/${node.slug}`;
  if (node.type === "venture") return `/v/${node.slug}`;
  if (node.type === "function") {
    const holding = nodes.find((candidate) => candidate.type === "holding");
    return `/h/${holding?.slug ?? "holding"}/functions/${node.slug}`;
  }
  return `/scope/${node.id}`;
}

export function ScopeProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [selectedId, setSelectedId] = useState<UUID | null>(null);
  const query = useQuery({ queryKey: ["org", "nodes"], queryFn: () => listOrgNodes() });
  const nodes = useMemo(() => query.data ?? [], [query.data]);

  useEffect(() => {
    if (!nodes.length) return;
    const segments = pathname.split("/").filter(Boolean);
    const routeSlug = segments[0] === "h" && segments[2] === "functions"
      ? segments[3]
      : segments[0] === "h" || segments[0] === "v" ? segments[1] : null;
    const routeNode = routeSlug ? nodes.find((node) => node.slug === routeSlug) : null;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const fallback = nodes.find((node) => node.id === stored) ?? nodes.find((node) => node.type === "holding") ?? nodes[0];
    setSelectedId(routeNode?.id ?? fallback?.id ?? null);
  }, [nodes, pathname]);

  const setScope = useCallback((nodeId: UUID) => {
    const node = nodes.find((candidate) => candidate.id === nodeId);
    if (!node) return;
    window.localStorage.setItem(STORAGE_KEY, node.id);
    setSelectedId(node.id);
    router.push(routeFor(node, nodes));
  }, [nodes, router]);

  const value = useMemo<ScopeValue>(() => ({
    current: nodes.find((node) => node.id === selectedId) ?? null,
    nodes,
    loading: query.isLoading,
    setScope,
  }), [nodes, query.isLoading, selectedId, setScope]);

  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;
}

export function useScope(): ScopeValue {
  const value = useContext(ScopeContext);
  if (!value) throw new Error("useScope must be used inside ScopeProvider");
  return value;
}
