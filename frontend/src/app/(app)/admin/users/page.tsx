"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Copy,
  Edit3,
  KeyRound,
  Lock,
  Mail,
  MailPlus,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserCog,
  UserPlus,
  Users,
  Workflow,
  Layers,
} from "lucide-react";
import { createTaskPartition, deleteTaskPartition, listTaskPartitions, updateTaskPartition } from "@/lib/api/projects";
import {
  adminResetPassword,
  adminUpdateUser,
  assignRoles,
  createRole,
  createInvitation,
  createUser,
  deleteUser,
  listInvitations,
  listPermissions,
  listRoles,
  listUsers,
  revokeInvitation,
  updateRolePermissions,
} from "@/lib/api/users";
import {
  createDepartment,
  createEmployee,
  createTeam,
  deleteDepartment,
  deleteTeam,
  listDepartments,
  listEmployees,
  listTeams,
  updateDepartment,
  updateTeam,
} from "@/lib/api/organization";
import { AppError } from "@/lib/api/client";
import {
  Avatar,
  Button,
  DataTable,
  Field,
  Modal,
  PresenceDot,
  Select,
  TextArea,
  TextInput,
  useToast,
  type Column,
} from "@/components/ds";
import { PageHeader, PAGE_STYLE, Spinner } from "@/components/ui/States";
import { useAuth } from "@/lib/auth/AuthProvider";
import { usePresenceMap } from "@/lib/stores/presence";
import { UserStatusHoverCard } from "@/components/status";
import { UserDetailsModal } from "@/components/organization/UserDetailsModal";
import { InviteModal } from "@/components/organization/InviteModal";
import type {
  DepartmentRead,
  InvitationRead,
  PermissionRead,
  PresenceStatus,
  RoleRead,
  TeamRead,
  TaskPartitionRead,
  UUID,
  UserRead,
} from "@/lib/types";

type AdminTab = "users" | "departments" | "teams" | "roles" | "partitions" | "invitations";

const smallAction: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 8px",
  background: "var(--surface-2)", border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-md)", color: "var(--text-secondary)", fontSize: 11.5, cursor: "pointer",
};

