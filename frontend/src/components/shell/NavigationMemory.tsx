"use client";

import { useEffect, useRef, type RefObject } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Modal } from "@/components/ds/Modal";
import { closeTaskPreview, openTaskPreview } from "@/lib/navigation";
import type { UUID } from "@/lib/types";

const TaskDetail = dynamic(() => import("@/app/(app)/tasks/[taskId]/TaskDetailClient"), {
  loading: () => <div role="status" style={{ padding: 24 }}>Loading task details…</div>,
});
const taskPath = /^(?:\/app\/teams)?\/tasks\/([a-f0-9-]{36})\/?$/i;

export function NavigationMemory({ mainRef }: { mainRef: RefObject<HTMLElement | null> }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const taskId = params.get("task");
  const previousPath = useRef(pathname);
  const origin = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    let restoring = true;
    const state = history.state ?? {};
    if (previousPath.current !== pathname && !state.pmpReturnTo) {
      history.replaceState({ ...state, pmpReturnTo: previousPath.current }, "");
    }
    previousPath.current = pathname;
    const target = state.pmpScroll?.path === pathname ? state.pmpScroll.top : 0;
    const restore = () => { if (restoring) main.scrollTop = target; };
    restore();
    const observer = new ResizeObserver(restore);
    for (const child of main.children) observer.observe(child);
    const stop = () => { restoring = false; observer.disconnect(); };
    const timer = window.setTimeout(stop, 2500);
    const save = () => {
      if (!restoring) history.replaceState({ ...history.state, pmpScroll: { path: pathname, top: main.scrollTop } }, "");
    };
    main.addEventListener("scroll", save, { passive: true });
    main.addEventListener("wheel", stop, { passive: true });
    main.addEventListener("touchstart", stop, { passive: true });
    main.addEventListener("keydown", stop);
    const capture = (event: MouseEvent) => {
      if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element).closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href);
      if (url.origin !== location.origin) return;
      stop();
      save();
      const match = taskPath.exec(url.pathname);
      if (match && !anchor.hasAttribute("data-full-page") && matchMedia("(min-width: 768px)").matches) {
        event.preventDefault();
        event.stopPropagation();
        origin.current = anchor;
        openTaskPreview(match[1]);
      }
    };
    document.addEventListener("click", capture, true);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
      main.removeEventListener("scroll", save);
      main.removeEventListener("wheel", stop);
      main.removeEventListener("touchstart", stop);
      main.removeEventListener("keydown", stop);
      document.removeEventListener("click", capture, true);
    };
  }, [pathname, mainRef]);

  useEffect(() => {
    if (!taskId) origin.current?.focus({ preventScroll: true });
  }, [taskId]);

  return <Modal open={Boolean(taskId)} onClose={closeTaskPreview} title="Task details" width={1200} fullScreenMobile closeOnBackdrop={false}>
    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
      <Link data-full-page href={`/tasks/${taskId}`} style={{ color: "var(--text-link)" }}>Open full page →</Link>
    </div>
    {taskId && <TaskDetail key={taskId} taskId={taskId as UUID} embedded onClose={closeTaskPreview} />}
  </Modal>;
}
