/* Shared fetch wrapper for all API modules:
   - injects `Authorization: Bearer <access>`
   - on 401, transparently refreshes the token once and retries
   - parses RFC7807 error bodies into a typed AppError
*/

import type { ProblemDetails, TokenResponse } from "@/lib/types";
import {
  clearSession,
  getAccessToken,
  getRefreshToken,
  setAccessToken,
} from "@/lib/auth/token-store";

// Relative by default: the Next.js rewrite in next.config.ts proxies
// /api/v1/* to the backend (INTERNAL_API_URL), so one build works everywhere.
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/v1";

/** Resolve API-returned relative resource URLs against the configured API.
 * Static production is hosted on a different origin, so resolving `/api/v1`
 * against `window.location` would incorrectly request the CloudFront site. */
export function resolveApiResourceUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/api/v1")) {
    return `${API_BASE_URL.replace(/\/$/, "")}${url.slice("/api/v1".length)}`;
  }
  return `${API_BASE_URL.replace(/\/$/, "")}/${url.replace(/^\//, "")}`;
}

export class AppError extends Error {
  status: number;
  type: string;
  problem?: ProblemDetails;
  constructor(message: string, status: number, type: string, problem?: ProblemDetails) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.type = type;
    this.problem = problem;
  }
  /** Flatten RFC7807 `details.errors` field-map into readable lines. */
  fieldErrors(): string[] {
    const errs = this.problem?.details?.errors as
      | Record<string, string[]>
      | undefined;
    if (!errs) return [];
    return Object.entries(errs).flatMap(([field, msgs]) =>
      msgs.map((m) => (field === "__root__" ? m : `${field}: ${m}`)),
    );
  }
}

type Options = Omit<RequestInit, "body"> & {
  body?: unknown;
  /** multipart/form-data — pass a FormData body and skip JSON encoding */
  formData?: FormData;
  auth?: boolean; // default true
};

let refreshInFlight: Promise<boolean> | null = null;

/** Refresh the access token using the stored refresh token. De-duped. */
async function refreshAccessToken(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  const refresh = getRefreshToken();
  if (!refresh) return false;

  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refresh }),
      });
      if (!res.ok) {
        clearSession();
        return false;
      }
      const data = (await res.json()) as TokenResponse;
      // Rotated refresh token is persisted by the caller (AuthProvider) via a
      // 'session' event; here we only need the fresh access token in memory,
      // but we also stash the new refresh token to keep rotation intact.
      setAccessToken(data.access_token);
      window.localStorage.setItem("pmp.refresh_token", data.refresh_token);
      window.localStorage.setItem("pmp.user", JSON.stringify(data.user));
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

async function parseError(res: Response): Promise<AppError> {
  let problem: ProblemDetails | undefined;
  try {
    problem = (await res.json()) as ProblemDetails;
  } catch {
    /* non-JSON error body */
  }
  const title = problem?.title ?? res.statusText ?? "Request failed";
  return new AppError(title, res.status, problem?.type ?? "error", problem);
}

async function doFetch(path: string, opts: Options): Promise<Response> {
  const { body, formData, auth = true, headers, ...rest } = opts;
  const h = new Headers(headers);
  if (auth) {
    const token = getAccessToken();
    if (token) h.set("Authorization", `Bearer ${token}`);
  }
  let payload: BodyInit | undefined;
  if (formData) {
    payload = formData; // let the browser set the multipart boundary
  } else if (body !== undefined) {
    h.set("Content-Type", "application/json");
    payload = JSON.stringify(body);
  }
  return fetch(`${API_BASE_URL}${path}`, { ...rest, headers: h, body: payload });
}

export async function apiFetch<T>(path: string, opts: Options = {}): Promise<T> {
  let res = await doFetch(path, opts);

  if (res.status === 401 && (opts.auth ?? true)) {
    const ok = await refreshAccessToken();
    if (ok) {
      res = await doFetch(path, opts);
    }
  }

  if (!res.ok) throw await parseError(res);

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
