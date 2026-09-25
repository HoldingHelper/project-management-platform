import React, { useState } from 'react';
import { Person, Department, Team } from '../types';
import { Icon } from '../icons';
import { TN, avBg, ini } from '../tokens';
import { CEO, DEPTS, TEAMS } from '../seedData';

interface OrgChartViewProps {
  people: Person[];
  depts?: Department[];
  teams?: Team[];
  onOpenPerson: (name: string) => void;
}

const DC: Record<string, string> = {
  eng: 'blue',
  ops: 'teal',
  com: 'green',
  dsn: 'purple',
  mkt: 'magenta',
};

const PRES: Record<string, string> = {
  online: 'oklch(0.6 0.15 152)',
  away: 'oklch(0.75 0.15 75)',
  offline: 'var(--color-neutral-400)',
};

export function OrgChartView({ people, depts = DEPTS, teams = TEAMS, onOpenPerson }: OrgChartViewProps) {
  const [orgQ, setOrgQ] = useState('');
  const [orgDept, setOrgDept] = useState('All');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const oq = orgQ.trim().toLowerCase();
  const match = (u: Person) => !oq || `${u.name} ${u.role}`.toLowerCase().includes(oq);

  const ceoPerson = people.find((p) => p.name === CEO) || people[0];
  const anyOpen = teams.some((t) => !collapsed[t.id]);

  const toggleAll = () => {
    if (anyOpen) {
      setCollapsed(Object.fromEntries(teams.map((t) => [t.id, true])));
    } else {
      setCollapsed({});
    }
  };

  const filteredDepts = depts.filter((d) => orgDept === 'All' || orgDept === d.id);

  return (
    <div
      data-screen-label="Org chart"
      style={{ display: 'flex', flexDirection: 'column', gap: 20 }}
    >
      {/* Search and department filter bar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
        <div style={{ position: 'relative', flex: '0 1 320px', minWidth: 200 }}>
          <Icon
            name="search"
            size={16}
            style={{ position: 'absolute', left: 12, top: 12, opacity: 0.55 }}
          />
          <input
            className="input"
            style={{ minHeight: 40, paddingLeft: 36 }}
            placeholder="Find a person or team…"
            value={orgQ}
            onChange={(e) => setOrgQ(e.target.value)}
            aria-label="Find a person or team…"
          />
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {[['All', 'All departments'], ...depts.map((d) => [d.id, d.name])].map(([k, label]) => {
            const on = orgDept === k;
            const isAll = k === 'All';
            const tn = TN[DC[k] || 'gray'] || TN.gray;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setOrgDept(k)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 12px',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: `1px solid ${
                    on ? (isAll ? 'var(--color-text)' : tn.solid) : 'var(--color-divider)'
                  }`,
                  background: on
                    ? isAll
                      ? 'var(--color-neutral-200)'
                      : tn.bg
                    : 'transparent',
                  color: on && !isAll ? tn.fg : 'var(--color-text)',
                  borderRadius: 'var(--r-sm)',
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    background: isAll ? 'var(--color-text)' : tn.solid,
                    borderRadius: 'var(--r-av)',
                  }}
                />
                {label}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          className="btn btn-ghost"
          style={{ marginLeft: 'auto', borderRadius: 'var(--r-sm)' }}
          onClick={toggleAll}
        >
          {anyOpen ? 'Collapse all teams' : 'Expand all teams'}
        </button>
      </div>

      {/* CEO Card */}
      {ceoPerson && (
        <button
          type="button"
          onClick={() => onOpenPerson(ceoPerson.name)}
          style={{
            alignSelf: 'flex-start',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '14px 18px',
            border: 0,
            borderLeft: '4px solid var(--color-accent)',
            background: 'var(--color-surface)',
            cursor: 'pointer',
            textAlign: 'left',
            minWidth: 300,
            borderRadius: 'var(--r-md)',
          }}
        >
          <span
            title={ceoPerson.name}
            style={{
              width: 44,
              height: 44,
              flex: 'none',
              background: avBg(ceoPerson.name),
              color: 'var(--on-solid)',
              display: 'grid',
              placeItems: 'center',
              fontSize: 14,
              fontWeight: 800,
              borderRadius: 'var(--r-av)',
            }}
          >
            {ini(ceoPerson.name)}
          </span>
          <span style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontWeight: 800, fontSize: 16 }}>{ceoPerson.name}</span>
            <span className="text-muted" style={{ fontSize: 12 }}>
              {ceoPerson.role} · {depts.length} direct reports
            </span>
          </span>
        </button>
      )}

      {/* Departments Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 16,
          alignItems: 'start',
        }}
      >
        {filteredDepts.map((d) => {
          const tn = TN[DC[d.id] || 'gray'] || TN.gray;
          const head = people.find((p) => p.name === d.head);
          const deptTeams = teams.filter((t) => t.dept === d.id);
          const deptPeople = people.filter((u) => u.dept === d.id);

          return (
            <section
              key={d.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                background: 'var(--color-surface)',
                borderTop: `4px solid ${tn.solid}`,
                borderRadius: 'var(--r-md)',
              }}
            >
              <div style={{ padding: '14px 16px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontWeight: 800, fontSize: 17 }}>{d.name}</span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      padding: '1px 7px',
                      background: tn.bg,
                      color: tn.fg,
                      borderRadius: 'var(--r-xs)',
                    }}
                  >
                    {deptPeople.length} people
                  </span>
                </div>

                {head && (
                  <button
                    type="button"
                    onClick={() => onOpenPerson(head.name)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      border: 0,
                      background: 'transparent',
                      padding: 0,
                      cursor: 'pointer',
                      textAlign: 'left',
                      borderRadius: 'var(--r-sm)',
                    }}
                  >
                    <span
                      title={head.name}
                      style={{
                        width: 34,
                        height: 34,
                        flex: 'none',
                        background: avBg(head.name),
                        color: 'var(--on-solid)',
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: 12,
                        fontWeight: 800,
                        borderRadius: 'var(--r-av)',
                      }}
                    >
                      {ini(head.name)}
                    </span>
                    <span style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: 14, fontWeight: 700 }}>{head.name}</span>
                      <span className="text-muted" style={{ fontSize: 11 }}>
                        {head.role}
                      </span>
                    </span>
                  </button>
                )}
              </div>

              {deptTeams.map((t) => {
                const teamPeople = people.filter((u) => u.team === t.id);
                const isOpen = oq ? true : !collapsed[t.id];

                return (
                  <div key={t.id} style={{ borderTop: '1px solid var(--color-divider)' }}>
                    <button
                      type="button"
                      onClick={() =>
                        setCollapsed({
                          ...collapsed,
                          [t.id]: !collapsed[t.id],
                        })
                      }
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        width: '100%',
                        padding: '10px 16px',
                        border: 0,
                        background: 'transparent',
                        cursor: 'pointer',
                        textAlign: 'left',
                        borderRadius: 'var(--r-sm)',
                      }}
                    >
                      <Icon
                        name="chevron"
                        size={14}
                        style={{
                          transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                          transition: 'transform 0.15s ease',
                        }}
                      />
                      <span style={{ flex: 1, fontWeight: 700, fontSize: 14 }}>
                        {t.name}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 800,
                          padding: '1px 7px',
                          background: tn.bg,
                          color: tn.fg,
                          borderRadius: 'var(--r-xs)',
                        }}
                      >
                        {teamPeople.length}
                      </span>
                    </button>

                    {isOpen && (
                      <div
                        style={{
                          padding: '0 16px 10px 40px',
                          display: 'flex',
                          flexDirection: 'column',
                        }}
                      >
                        {teamPeople.map((m) => {
                          const isMatch = match(m);
                          return (
                            <button
                              key={m.name}
                              type="button"
                              onClick={() => onOpenPerson(m.name)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                padding: '6px 0',
                                border: 0,
                                background: 'transparent',
                                cursor: 'pointer',
                                textAlign: 'left',
                                opacity: isMatch ? 1 : 0.35,
                                borderRadius: 'var(--r-sm)',
                              }}
                            >
                              <span
                                style={{
                                  position: 'relative',
                                  width: 28,
                                  height: 28,
                                  flex: 'none',
                                  background: avBg(m.name),
                                  color: 'var(--on-solid)',
                                  display: 'grid',
                                  placeItems: 'center',
                                  fontSize: 10,
                                  fontWeight: 800,
                                  borderRadius: 'var(--r-av)',
                                }}
                              >
                                {ini(m.name)}
                                <span
                                  style={{
                                    position: 'absolute',
                                    right: -3,
                                    bottom: -3,
                                    width: 9,
                                    height: 9,
                                    background: PRES[m.presence] || PRES.offline,
                                    border: '2px solid var(--color-surface)',
                                    borderRadius: 'var(--r-av)',
                                  }}
                                />
                              </span>
                              <span style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontSize: 13, fontWeight: oq && isMatch ? 800 : 600 }}>
                                  {m.name}
                                </span>
                                <span className="text-muted" style={{ fontSize: 11 }}>
                                  {m.role}
                                </span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
    </div>
  );
}
