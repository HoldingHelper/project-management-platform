import React from 'react';
import { AutomationRule } from '../types';
import { TN } from '../tokens';

interface AutomationsViewProps {
  rules?: AutomationRule[];
  autos?: AutomationRule[];
  onToggleRule?: (id: string) => void;
  onToggleAuto?: (id: string) => void;
}

export function AutomationsView({ rules, autos, onToggleRule, onToggleAuto }: AutomationsViewProps) {
  const activeRules = autos || rules || [];
  const handleToggle = onToggleAuto || onToggleRule || (() => {});
  return (
    <div data-screen-label="Automations" style={{ display: 'flex', flexDirection: 'column' }}>
      {activeRules.map((a) => (
        <div
          key={a.id}
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) auto',
            gap: 24,
            alignItems: 'center',
            padding: '18px 0',
            borderBottom: '1px solid var(--color-divider)',
            opacity: a.on ? 1 : 0.6,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 800, fontSize: 17 }}>{a.name}</span>
              <span className="tag tag-neutral">{a.scope}</span>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '52px minmax(0, 1fr)',
                gap: '4px 10px',
                fontSize: 14,
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: '.08em',
                  color: 'var(--color-accent)',
                  paddingTop: 2,
                }}
              >
                WHEN
              </span>
              <span>{a.when}</span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: '.08em',
                  paddingTop: 2,
                }}
              >
                THEN
              </span>
              <span>{a.then}</span>
            </div>
            <span className="text-muted" style={{ fontSize: 12 }}>
              {a.runs} runs · last run {a.last}
            </span>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={a.on}
            aria-label={a.name}
            onClick={() => handleToggle(a.id)}
            style={{
              width: 48,
              height: 26,
              border: 0,
              padding: 0,
              position: 'relative',
              cursor: 'pointer',
              background: a.on ? TN.green.solid : 'var(--color-neutral-400)',
              borderRadius: 'var(--r-bar)',
            }}
          >
            <span
              style={{
                position: 'absolute',
                top: 3,
                left: a.on ? 25 : 3,
                width: 20,
                height: 20,
                background: 'var(--panel)',
                backdropFilter: 'var(--blur)',
                WebkitBackdropFilter: 'var(--blur)',
                borderRadius: 'var(--r-av)',
                transition: 'left 0.15s ease',
              }}
            />
          </button>
        </div>
      ))}
    </div>
  );
}
