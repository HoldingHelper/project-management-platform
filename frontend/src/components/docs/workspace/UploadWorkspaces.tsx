"use client";
import { useState } from "react";
import { ChevronDown, ChevronRight, FileText, Folder, FolderOpen } from "lucide-react";
import type { DocPageSummary, DocSpace } from "@/lib/api/docs";
import { useKnowledgeWorkspace } from "@/lib/stores/knowledgeWorkspaceStore";

export function UploadWorkspaces({ spaces, pages, search }: { spaces: DocSpace[]; pages: DocPageSummary[]; search: string }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const { openTab, activeTabId } = useKnowledgeWorkspace();
  const query = search.trim().toLowerCase();
  const buttonStyle = { display: "flex", alignItems: "center", gap: 6, width: "100%", minHeight: 32, border: 0, borderRadius: 6, background: "transparent", color: "var(--text-secondary)", fontSize: 11.5, textAlign: "left" as const, cursor: "pointer" };
  function toggle(id: string) { setExpanded((current) => ({ ...current, [id]: !(current[id] ?? false) })); }
  function tree(space: DocSpace, parentId: string | null, depth: number): React.ReactNode {
    return pages.filter((page) => page.space_id === space.id && (page.parent_page_id ?? null) === parentId).map((page) => {
      const folder = !!page.source_entity_type && !page.source_attachment_id;
      const open = !!query || (expanded[page.id] ?? false);
      const matches = page.title.toLowerCase().includes(query);
      const descendants = tree(space, page.id, depth + 1);
      // Keep ancestors during search so a result retains its folder path.
      if (query && !matches && !pages.some((candidate) => candidate.space_id === space.id && candidate.title.toLowerCase().includes(query))) return null;
      return <div key={page.id}>
        <button type="button" title={page.title} aria-expanded={folder ? open : undefined} style={{ ...buttonStyle, padding: `4px 8px 4px ${12 + depth * 12}px`, background: activeTabId === page.id ? "var(--accent-primary-soft)" : "transparent" }} onClick={() => folder ? toggle(page.id) : openTab({ id: page.id, pageId: page.id, spaceId: space.id, title: page.title, viewMode: "editor" })}>
          {folder ? open ? <ChevronDown size={12} /> : <ChevronRight size={12} /> : <FileText size={12} />}
          {folder && <Folder size={12} />}<span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{page.title}</span>
        </button>
        {folder && open && descendants}
      </div>;
    });
  }
  return <>{spaces.map((space) => {
    const open = !!query || (expanded[space.id] ?? false);
    return <div key={space.id} style={{ marginBottom: 6 }}>
      <button type="button" aria-label={`${space.name} workspace`} aria-expanded={open} style={{ ...buttonStyle, fontSize: 12, fontWeight: 650, color: "var(--text-primary)", padding: "5px 8px" }} onClick={() => toggle(space.id)}>
        {open ? <FolderOpen size={14} color="var(--accent-primary)" /> : <Folder size={14} color="var(--accent-primary)" />}<span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{space.name}</span>{open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>
      {open && tree(space, null, 0)}
    </div>;
  })}</>;
}