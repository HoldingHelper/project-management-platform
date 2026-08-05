"use client";

/* Google OAuth redirect target for the music module's Drive connection.
   Opened as a popup from MusicChannelView; exchanges ?code&state for a stored
   (encrypted) refresh token, then tells the user to close the window. */

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { connectDrive } from "@/lib/api/music";
import { Spinner } from "@/components/ui/States";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

function DriveCallbackInner() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"working" | "done" | "error">("working");
  const [message, setMessage] = useState("Connecting your Google Drive…");
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return; // React strict-mode double-invoke guard
    ranRef.current = true;
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    if (!code || !state) {
      setStatus("error");
      setMessage("Missing authorization code. Close this window and retry.");
      return;
    }
    connectDrive(code, state)
      .then((drive) => {
        setStatus("done");
        setMessage(
          `Google Drive connected${drive.email ? ` as ${drive.email}` : ""}. You can close this window.`,
        );
      })
      .catch((e) => {
        setStatus("error");
        setMessage(e instanceof Error ? e.message : "Connection failed. Close this window and retry.");
      });
  }, [searchParams]);

  return (
    <div style={{ height: "60vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, textAlign: "center", padding: 24 }}>
      {status === "working" ? (
        <Spinner label={message} />
      ) : (
        <>
          <div className={`pmp-callback-icon ${status === "done" ? "is-success" : "is-error"}`}>
            {status === "done" ? <CheckCircle2 size={30} /> : <AlertTriangle size={30} />}
          </div>
          <div style={{ fontWeight: 700, maxWidth: 420 }}>{message}</div>
        </>
      )}
    </div>
  );
}

export default function DriveCallbackPage() {
  return (
    <Suspense fallback={<Spinner label="Loading…" />}>
      <DriveCallbackInner />
    </Suspense>
  );
}
