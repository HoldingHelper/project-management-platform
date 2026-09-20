"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { BookOpenText, Search, X } from "lucide-react";
import { PUBLIC_DOCS } from "@/lib/docs/content";
import { API_BASE_URL } from "@/lib/api/client";

export function DocsSearch({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [publishedResults, setPublishedResults] = useState<Array<{ category: string; slug: string; title: string; description: string; href: string }>>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setOpen(true); }
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);
  useEffect(() => { if (open) requestAnimationFrame(() => inputRef.current?.focus()); }, [open]);
  const localResults = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return PUBLIC_DOCS.slice(0, 6);
    return PUBLIC_DOCS.map((doc) => ({
      doc,
      score: words.reduce((sum, word) => sum + (doc.title.toLowerCase().includes(word) ? 5 : 0) + (doc.tags.some((tag) => tag.includes(word)) ? 3 : 0) + (doc.description.toLowerCase().includes(word) ? 2 : 0) + (doc.sections.some((section) => `${section.title} ${section.body}`.toLowerCase().includes(word)) ? 1 : 0), 0),
    })).filter(({ score }) => score > 0).sort((a, b) => b.score - a.score).slice(0, 8).map(({ doc }) => doc);
  }, [query]);
  useEffect(() => {
    const needle = query.trim();
    if (needle.length < 2) { setPublishedResults([]); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/docs/public/search?q=${encodeURIComponent(needle)}`, { signal: controller.signal });
        if (!response.ok) return;
        const matches = await response.json() as Array<{ page_id: string; space_slug: string; page_slug: string; title: string; excerpt?: string | null }>;
        setPublishedResults(matches.map((match) => ({ category: match.space_slug, slug: match.page_slug, title: match.title, description: match.excerpt || "Published workspace guide", href: `/docs/shared/${match.page_id}` })));
      } catch {
        if (!controller.signal.aborted) setPublishedResults([]);
      }
    }, 220);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query]);
  const results = useMemo(() => {
    const localKeys = new Set(localResults.map((doc) => `${doc.category}/${doc.slug}`));
    return [...localResults.map((doc) => ({ ...doc, href: `/docs/${doc.category}/${doc.slug}` })), ...publishedResults.filter((doc) => !localKeys.has(`${doc.category}/${doc.slug}`)).map((doc) => ({ ...doc, categoryLabel: "Published", tags: [], sections: [] }))].slice(0, 8);
  }, [localResults, publishedResults]);
  return <>
    <button type="button" className={compact ? "docs-search-trigger compact" : "docs-search-trigger"} onClick={() => setOpen(true)} aria-label="Search documentation"><Search size={17}/><span>Search documentation…</span><kbd>⌘ K</kbd></button>
    {open && createPortal(<div className="docs-search-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="docs-search-dialog" role="dialog" aria-modal="true" aria-label="Search documentation">
        <div className="docs-search-input"><Search size={19}/><label htmlFor="docs-search-field" className="sr-only">Search titles, guides, categories, and tutorials</label><input ref={inputRef} id="docs-search-field" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search titles, guides, categories, and tutorials"/><button type="button" onClick={() => query ? setQuery("") : setOpen(false)} aria-label={query ? "Reset search field" : "Close search"}><X size={18}/></button></div>
        <div className="docs-search-results" aria-live="polite"><div className="docs-search-count">{query ? `${results.length} ${results.length === 1 ? "result" : "results"} for “${query}”` : "Suggested guides"}</div>{results.map((doc) => <Link key={`${doc.category}/${doc.slug}`} href={doc.href} onClick={() => setOpen(false)}><BookOpenText size={18}/><span><b>{doc.title}</b><small>{doc.categoryLabel} · {doc.description}</small></span></Link>)}{results.length === 0 && <div className="docs-zero"><h2>No results for “{query}”</h2><p>Check the spelling, try a broader term such as “tasks” or “permissions,” or browse the categories.</p><button type="button" onClick={() => setQuery("")}>Clear search</button></div>}</div>
        <footer><span><kbd>Enter</kbd> open</span><span><kbd>Esc</kbd> close</span></footer>
      </section>
    </div>, document.body)}
  </>;
}
