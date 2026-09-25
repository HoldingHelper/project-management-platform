import React, { useState } from 'react';
import { ACTS } from '../seedData';
import { ini, avBg, TN } from '../tokens';

const AT: Record<string, string> = {
  Tasks: 'blue',
  Projects: 'purple',
  People: 'green',
  Integrations: 'teal',
};

interface ActivityViewProps {
  acts?: [string, string, string, string, string, string][];
}

export function ActivityView({ acts = ACTS }: ActivityViewProps = {}) {
  const [filter, setFilter] = useState('All');

  const visibleActs = acts.filter((a) => filter === 'All' || a[5] === filter);
  const days = [...new Set(visibleActs.map((a) => a[0]))];

  return (
    <div
      data-screen-label="Activity"
      style={{ display: 'flex', flexDirection: 'column', gap: 24 }}
    >
      <div className="seg" style={{ alignSelf: 'flex-start' }}>
        {['All', 'Tasks', 'Projects', 'People', 'Integrations'].map((opt, i) => (
          <button
            key={opt}
            type="button"
            className="seg-opt"
            onClick={() => setFilter(opt)}
            style={{
              border: 0,
              borderLeft: i ? '1px solid var(--color-divider)' : 0,
              background: filter === opt ? 'var(--color-accent)' : 'transparent',
              color: filter === opt ? 'var(--on-solid)' : 'var(--color-text)',
              minHeight: 36,
              fontWeight: 600,
            }}
          >
            {opt}
          </button>
        ))}
      </div>

      {days.map((day) => (
        <section
          key={day}
          data-m1="1"
          style={{
            display: 'grid',
            gridTemplateColumns: '120px minmax(0, 1fr)',
            gap: 24,
            borderTop: '2px solid var(--color-divider)',
            paddingTop: 12,
          }}
        >
          <h6 style={{ margin: '4px 0 0' }}>{day}</h6>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {visibleActs
              .filter((a) => a[0] === day)
              .map(([, who, verb, target, time, type], idx) => {
                const tn = TN[AT[type] || 'gray'] || TN.gray;
                return (
                  <div
                    key={idx}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '32px minmax(0, 1fr) auto auto',
                      gap: 12,
                      alignItems: 'center',
                      padding: '10px 0',
                      borderBottom: '1px solid var(--color-divider)',
                      fontSize: 14,
                    }}
                  >
                    <span
                      style={{
                        width: 32,
                        height: 32,
                        background: avBg(who),
                        color: 'var(--on-solid)',
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: 11,
                        fontWeight: 800,
                        borderRadius: 'var(--r-av)',
                      }}
                    >
                      {ini(who)}
                    </span>
                    <span>
                      <b>{who}</b> {verb}{' '}
                      <b style={{ color: 'var(--color-accent-700)' }}>{target}</b>
                    </span>
                    <span
                      className="tag"
                      style={{
                        background: tn.bg,
                        color: tn.fg,
                        fontWeight: 700,
                      }}
                    >
                      {type}
                    </span>
                    <span
                      className="text-muted"
                      style={{ fontSize: 12, width: 44, textAlign: 'right' }}
                    >
                      {time}
                    </span>
                  </div>
                );
              })}
          </div>
        </section>
      ))}
    </div>
  );
}
