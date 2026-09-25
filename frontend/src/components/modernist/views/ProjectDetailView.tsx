import React from 'react';
import { Project, Task, Person, TaskStatus } from '../types';
import { Icon } from '../icons';
import {
  st,
  stT,
  TN,
  PRI,
  TYPE,
  ini,
  avBg,
  dayStr,
} from '../tokens';
import { KanbanBoardView } from './KanbanBoardView';

interface ProjectDetailViewProps {
  project: Project;
  tasks: Task[];
  people: Person[];
  teamName?: string;
  activeTab?: 'Board' | 'List' | 'Overview';
  searchQuery?: string;
  filterAssignee?: string | null;
  onTabChange?: (tab: 'Board' | 'List' | 'Overview') => void;
  onSearchChange?: (q: string) => void;
  onSelectAssignee?: (name: string | null) => void;
  onClearFilters?: () => void;
  onOpenTask: (id: string) => void;
  onOpenPerson: (name: string) => void;
  onAddTask?: (status?: string) => void;
  onMoveTask?: (taskId: string, newStatus: string) => void;
  onUpdateTask?: (id: string, patch: Partial<Task>) => void;
  onOpenCreateTask?: (status?: string) => void;
}

export function ProjectDetailView({
  project,
  tasks,
  people,
  teamName = 'Platform',
  activeTab: propActiveTab,
  searchQuery: propSearchQuery,
  filterAssignee: propFilterAssignee,
  onTabChange: propOnTabChange,
  onSearchChange: propOnSearchChange,
  onSelectAssignee: propOnSelectAssignee,
  onClearFilters: propOnClearFilters,
  onOpenTask,
  onOpenPerson,
  onAddTask,
  onMoveTask,
  onUpdateTask,
  onOpenCreateTask,
}: ProjectDetailViewProps) {
  const [localActiveTab, setLocalActiveTab] = React.useState<'Board' | 'List' | 'Overview'>('Board');
  const [localSearchQuery, setLocalSearchQuery] = React.useState('');
  const [localFilterAssignee, setLocalFilterAssignee] = React.useState<string | null>(null);

  const activeTab = propActiveTab !== undefined ? propActiveTab : localActiveTab;
  const searchQuery = propSearchQuery !== undefined ? propSearchQuery : localSearchQuery;
  const filterAssignee = propFilterAssignee !== undefined ? propFilterAssignee : localFilterAssignee;

  const onTabChange = propOnTabChange || setLocalActiveTab;
  const onSearchChange = propOnSearchChange || setLocalSearchQuery;
  const onSelectAssignee = propOnSelectAssignee || setLocalFilterAssignee;
  const onClearFilters = propOnClearFilters || (() => { setLocalSearchQuery(''); setLocalFilterAssignee(null); });
  const handleAddTask = onAddTask || onOpenCreateTask || (() => {});
  const handleMoveTask = onMoveTask || ((tId: string, s: string) => onUpdateTask?.(tId, { status: s as TaskStatus }));

  const pTasks = tasks.filter((t) => t.project === project.id);
  const q = searchQuery.trim().toLowerCase();
  const filteredTasks = pTasks.filter(
    (t) =>
      (!q || `${t.id} ${t.title}`.toLowerCase().includes(q)) &&
      (!filterAssignee || t.assignees.includes(filterAssignee))
  );

  const teamMembers = people.filter((u) => u.team === project.team);
  const distinctAssignees = [...new Set(pTasks.flatMap((t) => t.assignees))];

  const statusCategories = ['To do', 'In progress', 'In review', 'Blocked', 'Done'];
  const dist = statusCategories.map((k) => {
    const n = pTasks.filter((t) =>
      k === 'To do' ? ['To do', 'Backlog'].includes(t.status) : t.status === k
    ).length;
    return {
      l: k,
      n,
      w: `${pTasks.length ? (n / pTasks.length) * 100 : 0}%`,
      c: stT(k).solid,
    };
  });

  const riskKey = project.status === 'Blocked' ? 'Blocked' : 'At risk';
  const riskTone = stT(riskKey);

  return (
    <div
      data-screen-label="Project detail"
      style={{ display: 'flex', flexDirection: 'column', gap: 20 }}
    >
      {/* Sub-header with tabs, search, and member filters */}
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
          {[
            { id: 'Board', label: 'Board', count: pTasks.length },
            { id: 'List', label: 'List', count: pTasks.length },
            { id: 'Overview', label: 'Overview', count: '' },
          ].map((tb) => {
            const on = activeTab === tb.id;
            return (
              <button
                key={tb.id}
                role="tab"
                type="button"
                onClick={() => onTabChange(tb.id as any)}
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
                  color: on
                    ? 'var(--color-text)'
                    : 'color-mix(in srgb, var(--color-text) 60%, transparent)',
                }}
              >
                {tb.label}{' '}
                {tb.count !== '' && (
                  <span style={{ opacity: 0.55, fontWeight: 400 }}>{tb.count}</span>
                )}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', width: 220 }}>
            <Icon
              name="search"
              size={15}
              style={{
                position: 'absolute',
                left: 10,
                top: 11,
                opacity: 0.55,
              }}
            />
            <input
              className="input"
              style={{ minHeight: 36, paddingLeft: 32 }}
              placeholder="Search this project"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              aria-label="Search this project"
            />
          </div>

          <div style={{ display: 'flex', gap: 3 }}>
            {distinctAssignees.map((name) => {
              const on = filterAssignee === name;
              return (
                <button
                  key={name}
                  type="button"
                  title={name}
                  onClick={() => onSelectAssignee(on ? null : name)}
                  style={{
                    width: 32,
                    height: 32,
                    border: 0,
                    padding: 0,
                    cursor: 'pointer',
                    background: avBg(name),
                    color: 'var(--on-solid)',
                    fontSize: 11,
                    fontWeight: 800,
                    outline: on ? '2px solid var(--color-accent)' : 'none',
                    outlineOffset: 1,
                    opacity: filterAssignee && !on ? 0.45 : 1,
                    borderRadius: 'var(--r-av)',
                  }}
                >
                  {ini(name)}
                </button>
              );
            })}
          </div>

          {(searchQuery || filterAssignee) && (
            <button type="button" className="btn btn-ghost" onClick={onClearFilters}>
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Tab 1: Board View */}
      {activeTab === 'Board' && (
        <KanbanBoardView
          tasks={filteredTasks}
          onOpenTask={onOpenTask}
          onAddTask={handleAddTask}
          onMoveTask={handleMoveTask}
        />
      )}

      {/* Tab 2: List View */}
      {activeTab === 'List' && (
        <section style={{ display: 'flex', flexDirection: 'column', marginTop: -8, overflowX: 'auto' }}>
          <div style={{ minWidth: 680, display: 'flex', flexDirection: 'column' }}>
            {filteredTasks.map((t) => {
              const ty = TYPE[t.type] || TYPE.Chore;
              const sObj = st(t.status);
              const prObj = PRI[t.priority] || PRI.Medium;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onOpenTask(t.id)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '96px minmax(0, 1fr) 110px 100px 90px 120px',
                    gap: 12,
                    alignItems: 'center',
                    padding: '12px 4px',
                    border: 0,
                    borderBottom: '1px solid var(--color-divider)',
                    background: 'transparent',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: 14,
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
                  <span style={{ fontWeight: 600 }}>{t.title}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                    <Icon name="layers" size={16} style={{ stroke: prObj.c, strokeWidth: 2.5 }} />
                    {t.priority}
                  </span>
                  <span style={{ display: 'flex', gap: 2 }}>
                    {t.assignees.map((a) => (
                      <span
                        key={a}
                        title={a}
                        style={{
                          width: 24,
                          height: 24,
                          flex: 'none',
                          background: avBg(a),
                          color: 'var(--on-solid)',
                          display: 'grid',
                          placeItems: 'center',
                          fontSize: 9,
                          fontWeight: 800,
                          borderRadius: 'var(--r-av)',
                        }}
                      >
                        {ini(a)}
                      </span>
                    ))}
                  </span>
                  <span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '2px 6px',
                        background: 'var(--color-neutral-200)',
                        borderRadius: 'var(--r-xs)',
                      }}
                    >
                      {t.e == null ? 'No date' : dayStr(t.e)}
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
                      {t.status}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          {filteredTasks.length === 0 && (
            <p className="text-muted" style={{ padding: '20px 4px', margin: 0 }}>
              No tasks match. Clear the filters or create one.
            </p>
          )}
        </section>
      )}

      {/* Tab 3: Overview View */}
      {activeTab === 'Overview' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 40, alignItems: 'flex-start', marginTop: -8 }}>
          <section
            style={{
              flex: '1 1 520px',
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 28,
            }}
          >
            <div>
              <h6 className="text-muted" style={{ marginBottom: 10 }}>
                Work by status
              </h6>
              <div
                style={{
                  display: 'flex',
                  height: 14,
                  background: 'var(--color-neutral-200)',
                  borderRadius: 'var(--r-bar)',
                  overflow: 'hidden',
                }}
              >
                {dist.map((d) => (
                  <span key={d.l} title={d.l} style={{ width: d.w, background: d.c }} />
                ))}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 10 }}>
                {dist.map((d) => (
                  <span key={d.l} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        background: d.c,
                        borderRadius: 'var(--r-av)',
                      }}
                    />
                    {d.l} <b>{d.n}</b>
                  </span>
                ))}
              </div>
            </div>

            {project.risk && (
              <div
                style={{
                  background: riskTone.bg,
                  borderTop: `3px solid ${riskTone.solid}`,
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  borderRadius: 'var(--r-md)',
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: '.08em',
                    textTransform: 'uppercase',
                    color: riskTone.fg,
                  }}
                >
                  Risk
                </span>
                <span style={{ fontSize: 14 }}>{project.risk}</span>
              </div>
            )}

            <div>
              <h6 className="text-muted" style={{ marginBottom: 8 }}>
                Team
              </h6>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                  borderTop: '1px solid var(--color-divider)',
                }}
              >
                {teamMembers.map((m) => (
                  <button
                    key={m.name}
                    type="button"
                    onClick={() => onOpenPerson(m.name)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 0',
                      border: 0,
                      borderBottom: '1px solid var(--color-divider)',
                      background: 'transparent',
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    <span
                      title={m.name}
                      style={{
                        width: 32,
                        height: 32,
                        flex: 'none',
                        background: avBg(m.name),
                        color: 'var(--on-solid)',
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: 11,
                        fontWeight: 800,
                        borderRadius: 'var(--r-av)',
                      }}
                    >
                      {ini(m.name)}
                    </span>
                    <span style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: 14, fontWeight: 600 }}>{m.name}</span>
                      <span className="text-muted" style={{ fontSize: 11 }}>
                        {m.role}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Aside attributes */}
          <aside style={{ flex: '0 1 320px', borderTop: '2px solid var(--color-divider)' }}>
            {[
              ['Owner', project.owner],
              ['Team', teamName || '—'],
              ['Partition', project.partition],
              ['Level', project.level],
              ['Priority', project.priority],
              ['Schedule', `${dayStr(project.s)} – ${dayStr(project.e)}`],
              ['Milestone', dayStr(project.m)],
              ['Depends on', project.dep || '—'],
              ...(project.risk ? [['Risk', project.risk]] : []),
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
                <span>{v}</span>
              </div>
            ))}
          </aside>
        </div>
      )}
    </div>
  );
}
