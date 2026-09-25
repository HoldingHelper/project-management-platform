import React from 'react';
import { Person, Task } from '../types';
import { Icon } from '../icons';
import { avBg, ini, dayStr, st, TN, TYPE, PRI } from '../tokens';

interface PersonDrawerProps {
  person: Person | null;
  tasks: Task[];
  teamName: string;
  deptName: string;
  onClose: () => void;
  onMessage: (name: string) => void;
  onAssignTask: (name: string) => void;
  onOpenTask: (taskId: string) => void;
}

export function PersonDrawer({
  person,
  tasks,
  teamName,
  deptName,
  onClose,
  onMessage,
  onAssignTask,
  onOpenTask,
}: PersonDrawerProps) {
  if (!person) return null;

  const presColor =
    person.presence === 'online'
      ? TN.green.solid
      : person.presence === 'away'
      ? TN.amber.solid
      : 'var(--color-neutral-400)';

  const presLabel = person.invited
    ? 'Invitation pending'
    : person.presence.charAt(0).toUpperCase() + person.presence.slice(1);

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 40,
          background: 'color-mix(in srgb, var(--color-text) 30%, transparent)',
        }}
      />
      <aside
        role="dialog"
        aria-label="Person"
        data-screen-label="Person"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          zIndex: 41,
          width: 'min(440px, 100vw)',
          background: 'var(--panel)',
          backdropFilter: 'var(--blur)',
          WebkitBackdropFilter: 'var(--blur)',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 16px 0 24px',
            minHeight: 60,
            borderBottom: '2px solid var(--color-divider)',
          }}
        >
          <h6 className="text-muted" style={{ margin: 0 }}>
            Profile
          </h6>
          <button
            type="button"
            className="btn btn-icon"
            aria-label="Close"
            onClick={onClose}
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 24,
          }}
        >
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <span
              title={person.name}
              style={{
                width: 64,
                height: 64,
                flex: 'none',
                background: avBg(person.name),
                color: 'var(--on-solid)',
                display: 'grid',
                placeItems: 'center',
                fontSize: 20,
                fontWeight: 800,
                borderRadius: 'var(--r-av)',
              }}
            >
              {ini(person.name)}
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <h3 style={{ margin: 0 }}>{person.name}</h3>
              <span className="text-muted" style={{ fontSize: 14 }}>
                {person.role}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    background: presColor,
                    borderRadius: 'var(--r-av)',
                  }}
                />
                {presLabel}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onMessage(person.name)}
              style={{ minHeight: 40, borderRadius: 'var(--r-sm)' }}
            >
              <Icon name="chat" size={16} />
              Message
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => onAssignTask(person.name)}
              style={{ minHeight: 40, borderRadius: 'var(--r-sm)' }}
            >
              <Icon name="plus" size={16} />
              Assign a task
            </button>
          </div>

          <div style={{ borderTop: '2px solid var(--color-divider)' }}>
            {[
              ['Email', person.email],
              ['Team', teamName || '—'],
              ['Department', deptName || 'Executive'],
              ['Reports to', person.mgr || '—'],
            ].map(([k, v]) => (
              <div
                key={k}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '100px 1fr',
                  gap: 8,
                  padding: '10px 0',
                  borderBottom: '1px solid var(--color-divider)',
                  fontSize: 14,
                }}
              >
                <span className="text-muted" style={{ fontSize: 12 }}>
                  {k}
                </span>
                <span style={{ overflowWrap: 'anywhere' }}>{v}</span>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <h6 className="text-muted" style={{ marginBottom: 8 }}>
              Open tasks · {tasks.length}
            </h6>
            {tasks.map((t) => {
              const ty = TYPE[t.type] || TYPE.Chore;
              const sObj = st(t.status);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onOpenTask(t.id)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '78px minmax(0, 1fr) auto',
                    gap: 10,
                    alignItems: 'center',
                    padding: '10px 0',
                    border: 0,
                    borderBottom: '1px solid var(--color-divider)',
                    background: 'transparent',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: 13,
                  }}
                >
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontWeight: 800,
                      color: 'var(--color-neutral-700)',
                      fontSize: 12,
                    }}
                  >
                    <span
                      title={t.type}
                      style={{
                        width: 16,
                        height: 16,
                        flex: 'none',
                        display: 'grid',
                        placeItems: 'center',
                        background: TN[ty.t]?.solid || TN.blue.solid,
                        color: 'var(--on-solid)',
                        borderRadius: 'var(--r-xs)',
                      }}
                    >
                      <Icon
                        name={t.type === 'Feature' ? 'check' : t.type === 'Bug' ? 'target' : 'sparkles'}
                        size={10}
                        strokeWidth={3}
                      />
                    </span>
                    {t.id}
                  </span>
                  <span style={{ fontWeight: 600 }}>{t.title}</span>
                  <span
                    className="tag"
                    style={{
                      background: sObj.sBg,
                      color: sObj.sFg,
                      border: `1px solid ${sObj.sBd}`,
                      whiteSpace: 'nowrap',
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '.04em',
                      padding: '2px 8px',
                      borderRadius: 'var(--r-xs)',
                    }}
                  >
                    {t.status}
                  </span>
                </button>
              );
            })}
            {tasks.length === 0 && (
              <p className="text-muted" style={{ margin: '8px 0 0', fontSize: 13 }}>
                No open tasks.
              </p>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
