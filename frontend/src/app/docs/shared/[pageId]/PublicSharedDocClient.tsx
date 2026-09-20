"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Globe2 } from "lucide-react";
import { PublicDocsLayout } from "@/components/docs/PublicDocsLayout";
import { MarkdownPreview } from "@/components/ds";
import { getPublicDocPage } from "@/lib/api/docs";
import { useStaticExportParams } from "@/lib/static-export-route";

export default function PublicSharedDocClient() {
  const { pageId: exportedPageId } = useParams<{ pageId: string }>();
  const [pageId] = useStaticExportParams([exportedPageId], ["docs", "shared"]);
  const page = useQuery({
    queryKey: ["public-doc-page", pageId],
    queryFn: () => getPublicDocPage(pageId),
    enabled: Boolean(pageId),
    retry: 1,
  });

  return (
    <PublicDocsLayout>
      <article className="docs-article">
        <Link href="/docs" style={{ display: "inline-flex", gap: 6, alignItems: "center", marginBottom: 20 }}>
          <ArrowLeft size={15} /> All documentation
        </Link>
        {!pageId || page.isLoading ? (
          <p>Loading published document…</p>
        ) : page.isError || !page.data ? (
          <div role="alert">
            <h1>Document unavailable</h1>
            <p>This page is private, unpublished, or no longer exists.</p>
          </div>
        ) : (
          <>
            <div className="docs-article-meta"><span><Globe2 size={13} /> Public workspace document</span></div>
            <h1>{page.data.seo_title || page.data.title}</h1>
            {page.data.excerpt && <p className="docs-lead">{page.data.excerpt}</p>}
            <MarkdownPreview value={page.data.content} empty="This public document has no content yet." />
          </>
        )}
      </article>
    </PublicDocsLayout>
  );
}
