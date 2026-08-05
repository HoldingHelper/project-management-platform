"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MailPlus, UserPlus } from "lucide-react";
import {
  assignRoles,
  createInvitation,
  createUser,
  listRoles,
  listUsers,
} from "@/lib/api/users";
import { createEmployee, listEmployees, listTeams } from "@/lib/api/organization";
import { AppError } from "@/lib/api/client";
import {
  Avatar,
  Button,
  DataTable,
  Field,
  Modal,
  PresenceDot,
  Select,
  TextInput,
  useToast,
  type Column,
} from "@/components/ds";
import { PageHeader, PAGE_STYLE, Spinner } from "@/components/ui/States";
import { useAuth } from "@/lib/auth/AuthProvider";
import { usePresenceMap } from "@/lib/stores/presence";
import type { UserRead } from "@/lib/types";

export default function AdminUsersPage() {
  const { hasPermission, isSuperAdmin } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const presence = usePresenceMap();
  const [search, setSearch] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [roleEditUser, setRoleEditUser] = useState<UserRead | null>(null);

  const canManage = isSuperAdmin() || hasPermission("system.manage_users");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-users", search],
    queryFn: () => listUsers({ search: search || undefined, page_size: 200 }),
  });
  const { data: roles } = useQuery({ queryKey: ["roles"], queryFn: listRoles });
  const { data: teams } = useQuery({ queryKey: ["teams"], queryFn: () => listTeams() });
  const { data: employees } = useQuery({ queryKey: ["employees"], queryFn: () => listEmployees() });
  const roleNames = (roles ?? []).map((r) => r.name);
  const teamNameByUser = new Map(
    (employees ?? []).map((employee) => [
      employee.user_id,
      teams?.find((team) => team.id === employee.team_id)?.name ?? "No team",
    ]),
  );

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    queryClient.invalidateQueries({ queryKey: ["users"] });
  };

  const columns: Column<UserRead>[] = [
    {
      key: "name",
      header: "User",
      sortValue: (u) => u.full_name.toLowerCase(),
      render: (u) => (
        <Link href={`/profile/${u.id}`} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ position: "relative", display: "inline-flex" }}>
            <Avatar name={u.full_name} size={30} />
            <PresenceDot status={presence[u.id] ?? "offline"} overlay size={8} />
          </span>
          <span>
            <span style={{ fontWeight: 600, display: "block" }}>{u.full_name}</span>
            <span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{u.email}</span>
          </span>
        </Link>
      ),
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
      key: "team",
      header: "Team",
      sortValue: (u) => teamNameByUser.get(u.id) ?? "",
      render: (u) => (
        <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
          {teamNameByUser.get(u.id) ?? "No team"}
        </span>
      ),
    },
    {
      key: "roles",
      header: "Roles",
      render: (u) => (
        <span style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {u.roles.map((r) => (
            <span
              key={r}
              style={{
                fontSize: 11,
                padding: "2px 8px",
                borderRadius: "var(--radius-full)",
                background:
                  r === "SuperAdmin" || r === "CLevel"
                    ? "rgba(212,169,55,0.14)"
                    : "var(--surface-2)",
                color:
                  r === "SuperAdmin" || r === "CLevel"
                    ? "var(--accent-gold-bright)"
                    : "var(--text-secondary)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              {r}
            </span>
          ))}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortValue: (u) => (u.is_active ? 0 : 1),
      render: (u) => (
        <span
          style={{
            color: u.is_active ? "var(--status-completed)" : "var(--text-tertiary)",
            fontSize: 12.5,
          }}
        >
          {u.is_active ? "Active" : "Deactivated"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (u) =>
        canManage ? (
          <Button variant="tertiary" onClick={() => setRoleEditUser(u)}>
            Edit roles
          </Button>
        ) : null,
    },
  ];

  return (
    <div style={PAGE_STYLE}>
      <PageHeader
        title="User Management"
        subtitle={`${data?.total_count ?? 0} registered users.`}
        actions={
          canManage || hasPermission("users.invite") ? (
            <span style={{ display: "flex", gap: 8 }}>
              <Link href="/admin/invitations">
                <Button variant="secondary">Invitations</Button>
              </Link>
              <Button variant="secondary" onClick={() => setInviteOpen(true)}>
                <MailPlus size={14} /> Invite
              </Button>
              {canManage && (
                <Button onClick={() => setAddOpen(true)}>
                  <UserPlus size={14} /> Add user
                </Button>
              )}
            </span>
          ) : undefined
        }
      />

      <div style={{ maxWidth: 360, marginBottom: 16 }}>
        <TextInput
          placeholder="Filter by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <Spinner label="Loading users…" />
      ) : (
        <div
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-3)",
            overflow: "hidden",
          }}
        >
          <DataTable columns={columns} rows={data?.items ?? []} rowKey={(u) => u.id} />
        </div>
      )}

      <InviteModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        roleNames={roleNames}
        onDone={() => {
          toast.push("Invitation sent.", "success");
          setInviteOpen(false);
        }}
      />
      <AddUserModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        roleNames={roleNames}
        teams={teams ?? []}
        onDone={() => {
          toast.push("User created.", "success");
          setAddOpen(false);
          invalidate();
          queryClient.invalidateQueries({ queryKey: ["employees"] });
        }}
      />
      <EditRolesModal
        user={roleEditUser}
        onClose={() => setRoleEditUser(null)}
        roleNames={roleNames}
        onDone={() => {
          toast.push("Roles updated. The user must sign in again for changes to apply.", "success");
          setRoleEditUser(null);
          invalidate();
        }}
      />
    </div>
  );
}

