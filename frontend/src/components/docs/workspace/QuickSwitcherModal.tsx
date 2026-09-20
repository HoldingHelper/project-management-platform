"use client";

import { useEffect, useRef, useState } from "react";
import { Search, FileText, BookOpen, Shield, Code, ArrowRight } from "lucide-react";
import { quickSearchDocs, type SearchResultItem } from "@/lib/api/docs";
import { useKnowledgeWorkspace } from "@/lib/stores/knowledgeWorkspaceStore";

export function QuickSwitcherModal() {
  const { quickSwitcherOpen, setQuickSwitcherOpen, openTab } = useKnowledgeWorkspace();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (quickSwitcherOpen) {
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [quickSwitcherOpen]);

  useEffect(() => {
    let active = true;
    const fetchResults = async () => {
      if (!query.trim()) {
        setResults([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const items = await quickSearchDocs(query.trim(), 12);
        if (active) {
          setResults(items);
          setSelectedIndex(0);
        }
      } catch (err) {
        console.error("Quick search error:", err);
      } finally {
        if (active) setLoading(false);
      }
    };

    const timer = setTimeout(fetchResults, 80);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);

  const handleSelect = (item: SearchResultItem) => {
    openTab({
      id: item.id,
      pageId: item.id,
      spaceId: item.space_id,
      title: item.title,
      viewMode: "editor",
    });
    setQuickSwitcherOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (results.length > 0 ? (prev + 1) % results.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (results.length > 0 ? (prev - 1 + results.length) % results.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[selectedIndex]) {
        handleSelect(results[selectedIndex]);
      }
    } else if (e.key === "Escape") {
      setQuickSwitcherOpen(false);
    }
  };

  if (!quickSwitcherOpen) return null;

  const getDocTypeBadge = (docType: string) => {
    switch (docType) {
      case "adr":
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-500/20 text-purple-400 border border-purple-500/30">ADR</span>;
      case "runbook":
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">RUNBOOK</span>;
      case "rfc":
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30">RFC</span>;
      default:
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-400">DOC</span>;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/60 backdrop-blur-sm"
      onClick={() => setQuickSwitcherOpen(false)}
    >
      <div
        data-testid="quick-switcher"
        className="w-full max-w-xl bg-slate-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 bg-slate-950/40">
          <Search size={18} className="text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type page title, slug, or keyword..."
            className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 outline-none"
          />
          {loading && (
            <span className="text-[10px] text-indigo-400 animate-pulse font-mono">
              SEARCHING...
            </span>
          )}
          <span className="text-[10px] font-mono text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">
            ESC
          </span>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          {results.length > 0 ? (
            results.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.id}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                    isSelected ? "bg-indigo-600/20 border border-indigo-500/30 text-white" : "text-slate-300 hover:bg-slate-800/60"
                  }`}
                >
                  <div className="flex items-center gap-2.5 overflow-hidden">
                    <FileText size={15} className={isSelected ? "text-indigo-400" : "text-slate-400"} />
                    <div className="truncate">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{item.title}</span>
                        {getDocTypeBadge(item.doc_type)}
                      </div>
                      {item.excerpt && (
                        <p className="text-xs text-slate-400 truncate max-w-md mt-0.5">
                          {item.excerpt}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 text-slate-500">
                    {item.space_name && (
                      <span className="text-xs text-slate-400">{item.space_name}</span>
                    )}
                    <ArrowRight size={13} className={isSelected ? "text-indigo-400" : "opacity-0"} />
                  </div>
                </div>
              );
            })
          ) : query.trim() ? (
            <div className="py-8 text-center text-xs text-slate-500">
              No matching documents found for &quot;{query}&quot;.
            </div>
          ) : (
            <div className="py-6 px-4 text-xs text-slate-500 text-center">
              Type to search across documents, architecture decisions, and runbooks.
            </div>
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="px-4 py-2 border-t border-white/5 bg-slate-950/60 flex items-center justify-between text-[11px] text-slate-500">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="px-1 py-0.5 bg-slate-800 rounded text-slate-400">↑↓</kbd> Navigate
            </span>
            <span>
              <kbd className="px-1 py-0.5 bg-slate-800 rounded text-slate-400">↵</kbd> Open
            </span>
          </div>
          <span>Quick Switcher</span>
        </div>
      </div>
    </div>
  );
}
