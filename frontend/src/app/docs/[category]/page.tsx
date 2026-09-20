import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { PublicDocsLayout } from "@/components/docs/PublicDocsLayout";
import { DOC_CATEGORIES } from "@/lib/docs/content";
import { getPublishedNavigation } from "@/lib/docs/server";
export function generateStaticParams(){return DOC_CATEGORIES.map(({slug})=>({category:slug}))}
async function resolveCategory(category:string){const local=DOC_CATEGORIES.find(c=>c.slug===category);if(local)return {label:local.label,docs:local.docs.map(doc=>({category:doc.category,slug:doc.slug,title:doc.title,description:doc.description,tags:doc.tags}))};const remote=(await getPublishedNavigation()).find(item=>item.slug===category);return remote?{label:remote.name,docs:remote.pages.map(page=>({category,slug:page.slug,title:page.title,description:page.excerpt||"Published workspace guide",tags:["published"]}))}:null}
export async function generateMetadata({params}:{params:Promise<{category:string}>}):Promise<Metadata>{const {category}=await params;const item=await resolveCategory(category);return item?{title:`${item.label} documentation`,description:`Guides for ${item.label.toLowerCase()} in Project Management Platform.`}:{}}
export default async function CategoryPage({params}:{params:Promise<{category:string}>}){const {category}=await params;const item=await resolveCategory(category);if(!item)notFound();return <PublicDocsLayout currentCategory={category}><header className="docs-category-header"><span className="public-kicker">Documentation topic</span><h1>{item.label}</h1><p>{item.docs.length} practical {item.docs.length===1?"guide":"guides"} for this part of the workspace.</p></header><div className="docs-article-list">{item.docs.map((doc,index)=><Link href={`/docs/${doc.category}/${doc.slug}`} key={doc.slug}><span>{String(index+1).padStart(2,"0")}</span><div><h2>{doc.title}</h2><p>{doc.description}</p><small>{doc.tags.join(" · ")}</small></div><ArrowRight size={18}/></Link>)}</div></PublicDocsLayout>}
