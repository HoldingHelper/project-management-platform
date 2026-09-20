"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { integrationsApi } from "@/lib/api/integrations";
import { Spinner } from "@/components/ui/States";
import { AlertTriangle, CheckCircle2, Github } from "lucide-react";

function GitHubCallbackInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<"working" | "done" | "error">("working");
  const [message, setMessage] = useState("Connecting your GitHub account…");
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    const code = searchParams.get("code");
    const state = searchParams.get("state") || undefined;
    if (!code) {
      setStatus("error");
      setMessage("Missing authorization code from GitHub. Please return to Settings and retry.");
      return;
    }
    integrationsApi.connectGitHub(code, state)
      .then((res) => {
        setStatus("done");
        setMessage(`GitHub connected as @${res.github_username}! Redirecting to Settings…`);
        setTimeout(() => {
          router.replace("/settings");
        }, 1200);
      })
      .catch((e) => {
        setStatus("error");
        setMessage(e instanceof Error ? e.message : "GitHub connection failed. Please retry.");
      });
  }, [searchParams, router]);

  return (
    <div
      style={{
        height: "60vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        textAlign: "center",
        padding: 24,
      }}
    >
      {status === "working" ? (
        <Spinner label={message} />
      ) : (
        <>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: status === "done" ? "rgba(0, 226, 97, 0.15)" : "rgba(239, 68, 68, 0.15)",
              color: status === "done" ? "var(--status-completed)" : "var(--status-blocked)",
            }}
          >
            {status === "done" ? <CheckCircle2 size={32} /> : <AlertTriangle size={32} />}
          </div>
          <div style={{ fontWeight: 700, fontSize: 16, maxWidth: 460 }}>{message}</div>
        </>
      )}
    </div>
  );
}

export default function GitHubCallbackPage() {
  return (
    <Suspense fallback={<Spinner label="Loading GitHub authorization…" />}>
      <GitHubCallbackInner />
    </Suspense>
  );
}
