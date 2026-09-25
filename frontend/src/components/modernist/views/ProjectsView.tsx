import React, { useState } from 'react';
import { Project, Person, Task } from '../types';
import { Icon } from '../icons';
import {
  st,
  TN,
  PRI,
  projBg,
  avBg,
  ini,
  dayStr,
  TODAY,
  SPAN,
} from '../tokens';

interface ProjectsViewProps {
  projects: Project[];
  tasks?: Task[];
  people: Person[];
  partsList?: string[];
  currentPartition?: string;
  showArchives?: boolean;
  searchQuery?: string;
  onSelectPartition?: (part: string) => void;
  onToggleArchives?: () => void;
  onSearchChange?: (q: string) => void;
  onOpenProject: (id: string) => void;
}

export function ProjectsView({
  projects,
  tasks,
  people,
  partsList,
  currentPartition: propCurrentPartition,
  showArchives: propShowArchives,
  searchQuery: propSearchQuery,
  onSelectPartition: propOnSelectPartition,
  onToggleArchives: propOnToggleArchives,
  onSearchChange: propOnSearchChange,
  onOpenProject,
}: ProjectsViewProps) {
  const [localPartition, setLocalPartition] = useState('All');
  const [localShowArchives, setLocalShowArchives] = useState(false);
  const [localSearchQuery, setLocalSearchQuery] = useState('');

  const currentPartition = propCurrentPartition !== undefined ? propCurrentPartition : localPartition;
  const showArchives = propShowArchives !== undefined ? propShowArchives : localShowArchives;
  const searchQuery = propSearchQuery !== undefined ? propSearchQuery : localSearchQuery;

  const onSelectPartition = propOnSelectPartition || setLocalPartition;
  const onToggleArchives = propOnToggleArchives || (() => setLocalShowArchives((v) => !v));
  const onSearchChange = propOnSearchChange || setLocalSearchQuery;

  const PARTITIONS = partsList ? ['All', ...partsList] : ['All', 'Tech', 'Operations', 'Business', 'Marketing', 'Sales', 'Design'];

  const base = projects.filter((x) => showArchives || x.status !== 'Done');
  const inPart = base.filter(
    (x) => currentPartition === 'All' || x.partition === currentPartition
  );
  const q = searchQuery.trim().toLowerCase();
  const visible = inPart.filter(
    (x) =>
      !q ||
      `${x.id} ${x.name} ${x.owner}`.toLowerCase().includes(q)
  );

  const barC: Record<string, [string, string, string]> = {
    'On track': [TN.green.bg, TN.green.solid, TN.green.bd],
    'At risk': [TN.amber.bg, TN.amber.solid, TN.amber.bd],
    Blocked: [TN.red.bg, TN.red.solid, TN.red.solid],
    Done: [TN.gray.bg, TN.gray.solid, 'transparent'],
    Planned: ['transparent', 'transparent', 'var(--color-divider)'],
  };

  return (
    <div data-screen-label="Projects" style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* Partition tabs and archives toggle */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          gap: 12,
          borderBottom: '2px solid var(--color-divider)',
        }}
      >
        <div role="tablist" style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
          {PARTITIONS.map((p) => {
            const on = currentPartition === p;
            const count =
              p === 'All'
                ? base.length
                : base.filter((x) => x.partition === p).length;
            return (
              <button
                key={p}
                role="tab"
                type="button"
                onClick={() => onSelectPartition(p)}
                style={{
                  padding: '10px 12px',
                  border: 0,
                  background: 'transparent',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: 14,
                  borderBottom: '2px solid transparent',
                  marginBottom: -2,
                  borderBottomColor: on ? 'var(--color-accent)' : 'transparent',
                  color: on ? 'var(--color-text)' : 'color-mix(in srgb, var(--color-text) 60%, transparent)',
                }}
              >
                {p === 'All' ? 'All partitions' : p}{' '}
                <span style={{ opacity: 0.55, fontWeight: 400 }}>{count}</span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onToggleArchives}
          style={{ marginBottom: 8, borderRadius: 'var(--r-sm)' }}
        >
          <Icon name="archive" size={15} />
          {showArchives ? 'Hide archives' : 'Show archives'}
        </button>
      </div>

      {/* Portfolio Timeline Gantt Chart */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <h4 style={{ margin: 0 }}>Portfolio timeline</h4>
          <div
            className="text-muted"
            style={{
              display: 'flex',
              gap: 16,
              alignItems: 'center',
              fontSize: 12,
              flexWrap: 'wrap',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  width: 9,
                  height: 9,
                  background: 'var(--color-text)',
                  transform: 'rotate(45deg)',
                  borderRadius: 'var(--r-av)',
                }}
              />
              milestone
            </span>
            <span>“depends on” = dependency</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 2, height: 14, background: 'var(--color-accent)' }} />
              today
            </span>
            {[
              { l: 'On track', c: TN.green.solid },
              { l: 'At risk', c: TN.amber.solid },
              { l: 'Blocked', c: TN.red.solid },
              { l: 'Done', c: TN.gray.solid },
            ].map((lg) => (
              <span key={lg.l} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 14, height: 8, background: lg.c }} />
                {lg.l}
              </span>
            ))}
          </div>
        </div>

        <div
          style={{
            overflowX: 'auto',
            borderTop: '2px solid var(--color-divider)',
            borderBottom: '2px solid var(--color-divider)',
          }}
        >
          <div style={{ minWidth: 900 }}>
            {/* Header row with months */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '240px minmax(0, 1fr)',
                borderBottom: '1px solid var(--color-divider)',
              }}
            >
              <span
                className="text-muted"
                style={{
                  fontSize: 11,
                  letterSpacing: '.08em',
                  textTransform: 'uppercase',
                  padding: 8,
                }}
              >
                Project
              </span>
              <div style={{ position: 'relative', height: 32 }}>
                <span
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    padding: 8,
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: '.08em',
                    borderLeft: '1px solid var(--color-divider)',
                  }}
                >
                  SEP 2026
                </span>
                <span
                  style={{
                    position: 'absolute',
                    left: '32.97%',
                    top: 0,
                    bottom: 0,
                    padding: 8,
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: '.08em',
                    borderLeft: '1px solid var(--color-divider)',
                  }}
                >
                  OCT
                </span>
                <span
                  style={{
                    position: 'absolute',
                    left: '67.03%',
                    top: 0,
                    bottom: 0,
                    padding: 8,
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: '.08em',
                    borderLeft: '1px solid var(--color-divider)',
                  }}
                >
                  NOV
                </span>
              </div>
            </div>

            {/* Gantt project rows */}
            {visible.map((r) => {
              const [bg, fill, bd] = barC[r.status] || barC.Planned;
              const left = `${(r.s / SPAN) * 100}%`;
              const width = `${((Math.min(r.e, SPAN) - r.s) / SPAN) * 100}%`;
              const ms = `${(r.m / SPAN) * 100}%`;
              const isPastMs = r.m < TODAY || r.status === 'Done';

              return (
                <div
                  key={r.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '240px minmax(0, 1fr)',
                    borderBottom: '1px solid var(--color-divider)',
                    minHeight: 52,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => onOpenProject(r.id)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'center',
                      padding: '6px 8px',
                      border: 0,
                      background: 'transparent',
                      textAlign: 'left',
                      cursor: 'pointer',
                      borderRadius: 'var(--r-sm)',
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 600 }}>
                      <span
                        style={{
                          display: 'inline-block',
                          width: 10,
                          height: 10,
                          background: projBg(r),
                          marginRight: 6,
                          borderRadius: 'var(--r-sm)',
                        }}
                      />
                      <span
                        style={{
                          color: 'var(--color-neutral-700)',
                          fontWeight: 800,
                          fontSize: 11,
                          marginRight: 6,
                        }}
                      >
                        {r.id}
                      </span>
                      {r.name}
                    </span>
                    <span className="text-muted" style={{ fontSize: 11 }}>
                      {r.dep ? `Depends on ${r.dep}` : `${dayStr(r.s)} – ${dayStr(r.e)}`}
                    </span>
                  </button>

                  <div style={{ position: 'relative' }}>
                    <span
                      style={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        left: '32.97%',
                        width: 1,
                        background: 'var(--color-neutral-200)',
                      }}
                    />
                    <span
                      style={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        left: '67.03%',
                        width: 1,
                        background: 'var(--color-neutral-200)',
                      }}
                    />
                    <div
                      title={`${r.name} · ${r.progress}% · ${r.status}`}
                      style={{
                        position: 'absolute',
                        top: 16,
                        height: 20,
                        left,
                        width,
                        background: bg,
                        border: `1px solid ${bd}`,
                        borderRadius: 'var(--r-xs)',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${r.progress}%`,
                          background: fill,
                        }}
                      />
                    </div>
                    <span
                      style={{
                        position: 'absolute',
                        top: 20,
                        left: ms,
                        width: 11,
                        height: 11,
                        marginLeft: -6,
                        transform: 'rotate(45deg)',
                        background: isPastMs ? 'var(--color-neutral-500)' : 'var(--color-text)',
                        border: '1px solid var(--panel)',
                      }}
                    />
                    <span
                      style={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        left: '25.27%',
                        width: 2,
                        background: 'var(--color-accent)',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {visible.length === 0 && (
          <div style={{ padding: '32px 8px' }}>
            <h4 style={{ margin: '0 0 4px' }}>No projects to chart</h4>
            <p className="text-muted" style={{ margin: 0, fontSize: 14 }}>
              This view has no scheduled projects. Try another partition or level.
            </p>
          </div>
        )}
      </section>

      {/* Projects Table */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <h4 style={{ margin: 0 }}>All projects</h4>
          <div style={{ position: 'relative', flex: '0 1 360px' }}>
            <Icon
              name="search"
              size={16}
              style={{
                position: 'absolute',
                left: 12,
                top: 12,
                opacity: 0.55,
              }}
            />
            <input
              className="input"
              style={{ minHeight: 40, paddingLeft: 36 }}
              placeholder="Filter by name or ID…"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              aria-label="Filter projects"
            />
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 1060 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns:
                  'minmax(230px, 2.2fr) 140px 110px 120px minmax(190px, 1.6fr) 100px 90px 80px',
                gap: 16,
                padding: 8,
                borderBottom: '2px solid var(--color-divider)',
                fontSize: 11,
                letterSpacing: '.08em',
                textTransform: 'uppercase',
                color: 'color-mix(in srgb, var(--color-text) 60%, transparent)',
              }}
            >
              <span>Project</span>
              <span>Owner</span>
              <span>Partition</span>
              <span>Level</span>
              <span>Progress &amp; team</span>
              <span>Status</span>
              <span>Priority</span>
              <span>Updated</span>
            </div>

            {visible.map((x) => {
              const sObj = st(x.status);
              const prObj = PRI[x.priority] || PRI.Medium;
              const teamMembers = people
                .filter((u) => u.team === x.team)
                .slice(0, 4);

              return (
                <button
                  key={x.id}
                  type="button"
                  onClick={() => onOpenProject(x.id)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns:
                      'minmax(230px, 2.2fr) 140px 110px 120px minmax(190px, 1.6fr) 100px 90px 80px',
                    gap: 16,
                    alignItems: 'center',
                    width: '100%',
                    padding: '12px 8px',
                    border: 0,
                    borderBottom: '1px solid var(--color-divider)',
                    background: 'transparent',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: 14,
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <span
                      style={{
                        width: 28,
                        height: 28,
                        flex: 'none',
                        background: projBg(x),
                        color: 'var(--on-solid)',
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: 10,
                        fontWeight: 800,
                        borderRadius: 'var(--r-sm)',
                      }}
                    >
                      {ini(x.name)}
                    </span>
                    <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-neutral-700)' }}>
                        {x.id}
                      </span>
                      <span style={{ fontWeight: 600 }}>{x.name}</span>
                    </span>
                  </span>

                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                    <span
                      title={x.owner}
                      style={{
                        width: 24,
                        height: 24,
                        flex: 'none',
                        background: avBg(x.owner),
                        color: 'var(--on-solid)',
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: 9,
                        fontWeight: 800,
                        borderRadius: 'var(--r-av)',
                      }}
                    >
                      {ini(x.owner)}
                    </span>
                    {x.owner}
                  </span>

                  <span>
                    <span
                      className="tag"
                      style={{ background: TN.blue.bg, color: TN.blue.fg, fontWeight: 700 }}
                    >
                      {x.partition}
                    </span>
                  </span>

                  <span style={{ fontSize: 13 }}>{x.level}</span>

                  <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
                          width: `${x.progress}%`,
                          background: sObj.sDot,
                        }}
                      />
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 800, width: 34 }}>
                      {x.progress}%
                    </span>
                    <span style={{ display: 'flex', gap: 2 }}>
                      {teamMembers.map((a) => (
                        <span
                          key={a.name}
                          title={a.name}
                          style={{
                            width: 22,
                            height: 22,
                            background: avBg(a.name),
                            color: 'var(--on-solid)',
                            display: 'grid',
                            placeItems: 'center',
                            fontSize: 9,
                            fontWeight: 800,
                            borderRadius: 'var(--r-av)',
                          }}
                        >
                          {ini(a.name)}
                        </span>
                      ))}
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

                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                    <Icon name="layers" size={16} style={{ stroke: prObj.c, strokeWidth: 2.5 }} />
                    {x.priority}
                  </span>

                  <span className="text-muted" style={{ fontSize: 13 }}>
                    {x.updated}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
