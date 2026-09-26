"use client";

import Link from "next/link";
import { notFound } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CalendarRange, Flag, Target } from "lucide-react";
import { getVision, listObjectives, listOrgNodes } from "@/lib/api/org";
import { Card } from "@/components/ds";
import { PageHeader, PAGE_STYLE, Spinner } from "@/components/ui/States";

export function VentureHome({ slug }: { slug: string }) {
  const nodes = useQuery({ queryKey: ["org", "nodes"], queryFn: () => listOrgNodes() });
  const venture = nodes.data?.find((node) => node.type === "venture" && node.slug === slug);
  const vision = useQuery({ queryKey: ["strategy", "vision", venture?.id], queryFn: () => getVision(venture!.id), enabled: !!venture });
  const objectives = useQuery({ queryKey: ["strategy", "objectives", venture?.id], queryFn: () => listObjectives(venture!.id), enabled: !!venture });
  if (nodes.isLoading) return <div style={PAGE_STYLE}><Spinner label="Loading venture…" /></div>;
  if (!venture) notFound();
  const projects = nodes.data?.filter((node) => node.type === "project" && node.path.startsWith(`${venture.path}.`)) ?? [];

  return (
    <div className="venture-home" style={{ ...PAGE_STYLE, maxWidth: 1450, gap: 22 }}>
      <PageHeader title={venture.name} subtitle="Vision, objectives, roadmap, projects, people, decisions, and risk." badge={<span className="scope-badge">VENTURE</span>} />
      <Card className="venture-vision-card">
        <span className="pmp-eyebrow">Vision {vision.data?.horizon ? `· ${vision.data.horizon}` : ""}</span>
        <blockquote>{vision.data?.statement ?? "Add this venture’s north-star vision to align every objective and project."}</blockquote>
      </Card>
      <div className="venture-home-grid">
        <section>
          <div className="holding-section-heading"><div><span className="pmp-eyebrow">Strategy</span><h2>Objectives</h2></div><Target size={18} /></div>
          <div className="objective-list">
            {(objectives.data ?? []).map((objective) => (
              <Card key={objective.id}>
                <div><span>{objective.period}</span><b>{Math.round(objective.confidence * 100)}% confidence</b></div>
                <h3>{objective.title}</h3>
                <span className={`objective-status status-${objective.status}`}>{objective.status}</span>
              </Card>
            ))}
            {!objectives.isLoading && !objectives.data?.length && <div className="holding-empty"><Target size={24} /><strong>No objectives linked</strong><span>Add an objective to connect delivery to strategy.</span></div>}
          </div>
        </section>
        <section>
          <div className="holding-section-heading"><div><span className="pmp-eyebrow">Delivery</span><h2>Projects</h2></div><CalendarRange size={18} /></div>
          <div className="venture-project-list">
            {projects.map((project) => (
              <Link key={project.id} href={project.source_id ? `/projects/${project.source_id}` : `/scope/${project.id}`}><Flag size={15} /><span>{project.name}</span><ArrowRight size={15} /></Link>
            ))}
            {!projects.length && <div className="holding-empty"><Flag size={24} /><strong>No projects in this venture</strong><span>Projects created beneath this venture will appear here.</span></div>}
          </div>
        </section>
      </div>
    </div>
  );
}
