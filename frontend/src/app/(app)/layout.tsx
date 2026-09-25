"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
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

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

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
