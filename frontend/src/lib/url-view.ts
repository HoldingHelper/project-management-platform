"use client";

import { useCallback, useEffect, useState } from "react";

/** Keep a page-level view in the visible URL so refresh, sharing, and Back agree. */
export function useUrlView<const T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T,
) {
  const read = useCallback((): T => {
    if (typeof window === "undefined") return fallback;
    const candidate = new URL(window.location.href).searchParams.get(key);
    return allowed.includes(candidate as T) ? (candidate as T) : fallback;
  }, [allowed, fallback, key]);
  const [value, setValue] = useState<T>(fallback);

  useEffect(() => {
    const sync = () => setValue(read());
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [read]);

  const update = useCallback((next: T) => {
    const url = new URL(window.location.href);
    if (next === fallback) url.searchParams.delete(key);
    else url.searchParams.set(key, next);
    window.history.pushState(window.history.state, "", url);
    setValue(next);
  }, [fallback, key]);

  return [value, update] as const;
}
