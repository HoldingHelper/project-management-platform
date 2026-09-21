"use client";

/* Minimal toast system: `useToast().push("message", "error")`. */

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";

type Kind = "info" | "success" | "error";
interface Toast {
  id: number;
  kind: Kind;
  message: string;
}

interface ToastContextValue {
  push: (message: string, kind?: Kind) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue>({
  push: () => {},
  success: () => {},
  error: () => {},
  info: () => {},
});

const ICONS = { info: Info, success: CheckCircle2, error: AlertTriangle };
const COLORS: Record<Kind, string> = {
  info: "var(--accent-primary)",
  success: "var(--status-completed)",
  error: "var(--status-delayed)",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const push = useCallback((message: string, kind: Kind = "info") => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, kind, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const success = useCallback((message: string) => push(message, "success"), [push]);
  const error = useCallback((message: string) => push(message, "error"), [push]);
  const info = useCallback((message: string) => push(message, "info"), [push]);

  return (
    <ToastContext.Provider value={{ push, success, error, info }}>
      {children}
      <div
        className="hig-toast-viewport"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: "fixed",
          bottom: 20,
          right: 20,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          zIndex: 100,
        }}
      >
        {toasts.map((t) => {
          const Icon = ICONS[t.kind];
          return (
            <div
              key={t.id}
              className="hig-toast"
              data-kind={t.kind}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                background: "var(--surface-2)",
                border: `1px solid color-mix(in srgb, ${COLORS[t.kind]} 45%, var(--border-default))`,
                borderRadius: "var(--radius-3)",
                boxShadow: "0 16px 36px -4px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.08)",
                padding: "12px 16px",
                maxWidth: 380,
                fontSize: 13,
                animation: "smoothSlideInBottom var(--duration-base) var(--ease-spring)",
                backdropFilter: "blur(12px)",
              }}
            >
              <Icon size={16} style={{ color: COLORS[t.kind], flexShrink: 0 }} />
              <span style={{ fontWeight: 500 }}>{t.message}</span>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
