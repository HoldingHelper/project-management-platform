"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Globe2 } from "lucide-react";
import { listPublicDocNavigation } from "@/lib/api/docs";

export function PublishedWorkspaceDocs() {
  const navigation = useQuery({
    queryKey: ["public-workspace-docs"],
    queryFn: listPublicDocNavigation,
    retry: 1,
  });
  const pages = (navigation.data ?? []).flatMap((space) =>
    space.pages.map((page) => ({ ...page, space: space.name })),
  );
  if (!pages.length) return null;

  return (
    <section className="docs-category-grid" aria-labelledby="workspace-published-docs">
      <h2 id="workspace-published-docs">Published from the workspace</h2>
      <div>
        {pages.map((page) => (
          <Link href={`/docs/shared/${page.id}`} key={page.id}>
            <Globe2 size={21} />
            <span>
              <b>{page.title}</b>
              <small>{page.space}{page.excerpt ? ` · ${page.excerpt}` : ""}</small>
            </span>
            <ArrowRight size={17} />
          </Link>
        ))}
      </div>
    </section>
  );
}
