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

const ToastContext = createContext<{ push: (message: string, kind?: Kind) => void }>({
  push: () => {},
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
    }, 4500);
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div
        className="pmp-toast-viewport"
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
              className="pmp-toast"
              data-kind={t.kind}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                background: "var(--surface-2)",
                border: `1px solid ${COLORS[t.kind]}`,
                borderRadius: "var(--radius-2)",
                boxShadow: "var(--shadow-md)",
                padding: "10px 14px",
                maxWidth: 380,
                fontSize: 13,
              }}
            >
              <Icon size={15} style={{ color: COLORS[t.kind], flexShrink: 0 }} />
              <span>{t.message}</span>
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
