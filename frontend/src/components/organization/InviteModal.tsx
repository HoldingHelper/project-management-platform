"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Copy, Mail } from "lucide-react";
import { createInvitation } from "@/lib/api/users";
import { AppError } from "@/lib/api/client";
import { Button, Field, Modal, Select, TextInput } from "@/components/ds";
import type { DepartmentRead, TeamRead, UserRead } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  roleNames: string[];
  departments: DepartmentRead[];
  teams?: TeamRead[];
  users?: UserRead[];
  onInvited?: () => void;
}

export function InviteModal({
  open,
  onClose,
  roleNames,
  departments,
  teams = [],
  users = [],
  onInvited,
}: Props) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("Developer");
  const [departmentId, setDepartmentId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [managerId, setManagerId] = useState("");
  const [createdInvite, setCreatedInvite] = useState<{ email: string; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setEmail("");
      setRole("Developer");
      setDepartmentId("");
      setTeamId("");
      setManagerId("");
      setCreatedInvite(null);
      setError(null);
    }
  }, [open]);

  // Filter teams by chosen department
  const filteredTeams = useMemo(() => {
    if (!departmentId) return teams;
    return teams.filter((t) => t.department_id === departmentId);
  }, [teams, departmentId]);

  const mutation = useMutation({
    mutationFn: () =>
      createInvitation(
        email.trim(),
        role,
        departmentId || undefined,
        teamId || undefined,
        managerId || undefined,
      ),
    onSuccess: (inv) => {
      setCreatedInvite({
        email: inv.email,
        url: inv.invite_url || `${window.location.origin}/accept-invitation/${inv.invite_token || ""}`,
      });
      onInvited?.();
    },
    onError: (e) =>
      setError(
        e instanceof AppError ? e.fieldErrors().join(" ") || e.message : "Failed to create invitation.",
      ),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={createdInvite ? "Invitation Link Ready" : "Generate Teammate Invite Link"}
      footer={
        createdInvite ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={!email.trim() || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? "Generating…" : "Generate Invite Link"}
            </Button>
          </>
        )
      }
    >
      {createdInvite ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ padding: 14, borderRadius: "var(--radius-md)", background: "var(--surface-3)", border: "1px solid var(--border-default)" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>
              Invite Link Generated for {createdInvite.email}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 12 }}>
              Share this link directly with the coworker. When they open it, they will join the designated department & team and choose their own password.
            </div>
            <TextInput
              readOnly
              value={createdInvite.url}
              onClick={(e) => (e.target as HTMLInputElement).select()}
              style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}
            />
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label="Email address">
            <TextInput
              placeholder="person@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoFocus
            />
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Role">
              <Select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                options={roleNames.map((r) => ({ value: r, label: r }))}
              />
            </Field>
            <Field label="Department">
              <Select
                value={departmentId}
                onChange={(e) => {
                  setDepartmentId(e.target.value);
                  setTeamId("");
                }}
                placeholder="Choose department…"
                options={departments.map((d) => ({ value: d.id, label: d.name }))}
              />
            </Field>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Team (optional)">
              <Select
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                placeholder="Choose team…"
                options={filteredTeams.map((t) => ({ value: t.id, label: t.name }))}
              />
            </Field>
            <Field label="Manager (optional)">
              <Select
                value={managerId}
                onChange={(e) => setManagerId(e.target.value)}
                placeholder="Choose manager…"
                options={users.map((u) => ({ value: u.id, label: u.full_name }))}
              />
            </Field>
          </div>

          {error && <div style={{ fontSize: 12.5, color: "var(--status-delayed)" }}>{error}</div>}
        </div>
      )}
    </Modal>
  );
}
