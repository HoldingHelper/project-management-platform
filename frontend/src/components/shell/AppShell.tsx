"use client";

import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { GlobalSearch } from "./GlobalSearch";
import { MobileNavigation } from "./MobileNavigation";
import { DocsSidebar } from "@/components/docs/DocsSidebar";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const docsModule = pathname.startsWith("/app/docs");

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  useEffect(() => {
    mainRef.current?.focus({ preventScroll: true });
  }, [pathname]);

  return (
    <div
      className="pmp-app-shell"
      style={{
        display: "flex",
        height: "100vh",
        width: "100%",
        overflow: "hidden",
        background: "var(--surface-deepest)",
        color: "var(--text-primary)",
      }}
    >
      <a className="pmp-skip-link" href="#main-content">Skip to main content</a>
      <div className="pmp-desktop-sidebar">
        {docsModule ? <DocsSidebar /> : <Sidebar />}
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, height: "100%" }}>
        <Header onOpenSearch={() => setSearchOpen(true)} />
        <main ref={mainRef} id="main-content" tabIndex={-1} className="pmp-app-main" style={{ flex: 1, overflowY: "auto", minHeight: 0, minWidth: 0 }}>{children}</main>
      </div>
      <div className="pmp-chat-slot">
        {!docsModule && <Suspense fallback={null}><ChatPanel /></Suspense>}
      </div>
      {!docsModule && <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />}
      {!docsModule && <MobileNavigation />}
    </div>
  );
}
