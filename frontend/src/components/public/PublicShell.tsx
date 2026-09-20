"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ArrowUpRight, Menu } from "lucide-react";
import { BrandMark } from "./BrandMark";

const links = [
  { href: "/#method", label: "Method" },
  { href: "/#workspaces", label: "Workspaces", sup: "04" },
  { href: "/#capabilities", label: "Capabilities", sup: "06" },
  { href: "/docs", label: "Docs" },
  { href: "/tutorials", label: "Tutorials" },
];

export function PublicShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "";
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="substance-site">
      <a className="pmp-skip-link" href="#public-main">
        Skip to main content
      </a>

      {/* FIXED CAPSULE NAV (SUBSTANCE LAB PATTERN) */}
      <nav aria-label="Public navigation" className="public-capsule-nav">
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
                  {link.sup && <sup className="sub-tag">{link.sup}</sup>}
                </Link>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <button className="lg:hidden" aria-label="Open navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}><Menu size={20} /></button>
            <Link href="/login" className="substance-nav-login">
              Log in
            </Link>
            <Link href="/app" className="substance-nav-cta">
              <span>Open App</span>
              <ArrowUpRight size={14} />
            </Link>
          </div>
        </div>
        {menuOpen && <div aria-label="Mobile public navigation" role="navigation" className="bg-white text-black rounded-xl p-4 flex flex-col gap-3 lg:hidden">
          {links.map(link => <Link key={link.href} href={link.href} onClick={() => setMenuOpen(false)}>{link.label}</Link>)}
          <Link href="/login" onClick={() => setMenuOpen(false)}>Log in</Link>
        </div>}
      </nav>

      <main id="public-main" tabIndex={-1}>
        {children}
      </main>

      {/* SUBSTANCE LAB MINIMALIST FOOTER */}
      <footer className="substance-footer">
        <div className="public-container substance-footer-inner">
          <div className="footer-brand-wrap">
            <BrandMark />
            <p className="footer-lead">
              Unified knowledge, agile execution, and real-time collaboration for engineering teams.
            </p>
          </div>

          <div className="footer-links-row">
            <Link href="/#method">Method</Link>
            <Link href="/#workspaces">Workspaces</Link>
            <Link href="/#capabilities">Capabilities</Link>
            <Link href="/docs">Documentation</Link>
            <Link href="/tutorials">Tutorials</Link>
            <Link href="/login">Log in</Link>
            <a href="https://github.com/ali-Eskandarian/project-management-platform" target="_blank" rel="noreferrer">
              GitHub
            </a>
          </div>

          <div className="footer-copy-bar">
            <span>© {new Date().getFullYear()} Project Management Platform</span>
            <span>Project Management Platform Ecosystem</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