export default function AdminUsersPage() {
  const { user: currentUser, hasPermission, isSuperAdmin } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const presence = usePresenceMap();

  const [activeTab, setActiveTab] = useState<AdminTab>("users");
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");

  // User modals
  const [inviteOpen, setInviteOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editUserTarget, setEditUserTarget] = useState<UserRead | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<UserRead | null>(null);
  const [roleEditUser, setRoleEditUser] = useState<UserRead | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserRead | null>(null);
  const [viewDetailsUser, setViewDetailsUser] = useState<UserRead | null>(null);
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [editRoleTarget, setEditRoleTarget] = useState<RoleRead | null>(null);

  // Department modals
  const [deptModalOpen, setDeptModalOpen] = useState(false);
  const [editDeptTarget, setEditDeptTarget] = useState<DepartmentRead | null>(null);
  const [deleteDeptTarget, setDeleteDeptTarget] = useState<DepartmentRead | null>(null);

  // Team modals
  const [teamModalOpen, setTeamModalOpen] = useState(false);
  const [editTeamTarget, setEditTeamTarget] = useState<TeamRead | null>(null);
  const [deleteTeamTarget, setDeleteTeamTarget] = useState<TeamRead | null>(null);
  const [partitionModalOpen, setPartitionModalOpen] = useState(false);
  const [editPartitionTarget, setEditPartitionTarget] = useState<TaskPartitionRead | null>(null);
  const [deletePartitionTarget, setDeletePartitionTarget] = useState<TaskPartitionRead | null>(null);

  const canManage = isSuperAdmin() || hasPermission("system.manage_users");
  const canManageRoles = isSuperAdmin() || hasPermission("system.manage_roles");
  const canManagePartitions = canManage || hasPermission("system.manage_settings");

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ["admin-users", search],
    queryFn: () => listUsers({ search: search || undefined, page_size: 200 }),
  });

  const { data: roles } = useQuery({ queryKey: ["roles"], queryFn: listRoles });
  const { data: permissions } = useQuery({
    queryKey: ["permissions"],
    queryFn: listPermissions,
    enabled: canManageRoles,
  });
  const { data: departments, isLoading: deptsLoading } = useQuery({
    queryKey: ["departments"],
    queryFn: listDepartments,
  });
  const { data: teams, isLoading: teamsLoading } = useQuery({
    queryKey: ["teams"],
    queryFn: () => listTeams(),
  });
  const { data: employees } = useQuery({
    queryKey: ["employees"],
    queryFn: () => listEmployees(),
  });
  const { data: invitations, isLoading: invitesLoading } = useQuery({
    queryKey: ["admin-invitations"],
    queryFn: listInvitations,
  });
  const { data: partitions, isLoading: partitionsLoading } = useQuery({
    queryKey: ["task-partitions"],
    queryFn: listTaskPartitions,
  });

  const roleNames = (roles ?? []).map((r) => r.name);
  const allUsers = usersData?.items ?? [];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    queryClient.invalidateQueries({ queryKey: ["users"] });
    queryClient.invalidateQueries({ queryKey: ["departments"] });
    queryClient.invalidateQueries({ queryKey: ["teams"] });
    queryClient.invalidateQueries({ queryKey: ["employees"] });
    queryClient.invalidateQueries({ queryKey: ["admin-invitations"] });
    queryClient.invalidateQueries({ queryKey: ["organization-tree"] });
    queryClient.invalidateQueries({ queryKey: ["roles"] });
    queryClient.invalidateQueries({ queryKey: ["task-partitions"] });
  };

  const filteredUsers = allUsers.filter((u) => {
    if (departmentFilter !== "all") {
      if (u.department_id !== departmentFilter && u.department_name !== departmentFilter) {
        return false;
      }
    }
    return true;
  });

  // User columns
  const userColumns: Column<UserRead>[] = [
    {
      key: "name",
      header: "User",
      sortValue: (u) => u.full_name.toLowerCase(),
      render: (u) => {
        const live = presence[u.id];
        const status = (live?.status ?? (u.presence_status as PresenceStatus) ?? "offline") as PresenceStatus;
        const statusEmoji = live?.status_emoji ?? u.status_emoji;
        const statusText = live?.status_text ?? u.status_text;

        return (
          <UserStatusHoverCard
            userId={u.id}
            name={u.full_name}
            email={u.email}
            jobTitle={u.job_title}
            departmentName={u.department_name}
          >
            <div
              onClick={() => setViewDetailsUser(u)}
              style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
            >
              <span style={{ position: "relative", display: "inline-flex" }}>
                <Avatar name={u.full_name} size={30} />
                <PresenceDot status={status} overlay size={8} />
              </span>
              <span>
                <span style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                  {u.full_name}
                  {statusEmoji && <span style={{ fontSize: 13 }}>{statusEmoji}</span>}
                  {statusText && (
                    <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)" }}>
                      ({statusText})
                    </span>
                  )}
                </span>
                <span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{u.email}</span>
              </span>
            </div>
          </UserStatusHoverCard>
        );
      },
    },
    {
      key: "username",
      header: "Username",
      sortValue: (u) => u.username ?? "",
      render: (u) => (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{u.username ?? "—"}</span>
      ),
    },
    {
      key: "department",
      header: "Department",
      sortValue: (u) => u.department_name ?? "",
      render: (u) => (
        <span
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            padding: "2px 8px",
            borderRadius: "var(--radius-full)",
            background: u.department_name ? "var(--surface-3)" : "transparent",
            color: u.department_name ? "var(--text-secondary)" : "var(--text-tertiary)",
            border: u.department_name ? "1px solid var(--border-subtle)" : "none",
          }}
        >
          {u.department_name ?? "—"}
        </span>
      ),
    },
    {
      key: "team",
      header: "Team",
      sortValue: (u) => u.team_name ?? "",
      render: (u) => (
        <span
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            padding: "2px 8px",
            borderRadius: "var(--radius-full)",
            background: u.team_name ? "color-mix(in srgb, var(--primary) 12%, var(--surface-3))" : "transparent",
            color: u.team_name ? "var(--primary)" : "var(--text-tertiary)",
            border: u.team_name ? "1px solid var(--border-subtle)" : "none",
          }}
        >
          {u.team_name ?? "No team"}
        </span>
      ),
    },
    {
      key: "manager",
      header: "Reports To",
      sortValue: (u) => u.manager_name ?? "",
      render: (u) => {
        if (!u.manager_name) return <span style={{ color: "var(--text-tertiary)", fontSize: 12 }}>—</span>;
        return (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 500 }}>
            <Avatar name={u.manager_name} size={18} />
            <span>{u.manager_name}</span>
          </span>
        );
      },
    },
    {
      key: "roles",
      header: "Roles",
      render: (u) => (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {u.roles.map((r) => (
            <span
              key={r}
              style={{
                fontSize: 11,
                padding: "2px 7px",
                borderRadius: "var(--radius-full)",
                background: r === "SuperAdmin" || r === "CLevel" ? "color-mix(in srgb, var(--primary) 15%, var(--surface-3))" : "var(--surface-3)",
                color: r === "SuperAdmin" || r === "CLevel" ? "var(--primary)" : "var(--text-secondary)",
                fontWeight: 600,
                border: "1px solid var(--border-subtle)",
              }}
            >
              {r}
            </span>
          ))}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortValue: (u) => (u.is_active ? "active" : "deactivated"),
      render: (u) => (
        <span
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            color: u.is_active ? "var(--emerald-500)" : "var(--status-delayed)",
          }}
        >
          {u.is_active ? "Active" : "Deactivated"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (u) => (
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
          {canManage && (
            <>
              <button
                type="button"
                onClick={() => setEditUserTarget(u)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "4px 8px",
                  background: "var(--surface-2)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-md)",
                  color: "var(--text-secondary)",
                  fontSize: 11.5,
                  cursor: "pointer",
                }}
                className="pmp-row"
              >
                <Edit3 size={12} /> Edit
              </button>
              <button
                type="button"
                onClick={() => setRoleEditUser(u)}
                style={{
                  padding: "4px 8px",
                  background: "var(--surface-2)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-md)",
                  color: "var(--text-secondary)",
                  fontSize: 11.5,
                  cursor: "pointer",
                }}
                className="pmp-row"
                title="Edit Roles"
              >
                <UserCog size={13} />
              </button>
              <button
                type="button"
                onClick={() => setPasswordTarget(u)}
                style={{
                  padding: "4px 8px",
                  background: "var(--surface-2)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-md)",
                  color: "var(--text-secondary)",
                  fontSize: 11.5,
                  cursor: "pointer",
                }}
                className="pmp-row"
                title="Reset Password"
              >
                <KeyRound size={13} />
              </button>
              {u.id !== currentUser?.id && (
                <button
                  type="button"
                  onClick={() => setDeleteTarget(u)}
                  style={{
                    padding: "4px 8px",
                    background: "var(--surface-2)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "var(--radius-md)",
                    color: "var(--status-delayed)",
                    fontSize: 11.5,
                    cursor: "pointer",
                  }}
                  className="pmp-row"
                  title="Delete User"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </>
          )}
        </div>
      ),
    },
  ];

  // Department columns
  const departmentColumns: Column<DepartmentRead>[] = [
    {
      key: "name",
      header: "Department",
      sortValue: (d) => d.name.toLowerCase(),
      render: (d) => (
        <div>
          <div style={{ fontWeight: 700, fontSize: 13.5, color: "var(--text-primary)" }}>{d.name}</div>
          {d.description && (
            <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 2 }}>{d.description}</div>
          )}
        </div>
      ),
    },
    {
      key: "head",
      header: "Department Head",
      render: (d) => {
        if (!d.head_of_department_name) return <span style={{ color: "var(--text-tertiary)", fontSize: 12 }}>Unassigned</span>;
        return (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600 }}>
            <Avatar name={d.head_of_department_name} size={22} />
            <span>{d.head_of_department_name}</span>
          </span>
        );
      },
    },
    {
      key: "teams",
      header: "Teams",
      render: (d) => (
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
          {d.teams_count ?? 0} teams
        </span>
      ),
    },
    {
      key: "members",
      header: "Members",
      render: (d) => (
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
          {d.members_count ?? 0} members
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (d) => (
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
          {canManage && (
            <>
              <button
                type="button"
                onClick={() => setEditDeptTarget(d)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "4px 8px",
                  background: "var(--surface-2)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-md)",
                  color: "var(--text-secondary)",
                  fontSize: 11.5,
                  cursor: "pointer",
                }}
                className="pmp-row"
              >
                <Edit3 size={12} /> Edit
              </button>
              <button
                type="button"
                onClick={() => setDeleteDeptTarget(d)}
                style={{
                  padding: "4px 8px",
                  background: "var(--surface-2)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-md)",
                  color: "var(--status-delayed)",
                  fontSize: 11.5,
                  cursor: "pointer",
                }}
                className="pmp-row"
              >
                <Trash2 size={13} />
              </button>
            </>
          )}
        </div>
      ),
    },
  ];

  const partitionColumns: Column<TaskPartitionRead>[] = [
    {
      key: "name",
      header: "Partition",
      sortValue: (item) => item.name.toLowerCase(),
      render: (item) => <div><div style={{ fontWeight: 700 }}>{item.name}</div><div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{item.description || item.slug}</div></div>,
    },
    { key: "usage", header: "Used by", render: (item) => <span style={{ fontSize: 12 }}>{item.task_count} tasks · {item.project_count} projects</span> },
    { key: "order", header: "Order", render: (item) => <span style={{ fontSize: 12 }}>{item.display_order}</span> },
    {
      key: "actions", header: "", render: (item) => canManagePartitions ? <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <button type="button" className="pmp-row" onClick={() => setEditPartitionTarget(item)} style={smallAction}><Edit3 size={12} /> Edit</button>
        <button type="button" className="pmp-row" onClick={() => setDeletePartitionTarget(item)} style={{ ...smallAction, color: "var(--status-delayed)" }}><Trash2 size={13} /></button>
      </div> : null,
    },
  ];

  // Team columns
  const teamColumns: Column<TeamRead>[] = [
    {
      key: "name",
      header: "Team",
      sortValue: (t) => t.name.toLowerCase(),
      render: (t) => (
        <div>
          <div style={{ fontWeight: 700, fontSize: 13.5, color: "var(--text-primary)" }}>{t.name}</div>
          {t.description && (
            <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 2 }}>{t.description}</div>
          )}
        </div>
      ),
    },
    {
      key: "department",
      header: "Department",
      render: (t) => (
        <span
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            padding: "2px 8px",
            borderRadius: "var(--radius-full)",
            background: "var(--surface-3)",
            color: "var(--text-secondary)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          {t.department_name ?? "—"}
        </span>
      ),
    },
    {
      key: "lead",
      header: "Team Lead / Manager",
      render: (t) => {
        if (!t.lead_user_name) return <span style={{ color: "var(--text-tertiary)", fontSize: 12 }}>Unassigned</span>;
        return (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600 }}>
            <Avatar name={t.lead_user_name} size={22} />
            <span>{t.lead_user_name}</span>
          </span>
        );
      },
    },
    {
      key: "members",
      header: "Members",
      render: (t) => (
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
          {t.member_count ?? 0} members
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (t) => (
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
          {canManage && (
            <>
              <button
                type="button"
                onClick={() => setEditTeamTarget(t)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "4px 8px",
                  background: "var(--surface-2)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-md)",
                  color: "var(--text-secondary)",
                  fontSize: 11.5,
                  cursor: "pointer",
                }}
                className="pmp-row"
              >
                <Edit3 size={12} /> Edit
              </button>
              <button
                type="button"
                onClick={() => setDeleteTeamTarget(t)}
                style={{
                  padding: "4px 8px",
                  background: "var(--surface-2)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-md)",
                  color: "var(--status-delayed)",
                  fontSize: 11.5,
                  cursor: "pointer",
                }}
                className="pmp-row"
              >
                <Trash2 size={13} />
              </button>
            </>
          )}
        </div>
      ),
    },
  ];

  // Invitation columns
  const invitationColumns: Column<InvitationRead>[] = [
    {
      key: "email",
      header: "Invited Email",
      render: (inv) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}>{inv.email}</div>
          <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Role: {inv.role_name}</div>
        </div>
      ),
    },
    {
      key: "dept_team",
      header: "Assigned Structure",
      render: (inv) => (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {inv.department_name && (
            <span style={{ fontSize: 11, background: "var(--surface-3)", padding: "2px 7px", borderRadius: "var(--radius-full)", border: "1px solid var(--border-subtle)" }}>
              {inv.department_name}
            </span>
          )}
          {inv.team_name && (
            <span style={{ fontSize: 11, background: "color-mix(in srgb, var(--primary) 15%, var(--surface-3))", color: "var(--primary)", padding: "2px 7px", borderRadius: "var(--radius-full)" }}>
              {inv.team_name}
            </span>
          )}
          {inv.manager_name && (
            <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
              Mgr: {inv.manager_name}
            </span>
          )}
          {!inv.department_name && !inv.team_name && <span style={{ color: "var(--text-tertiary)", fontSize: 12 }}>—</span>}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (inv) => (
        <span
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            color: inv.status === "pending" ? "var(--status-in-progress)" : inv.status === "accepted" ? "var(--emerald-500)" : "var(--text-tertiary)",
            textTransform: "capitalize",
          }}
        >
          {inv.status}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (inv) => {
        if (inv.status !== "pending") return null;
        return (
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={() => {
                const url = inv.invite_url || `${window.location.origin}/accept-invitation/${inv.invite_token || ""}`;
                if (inv.invite_url) {
                  navigator.clipboard.writeText(inv.invite_url);
                  toast.success("Invite link copied!");
                } else {
                  toast.info("Invite token already sent to email.");
                }
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "4px 8px",
                background: "var(--surface-2)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-md)",
                color: "var(--text-secondary)",
                fontSize: 11.5,
                cursor: "pointer",
              }}
              className="pmp-row"
            >
              <Copy size={12} /> Copy Link
            </button>
            <button
              type="button"
              onClick={async () => {
                try {
                  await revokeInvitation(inv.id);
                  toast.success("Invitation revoked");
                  invalidate();
                } catch {
                  toast.error("Failed to revoke invitation");
                }
              }}
              style={{
                padding: "4px 8px",
                background: "var(--surface-2)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-md)",
                color: "var(--status-delayed)",
                fontSize: 11.5,
                cursor: "pointer",
              }}
              className="pmp-row"
            >
              Revoke
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div style={{ ...PAGE_STYLE, gap: 18 }}>
      <PageHeader
        title="Teammates & Organization"
        subtitle="Manage users, organizational structure, departments, teams, manager hierarchy, and team invite links."
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button
              variant="secondary"
              onClick={() => {
                window.location.href = "/organization";
              }}
            >
              <Building2 size={14} style={{ marginRight: 6 }} /> Visual Org Tree
            </Button>
            {canManage && (
              <>
                <Button variant="secondary" onClick={() => setInviteOpen(true)}>
                  <MailPlus size={14} style={{ marginRight: 6 }} /> Invite Teammate
                </Button>
                {activeTab === "departments" && (
                  <Button onClick={() => setDeptModalOpen(true)}>
                    <Plus size={14} style={{ marginRight: 6 }} /> New Department
                  </Button>
                )}
                {activeTab === "teams" && (
                  <Button onClick={() => setTeamModalOpen(true)}>
                    <Plus size={14} style={{ marginRight: 6 }} /> New Team
                  </Button>
                )}
                {activeTab === "partitions" && canManagePartitions && (
                  <Button onClick={() => setPartitionModalOpen(true)}>
                    <Plus size={14} style={{ marginRight: 6 }} /> New Partition
                  </Button>
                )}
                {activeTab === "users" && (
                  <Button onClick={() => setAddOpen(true)}>
                    <UserPlus size={14} style={{ marginRight: 6 }} /> Add User
                  </Button>
                )}
                {activeTab === "roles" && canManageRoles && (
                  <Button onClick={() => setRoleModalOpen(true)}>
                    <Plus size={14} style={{ marginRight: 6 }} /> New Role
                  </Button>
                )}
              </>
            )}
          </div>
        }
      />

      {/* Tabs Navigation */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          borderBottom: "1px solid var(--border-subtle)",
          paddingBottom: 8,
          marginBottom: 4,
        }}
      >
        <TabButton
          active={activeTab === "users"}
          onClick={() => setActiveTab("users")}
          label={`Teammates (${allUsers.length})`}
          icon={<Users size={14} />}
        />
        <TabButton
          active={activeTab === "departments"}
          onClick={() => setActiveTab("departments")}
          label={`Departments (${departments?.length ?? 0})`}
          icon={<Building2 size={14} />}
        />
        <TabButton
          active={activeTab === "teams"}
          onClick={() => setActiveTab("teams")}
          label={`Teams (${teams?.length ?? 0})`}
          icon={<Workflow size={14} />}
        />
        {canManageRoles && (
          <TabButton
            active={activeTab === "roles"}
            onClick={() => setActiveTab("roles")}
            label={`Roles (${roles?.length ?? 0})`}
            icon={<ShieldCheck size={14} />}
          />
        )}
        {canManagePartitions && (
          <TabButton
            active={activeTab === "partitions"}
            onClick={() => setActiveTab("partitions")}
            label={`Partitions (${partitions?.length ?? 0})`}
            icon={<Layers size={14} />}
          />
        )}
        <TabButton
          active={activeTab === "invitations"}
          onClick={() => setActiveTab("invitations")}
          label={`Invitations (${(invitations ?? []).filter((i) => i.status === "pending").length})`}
          icon={<Mail size={14} />}
        />
      </div>

      {/* Tab: Users */}
      {activeTab === "users" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ position: "relative", minWidth: 260 }}>
              <Search size={15} style={{ position: "absolute", left: 10, top: 10, color: "var(--text-tertiary)" }} />
              <TextInput
                placeholder="Search teammates by name or email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ paddingLeft: 32, height: 34, fontSize: 13 }}
              />
            </div>

            <Select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              options={[
                { value: "all", label: "All Departments" },
                ...(departments ?? []).map((d) => ({ value: d.id, label: d.name })),
              ]}
              style={{ width: 200, height: 34 }}
            />
          </div>

          {usersLoading ? (
            <div style={{ padding: "60px 0", display: "flex", justifyContent: "center" }}>
              <Spinner label="Loading teammates…" />
            </div>
          ) : (
            <DataTable<UserRead>
              rows={filteredUsers}
              columns={userColumns}
              rowKey={(u) => u.id}
              emptyText="No teammates found matching your criteria."
            />
          )}
        </div>
      )}

      {/* Tab: Departments */}
      {activeTab === "departments" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {deptsLoading ? (
            <div style={{ padding: "60px 0", display: "flex", justifyContent: "center" }}>
              <Spinner label="Loading departments…" />
            </div>
          ) : (
            <DataTable<DepartmentRead>
              rows={departments ?? []}
              columns={departmentColumns}
              rowKey={(d) => d.id}
              emptyText="No departments configured yet. Click 'New Department' to create one."
            />
          )}
        </div>
      )}

      {/* Tab: Teams */}
      {activeTab === "teams" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {teamsLoading ? (
            <div style={{ padding: "60px 0", display: "flex", justifyContent: "center" }}>
              <Spinner label="Loading teams…" />
            </div>
          ) : (
            <DataTable<TeamRead>
              rows={teams ?? []}
              columns={teamColumns}
              rowKey={(t) => t.id}
              emptyText="No teams configured yet. Click 'New Team' to create one."
            />
          )}
        </div>
      )}

      {/* Tab: Roles */}
      {activeTab === "roles" && canManageRoles && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 310px), 1fr))",
            gap: 12,
          }}
        >
          {(roles ?? []).map((role) => (
            <RoleCard
              key={role.id}
              role={role}
              permissions={permissions ?? []}
              onEdit={role.name === "SuperAdmin" ? undefined : () => setEditRoleTarget(role)}
            />
          ))}
        </div>
      )}

      {activeTab === "partitions" && canManagePartitions && (
        partitionsLoading ? <div style={{ padding: "60px 0", display: "flex", justifyContent: "center" }}><Spinner label="Loading partitions…" /></div> :
          <DataTable<TaskPartitionRead> rows={partitions ?? []} columns={partitionColumns} rowKey={(item) => item.id} emptyText="No partitions configured yet." />
      )}

      {/* Tab: Invitations */}
      {activeTab === "invitations" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {invitesLoading ? (
            <div style={{ padding: "60px 0", display: "flex", justifyContent: "center" }}>
              <Spinner label="Loading invitations…" />
            </div>
          ) : (
            <DataTable<InvitationRead>
              rows={invitations ?? []}
              columns={invitationColumns}
              rowKey={(i) => i.id}
              emptyText="No pending invitations."
            />
          )}
        </div>
      )}

      {/* Modals */}
      <InviteModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        roleNames={roleNames}
        departments={departments ?? []}
        teams={teams ?? []}
        users={allUsers}
        onInvited={invalidate}
      />

      <AddUserModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        roleNames={roleNames}
        departments={departments ?? []}
        teams={teams ?? []}
        users={allUsers}
        onDone={() => {
          setAddOpen(false);
          invalidate();
        }}
      />

      <EditUserModal
        user={editUserTarget}
        onClose={() => setEditUserTarget(null)}
        roleNames={roleNames}
        departments={departments ?? []}
        teams={teams ?? []}
        users={allUsers}
        onDone={() => {
          setEditUserTarget(null);
          invalidate();
        }}
      />

      <EditRolesModal
        user={roleEditUser}
        onClose={() => setRoleEditUser(null)}
        roleNames={roleNames}
        onDone={() => {
          setRoleEditUser(null);
          invalidate();
        }}
      />

      <CreateRoleModal
        open={roleModalOpen}
        permissions={permissions ?? []}
        onClose={() => setRoleModalOpen(false)}
        onDone={() => {
          setRoleModalOpen(false);
          invalidate();
          toast.success("Role created successfully");
        }}
      />

      <EditRolePermissionsModal
        role={editRoleTarget}
        permissions={permissions ?? []}
        onClose={() => setEditRoleTarget(null)}
        onDone={() => {
          setEditRoleTarget(null);
          invalidate();
          toast.success("Role permissions updated");
        }}
      />

      <AdminResetPasswordModal
        user={passwordTarget}
        onClose={() => setPasswordTarget(null)}
        onDone={() => {
          setPasswordTarget(null);
          toast.success("Password updated successfully");
        }}
      />

      <DeleteUserModal
        user={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDone={() => {
          setDeleteTarget(null);
          invalidate();
        }}
      />

      {/* Department Modals */}
      <DepartmentModal
        open={deptModalOpen || Boolean(editDeptTarget)}
        department={editDeptTarget}
        users={allUsers}
        onClose={() => {
          setDeptModalOpen(false);
          setEditDeptTarget(null);
        }}
        onDone={() => {
          setDeptModalOpen(false);
          setEditDeptTarget(null);
          invalidate();
        }}
      />

      <DeleteDepartmentModal
        department={deleteDeptTarget}
        onClose={() => setDeleteDeptTarget(null)}
        onDone={() => {
          setDeleteDeptTarget(null);
          invalidate();
        }}
      />

      {/* Team Modals */}
      <TeamModal
        open={teamModalOpen || Boolean(editTeamTarget)}
        team={editTeamTarget}
        departments={departments ?? []}
        users={allUsers}
        onClose={() => {
          setTeamModalOpen(false);
          setEditTeamTarget(null);
        }}
        onDone={() => {
          setTeamModalOpen(false);
          setEditTeamTarget(null);
          invalidate();
        }}
      />

      <DeleteTeamModal
        team={deleteTeamTarget}
        onClose={() => setDeleteTeamTarget(null)}
        onDone={() => {
          setDeleteTeamTarget(null);
          invalidate();
        }}
      />

      <PartitionModal
        open={partitionModalOpen || Boolean(editPartitionTarget)}
        partition={editPartitionTarget}
        onClose={() => { setPartitionModalOpen(false); setEditPartitionTarget(null); }}
        onDone={() => { setPartitionModalOpen(false); setEditPartitionTarget(null); invalidate(); }}
      />
      <DeletePartitionModal
        partition={deletePartitionTarget}
        partitions={partitions ?? []}
        onClose={() => setDeletePartitionTarget(null)}
        onDone={() => { setDeletePartitionTarget(null); invalidate(); }}
      />

      {/* View User Details Modal */}
      <UserDetailsModal
        user={viewDetailsUser}
        open={Boolean(viewDetailsUser)}
        onClose={() => setViewDetailsUser(null)}
        onEdit={(u) => setEditUserTarget(u)}
        canEdit={canManage}
      />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "8px 14px",
        borderRadius: "var(--radius-md)",
        border: "none",
        background: active ? "var(--surface-3)" : "transparent",
        color: active ? "var(--text-primary)" : "var(--text-tertiary)",
        fontWeight: active ? 700 : 500,
        fontSize: 13,
        cursor: "pointer",
        transition: "all 0.15s ease",
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function PartitionModal({ open, partition, onClose, onDone }: { open: boolean; partition: TaskPartitionRead | null; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ name: "", description: "", display_order: "0" });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setForm({ name: partition?.name ?? "", description: partition?.description ?? "", display_order: String(partition?.display_order ?? 0) });
      setError(null);
    }
  }, [open, partition]);
  const mutation = useMutation({
    mutationFn: () => partition
      ? updateTaskPartition(partition.id, { name: form.name.trim(), description: form.description.trim() || null, display_order: Number(form.display_order) || 0 })
      : createTaskPartition({ name: form.name.trim(), description: form.description.trim() || undefined, display_order: Number(form.display_order) || 0 }),
    onSuccess: onDone,
    onError: (e) => setError(e instanceof AppError ? e.message : "Could not save partition."),
  });
  return <Modal open={open} onClose={onClose} title={partition ? "Edit Partition" : "New Partition"} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!form.name.trim() || mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? "Saving…" : "Save"}</Button></>}>
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Field label="Name"><TextInput value={form.name} onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))} placeholder="Design" /></Field>
      <Field label="Description"><TextArea value={form.description} onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))} /></Field>
      <Field label="Display order"><TextInput type="number" value={form.display_order} onChange={(e) => setForm((current) => ({ ...current, display_order: e.target.value }))} /></Field>
      {error && <div style={{ color: "var(--status-delayed)", fontSize: 12.5 }}>{error}</div>}
    </div>
  </Modal>;
}

