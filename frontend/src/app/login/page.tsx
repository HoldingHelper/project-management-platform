"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import { AppError } from "@/lib/api/client";
import { Button, Field, TextInput } from "@/components/ds";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { AccessShell } from "@/components/ui/AccessShell";
import Link from "next/link";

function workspaceTarget() {
  return window.localStorage.getItem("workspace.last-module") === "docs" ? "/app/docs" : "/h/holding";
}

export default function LoginPage() {
  const router = useRouter();
  const { user, loading, login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace(workspaceTarget());
  }, [loading, user, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("Please enter your email or username and password.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      router.replace(workspaceTarget());
    } catch (err) {
      if (err instanceof AppError) {
        setError(err.status === 401 ? "Invalid email or password." : err.message);
      } else {
        setError("Could not reach the server. Is the API running on :8000?");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AccessShell
      eyebrow="Secure workspace"
      title="Welcome back"
      description="Sign in to continue to your projects, team and operational dashboards."
      footer="Use your Project Management Platform account credentials."
    >
      <form onSubmit={onSubmit} className="pmp-access-form">
        <Field label="Email or username">
          <TextInput
            type="text"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            placeholder="you@example.com or username"
          />
        </Field>
        <Field label="Password">
          <TextInput
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            trailing={
              <button type="button" className="pmp-password-toggle" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            }
          />
        </Field>
        <div className="pmp-access-helper"><Link href="/forgot-password">Forgot password?</Link></div>

        {error && <div className="pmp-access-error" role="alert">{error}</div>}

        <Button type="submit" disabled={submitting} className="pmp-access-submit">
          <LogIn size={17} /> {submitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </AccessShell>
  );
}
