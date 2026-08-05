"use client";

import { useQuery } from "@tanstack/react-query";
import { listUsers } from "@/lib/api/users";
import { displayName } from "@/lib/format";
import type { UUID } from "@/lib/types";

/** Fetches all users once and exposes an id → full_name resolver. */
export function useUserMap() {
  const { data } = useQuery({
    queryKey: ["users", "all"],
    queryFn: () => listUsers({ page_size: 200 }),
    staleTime: 30_000,
    refetchOnMount: "always",
  });

  const map = new Map<UUID, string>();
  for (const u of data?.items ?? []) map.set(u.id, displayName(u.full_name));

  const nameOf = (id?: UUID | null) => (id ? map.get(id) ?? "Unknown" : "—");
  return { nameOf, users: data?.items ?? [] };
}
