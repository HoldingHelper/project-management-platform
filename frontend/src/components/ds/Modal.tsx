"use client";

import { useEffect, useId, useRef, type CSSProperties, type ReactNode } from "react";
import { X } from "lucide-react";
import { createPortal } from "react-dom";

interface Props {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  closeOnBackdrop?: boolean;
  fullScreenMobile?: boolean;
}

/** Centered dialog with backdrop; closes on Escape / backdrop click. */
export function Modal({ open, onClose, title, children, footer, width = 480, closeOnBackdrop = true, fullScreenMobile = false }: Props) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = dialogRef.current?.querySelector<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    const frame = requestAnimationFrame(() => (focusable ?? dialogRef.current)?.focus({ preventScroll: true }));
    const onKey = (e: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      if (dialogs[dialogs.length - 1] !== dialogRef.current) return;
      if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); closeRef.current(); }
      if (e.key === "Tab" && dialogRef.current) {
        const controls = [...dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )];
        if (!controls.length) { e.preventDefault(); dialogRef.current.focus(); return; }
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      returnFocusRef.current?.focus({ preventScroll: true });
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="pmp-modal-backdrop" onMouseDown={(event) => {
      if (closeOnBackdrop && event.target === event.currentTarget) onClose();
    }}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : "Dialog"}
        tabIndex={-1}
        className={`pmp-modal-panel ${fullScreenMobile ? "pmp-modal-full-mobile" : ""}`}
        style={{ "--pmp-modal-width": `${width}px` } as CSSProperties}
      >
        <div className="pmp-modal-header">
          <div id={titleId} className="pmp-modal-title">{title}</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="pmp-icon-btn pmp-touch-target pmp-modal-close"
          >
            <X size={18} />
          </button>
        </div>
        <div className="pmp-modal-body">{children}</div>
        {footer && (
          <div className="pmp-modal-footer">{footer}</div>
        )}
      </div>
    </div>, document.body
  );
}
