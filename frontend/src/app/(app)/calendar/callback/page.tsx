"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, CalendarCheck2, ArrowRight } from "lucide-react";
import { connectCalendar } from "@/lib/api/calendar";
import { Button } from "@/components/ds";
import { Spinner } from "@/components/ui/States";

function CalendarCallbackInner() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"working" | "done" | "error">("working");
  const [message, setMessage] = useState("Connecting your Google Calendar…");
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    const code = searchParams.get("code");
    if (!code) {
      setStatus("error");
      setMessage("Missing authorization code from Google. Please return to Settings and retry.");
      return;
    }

    connectCalendar(code)
      .then((res) => {
        setStatus("done");
        setMessage(
          `Google Calendar linked successfully${res.google_email ? ` (${res.google_email})` : ""}. Your meetings and advance reminders are now active.`,
        );
        if (window.opener) {
          try {
            window.opener.postMessage({ type: "google_calendar_connected" }, "*");
          } catch {
            // Ignore popup message errors
          }
        }
      })
      .catch((e) => {
        setStatus("error");
        setMessage(e instanceof Error ? e.message : "Connection failed. Please retry from Settings.");
      });
  }, [searchParams]);

  return (
    <div
      style={{
        minHeight: "60vh",
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
      ) : status === "done" ? (
        <div
          style={{
            maxWidth: 460,
            padding: 32,
            borderRadius: "var(--radius-3)",
            background: "var(--surface-2)",
            border: "1px solid var(--border-default)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
          }}
        >
          <div
            style={{
              width: 54,
              height: 54,
              borderRadius: "50%",
              background: "rgba(16, 185, 129, 0.15)",
              color: "#10b981",
              display: "grid",
              placeItems: "center",
            }}
          >
            <CalendarCheck2 size={28} />
          </div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Calendar Connected</h2>
          <p style={{ margin: 0, fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.6 }}>
            {message}
          </p>
          <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
            <Link href="/settings">
              <Button variant="secondary">Go to Settings</Button>
            </Link>
            <Link href="/h/holding">
              <Button>
                Open Workspace <ArrowRight size={14} />
              </Button>
            </Link>
          </div>
        </div>
      ) : (
        <div
          style={{
            maxWidth: 460,
            padding: 32,
            borderRadius: "var(--radius-3)",
            background: "var(--surface-2)",
            border: "1px solid var(--border-danger, #ef4444)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
          }}
        >
          <div
            style={{
              width: 54,
              height: 54,
              borderRadius: "50%",
              background: "rgba(239, 68, 68, 0.15)",
              color: "#ef4444",
              display: "grid",
              placeItems: "center",
            }}
          >
            <AlertTriangle size={28} />
          </div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Connection Failed</h2>
          <p style={{ margin: 0, fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.6 }}>
            {message}
          </p>
          <Link href="/settings" style={{ marginTop: 8 }}>
            <Button variant="secondary">Back to Settings</Button>
          </Link>
        </div>
      )}
    </div>
  );
}

export default function CalendarCallbackPage() {
  return (
    <Suspense fallback={<Spinner label="Connecting…" />}>
      <CalendarCallbackInner />
    </Suspense>
  );
}
