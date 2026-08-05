import { apiFetch } from "./client";
import type { TokenResponse } from "@/lib/types";
import { displayName } from "@/lib/format";

function normalizeSession(session: TokenResponse): TokenResponse {
  return {
    ...session,
    user: {
      ...session.user,
      first_name: session.user.first_name === "-" ? "" : session.user.first_name,
      last_name: session.user.last_name === "-" ? "" : session.user.last_name,
      full_name: displayName(session.user.full_name),
    },
  };
}

export function login(identifier: string, password: string) {
  // `identifier` accepts an email address or a username (e.g. "admin").
  return apiFetch<TokenResponse>("/auth/login", {
    method: "POST",
    auth: false,
    body: { identifier, password },
  }).then(normalizeSession);
}

export function refresh(refresh_token: string) {
  return apiFetch<TokenResponse>("/auth/refresh", {
    method: "POST",
    auth: false,
    body: { refresh_token },
  }).then(normalizeSession);
}

export function logout(refresh_token: string) {
  return apiFetch<void>("/auth/logout", {
    method: "POST",
    body: { refresh_token },
  });
}

export function forgotPassword(email: string) {
  return apiFetch<void>("/auth/forgot-password", {
    method: "POST",
    auth: false,
    body: { email },
  });
}

export function resetPassword(token: string, new_password: string) {
  return apiFetch<void>("/auth/reset-password", {
    method: "POST",
    auth: false,
    body: { token, new_password },
  });
}
