"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type WorkspaceTab = {
  id: string; // usually pageId or special "graph" / "source:..."
  pageId?: string;
  sourceId?: string;
  spaceId?: string;
  title: string;
  isDirty?: boolean;
  isPinned?: boolean;
  viewMode?: "editor" | "graph" | "source";
};

export type InspectorTab = "outline" | "properties" | "backlinks" | "sources" | "ai";

interface KnowledgeWorkspaceState {
  tabs: WorkspaceTab[];
  activeTabId: string | null;
  leftPanelWidth: number;
  rightPanelWidth: number;
  leftPanelCollapsed: boolean;
  rightPanelCollapsed: boolean;
  activeInspectorTab: InspectorTab;
  quickSwitcherOpen: boolean;
  graphModalOpen: boolean;
  selectedContextPageIds: string[];
  selectedContextSourceIds: string[];

  // Actions
  openTab: (tab: WorkspaceTab) => void;
  closeTab: (tabId: string) => void;
  closeOtherTabs: (tabId: string) => void;
  closeAllTabs: () => void;
  setActiveTab: (tabId: string) => void;
  setTabDirty: (tabId: string, isDirty: boolean) => void;
  setTabTitle: (tabId: string, title: string) => void;
  pinTab: (tabId: string) => void;
  setLeftPanelWidth: (width: number) => void;
  setRightPanelWidth: (width: number) => void;
  toggleLeftPanel: () => void;
  toggleRightPanel: () => void;
  setActiveInspectorTab: (tab: InspectorTab) => void;
  setQuickSwitcherOpen: (open: boolean) => void;
  setGraphModalOpen: (open: boolean) => void;
  toggleContextPage: (pageId: string) => void;
  toggleContextSource: (sourceId: string) => void;
  clearContextSelection: () => void;
}

const STORAGE_KEY = "knowledge_workspace_state_v1";

const KnowledgeWorkspaceContext = createContext<KnowledgeWorkspaceState | null>(null);

