"use client";

import { useEffect, useState, type SetStateAction } from "react";

/** Keep view controls on the history entry they belong to, not globally. */
export function useViewState<T>(key: string, initial: T) {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    const restore = () => {
      const saved = window.history.state?.pmpView;
      setValue(saved?.path === location.pathname && key in saved.values ? saved.values[key] : initial);
    };
    restore();
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
    // Initial values belong to this mounted view; URL changes are handled by callers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const update = (action: SetStateAction<T>) => {
    const next = typeof action === "function" ? (action as (previous: T) => T)(value) : action;
    const state = window.history.state ?? {};
    const values = state.pmpView?.path === location.pathname ? state.pmpView.values : {};
    window.history.replaceState({ ...state, pmpView: { path: location.pathname, values: { ...values, [key]: next } } }, "");
    setValue(next);
  };
  return [value, update] as const;
}

export function openTaskPreview(id: string) {
  const url = new URL(window.location.href);
  if (url.searchParams.get("task") === id) return;
  url.searchParams.set("task", id);
  const { pmpView, pmpScroll, pmpReturnTo } = window.history.state ?? {};
  window.history.pushState({ pmpView, pmpScroll, pmpReturnTo, pmpTaskPreview: true }, "", url);
}

export function closeTaskPreview() {
  if (window.history.state?.pmpTaskPreview) window.history.back();
  else {
    const url = new URL(window.location.href);
    url.searchParams.delete("task");
    const { pmpView, pmpScroll, pmpReturnTo } = window.history.state ?? {};
    window.history.replaceState({ pmpView, pmpScroll, pmpReturnTo }, "", url);
  }
}

export function goBack(fallback: string) {
  if (window.history.state?.pmpReturnTo) window.history.back();
  else window.location.replace(fallback);
}
