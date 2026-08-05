"use client";

/* App-wide presence map: initial REST snapshot + live `presence.changed`
   events over the shared websocket. Everyone offline unless present here. */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { getPresenceSnapshot } from "@/lib/api/users";
import type { PresenceStatus, UUID } from "@/lib/types";
import { useRealtimeEvent } from "@/lib/ws/RealtimeProvider";

type PresenceMap = Record<string, PresenceStatus>;

const PresenceContext = createContext<PresenceMap>({});

export function PresenceProvider({ children }: { children: ReactNode }) {
  const [map, setMap] = useState<PresenceMap>({});

  useEffect(() => {
    getPresenceSnapshot()
      .then(setMap)
      .catch(() => {});
  }, []);

  useRealtimeEvent(
    ["presence.changed"],
    (evt) => {
      const userId = evt.data.user_id as string;
      const status = evt.data.status as PresenceStatus;
      if (!userId) return;
      setMap((prev) => {
        if (status === "offline") {
          const next = { ...prev };
          delete next[userId];
          return next;
        }
        return { ...prev, [userId]: status };
      });
    },
    ["presence"],
  );

  return <PresenceContext.Provider value={map}>{children}</PresenceContext.Provider>;
}

export function usePresence(userId?: UUID | null): PresenceStatus {
  const map = useContext(PresenceContext);
  if (!userId) return "offline";
  return map[userId] ?? "offline";
}

export function usePresenceMap(): PresenceMap {
  return useContext(PresenceContext);
}
