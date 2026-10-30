"use client";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { LocalizedText } from "@/lib/i18n/I18nProvider";

import Link from "next/link";
import { notFound } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, BriefcaseBusiness, Check, Inbox, Layers3 } from "lucide-react";
import { acceptWorkRequest, listOrgNodes, listWorkRequests } from "@/lib/api/org";
import { Button, Card } from "@/components/ds";
import { PageHeader, PAGE_STYLE, Spinner } from "@/components/ui/States";

export function FunctionHub({ slug }: { slug: string }) {
  const { t: translateUI } = useI18n();

  const queryClient = useQueryClient();
  const nodes = useQuery({ queryKey: ["org", "nodes"], queryFn: () => listOrgNodes() });
  const fn = nodes.data?.find((node) => node.type === "function" && node.slug === slug);
  const requests = useQuery({ queryKey: ["work", "requests", fn?.id], queryFn: () => listWorkRequests(fn!.id), enabled: !!fn });
  const accept = useMutation({ mutationFn: acceptWorkRequest, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["work", "requests", fn?.id] }); } });
  if (nodes.isLoading) return <div style={PAGE_STYLE}><Spinner label={translateUI("Loading function hub…")} /></div>;
  if (!fn) notFound();
  const workstreams = nodes.data?.filter((node) => node.type === "workstream" && (node.metadata_json.function_id === fn.id)) ?? [];

  return (
    <div style={{ ...PAGE_STYLE, maxWidth: 1450, gap: 20 }}>
      <PageHeader title={fn.name} subtitle={translateUI("Capacity, incoming requests, playbooks, and functional workstreams across every venture.")} badge={<span className="scope-badge"><LocalizedText message={"FUNCTION HUB"} /></span>} />
      <div className="function-hub-grid">
        <Card title={translateUI("Request queue")} subtitle={translateUI("Formal asks from ventures and shared initiatives")} right={<Inbox size={18} />}>
          <div className="request-list">
            {(requests.data ?? []).map((request) => (
              <article key={request.id}>
                <span className={`priority priority-${request.priority.toLowerCase()}`}>{request.priority}</span>
                <div><strong className="request-title">{request.title}</strong><p>{request.need}</p><small>{request.status}{request.due_date ? ` · due ${request.due_date}` : ""}</small></div>
                {request.status === "requested" && <Button variant="secondary" onClick={() => accept.mutate(request.id)} disabled={accept.isPending}><Check size={14} /><LocalizedText message={"Accept"} /></Button>}
              </article>
            ))}
            {!requests.isLoading && !requests.data?.length && <div className="holding-empty"><Inbox size={24} /><strong><LocalizedText message={"Queue is clear"} /></strong><span><LocalizedText message={"New cross-scope requests will appear here."} /></span></div>}
          </div>
        </Card>
        <Card title={translateUI("Workstreams across the holding")} subtitle={`${workstreams.length} visible lanes`} right={<Layers3 size={18} />}>
          <div className="venture-project-list">
            {workstreams.map((workstream) => <Link key={workstream.id} href={`/scope/${workstream.id}`}><BriefcaseBusiness size={15} /><span>{workstream.name}</span><ArrowRight size={15} /></Link>)}
            {!workstreams.length && <div className="holding-empty"><Layers3 size={24} /><strong><LocalizedText message={"No mapped workstreams"} /></strong><span><LocalizedText message={"Legacy partitions are mapped when their name matches this function."} /></span></div>}
          </div>
        </Card>
      </div>
    </div>
  );
}
