import React from 'react';
import { Icon } from '../icons';

interface ToastProps {
  text: string;
  actLabel?: string;
  onAct?: () => void;
  onClose: () => void;
}

export function Toast({ text, actLabel, onAct, onClose }: ToastProps) {
  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        left: 24,
        bottom: 24,
        zIndex: 70,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 10px 12px 12px',
        background: 'var(--color-text)',
        color: 'var(--on-solid)',
        boxShadow: 'var(--shadow-lg)',
        maxWidth: 'calc(100vw - 48px)',
        borderRadius: 'var(--r-lg)',
      }}
    >
      <span
        style={{
          width: 24,
          height: 24,
          flex: 'none',
          background: 'oklch(0.6 0.15 152)',
          display: 'grid',
          placeItems: 'center',
          borderRadius: 'var(--r-sm)',
        }}
      >
        <Icon name="check" size={13} strokeWidth={3.5} />
      </span>
      <span style={{ fontSize: 14, flex: 1 }}>{text}</span>
      {actLabel && onAct && (
        <button
          type="button"
          onClick={onAct}
          style={{
            border: 0,
            background: 'transparent',
            color: 'var(--on-solid)',
            fontWeight: 800,
            textDecoration: 'underline',
            cursor: 'pointer',
            fontSize: 14,
            borderRadius: 'var(--r-sm)',
          }}
        >
          {actLabel}
        </button>
      )}
      <button
        type="button"
        onClick={onClose}
        aria-label="Dismiss"
        style={{
          border: 0,
          background: 'transparent',
          color: 'var(--on-solid)',
          cursor: 'pointer',
          display: 'grid',
          padding: 4,
          borderRadius: 'var(--r-sm)',
        }}
      >
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}
