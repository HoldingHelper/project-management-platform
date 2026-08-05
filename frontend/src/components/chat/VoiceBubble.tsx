"use client";

/* Voice-message playback bubble: fetches a presigned URL for the attachment
   on first play. */

import { useState } from "react";
import { Mic } from "lucide-react";
import { getFileDownloadUrl } from "@/lib/api/collaboration";
import type { UUID } from "@/lib/types";

export function VoiceBubble({ attachmentId }: { attachmentId: UUID }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  async function load() {
    if (url || loading) return;
    setLoading(true);
    try {
      const res = await getFileDownloadUrl(attachmentId);
      setUrl(res.url);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  if (error) {
    return <span style={{ fontSize: 12, color: "var(--status-delayed)" }}>Voice message unavailable.</span>;
  }

  if (!url) {
    return (
      <button
        className="pmp-voice-bubble"
        onClick={load}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          border: "1px solid var(--border-default)",
          background: "var(--surface-2)",
          color: "var(--text-secondary)",
          borderRadius: "var(--radius-full)",
          padding: "6px 14px",
          fontSize: 12.5,
          cursor: "pointer",
          marginTop: 4,
        }}
      >
        <Mic size={13} style={{ color: "var(--accent-secondary)" }} />
        {loading ? "Loading…" : "Play voice message"}
      </button>
    );
  }

  return <audio className="pmp-voice-player" controls autoPlay src={url} style={{ height: 34, marginTop: 4, maxWidth: 260 }} />;
}
