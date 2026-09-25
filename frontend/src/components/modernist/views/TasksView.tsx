import React, { useState } from 'react';
import { Task, Project, Person, TaskStatus } from '../types';
import { Icon } from '../icons';
import {
  st,
  TN,
  TYPE,
  PRI,
  STATUSES,
  ini,
  avBg,
  dayStr,
  d2i,
  TODAY,
  ME,
} from '../tokens';
import { KanbanBoardView } from './KanbanBoardView';

interface TasksViewProps {
  tasks: Task[];
  projects: Project[];
  people: Person[];
  partitions?: string[];
  partsList?: string[];
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  onOpenTask: (id: string) => void;
  onAddTask?: (status?: string) => void;
  onMoveTask?: (taskId: string, newStatus: string) => void;
  onUpdateTask?: (id: string, patch: Partial<Task>) => void;
  onOpenCreateTask?: (status?: string) => void;
}

const SAVED_FILTERS: Record<string, (t: Task) => boolean> = {
  'Due this week': (t) =>
    t.e != null && t.e >= TODAY && t.e <= TODAY + 7 && t.status !== 'Done',
  'High priority': (t) => t.priority === 'High' || t.priority === 'Critical',
  'GitHub imports': (t) => t.source === 'GitHub',
  Unassigned: (t) => !t.assignees.length,
};

const TAB_FILTERS: Record<string, (t: Task) => boolean> = {
  all: () => true,
  mine: (t) => t.assignees.includes(ME),
  open: (t) => t.status !== 'Done',
  review: (t) => t.status === 'In review',
  blocked: (t) => t.status === 'Blocked',
  done: (t) => t.status === 'Done',
};

