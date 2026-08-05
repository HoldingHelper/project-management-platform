/* Token store. Access token lives in memory only; refresh token is persisted
   to localStorage so a page reload can re-establish the session. (Dev tradeoff
   — production should move the refresh token to an httpOnly cookie.) */

import type { UserRead } from "@/lib/types";
import { displayName } from "@/lib/format";

const REFRESH_KEY = "pmp.refresh_token";
const USER_KEY = "pmp.user";

let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(REFRESH_KEY);
}

export function getStoredUser(): UserRead | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    const user = JSON.parse(raw) as UserRead;
    return { ...user, full_name: displayName(user.full_name) };
  } catch {
    return null;
  }
}

export function setSession(access: string, refresh: string, user: UserRead): void {
  accessToken = access;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(REFRESH_KEY, refresh);
    window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
}

export function setAccessToken(access: string): void {
  accessToken = access;
}

export function clearSession(): void {
  accessToken = null;
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(REFRESH_KEY);
    window.localStorage.removeItem(USER_KEY);
  }
}
