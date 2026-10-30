"use client";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { LocalizedText } from "@/lib/i18n/I18nProvider";



import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import { getWorkspaceDestination } from "@/lib/auth/workspace-navigation";
import { AppError } from "@/lib/api/client";
import { Button, Field, TextInput } from "@/components/ds";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { AccessShell } from "@/components/ui/AccessShell";
import Link from "next/link";

export default function LoginPage() {
  const { t: translateUI } = useI18n();

  const router = useRouter();
  const { user, loading, login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      const requested = new URLSearchParams(window.location.search).get("next");
      router.replace(getWorkspaceDestination(user.id, requested));
    }
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
      eyebrow={translateUI("Secure workspace")}
      title={translateUI("Welcome back")}
      description={translateUI("Sign in to continue to your projects, team and operational dashboards.")}
      footer={translateUI("Use your Project Management Platform account credentials.")}
    >

      <form onSubmit={onSubmit} className="pmp-access-form">
        <Field label={translateUI("Email or username")}>
          <TextInput
            type="text"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            placeholder={translateUI("you@example.com or username")}
          />
        </Field>
        <Field label={translateUI("Password")}>
          <TextInput
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            trailing={
              <button type="button" className="pmp-password-toggle" onClick={() => setShowPassword((value) => !value)} aria-label={translateUI(showPassword ? "Hide password" : "Show password")}>
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            }
          />
        </Field>
        <div className="pmp-access-helper"><Link href="/forgot-password"><LocalizedText message={"Forgot password?"} /></Link></div>

        {error && <div className="pmp-access-error" role="alert">{translateUI(error)}</div>}

        <Button type="submit" disabled={submitting} className="pmp-access-submit">
          <LogIn size={17} /> {submitting ? <LocalizedText message={"Signing in…"} /> : <LocalizedText message={"Sign in"} />}
        </Button>
      </form>
    </AccessShell>
  );
}