export function KnowledgeWorkspaceProvider({ children }: { children: ReactNode }) {
  const [tabs, setTabs] = useState<WorkspaceTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [leftPanelWidth, setLeftPanelWidth] = useState<number>(260);
  const [rightPanelWidth, setRightPanelWidth] = useState<number>(320);
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState<boolean>(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState<boolean>(false);
  const [activeInspectorTab, setActiveInspectorTab] = useState<InspectorTab>("outline");
  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState<boolean>(false);
  const [graphModalOpen, setGraphModalOpen] = useState<boolean>(false);
  const [selectedContextPageIds, setSelectedContextPageIds] = useState<string[]>([]);
  const [selectedContextSourceIds, setSelectedContextSourceIds] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.tabs) && parsed.tabs.length > 0) {
          setTabs(parsed.tabs);
          setActiveTabId(parsed.activeTabId || parsed.tabs[0].id);
        }
        if (parsed.leftPanelWidth) setLeftPanelWidth(parsed.leftPanelWidth);
        if (parsed.rightPanelWidth) setRightPanelWidth(parsed.rightPanelWidth);
        if (parsed.leftPanelCollapsed !== undefined) setLeftPanelCollapsed(parsed.leftPanelCollapsed);
        if (parsed.rightPanelCollapsed !== undefined) setRightPanelCollapsed(parsed.rightPanelCollapsed);
        if (parsed.activeInspectorTab) setActiveInspectorTab(parsed.activeInspectorTab);
      }
    } catch (e) {
      console.error("Failed to load workspace state from localStorage", e);
    } finally {
      setLoaded(true);
    }
  }, []);

  // Save to localStorage
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          tabs: tabs.map((t) => ({ ...t, isDirty: false })), // don't persist dirty state
          activeTabId,
          leftPanelWidth,
          rightPanelWidth,
          leftPanelCollapsed,
          rightPanelCollapsed,
          activeInspectorTab,
        })
      );
    } catch (e) {
      console.error("Failed to save workspace state to localStorage", e);
    }
  }, [
    loaded,
    tabs,
    activeTabId,
    leftPanelWidth,
    rightPanelWidth,
    leftPanelCollapsed,
    rightPanelCollapsed,
    activeInspectorTab,
  ]);

  const openTab = useCallback((tab: WorkspaceTab) => {
    setTabs((prev) => {
      const existing = prev.find((t) => t.id === tab.id);
      if (existing) {
        return prev.map((t) => (t.id === tab.id ? { ...t, ...tab } : t));
      }
      return [...prev, tab];
    });
    setActiveTabId(tab.id);
  }, []);

  const closeTab = useCallback((tabId: string) => {
    setTabs((prev) => {
      const nextTabs = prev.filter((t) => t.id !== tabId);
      if (activeTabId === tabId) {
        const idx = prev.findIndex((t) => t.id === tabId);
        const nextActive = nextTabs[idx] || nextTabs[idx - 1] || null;
        setActiveTabId(nextActive ? nextActive.id : null);
      }
      return nextTabs;
    });
  }, [activeTabId]);

  const closeOtherTabs = useCallback((tabId: string) => {
    setTabs((prev) => prev.filter((t) => t.id === tabId || t.isPinned));
    setActiveTabId(tabId);
  }, []);

  const closeAllTabs = useCallback(() => {
    setTabs((prev) => prev.filter((t) => t.isPinned));
    setActiveTabId(null);
  }, []);

  const setTabDirty = useCallback((tabId: string, isDirty: boolean) => {
    setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, isDirty } : t)));
  }, []);

  const setTabTitle = useCallback((tabId: string, title: string) => {
    setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, title } : t)));
  }, []);

  const pinTab = useCallback((tabId: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === tabId ? { ...t, isPinned: !t.isPinned } : t))
    );
  }, []);

  const toggleLeftPanel = useCallback(() => {
    setLeftPanelCollapsed((v) => !v);
  }, []);

  const toggleRightPanel = useCallback(() => {
    setRightPanelCollapsed((v) => !v);
  }, []);

  const toggleContextPage = useCallback((pageId: string) => {
    setSelectedContextPageIds((prev) =>
      prev.includes(pageId) ? prev.filter((id) => id !== pageId) : [...prev, pageId]
    );
  }, []);

  const toggleContextSource = useCallback((sourceId: string) => {
    setSelectedContextSourceIds((prev) =>
      prev.includes(sourceId) ? prev.filter((id) => id !== sourceId) : [...prev, sourceId]
    );
  }, []);

  const clearContextSelection = useCallback(() => {
    setSelectedContextPageIds([]);
    setSelectedContextSourceIds([]);
  }, []);

  // Keyboard shortcut listener: Cmd+P / Ctrl+P for Quick Switcher
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setQuickSwitcherOpen((v) => !v);
      } else if (e.key === "Escape") {
        setQuickSwitcherOpen(false);
        setGraphModalOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const value = useMemo<KnowledgeWorkspaceState>(
    () => ({
      tabs,
      activeTabId,
      leftPanelWidth,
      rightPanelWidth,
      leftPanelCollapsed,
      rightPanelCollapsed,
      activeInspectorTab,
      quickSwitcherOpen,
      graphModalOpen,
      selectedContextPageIds,
      selectedContextSourceIds,
      openTab,
      closeTab,
      closeOtherTabs,
      closeAllTabs,
      setActiveTab: setActiveTabId,
      setTabDirty,
      setTabTitle,
      pinTab,
      setLeftPanelWidth,
      setRightPanelWidth,
      toggleLeftPanel,
      toggleRightPanel,
      setActiveInspectorTab,
      setQuickSwitcherOpen,
      setGraphModalOpen,
      toggleContextPage,
      toggleContextSource,
      clearContextSelection,
    }),
    [
      tabs,
      activeTabId,
      leftPanelWidth,
      rightPanelWidth,
      leftPanelCollapsed,
      rightPanelCollapsed,
      activeInspectorTab,
      quickSwitcherOpen,
      graphModalOpen,
      selectedContextPageIds,
      selectedContextSourceIds,
      openTab,
      closeTab,
      closeOtherTabs,
      closeAllTabs,
      setTabDirty,
      setTabTitle,
      pinTab,
      toggleLeftPanel,
      toggleRightPanel,
      toggleContextPage,
      toggleContextSource,
      clearContextSelection,
    ]
  );

  return (
    <KnowledgeWorkspaceContext.Provider value={value}>
      {children}
    </KnowledgeWorkspaceContext.Provider>
  );
}

export function useKnowledgeWorkspace() {
  const ctx = useContext(KnowledgeWorkspaceContext);
  if (!ctx) {
    throw new Error("useKnowledgeWorkspace must be used within KnowledgeWorkspaceProvider");
  }
  return ctx;
}
