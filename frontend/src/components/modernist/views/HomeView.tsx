import React from 'react';
import { Task, Project, Person } from '../types';
import { Icon } from '../icons';
import {
  st,
  TN,
  TYPE,
  ini,
  avBg,
  dayStr,
  hash,
  TODAY,
  ME,
} from '../tokens';

interface HomeViewProps {
  tasks: Task[];
  projects: Project[];
  people: Person[];
  zoomPerson?: string;
  onSelectZoomPerson?: (name: string) => void;
  onOpenTask: (id: string) => void;
  onOpenPerson?: (name: string) => void;
  onNavigateTasks?: () => void;
  onGoTasks?: () => void;
}

export function HomeView({
  tasks,
  projects,
  people,
  zoomPerson: propZoomPerson,
  onSelectZoomPerson: propOnSelectZoomPerson,
  onOpenTask,
  onOpenPerson,
  onNavigateTasks,
  onGoTasks,
}: HomeViewProps) {
  const [localZoomPerson, setLocalZoomPerson] = React.useState(propZoomPerson || ME);
  const zoomPerson = propZoomPerson || localZoomPerson;
  const onSelectZoomPerson = propOnSelectZoomPerson || setLocalZoomPerson;
  const handleGoTasks = onGoTasks || onNavigateTasks || (() => {});
  const mine = tasks.filter((t) => t.assignees.includes(ME));
  const myOpen = mine
    .filter((t) => t.status !== 'Done')
    .sort((a, b) => (a.e ?? 999) - (b.e ?? 999));
  const myDone = mine.filter((t) => t.status === 'Done').length;

  // Personal KPIs
  const kpis = [
    {
      label: 'Completion rate',
      v: `${Math.round((myDone / Math.max(1, mine.length)) * 100)}%`,
      pct: `${Math.round((myDone / Math.max(1, mine.length)) * 100)}%`,
      fill: TN.green.solid,
    },
    {
      label: 'Active workload',
      v: `${myOpen.length} open`,
      pct: `${Math.min(100, (myOpen.length / 8) * 100)}%`,
      fill: myOpen.length > 5 ? 'var(--color-accent)' : TN.blue.solid,
    },
    {
      label: 'Schedule coverage',
      v: `${Math.round(
        (mine.filter((t) => t.e != null).length / Math.max(1, mine.length)) * 100
      )}%`,
      pct: `${Math.round(
        (mine.filter((t) => t.e != null).length / Math.max(1, mine.length)) * 100
      )}%`,
      fill: TN.purple.solid,
    },
  ];

  // Executive mini KPIs
  const activeProj = projects.filter(
    (x) => x.status !== 'Done' && x.status !== 'Planned'
  );
  const cnt = (stStr: string) => projects.filter((x) => x.status === stStr).length;

  const execMini = [
    { label: 'Active projects', v: activeProj.length, color: TN.blue.fg },
    { label: 'Completed', v: cnt('Done'), color: TN.green.fg },
    { label: 'Delayed / at risk', v: cnt('At risk'), color: TN.amber.fg },
    { label: 'Blocked', v: cnt('Blocked'), color: TN.red.fg },
  ];

  // Workload by person
  const openBy: Record<string, number> = {};
  tasks.forEach((t) => {
    if (t.status !== 'Done') {
      t.assignees.forEach((a) => {
        openBy[a] = (openBy[a] || 0) + 1;
      });
    }
  });
  const wl = Object.entries(openBy)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const wmax = Math.max(1, ...wl.map((w) => w[1]));

  const zp =
    people.find((p) => p.name === zoomPerson) ||
    people.find((p) => p.name === ME) ||
    people[0];
  const h = hash(zp?.name || ME);
  const zTasks = tasks.filter((t) => t.assignees.includes(zp?.name || ME));
  const zb = Array.from({ length: 8 }, (_, i) => ((h * (i + 3)) % 7) + 1);

  return (
    <div
      data-screen-label="Home"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))',
        gap: 40,
      }}
    >
      {/* Column 1: My open tasks */}
      <section style={{ display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            gap: 12,
            paddingBottom: 12,
            borderBottom: '2px solid var(--color-divider)',
          }}
        >
          <div>
            <h4 style={{ margin: 0 }}>My open tasks</h4>
            <div className="text-muted" style={{ fontSize: 13 }}>
              Assigned to you, soonest due first.
            </div>
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleGoTasks}
          >
            Task browser
            <Icon name="right" size={14} />
          </button>
        </div>

        {myOpen.slice(0, 6).map((t) => {
          const ty = TYPE[t.type] || TYPE.Chore;
          const sObj = st(t.status);
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onOpenTask(t.id)}
              style={{
                display: 'grid',
                gridTemplateColumns: '84px minmax(0, 1fr) auto',
                gap: 12,
                alignItems: 'center',
                padding: '12px 4px',
                border: 0,
                borderBottom: '1px solid var(--color-divider)',
                background: 'transparent',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 12,
                  fontWeight: 800,
                  color: 'var(--color-neutral-700)',
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
              <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{t.title}</span>
                <span className="text-muted" style={{ fontSize: 12 }}>
                  {t.project || '—'} · due {t.e == null ? 'No date' : dayStr(t.e)}
                </span>
              </span>
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
      </section>

      {/* Column 2: My KPI pulse */}
      <section style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ paddingBottom: 12, borderBottom: '2px solid var(--color-divider)' }}>
          <h4 style={{ margin: 0 }}>My KPI pulse</h4>
          <div className="text-muted" style={{ fontSize: 13 }}>
            Only your personal delivery signals are shown here.
          </div>
        </div>
        {kpis.map((k) => (
          <div
            key={k.label}
            style={{
              padding: '16px 0',
              borderBottom: '1px solid var(--color-divider)',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{k.label}</span>
              <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22 }}>
                {k.v}
              </span>
            </div>
            <div
              style={{
                height: 6,
                background: 'var(--color-neutral-200)',
                borderRadius: 'var(--r-bar)',
                overflow: 'hidden',
              }}
            >
              <div style={{ height: '100%', width: k.pct, background: k.fill }} />
            </div>
          </div>
        ))}
      </section>

      {/* Column 3 (Full width): Executive dashboard with person zoom */}
      <section style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ paddingBottom: 12, borderBottom: '2px solid var(--color-divider)' }}>
          <h4 style={{ margin: 0 }}>Executive dashboard</h4>
          <div className="text-muted" style={{ fontSize: 13 }}>
            Org-wide KPIs with one-person zoom. Pick a person on the left.
          </div>
        </div>

        {/* 4 Mini KPI cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 0,
            borderBottom: '1px solid var(--color-divider)',
          }}
        >
          {execMini.map((m) => (
            <div
              key={m.label}
              style={{
                padding: '0 16px 16px 0',
                marginRight: 16,
                borderRight: '1px solid var(--color-divider)',
              }}
            >
              <div className="text-muted" style={{ fontSize: 12 }}>
                {m.label}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontWeight: 800,
                  fontSize: 32,
                  color: m.color,
                }}
              >
                {m.v}
              </div>
            </div>
          ))}
        </div>

        {/* Workload list & 8-week KPI zoom card */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))',
            gap: 40,
          }}
        >
          {/* Workload list */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <h6 className="text-muted" style={{ marginBottom: 8 }}>
              Open work by person
            </h6>
            {wl.map(([name, n]) => {
              const on = zp?.name === name;
              const pct = `${(n / wmax) * 100}%`;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => onSelectZoomPerson(name)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '150px minmax(0, 1fr) 28px',
                    gap: 12,
                    alignItems: 'center',
                    padding: '8px 6px',
                    border: 0,
                    borderBottom: '1px solid var(--color-divider)',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: 13,
                    background: on ? 'var(--color-accent-100)' : 'transparent',
                  }}
                >
                  <span style={{ fontWeight: on ? 800 : 400 }}>{name}</span>
                  <span
                    style={{
                      height: 10,
                      background: 'var(--color-neutral-200)',
                      borderRadius: 'var(--r-bar)',
                      overflow: 'hidden',
                    }}
                  >
                    <span
                      style={{
                        display: 'block',
                        height: '100%',
                        width: pct,
                        background: on ? 'var(--color-accent)' : TN.blue.solid,
                      }}
                    />
                  </span>
                  <span style={{ fontWeight: 800, textAlign: 'right' }}>{n}</span>
                </button>
              );
            })}
          </div>

          {/* 8-week KPI zoom card */}
          {zp && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span
                  style={{
                    width: 40,
                    height: 40,
                    background: avBg(zp.name),
                    color: 'var(--on-solid)',
                    display: 'grid',
                    placeItems: 'center',
                    fontWeight: 800,
                    fontSize: 13,
                    borderRadius: 'var(--r-sm)',
                  }}
                >
                  {ini(zp.name)}
                </span>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>{zp.name}</div>
                  <div className="text-muted" style={{ fontSize: 12 }}>
                    {zp.role} · 8-week KPI zoom
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                  borderTop: '2px solid var(--color-divider)',
                  borderBottom: '1px solid var(--color-divider)',
                }}
              >
                {[
                  { label: 'Open tasks', v: zTasks.filter((t) => t.status !== 'Done').length },
                  { label: 'In progress', v: zTasks.filter((t) => t.status === 'In progress').length },
                  { label: 'Completed', v: zb.reduce((a, b) => a + b, 0) },
                  { label: 'On-time rate', v: `${70 + (h % 29)}%` },
                ].map((z) => (
                  <div key={z.label} style={{ padding: '10px 10px 10px 0' }}>
                    <div
                      style={{
                        fontFamily: 'var(--font-heading)',
                        fontWeight: 800,
                        fontSize: 24,
                      }}
                    >
                      {z.v}
                    </div>
                    <div className="text-muted" style={{ fontSize: 11 }}>
                      {z.label}
                    </div>
                  </div>
                ))}
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-end',
                  gap: 8,
                  height: 130,
                  borderBottom: '2px solid var(--color-divider)',
                }}
              >
                {zb.map((v, i) => (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'flex-end',
                      gap: 4,
                      height: '100%',
                    }}
                  >
                    <span style={{ fontSize: 11, fontWeight: 800 }}>{v}</span>
                    <div
                      style={{
                        height: `${(v / 7) * 100}px`,
                        background: i === 7 ? TN.blue.solid : TN.blue.bd,
                      }}
                    />
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: -10 }}>
                {zb.map((_, i) => (
                  <span
                    key={i}
                    className="text-muted"
                    style={{ flex: 1, fontSize: 10 }}
                  >
                    W{32 + i}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
