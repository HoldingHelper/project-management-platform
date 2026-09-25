import React from 'react';
import { Project, Department, Team, Person, Task } from '../types';
import { TN, st, stT, pcol } from '../tokens';

import { DEPTS, TEAMS, PARTS } from '../seedData';

interface ExecutiveViewProps {
  projects: Project[];
  depts?: Department[];
  teams?: Team[];
  people: Person[];
  tasks: Task[];
  partitions?: string[];
  partsList?: string[];
  onOpenPartition?: (partition: string) => void;
  onOpenProject: (id: string) => void;
}

const DC: Record<string, string> = {
  eng: 'blue',
  ops: 'teal',
  com: 'green',
  dsn: 'purple',
  mkt: 'magenta',
};

const DS = ['On track', 'At risk', 'Blocked', 'Planned', 'Done'];

export function ExecutiveView({
  projects,
  depts = DEPTS,
  teams = TEAMS,
  people,
  tasks,
  partitions,
  partsList = PARTS,
  onOpenPartition = () => {},
  onOpenProject,
}: ExecutiveViewProps) {
  const activePartitions = partitions || partsList;
  const risks = projects.filter(
    (x) => x.status === 'At risk' || x.status === 'Blocked'
  );

  return (
    <div
      data-screen-label="Executive"
      style={{ display: 'flex', flexDirection: 'column', gap: 40 }}
    >
      {/* Partition Health */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ paddingBottom: 12, borderBottom: '2px solid var(--color-divider)' }}>
          <h4 style={{ margin: 0 }}>Partition health</h4>
          <div className="text-muted" style={{ fontSize: 13 }}>
            Status mix and average progress per partition. Open one to see its projects.
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 16,
          }}
        >
          {activePartitions.map((p) => {
            const ps = projects.filter((x) => x.partition === p);
            const tn = TN[pcol(p)] || TN.blue;
            const avg = ps.length
              ? Math.round(
                  ps.reduce((acc, x) => acc + x.progress, 0) / ps.length
                )
              : 0;

            const dist = DS.map((k) => {
              const count = ps.filter((x) => x.status === k).length;
              return {
                l: k,
                n: count,
                w: `${ps.length ? (count / ps.length) * 100 : 0}%`,
                c: stT(k).solid,
              };
            }).filter((d) => d.n > 0);

            return (
              <button
                key={p}
                type="button"
                onClick={() => onOpenPartition(p)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 14,
                  padding: 16,
                  border: 0,
                  borderTop: `4px solid ${tn.solid}`,
                  background: 'var(--color-surface)',
                  textAlign: 'left',
                  cursor: 'pointer',
                  borderRadius: 'var(--r-md)',
                }}
              >
                <span
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                  }}
                >
                  <span
                    className="tag"
                    style={{ background: tn.bg, color: tn.fg, fontWeight: 700 }}
                  >
                    {p}
                  </span>
                  <span className="text-muted" style={{ fontSize: 12 }}>
                    {ps.length} projects
                  </span>
                </span>

                <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-heading)',
                      fontWeight: 800,
                      fontSize: 36,
                      lineHeight: 1,
                    }}
                  >
                    {avg}%
                  </span>
                  <span className="text-muted" style={{ fontSize: 12 }}>
                    average progress
                  </span>
                </span>

                <span
                  style={{
                    display: 'flex',
                    height: 10,
                    width: '100%',
                    background: 'var(--color-neutral-200)',
                    borderRadius: 'var(--r-bar)',
                    overflow: 'hidden',
                  }}
                >
                  {dist.map((d) => (
                    <span
                      key={d.l}
                      title={d.l}
                      style={{ width: d.w, background: d.c }}
                    />
                  ))}
                </span>

                <span style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontSize: 12 }}>
                  {dist.map((d) => (
                    <span key={d.l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          background: d.c,
                          borderRadius: 'var(--r-av)',
                        }}
                      />
                      {d.l} {d.n}
                    </span>
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Risks & Blockers + Departments Split */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 440px), 1fr))',
          gap: 40,
        }}
      >
        {/* Risks and Blockers */}
        <section style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ paddingBottom: 12, borderBottom: '2px solid var(--color-divider)' }}>
            <h4 style={{ margin: 0 }}>Risks and blockers</h4>
            <div className="text-muted" style={{ fontSize: 13 }}>
              Projects that need a decision.
            </div>
          </div>

          {risks.map((x) => {
            const sObj = st(x.status);
            return (
              <button
                key={x.id}
                type="button"
                onClick={() => onOpenProject(x.id)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '4px minmax(0, 1fr) auto',
                  gap: 14,
                  padding: '14px 0',
                  border: 0,
                  borderBottom: '1px solid var(--color-divider)',
                  background: 'transparent',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <span style={{ background: sObj.sDot }} />
                <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 800,
                        color: 'var(--color-neutral-700)',
                      }}
                    >
                      {x.id}
                    </span>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{x.name}</span>
                  </span>
                  <span style={{ fontSize: 13 }}>{x.risk || 'No risk note yet.'}</span>
                  <span className="text-muted" style={{ fontSize: 12 }}>
                    {x.owner} · due {x.e == null ? 'No date' : `${x.e} days`}
                  </span>
                </span>
                <span>
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
                    {x.status}
                  </span>
                </span>
              </button>
            );
          })}
        </section>

        {/* Departments Table */}
        <section style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ paddingBottom: 12, borderBottom: '2px solid var(--color-divider)' }}>
            <h4 style={{ margin: 0 }}>Departments</h4>
            <div className="text-muted" style={{ fontSize: 13 }}>
              Headcount, open work and average on-time delivery.
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1.6fr) 60px 60px 80px',
              gap: 12,
              padding: '8px 0',
              borderBottom: '1px solid var(--color-divider)',
              fontSize: 11,
              letterSpacing: '.08em',
              textTransform: 'uppercase',
              color: 'color-mix(in srgb, var(--color-text) 60%, transparent)',
            }}
          >
            <span>Department</span>
            <span>People</span>
            <span>Open</span>
            <span>On-time</span>
          </div>

          {depts.map((d) => {
            const tms = teams.filter((t) => t.dept === d.id);
            const deptPeople = people.filter((u) => u.dept === d.id).map((u) => u.name);
            const ot = Math.round(
              tms.reduce((acc, t) => acc + t.onTime, 0) / Math.max(1, tms.length)
            );
            const openTasksCount = tasks.filter(
              (t) =>
                t.status !== 'Done' &&
                t.assignees.some((a) => deptPeople.includes(a))
            ).length;
            const tn = TN[DC[d.id] || 'gray'] || TN.gray;
            const otColor =
              ot >= 85 ? TN.green.fg : ot >= 75 ? TN.amber.fg : TN.red.fg;

            return (
              <div
                key={d.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1.6fr) 60px 60px 80px',
                  gap: 12,
                  alignItems: 'center',
                  padding: '12px 0',
                  borderBottom: '1px solid var(--color-divider)',
                  fontSize: 14,
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <span
                    style={{
                      width: 10,
                      height: 28,
                      flex: 'none',
                      background: tn.solid,
                    }}
                  />
                  <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span style={{ fontWeight: 700 }}>{d.name}</span>
                    <span className="text-muted" style={{ fontSize: 12 }}>
                      {d.head} · {tms.length} teams
                    </span>
                  </span>
                </span>
                <span>{deptPeople.length}</span>
                <span>{openTasksCount}</span>
                <span style={{ fontWeight: 800, color: otColor }}>{ot}%</span>
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}
