import React, { useState } from 'react';
import { Team, Department, Person, Task } from '../types';
import { TN, avBg, ini, st } from '../tokens';

import { TEAMS, DEPTS, buildPeople } from '../seedData';

interface PerformanceViewProps {
  teams?: Team[];
  depts?: Department[];
  people?: Person[];
  tasks: Task[];
  onOpenPerson: (name: string) => void;
}

const DC: Record<string, string> = {
  eng: 'blue',
  ops: 'teal',
  com: 'green',
  dsn: 'purple',
  mkt: 'magenta',
};

export function PerformanceView({
  teams = TEAMS,
  depts = DEPTS,
  people = buildPeople(),
  tasks,
  onOpenPerson,
}: PerformanceViewProps) {
  const [period, setPeriod] = useState<'4 weeks' | '8 weeks'>('8 weeks');
  const [selectedTeamId, setSelectedTeamId] = useState<string>(teams[0]?.id || 'plt');

  const n = period === '4 weeks' ? 4 : 8;

  const health = (t: Team) =>
    t.onTime >= 85 ? 'Healthy' : t.onTime >= 75 ? 'Watch' : 'At risk';
  const otColor = (v: number) =>
    v >= 85 ? TN.green.solid : v >= 75 ? TN.amber.solid : TN.red.solid;
  const otFg = (v: number) =>
    v >= 85 ? TN.green.fg : v >= 75 ? TN.amber.fg : TN.red.fg;

  // Open tasks by member
  const openBy: Record<string, number> = {};
  tasks.forEach((t) => {
    if (t.status !== 'Done') {
      t.assignees.forEach((a) => {
        openBy[a] = (openBy[a] || 0) + 1;
      });
    }
  });

  const selectedTeam = teams.find((t) => t.id === selectedTeamId) || teams[0];
  const selectedDept = depts.find((d) => d.id === selectedTeam.dept);
  const teamTn = TN[DC[selectedTeam.dept] || 'gray'] || TN.gray;
  const teamPf = selectedTeam.perf.slice(-n);
  const teamMx = Math.max(...teamPf);
  const teamTot = teamPf.reduce((a, b) => a + b, 0);

  const teamMembers = [selectedTeam.lead, ...selectedTeam.members];
  const mmMax = Math.max(1, ...teamMembers.map((m) => openBy[m] || 0));

  return (
    <div
      data-screen-label="Team performance"
      style={{ display: 'flex', flexDirection: 'column', gap: 28 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div className="seg">
          {(['4 weeks', '8 weeks'] as const).map((p, i) => (
            <button
              key={p}
              type="button"
              className="seg-opt"
              onClick={() => setPeriod(p)}
              style={{
                border: 0,
                borderLeft: i ? '1px solid var(--color-divider)' : 0,
                background: period === p ? 'var(--color-accent)' : 'transparent',
                color: period === p ? 'var(--on-solid)' : 'var(--color-text)',
                minHeight: 36,
                fontWeight: 600,
              }}
            >
              {p}
            </button>
          ))}
        </div>
        <span className="text-muted" style={{ fontSize: 13 }}>
          Tasks completed per week, on-time delivery and cycle time.
        </span>
      </div>

      {/* Teams Table */}
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 980 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(200px, 1.6fr) 170px 170px 70px 180px 90px 100px',
              gap: 16,
              padding: 8,
              borderBottom: '2px solid var(--color-divider)',
              fontSize: 11,
              letterSpacing: '.08em',
              textTransform: 'uppercase',
              color: 'color-mix(in srgb, var(--color-text) 60%, transparent)',
            }}
          >
            <span>Team</span>
            <span>Lead</span>
            <span>Throughput</span>
            <span>Done</span>
            <span>On-time</span>
            <span>Cycle</span>
            <span>Health</span>
          </div>

          {teams.map((t) => {
            const tn = TN[DC[t.dept] || 'gray'] || TN.gray;
            const dept = depts.find((d) => d.id === t.dept);
            const pf = t.perf.slice(-n);
            const mx = Math.max(...pf);
            const isSelected = selectedTeamId === t.id;
            const hl = health(t);
            const sObj = st(hl);

            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedTeamId(t.id)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(200px, 1.6fr) 170px 170px 70px 180px 90px 100px',
                  gap: 16,
                  alignItems: 'center',
                  width: '100%',
                  padding: '12px 8px',
                  border: 0,
                  borderBottom: '1px solid var(--color-divider)',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontSize: 14,
                  background: isSelected ? tn.bg : 'transparent',
                  boxShadow: isSelected ? `inset 3px 0 0 ${tn.solid}` : 'none',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <span style={{ width: 10, height: 28, flex: 'none', background: tn.solid }} />
                  <span style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontWeight: 700 }}>{t.name}</span>
                    <span className="text-muted" style={{ fontSize: 12 }}>
                      {dept?.name}
                    </span>
                  </span>
                </span>

                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    title={t.lead}
                    style={{
                      width: 24,
                      height: 24,
                      flex: 'none',
                      background: avBg(t.lead),
                      color: 'var(--on-solid)',
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: 9,
                      fontWeight: 800,
                      borderRadius: 'var(--r-av)',
                    }}
                  >
                    {ini(t.lead)}
                  </span>
                  <span style={{ fontSize: 13 }}>{t.lead}</span>
                </span>

                <span style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 28 }}>
                  {pf.map((v, i) => (
                    <span
                      key={i}
                      style={{
                        flex: 1,
                        height: `${Math.max(3, (v / mx) * 28)}px`,
                        background: i === pf.length - 1 ? tn.solid : tn.bd,
                      }}
                    />
                  ))}
                </span>

                <span
                  style={{
                    fontFamily: 'var(--font-heading)',
                    fontWeight: 800,
                    fontSize: 18,
                  }}
                >
                  {pf.reduce((a, b) => a + b, 0)}
                </span>

                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{
                      flex: 1,
                      height: 6,
                      background: 'var(--color-neutral-200)',
                      borderRadius: 'var(--r-bar)',
                      overflow: 'hidden',
                    }}
                  >
                    <span
                      style={{
                        display: 'block',
                        height: '100%',
                        width: `${t.onTime}%`,
                        background: otColor(t.onTime),
                      }}
                    />
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 800, width: 34 }}>
                    {t.onTime}%
                  </span>
                </span>

                <span style={{ fontSize: 13 }}>{t.cycle} days</span>

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
                    {hl}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Team Detail Section */}
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))',
          gap: 40,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              paddingBottom: 12,
              borderBottom: '2px solid var(--color-divider)',
            }}
          >
            <span style={{ width: 12, height: 36, background: teamTn.solid }} />
            <div>
              <h4 style={{ margin: 0 }}>{selectedTeam.name}</h4>
              <div className="text-muted" style={{ fontSize: 13 }}>
                {selectedDept?.name} · led by {selectedTeam.lead} · {teamMembers.length} people
              </div>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
              borderBottom: '1px solid var(--color-divider)',
            }}
          >
            {[
              { label: 'Tasks done', v: teamTot, c: TN.green.fg },
              { label: 'Per week', v: (teamTot / n).toFixed(1), c: 'var(--color-text)' },
              { label: 'On-time', v: `${selectedTeam.onTime}%`, c: otFg(selectedTeam.onTime) },
              { label: 'Cycle time', v: `${selectedTeam.cycle}d`, c: 'var(--color-text)' },
            ].map((z) => (
              <div key={z.label} style={{ padding: '0 10px 12px 0' }}>
                <div
                  style={{
                    fontFamily: 'var(--font-heading)',
                    fontWeight: 800,
                    fontSize: 26,
                    color: z.c,
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
              height: 150,
              borderBottom: '2px solid var(--color-divider)',
            }}
          >
            {teamPf.map((v, i) => (
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
                    height: `${(v / teamMx) * 110}px`,
                    background: i === teamPf.length - 1 ? teamTn.solid : teamTn.bd,
                  }}
                />
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: -10 }}>
            {teamPf.map((_, i) => (
              <span key={i} className="text-muted" style={{ flex: 1, fontSize: 10 }}>
                W{40 - n + i + 1}
              </span>
            ))}
          </div>
        </div>

        {/* Member workload breakdown */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <h6 className="text-muted" style={{ marginBottom: 8 }}>
            Open tasks by member
          </h6>
          {teamMembers.map((m) => {
            const count = openBy[m] || 0;
            const pct = `${(count / mmMax) * 100}%`;
            return (
              <button
                key={m}
                type="button"
                onClick={() => onOpenPerson(m)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '28px 150px minmax(0, 1fr) 28px',
                  gap: 10,
                  alignItems: 'center',
                  padding: '8px 0',
                  border: 0,
                  borderBottom: '1px solid var(--color-divider)',
                  background: 'transparent',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                <span
                  title={m}
                  style={{
                    width: 28,
                    height: 28,
                    flex: 'none',
                    background: avBg(m),
                    color: 'var(--on-solid)',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 10,
                    fontWeight: 800,
                    borderRadius: 'var(--r-av)',
                  }}
                >
                  {ini(m)}
                </span>
                <span style={{ fontWeight: 600 }}>{m}</span>
                <span
                  style={{
                    height: 8,
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
                      background: count > 2 ? TN.amber.solid : TN.blue.solid,
                    }}
                  />
                </span>
                <span style={{ fontWeight: 800, textAlign: 'right' }}>{count}</span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
