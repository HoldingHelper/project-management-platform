import React, { useState } from 'react';
import { Task, Project, TaskPriority, TaskStatus, TaskComment } from '../types';
import { Icon } from '../icons';
import { st, PRI, TYPE, TN, projBg, avBg, ini, dayStr, STATUSES, ME } from '../tokens';

interface TaskDrawerProps {
  task: Task | null;
  project: Project | null;
  comments: TaskComment[];
  onClose: () => void;
  onUpdateTask: (id: string, patch: Partial<Task>) => void;
  onAddComment: (taskId: string, text: string) => void;
  onOpenProject: (projectId: string) => void;
}

export function TaskDrawer({
  task,
  project,
  comments,
  onClose,
  onUpdateTask,
  onAddComment,
  onOpenProject,
}: TaskDrawerProps) {
  const [commentDraft, setCommentDraft] = useState('');
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [priMenuOpen, setPriMenuOpen] = useState(false);

  if (!task) return null;

  const ty = TYPE[task.type] || TYPE.Chore;
  const pr = PRI[task.priority] || PRI.Medium;
  const isAssignedToMe = task.assignees.includes(ME);
  const statusStyle = st(task.status);

  const handleCommentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentDraft.trim()) return;
    onAddComment(task.id, commentDraft.trim());
    setCommentDraft('');
  };

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
        aria-label="Task details"
        data-screen-label="Task detail"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          zIndex: 41,
          width: 'min(840px, 100vw)',
          background: 'var(--panel)',
          backdropFilter: 'var(--blur)',
          WebkitBackdropFilter: 'var(--blur)',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '0 16px 0 24px',
            minHeight: 60,
            borderBottom: '2px solid var(--color-divider)',
          }}
        >
          {project && (
            <>
              <button
                type="button"
                onClick={() => onOpenProject(project.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  border: 0,
                  background: 'transparent',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                  padding: '4px 0',
                  borderRadius: 'var(--r-sm)',
                }}
              >
                <span
                  style={{
                    width: 18,
                    height: 18,
                    background: projBg(project),
                    borderRadius: 'var(--r-sm)',
                  }}
                />
                {project.id} · {project.name}
              </button>
              <span className="text-muted">/</span>
            </>
          )}
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 800 }}>
            <span
              title={task.type}
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
              <Icon name={task.type === 'Feature' ? 'check' : task.type === 'Bug' ? 'target' : 'sparkles'} size={10} strokeWidth={3} />
            </span>
            {task.id}
          </span>
          <button
            type="button"
            className="btn btn-icon"
            aria-label="Close"
            onClick={onClose}
            style={{ marginLeft: 'auto', borderRadius: 'var(--r-sm)' }}
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        {/* Content body with responsive 2-column split */}
        <div
          data-m1="1"
          style={{
            flex: 1,
            overflow: 'auto',
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) 290px',
            alignItems: 'start',
          }}
        >
          <div
            style={{
              padding: 24,
              display: 'flex',
              flexDirection: 'column',
              gap: 24,
              minWidth: 0,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 28, lineHeight: 1.15, textWrap: 'balance' }}>
              {task.title}
            </h2>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <div data-dd="1" style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => setStatusMenuOpen(!statusMenuOpen)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    minHeight: 36,
                    padding: '0 12px',
                    border: 0,
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '.04em',
                    background: statusStyle.sBg,
                    color: statusStyle.sFg,
                    borderRadius: 'var(--r-sm)',
                  }}
                >
                  {task.status}
                  <Icon name="chevron" size={14} />
                </button>
                {statusMenuOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 4px)',
                      left: 0,
                      zIndex: 12,
                      minWidth: 200,
                      background: 'var(--panel)',
                      backdropFilter: 'var(--blur)',
                      WebkitBackdropFilter: 'var(--blur)',
                      border: '1px solid var(--color-divider)',
                      boxShadow: 'var(--shadow-md)',
                      padding: 4,
                      borderRadius: 'var(--r-lg)',
                    }}
                  >
                    {STATUSES.map((stName) => {
                      const stObj = st(stName);
                      return (
                        <button
                          key={stName}
                          type="button"
                          onClick={() => {
                            onUpdateTask(task.id, { status: stName as TaskStatus });
                            setStatusMenuOpen(false);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            width: '100%',
                            padding: '8px 10px',
                            border: 0,
                            background: 'transparent',
                            cursor: 'pointer',
                            textAlign: 'left',
                            fontSize: 14,
                            borderRadius: 'var(--r-sm)',
                          }}
                        >
                          <span
                            className="tag"
                            style={{
                              background: stObj.sBg,
                              color: stObj.sFg,
                              border: `1px solid ${stObj.sBd}`,
                              whiteSpace: 'nowrap',
                              fontSize: 11,
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              letterSpacing: '.04em',
                              padding: '2px 8px',
                              borderRadius: 'var(--r-xs)',
                            }}
                          >
                            {stName}
                          </span>
                          {task.status === stName && (
                            <span style={{ marginLeft: 'auto', color: 'var(--color-accent)' }}>✓</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={() =>
                  onUpdateTask(task.id, {
                    assignees: isAssignedToMe
                      ? task.assignees.filter((a) => a !== ME)
                      : [...task.assignees, ME],
                  })
                }
                style={{ minHeight: 36, borderRadius: 'var(--r-sm)' }}
              >
                <Icon name="userplus" size={15} />
                {isAssignedToMe ? 'Unassign me' : 'Assign to me'}
              </button>
            </div>

            <div>
              <h6 className="text-muted" style={{ marginBottom: 8 }}>
                Description
              </h6>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, textWrap: 'pretty' }}>
                {task.desc || 'No description yet.'}
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <h6 className="text-muted" style={{ margin: 0 }}>
                Comments · {comments.length}
              </h6>
              <form onSubmit={handleCommentSubmit} style={{ display: 'grid', gridTemplateColumns: '32px minmax(0, 1fr)', gap: 10 }}>
                <span
                  style={{
                    width: 32,
                    height: 32,
                    background: 'var(--color-text)',
                    color: 'var(--on-solid)',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 11,
                    fontWeight: 800,
                    borderRadius: 'var(--r-av)',
                  }}
                >
                  PA
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <textarea
                    className="input"
                    style={{ minHeight: 72 }}
                    placeholder="Add a comment…"
                    value={commentDraft}
                    onChange={(e) => setCommentDraft(e.target.value)}
                    aria-label="Add a comment"
                  />
                  <div>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={!commentDraft.trim()}
                    >
                      Save comment
                    </button>
                  </div>
                </div>
              </form>

              {comments.map((cm, idx) => (
                <div
                  key={idx}
                  style={{ display: 'grid', gridTemplateColumns: '32px minmax(0, 1fr)', gap: 10 }}
                >
                  <span
                    title={cm.who}
                    style={{
                      width: 32,
                      height: 32,
                      flex: 'none',
                      background: avBg(cm.who),
                      color: 'var(--on-solid)',
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: 11,
                      fontWeight: 800,
                      borderRadius: 'var(--r-av)',
                    }}
                  >
                    {ini(cm.who)}
                  </span>
                  <div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                      <b style={{ fontSize: 13 }}>{cm.who}</b>
                      <span className="text-muted" style={{ fontSize: 12 }}>
                        {cm.t}
                      </span>
                    </div>
                    <div style={{ fontSize: 14, lineHeight: 1.5 }}>{cm.text}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Details aside */}
          <aside
            data-dside="1"
            style={{
              padding: '24px 24px 24px 0',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <h6 className="text-muted" style={{ marginBottom: 8 }}>
              Details
            </h6>
            <div style={{ borderTop: '2px solid var(--color-divider)' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '96px minmax(0, 1fr)',
                  gap: 8,
                  padding: '10px 0',
                  borderBottom: '1px solid var(--color-divider)',
                  fontSize: 13,
                  alignItems: 'start',
                }}
              >
                <span className="text-muted" style={{ fontSize: 12, paddingTop: 4 }}>
                  Assignees
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {task.assignees.map((a) => (
                    <span key={a} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span
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
                      {a}
                    </span>
                  ))}
                  {task.assignees.length === 0 && (
                    <span className="text-muted">Unassigned</span>
                  )}
                </div>
              </div>

              {/* Priority */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '96px minmax(0, 1fr)',
                  gap: 8,
                  alignItems: 'center',
                  padding: '10px 0',
                  borderBottom: '1px solid var(--color-divider)',
                  fontSize: 13,
                }}
              >
                <span className="text-muted" style={{ fontSize: 12 }}>
                  Priority
                </span>
                <div data-dd="1" style={{ position: 'relative' }}>
                  <button
                    type="button"
                    onClick={() => setPriMenuOpen(!priMenuOpen)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      border: '1px solid transparent',
                      background: 'transparent',
                      padding: '4px 6px',
                      marginLeft: -6,
                      cursor: 'pointer',
                      fontSize: 13,
                      borderRadius: 'var(--r-sm)',
                    }}
                  >
                    <Icon name="layers" size={16} style={{ stroke: pr.c, strokeWidth: 2.5 }} />
                    {task.priority}
                    <Icon name="chevron" size={12} />
                  </button>
                  {priMenuOpen && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 'calc(100% + 4px)',
                        left: 0,
                        zIndex: 12,
                        minWidth: 160,
                        background: 'var(--panel)',
                        backdropFilter: 'var(--blur)',
                        WebkitBackdropFilter: 'var(--blur)',
                        border: '1px solid var(--color-divider)',
                        boxShadow: 'var(--shadow-md)',
                        padding: 4,
                        borderRadius: 'var(--r-lg)',
                      }}
                    >
                      {(['Critical', 'High', 'Medium', 'Low'] as TaskPriority[]).map((priKey) => (
                        <button
                          key={priKey}
                          type="button"
                          onClick={() => {
                            onUpdateTask(task.id, { priority: priKey });
                            setPriMenuOpen(false);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            width: '100%',
                            padding: '8px 10px',
                            border: 0,
                            background: 'transparent',
                            cursor: 'pointer',
                            textAlign: 'left',
                            fontSize: 14,
                            borderRadius: 'var(--r-sm)',
                          }}
                        >
                          <Icon name="layers" size={16} style={{ stroke: PRI[priKey].c, strokeWidth: 2.5 }} />
                          {priKey}
                          {task.priority === priKey && (
                            <span style={{ marginLeft: 'auto', color: 'var(--color-accent)' }}>✓</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Type */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '96px minmax(0, 1fr)',
                  gap: 8,
                  alignItems: 'center',
                  padding: '10px 0',
                  borderBottom: '1px solid var(--color-divider)',
                  fontSize: 13,
                }}
              >
                <span className="text-muted" style={{ fontSize: 12 }}>
                  Type
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    title={task.type}
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
                    <Icon name={task.type === 'Feature' ? 'check' : task.type === 'Bug' ? 'target' : 'sparkles'} size={10} strokeWidth={3} />
                  </span>
                  {task.type}
                </span>
              </div>

              {/* Partition */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '96px minmax(0, 1fr)',
                  gap: 8,
                  alignItems: 'center',
                  padding: '10px 0',
                  borderBottom: '1px solid var(--color-divider)',
                  fontSize: 13,
                }}
              >
                <span className="text-muted" style={{ fontSize: 12 }}>
                  Partition
                </span>
                <span>
                  <span className="tag" style={{ background: TN.blue.bg, color: TN.blue.fg, fontWeight: 700 }}>
                    {task.partition}
                  </span>
                </span>
              </div>

              {/* Labels */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '96px minmax(0, 1fr)',
                  gap: 8,
                  alignItems: 'center',
                  padding: '10px 0',
                  borderBottom: '1px solid var(--color-divider)',
                  fontSize: 13,
                }}
              >
                <span className="text-muted" style={{ fontSize: 12 }}>
                  Labels
                </span>
                <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {task.labels.map((l) => (
                    <span
                      key={l}
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        padding: '2px 6px',
                        background: 'var(--color-neutral-200)',
                        borderRadius: 'var(--r-xs)',
                      }}
                    >
                      {l}
                    </span>
                  ))}
                </span>
              </div>

              {/* Due date */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '96px minmax(0, 1fr)',
                  gap: 8,
                  alignItems: 'center',
                  padding: '10px 0',
                  borderBottom: '1px solid var(--color-divider)',
                  fontSize: 13,
                }}
              >
                <span className="text-muted" style={{ fontSize: 12 }}>
                  Due
                </span>
                <span>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      padding: '2px 6px',
                      background: 'var(--color-neutral-200)',
                      color: 'inherit',
                      borderRadius: 'var(--r-xs)',
                    }}
                  >
                    {task.e == null ? 'No date' : dayStr(task.e)}
                  </span>
                </span>
              </div>

              {/* Additional fields */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '96px minmax(0, 1fr)',
                  gap: 8,
                  alignItems: 'center',
                  padding: '10px 0',
                  borderBottom: '1px solid var(--color-divider)',
                  fontSize: 13,
                }}
              >
                <span className="text-muted" style={{ fontSize: 12 }}>
                  Start
                </span>
                <span>{task.s == null ? '—' : dayStr(task.s)}</span>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '96px minmax(0, 1fr)',
                  gap: 8,
                  alignItems: 'center',
                  padding: '10px 0',
                  borderBottom: '1px solid var(--color-divider)',
                  fontSize: 13,
                }}
              >
                <span className="text-muted" style={{ fontSize: 12 }}>
                  Source
                </span>
                <span>{task.source}</span>
              </div>
            </div>
          </aside>
        </div>
      </aside>
    </>
  );
}