export function TasksView({
  tasks,
  projects,
  people,
  partitions,
  partsList = ['Tech', 'Operations', 'Business', 'Marketing', 'Sales', 'Design'],
  activeTab: propActiveTab,
  onTabChange: propOnTabChange,
  onOpenTask,
  onAddTask,
  onMoveTask,
  onUpdateTask,
  onOpenCreateTask,
}: TasksViewProps) {
  const [localActiveTab, setLocalActiveTab] = useState('all');
  const activeTab = propActiveTab !== undefined ? propActiveTab : localActiveTab;
  const onTabChange = propOnTabChange || setLocalActiveTab;
  const activePartitions = partitions || partsList;
  const handleAddTask = onAddTask || onOpenCreateTask || (() => {});
  const handleMoveTask = onMoveTask || ((tId: string, s: string) => onUpdateTask?.(tId, { status: s as TaskStatus }));

  const [taskView, setTaskView] = useState<'List' | 'Board' | 'Monthly'>('List');
  const [savedFilter, setSavedFilter] = useState<string | null>(null);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [calMonth, setCalMonth] = useState<'Sep' | 'Oct'>('Sep');

  // Filter state
  const [q, setQ] = useState('');
  const [fPart, setFPart] = useState<string | null>(null);
  const [fProj, setFProj] = useState<string | null>(null);
  const [fAssignee, setFAssignee] = useState<string | null>(null);
  const [fLabel, setFLabel] = useState<string | null>(null);
  const [fStatus, setFStatus] = useState<string | null>(null);
  const [fFrom, setFFrom] = useState('');
  const [fTo, setFTo] = useState('');
  const [fBacklog, setFBacklog] = useState(false);

  const cleanQ = q.trim().toLowerCase();
  const fromI = d2i(fFrom);
  const toI = d2i(fTo);

  const filteredTasks = tasks.filter((t) => {
    if (cleanQ && !`${t.id} ${t.title}`.toLowerCase().includes(cleanQ)) return false;
    if (fPart && t.partition !== fPart) return false;
    if (fProj && t.project !== fProj) return false;
    if (fAssignee && !t.assignees.includes(fAssignee)) return false;
    if (fLabel && !t.labels.includes(fLabel)) return false;
    if (fStatus && t.status !== fStatus) return false;
    if (fromI != null && (t.e == null || t.e < fromI)) return false;
    if (toI != null && (t.e == null || t.e > toI)) return false;
    if (fBacklog && t.project) return false;
    if (savedFilter && !SAVED_FILTERS[savedFilter]?.(t)) return false;
    return true;
  });

  const tabMatchedTasks = filteredTasks.filter(
    TAB_FILTERS[activeTab] || TAB_FILTERS.all
  );

  const hasAnyFilter = !!(
    cleanQ ||
    fPart ||
    fProj ||
    fAssignee ||
    fLabel ||
    fStatus ||
    fFrom ||
    fTo ||
    fBacklog ||
    savedFilter
  );

  const clearAllFilters = () => {
    setQ('');
    setFPart(null);
    setFProj(null);
    setFAssignee(null);
    setFLabel(null);
    setFStatus(null);
    setFFrom('');
    setFTo('');
    setFBacklog(false);
    setSavedFilter(null);
    setPage(0);
  };

  const PS = 10;
  const totalPages = Math.max(1, Math.ceil(tabMatchedTasks.length / PS));
  const currentPage = Math.min(page, totalPages - 1);
  const paginatedTasks = tabMatchedTasks.slice(
    currentPage * PS,
    currentPage * PS + PS
  );

  const uniq = (arr: string[]) => [...new Set(arr)].sort();
  const distinctAssignees = uniq(tasks.flatMap((t) => t.assignees));
  const distinctLabels = uniq(tasks.flatMap((t) => t.labels));

  const filterConfigs: [string, string, string[], string | null, (v: string | null) => void][] = [
    ['partition', 'Partition', activePartitions, fPart, setFPart],
    ['project', 'Project', projects.map((p) => p.id), fProj, setFProj],
    ['assignee', 'Assignee', distinctAssignees, fAssignee, setFAssignee],
    ['label', 'Label', distinctLabels, fLabel, setFLabel],
    ['status', 'Status', STATUSES, fStatus, setFStatus],
  ];

  // Calendar cells calculation
  const isSep = calMonth === 'Sep';
  const mOff = isSep ? 0 : 30;
  const mLen = isSep ? 30 : 31;
  const lead = isSep ? 1 : 3;
  const calCells: any[] = [];
  for (let i = 0; i < lead; i++) {
    calCells.push({ n: '', bg: 'var(--color-surface)', items: [] });
  }
  for (let d = 0; d < mLen; d++) {
    const di = mOff + d;
    const isToday = di === TODAY;
    calCells.push({
      n: d + 1,
      bg: isToday ? TN.blue.bg : 'transparent',
      numBg: isToday ? 'var(--color-accent)' : 'transparent',
      numFg: isToday ? 'var(--on-solid)' : 'var(--color-text)',
      items: tabMatchedTasks.filter((t) => t.e === di),
    });
  }
  while (calCells.length % 7) {
    calCells.push({ n: '', bg: 'var(--color-surface)', items: [] });
  }

  return (
    <div data-screen-label="Tasks" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Tabs and view switch */}
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
            { id: 'all', label: 'All tasks' },
            { id: 'mine', label: 'Assigned to me' },
            { id: 'open', label: 'Open' },
            { id: 'review', label: 'In review' },
            { id: 'blocked', label: 'Blocked' },
            { id: 'done', label: 'Done' },
          ].map((tb) => {
            const on = activeTab === tb.id;
            const count = filteredTasks.filter(TAB_FILTERS[tb.id] || TAB_FILTERS.all).length;
            return (
              <button
                key={tb.id}
                role="tab"
                type="button"
                onClick={() => {
                  onTabChange(tb.id);
                  setPage(0);
                }}
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
                {tb.label} <span style={{ opacity: 0.55, fontWeight: 400 }}>{count}</span>
              </button>
            );
          })}
        </div>

        <div className="seg" style={{ marginBottom: 8 }}>
          {(['List', 'Board', 'Monthly'] as const).map((vm) => (
            <button
              key={vm}
              type="button"
              className="seg-opt"
              onClick={() => setTaskView(vm)}
              style={{
                border: 0,
                background: taskView === vm ? 'var(--color-accent)' : 'transparent',
                color: taskView === vm ? 'var(--on-solid)' : 'var(--color-text)',
                minHeight: 36,
                fontWeight: 600,
              }}
            >
              {vm}
            </button>
          ))}
        </div>
      </div>

      {/* Saved filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <span
          className="text-muted"
          style={{ fontSize: 12, letterSpacing: '.06em', textTransform: 'uppercase', marginRight: 4 }}
        >
          Saved filters
        </span>
        {Object.keys(SAVED_FILTERS).map((sk) => {
          const on = savedFilter === sk;
          return (
            <button
              key={sk}
              type="button"
              onClick={() => {
                setSavedFilter(on ? null : sk);
                setPage(0);
              }}
              style={{
                padding: '7px 12px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                border: `1px solid ${on ? TN.blue.solid : 'var(--color-divider)'}`,
                background: on ? TN.blue.bg : 'transparent',
                color: on ? TN.blue.fg : 'var(--color-text)',
                borderRadius: 'var(--r-sm)',
              }}
            >
              {sk}
            </button>
          );
        })}
      </div>

      {/* Filters bar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 300 }}>
          <Icon
            name="search"
            size={16}
            style={{ position: 'absolute', left: 12, top: 14, opacity: 0.55 }}
          />
          <input
            className="input"
            style={{ minHeight: 44, paddingLeft: 36 }}
            placeholder="Search title…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
            aria-label="Search tasks"
          />
        </div>

        {filterConfigs.map(([k, label, opts, val, setter]) => {
          const on = !!val;
          const isOpen = openDropdown === k;
          return (
            <div key={k} data-dd="1" style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setOpenDropdown(isOpen ? null : k)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  minHeight: 44,
                  padding: '0 12px',
                  cursor: 'pointer',
                  fontSize: 14,
                  border: `1px solid ${on ? TN.blue.solid : 'var(--color-divider)'}`,
                  background: on ? TN.blue.bg : 'transparent',
                  color: on ? TN.blue.fg : 'var(--color-text)',
                  borderRadius: 'var(--r-sm)',
                }}
              >
                {on ? `${label}: ${val}` : label}
                <Icon name="chevron" size={14} />
              </button>
              {isOpen && (
                <div
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 4px)',
                    left: 0,
                    zIndex: 12,
                    minWidth: 220,
                    maxHeight: 300,
                    overflow: 'auto',
                    background: 'var(--panel)',
                    backdropFilter: 'var(--blur)',
                    WebkitBackdropFilter: 'var(--blur)',
                    border: '1px solid var(--color-divider)',
                    boxShadow: 'var(--shadow-md)',
                    padding: 4,
                    borderRadius: 'var(--r-lg)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setter(null);
                      setOpenDropdown(null);
                      setPage(0);
                    }}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 12,
                      width: '100%',
                      padding: '8px 10px',
                      border: 0,
                      background: 'transparent',
                      textAlign: 'left',
                      cursor: 'pointer',
                      fontSize: 14,
                      fontWeight: on ? 400 : 700,
                      borderRadius: 'var(--r-sm)',
                    }}
                  >
                    <span>Any {label.toLowerCase()}</span>
                    {!on && <span style={{ color: 'var(--color-accent)' }}>✓</span>}
                  </button>
                  {opts.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => {
                        setter(opt);
                        setOpenDropdown(null);
                        setPage(0);
                      }}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 12,
                        width: '100%',
                        padding: '8px 10px',
                        border: 0,
                        background: 'transparent',
                        textAlign: 'left',
                        cursor: 'pointer',
                        fontSize: 14,
                        fontWeight: val === opt ? 700 : 400,
                        borderRadius: 'var(--r-sm)',
                      }}
                    >
                      <span>{opt}</span>
                      {val === opt && <span style={{ color: 'var(--color-accent)' }}>✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        <input
          type="date"
          className="input"
          aria-label="Due from"
          style={{ width: 'auto', minHeight: 44 }}
          value={fFrom}
          onChange={(e) => {
            setFFrom(e.target.value);
            setPage(0);
          }}
        />
        <input
          type="date"
          className="input"
          aria-label="Due to"
          style={{ width: 'auto', minHeight: 44 }}
          value={fTo}
          onChange={(e) => {
            setFTo(e.target.value);
            setPage(0);
          }}
        />
      </div>

      {/* Backlog only & Clear filters row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={fBacklog}
            onChange={(e) => {
              setFBacklog(e.target.checked);
              setPage(0);
            }}
            style={{
              accentColor: 'var(--color-accent)',
              width: 16,
              height: 16,
              margin: 0,
            }}
          />
          Backlog only (no project)
        </label>
        {hasAnyFilter && (
          <button type="button" className="btn btn-ghost" onClick={clearAllFilters}>
            Clear all filters
          </button>
        )}
      </div>

      {/* View 1: List View */}
      {taskView === 'List' && (
        <>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 1180 }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns:
                    'minmax(240px, 2.4fr) 100px 150px 100px 90px 90px 90px 120px 70px',
                  gap: 14,
                  padding: 8,
                  borderBottom: '2px solid var(--color-divider)',
                  fontSize: 11,
                  letterSpacing: '.08em',
                  textTransform: 'uppercase',
                  color: 'color-mix(in srgb, var(--color-text) 60%, transparent)',
                }}
              >
                <span>Task</span>
                <span>Partition</span>
                <span>Labels</span>
                <span>Status</span>
                <span>Type</span>
                <span>Priority</span>
                <span>Assignees</span>
                <span>Dates</span>
                <span>Project</span>
              </div>

              {paginatedTasks.map((t) => {
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
                      gridTemplateColumns:
                        'minmax(240px, 2.4fr) 100px 150px 100px 90px 90px 90px 120px 70px',
                      gap: 14,
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
                    <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                      <span
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: 11,
                          fontWeight: 700,
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
                        {t.id} · {t.source}
                      </span>
                      <span style={{ fontWeight: 600 }}>{t.title}</span>
                    </span>

                    <span>{t.partition}</span>

                    <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {t.labels.map((l) => (
                        <span
                          key={l}
                          style={{
                            fontSize: 11,
                            padding: '1px 6px',
                            border: '1px solid var(--color-divider)',
                            borderRadius: 'var(--r-xs)',
                          }}
                        >
                          {l}
                        </span>
                      ))}
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

                    <span style={{ fontSize: 13 }}>{t.type}</span>

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
                      {t.assignees.length === 0 && (
                        <span className="text-muted" style={{ fontSize: 12 }}>
                          Unassigned
                        </span>
                      )}
                    </span>

                    <span className="text-muted" style={{ fontSize: 12 }}>
                      {t.s == null ? '—' : `${dayStr(t.s)} – ${dayStr(t.e)}`}
                    </span>

                    <span style={{ fontSize: 12, fontWeight: 800 }}>
                      {t.project || '—'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {tabMatchedTasks.length === 0 && (
            <div style={{ padding: '32px 8px' }}>
              <h4 style={{ margin: '0 0 4px' }}>No tasks match</h4>
              <p className="text-muted" style={{ margin: 0, fontSize: 14 }}>
                Change the tab, saved filter or filters above.
              </p>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>
            <span className="text-muted" style={{ fontSize: 13, marginRight: 8 }}>
              {tabMatchedTasks.length
                ? `${currentPage * PS + 1}–${Math.min(
                    tabMatchedTasks.length,
                    currentPage * PS + PS
                  )} of ${tabMatchedTasks.length}`
                : '0 tasks'}
            </span>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
            >
              Previous
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={currentPage >= totalPages - 1}
              onClick={() => setPage(currentPage + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}

      {/* View 2: Board View */}
      {taskView === 'Board' && (
        <KanbanBoardView
          tasks={tabMatchedTasks}
          onOpenTask={onOpenTask}
          onAddTask={handleAddTask}
          onMoveTask={handleMoveTask}
        />
      )}

      {/* View 3: Monthly View */}
      {taskView === 'Monthly' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="seg">
              {(['Sep', 'Oct'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  className="seg-opt"
                  onClick={() => setCalMonth(m)}
                  style={{
                    border: 0,
                    background: calMonth === m ? 'var(--color-accent)' : 'transparent',
                    color: calMonth === m ? 'var(--on-solid)' : 'var(--color-text)',
                    minHeight: 36,
                    fontWeight: 600,
                  }}
                >
                  {m} 2026
                </button>
              ))}
            </div>
            <span className="text-muted" style={{ fontSize: 13 }}>
              Tasks placed on their due date.
            </span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <div
              style={{
                minWidth: 840,
                borderTop: '2px solid var(--color-divider)',
                borderLeft: '1px solid var(--color-divider)',
              }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((w) => (
                  <span
                    key={w}
                    className="text-muted"
                    style={{
                      padding: 8,
                      fontSize: 11,
                      letterSpacing: '.08em',
                      textTransform: 'uppercase',
                      borderRight: '1px solid var(--color-divider)',
                      borderBottom: '2px solid var(--color-divider)',
                    }}
                  >
                    {w}
                  </span>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
                {calCells.map((d, di) => (
                  <div
                    key={di}
                    style={{
                      minHeight: 112,
                      padding: 6,
                      borderRight: '1px solid var(--color-divider)',
                      borderBottom: '1px solid var(--color-divider)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                      background: d.bg,
                    }}
                  >
                    {d.n !== '' && (
                      <span
                        style={{
                          alignSelf: 'flex-start',
                          fontSize: 12,
                          fontWeight: 800,
                          padding: '1px 5px',
                          background: d.numBg,
                          color: d.numFg,
                          borderRadius: 'var(--r-xs)',
                        }}
                      >
                        {d.n}
                      </span>
                    )}
                    {d.items.map((t: Task) => {
                      const sObj = st(t.status);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => onOpenTask(t.id)}
                          title={t.title}
                          style={{
                            display: 'block',
                            width: '100%',
                            textAlign: 'left',
                            border: 0,
                            padding: '3px 5px',
                            fontSize: 11,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            background: sObj.sBg,
                            color: sObj.sFg,
                            outline: `1px solid ${sObj.sBd}`,
                            outlineOffset: -1,
                            borderRadius: 'var(--r-xs)',
                          }}
                        >
                          <b>{t.id}</b> {t.title}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
