"use client";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { LocalizedText } from "@/lib/i18n/I18nProvider";

import Link from "next/link";
import { AddProductLine, EditProductLine } from "./AddProductLine";
import { RemoveProductLine } from "./RemoveProductLine";
import { ProductDocumentation } from "./ProductDocumentation";
import { notFound } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Building2, CalendarClock, CircleDot, Network, UsersRound } from "lucide-react";
import { listAllProducts } from "@/lib/api/projects";
import { getHoldingCockpit } from "@/lib/api/org";
import { Alert, Card } from "@/components/ds";
import { PageHeader, PAGE_STYLE, Spinner } from "@/components/ui/States";

const ragLabel: Record<string, string> = {
  "on-track": "On track", "at-risk": "At risk", delayed: "Delayed", blocked: "Blocked", completed: "Complete",
};

export function HoldingCockpit({ slug }: { slug: string }) {
  const { t: translateUI } = useI18n();

  const query = useQuery({ queryKey: ["org", "cockpit"], queryFn: getHoldingCockpit });
  const products = useQuery({
    queryKey: ["products"], queryFn: listAllProducts,
  });
  const productLines = (
    <section aria-labelledby="holding-product-lines-title">
        <div className="holding-section-heading">
          <div><span className="pmp-eyebrow"><LocalizedText message={"Products"} /></span><h2 id="holding-product-lines-title"><LocalizedText message={"Product lines"} /></h2></div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>{products.data && <span>{products.data.length}{" "}<LocalizedText message={"product lines"} /></span>}{products.data && <AddProductLine products={products.data ?? []} />}</div>
        </div>
        {products.isLoading ? <Spinner label={translateUI("Loading product lines…")} /> : products.error ? (
          <Alert kind="critical" title={translateUI("Product lines unavailable")} description={translateUI("Could not load product lines. Please try again.")} />
        ) : products.data?.length ? (
          <div className="venture-card-grid">
            {products.data.map((product) => (
              <Card key={product.id} title={product.name} right={<div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}><span className="scope-badge">{product.status}</span><EditProductLine product={product} products={products.data ?? []} /><RemoveProductLine product={product} /></div>}>
                <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                  {product.description || "No description added yet."}
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12, fontSize: 12, color: "var(--text-secondary)" }}>
                  <span>{product.environment}</span><span>· {product.priority}</span>
                  {product.technology_stack.length > 0 && <span>· {product.technology_stack.join(", ")}</span>}
                  {product.repository_url && /^https?:\/\//i.test(product.repository_url) && <a href={product.repository_url} target="_blank" rel="noreferrer"><LocalizedText message={"Repository"} /></a>}
                </div>
                <ProductDocumentation product={product} />
              </Card>
            ))}
          </div>
        ) : (
          <div className="holding-empty"><strong><LocalizedText message={"No product lines available"} /></strong><span><LocalizedText message={"Product lines you own or belong to will appear here."} /></span></div>
        )}
      </section>
  );
  if (query.isLoading) return <div style={PAGE_STYLE}><Spinner label={translateUI("Loading holding cockpit…")} /></div>;
  if (query.error || !query.data) return <div style={PAGE_STYLE}><PageHeader title={translateUI("Holding")} subtitle={translateUI("Product lines and portfolio overview.")} /><Alert kind="warning" title={translateUI("Venture overview unavailable")} description={translateUI("The holding graph may not be configured yet, or your account has no holding membership.")} />{productLines}</div>;
  const data = query.data;
  if (data.holding.slug !== slug) notFound();

  return (
    <div className="holding-cockpit" style={{ ...PAGE_STYLE, maxWidth: 1500, gap: 22 }}>
      <PageHeader title={data.holding.name} subtitle={translateUI("Portfolio health, capacity, milestones, risks, and strategic alignment in one operating view.")} badge={<span className="scope-badge"><LocalizedText message={"HOLDING COCKPIT"} /></span>} />

      <section className="holding-metric-grid" aria-label={translateUI("Holding summary")}>
        <Card><span><LocalizedText message={"Active ventures"} /></span><strong>{data.active_ventures}</strong><Building2 size={18} /></Card>
        <Card><span><LocalizedText message={"Needs attention"} /></span><strong>{data.at_risk_ventures}</strong><AlertTriangle size={18} /></Card>
        <Card><span><LocalizedText message={"Allocated capacity"} /></span><strong>{Math.round(data.total_allocated_percent)}%</strong><UsersRound size={18} /></Card>
        <Card><span><LocalizedText message={"Orphan projects"} /></span><strong>{data.orphan_projects}</strong><Network size={18} /></Card>
      </section>

      {productLines}

      <section aria-labelledby="venture-portfolio-title">
        <div className="holding-section-heading">
          <div><span className="pmp-eyebrow"><LocalizedText message={"Portfolio"} /></span><h2 id="venture-portfolio-title"><LocalizedText message={"Venture health"} /></h2></div>
          <span>{data.ventures.length}{" "}<LocalizedText message={"visible scopes"} /></span>
        </div>
        {data.ventures.length === 0 ? (
          <div className="holding-empty"><Building2 size={26} /><strong><LocalizedText message={"No ventures yet"} /></strong><span><LocalizedText message={"Create a venture in Admin / Org to start the portfolio."} /></span></div>
        ) : (
          <div className="venture-card-grid">
            {data.ventures.map((venture) => (
              <Link href={`/v/${venture.slug}`} key={venture.id} className="venture-card">
                <div className="venture-card-top">
                  <span className={`rag-pill rag-${venture.rag}`}><CircleDot size={12} />{ragLabel[venture.rag] ?? venture.rag}</span>
                  <ArrowRight size={16} aria-hidden />
                </div>
                <h3>{venture.name}</h3>
                <div className="venture-stats">
                  <span><b>{venture.project_count}</b>{" "}<LocalizedText message={"projects"} /></span>
                  <span><b>{venture.member_count}</b>{" "}<LocalizedText message={"people"} /></span>
                  <span><b>{Math.round(venture.allocation_percent)}%</b>{" "}<LocalizedText message={"allocation"} /></span>
                </div>
                <div className="venture-signal">
                  <CalendarClock size={14} />
                  <span>{venture.next_milestone ?? "No next milestone set"}</span>
                </div>
                {venture.top_risk && <div className="venture-risk"><AlertTriangle size={14} /><span>{venture.top_risk}</span></div>}
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
