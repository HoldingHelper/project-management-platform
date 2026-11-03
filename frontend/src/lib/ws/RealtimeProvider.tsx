"use client";

/* Single app-wide WebSocket with exponential-backoff reconnect, group
   re-join on reconnect, and an event-emitter fan-out so any component can
   subscribe with `useRealtimeEvent(...)` without opening its own socket. */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getAccessToken, isTokenExpired } from "@/lib/auth/token-store";
import { refreshAccessToken } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/AuthProvider";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || (typeof window !== "undefined" ? `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws` : "");

export interface RealtimeEvent {
  event: string;
  data: Record<string, unknown>;
}

type Listener = (evt: RealtimeEvent) => void;

interface RealtimeApi {
  /** Join a broadcast group (ref-counted). Returns a leave function. */
  joinGroup(group: string): () => void;
  /** Subscribe to events by exact name (or "*" for all). Returns unsubscribe. */
  subscribe(event: string, listener: Listener): () => void;
}

const RealtimeContext = createContext<RealtimeApi | null>(null);

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const socketRef = useRef<WebSocket | null>(null);
  const groupsRef = useRef<Map<string, number>>(new Map());
  const listenersRef = useRef<Map<string, Set<Listener>>>(new Map());
  const retryRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closedRef = useRef(false);
  const connectingRef = useRef(false);
  // True once the socket has opened at least once; a later open is a real
  // reconnect (drop + recover), which subscribers use to refetch authoritative
  // state rather than trusting frames they may have missed while offline.
  const hasConnectedRef = useRef(false);

  const send = useCallback((payload: Record<string, unknown>) => {
    const ws = socketRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
  }, []);

  const connect = useCallback(async () => {
    if (closedRef.current || connectingRef.current) return;
    if (
      socketRef.current &&
      (socketRef.current.readyState === WebSocket.OPEN ||
        socketRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    connectingRef.current = true;
    let token = getAccessToken();
    if (!token || isTokenExpired(token)) {
      const ok = await refreshAccessToken();
      if (!ok || closedRef.current) {
        connectingRef.current = false;
        return;
      }
      token = getAccessToken();
    }
    connectingRef.current = false;
    if (!token || closedRef.current) return;

    let ws: WebSocket;
    try {
      ws = new WebSocket(`${WS_URL}?access_token=${encodeURIComponent(token)}`);
    } catch {
      return;
    }
    socketRef.current = ws;

    ws.onopen = () => {
      retryRef.current = 0;
      for (const group of groupsRef.current.keys()) {
        ws.send(JSON.stringify({ action: "join", group }));
      }
      // Reopen after a prior connection = reconnect. Fan out a synthetic event
      // so listeners (e.g. the music player) refetch authoritative state after
      // rejoining their groups; the initial connect must not fire it.
      if (hasConnectedRef.current) {
        const evt = { event: "ws.reconnect", data: {} } as RealtimeEvent;
        listenersRef.current.get("ws.reconnect")?.forEach((fn) => fn(evt));
        listenersRef.current.get("*")?.forEach((fn) => fn(evt));
      }
      hasConnectedRef.current = true;
    };
    ws.onmessage = (ev) => {
      try {
        const parsed = JSON.parse(ev.data) as RealtimeEvent;
        if (!parsed?.event) return;
        if (parsed.event === "docs.lifecycle") {
          const pageId = String(parsed.data.page_id ?? "");
          if (pageId) {
            if (parsed.data.status === "archived" && !user?.roles.includes("SuperAdmin")) {
              void queryClient.resetQueries({ queryKey: ["doc-page", pageId] });
            } else {
              void queryClient.invalidateQueries({ queryKey: ["doc-page", pageId] });
            }
            void queryClient.invalidateQueries({ queryKey: ["document-lifecycle"] });
            for (const key of ["doc-pages", "doc-archived", "entity-files", "entity-doc-links", "product-documentation"]) {
              void queryClient.invalidateQueries({ queryKey: [key] });
            }
          }
        }
        listenersRef.current.get(parsed.event)?.forEach((fn) => fn(parsed));
        listenersRef.current.get("*")?.forEach((fn) => fn(parsed));
      } catch {
        /* ignore malformed frames */
      }
    };
    ws.onclose = (event) => {
      socketRef.current = null;
      if (closedRef.current) return;
      if (event.code === 4401 || event.code === 1008) {
        void refreshAccessToken().then((ok) => {
          if (ok && !closedRef.current) {
            retryRef.current = 0;
            void connect();
          }
        });
        return;
      }
      const delay = Math.min(30_000, 1000 * 2 ** retryRef.current);
      retryRef.current += 1;
      timerRef.current = setTimeout(() => {
        void connect();
      }, delay);
    };
    ws.onerror = () => {
      /* onclose handles retry */
    };
  }, [queryClient, user]);

  useEffect(() => {
    if (!user) return;
    closedRef.current = false;
    void connect();
    return () => {
      closedRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [user, connect]);

  const api = useMemo<RealtimeApi>(
    () => ({
      joinGroup(group: string) {
        const count = groupsRef.current.get(group) ?? 0;
        groupsRef.current.set(group, count + 1);
        if (count === 0) send({ action: "join", group });
        return () => {
          const current = groupsRef.current.get(group) ?? 0;
          if (current <= 1) {
            groupsRef.current.delete(group);
            send({ action: "leave", group });
          } else {
            groupsRef.current.set(group, current - 1);
          }
        };
      },
      subscribe(event: string, listener: Listener) {
        let set = listenersRef.current.get(event);
        if (!set) {
          set = new Set();
          listenersRef.current.set(event, set);
        }
        set.add(listener);
        return () => {
          set?.delete(listener);
        };
      },
    }),
    [send],
  );

  return <RealtimeContext.Provider value={api}>{children}</RealtimeContext.Provider>;
}

export function useRealtimeApi(): RealtimeApi {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error("useRealtimeApi must be used inside RealtimeProvider");
  return ctx;
}

/** Subscribe to a named event (and optionally join groups) for the lifetime
    of the component. */
export function useRealtimeEvent(
  events: string[],
  onEvent: Listener,
  groups: string[] = [],
): void {
  const api = useRealtimeApi();
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;
  const eventsKey = events.join(",");
  const groupsKey = groups.join(",");

  useEffect(() => {
    const unsubs = (eventsKey ? eventsKey.split(",") : []).map((e) =>
      api.subscribe(e, (evt) => handlerRef.current(evt)),
    );
    const leaves = (groupsKey ? groupsKey.split(",") : [])
      .filter(Boolean)
      .map((g) => api.joinGroup(g));
    return () => {
      unsubs.forEach((u) => u());
      leaves.forEach((l) => l());
    };
  }, [api, eventsKey, groupsKey]);
}
