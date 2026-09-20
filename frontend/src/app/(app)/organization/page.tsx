"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Network, ShieldCheck, UserPlus, Users, Workflow } from "lucide-react";
import { getOrganizationTree } from "@/lib/api/organization";
import { listRoles, listUsers } from "@/lib/api/users";
import { OrgChartTree } from "@/components/organization/OrgChartTree";
import { Button, MetricCard, useToast } from "@/components/ds";
import { PageHeader, PAGE_STYLE, Spinner } from "@/components/ui/States";
import { useAuth } from "@/lib/auth/AuthProvider";
import { InviteModal } from "@/components/organization/InviteModal";
import type { UserRead } from "@/lib/types";

export default function OrganizationPage() {
  const { user, isSuperAdmin, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);

  const canManage = isSuperAdmin() || hasPermission("system.manage_users") || hasPermission("users.invite");

  const { data, isLoading, error } = useQuery({
    queryKey: ["organization-tree"],
    queryFn: getOrganizationTree,
  });

  const { data: roles } = useQuery({ queryKey: ["roles"], queryFn: listRoles });
  const roleNames = (roles ?? []).map((r) => r.name);

  return (
    <div style={{ ...PAGE_STYLE, gap: 18 }}>
      <PageHeader
        title="Organization Structure"
        subtitle="Interactive company hierarchy, executive reporting lines, departments, and teams."
        actions={
          canManage && (
            <Button onClick={() => setInviteOpen(true)}>
              <UserPlus size={15} style={{ marginRight: 6 }} /> Invite Teammate
            </Button>
          )
        }
      />

      {/* KPI Overview */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14 }}>
        <MetricCard
          label="Total Teammates"
          value={data?.total_employees ?? "..."}
          icon={<Users size={16} />}
          trend="active platform members"
        />
        <MetricCard
          label="Departments"
          value={data?.total_departments ?? "..."}
          icon={<Building2 size={16} />}
          tone="in-progress"
          trend="core functional units"
        />
        <MetricCard
          label="Teams"
          value={data?.total_teams ?? "..."}
          icon={<Workflow size={16} />}
          trend="squads & delivery units"
        />
        <MetricCard
          label="Reporting Lines"
          value={data?.roots?.length ?? "..."}
          icon={<Network size={16} />}
          tone="completed"
          trend="executive branches"
        />
      </div>

      {isLoading ? (
        <div style={{ padding: "80px 0", display: "flex", justifyContent: "center" }}>
          <Spinner label="Loading organization tree…" />
        </div>
      ) : error || !data ? (
        <div style={{ padding: "40px 0", textAlign: "center", color: "var(--text-tertiary)" }}>
          Could not load organization structure.
        </div>
      ) : (
        <OrgChartTree
          data={data}
          onInvite={() => setInviteOpen(true)}
          canManage={canManage}
        />
      )}

      {/* Invite Teammate Modal */}
      <InviteModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        roleNames={roleNames}
        departments={[]}
        onInvited={() => {
          queryClient.invalidateQueries({ queryKey: ["organization-tree"] });
        }}
      />
    </div>
  );
}
