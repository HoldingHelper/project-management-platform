"use client";

/* Notification store: unread count + latest items, kept fresh by the
   `notification.created` websocket event and TanStack Query. */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listNotifications } from "@/lib/api/collaboration";
import type { NotificationRead } from "@/lib/types";
import { useRealtimeEvent } from "@/lib/ws/RealtimeProvider";

interface NotificationStore {
  notifications: NotificationRead[];
  unreadCount: number;
  actionRequiredCount: number;
  refresh: () => void;
}

const NotificationContext = createContext<NotificationStore>({
  notifications: [],
  unreadCount: 0,
  actionRequiredCount: 0,
  refresh: () => {},
});

export function NotificationProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => listNotifications("all"),
    staleTime: 30_000,
    refetchInterval: 120_000,
  });

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  }, [queryClient]);

  useRealtimeEvent(["notification.created"], refresh);

  const value = useMemo<NotificationStore>(() => {
    const notifications = data ?? [];
    return {
      notifications,
      unreadCount: notifications.filter((n) => !n.is_read).length,
      actionRequiredCount: notifications.filter(
        (n) => n.requires_action && !n.resolved_at,
      ).length,
      refresh,
    };
  }, [data, refresh]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications(): NotificationStore {
  return useContext(NotificationContext);
}
