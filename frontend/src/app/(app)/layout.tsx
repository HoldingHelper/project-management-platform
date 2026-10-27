"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import { rememberWorkspaceLocation } from "@/lib/auth/workspace-navigation";
import { AppShell } from "@/components/shell/AppShell";
import { Spinner } from "@/components/ui/States";
import { RealtimeProvider } from "@/lib/ws/RealtimeProvider";
import { PresenceProvider } from "@/lib/stores/presence";
import { NotificationProvider } from "@/lib/stores/notifications";
import { MusicPlayerProvider } from "@/components/music/MusicPlayerProvider";
import { ScopeProvider } from "@/lib/scope/ScopeContext";

export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      const destination = window.location.pathname + window.location.search;
      router.replace(`/login?next=${encodeURIComponent(destination)}`);
    }
  }, [loading, user, router, pathname]);

  useEffect(() => {
    if (!loading && user) rememberWorkspaceLocation(user.id, pathname + window.location.search);
  }, [loading, user, pathname]);

  if (loading || !user) {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Spinner label="Loading…" />
      </div>
    );
  }

  return (
    <RealtimeProvider>
      <PresenceProvider>
        <NotificationProvider>
          <MusicPlayerProvider>
            <ScopeProvider>
              <AppShell>{children}</AppShell>
            </ScopeProvider>
          </MusicPlayerProvider>
        </NotificationProvider>
      </PresenceProvider>
    </RealtimeProvider>
  );
}
