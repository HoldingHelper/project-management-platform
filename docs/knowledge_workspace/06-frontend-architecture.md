# 06 - Frontend Workspace Architecture

## 1. Component Hierarchy & Layout

The Knowledge Workspace replaces the fragmented docs screens with an integrated desktop-style layout inside `/app/docs`:

```text
KnowledgeWorkspaceShell (Fixed viewport 100vh, flex-row)
│
├── Left Column: KnowledgeExplorer (Resizable: 240px - 400px, collapsible)
│   ├── ExplorerHeader (Workspace title, New Page, New Space, Quick Switcher trigger)
│   ├── QuickSearchInput (Fast filter input with keyboard shortcut hint ⌘P)
│   ├── NavigationSections:
│   │   ├── QuickAccess (Favorites ★, Recent 🕒)
│   │   ├── SpacesTree (Collapsible spaces, nested folder-like page hierarchy, drag-and-drop)
│   │   ├── TagsBrowser (Tags list with document count badges)
│   │   └── SourcesLibrary (Attached Open Notebook research sources)
│   └── ExplorerFooter (Graph view trigger, Settings link)
│
├── Center Column: DocumentWorkspace (Flex: 1, minWidth: 0, flex-col)
│   ├── WorkspaceTabBar (Horizontal scrolling tabs with title, dirty dot, pin, close button)
│   ├── DocumentHeaderBar:
│   │   ├── BreadcrumbPath (Space > Parent > Current Page)
│   │   ├── SaveStatusIndicator (Subtle icon + text: "Saved", "Saving...", "Offline")
│   │   ├── ViewModeToggle (Edit / Preview / Split)
│   │   └── ActionButtons (Share, History, Delete, Context Drawer toggle)
│   └── DocumentCanvas:
│       ├── TitleInput (Auto-resizing document title)
│       ├── PropertiesBar (Frontmatter chips: #tags, status, responsible owner, dates)
│       ├── EditorContainer:
│       │   ├── MarkdownEditor (Syntax highlighting, [[WikiLink]] suggestion popup, slash commands)
│       │   └── MarkdownPreview (Grounded rendering, [[WikiLinks]] clickable, checklists, code, SVGs)
│       └── DocumentFooter (Backlinks preview count, last updated timestamp, author)
│
└── Right Column: ContextInspector (Resizable: 280px - 480px, collapsible)
    ├── InspectorTabs (Outline 📑, Properties ⚙️, Backlinks 🔗, Sources 📚, Knowledge AI 🤖)
    └── TabPanels:
        ├── OutlinePanel (Interactive Table of Contents generated from AST headings)
        ├── PropertiesPanel (Metadata editor, tags management, entity links to Projects/Tasks)
        ├── BacklinksPanel (List of incoming links from other pages, unresolved stubs, mention context)
        ├── SourcesPanel (Open Notebook sources: upload PDF, add URL, code file, view status)
        └── KnowledgeAIPanel:
            ├── ContextSelector (Active context chips: [✓ Current Doc] [✓ 3 Sources] [Add Context +])
            ├── MessageHistory (Threaded conversation with streaming assistant messages)
            ├── CitationsTray (Clickable citations jumping to source excerpts)
            └── PromptInputBar (Text input, prompt actions like "Summarize", "Extract Decisions")
```

---

## 2. Workspace State Management

The workspace state is managed via a dedicated Zustand/React Context store (`useKnowledgeWorkspaceStore`):

```typescript
export interface WorkspaceTab {
  id: string; // pageId
  spaceId: string;
  title: string;
  isDirty: boolean;
  isPinned: boolean;
  scrollPosition: number;
}

export interface KnowledgeWorkspaceState {
  // Tabs
  tabs: WorkspaceTab[];
  activeTabId: string | null;
  openTab: (tab: Omit<WorkspaceTab, "isDirty" | "isPinned" | "scrollPosition">) => void;
  closeTab: (tabId: string) => void;
  setTabDirty: (tabId: string, isDirty: boolean) => void;
  setActiveTab: (tabId: string) => void;

  // Panel layout
  explorerWidth: number;
  inspectorWidth: number;
  isExplorerCollapsed: boolean;
  isInspectorCollapsed: boolean;
  activeInspectorTab: "outline" | "properties" | "backlinks" | "sources" | "ai";
  setExplorerWidth: (width: number) => void;
  setInspectorWidth: (width: number) => void;
  toggleExplorer: () => void;
  toggleInspector: () => void;
  setActiveInspectorTab: (tab: "outline" | "properties" | "backlinks" | "sources" | "ai") => void;

  // Modals & Palettes
  quickSwitcherOpen: boolean;
  graphModalOpen: boolean;
  setQuickSwitcherOpen: (open: boolean) => void;
  setGraphModalOpen: (open: boolean) => void;

  // AI Context Selection
  selectedContextIds: { type: "page" | "source"; id: string; title: string }[];
  toggleContextItem: (item: { type: "page" | "source"; id: string; title: string }) => void;
  clearContext: () => void;
}
```

---

## 3. Keyboard Shortcuts & Ergonomics

| Shortcut | Action | Scope |
|---|---|---|
| `Cmd+P` / `Ctrl+P` | Open Quick Switcher | Global |
| `Cmd+K` / `Ctrl+K` | Open Full Search / Quick Switcher | Global |
| `Cmd+\` / `Ctrl+\` | Toggle Left Explorer Sidebar | Global |
| `Cmd+Option+\` | Toggle Right Context Inspector | Global |
| `Cmd+S` / `Ctrl+S` | Trigger Immediate Save (bypassing debounce) | Editor |
| `Cmd+W` / `Ctrl+W` | Close Active Tab | Workspace |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Cycle Next / Previous Tab | Workspace |
| `Cmd+Shift+G` | Open Knowledge Graph | Global |
| `[[` | Trigger WikiLink Autocomplete Dropdown | Editor |
| `\` | Trigger Slash Command Menu (Headings, code, lists) | Editor |

---

## 4. Performance & Smoothness Architecture

1. **Tab Memory Management**: Inactive tabs retain scroll position and metadata in memory without rendering their DOM tree. Only the active tab mounts the full editor/preview component.
2. **Local Storage Persistence**: Explorer width, inspector width, collapsed states, and open tab IDs persist in `localStorage` (`knowledge.workspace.layout.v1`), ensuring refresh restores the exact workstation state.
3. **Optimistic Tab Switching**: Switching tabs occurs in `<16ms` (single frame) with zero network roundtrips.
4. **Structural Skeletons**: If a newly opened tab requires a network fetch, a structural skeleton matching the editor header and paragraph layout renders immediately without layout jump.
