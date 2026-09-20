"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { acceptInvitation, verifyInvitation } from "@/lib/api/users";
import { AppError } from "@/lib/api/client";
import { Button, Field, TextInput } from "@/components/ds";
import { Spinner } from "@/components/ui/States";
import { useAuth } from "@/lib/auth/AuthProvider";
import { Eye, EyeOff, UserPlus } from "lucide-react";
import { AccessShell } from "@/components/ui/AccessShell";
import { useStaticExportParams } from "@/lib/static-export-route";

export function AcceptInvitationClient({ token: exportedToken }: { token: string }) {
  const [token] = useStaticExportParams([exportedToken], ["accept-invitation"]);
  const router = useRouter();
  const { adoptSession } = useAuth();
  const [form, setForm] = useState({ first_name: "", last_name: "", username: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { data: invite, error: verifyError, isLoading } = useQuery({
    queryKey: ["invitation", token],
    queryFn: () => verifyInvitation(token),
    retry: false,
    enabled: Boolean(token),
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.password || form.password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await acceptInvitation(token, {
        password: form.password,
        first_name: form.first_name || "New",
        last_name: form.last_name || "User",
        username: form.username || undefined,
      });
      adoptSession(response);
      router.push("/tasks");
    } catch (err: unknown) {
      if (err instanceof AppError) {
        setError(err.message);
      } else {
        setError("Failed to accept invitation");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!token || isLoading) {
    return (
      <AccessShell title="Verifying invitation..." description="Please wait while we validate your invite token">
        <div style={{ display: "flex", justifyContent: "center", padding: "2rem" }}>
          <Spinner />
        </div>
      </AccessShell>
    );
  }

  if (verifyError || !invite) {
    return (
      <AccessShell title="Invalid or expired invite" description="This invitation link is no longer valid">
        <div style={{ textAlign: "center", padding: "1rem" }}>
          <p style={{ color: "var(--color-text-secondary)", marginBottom: "1.5rem" }}>
            The invitation link may have expired or already been used. Please contact your workspace administrator for a new invite.
          </p>
          <Button variant="secondary" onClick={() => router.push("/login")}>
            Go to Login
          </Button>
        </div>
      </AccessShell>
    );
  }

  return (
    <AccessShell
      title="Complete your account"
      description={`You've been invited as ${invite.email}${invite.role_name ? ` (${invite.role_name})` : ""}`}
    >
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {(invite.department_name || invite.team_name || invite.manager_name) && (
          <div style={{
            background: "rgba(59, 130, 246, 0.08)",
            border: "1px solid rgba(59, 130, 246, 0.2)",
            borderRadius: "8px",
            padding: "0.75rem 1rem",
            fontSize: "0.85rem",
            color: "var(--color-text-primary)",
            display: "flex",
            flexDirection: "column",
            gap: "0.25rem"
          }}>
            <div style={{ fontWeight: 600, color: "var(--color-primary, #3b82f6)", marginBottom: "0.15rem" }}>Pre-assigned Organization Details:</div>
            {invite.department_name && <div>🏢 <strong>Department:</strong> {invite.department_name}</div>}
            {invite.team_name && <div>👥 <strong>Team:</strong> {invite.team_name}</div>}
            {invite.manager_name && <div>👤 <strong>Reporting to:</strong> {invite.manager_name}</div>}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          <Field label="First Name">
            <TextInput
              value={form.first_name}
              onChange={(e) => setForm({ ...form, first_name: e.target.value })}
              placeholder="First name"
            />
          </Field>
          <Field label="Last Name">
            <TextInput
              value={form.last_name}
              onChange={(e) => setForm({ ...form, last_name: e.target.value })}
              placeholder="Last name"
            />
          </Field>
        </div>

        <Field label="Username (Optional)">
          <TextInput
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            placeholder="Choose a username"
          />
        </Field>

        <Field label="Set Password *">
          <div style={{ position: "relative" }}>
            <TextInput
              type={showPassword ? "text" : "password"}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="Min. 8 characters"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: "absolute",
                right: "0.75rem",
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--color-text-tertiary)",
              }}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {error && <div style={{ color: "var(--color-danger, #ef4444)", fontSize: "0.85rem", marginTop: "0.25rem" }}>{error}</div>}
        </Field>

        <Button type="submit" variant="primary" disabled={submitting}>
          <UserPlus size={16} /> {submitting ? "Setting up..." : "Join Workspace"}
        </Button>
      </form>
    </AccessShell>
  );
}