function InviteModal({
  open,
  onClose,
  roleNames,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  roleNames: string[];
  onDone: () => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("Developer");
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () => createInvitation(email, role),
    onSuccess: onDone,
    onError: (e) =>
      setError(e instanceof AppError ? e.message : "Failed to send invitation."),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Invite a new user"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!email || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Sending…" : "Send invitation"}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Field label="Email">
          <TextInput
            placeholder="person@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Role">
          <Select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            options={roleNames.map((r) => ({ value: r, label: r }))}
          />
        </Field>
        {error && <div style={{ fontSize: 12.5, color: "var(--status-delayed)" }}>{error}</div>}
        <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
          The invite link is valid for 7 days. In development the email is logged to the API
          console.
        </div>
      </div>
    </Modal>
  );
}

function AddUserModal({
  open,
  onClose,
  roleNames,
  teams,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  roleNames: string[];
  teams: { id: string; name: string }[];
  onDone: () => void;
}) {
  const [form, setForm] = useState({
    email: "",
    username: "",
    first_name: "",
    last_name: "",
    password: "",
    role: "Developer",
    team_id: "",
  });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const mutation = useMutation({
    mutationFn: async () => {
      const user = await createUser({
        email: form.email,
        username: form.username || undefined,
        password: form.password,
        first_name: form.first_name,
        last_name: form.last_name,
        job_title: undefined,
        role_names: [form.role],
      });
      await createEmployee({
        user_id: user.id,
        team_id: form.team_id || null,
      }).catch(() => undefined);
      return user;
    },
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
      title="Add user manually"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!valid || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Creating…" : "Create user"}
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
        <Field label="Email">
          <TextInput value={form.email} onChange={(e) => set("email")(e.target.value)} />
        </Field>
        <Field label="Username (optional)">
          <TextInput value={form.username} onChange={(e) => set("username")(e.target.value)} />
        </Field>
        <Field label="Password (min 8 chars)">
          <TextInput
            type="password"
            value={form.password}
            onChange={(e) => set("password")(e.target.value)}
          />
        </Field>
        <Field label="Role">
          <Select
            value={form.role}
            onChange={(e) => set("role")(e.target.value)}
            options={roleNames.map((r) => ({ value: r, label: r }))}
          />
        </Field>
        <Field label="Team">
          <Select
            value={form.team_id}
            onChange={(e) => set("team_id")(e.target.value)}
            placeholder="No team"
            options={teams.map((team) => ({ value: team.id, label: team.name }))}
          />
        </Field>
        {error && <div style={{ fontSize: 12.5, color: "var(--status-delayed)" }}>{error}</div>}
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
                border: `1px solid ${on ? "var(--accent-primary)" : "var(--border-default)"}`,
                background: on ? "var(--status-in-progress-bg)" : "transparent",
                color: on ? "var(--text-primary)" : "var(--text-secondary)",
                fontSize: 12.5,
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
