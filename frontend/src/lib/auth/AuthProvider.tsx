"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { accountPreferences } from "@/lib/i18n/core";
import { applyAppearance, getStoredAppearance, normalizeAppearance } from "@/lib/theme";
import { getMySettings, getPlatformLanguage } from "@/lib/api/users";
import * as authApi from "@/lib/api/auth";
import { refreshAccessToken } from "@/lib/api/client";
import type { TokenResponse, UserRead } from "@/lib/types";
import {
  clearSession,
  getRefreshToken,
  getStoredUser,
  setAccessToken,
  setSession,
} from "./token-store";

interface AuthState {
  user: UserRead | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (...codes: string[]) => boolean;
  isSuperAdmin: () => boolean;
  /** Adopt a session obtained outside login (invitation accept). */
  adoptSession: (session: TokenResponse) => void;
  /** Refresh the cached user object (after profile edits). */
  setUser: (user: UserRead) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { setPreferences } = useI18n();
  const queryClient = useQueryClient();
  const [user, setUser] = useState<UserRead | null>(null);
  const [loading, setLoading] = useState(true);
  const platformLanguage = useQuery({ queryKey: ["platform-language"], queryFn: getPlatformLanguage, staleTime: 30000, refetchInterval: 60000 });
  useEffect(() => {
    if (user) setPreferences(accountPreferences(user, platformLanguage.data?.locale));
    else if (platformLanguage.data) setPreferences({ locale: platformLanguage.data.locale });
  }, [user?.id, user?.locale, user?.calendar, user?.numbering_system, platformLanguage.data?.locale, setPreferences]);

  const appearanceSettings = useQuery({ queryKey: ["my-settings", user?.id], queryFn: getMySettings, enabled: !!user && !loading, staleTime: 60000 });
  useEffect(() => {
    if (!user || loading || !appearanceSettings.data) return;
    applyAppearance(normalizeAppearance(appearanceSettings.data, getStoredAppearance(user.id)), user.id);
  }, [user?.id, loading, appearanceSettings.data]);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => { const current = getStoredAppearance(); if (current.theme === "system") applyAppearance(current, user?.id); };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [user?.id]);

  // On mount, restore a session from the persisted refresh token.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const refresh = getRefreshToken();
      if (!refresh) {
        setLoading(false);
        return;
      }
      // Optimistically show the stored user while we refresh the access token.
      const cached = getStoredUser();
      if (cached) setUser(cached);
      try {
        const res = await authApi.refresh(refresh);
        if (cancelled) return;
        setSession(res.access_token, res.refresh_token, res.user);
        setUser(res.user);
      } catch {
        if (!cancelled) {
          clearSession();
          setUser(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Proactive token refresh: access tokens expire in 15 minutes.
  // Refresh periodically every 10 minutes while the session is active.
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(async () => {
      await refreshAccessToken();
    }, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [user]);

  const login = useCallback(async (identifier: string, password: string) => {
    const res = await authApi.login(identifier, password);
    queryClient.clear();
    setSession(res.access_token, res.refresh_token, res.user);
    setAccessToken(res.access_token);
    setUser(res.user);
  }, [queryClient]);

  const adoptSession = useCallback((session: TokenResponse) => {
    queryClient.clear();
    setSession(session.access_token, session.refresh_token, session.user);
    setAccessToken(session.access_token);
    setUser(session.user);
  }, [queryClient]);

  const updateUser = useCallback((next: UserRead) => {
    setUser(next);
    window.localStorage.setItem("pmp.user", JSON.stringify(next));
  }, []);

  const logout = useCallback(async () => {
    const refresh = getRefreshToken();
    if (refresh) {
      try {
        await authApi.logout(refresh);
      } catch {
        /* best-effort */
      }
    }
    queryClient.clear();
    clearSession();
    setUser(null);
  }, [queryClient]);

  const hasPermission = useCallback(
    (...codes: string[]) => {
      if (!user) return false;
      if (user.roles.includes("SuperAdmin")) return true;
      return codes.some((c) => user.permissions.includes(c));
    },
    [user],
  );

  const isSuperAdmin = useCallback(
    () => !!user && user.roles.includes("SuperAdmin"),
    [user],
  );

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      logout,
      hasPermission,
      isSuperAdmin,
      adoptSession,
      setUser: updateUser,
    }),
    [user, loading, login, logout, hasPermission, isSuperAdmin, adoptSession, updateUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
