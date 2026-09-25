"use client";

import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, ChevronRight, GitBranch, LockKeyhole, Plus, UsersRound } from "lucide-react";
import { createOrgNode, listOrgNodes } from "@/lib/api/org";
import { Alert, Button, Card, TextInput, Select } from "@/components/ds";
import { PageHeader, PAGE_STYLE, Spinner } from "@/components/ui/States";

const TYPES = [
  { value: "venture", label: "Venture" }, { value: "function", label: "Function" },
  { value: "program", label: "Program" }, { value: "project", label: "Project scope" },
  { value: "shared_initiative", label: "Shared initiative" }, { value: "team", label: "Team" },
  { value: "doc_space", label: "Document space" },
];

export function OrgAdmin() {
  const queryClient = useQueryClient();
  const nodes = useQuery({ queryKey: ["org", "nodes"], queryFn: () => listOrgNodes() });
  const [name, setName] = useState("");
  const [type, setType] = useState("venture");
  const [parentId, setParentId] = useState("");
  const [confidentiality, setConfidentiality] = useState("standard");
  const mutation = useMutation({
    mutationFn: createOrgNode,
    onSuccess: async () => { setName(""); await queryClient.invalidateQueries({ queryKey: ["org"] }); },
  });
  const ordered = useMemo(() => [...(nodes.data ?? [])].sort((a, b) => a.path.localeCompare(b.path)), [nodes.data]);

  function submit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate({ type, parent_id: parentId || null, name, confidentiality });
  }

  if (nodes.isLoading) return <div style={PAGE_STYLE}><Spinner label="Loading organization graph…" /></div>;
  return (
    <div style={{ ...PAGE_STYLE, maxWidth: 1450, gap: 20 }}>
      <PageHeader title="Organization graph" subtitle="Edit holding scopes, confidentiality boundaries, and the hierarchy that drives access and roll-ups." badge={<span className="scope-badge">ADMIN</span>} />
      {mutation.error && <Alert kind="critical" title="Scope not created" description={mutation.error.message} />}
      <div className="org-admin-grid">
        <Card title="Scope hierarchy" subtitle={`${ordered.length} visible nodes`}>
          <div className="org-tree-list">
            {ordered.map((node) => {
              const depth = node.path.split(".").length - 1;
              return (
                <div key={node.id} style={{ paddingLeft: Math.min(depth, 5) * 20 }}>
                  {depth > 0 && <ChevronRight size={13} aria-hidden />}
                  {node.type === "team" ? <UsersRound size={15} /> : node.type === "holding" || node.type === "venture" ? <Building2 size={15} /> : <GitBranch size={15} />}
                  <span><b>{node.name}</b><small>{node.type.replaceAll("_", " ")}</small></span>
                  {node.confidentiality !== "standard" && <LockKeyhole size={14} aria-label={node.confidentiality} />}
                </div>
              );
            })}
          </div>
        </Card>
        <Card title="Create scope" subtitle="Parent rules and inherited confidentiality are enforced by the server.">
          <form className="org-create-form" onSubmit={submit}>
            <label>Name<TextInput value={name} onChange={(event) => setName(event.target.value)} required placeholder="e.g. Group Marketing" /></label>
            <label>Type<Select value={type} onChange={(event) => setType(event.target.value)} options={TYPES} /></label>
            <label>Parent<Select value={parentId} onChange={(event) => setParentId(event.target.value)} placeholder="Select a parent" options={ordered.map((node) => ({ value: node.id, label: `${node.name} · ${node.type}` }))} /></label>
            <label>Confidentiality<Select value={confidentiality} onChange={(event) => setConfidentiality(event.target.value)} options={[{ value: "standard", label: "Standard" }, { value: "restricted", label: "Restricted" }, { value: "board", label: "Board" }]} /></label>
            <Button type="submit" disabled={!name || !parentId || mutation.isPending}><Plus size={15} />{mutation.isPending ? "Creating…" : "Create scope"}</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
