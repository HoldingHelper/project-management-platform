import React, { useState } from 'react';
import { Project, Task, TaskPriority, TaskStatus, TaskType } from '../types';
import { Icon } from '../icons';
import { TYPE, STATUSES, PRI, TN, st, ini, avBg, i2d, d2i, TODAY } from '../tokens';

interface CreateTaskDialogProps {
  projects: Project[];
  partitions: string[];
  people: { name: string; team: string | null; kind: string }[];
  initialProject?: string;
  initialAssignees?: string[];
  initialStatus?: string;
  onClose: () => void;
  onCreateTask: (newTask: Omit<Task, 'id'>, createAnother: boolean) => void;
}

export function CreateTaskDialog({
  projects,
  partitions,
  people,
  initialProject = '',
  initialAssignees = [],
  initialStatus = 'To do',
  onClose,
  onCreateTask,
}: CreateTaskDialogProps) {
  const [project, setProject] = useState(initialProject);
  const [partition, setPartition] = useState(
    projects.find((p) => p.id === initialProject)?.partition || 'Tech'
  );
  const [type, setType] = useState<TaskType>('Feature');
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [status, setStatus] = useState<TaskStatus>(
    (initialStatus as TaskStatus) || 'To do'
  );
  const [priority, setPriority] = useState<TaskPriority>('Medium');
  const [assignees, setAssignees] = useState<string[]>(initialAssignees);
  const [labels, setLabels] = useState<string[]>([]);
  const [labelDraft, setLabelDraft] = useState('');
  const [pq, setPq] = useState('');
  const [start, setStart] = useState(i2d(TODAY));
  const [due, setDue] = useState(i2d(TODAY + 7));
  const [another, setAnother] = useState(false);
  const [error, setError] = useState('');

  const currentProject = projects.find((p) => p.id === project);

  const pool = people.filter((u) => !assignees.includes(u.name));
  const cleanPq = pq.trim().toLowerCase();
  const suggestions = cleanPq
    ? pool.filter((u) => u.name.toLowerCase().includes(cleanPq))
    : pool.filter((u) =>
        currentProject
          ? u.team === currentProject.team || u.name === 'Platform Admin'
          : u.name === 'Platform Admin' || u.kind === 'lead'
      );

  const addAssignee = (name: string) => {
    setAssignees([...assignees, name]);
    setPq('');
  };

  const removeAssignee = (name: string) => {
    setAssignees(assignees.filter((a) => a !== name));
  };

  const handleLabelKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = labelDraft.trim().toLowerCase().replace(/\s+/g, '-');
      if (val && !labels.includes(val)) {
        setLabels([...labels, val]);
      }
      setLabelDraft('');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Add a summary so the task can be found later.');
      return;
    }
    const si = d2i(start);
    const ei = d2i(due);
    if (si != null && ei != null && ei < si) {
      setError('The due date is before the start date.');
      return;
    }

    onCreateTask(
      {
        title: title.trim(),
        project: project || null,
        partition,
        type,
        status,
        priority,
        assignees,
        labels,
        s: si,
        e: ei,
        source: 'In-app',
        desc: desc.trim(),
      },
      another
    );

    if (another) {
      setTitle('');
      setDesc('');
      setLabels([]);
      setError('');
    }
  };

  return (
    <div
      onClick={onClose}
      data-dlg="1"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background: 'color-mix(in srgb, var(--color-text) 45%, transparent)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        padding: '5vh 16px',
        overflow: 'auto',
        boxSizing: 'border-box',
      }}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        noValidate
        data-screen-label="Create task"
        style={{
          width: '100%',
          maxWidth: 720,
          background: 'var(--panel)',
          backdropFilter: 'var(--blur)',
          WebkitBackdropFilter: 'var(--blur)',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          flexDirection: 'column',
          borderTop: '4px solid var(--color-accent)',
          borderRadius: 'var(--r-lg)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
            padding: '20px 24px 16px',
            borderBottom: '2px solid var(--color-divider)',
          }}
        >
          <div>
            <h6 style={{ color: 'var(--color-accent)', marginBottom: 6 }}>
              {currentProject ? `${currentProject.id} · ${currentProject.name}` : 'Backlog'}
            </h6>
            <h3 style={{ margin: 0 }}>Create task</h3>
          </div>
          <button
            type="button"
            className="btn btn-icon"
            aria-label="Close"
            onClick={onClose}
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            <div className="field">
              <label htmlFor="ct-proj">Project</label>
              <select
                id="ct-proj"
                className="input"
                style={{ minHeight: 40 }}
                value={project}
                onChange={(e) => {
                  setProject(e.target.value);
                  const p2 = projects.find((x) => x.id === e.target.value);
                  if (p2) setPartition(p2.partition);
                }}
              >
                <option value="">No project (backlog)</option>
                {projects
                  .filter((p) => p.status !== 'Done')
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.id} · {p.name}
                    </option>
                  ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="ct-part">Partition</label>
              <select
                id="ct-part"
                className="input"
                style={{ minHeight: 40 }}
                value={partition}
                onChange={(e) => setPartition(e.target.value)}
              >
                {partitions.map((pt) => (
                  <option key={pt} value={pt}>
                    {pt}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Type */}
          <div className="field">
            <label>Type</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {(['Feature', 'Bug', 'Chore', 'Research'] as TaskType[]).map((tKey) => {
                const ty = TYPE[tKey];
                const on = type === tKey;
                return (
                  <button
                    key={tKey}
                    type="button"
                    onClick={() => setType(tKey)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      minHeight: 38,
                      padding: '0 12px',
                      cursor: 'pointer',
                      fontSize: 14,
                      fontWeight: 600,
                      border: on ? `2px solid ${TN[ty.t].solid}` : '1px solid var(--color-divider)',
                      background: on ? TN[ty.t].bg : 'transparent',
                      borderRadius: 'var(--r-sm)',
                    }}
                  >
                    <span
                      title={tKey}
                      style={{
                        width: 16,
                        height: 16,
                        flex: 'none',
                        display: 'grid',
                        placeItems: 'center',
                        background: TN[ty.t].solid,
                        color: 'var(--on-solid)',
                        borderRadius: 'var(--r-xs)',
                      }}
                    >
                      <Icon
                        name={tKey === 'Feature' ? 'check' : tKey === 'Bug' ? 'target' : 'sparkles'}
                        size={10}
                        strokeWidth={3}
                      />
                    </span>
                    {tKey}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Title */}
          <div className="field">
            <label htmlFor="ct-sum">
              Summary <span style={{ color: 'var(--color-accent)' }}>*</span>
            </label>
            <input
              id="ct-sum"
              className="input"
              style={{
                minHeight: 44,
                fontSize: 15,
                borderColor: error && !title.trim() ? 'var(--danger)' : undefined,
              }}
              placeholder="What needs to be done?"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (error) setError('');
              }}
              autoFocus
            />
          </div>

          {/* Description */}
          <div className="field">
            <label htmlFor="ct-desc">Description</label>
            <textarea
              id="ct-desc"
              className="input"
              style={{ minHeight: 96 }}
              placeholder="Context, acceptance criteria or links"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
            />
          </div>

          {/* Status & Priority */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
            <div className="field">
              <label>Status</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {STATUSES.map((stKey) => {
                  const sObj = st(stKey);
                  const on = status === stKey;
                  return (
                    <button
                      key={stKey}
                      type="button"
                      onClick={() => setStatus(stKey as TaskStatus)}
                      style={{
                        padding: '5px 10px',
                        cursor: 'pointer',
                        fontSize: 11,
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        letterSpacing: '.04em',
                        border: 0,
                        background: sObj.sBg,
                        color: sObj.sFg,
                        outline: on ? '2px solid var(--color-text)' : '2px solid transparent',
                        outlineOffset: 2,
                        borderRadius: 'var(--r-xs)',
                      }}
                    >
                      {stKey}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="field">
              <label>Priority</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(['Critical', 'High', 'Medium', 'Low'] as TaskPriority[]).map((priKey) => {
                  const on = priority === priKey;
                  return (
                    <button
                      key={priKey}
                      type="button"
                      onClick={() => setPriority(priKey)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        minHeight: 32,
                        padding: '0 10px',
                        cursor: 'pointer',
                        fontSize: 13,
                        fontWeight: 600,
                        border: on ? '2px solid var(--color-text)' : '1px solid var(--color-divider)',
                        background: on ? 'var(--color-surface)' : 'transparent',
                        borderRadius: 'var(--r-sm)',
                      }}
                    >
                      <Icon name="layers" size={16} style={{ stroke: PRI[priKey].c, strokeWidth: 2.5 }} />
                      {priKey}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Assignees */}
          <div className="field">
            <label htmlFor="ct-who">Assignees</label>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 6,
                alignItems: 'center',
                minHeight: 40,
                padding: 4,
                background: 'var(--color-surface)',
                border: '1px solid var(--color-divider)',
                borderRadius: 'var(--r-md)',
              }}
            >
              {assignees.map((a) => (
                <span
                  key={a}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: 2,
                    background: 'var(--panel)',
                    border: '1px solid var(--color-divider)',
                    fontSize: 13,
                    borderRadius: 'var(--r-sm)',
                  }}
                >
                  <span
                    title={a}
                    style={{
                      width: 22,
                      height: 22,
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
                  <button
                    type="button"
                    aria-label={`Remove ${a}`}
                    onClick={() => removeAssignee(a)}
                    style={{
                      border: 0,
                      background: 'transparent',
                      cursor: 'pointer',
                      padding: 2,
                      display: 'grid',
                      borderRadius: 'var(--r-sm)',
                    }}
                  >
                    <Icon name="x" size={12} />
                  </button>
                </span>
              ))}
              <input
                id="ct-who"
                value={pq}
                onChange={(e) => setPq(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && suggestions[0]) {
                    e.preventDefault();
                    addAssignee(suggestions[0].name);
                  }
                }}
                placeholder={assignees.length ? 'Add another person…' : 'Search people…'}
                style={{
                  flex: 1,
                  minWidth: 140,
                  border: 0,
                  background: 'transparent',
                  font: 'inherit',
                  fontSize: 14,
                  padding: 6,
                  outline: 'none',
                  color: 'inherit',
                }}
              />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              <span className="text-muted" style={{ fontSize: 12, width: '100%' }}>
                {cleanPq
                  ? suggestions.length
                    ? 'Matches'
                    : 'Nobody matches'
                  : currentProject
                  ? 'Suggested from project team'
                  : 'Suggested: you and team leads'}
              </span>
              {suggestions.slice(0, 8).map((u) => (
                <button
                  key={u.name}
                  type="button"
                  onClick={() => addAssignee(u.name)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '3px 10px 3px 3px',
                    border: '1px solid var(--color-divider)',
                    background: 'transparent',
                    cursor: 'pointer',
                    fontSize: 13,
                    borderRadius: 'var(--r-sm)',
                  }}
                >
                  <span
                    title={u.name}
                    style={{
                      width: 22,
                      height: 22,
                      flex: 'none',
                      background: avBg(u.name),
                      color: 'var(--on-solid)',
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: 9,
                      fontWeight: 800,
                      borderRadius: 'var(--r-av)',
                    }}
                  >
                    {ini(u.name)}
                  </span>
                  {u.name}
                </button>
              ))}
            </div>
          </div>

          {/* Labels */}
          <div className="field">
            <label htmlFor="ct-lab">Labels</label>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 6,
                alignItems: 'center',
                minHeight: 40,
                padding: 4,
                background: 'var(--color-surface)',
                border: '1px solid var(--color-divider)',
                borderRadius: 'var(--r-md)',
              }}
            >
              {labels.map((l) => (
                <span
                  key={l}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '2px 2px 2px 8px',
                    background: 'var(--color-neutral-200)',
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {l}
                  <button
                    type="button"
                    aria-label="Remove label"
                    onClick={() => setLabels(labels.filter((x) => x !== l))}
                    style={{
                      border: 0,
                      background: 'transparent',
                      cursor: 'pointer',
                      padding: 2,
                      display: 'grid',
                      borderRadius: 'var(--r-sm)',
                    }}
                  >
                    <Icon name="x" size={12} />
                  </button>
                </span>
              ))}
              <input
                id="ct-lab"
                value={labelDraft}
                onChange={(e) => setLabelDraft(e.target.value)}
                onKeyDown={handleLabelKeyDown}
                placeholder="Type a label, press Enter"
                style={{
                  flex: 1,
                  minWidth: 140,
                  border: 0,
                  background: 'transparent',
                  font: 'inherit',
                  fontSize: 14,
                  padding: 6,
                  outline: 'none',
                  color: 'inherit',
                }}
              />
            </div>
          </div>

          {/* Dates */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            <div className="field">
              <label htmlFor="ct-start">Start date</label>
              <input
                id="ct-start"
                type="date"
                className="input"
                style={{ minHeight: 40 }}
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="ct-due">Due date</label>
              <input
                id="ct-due"
                type="date"
                className="input"
                style={{ minHeight: 40 }}
                value={due}
                onChange={(e) => setDue(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <div
              role="alert"
              style={{
                background: 'var(--danger-bg)',
                color: 'var(--danger-fg)',
                padding: '10px 12px',
                fontSize: 13,
                borderTop: '2px solid var(--danger)',
                borderRadius: 'var(--r-md)',
              }}
            >
              {error}
            </div>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 8,
            padding: '16px 24px',
            borderTop: '2px solid var(--color-divider)',
            background: 'var(--color-surface)',
            borderRadius: 'var(--r-md)',
          }}
        >
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 13,
              cursor: 'pointer',
              marginRight: 'auto',
            }}
          >
            <input
              type="checkbox"
              checked={another}
              onChange={(e) => setAnother(e.target.checked)}
              style={{
                accentColor: 'var(--color-accent)',
                width: 16,
                height: 16,
                margin: 0,
              }}
            />
            Create another
          </label>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            style={{ minHeight: 40, minWidth: 140, borderRadius: 'var(--r-sm)' }}
          >
            Create task
          </button>
        </div>
      </form>
    </div>
  );
}
