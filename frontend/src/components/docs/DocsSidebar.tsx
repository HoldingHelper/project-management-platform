"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState, type DragEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpenText,
  ChevronRight,
  Clock3,
  FileText,
  GripVertical,
  LayoutGrid,
  Search,
  Settings,
  Star,
} from "lucide-react";
import { listDocPages, listDocSpaces, moveDocPage, type DocPageSummary } from "@/lib/api/docs";
import { PlatformLogo } from "@/components/brand/PlatformLogo";

export function DocsSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentView = searchParams.get("view") || (pathname === "/app/docs" ? "home" : "");
  const client = useQueryClient();
  const [status, setStatus] = useState("");
  const spaces = useQuery({ queryKey: ["doc-spaces"], queryFn: () => listDocSpaces(), retry: false });
  const pages = useQuery({ queryKey: ["doc-pages", "all"], queryFn: () => listDocPages(), retry: false });

  async function move(pageId: string, parent_page_id: string | null, before_page_id: string | null) {
    try {
      await moveDocPage(pageId, { parent_page_id, before_page_id });
      setStatus("Page order updated");
      await client.invalidateQueries({ queryKey: ["doc-pages"] });
    } catch {
      setStatus("Page could not be moved. Check your access and try again.");
    }
  }

  function rows(spaceId: string, parentId: string | null, depth = 0): ReactNode {
    return (pages.data ?? [])
      .filter((page) => page.space_id === spaceId && (page.parent_page_id ?? null) === parentId)
      .sort((a, b) => a.position - b.position || a.title.localeCompare(b.title))
      .map((page) => (
        <div key={page.id}>
          {row(page, depth)}
          {rows(spaceId, page.id, depth + 1)}
        </div>
      ));
  }

  function row(page: DocPageSummary, depth: number) {
    return (
      <div
        className="docs-tree-row"
        style={{ paddingLeft: `${8 + Math.min(depth, 4) * 13}px` }}
        draggable
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/doc-page", page.id);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = "move";
        }}
        onDrop={(event: DragEvent<HTMLDivElement>) => {
          event.preventDefault();
          event.stopPropagation();
          const source = event.dataTransfer.getData("text/doc-page");
          if (!source || source === page.id) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const nest = event.clientX > rect.left + rect.width * 0.72;
          void move(source, nest ? page.id : (page.parent_page_id ?? null), nest ? null : page.id);
        }}
        title="Drag to reorder; drop on the right edge to nest"
      >
        <GripVertical size={13} />
        <Link
          href={`/app/docs/spaces/${page.space_id}/${page.id}`}
          aria-current={pathname.endsWith(`/${page.id}`) ? "page" : undefined}
        >
          {depth > 0 && <ChevronRight size={12} />}
          <span>{page.title}</span>
        </Link>
      </div>
    );
  }

  return (
    <aside
      className="internal-docs-sidebar pmp-sidebar"
      aria-label="Internal documentation"
      style={{
        width: "var(--pmp-sidebar-width)",
        flexShrink: 0,
        height: "100%",
        background: "var(--surface-1)",
        borderRight: "1px solid var(--border-subtle)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div className="internal-docs-brand">
        <PlatformLogo size={28} style={{ marginRight: 3 }} />
        <BookOpenText size={18} />
        <span>Project Docs</span>
      </div>

      <nav aria-label="Internal documentation navigation">
        <Link href="/app/docs" aria-current={pathname === "/app/docs" && currentView === "home" ? "page" : undefined}>
          <LayoutGrid size={17} />
          Home
        </Link>
        <Link href="/app/docs?view=recent" aria-current={currentView === "recent" ? "page" : undefined}>
          <Clock3 size={17} />
          Recent
        </Link>
        <Link href="/app/docs?view=favorites" aria-current={currentView === "favorites" ? "page" : undefined}>
          <Star size={17} />
          Favorites
        </Link>

        <div className="internal-docs-nav-label">Knowledge by Category</div>
        {(["Platform", "Technical", "Marketing", "Operations", "Business", "Designs"] as const).map((cat) => {
          const categorySpaces = (spaces.data ?? []).filter((s) => (s.category || "Platform") === cat);
          if (categorySpaces.length === 0) return null;
          const isCurrentCat = searchParams.get("category") === cat;
          return (
            <details
              key={cat}
              className="docs-category-group"
              open={isCurrentCat || (!searchParams.get("category") && (cat === "Platform" || categorySpaces.length <= 2))}
              style={{ marginBottom: 6 }}
            >
              <summary
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "5px 8px",
                  fontSize: 11.5,
                  fontWeight: 700,
                  color: isCurrentCat ? "var(--accent-primary)" : "var(--text-secondary)",
                  cursor: "pointer",
                  userSelect: "none",
                  borderRadius: "var(--radius-1)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background:
                        cat === "Platform"
                          ? "#3b82f6"
                          : cat === "Technical"
                          ? "#10b981"
                          : cat === "Marketing"
                          ? "#f59e0b"
                          : cat === "Operations"
                          ? "#ec4899"
                          : cat === "Business"
                          ? "#8b5cf6"
                          : "#06b6d4",
                    }}
                  />
                  <span>{cat}</span>
                </div>
                <small style={{ fontSize: 10, opacity: 0.7 }}>{categorySpaces.length}</small>
              </summary>

              <div style={{ paddingLeft: 4 }}>
                {categorySpaces.map((space) => (
                  <details
                    className="docs-space-tree"
                    key={space.id}
                    open
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      const source = event.dataTransfer.getData("text/doc-page");
                      if (source) void move(source, null, null);
                    }}
                  >
                    <summary>
                      {space.name}
                      <small>{(pages.data ?? []).filter((page) => page.space_id === space.id).length}</small>
                    </summary>
                    {rows(space.id, null)}
                  </details>
                ))}
              </div>
            </details>
          );
        })}

        <div className="internal-docs-nav-label">Manage</div>
        <Link href="/app/docs?view=settings" aria-current={currentView === "settings" ? "page" : undefined}>
          <Settings size={17} />
          Docs settings
        </Link>
      </nav>

      <p className="sr-only" aria-live="polite">
        {status}
      </p>

      <div className="internal-docs-sidebar-foot">
        <span>Knowledge stays with the work.</span>
      </div>
    </aside>
  );
}
