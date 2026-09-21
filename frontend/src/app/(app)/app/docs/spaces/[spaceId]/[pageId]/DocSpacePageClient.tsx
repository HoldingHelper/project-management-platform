"use client";

import { useParams } from "next/navigation";
import { useStaticExportParams } from "@/lib/static-export-route";
import { MarkdownWorkspaceEditor } from "@/components/docs/workspace/MarkdownWorkspaceEditor";
import { ContextInspector } from "@/components/docs/workspace/ContextInspector";

export default function DocSpacePageClient() {
  const { spaceId: exportedSpaceId, pageId: exportedPageId } = useParams<{
    spaceId: string;
    pageId: string;
  }>();
  const [spaceId, pageId] = useStaticExportParams(
    [exportedSpaceId, exportedPageId],
    ["app", "docs", "spaces"]
  );

  return (
    <div style={{ display: "flex", height: "calc(100vh - var(--pmp-header-height, 64px))", width: "100%", overflow: "hidden" }}>
      <div style={{ flex: 1, minWidth: 0, height: "100%", display: "flex", flexDirection: "column" }}>
        <MarkdownWorkspaceEditor pageId={pageId} />
      </div>
      <div style={{ width: 340, flexShrink: 0, height: "100%" }}>
        <ContextInspector activePageId={pageId} />
      </div>
    </div>
  );
}
