"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { acceptInvitation, verifyInvitation } from "@/lib/api/users";
import { AppError } from "@/lib/api/client";
import { Button, Field, TextInput } from "@/components/ds";
import { Spinner } from "@/components/ui/States";
import { useAuth } from "@/lib/auth/AuthProvider";
import { Eye, EyeOff, UserPlus } from "lucide-react";
import { AccessShell } from "@/components/ui/AccessShell";

export default function AcceptInvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
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
  });

  useEffect(() => {
    if (verifyError) {
      setError("This invitation link is invalid or has expired.");
    }
  }, [verifyError]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const session = await acceptInvitation(token, {
        first_name: form.first_name,
        last_name: form.last_name,
        password: form.password,
        username: form.username || undefined,
      });
      adoptSession(session);
      router.replace("/");
    } catch (err) {
      setError(err instanceof AppError ? err.message : "Could not accept the invitation.");
    } finally {
      setSubmitting(false);
    }
  }

  const valid = form.first_name && form.last_name && form.password.length >= 8;

  return (
    <AccessShell
      eyebrow="Invitation"
      title="Create your account"
      description={invite ? <>You were invited as <strong>{invite.role_name}</strong> using <strong>{invite.email}</strong>.</> : "Verify your invitation and complete your profile."}
      footer="Your invitation and account information are transmitted securely."
    >
        {isLoading && <Spinner label="Checking invitation…" />}

        {invite && (
          <>
            <form onSubmit={onSubmit} className="pmp-access-form">
              <div className="pmp-access-name-grid">
                <Field label="First name">
                  <TextInput
                    value={form.first_name}
                    onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
                  />
                </Field>
                <Field label="Last name">
                  <TextInput
                    value={form.last_name}
                    onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
                  />
                </Field>
              </div>
              <Field label="Username (optional)" hint="Lets you sign in without typing your email.">
                <TextInput
                  value={form.username}
                  onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                />
              </Field>
              <Field label="Password (min 8 characters)">
                <TextInput
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  autoComplete="new-password"
                  trailing={
                    <button type="button" className="pmp-password-toggle" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>
                      {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  }
                />
              </Field>
              {error && (
                <div
                  style={{
                    fontSize: 12.5,
                    color: "var(--status-delayed)",
                    background: "var(--status-delayed-bg)",
                    borderRadius: "var(--radius-2)",
                    padding: "8px 10px",
                  }}
                >
                  {error}
                </div>
              )}
              <Button type="submit" disabled={!valid || submitting} className="pmp-access-submit">
                <UserPlus size={17} /> {submitting ? "Creating account…" : "Create account & sign in"}
              </Button>
            </form>
          </>
        )}

        {!isLoading && !invite && error && (
          <div style={{ fontSize: 13.5, color: "var(--status-delayed)" }}>{error}</div>
        )}
    </AccessShell>
  );
}