function DeletePartitionModal({ partition, partitions, onClose, onDone }: { partition: TaskPartitionRead | null; partitions: TaskPartitionRead[]; onClose: () => void; onDone: () => void }) {
  const [replacement, setReplacement] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setReplacement(""); setError(null); }, [partition]);
  const mutation = useMutation({
    mutationFn: () => deleteTaskPartition(partition!.id, replacement || undefined),
    onSuccess: onDone,
    onError: (e) => setError(e instanceof AppError ? e.message : "Could not delete partition."),
  });
  return <Modal open={Boolean(partition)} onClose={onClose} title={`Delete ${partition?.name ?? "partition"}`} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="danger" disabled={mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? "Deleting…" : "Delete"}</Button></>}>
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={{ margin: 0, color: "var(--text-secondary)" }}>This partition is used by {partition?.task_count ?? 0} tasks and {partition?.project_count ?? 0} projects. Choose a replacement to preserve their classification, or leave them unpartitioned.</p>
      <Field label="Replacement (optional)"><Select value={replacement} onChange={(e) => setReplacement(e.target.value)} placeholder="Leave items unpartitioned" options={partitions.filter((item) => item.id !== partition?.id).map((item) => ({ value: item.id, label: item.name }))} /></Field>
      {error && <div style={{ color: "var(--status-delayed)", fontSize: 12.5 }}>{error}</div>}
    </div>
  </Modal>;
}

