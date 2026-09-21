"use client";

import { useState, type DragEvent, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  Headphones,
  HelpCircle,
  Plus,
  Search,
  SidebarClose,
  Sparkles,
  Tag,
  Hash,
  GripVertical,
} from "lucide-react";
import { listDocPages, listDocSpaces, moveDocPage, type DocPageSummary, type DocSpace } from "@/lib/api/docs";
import { Modal, TextInput, TextArea, Button } from "@/components/ds";

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

export function DocsSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const client = useQueryClient();

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

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newPageTitle, setNewPageTitle] = useState("");
  const [selectedSpaceId, setSelectedSpaceId] = useState("");

  const spaces = useQuery({ queryKey: ["doc-spaces"], queryFn: () => listDocSpaces(), retry: false });
  const pages = useQuery({ queryKey: ["doc-pages", "all"], queryFn: () => listDocPages(), retry: false });

  const toggleCategory = (catId: string) => {
    setExpandedCategories((prev) => ({ ...prev, [catId]: !prev[catId] }));
  };

  async function move(pageId: string, parent_page_id: string | null, before_page_id: string | null) {
    try {
      await moveDocPage(pageId, { parent_page_id, before_page_id });
      await client.invalidateQueries({ queryKey: ["doc-pages"] });
    } catch (err) {
      console.error("Failed to move doc page", err);
    }
  }

  // Filter pages based on search query
  const filteredPages = (pages.data ?? []).filter((p) =>
    searchQuery.trim() === "" ? true : p.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <aside
      className="pmp-sidebar internal-docs-sidebar"
      aria-label="Knowledge Base Explorer"
      style={{
        width: "var(--pmp-sidebar-width, 260px)",
        flexShrink: 0,
        height: "100%",
        background: "var(--surface-1)",
        borderRight: "1px solid var(--border-subtle)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Top Header: Knowledge Base title + New + Collapse */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 14px",
          height: "var(--pmp-header-height, 64px)",
          borderBottom: "1px solid var(--border-subtle)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <BookOpen size={18} style={{ color: "var(--accent-primary)" }} />
          <span style={{ fontSize: 14.5, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.015em" }}>
            Knowledge Base
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button
            type="button"
            onClick={() => setCreateModalOpen(true)}
            title="Create new document"
            className="pmp-icon-btn"
            style={{
              width: 28,
              height: 28,
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
            <Plus size={14} />
          </button>
        </div>
      </div>

      {/* Search Documentation */}
      <div style={{ padding: "12px 14px 8px", flexShrink: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 10px",
            background: "var(--surface-2)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-2)",
            fontSize: 12.5,
          }}
        >
          <Search size={14} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search documentation…"
            style={{
              background: "transparent",
              border: "none",
              outline: "none",
              fontSize: 12.5,
              color: "var(--text-primary)",
              flex: 1,
              minWidth: 0,
            }}
          />
          <span
            style={{
              fontSize: 10,
              padding: "2px 5px",
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
          padding: "0 14px",
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
            fontSize: 12.5,
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
            fontSize: 12.5,
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

      {/* Category / Document Tree */}
      <nav
        aria-label="Knowledge Base Navigation"
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "10px 8px",
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        {activeTab === "spaces" ? (
          DEFAULT_CATEGORIES.map((cat) => {
            const isExpanded = expandedCategories[cat.id] ?? false;
            // Get matching space or group of pages for this category
            const categoryPages = filteredPages.filter((p) => {
              const space = spaces.data?.find((s) => s.id === p.space_id);
              const spaceCat = (space?.category || "Platform").toLowerCase();
              return spaceCat.includes(cat.id.split("-")[0]) || cat.id === "getting-started";
            });

            return (
              <div key={cat.id} style={{ marginBottom: 4 }}>
                {/* Category Header Accordion */}
                <button
                  type="button"
                  onClick={() => toggleCategory(cat.id)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "6px 8px",
                    borderRadius: "var(--radius-1)",
                    border: "none",
                    background: "transparent",
                    color: "var(--text-primary)",
                    fontSize: 12.5,
                    fontWeight: 650,
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "background var(--duration-fast) var(--ease-spring)",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                    <cat.icon size={15} style={{ color: cat.color, flexShrink: 0 }} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {cat.name}
                    </span>
                  </div>
                  {isExpanded ? (
                    <ChevronDown size={14} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
                  ) : (
                    <ChevronRight size={14} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
                  )}
                </button>

                {/* Sub-articles */}
                {isExpanded && (
                  <div style={{ paddingLeft: 12, marginTop: 2, display: "flex", flexDirection: "column", gap: 1 }}>
                    {categoryPages.length > 0 ? (
                      categoryPages.map((page) => {
                        const isSelected = pathname.endsWith(`/${page.id}`);
                        return (
                          <Link
                            key={page.id}
                            href={`/app/docs/spaces/${page.space_id}/${page.id}`}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 7,
                              padding: "5px 8px",
                              borderRadius: "var(--radius-1)",
                              fontSize: 12,
                              color: isSelected ? "var(--accent-primary)" : "var(--text-secondary)",
                              background: isSelected ? "var(--accent-primary-soft)" : "transparent",
                              fontWeight: isSelected ? 650 : 450,
                              textDecoration: "none",
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
                            <FileText size={13} style={{ flexShrink: 0, opacity: isSelected ? 1 : 0.7 }} />
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                              {page.title}
                            </span>
                          </Link>
                        );
                      })
                    ) : (
                      <div style={{ padding: "4px 8px", fontSize: 11, color: "var(--text-tertiary)", fontStyle: "italic" }}>
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
          <div style={{ padding: "8px 4px", display: "flex", flexDirection: "column", gap: 4 }}>
            {["Security", "Architecture", "API", "Setup", "SSO", "Deployment", "Frontend", "Database"].map((t) => (
              <div
                key={t}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "6px 8px",
                  borderRadius: "var(--radius-1)",
                  fontSize: 12,
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Hash size={12} style={{ color: "var(--accent-primary)" }} />
                  <span>{t}</span>
                </div>
                <span style={{ fontSize: 10, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
                  {Math.floor(Math.random() * 8) + 1}
                </span>
              </div>
            ))}
          </div>
        )}
      </nav>

      {/* Bottom Help Center Card */}
      <div style={{ padding: "10px 12px", borderTop: "1px solid var(--border-subtle)", flexShrink: 0 }}>
        <Link
          href="/docs/getting-started"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 12px",
            borderRadius: "var(--radius-2)",
            background: "var(--surface-2)",
            border: "1px solid var(--border-subtle)",
            textDecoration: "none",
            color: "inherit",
            transition: "all var(--duration-fast) var(--ease-spring)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--border-default)")}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border-subtle)")}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "var(--radius-1)",
              background: "rgba(37, 99, 255, 0.12)",
              color: "var(--accent-primary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Headphones size={16} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>Need help?</div>
            <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", lineHeight: 1.3 }}>
              Visit our Help Center or contact support.
            </div>
          </div>
          <ChevronRight size={14} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
        </Link>
      </div>

      {/* Create Modal */}
      <Modal open={createModalOpen} onClose={() => setCreateModalOpen(false)} title="Create New Document">
        <div style={{ display: "grid", gap: 12 }}>
          <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
            Title
            <TextInput
              value={newPageTitle}
              onChange={(e) => setNewPageTitle(e.target.value)}
              placeholder="e.g. Signing In & Profile Management"
              autoFocus
            />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
            Space
            <select
              value={selectedSpaceId}
              onChange={(e) => setSelectedSpaceId(e.target.value)}
              style={{
                padding: "8px 12px",
                borderRadius: "var(--radius-2)",
                background: "var(--surface-3)",
                border: "1px solid var(--border-default)",
                color: "var(--text-primary)",
                fontSize: 13,
              }}
            >
              <option value="">Select space...</option>
              {spaces.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
            <Button variant="secondary" onClick={() => setCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setCreateModalOpen(false);
                if (selectedSpaceId && newPageTitle.trim()) {
                  // create or navigate
                }
              }}
              disabled={!newPageTitle.trim()}
            >
              Create
            </Button>
          </div>
        </div>
      </Modal>
    </aside>
  );
}
