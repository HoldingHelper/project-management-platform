"use client";

import Link from "next/link";
import { notFound } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Building2, CalendarClock, CircleDot, Network, UsersRound } from "lucide-react";
import { getHoldingCockpit } from "@/lib/api/org";
import { Alert, Card } from "@/components/ds";
import { PageHeader, PAGE_STYLE, Spinner } from "@/components/ui/States";

const ragLabel: Record<string, string> = {
  "on-track": "On track", "at-risk": "At risk", delayed: "Delayed", blocked: "Blocked", completed: "Complete",
};

export function HoldingCockpit({ slug }: { slug: string }) {
  const query = useQuery({ queryKey: ["org", "cockpit"], queryFn: getHoldingCockpit });
  if (query.isLoading) return <div style={PAGE_STYLE}><Spinner label="Loading holding cockpit…" /></div>;
  if (query.error || !query.data) return <div style={PAGE_STYLE}><Alert kind="critical" title="Cockpit unavailable" description="The holding graph may not be migrated yet, or your account has no holding membership." /></div>;
  const data = query.data;
  if (data.holding.slug !== slug) notFound();

  return (
    <div className="holding-cockpit" style={{ ...PAGE_STYLE, maxWidth: 1500, gap: 22 }}>
      <PageHeader title={data.holding.name} subtitle="Portfolio health, capacity, milestones, risks, and strategic alignment in one operating view." badge={<span className="scope-badge">HOLDING COCKPIT</span>} />

      <section className="holding-metric-grid" aria-label="Holding summary">
        <Card><span>Active ventures</span><strong>{data.active_ventures}</strong><Building2 size={18} /></Card>
        <Card><span>Needs attention</span><strong>{data.at_risk_ventures}</strong><AlertTriangle size={18} /></Card>
        <Card><span>Allocated capacity</span><strong>{Math.round(data.total_allocated_percent)}%</strong><UsersRound size={18} /></Card>
        <Card><span>Orphan projects</span><strong>{data.orphan_projects}</strong><Network size={18} /></Card>
      </section>

      <section aria-labelledby="venture-portfolio-title">
        <div className="holding-section-heading">
          <div><span className="pmp-eyebrow">Portfolio</span><h2 id="venture-portfolio-title">Venture health</h2></div>
          <span>{data.ventures.length} visible scopes</span>
        </div>
        {data.ventures.length === 0 ? (
          <div className="holding-empty"><Building2 size={26} /><strong>No ventures yet</strong><span>Create a venture in Admin / Org to start the portfolio.</span></div>
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
                  <span><b>{venture.project_count}</b> projects</span>
                  <span><b>{venture.member_count}</b> people</span>
                  <span><b>{Math.round(venture.allocation_percent)}%</b> allocation</span>
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
