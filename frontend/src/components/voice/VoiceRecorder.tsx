"use client";

/* MediaRecorder-based voice message recorder. Produces a webm/opus Blob. */

import { useEffect, useRef, useState } from "react";
import { Mic, Square, Trash2 } from "lucide-react";

interface Props {
  onRecorded: (blob: Blob) => void;
  onClear?: () => void;
  disabled?: boolean;
}

export function VoiceRecorder({ onRecorded, onClear, disabled }: Props) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mime });
        stream.getTracks().forEach((t) => t.stop());
        setBlobUrl(URL.createObjectURL(blob));
        onRecorded(blob);
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      setError("Microphone access denied.");
    }
  }

  function stop() {
    recorderRef.current?.stop();
    setRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  }

  function clear() {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    setBlobUrl(null);
    setSeconds(0);
    onClear?.();
  }

  const mm = String(Math.floor(seconds / 60)).padStart(1, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {!recording && !blobUrl && (
        <button
          type="button"
          onClick={start}
          disabled={disabled}
          title="Record a voice message"
          aria-label="Record a voice message"
          className="pmp-icon-btn"
          style={iconBtn}
        >
          <Mic size={15} />
        </button>
      )}
      {recording && (
        <>
          <button type="button" onClick={stop} title="Stop recording" aria-label="Stop recording" style={{ ...iconBtn, color: "var(--status-delayed)", borderColor: "var(--status-delayed)" }}>
            <Square size={13} />
          </button>
          <span className="pmp-pulse" style={{ fontSize: 12, color: "var(--status-delayed)", fontFamily: "var(--font-mono)" }}>
            ● {mm}:{ss}
          </span>
        </>
      )}
      {blobUrl && !recording && (
        <>
          <audio controls src={blobUrl} style={{ height: 32, maxWidth: 220 }} />
          <button type="button" onClick={clear} title="Discard recording" aria-label="Discard recording" style={iconBtn}>
            <Trash2 size={14} />
          </button>
        </>
      )}
      {error && <span style={{ fontSize: 11.5, color: "var(--status-delayed)" }}>{error}</span>}
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: "var(--radius-2)",
  border: "1px solid var(--border-default)",
  background: "transparent",
  color: "var(--text-secondary)",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};
