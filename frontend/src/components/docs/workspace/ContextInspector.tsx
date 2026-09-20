"use client";

import { useEffect, useState } from "react";
import {
  List,
  Sliders,
  Link as LinkIcon,
  BookOpen,
  Sparkles,
  Hash,
  Plus,
  X,
  ExternalLink,
} from "lucide-react";
import {
  listPageBacklinks,
  addDocPageTag,
  removeDocPageTag,
  getDocPage,
  type DocRelation,
  type DocPage,
} from "@/lib/api/docs";
import { useKnowledgeWorkspace, type InspectorTab } from "@/lib/stores/knowledgeWorkspaceStore";
import { KnowledgeAIPanel } from "./KnowledgeAIPanel";

interface HeadingItem {
  level: number;
  text: string;
}

export function ContextInspector({
  activePageId,
}: {
  activePageId?: string;
}) {
  const {
    activeInspectorTab,
    setActiveInspectorTab,
    openTab,
  } = useKnowledgeWorkspace();

  const [page, setPage] = useState<DocPage | null>(null);
  const [backlinks, setBacklinks] = useState<DocRelation[]>([]);
  const [headings, setHeadings] = useState<HeadingItem[]>([]);
  const [newTagInput, setNewTagInput] = useState("");

  // Load page details & backlinks when activePageId changes
  useEffect(() => {
    if (!activePageId) {
      setPage(null);
      setBacklinks([]);
      setHeadings([]);
      return;
    }

    let active = true;
    const loadDetails = async () => {
      try {
        const pageData = await getDocPage(activePageId);
        if (active) {
          setPage(pageData);
          // Parse headings from content
          const lines = (pageData.content || "").split("\n");
          const extracted: HeadingItem[] = [];
          for (const line of lines) {
            const match = line.match(/^(#{1,3})\s+(.+)$/);
            if (match) {
              extracted.push({
                level: match[1].length,
                text: match[2].trim(),
              });
            }
          }
          setHeadings(extracted);
        }

        const bls = await listPageBacklinks(activePageId);
        if (active) {
          setBacklinks(bls);
        }
      } catch (err) {
        console.error("Failed to load context inspector details", err);
      }
    };

    loadDetails();
    return () => {
      active = false;
    };
  }, [activePageId]);

  const handleAddTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePageId || !newTagInput.trim()) return;
    const tag = newTagInput.trim().replace(/^#/, "");
    try {
      await addDocPageTag(activePageId, tag);
      setNewTagInput("");
      const updated = await getDocPage(activePageId);
      setPage(updated);
    } catch (err) {
      console.error("Failed to add tag", err);
    }
  };

  const handleRemoveTag = async (tag: string) => {
    if (!activePageId) return;
    try {
      await removeDocPageTag(activePageId, tag);
      const updated = await getDocPage(activePageId);
      setPage(updated);
    } catch (err) {
      console.error("Failed to remove tag", err);
    }
  };

  const tabs: Array<{ id: InspectorTab; label: string; icon: any }> = [
    { id: "outline", label: "Outline", icon: List },
    { id: "properties", label: "Props", icon: Sliders },
    { id: "backlinks", label: "Backlinks", icon: LinkIcon },
    { id: "sources", label: "Sources", icon: BookOpen },
    { id: "ai", label: "AI", icon: Sparkles },
  ];

  return (
    <div className="flex flex-col h-full bg-slate-950 border-l border-white/5 select-none text-slate-300">
      {/* Top Inspector Tab Bar */}
      <div className="flex items-center border-b border-white/5 bg-slate-950">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeInspectorTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveInspectorTab(tab.id)}
              className={`flex-1 flex flex-col items-center justify-center py-2 text-[10px] font-medium transition-colors border-b-2 ${
                isActive
                  ? "border-indigo-500 text-white font-semibold"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
              title={tab.label}
            >
              <Icon size={14} className={isActive ? "text-indigo-400 mb-0.5" : "mb-0.5"} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Outline Tab */}
        {activeInspectorTab === "outline" && (
          <div className="p-3 text-xs space-y-1">
            <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Document Outline
            </h4>
            {headings.map((h, i) => (
              <div
                key={i}
                className="py-1 px-2 rounded hover:bg-slate-900 cursor-pointer text-slate-300 hover:text-white truncate transition-colors"
                style={{ paddingLeft: `${h.level * 10}px` }}
              >
                {h.text}
              </div>
            ))}
            {headings.length === 0 && (
              <div className="text-slate-500 italic py-4 text-center">
                No headings in this document. Add # Heading in markdown to build the outline.
              </div>
            )}
          </div>
        )}

        {/* Properties Tab */}
        {activeInspectorTab === "properties" && (
          <div className="p-3 text-xs space-y-4">
            <div>
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                Document Metadata
              </span>
              <div className="bg-slate-900/60 border border-white/5 rounded-lg p-3 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">Doc Type:</span>
                  <span className="font-mono text-indigo-400 uppercase">{page?.doc_type || "document"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Visibility:</span>
                  <span className="text-slate-300">{page?.visibility || "inherit"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Status:</span>
                  <span className="text-slate-300 capitalize">{page?.status || "internal"}</span>
                </div>
              </div>
            </div>

            {/* Tags Management */}
            <div>
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                Tags
              </span>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {(page?.tags || []).map((t) => (
                  <span
                    key={t}
                    className="flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 text-xs"
                  >
                    <Hash size={10} />
                    <span>{t}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(t)}
                      className="hover:text-white ml-0.5"
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>

              <form onSubmit={handleAddTag} className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  placeholder="Add tag (e.g. backend)..."
                  className="flex-1 px-2 py-1 bg-slate-950 border border-white/10 rounded text-xs text-white outline-none focus:border-indigo-500"
                />
                <button
                  type="submit"
                  className="p-1 bg-slate-800 hover:bg-slate-700 text-white rounded transition-colors"
                >
                  <Plus size={13} />
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Backlinks Tab */}
        {activeInspectorTab === "backlinks" && (
          <div className="p-3 text-xs space-y-2">
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Incoming Backlinks ({backlinks.length})
              </h4>
            </div>

            {backlinks.map((bl) => (
              <div
                key={bl.id}
                onClick={() =>
                  openTab({
                    id: bl.source_page_id,
                    pageId: bl.source_page_id,
                    title: bl.target_title,
                    viewMode: "editor",
                  })
                }
                className="p-2.5 rounded-lg bg-slate-900/60 hover:bg-slate-900 border border-white/5 cursor-pointer group transition-colors"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-white group-hover:text-indigo-400">
                    {bl.target_title}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {bl.relation_type}
                  </span>
                </div>
                {bl.anchor_text && (
                  <p className="text-[11px] text-slate-400 italic truncate">
                    &quot;{bl.anchor_text}&quot;
                  </p>
                )}
              </div>
            ))}

            {backlinks.length === 0 && (
              <div className="text-slate-500 italic py-6 text-center">
                No incoming backlinks yet. Reference this page using [[{page?.title || "Title"}]] from other documents.
              </div>
            )}
          </div>
        )}

        {/* Sources Tab */}
        {activeInspectorTab === "sources" && (
          <div className="p-3 text-xs space-y-2">
            <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Referenced Sources
            </h4>
            <div className="text-slate-500 italic py-4 text-center">
              Sources attached to this document will appear here for grounded AI research.
            </div>
          </div>
        )}

        {/* AI Tab */}
        {activeInspectorTab === "ai" && (
          <KnowledgeAIPanel
            activePageId={activePageId}
            activePageTitle={page?.title}
          />
        )}
      </div>
    </div>
  );
}
