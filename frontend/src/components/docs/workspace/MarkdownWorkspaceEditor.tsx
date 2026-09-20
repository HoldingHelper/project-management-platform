"use client";

import { useEffect, useRef, useState } from "react";
import {
  Save,
  Check,
  Loader2,
  Eye,
  Columns,
  Edit3,
  Network,
  Hash,
  BookOpen,
} from "lucide-react";
import {
  getDocPage,
  updateDocPage,
  getWikilinkSuggestions,
  type DocPage,
} from "@/lib/api/docs";
import { useKnowledgeWorkspace } from "@/lib/stores/knowledgeWorkspaceStore";
import { MarkdownPreview } from "@/components/ds/MarkdownPreview";

export function MarkdownWorkspaceEditor({ pageId }: { pageId: string }) {
  const { setTabDirty, setTabTitle, openTab } = useKnowledgeWorkspace();
  const [page, setPage] = useState<DocPage | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [docType, setDocType] = useState<string>("document");
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const [viewMode, setViewMode] = useState<"split" | "edit" | "preview">("split");

  // WikiLink autocomplete popup state
  const [wikilinkPopup, setWikilinkPopup] = useState<{
    open: boolean;
    query: string;
    startIndex: number;
    cursorPos: number;
  }>({ open: false, query: "", startIndex: -1, cursorPos: -1 });

  const [suggestions, setSuggestions] = useState<Array<{ title: string; slug: string; doc_type: string }>>([]);
  const [suggestionIndex, setSuggestionIndex] = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Load page data
  useEffect(() => {
    let active = true;
    const fetchPage = async () => {
      try {
        const data = await getDocPage(pageId);
        if (active) {
          setPage(data);
          setTitle(data.title);
          setContent(data.content || "");
          setDocType(data.doc_type || "document");
          setTabTitle(pageId, data.title);
          setSaveStatus("saved");
          setTabDirty(pageId, false);
        }
      } catch (err) {
        console.error("Failed to load page:", err);
      }
    };
    fetchPage();
    return () => {
      active = false;
    };
  }, [pageId, setTabTitle, setTabDirty]);

  // Debounced Autosave (750ms)
  const triggerAutosave = (newTitle: string, newContent: string, newType: string) => {
    setSaveStatus("unsaved");
    setTabDirty(pageId, true);

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(async () => {
      setSaveStatus("saving");
      try {
        const updated = await updateDocPage(pageId, {
          title: newTitle,
          content: newContent,
          doc_type: newType,
        });
        setPage(updated);
        setTabTitle(pageId, updated.title);
        setSaveStatus("saved");
        setTabDirty(pageId, false);
      } catch (err) {
        console.error("Autosave failed:", err);
        setSaveStatus("unsaved");
      }
    }, 750);
  };

  const handleTitleChange = (val: string) => {
    setTitle(val);
    setTabTitle(pageId, val);
    triggerAutosave(val, content, docType);
  };

  const handleDocTypeChange = (newType: string) => {
    setDocType(newType);
    triggerAutosave(title, content, newType);
  };

  const handleContentChange = (val: string) => {
    setContent(val);
    triggerAutosave(title, val, docType);

    // Check for WikiLink [[ trigger
    if (textareaRef.current) {
      const cursor = textareaRef.current.selectionStart;
      const textBeforeCursor = val.slice(0, cursor);
      const lastDoubleOpen = textBeforeCursor.lastIndexOf("[[");

      if (lastDoubleOpen !== -1 && !textBeforeCursor.slice(lastDoubleOpen).includes("]]")) {
        const query = textBeforeCursor.slice(lastDoubleOpen + 2);
        setWikilinkPopup({
          open: true,
          query,
          startIndex: lastDoubleOpen,
          cursorPos: cursor,
        });
      } else {
        setWikilinkPopup({ open: false, query: "", startIndex: -1, cursorPos: -1 });
      }
    }
  };

  // Fetch suggestions when query changes
  useEffect(() => {
    if (!wikilinkPopup.open) {
      setSuggestions([]);
      return;
    }
    let active = true;
    const fetchSuggestions = async () => {
      try {
        const res = await getWikilinkSuggestions(wikilinkPopup.query, page?.space_id);
        if (active) {
          setSuggestions(res);
          setSuggestionIndex(0);
        }
      } catch (e) {
        console.error("Failed to fetch wikilink suggestions", e);
      }
    };
    const timer = setTimeout(fetchSuggestions, 80);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [wikilinkPopup.open, wikilinkPopup.query, page?.space_id]);

  const insertWikilink = (targetTitle: string) => {
    if (!textareaRef.current || wikilinkPopup.startIndex === -1) return;
    const before = content.slice(0, wikilinkPopup.startIndex);
    const after = content.slice(wikilinkPopup.cursorPos);
    const insertion = `[[${targetTitle}]]`;
    const newContent = before + insertion + after;

    setContent(newContent);
    triggerAutosave(title, newContent, docType);
    setWikilinkPopup({ open: false, query: "", startIndex: -1, cursorPos: -1 });

    setTimeout(() => {
      if (textareaRef.current) {
        const newCursor = before.length + insertion.length;
        textareaRef.current.setSelectionRange(newCursor, newCursor);
        textareaRef.current.focus();
      }
    }, 10);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (wikilinkPopup.open && suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSuggestionIndex((prev) => (prev + 1) % suggestions.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSuggestionIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertWikilink(suggestions[suggestionIndex].title);
      } else if (e.key === "Escape") {
        setWikilinkPopup({ open: false, query: "", startIndex: -1, cursorPos: -1 });
      }
    }
  };

  if (!page) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500">
        <Loader2 size={20} className="animate-spin text-indigo-400" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden relative">
      {/* Editor Top Bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-slate-950/90 select-none">
        <div className="flex items-center gap-3 flex-1 mr-4">
          <input
            type="text"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Document Title..."
            className="text-base font-semibold bg-transparent border-b border-transparent hover:border-white/10 focus:border-indigo-500 px-1 py-0.5 outline-none flex-1 text-white"
          />

          {/* Doc Type Selector */}
          <select
            value={docType}
            onChange={(e) => handleDocTypeChange(e.target.value)}
            className="text-xs bg-slate-900 border border-white/10 rounded px-2 py-1 text-slate-300 outline-none"
          >
            <option value="document">Document</option>
            <option value="adr">Architecture Decision (ADR)</option>
            <option value="runbook">Runbook</option>
            <option value="rfc">RFC</option>
          </select>
        </div>

        {/* View Mode & Save Status */}
        <div className="flex items-center gap-3">
          {/* Status Indicator */}
          <div className="flex items-center gap-1.5 text-xs">
            {saveStatus === "saved" && (
              <span className="flex items-center gap-1 text-emerald-400">
                <Check size={13} />
                <span className="text-[11px]">Saved</span>
              </span>
            )}
            {saveStatus === "saving" && (
              <span className="flex items-center gap-1 text-indigo-400">
                <Loader2 size={13} className="animate-spin" />
                <span className="text-[11px]">Saving...</span>
              </span>
            )}
            {saveStatus === "unsaved" && (
              <span className="text-[11px] text-amber-400">Unsaved</span>
            )}
          </div>

          <div className="h-4 w-px bg-white/10" />

          {/* View Mode Toggle */}
          <div className="flex items-center bg-slate-900 p-0.5 rounded border border-white/5">
            <button
              type="button"
              onClick={() => setViewMode("edit")}
              className={`p-1 rounded ${viewMode === "edit" ? "bg-slate-800 text-white" : "text-slate-400 hover:text-white"}`}
              title="Editor Only"
            >
              <Edit3 size={13} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("split")}
              className={`p-1 rounded ${viewMode === "split" ? "bg-slate-800 text-white" : "text-slate-400 hover:text-white"}`}
              title="Split View"
            >
              <Columns size={13} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("preview")}
              className={`p-1 rounded ${viewMode === "preview" ? "bg-slate-800 text-white" : "text-slate-400 hover:text-white"}`}
              title="Preview Only"
            >
              <Eye size={13} />
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              openTab({
                id: `graph:${pageId}`,
                pageId,
                title: `${title} - Local Graph`,
                viewMode: "graph",
              });
            }}
            className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-slate-900 rounded transition-colors"
            title="View Local Knowledge Graph"
          >
            <Network size={14} />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Editor Pane */}
        {(viewMode === "edit" || viewMode === "split") && (
          <div className={`flex-1 flex flex-col ${viewMode === "split" ? "border-r border-white/5" : ""}`}>
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => handleContentChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Write markdown here... Type [[ to link another doc, # to add a tag..."
              className="flex-1 w-full p-4 bg-transparent text-sm text-slate-200 font-mono leading-relaxed outline-none resize-none no-scrollbar"
              spellCheck={false}
            />
          </div>
        )}

        {/* Preview Pane */}
        {(viewMode === "preview" || viewMode === "split") && (
          <div className="flex-1 p-6 overflow-y-auto bg-slate-950/50">
            <h1 className="text-2xl font-bold text-white mb-4">{title || "Untitled"}</h1>
            <MarkdownPreview value={content} />
          </div>
        )}

        {/* Inline WikiLink Suggestion Popup */}
        {wikilinkPopup.open && suggestions.length > 0 && (
          <div
            className="absolute z-50 bottom-12 left-8 w-80 max-h-56 bg-slate-900 border border-indigo-500/40 rounded-lg shadow-2xl overflow-y-auto p-1 text-xs"
          >
            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500 border-b border-white/5">
              Link to page (↑↓ to select, Enter to insert)
            </div>
            {suggestions.map((s, idx) => {
              const isSelected = idx === suggestionIndex;
              return (
                <div
                  key={s.slug}
                  onClick={() => insertWikilink(s.title)}
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded cursor-pointer ${
                    isSelected ? "bg-indigo-600 text-white font-medium" : "text-slate-300 hover:bg-slate-800"
                  }`}
                >
                  <span className="truncate">{s.title}</span>
                  <span className="text-[10px] uppercase opacity-70 ml-2 font-mono">
                    {s.doc_type}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
