"use client";

import { useMemo, useState } from "react";
import {
  X,
  Pin,
  FileText,
  Network,
  BookOpen,
  Plus,
  Search,
} from "lucide-react";
import { useKnowledgeWorkspace, type WorkspaceTab } from "@/lib/stores/knowledgeWorkspaceStore";

export function WorkspaceTabBar({
  onNewPage,
}: {
  onNewPage?: () => void;
}) {
  const {
    tabs,
    activeTabId,
    setActiveTab,
    closeTab,
    closeOtherTabs,
    closeAllTabs,
    pinTab,
    setQuickSwitcherOpen,
    openTab,
  } = useKnowledgeWorkspace();

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    tabId: string;
  } | null>(null);

  const getTabIcon = (tab: WorkspaceTab) => {
    if (tab.viewMode === "graph") return <Network size={14} className="text-indigo-400" />;
    if (tab.viewMode === "source") return <BookOpen size={14} className="text-emerald-400" />;
    return <FileText size={14} className="text-slate-400" />;
  };

  const handleContextMenu = (e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, tabId });
  };

  return (
    <div
      data-testid="workspace-tab-bar"
      className="flex items-center justify-between bg-slate-950/80 border-b border-white/5 h-10 px-2 select-none"
    >
      {/* Scrollable Tabs Container */}
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar max-w-[calc(100%-140px)]">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              onContextMenu={(e) => handleContextMenu(e, tab.id)}
              className={`group relative flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-all border ${
                isActive
                  ? "bg-slate-800/90 text-white border-white/10 shadow-sm"
                  : "bg-slate-900/40 text-slate-400 border-transparent hover:bg-slate-900 hover:text-slate-200"
              }`}
              style={{ minWidth: 110, maxWidth: 200 }}
              title={tab.title}
            >
              {getTabIcon(tab)}
              <span className="truncate flex-1">{tab.title || "Untitled"}</span>

              {/* Dirty indicator */}
              {tab.isDirty && (
                <span
                  className="w-2 h-2 rounded-full bg-amber-400"
                  title="Unsaved changes"
                />
              )}

              {/* Pin indicator */}
              {tab.isPinned && (
                <Pin size={11} className="text-indigo-400 rotate-45" />
              )}

              {/* Close Tab Button */}
              {!tab.isPinned && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-white/10 text-slate-400 hover:text-white transition-opacity"
                  title="Close tab (Ctrl+W)"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          );
        })}

        {tabs.length === 0 && (
          <div className="text-xs text-slate-500 italic px-2">
            No documents open. Press Cmd+P or pick a doc from the explorer.
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setQuickSwitcherOpen(true)}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-slate-400 hover:text-white bg-slate-900/60 hover:bg-slate-800 rounded border border-white/5 transition-colors"
          title="Quick Switcher (Cmd+P)"
        >
          <Search size={12} />
          <span className="font-mono text-[10px] text-slate-500">⌘P</span>
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
          className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-slate-800/80 rounded transition-colors"
          title="Open Knowledge Graph"
        >
          <Network size={14} />
        </button>

        {onNewPage && (
          <button
            type="button"
            onClick={onNewPage}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800/80 rounded transition-colors"
            title="New Document"
          >
            <Plus size={14} />
          </button>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-slate-900 border border-white/10 rounded-lg shadow-xl py-1 text-xs text-slate-300 min-w-[140px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={() => setContextMenu(null)}
          onMouseLeave={() => setContextMenu(null)}
        >
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 hover:bg-slate-800 hover:text-white"
            onClick={() => closeTab(contextMenu.tabId)}
          >
            Close Tab
          </button>
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 hover:bg-slate-800 hover:text-white"
            onClick={() => closeOtherTabs(contextMenu.tabId)}
          >
            Close Other Tabs
          </button>
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 hover:bg-slate-800 hover:text-white"
            onClick={() => closeAllTabs()}
          >
            Close All Tabs
          </button>
          <div className="my-1 border-t border-white/5" />
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 hover:bg-slate-800 hover:text-white flex items-center gap-2"
            onClick={() => pinTab(contextMenu.tabId)}
          >
            <Pin size={11} />
            Toggle Pin
          </button>
        </div>
      )}
    </div>
  );
}
