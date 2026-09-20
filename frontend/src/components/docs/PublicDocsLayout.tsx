import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { PublicShell } from "@/components/public/PublicShell";
import { DOC_CATEGORIES } from "@/lib/docs/content";
import { DocsSearch } from "./DocsSearch";

export function PublicDocsLayout({ children, currentCategory, currentSlug, toc = [] }: { children: ReactNode; currentCategory?: string; currentSlug?: string; toc?: { id: string; title: string }[] }) {
  return <PublicShell><div className="docs-top"><div className="public-container"><div><Link href="/docs">Documentation</Link>{currentCategory && <><ChevronRight size={14}/><span>{DOC_CATEGORIES.find((c)=>c.slug===currentCategory)?.label}</span></>}</div><DocsSearch compact/></div></div><div className="docs-layout public-container"><aside className="docs-sidebar" aria-label="Documentation navigation"><nav aria-label="Documentation categories">{DOC_CATEGORIES.map((category)=><div key={category.slug}><Link href={`/docs/${category.slug}`} className={currentCategory===category.slug?"active":""}>{category.label}</Link>{currentCategory===category.slug&&<ul>{category.docs.map((doc)=><li key={doc.slug}><Link href={`/docs/${doc.category}/${doc.slug}`} aria-current={currentSlug===doc.slug?"page":undefined}>{doc.title}</Link></li>)}</ul>}</div>)}</nav></aside><div className="docs-content">{children}</div>{toc.length>0&&<aside className="docs-toc" aria-label="On this page"><span>On this page</span><nav aria-label="Article sections">{toc.map((item)=><a key={item.id} href={`#${item.id}`}>{item.title}</a>)}</nav></aside>}</div></PublicShell>;
}
