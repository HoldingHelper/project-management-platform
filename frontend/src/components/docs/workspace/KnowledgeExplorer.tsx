"use client";

import { useState } from "react";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  Headphones,
  Plus,
  Search,
  Hash,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { listDocPages, listDocSpaces, type DocPageSummary } from "@/lib/api/docs";
import { useKnowledgeWorkspace } from "@/lib/stores/knowledgeWorkspaceStore";

const DEFAULT_CATEGORIES = [
  { id: "getting-started", name: "Getting Started", icon: FolderOpen, color: "#3B82F6" },
  { id: "projects", name: "Projects & Workspaces", icon: Folder, color: "#10B981" },
  { id: "tasks", name: "Tasks & Collaboration", icon: Folder, color: "#F59E0B" },
  { id: "channels", name: "Channels & Communication", icon: Folder, color: "#06B6D4" },
  { id: "integrations", name: "Integrations", icon: Folder, color: "#EC4899" },
  { id: "security", name: "Security & Compliance", icon: Folder, color: "#8B5CF6" },
  { id: "billing", name: "Billing & Administration", icon: Folder, color: "#14B8A6" },
  { id: "guides", name: "Guides & Tutorials", icon: Folder, color: "#6366F1" },
  { id: "api", name: "API Reference", icon: Folder, color: "#0EA5E9" },
];

