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
import * as authApi from "@/lib/api/auth";
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
  const [user, setUser] = useState<UserRead | null>(null);
  const [loading, setLoading] = useState(true);

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

  const login = useCallback(async (identifier: string, password: string) => {
    const res = await authApi.login(identifier, password);
    setSession(res.access_token, res.refresh_token, res.user);
    setAccessToken(res.access_token);
    setUser(res.user);
  }, []);

  const adoptSession = useCallback((session: TokenResponse) => {
    setSession(session.access_token, session.refresh_token, session.user);
    setAccessToken(session.access_token);
    setUser(session.user);
  }, []);

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
    clearSession();
    setUser(null);
  }, []);

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
