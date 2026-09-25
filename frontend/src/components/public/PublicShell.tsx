"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUpRight, Menu } from "lucide-react";
import { BrandMark } from "./BrandMark";

const links = [
  { href: "/#workspaces", label: "Product" },
  { href: "/#capabilities", label: "Capabilities" },
  { href: "/docs", label: "Docs" },
  { href: "/tutorials", label: "Tutorials" },
];

export function PublicShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "";
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const navigation = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuButton.current?.focus();
      }
    };
    const onPointer = (event: PointerEvent) => {
      if (!navigation.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [menuOpen]);

  return (
    <div className="substance-site">
      <a className="pmp-skip-link" href="#public-main">
        Skip to main content
      </a>

      <nav ref={navigation} aria-label="Public navigation" className="public-capsule-nav">
        <div className="substance-capsule-bar">
          <BrandMark href="/" />

          <div className="hidden lg:flex items-center gap-1 text-sm text-black/60 dark:text-white/60">
            {links.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.label}
                  href={link.href}
                  className={`substance-nav-link ${isActive ? "active" : ""}`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>

          <div className="pp-nav-actions flex items-center gap-2">
            <button ref={menuButton} type="button" className="pp-menu-toggle lg:hidden" aria-label="Open navigation" aria-controls="public-mobile-navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}><Menu size={20} /></button>
            <Link href="/login" className="substance-nav-login">
              Log in
            </Link>
            <Link href="/app" className="substance-nav-cta">
              <span>Open App</span>
              <ArrowUpRight size={14} />
            </Link>
          </div>
        </div>
        {menuOpen && <div id="public-mobile-navigation" aria-label="Mobile public navigation" role="navigation" className="pp-mobile-menu lg:hidden">
          {links.map(link => <Link key={link.href} href={link.href} onClick={() => setMenuOpen(false)}>{link.label}</Link>)}
          <Link href="/login" onClick={() => setMenuOpen(false)}>Log in</Link>
        </div>}
      </nav>

      <main id="public-main" tabIndex={-1}>
        {children}
      </main>

      <footer className="substance-footer">
        <div className="public-container substance-footer-inner">
          <div className="footer-brand-wrap">
            <BrandMark />
            <p className="footer-lead">
              One connected workspace for projects, team knowledge, and everyday delivery.
            </p>
          </div>

          <div className="footer-links-row">
            <Link href="/#workspaces">Product</Link>
            <Link href="/#capabilities">Capabilities</Link>
            <Link href="/docs">Documentation</Link>
            <Link href="/tutorials">Tutorials</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/login">Log in</Link>
            <a href="https://github.com/ali-Eskandarian/project-management-platform" target="_blank" rel="noreferrer">
              GitHub
            </a>
          </div>

          <div className="footer-copy-bar">
            <span>© {new Date().getFullYear()} Project Management Platform</span>
            <span>Tasks · Docs · Projects</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
