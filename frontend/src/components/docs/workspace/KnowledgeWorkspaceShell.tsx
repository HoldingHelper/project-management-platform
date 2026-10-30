"use client";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { LocalizedText } from "@/lib/i18n/I18nProvider";

import { LanguageSelector } from "@/components/LanguageSelector";


import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthProvider";
import { getDocsReturnDestination } from "@/lib/auth/workspace-navigation";
import {
  Landmark,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  BookOpen,
  Search,
  Network,
  Menu,
  ArrowLeft,
} from "lucide-react";
import {
  useKnowledgeWorkspace,
  KnowledgeWorkspaceProvider,
} from "@/lib/stores/knowledgeWorkspaceStore";
import { WorkspaceTabBar } from "./WorkspaceTabBar";
import { KnowledgeExplorer } from "./KnowledgeExplorer";
import { MarkdownWorkspaceEditor } from "./MarkdownWorkspaceEditor";
import { ContextInspector } from "./ContextInspector";
import { KnowledgeGraphView } from "./KnowledgeGraphView";
import { QuickSwitcherModal } from "./QuickSwitcherModal";
import { createDocPage, listDocSpaces, type DocSpace } from "@/lib/api/docs";

function KnowledgeWorkspaceInner({
  initialSpaceId,
  initialPageId,
  returnPath,
}: {
  initialSpaceId?: string;
  initialPageId?: string;
  returnPath: string;
}) {
  const { t: translateUI } = useI18n();

  const {
    tabs,
    activeTabId,
    openTab,
    leftPanelWidth,
    setLeftPanelWidth,
    rightPanelWidth,
    setRightPanelWidth,
    leftPanelCollapsed,
    toggleLeftPanel,
    rightPanelCollapsed,
    toggleRightPanel,
    setQuickSwitcherOpen,
  } = useKnowledgeWorkspace();

  const [newPageModalOpen, setNewPageModalOpen] = useState(false);
  const [newPageTitle, setNewPageTitle] = useState("");
  const [newPageSpaceId, setNewPageSpaceId] = useState(initialSpaceId || "");
  const [newPageDocType, setNewPageDocType] = useState<string>("document");
  const [spaces, setSpaces] = useState<DocSpace[]>([]);
  const [creatingPage, setCreatingPage] = useState(false);
  const [createPageError, setCreatePageError] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<"explorer" | "inspector" | null>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const navigation = shell.querySelector<HTMLElement>(".knowledge-workspace-navigation");
    const toolbar = shell.querySelector<HTMLElement>(".knowledge-workspace-toolbar");
    const measure = () => shell.style.setProperty("--knowledge-mobile-panels-top", `${(navigation?.offsetHeight ?? 64) + (toolbar?.offsetHeight ?? 48)}px`);
    const observer = new ResizeObserver(measure);
    if (navigation) observer.observe(navigation);
    if (toolbar) observer.observe(toolbar);
    measure();
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const update = () => { setIsMobile(media.matches); setMobilePanel(null); };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => { setMobilePanel(null); }, [activeTabId]);

  // Left resize dragging
  const [isResizingLeft, setIsResizingLeft] = useState(false);
  const [isResizingRight, setIsResizingRight] = useState(false);

  // Load initial page into tabs if provided
  useEffect(() => {
    if (initialPageId && !tabs.some((t) => t.pageId === initialPageId)) {
      openTab({
        id: initialPageId,
        pageId: initialPageId,
        spaceId: initialSpaceId,
        title: "Loading...",
        viewMode: "editor",
      });
    }
  }, [initialPageId, initialSpaceId, openTab, tabs]);

  useEffect(() => {
    listDocSpaces().then(setSpaces).catch(console.error);
  }, []);

  useEffect(() => {
    if (!newPageModalOpen) return;
    setCreatePageError("");
    if (!spaces.some((space) => space.id === newPageSpaceId && space.can_create_pages)) {
      setNewPageSpaceId(spaces.find((space) => space.can_create_pages)?.id ?? "");
    }
  }, [newPageModalOpen, newPageSpaceId, spaces]);

  const handleCreatePage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creatingPage || !newPageTitle.trim() || !newPageSpaceId) return;
    setCreatePageError("");
    setCreatingPage(true);
    try {
      const page = await createDocPage(newPageSpaceId, {
        title: newPageTitle.trim(),
        content: `# ${newPageTitle.trim()}\n\nStart writing knowledge here...`,
        doc_type: newPageDocType as any,
        visibility: "inherit",
      });
      openTab({
        id: page.id,
        pageId: page.id,
        spaceId: page.space_id,
        title: page.title,
        viewMode: "editor",
      });
      setNewPageModalOpen(false);
      setNewPageTitle("");
    } catch (err) {
      setCreatePageError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreatingPage(false);
    }
  };

  // Mouse move handler for resizing panels
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingLeft) {
        const inlinePosition = document.documentElement.dir === "rtl" ? window.innerWidth - e.clientX : e.clientX;
        const newWidth = Math.max(180, Math.min(inlinePosition, 450));
        setLeftPanelWidth(newWidth);
      }
      if (isResizingRight) {
        const inlinePosition = document.documentElement.dir === "rtl" ? e.clientX : window.innerWidth - e.clientX;
        const newWidth = Math.max(220, Math.min(inlinePosition, 500));
        setRightPanelWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizingLeft(false);
      setIsResizingRight(false);
    };

    if (isResizingLeft || isResizingRight) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizingLeft, isResizingRight, setLeftPanelWidth, setRightPanelWidth]);

  const activeTab = tabs.find((t) => t.id === activeTabId);

  return (
    <div ref={shellRef} className="knowledge-workspace-shell flex h-full w-full overflow-hidden bg-slate-950 select-none">
      {isMobile && mobilePanel && <button type="button" className="knowledge-mobile-panel-scrim" aria-label={translateUI("Close document panel")} onClick={() => setMobilePanel(null)} />}
      {/* Left Panel: Knowledge Explorer */}
      {(isMobile ? mobilePanel === "explorer" : !leftPanelCollapsed) && (
        <div
          style={{ width: leftPanelWidth }}
          className="knowledge-explorer-panel relative h-full shrink-0 flex flex-col"
        >
          <KnowledgeExplorer
            onNewPage={(spaceId) => {
              if (spaceId) setNewPageSpaceId(spaceId);
              setNewPageModalOpen(true);
            }}
          />
          {/* Resize Handle */}
          <div
            onMouseDown={() => setIsResizingLeft(true)}
            className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-indigo-500/50 transition-colors z-20"
          />
        </div>
      )}

      {/* Main Center Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-slate-950">
        <WorkspaceNavigation returnPath={returnPath} />
        {/* Workspace Tab Bar */}
        <div className="knowledge-workspace-toolbar flex items-center">
          <button
            type="button"
            onClick={() => isMobile ? setMobilePanel(mobilePanel === "explorer" ? null : "explorer") : toggleLeftPanel()}
            className="knowledge-workspace-panel-toggle text-slate-400 hover:text-white bg-slate-950"
            title={translateUI((isMobile ? mobilePanel !== "explorer" : leftPanelCollapsed) ? "Expand Explorer" : "Collapse Explorer")}
            aria-expanded={isMobile ? mobilePanel === "explorer" : !leftPanelCollapsed}
          >
            {(isMobile ? mobilePanel !== "explorer" : leftPanelCollapsed) ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
          </button>

          <div className="flex-1 min-w-0 h-full">
            <WorkspaceTabBar
              onNewPage={() => setNewPageModalOpen(true)}
            />
          </div>

          <button
            type="button"
            onClick={() => isMobile ? setMobilePanel(mobilePanel === "inspector" ? null : "inspector") : toggleRightPanel()}
            className="knowledge-workspace-panel-toggle text-slate-400 hover:text-white bg-slate-950"
            title={translateUI((isMobile ? mobilePanel !== "inspector" : rightPanelCollapsed) ? "Expand Inspector" : "Collapse Inspector")}
            aria-expanded={isMobile ? mobilePanel === "inspector" : !rightPanelCollapsed}
          >
            {(isMobile ? mobilePanel !== "inspector" : rightPanelCollapsed) ? <PanelRightOpen size={15} /> : <PanelRightClose size={15} />}
          </button>
        </div>

        {/* Tab Content Display */}
        <div className="flex-1 min-h-0 overflow-hidden relative">
          {activeTab ? (
            activeTab.viewMode === "graph" ? (
              <KnowledgeGraphView
                pageId={activeTab.pageId}
                isGlobal={activeTab.id === "global-graph"}
              />
            ) : activeTab.pageId ? (
              <MarkdownWorkspaceEditor
                key={activeTab.pageId}
                pageId={activeTab.pageId}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-slate-500">{" "}<LocalizedText message={"Invalid document tab."} />{" "}</div>
            )
          ) : (
            /* Empty State / Welcome Screen */
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <BookOpen size={48} className="text-indigo-500/40 mb-4" />
              <h2 className="text-lg font-semibold text-white mb-2">{" "}<LocalizedText message={"Knowledge Workspace"} />{" "}</h2>
              <p className="text-xs text-slate-400 max-w-sm mb-6 leading-relaxed">{" "}<LocalizedText message={"Obsidian-style connected notes, Open Notebook research sources, and grounded AI assistant for high-velocity engineering."} />{" "}</p>
              <div className="knowledge-workspace-empty-actions flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setNewPageModalOpen(true)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium transition-colors"
                >
                  <Plus size={14} />
                  <span><LocalizedText message={"New Document"} /></span>
                </button>
                <button
                  type="button"
                  onClick={() => setQuickSwitcherOpen(true)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-white/10 rounded-lg text-xs font-medium transition-colors"
                >
                  <Search size={14} />
                  <span><LocalizedText message={"Quick Switcher (⌘P)"} /></span>
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
                  className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-white/10 rounded-lg text-xs font-medium transition-colors"
                >
                  <Network size={14} />
                  <span><LocalizedText message={"Global Graph"} /></span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Panel: Context Inspector */}
      {(isMobile ? mobilePanel === "inspector" : !rightPanelCollapsed) && (
        <div
          style={{ width: rightPanelWidth }}
          className="knowledge-inspector-panel relative h-full shrink-0 flex flex-col"
        >
          {/* Resize Handle */}
          <div
            onMouseDown={() => setIsResizingRight(true)}
            className="absolute top-0 left-0 w-1 h-full cursor-col-resize hover:bg-indigo-500/50 transition-colors z-20"
          />
          <ContextInspector activePageId={activeTab?.pageId} />
        </div>
      )}

      {/* Quick Switcher Modal */}
      <QuickSwitcherModal />

      {/* New Page Modal */}
      {newPageModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setNewPageModalOpen(false)}
        >
          <div
            className="w-full max-w-md bg-slate-900 border border-white/10 rounded-xl shadow-2xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-white mb-3"><LocalizedText message={"Create New Document"} /></h3>
            <form onSubmit={handleCreatePage} className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1"><LocalizedText message={"Target Space"} /></label>
                <select
                  required
                  value={newPageSpaceId}
                  onChange={(e) => setNewPageSpaceId(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-950 border border-white/10 rounded text-xs text-white outline-none"
                >
                  <option value=""><LocalizedText message={"Select a space..."} /></option>
                  {spaces.filter((s) => s.can_create_pages).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1"><LocalizedText message={"Document Title"} /></label>
                <input
                  type="text"
                  required
                  value={newPageTitle}
                  onChange={(e) => setNewPageTitle(e.target.value)}
                  placeholder={translateUI("e.g. Database Partitioning Strategy")}
                  className="w-full px-3 py-1.5 bg-slate-950 border border-white/10 rounded text-xs text-white outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1"><LocalizedText message={"Document Type"} /></label>
                <select
                  value={newPageDocType}
                  onChange={(e) => setNewPageDocType(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-950 border border-white/10 rounded text-xs text-white outline-none"
                >
                  <option value="document"><LocalizedText message={"Standard Document"} /></option>
                  <option value="adr"><LocalizedText message={"Architecture Decision Record (ADR)"} /></option>
                  <option value="runbook"><LocalizedText message={"Production Runbook"} /></option>
                  <option value="rfc"><LocalizedText message={"RFC (Request for Comments)"} /></option>
                </select>
              </div>

              {createPageError && <p role="alert" className="text-xs text-red-300">{createPageError}</p>}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setNewPageModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
                >{" "}<LocalizedText message={"Cancel"} />{" "}</button>
                <button
                  type="submit"
                  disabled={creatingPage || !newPageSpaceId || !newPageTitle.trim()}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded transition-colors disabled:opacity-50"
                >
                  {creatingPage ? <LocalizedText message={"Creating..."} /> : <LocalizedText message={"Create Document"} />}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export function KnowledgeWorkspaceShell(props: {
  initialSpaceId?: string;
  initialPageId?: string;
}) {
  const { user } = useAuth();
  const [returnPath, setReturnPath] = useState("/h/holding");
  useEffect(() => {
    if (user) setReturnPath(getDocsReturnDestination(user.id));
  }, [user?.id]);

  return (
    <KnowledgeWorkspaceProvider>
      <div className="flex h-dvh w-full flex-col overflow-hidden">
        <div className="min-h-0 flex-1">
          <KnowledgeWorkspaceInner {...props} returnPath={returnPath} />
        </div>
      </div>
    </KnowledgeWorkspaceProvider>
  );
}

function WorkspaceNavigation({ returnPath }: { returnPath: string }) {
  const { t: translateUI } = useI18n();

  return (
        <nav className="knowledge-workspace-navigation" aria-label={translateUI("Workspace navigation")}>
          <div className="workspace-module-switcher">
            <Link href="/app/docs" aria-current="page"><BookOpen size={15} aria-hidden /><LocalizedText message={"Docs"} /></Link>
            <Link href={returnPath} className="knowledge-workspace-return">
              <Landmark className="knowledge-desktop-return-icon" size={15} aria-hidden /><ArrowLeft className="knowledge-mobile-return-icon" size={15} aria-hidden /><LocalizedText message={"Holding"} />{" "}</Link>
          </div>
          <div className="knowledge-language-selector"><LanguageSelector /></div>
          <Link href="/my-work" className="knowledge-mobile-main-menu"><Menu size={17} aria-hidden /><LocalizedText message={"Main menu"} /></Link>
        </nav>

  );
}