export function KnowledgeExplorer({ onNewPage }: { onNewPage?: (spaceId?: string) => void }) {
  const { openTab, tabs, activeTabId } = useKnowledgeWorkspace();
  const [activeTab, setActiveTab] = useState<"spaces" | "tags">("spaces");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    "getting-started": true,
    "projects": true,
    "tasks": false,
    "channels": false,
    "integrations": false,
    "security": false,
    "billing": false,
    "guides": false,
    "api": false,
  });

  const spaces = useQuery({ queryKey: ["doc-spaces"], queryFn: () => listDocSpaces(), retry: false });
  const pages = useQuery({ queryKey: ["doc-pages", "all"], queryFn: () => listDocPages(), retry: false });

  const toggleCategory = (catId: string) => {
    setExpandedCategories((prev) => ({ ...prev, [catId]: !prev[catId] }));
  };

  const activeTabItem = tabs.find((t) => t.id === activeTabId);
  const activePageId = activeTabItem?.pageId;
  const isSelectedTab = (t: { id: string; pageId?: string }) => t.pageId === activePageId;

  const filteredPages = (pages.data ?? []).filter((p) =>
    searchQuery.trim() === "" ? true : p.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--surface-1)",
        borderRight: "1px solid var(--border-subtle)",
        overflow: "hidden",
        userSelect: "none",
      }}
    >
      {/* Top Header: Knowledge Base title + New button */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 14px",
          height: 48,
          borderBottom: "1px solid var(--border-subtle)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <BookOpen size={16} style={{ color: "var(--accent-primary)" }} />
          <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-primary)" }}>
            Knowledge Base
          </span>
        </div>
        <button
          type="button"
          onClick={() => onNewPage?.()}
          title="Create document"
          className="pmp-icon-btn"
          style={{
            width: 26,
            height: 26,
            borderRadius: "var(--radius-1)",
            border: "1px solid var(--border-subtle)",
            background: "var(--surface-2)",
            color: "var(--text-secondary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <Plus size={13} />
        </button>
      </div>

      {/* Search Input */}
      <div style={{ padding: "10px 12px 6px", flexShrink: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "5px 9px",
            background: "var(--surface-2)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-2)",
            fontSize: 12,
          }}
        >
          <Search size={13} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search documentation…"
            style={{
              background: "transparent",
              border: "none",
              outline: "none",
              fontSize: 12,
              color: "var(--text-primary)",
              flex: 1,
              minWidth: 0,
            }}
          />
          <span
            style={{
              fontSize: 9.5,
              padding: "2px 4px",
              borderRadius: "4px",
              background: "var(--surface-3)",
              color: "var(--text-tertiary)",
              fontFamily: "var(--font-mono)",
            }}
          >
            ⌘K
          </span>
        </div>
      </div>

      {/* Spaces vs Tags Tabs */}
      <div
        style={{
          display: "flex",
          padding: "0 12px",
          borderBottom: "1px solid var(--border-subtle)",
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab("spaces")}
          style={{
            flex: 1,
            padding: "8px 0",
            fontSize: 12,
            fontWeight: activeTab === "spaces" ? 700 : 500,
            color: activeTab === "spaces" ? "var(--accent-primary)" : "var(--text-secondary)",
            background: "transparent",
            border: "none",
            borderBottom: `2px solid ${activeTab === "spaces" ? "var(--accent-primary)" : "transparent"}`,
            cursor: "pointer",
            transition: "all var(--duration-fast) var(--ease-spring)",
          }}
        >
          Spaces
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("tags")}
          style={{
            flex: 1,
            padding: "8px 0",
            fontSize: 12,
            fontWeight: activeTab === "tags" ? 700 : 500,
            color: activeTab === "tags" ? "var(--accent-primary)" : "var(--text-secondary)",
            background: "transparent",
            border: "none",
            borderBottom: `2px solid ${activeTab === "tags" ? "var(--accent-primary)" : "transparent"}`,
            cursor: "pointer",
            transition: "all var(--duration-fast) var(--ease-spring)",
          }}
        >
          Tags
        </button>
      </div>

      {/* Navigation Tree */}
      <nav
        aria-label="Knowledge Base Navigation"
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "8px 6px",
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        {activeTab === "spaces" ? (
          DEFAULT_CATEGORIES.map((cat) => {
            const isExpanded = expandedCategories[cat.id] ?? false;
            const categoryPages = filteredPages.filter((p) => {
              const space = spaces.data?.find((s) => s.id === p.space_id);
              const spaceCat = (space?.category || "Platform").toLowerCase();
              return spaceCat.includes(cat.id.split("-")[0]) || cat.id === "getting-started";
            });

            return (
              <div key={cat.id} style={{ marginBottom: 3 }}>
                {/* Category Header Accordion */}
                <button
                  type="button"
                  onClick={() => toggleCategory(cat.id)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "5px 8px",
                    borderRadius: "var(--radius-1)",
                    border: "none",
                    background: "transparent",
                    color: "var(--text-primary)",
                    fontSize: 12,
                    fontWeight: 650,
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "background var(--duration-fast) var(--ease-spring)",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                    <cat.icon size={14} style={{ color: cat.color, flexShrink: 0 }} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {cat.name}
                    </span>
                  </div>
                  {isExpanded ? (
                    <ChevronDown size={13} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
                  ) : (
                    <ChevronRight size={13} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
                  )}
                </button>

                {/* Sub-articles */}
                {isExpanded && (
                  <div style={{ paddingLeft: 10, marginTop: 1, display: "flex", flexDirection: "column", gap: 1 }}>
                    {categoryPages.length > 0 ? (
                      categoryPages.map((page) => {
                        const isSelected = activePageId === page.id;
                        return (
                          <div
                            key={page.id}
                            onClick={() =>
                              openTab({
                                id: page.id,
                                pageId: page.id,
                                spaceId: page.space_id,
                                title: page.title,
                                viewMode: "editor",
                              })
                            }
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 7,
                              padding: "4px 8px",
                              borderRadius: "var(--radius-1)",
                              fontSize: 11.5,
                              color: isSelected ? "var(--accent-primary)" : "var(--text-secondary)",
                              background: isSelected ? "var(--accent-primary-soft)" : "transparent",
                              fontWeight: isSelected ? 650 : 450,
                              cursor: "pointer",
                              borderLeft: isSelected ? "3px solid var(--accent-primary)" : "3px solid transparent",
                              transition: "all var(--duration-fast) var(--ease-spring)",
                            }}
                            onMouseEnter={(e) => {
                              if (!isSelected) e.currentTarget.style.background = "var(--surface-2)";
                            }}
                            onMouseLeave={(e) => {
                              if (!isSelected) e.currentTarget.style.background = "transparent";
                            }}
                          >
                            <FileText size={12} style={{ flexShrink: 0, opacity: isSelected ? 1 : 0.7 }} />
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                              {page.title}
                            </span>
                          </div>
                        );
                      })
                    ) : (
                      <div style={{ padding: "3px 8px", fontSize: 10.5, color: "var(--text-tertiary)", fontStyle: "italic" }}>
                        No articles yet
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          /* Tags Tab */
          <div style={{ padding: "6px 4px", display: "flex", flexDirection: "column", gap: 3 }}>
            {["Security", "Architecture", "API", "Setup", "SSO", "Deployment", "Frontend", "Database"].map((t) => (
              <div
                key={t}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "5px 8px",
                  borderRadius: "var(--radius-1)",
                  fontSize: 11.5,
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Hash size={11} style={{ color: "var(--accent-primary)" }} />
                  <span>{t}</span>
                </div>
                <span style={{ fontSize: 9.5, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
                  {Math.floor(Math.random() * 8) + 1}
                </span>
              </div>
            ))}
          </div>
        )}
      </nav>

      {/* Bottom Help Center Card */}
      <div style={{ padding: "10px", borderTop: "1px solid var(--border-subtle)", flexShrink: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            padding: "8px 10px",
            borderRadius: "var(--radius-2)",
            background: "var(--surface-2)",
            border: "1px solid var(--border-subtle)",
            cursor: "pointer",
            transition: "all var(--duration-fast) var(--ease-spring)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--border-default)")}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border-subtle)")}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: "var(--radius-1)",
              background: "rgba(37, 99, 255, 0.12)",
              color: "var(--accent-primary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Headphones size={14} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-primary)" }}>Need help?</div>
            <div style={{ fontSize: 10, color: "var(--text-tertiary)", lineHeight: 1.25 }}>
              Visit Help Center
            </div>
          </div>
          <ChevronRight size={13} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
        </div>
      </div>
    </div>
  );
}
