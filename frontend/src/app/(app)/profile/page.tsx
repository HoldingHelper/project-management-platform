"use client";
import { useI18n } from "@/lib/i18n/I18nProvider";

import { useAuth } from "@/lib/auth/AuthProvider";
import { PAGE_STYLE, Spinner } from "@/components/ui/States";
import ProfileClient from "./[userId]/ProfileClient";

export default function MyProfilePage() {
  const { t: translateUI } = useI18n();

  const { user } = useAuth();
  if (!user) return <div style={PAGE_STYLE}><Spinner label={translateUI("Loading profile…")} /></div>;
  return <ProfileClient profileId={user.id} />;
}