/* ========================================================================= */
/* Modals                                                                    */
/* ========================================================================= */

function AddUserModal({
  open,
  onClose,
  roleNames,
  departments,
  teams,
  users,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  roleNames: string[];
  departments: { id: string; name: string }[];
  teams: { id: string; name: string; department_id: string }[];
  users: UserRead[];
  onDone: () => void;
}) {
  const [form, setForm] = useState({
    email: "",
    username: "",
    first_name: "",
    last_name: "",
    password: "",
    job_title: "",
    role: "Developer",
    department_id: "",
    team_id: "",
    manager_id: "",
  });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const filteredTeams = useMemo(() => {
    if (!form.department_id) return teams;
    return teams.filter((t) => t.department_id === form.department_id);
  }, [teams, form.department_id]);

  const mutation = useMutation({
    mutationFn: () =>
      createUser({
        email: form.email.trim(),
        username: form.username.trim() || undefined,
        password: form.password,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        job_title: form.job_title.trim() || undefined,
        department_id: form.department_id || undefined,
        team_id: form.team_id || undefined,
        manager_id: form.manager_id || undefined,
        role_names: [form.role],
      }),
    onSuccess: onDone,
    onError: (e) =>
      setError(
        e instanceof AppError ? e.fieldErrors().join(" ") || e.message : "Failed to create user.",
      ),
  });

  const valid = form.email && form.first_name && form.last_name && form.password.length >= 8;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add Teammate Manually"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!valid || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Creating…" : "Create Teammate"}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="First name">
            <TextInput value={form.first_name} onChange={(e) => set("first_name")(e.target.value)} />
          </Field>
          <Field label="Last name">
            <TextInput value={form.last_name} onChange={(e) => set("last_name")(e.target.value)} />
          </Field>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Email">
            <TextInput type="email" value={form.email} onChange={(e) => set("email")(e.target.value)} />
          </Field>
          <Field label="Username (optional)">
            <TextInput value={form.username} onChange={(e) => set("username")(e.target.value)} />
          </Field>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Password (min 8 chars)">
            <TextInput
              type="password"
              value={form.password}
              onChange={(e) => set("password")(e.target.value)}
            />
          </Field>
          <Field label="Job title">
            <TextInput
              placeholder="e.g. Lead Designer"
              value={form.job_title}
              onChange={(e) => set("job_title")(e.target.value)}
            />
          </Field>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Department">
            <Select
              value={form.department_id}
              onChange={(e) => {
                set("department_id")(e.target.value);
                set("team_id")("");
              }}
              placeholder="Choose department…"
              options={departments.map((d) => ({ value: d.id, label: d.name }))}
            />
          </Field>
          <Field label="Team">
            <Select
              value={form.team_id}
              onChange={(e) => set("team_id")(e.target.value)}
              placeholder="Choose team…"
              options={filteredTeams.map((team) => ({ value: team.id, label: team.name }))}
            />
          </Field>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Reports to (Manager)">
            <Select
              value={form.manager_id}
              onChange={(e) => set("manager_id")(e.target.value)}
              placeholder="Choose manager…"
              options={users.map((u) => ({ value: u.id, label: u.full_name }))}
            />
          </Field>
          <Field label="Role">
            <Select
              value={form.role}
              onChange={(e) => set("role")(e.target.value)}
              options={roleNames.map((r) => ({ value: r, label: r }))}
            />
          </Field>
        </div>

        {error && <div style={{ fontSize: 12.5, color: "var(--status-delayed)" }}>{error}</div>}
      </div>
    </Modal>
  );
}

