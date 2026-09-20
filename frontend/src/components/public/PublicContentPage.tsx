import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { PublicShell } from "./PublicShell";

export function PublicContentPage({ eyebrow, title, intro, children, cta = true }: { eyebrow: string; title: string; intro: string; children: ReactNode; cta?: boolean }) {
  return <PublicShell><header className="public-page-header public-container"><span className="public-kicker">{eyebrow}</span><h1>{title}</h1><p>{intro}</p></header>{children}{cta && <section className="public-cta compact"><div className="public-container"><h2>Ready to connect knowledge and execution?</h2><div><Link href="/app" className="public-primary public-large">Open workspace <ArrowRight size={18} /></Link><Link href="/docs" className="public-secondary public-large">Explore docs</Link></div></div></section>}</PublicShell>;
}
