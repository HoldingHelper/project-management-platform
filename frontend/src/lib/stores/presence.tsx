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
import type { PresenceStatus, UserPresenceInfo, UUID } from "@/lib/types";
import { useRealtimeEvent } from "@/lib/ws/RealtimeProvider";

type PresenceInfoMap = Record<string, UserPresenceInfo>;

const PresenceContext = createContext<PresenceInfoMap>({});

export function PresenceProvider({ children }: { children: ReactNode }) {
  const [map, setMap] = useState<PresenceInfoMap>({});

  useEffect(() => {
    getPresenceSnapshot()
      .then((raw) => {
        const normalized: PresenceInfoMap = {};
        for (const [uid, val] of Object.entries(raw)) {
          if (typeof val === "string") {
            normalized[uid] = { status: val as PresenceStatus };
          } else if (val && typeof val === "object") {
            normalized[uid] = {
              status: val.status,
              status_text: val.custom_status?.text ?? null,
              status_emoji: val.custom_status?.emoji ?? null,
              status_expires_at: val.custom_status?.expires_at ?? null,
            };
          }
        }
        setMap(normalized);
      })
      .catch(() => {});
  }, []);

  useRealtimeEvent(
    ["presence.changed"],
    (evt) => {
      const userId = evt.data.user_id as string;
      const status = (evt.data.status as PresenceStatus) || "online";
      const custom = evt.data.custom_status as { text?: string; emoji?: string; expires_at?: string } | undefined;
      if (!userId) return;

      setMap((prev) => {
        return {
          ...prev,
          [userId]: {
            status,
            status_text: custom?.text !== undefined ? custom.text : prev[userId]?.status_text ?? null,
            status_emoji: custom?.emoji !== undefined ? custom.emoji : prev[userId]?.status_emoji ?? null,
            status_expires_at: custom?.expires_at !== undefined ? custom.expires_at : prev[userId]?.status_expires_at ?? null,
          },
        };
      });
    },
    ["presence"],
  );

  return <PresenceContext.Provider value={map}>{children}</PresenceContext.Provider>;
}

export function usePresence(userId?: UUID | null): PresenceStatus {
  const map = useContext(PresenceContext);
  if (!userId) return "offline";
  return map[userId]?.status ?? "offline";
}

export function useUserStatus(userId?: UUID | null): UserPresenceInfo {
  const map = useContext(PresenceContext);
  if (!userId) return { status: "offline" };
  return map[userId] ?? { status: "offline" };
}

export function usePresenceMap(): PresenceInfoMap {
  return useContext(PresenceContext);
}
