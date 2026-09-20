"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listInvitations, revokeInvitation } from "@/lib/api/users";
import { Button, DataTable, useToast, type Column } from "@/components/ds";
import { PageHeader, PAGE_STYLE, Spinner } from "@/components/ui/States";
import { relativeTime } from "@/lib/format";
import type { InvitationRead } from "@/lib/types";

const STATUS_COLOR: Record<InvitationRead["status"], string> = {
  pending: "var(--status-in-progress)",
  accepted: "var(--status-completed)",
  revoked: "var(--text-tertiary)",
  expired: "var(--status-delayed)",
};

export default function AdminInvitationsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data, isLoading } = useQuery({
    queryKey: ["invitations"],
    queryFn: listInvitations,
  });

  const revoke = useMutation({
    mutationFn: (id: string) => revokeInvitation(id),
    onSuccess: () => {
      toast.push("Invitation revoked.", "success");
      queryClient.invalidateQueries({ queryKey: ["invitations"] });
    },
  });

  const columns: Column<InvitationRead>[] = [
    {
      key: "email",
      header: "Email",
      sortValue: (i) => i.email,
      render: (i) => <span style={{ fontWeight: 600 }}>{i.email}</span>,
    },
    { key: "role", header: "Role", render: (i) => i.role_name },
    {
      key: "status",
      header: "Status",
      sortValue: (i) => i.status,
      render: (i) => (
        <span style={{ color: STATUS_COLOR[i.status], fontSize: 12.5, fontWeight: 600, textTransform: "capitalize" }}>
          {i.status}
        </span>
      ),
    },
    {
      key: "sent",
      header: "Sent",
      sortValue: (i) => i.created_at,
      render: (i) => (
        <span style={{ color: "var(--text-tertiary)", fontSize: 12.5 }}>{relativeTime(i.created_at)}</span>
      ),
    },
    {
      key: "expires",
      header: "Expires",
      render: (i) => (
        <span style={{ color: "var(--text-tertiary)", fontSize: 12.5 }}>
          {new Date(i.expires_at).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (i) =>
        i.status === "pending" ? (
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <Button
              variant="secondary"
              onClick={async () => {
                const origin = typeof window !== "undefined" ? window.location.origin : "";
                const url = i.invite_url || (i.invite_token ? `${origin}/accept-invitation/${i.invite_token}` : `${origin}/accept-invitation/${i.id}`);
                await navigator.clipboard.writeText(url);
                toast.push("Invite link copied to clipboard!", "success");
              }}
            >
              Copy Link
            </Button>
            <Button variant="tertiary" onClick={() => revoke.mutate(i.id)} disabled={revoke.isPending}>
              Revoke
            </Button>
          </div>
        ) : null,
    },
  ];

  return (
    <div style={PAGE_STYLE}>
      <PageHeader
        title="Invitations"
        subtitle={`${(data ?? []).filter((i) => i.status === "pending").length} pending.`}
        actions={
          <Link href="/admin/users">
            <Button variant="secondary">Back to users</Button>
          </Link>
        }
      />
      {isLoading ? (
        <Spinner label="Loading invitations…" />
      ) : (
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-3)", overflow: "hidden" }}>
          <DataTable columns={columns} rows={data ?? []} rowKey={(i) => i.id} emptyText="No invitations yet." />
        </div>
      )}
    </div>
  );
}
