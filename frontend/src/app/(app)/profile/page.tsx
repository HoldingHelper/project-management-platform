"use client";

import { useAuth } from "@/lib/auth/AuthProvider";
import { PAGE_STYLE, Spinner } from "@/components/ui/States";
import ProfileClient from "./[userId]/ProfileClient";

export default function MyProfilePage() {
  const { user } = useAuth();
  if (!user) return <div style={PAGE_STYLE}><Spinner label="Loading profile…" /></div>;
  return <ProfileClient profileId={user.id} />;
}