function EditUserModal({
  user,
  onClose,
  roleNames,
  departments,
  teams,
  users,
  onDone,
}: {
  user: UserRead | null;
  onClose: () => void;
  roleNames: string[];
  departments: { id: string; name: string }[];
  teams: { id: string; name: string; department_id: string }[];
  users: UserRead[];
  onDone: () => void;
}) {
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    username: "",
    email: "",
    job_title: "",
    department_id: "",
    team_id: "",
    manager_id: "",
    bio: "",
    is_active: true,
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setForm({
        first_name: user.first_name || "",
        last_name: user.last_name || "",
        username: user.username || "",
        email: user.email || "",
        job_title: user.job_title || "",
        department_id: user.department_id || "",
        team_id: user.team_id || "",
        manager_id: user.manager_id || "",
        bio: user.bio || "",
        is_active: user.is_active,
      });
      setError(null);
    }
  }, [user]);

  const set = (k: keyof typeof form) => (v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const filteredTeams = useMemo(() => {
    if (!form.department_id) return teams;
    return teams.filter((t) => t.department_id === form.department_id);
  }, [teams, form.department_id]);

  const mutation = useMutation({
    mutationFn: () =>
      adminUpdateUser(user!.id, {
        first_name: form.first_name.trim() || undefined,
        last_name: form.last_name.trim() || undefined,
        username: form.username.trim() || undefined,
        email: form.email.trim().toLowerCase() || undefined,
        job_title: form.job_title.trim() || undefined,
        department_id: form.department_id || undefined,
        team_id: form.team_id || undefined,
        manager_id: form.manager_id || undefined,
        bio: form.bio.trim() || undefined,
        is_active: form.is_active,
      }),
    onSuccess: onDone,
    onError: (e) =>
      setError(
        e instanceof AppError ? e.fieldErrors().join(" ") || e.message : "Failed to update user.",
      ),
  });

  const valid = form.first_name.trim() && form.last_name.trim() && form.email.trim();

  return (
    <Modal
      open={!!user}
      onClose={onClose}
      title={`Edit Teammate — ${user?.full_name ?? ""}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!valid || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Saving…" : "Save Changes"}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="First name">
            <TextInput value={form.first_name} onChange={(e) => set("first_name")(e.target.value)} />
          </Field>
          <Field label="Last name">
            <TextInput value={form.last_name} onChange={(e) => set("last_name")(e.target.value)} />
          </Field>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Username">
            <TextInput value={form.username} onChange={(e) => set("username")(e.target.value)} />
          </Field>
          <Field label="Email address">
            <TextInput value={form.email} onChange={(e) => set("email")(e.target.value)} />
          </Field>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Job title">
            <TextInput value={form.job_title} onChange={(e) => set("job_title")(e.target.value)} />
          </Field>
          <Field label="Account status">
            <Select
              value={form.is_active ? "active" : "deactivated"}
              onChange={(e) => set("is_active")(e.target.value === "active")}
              options={[
                { value: "active", label: "Active" },
                { value: "deactivated", label: "Deactivated" },
              ]}
            />
          </Field>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Department">
            <Select
              value={form.department_id}
              onChange={(e) => {
                set("department_id")(e.target.value);
                set("team_id")("");
              }}
              placeholder="Choose department…"
              options={departments.map((d) => ({ value: d.id, label: d.name }))}
            />
          </Field>
          <Field label="Team">
            <Select
              value={form.team_id}
              onChange={(e) => set("team_id")(e.target.value)}
              placeholder="Choose team…"
              options={filteredTeams.map((t) => ({ value: t.id, label: t.name }))}
            />
          </Field>
        </div>

        <Field label="Reports to (Manager)">
          <Select
            value={form.manager_id}
            onChange={(e) => set("manager_id")(e.target.value)}
            placeholder="Choose manager…"
            options={users.filter((u) => u.id !== user?.id).map((u) => ({ value: u.id, label: u.full_name }))}
          />
        </Field>

        <Field label="Bio / About">
          <TextInput
            placeholder="Short bio or notes…"
            value={form.bio}
            onChange={(e) => set("bio")(e.target.value)}
          />
        </Field>

        {error && <div style={{ fontSize: 12.5, color: "var(--status-delayed)" }}>{error}</div>}
      </div>
    </Modal>
  );
}

function permissionLabel(code: string) {
  return code
    .split(".")
    .map((part) => part.replaceAll("_", " "))
    .join(" · ");
}

function RoleCard({
  role,
  permissions,
  onEdit,
}: {
  role: RoleRead;
  permissions: PermissionRead[];
  onEdit?: () => void;
}) {
  const permissionByCode = new Map(permissions.map((permission) => [permission.code, permission]));
  return (
    <article
      style={{
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-lg)",
        background: "var(--surface-2)",
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontWeight: 750, color: "var(--text-primary)" }}>{role.name}</div>
          <div style={{ marginTop: 3, fontSize: 12, color: "var(--text-tertiary)" }}>
            {role.description || "No role description."}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
          <span
            style={{
              whiteSpace: "nowrap",
              borderRadius: "var(--radius-full)",
              padding: "3px 8px",
              fontSize: 11,
              fontWeight: 700,
              color: "var(--primary)",
              background: "color-mix(in srgb, var(--primary) 12%, var(--surface-3))",
            }}
          >
            {role.permission_codes.length} permissions
          </span>
          {onEdit ? (
            <button
              type="button"
              onClick={onEdit}
              aria-label={`Edit permissions for ${role.name}`}
              title={`Edit permissions for ${role.name}`}
              style={smallAction}
            >
              <Edit3 size={12} /> Edit
            </button>
          ) : (
            <span
              title="SuperAdmin always has every workspace permission"
              style={{ padding: "3px 4px", fontSize: 11, color: "var(--text-tertiary)" }}
            >
              Fixed
            </span>
          )}
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
        {role.permission_codes.length === 0 ? (
          <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>No capabilities assigned.</span>
        ) : (
          role.permission_codes.slice(0, 8).map((code) => (
            <span
              key={code}
              title={permissionByCode.get(code)?.description ?? code}
              style={{
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-full)",
                padding: "2px 7px",
                fontSize: 10.5,
                color: "var(--text-secondary)",
                background: "var(--surface-3)",
              }}
            >
              {permissionLabel(code)}
            </span>
          ))
        )}
        {role.permission_codes.length > 8 && (
          <span style={{ padding: "3px 4px", fontSize: 11, color: "var(--text-tertiary)" }}>
            +{role.permission_codes.length - 8} more
          </span>
        )}
      </div>
    </article>
  );
}

function EditRolePermissionsModal({
  role,
  permissions,
  onClose,
  onDone,
}: {
  role: RoleRead | null;
  permissions: PermissionRead[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    setSearch("");
    setSelected(role?.permission_codes ?? []);
  }, [role]);

  const mutation = useMutation({
    mutationFn: () => updateRolePermissions(role!.id, selected),
    onSuccess: onDone,
  });

  const filtered = permissions.filter((permission) => {
    const haystack = `${permission.code} ${permissionLabel(permission.code)} ${permission.description ?? ""}`.toLowerCase();
    return haystack.includes(search.trim().toLowerCase());
  });

  function close() {
    if (mutation.isPending) return;
    onClose();
  }

  return (
    <Modal
      open={!!role}
      onClose={close}
      title={`Edit ${role?.name ?? "role"} permissions`}
      footer={
        <>
          <Button variant="secondary" onClick={close}>Cancel</Button>
          <Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Saving…" : "Save permissions"}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
          Changes apply to every teammate assigned the <strong>{role?.name}</strong> role after their session refreshes.
        </div>
        <Field label={`Permissions (${selected.length} selected)`}>
          <TextInput
            autoFocus
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search capabilities…"
          />
        </Field>
        <div style={{ display: "flex", gap: 8 }}>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setSelected(permissions.map((permission) => permission.code))}
          >
            Select all
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setSelected([])}>
            Clear all
          </Button>
        </div>
        <div
          style={{
            maxHeight: 360,
            overflowY: "auto",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-md)",
          }}
        >
          {filtered.map((permission) => {
            const checked = selected.includes(permission.code);
            return (
              <label
                key={permission.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "20px 1fr",
                  gap: 9,
                  padding: "9px 11px",
                  borderBottom: "1px solid var(--border-subtle)",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => setSelected((current) =>
                    checked
                      ? current.filter((code) => code !== permission.code)
                      : [...current, permission.code]
                  )}
                />
                <span>
                  <span style={{ display: "block", fontSize: 12.5, fontWeight: 650 }}>
                    {permissionLabel(permission.code)}
                  </span>
                  <span style={{ display: "block", marginTop: 2, fontSize: 11, color: "var(--text-tertiary)" }}>
                    {permission.description || permission.code}
                  </span>
                </span>
              </label>
            );
          })}
          {filtered.length === 0 && (
            <div style={{ padding: 18, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>
              No permissions match your search.
            </div>
          )}
        </div>
        {mutation.error && (
          <div style={{ fontSize: 12.5, color: "var(--status-delayed)" }}>
            {mutation.error instanceof AppError ? mutation.error.message : "Could not update role permissions."}
          </div>
        )}
      </div>
    </Modal>
  );
}

function CreateRoleModal({
  open,
  permissions,
  onClose,
  onDone,
}: {
  open: boolean;
  permissions: PermissionRead[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const mutation = useMutation({
    mutationFn: () => createRole({ name, description: description || undefined, permission_codes: selected }),
    onSuccess: () => {
      setName("");
      setDescription("");
      setSearch("");
      setSelected([]);
      onDone();
    },
  });

  const filtered = permissions.filter((permission) => {
    const haystack = `${permission.code} ${permissionLabel(permission.code)} ${permission.description ?? ""}`.toLowerCase();
    return haystack.includes(search.trim().toLowerCase());
  });

  function close() {
    if (mutation.isPending) return;
    setName("");
    setDescription("");
    setSearch("");
    setSelected([]);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Create workspace role"
      footer={
        <>
          <Button variant="secondary" onClick={close}>Cancel</Button>
          <Button
            disabled={mutation.isPending || name.trim().length < 2}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Creating…" : "Create role"}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Role name">
          <TextInput
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Support Lead"
            maxLength={100}
          />
        </Field>
        <Field label="Description">
          <TextArea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Explain who should receive this role."
            maxLength={500}
            style={{ minHeight: 72 }}
          />
        </Field>
        <Field label={`Permissions (${selected.length} selected)`}>
          <TextInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search capabilities…"
          />
        </Field>
        <div
          style={{
            maxHeight: 320,
            overflowY: "auto",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-md)",
          }}
        >
          {filtered.map((permission) => {
            const checked = selected.includes(permission.code);
            return (
              <label
                key={permission.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "20px 1fr",
                  gap: 9,
                  padding: "9px 11px",
                  borderBottom: "1px solid var(--border-subtle)",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => setSelected((current) =>
                    checked
                      ? current.filter((code) => code !== permission.code)
                      : [...current, permission.code]
                  )}
                />
                <span>
                  <span style={{ display: "block", fontSize: 12.5, fontWeight: 650 }}>
                    {permissionLabel(permission.code)}
                  </span>
                  <span style={{ display: "block", marginTop: 2, fontSize: 11, color: "var(--text-tertiary)" }}>
                    {permission.description || permission.code}
                  </span>
                </span>
              </label>
            );
          })}
          {filtered.length === 0 && (
            <div style={{ padding: 18, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>
              No permissions match your search.
            </div>
          )}
        </div>
        {mutation.error && (
          <div style={{ fontSize: 12.5, color: "var(--status-delayed)" }}>
            {mutation.error instanceof AppError ? mutation.error.message : "Could not create the role."}
          </div>
        )}
      </div>
    </Modal>
  );
}

function EditRolesModal({
  user,
  onClose,
  roleNames,
  onDone,
}: {
  user: UserRead | null;
  onClose: () => void;
  roleNames: string[];
  onDone: () => void;
}) {
  const [selected, setSelected] = useState<string[] | null>(null);
  const current = selected ?? user?.roles ?? [];
  const mutation = useMutation({
    mutationFn: () => assignRoles(user!.id, current),
    onSuccess: () => {
      setSelected(null);
      onDone();
    },
  });

  function toggle(role: string) {
    setSelected(current.includes(role) ? current.filter((r) => r !== role) : [...current, role]);
  }

  return (
    <Modal
      open={!!user}
      onClose={() => {
        setSelected(null);
        onClose();
      }}
      title={`Roles — ${user?.full_name ?? ""}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={mutation.isPending || current.length === 0}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Saving…" : "Save roles"}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {roleNames.map((role) => {
          const on = current.includes(role);
          return (
            <button
              key={role}
              onClick={() => toggle(role)}
              style={{
                padding: "6px 12px",
                borderRadius: "var(--radius-full)",
                border: `1px solid ${on ? "var(--primary)" : "var(--border-default)"}`,
                background: on ? "color-mix(in srgb, var(--primary) 15%, var(--surface-3))" : "transparent",
                color: on ? "var(--primary)" : "var(--text-secondary)",
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {role}
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

function AdminResetPasswordModal({
  user,
  onClose,
  onDone,
}: {
  user: UserRead | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    setPassword("");
    setError(null);
  }, [user]);

  const mutation = useMutation({
    mutationFn: () => adminResetPassword(user!.id, password),
    onSuccess: onDone,
    onError: (e) =>
      setError(
        e instanceof AppError ? e.fieldErrors().join(" ") || e.message : "Failed to reset password.",
      ),
  });

  return (
    <Modal
      open={!!user}
      onClose={onClose}
      title={`Reset Password — ${user?.full_name ?? ""}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={password.length < 8 || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Updating…" : "Set New Password"}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Field label="New Password (min 8 characters)">
          <TextInput
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter new password…"
            autoFocus
          />
        </Field>
        {error && <div style={{ fontSize: 12.5, color: "var(--status-delayed)" }}>{error}</div>}
      </div>
    </Modal>
  );
}

function DeleteUserModal({
  user,
  onClose,
  onDone,
}: {
  user: UserRead | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const mutation = useMutation({
    mutationFn: () => deleteUser(user!.id),
    onSuccess: () => {
      toast.success("User deleted");
      onDone();
    },
  });

  return (
    <Modal
      open={!!user}
      onClose={onClose}
      title="Delete User"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Deleting…" : "Delete User"}
          </Button>
        </>
      }
    >
      <p style={{ fontSize: 13.5, lineHeight: 1.5, color: "var(--text-secondary)" }}>
        Are you sure you want to delete <strong>{user?.full_name}</strong>? This action cannot be undone.
      </p>
    </Modal>
  );
}

/* Department Create / Edit / Delete */

function DepartmentModal({
  open,
  department,
  users,
  onClose,
  onDone,
}: {
  open: boolean;
  department: DepartmentRead | null;
  users: UserRead[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [headId, setHeadId] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (department) {
      setName(department.name);
      setDescription(department.description || "");
      setHeadId(department.head_of_department_user_id || "");
    } else {
      setName("");
      setDescription("");
      setHeadId("");
    }
    setError(null);
  }, [department, open]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (department) {
        return updateDepartment(department.id, {
          name: name.trim(),
          description: description.trim() || null,
          head_of_department_user_id: headId || null,
        });
      } else {
        return createDepartment({
          name: name.trim(),
          description: description.trim() || null,
          head_of_department_user_id: headId || null,
        });
      }
    },
    onSuccess: onDone,
    onError: (e) =>
      setError(e instanceof AppError ? e.message : "Failed to save department."),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={department ? `Edit Department — ${department.name}` : "New Department"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!name.trim() || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Saving…" : department ? "Save Changes" : "Create Department"}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Field label="Department Name">
          <TextInput
            placeholder="e.g. Technical, Marketing, Operations…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </Field>

        <Field label="Description (optional)">
          <TextInput
            placeholder="What does this department do?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>

        <Field label="Head of Department">
          <Select
            value={headId}
            onChange={(e) => setHeadId(e.target.value)}
            placeholder="Choose leader…"
            options={users.map((u) => ({ value: u.id, label: u.full_name }))}
          />
        </Field>

        {error && <div style={{ fontSize: 12.5, color: "var(--status-delayed)" }}>{error}</div>}
      </div>
    </Modal>
  );
}

function DeleteDepartmentModal({
  department,
  onClose,
  onDone,
}: {
  department: DepartmentRead | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const mutation = useMutation({
    mutationFn: () => deleteDepartment(department!.id),
    onSuccess: () => {
      toast.success("Department deleted");
      onDone();
    },
  });

  return (
    <Modal
      open={!!department}
      onClose={onClose}
      title="Delete Department"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Deleting…" : "Delete Department"}
          </Button>
        </>
      }
    >
      <p style={{ fontSize: 13.5, lineHeight: 1.5, color: "var(--text-secondary)" }}>
        Are you sure you want to delete department <strong>{department?.name}</strong>?
      </p>
    </Modal>
  );
}

/* Team Create / Edit / Delete */

function TeamModal({
  open,
  team,
  departments,
  users,
  onClose,
  onDone,
}: {
  open: boolean;
  team: TeamRead | null;
  departments: DepartmentRead[];
  users: UserRead[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [leadId, setLeadId] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (team) {
      setName(team.name);
      setDescription(team.description || "");
      setDepartmentId(team.department_id);
      setLeadId(team.lead_user_id || "");
    } else {
      setName("");
      setDescription("");
      setDepartmentId(departments[0]?.id || "");
      setLeadId("");
    }
    setError(null);
  }, [team, open, departments]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (team) {
        return updateTeam(team.id, {
          name: name.trim(),
          description: description.trim() || null,
          department_id: departmentId || undefined,
          lead_user_id: leadId || null,
        });
      } else {
        return createTeam({
          name: name.trim(),
          department_id: departmentId,
          description: description.trim() || null,
          lead_user_id: leadId || null,
        });
      }
    },
    onSuccess: onDone,
    onError: (e) =>
      setError(e instanceof AppError ? e.message : "Failed to save team."),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={team ? `Edit Team — ${team.name}` : "New Team"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!name.trim() || !departmentId || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Saving…" : team ? "Save Changes" : "Create Team"}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Field label="Team Name">
          <TextInput
            placeholder="e.g. Core Engine, Growth Squad, DevOps…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </Field>

        <Field label="Department">
          <Select
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            placeholder="Choose department…"
            options={departments.map((d) => ({ value: d.id, label: d.name }))}
          />
        </Field>

        <Field label="Team Lead / Manager">
          <Select
            value={leadId}
            onChange={(e) => setLeadId(e.target.value)}
            placeholder="Choose team lead…"
            options={users.map((u) => ({ value: u.id, label: u.full_name }))}
          />
        </Field>

        <Field label="Description (optional)">
          <TextInput
            placeholder="Team purpose and focus…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>

        {error && <div style={{ fontSize: 12.5, color: "var(--status-delayed)" }}>{error}</div>}
      </div>
    </Modal>
  );
}

function DeleteTeamModal({
  team,
  onClose,
  onDone,
}: {
  team: TeamRead | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const mutation = useMutation({
    mutationFn: () => deleteTeam(team!.id),
    onSuccess: () => {
      toast.success("Team deleted");
      onDone();
    },
  });

  return (
    <Modal
      open={!!team}
      onClose={onClose}
      title="Delete Team"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Deleting…" : "Delete Team"}
          </Button>
        </>
      }
    >
      <p style={{ fontSize: 13.5, lineHeight: 1.5, color: "var(--text-secondary)" }}>
        Are you sure you want to delete team <strong>{team?.name}</strong>?
      </p>
    </Modal>
  );
}
