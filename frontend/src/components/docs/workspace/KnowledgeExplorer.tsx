"use client";

import { useEffect, useState } from "react";
import {
  Folder,
  FolderOpen,
  FileText,
  Plus,
  Network,
  Hash,
  BookOpen,
  Star,
  Clock,
  ChevronRight,
  ChevronDown,
  Search,
  ExternalLink,
  Trash2,
} from "lucide-react";
import {
  listDocSpaces,
  listDocPages,
  listDocTags,
  listDocSources,
  createDocSource,
  deleteDocSource,
  type DocSpace,
  type DocPageSummary,
  type DocTag,
  type DocSource,
} from "@/lib/api/docs";
import { useKnowledgeWorkspace } from "@/lib/stores/knowledgeWorkspaceStore";

export function KnowledgeExplorer({
  onNewPage,
}: {
  onNewPage?: (spaceId?: string) => void;
}) {
  const {
    openTab,
    activeTabId,
    setQuickSwitcherOpen,
    toggleLeftPanel,
  } = useKnowledgeWorkspace();

  const [spaces, setSpaces] = useState<DocSpace[]>([]);
  const [pagesBySpace, setPagesBySpace] = useState<Record<string, DocPageSummary[]>>({});
  const [expandedSpaces, setExpandedSpaces] = useState<Record<string, boolean>>({});
  const [tags, setTags] = useState<DocTag[]>([]);
  const [sources, setSources] = useState<DocSource[]>([]);
  const [activeSection, setActiveSection] = useState<"spaces" | "tags" | "sources">("spaces");
  const [addSourceModalOpen, setAddSourceModalOpen] = useState(false);
  const [newSourceTitle, setNewSourceTitle] = useState("");
  const [newSourceType, setNewSourceType] = useState<"url" | "text" | "code" | "adr">("url");
  const [newSourceUrl, setNewSourceUrl] = useState("");
  const [newSourceContent, setNewSourceContent] = useState("");
  const [loadingSources, setLoadingSources] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const sp = await listDocSpaces();
      setSpaces(sp);
      // Auto-expand first space
      if (sp.length > 0) {
        setExpandedSpaces({ [sp[0].id]: true });
        loadSpacePages(sp[0].id);
      }
      const tg = await listDocTags();
      setTags(tg);
      const sc = await listDocSources();
      setSources(sc);
    } catch (e) {
      console.error("Failed to load explorer data", e);
    }
  };

  const loadSpacePages = async (spaceId: string) => {
    try {
      const p = await listDocPages(spaceId);
      setPagesBySpace((prev) => ({ ...prev, [spaceId]: p }));
    } catch (e) {
      console.error("Failed to load pages for space", spaceId, e);
    }
  };

  const toggleSpace = (spaceId: string) => {
    setExpandedSpaces((prev) => {
      const next = !prev[spaceId];
      if (next && !pagesBySpace[spaceId]) {
        loadSpacePages(spaceId);
      }
      return { ...prev, [spaceId]: next };
    });
  };

  const handleCreateSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSourceTitle.trim()) return;
    setLoadingSources(true);
    try {
      const created = await createDocSource({
        title: newSourceTitle.trim(),
        source_type: newSourceType,
        url: newSourceType === "url" ? newSourceUrl.trim() : undefined,
        content: newSourceContent,
      });
      setSources((prev) => [created, ...prev]);
      setAddSourceModalOpen(false);
      setNewSourceTitle("");
      setNewSourceUrl("");
      setNewSourceContent("");
    } catch (err) {
      console.error("Failed to create source:", err);
    } finally {
      setLoadingSources(false);
    }
  };

  const handleDeleteSource = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteDocSource(id);
      setSources((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      console.error("Failed to delete source:", err);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 border-r border-white/5 select-none text-slate-300">
      {/* Explorer Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/5">
        <div className="flex items-center gap-2">
          <BookOpen size={15} className="text-indigo-400" />
          <span className="text-xs font-semibold text-white tracking-wide uppercase">
            Knowledge Base
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onNewPage?.()}
            className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
            title="Create New Page"
          >
            <Plus size={14} />
          </button>
          <button
            type="button"
            onClick={() => {
              openTab({
                id: "global-graph",
                title: "Knowledge Graph",
                viewMode: "graph",
              });
            }}
            className="p-1 text-slate-400 hover:text-indigo-400 hover:bg-slate-800 rounded transition-colors"
            title="Knowledge Graph"
          >
            <Network size={14} />
          </button>
        </div>
      </div>

      {/* Quick Switcher Search Input */}
      <div className="p-2 border-b border-white/5">
        <button
          type="button"
          onClick={() => setQuickSwitcherOpen(true)}
          className="w-full flex items-center justify-between px-2.5 py-1.5 bg-slate-900/60 hover:bg-slate-900 border border-white/5 rounded-md text-xs text-slate-400 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Search size={13} />
            <span>Search docs & ADRs...</span>
          </div>
          <kbd className="px-1 py-0.5 font-mono text-[10px] bg-slate-800 rounded text-slate-500">
            ⌘P
          </kbd>
        </button>
      </div>

      {/* Section Switcher Tabs */}
      <div className="flex items-center border-b border-white/5 text-[11px] font-medium text-slate-400">
        <button
          type="button"
          onClick={() => setActiveSection("spaces")}
          className={`flex-1 py-1.5 text-center transition-colors border-b-2 ${
            activeSection === "spaces"
              ? "border-indigo-500 text-white font-semibold"
              : "border-transparent hover:text-slate-200"
          }`}
        >
          Spaces
        </button>
        <button
          type="button"
          onClick={() => setActiveSection("tags")}
          className={`flex-1 py-1.5 text-center transition-colors border-b-2 ${
            activeSection === "tags"
              ? "border-indigo-500 text-white font-semibold"
              : "border-transparent hover:text-slate-200"
          }`}
        >
          Tags ({tags.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveSection("sources")}
          className={`flex-1 py-1.5 text-center transition-colors border-b-2 ${
            activeSection === "sources"
              ? "border-indigo-500 text-white font-semibold"
              : "border-transparent hover:text-slate-200"
          }`}
        >
          Sources ({sources.length})
        </button>
      </div>

      {/* Main Explorer Tree */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1 text-xs">
        {activeSection === "spaces" && (
          <div>
            {spaces.map((space) => {
              const isExpanded = !!expandedSpaces[space.id];
              const pages = pagesBySpace[space.id] || [];
              return (
                <div key={space.id} className="mb-1">
                  {/* Space Row */}
                  <div
                    onClick={() => toggleSpace(space.id)}
                    className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-slate-900 cursor-pointer group text-slate-300 hover:text-white"
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      {isExpanded ? (
                        <ChevronDown size={13} className="text-slate-500" />
                      ) : (
                        <ChevronRight size={13} className="text-slate-500" />
                      )}
                      {isExpanded ? (
                        <FolderOpen size={14} className="text-indigo-400" />
                      ) : (
                        <Folder size={14} className="text-slate-400" />
                      )}
                      <span className="font-medium truncate">{space.name}</span>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onNewPage?.(space.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-opacity"
                      title="Add Page to this Space"
                    >
                      <Plus size={12} />
                    </button>
                  </div>

                  {/* Pages in Space */}
                  {isExpanded && (
                    <div className="ml-4 pl-2 border-l border-white/5 mt-0.5 space-y-0.5">
                      {pages.map((p) => {
                        const isSelected = p.id === activeTabId;
                        return (
                          <div
                            key={p.id}
                            onClick={() =>
                              openTab({
                                id: p.id,
                                pageId: p.id,
                                spaceId: p.space_id,
                                title: p.title,
                                viewMode: "editor",
                              })
                            }
                            className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer transition-colors ${
                              isSelected
                                ? "bg-indigo-600/20 text-indigo-300 font-medium"
                                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60"
                            }`}
                          >
                            <FileText size={13} className={isSelected ? "text-indigo-400" : "text-slate-500"} />
                            <span className="truncate flex-1">{p.title}</span>
                          </div>
                        );
                      })}
                      {pages.length === 0 && (
                        <div className="text-[11px] text-slate-500 italic py-1 px-2">
                          No pages yet.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {activeSection === "tags" && (
          <div className="space-y-1">
            {tags.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-slate-900 cursor-pointer text-slate-300 hover:text-white"
                onClick={() => setQuickSwitcherOpen(true)}
              >
                <div className="flex items-center gap-1.5">
                  <Hash size={13} className="text-indigo-400" />
                  <span>{t.name}</span>
                </div>
                <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-500 font-mono">
                  {t.page_count}
                </span>
              </div>
            ))}
            {tags.length === 0 && (
              <div className="text-xs text-slate-500 italic p-3 text-center">
                No tags created yet. Use #tag in your documents.
              </div>
            )}
          </div>
        )}

        {activeSection === "sources" && (
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => setAddSourceModalOpen(true)}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 mb-2 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-md font-medium transition-colors"
            >
              <Plus size={13} />
              <span>Add Research Source</span>
            </button>

            {sources.map((s) => (
              <div
                key={s.id}
                onClick={() =>
                  openTab({
                    id: `source:${s.id}`,
                    sourceId: s.id,
                    title: s.title,
                    viewMode: "source",
                  })
                }
                className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-slate-900 cursor-pointer group text-slate-300 hover:text-white"
              >
                <div className="flex items-center gap-1.5 truncate">
                  <BookOpen size={13} className="text-emerald-400 shrink-0" />
                  <span className="truncate">{s.title}</span>
                </div>
                <button
                  type="button"
                  onClick={(e) => handleDeleteSource(s.id, e)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-red-400 transition-opacity"
                  title="Delete Source"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            {sources.length === 0 && (
              <div className="text-xs text-slate-500 italic p-3 text-center">
                No research sources added yet. Ingest URLs, papers, or code files.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Source Modal */}
      {addSourceModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setAddSourceModalOpen(false)}
        >
          <div
            className="w-full max-w-md bg-slate-900 border border-white/10 rounded-xl shadow-2xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-white mb-3">Add Research Source</h3>
            <form onSubmit={handleCreateSource} className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Title</label>
                <input
                  type="text"
                  required
                  value={newSourceTitle}
                  onChange={(e) => setNewSourceTitle(e.target.value)}
                  placeholder="e.g. Stripe API Reference"
                  className="w-full px-3 py-1.5 bg-slate-950 border border-white/10 rounded text-xs text-white outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Source Type</label>
                <select
                  value={newSourceType}
                  onChange={(e) => setNewSourceType(e.target.value as any)}
                  className="w-full px-3 py-1.5 bg-slate-950 border border-white/10 rounded text-xs text-white outline-none"
                >
                  <option value="url">Web URL</option>
                  <option value="text">Raw Text Note</option>
                  <option value="code">Code Snippet</option>
                  <option value="adr">ADR Reference</option>
                </select>
              </div>

              {newSourceType === "url" ? (
                <div>
                  <label className="block text-xs text-slate-400 mb-1">URL</label>
                  <input
                    type="url"
                    required
                    value={newSourceUrl}
                    onChange={(e) => setNewSourceUrl(e.target.value)}
                    placeholder="https://docs.example.com"
                    className="w-full px-3 py-1.5 bg-slate-950 border border-white/10 rounded text-xs text-white outline-none focus:border-indigo-500"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Content</label>
                  <textarea
                    rows={5}
                    value={newSourceContent}
                    onChange={(e) => setNewSourceContent(e.target.value)}
                    placeholder="Paste text or code snippet here..."
                    className="w-full px-3 py-1.5 bg-slate-950 border border-white/10 rounded text-xs text-white font-mono outline-none focus:border-indigo-500"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAddSourceModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loadingSources}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded transition-colors disabled:opacity-50"
                >
                  {loadingSources ? "Ingesting..." : "Add Source"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
