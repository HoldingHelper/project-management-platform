"use client";
import { useI18n } from "@/lib/i18n/I18nProvider";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import { getWorkspaceDestination } from "@/lib/auth/workspace-navigation";
import { Spinner } from "@/components/ui/States";

export default function WorkspaceEntry() {
  const { t: translateUI } = useI18n();

  const router = useRouter();
  const { user } = useAuth();
  useEffect(() => {
    if (user) router.replace(getWorkspaceDestination(user.id));
  }, [router, user]);
  return <div className="pmp-page-center"><Spinner label={translateUI("Opening your workspace…")} /></div>;
}
