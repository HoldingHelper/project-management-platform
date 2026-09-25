import React, { useState } from 'react';
import { Project, Team, ProjectLevel, TaskPriority } from '../types';
import { Icon } from '../icons';
import {
  LEVELS,
  PRI,
  HUES,
  OK,
  TN,
  ini,
  dayStr,
  d2i,
  i2d,
  TODAY,
  SPAN,
} from '../tokens';

interface CreateProjectDialogProps {
  existingProjects: Project[];
  teams: Team[];
  partitions: string[];
  nextKey: string;
  onClose: () => void;
  onCreateProject: (project: {
    key: string;
    name: string;
    desc: string;
    color: string;
    partition: string;
    level: ProjectLevel;
    team: string;
    owner: string;
    priority: TaskPriority;
    start: string;
    end: string;
    ms: string;
    dep: string;
    starter: boolean;
    channel: boolean;
  }) => void;
}

const STEPS = [
  ['Details', 'Name and look'],
  ['Scope', 'Team and level'],
  ['Schedule', 'Dates and links'],
  ['Review', 'Confirm and create'],
];

export function CreateProjectDialog({
  existingProjects,
  teams,
  partitions,
  nextKey,
  onClose,
  onCreateProject,
}: CreateProjectDialogProps) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [key, setKey] = useState(nextKey);
  const [desc, setDesc] = useState('');
  const [color, setColor] = useState('blue');
  const [partition, setPartition] = useState(partitions[0] || 'Tech');
  const [level, setLevel] = useState<ProjectLevel>('Inter-team');
  const [team, setTeam] = useState(teams[0]?.id || 'plt');
  const [owner, setOwner] = useState(teams[0]?.lead || 'Jonas Brandt');
  const [priority, setPriority] = useState<TaskPriority>('Medium');
  const [start, setStart] = useState(i2d(TODAY + 5));
  const [end, setEnd] = useState(i2d(TODAY + 61));
  const [ms, setMs] = useState(i2d(TODAY + 33));
  const [dep, setDep] = useState('');
  const [starter, setStarter] = useState(true);
  const [channel, setChannel] = useState(true);
  const [error, setError] = useState('');

  const currentTeam = teams.find((t) => t.id === team) || teams[0];
  const pBg = OK(0.52, 0.14, HUES[color] || 255);
  const pIni = ini(name.trim() || 'New project');

  const si = d2i(start);
  const ei = d2i(end);
  const mi = d2i(ms);

  const clamp = (v: number) => Math.max(0, Math.min(SPAN, v));
  const hasBar = si != null && ei != null && ei > si;
  const barLeft = `${(clamp(si ?? 0) / SPAN) * 100}%`;
  const barWidth = `${(Math.max(0, clamp(ei ?? 0) - clamp(si ?? 0)) / SPAN) * 100}%`;
  const msLeft = `${(clamp(mi ?? si ?? 0) / SPAN) * 100}%`;
  const durLabel =
    hasBar && si != null && ei != null
      ? `${dayStr(si)} → ${dayStr(ei)} · ${Math.round((ei - si) / 7)} weeks`
      : 'Pick dates';

  const validate = (currentStep: number): string => {
    if (currentStep === 1) {
      if (!name.trim()) return 'Give the project a name.';
      if (!/^P-\d{3,}$/.test(key)) return 'Use a key like P-110.';
      if (existingProjects.some((x) => x.id === key)) return `${key} is already taken.`;
    }
    if (currentStep === 3) {
      if (si == null || ei == null) return 'Set a start and a target date.';
      if (ei <= si) return 'The target date must be after the start date.';
      if (mi != null && (mi < si || mi > ei))
        return 'The milestone must fall between start and target.';
    }
    return '';
  };

  const handleNext = () => {
    const err = validate(step);
    if (err) {
      setError(err);
      return;
    }
    setError('');
    setStep(step + 1);
  };

  const handleCreate = () => {
    onCreateProject({
      key,
      name: name.trim(),
      desc: desc.trim(),
      color,
      partition,
      level,
      team,
      owner,
      priority,
      start,
      end,
      ms,
      dep,
      starter,
      channel,
    });
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
      <div
        onClick={(e) => e.stopPropagation()}
        data-screen-label="Create project"
        style={{
          width: '100%',
          maxWidth: 860,
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
        {/* Header */}
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
              New project · step {step} of 4
            </h6>
            <h3 style={{ margin: 0 }}>Create project</h3>
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

        {/* Step indicator bar */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            borderBottom: '2px solid var(--color-divider)',
          }}
        >
          {STEPS.map(([label, sub], i) => {
            const n = i + 1;
            const done = n < step;
            const cur = n === step;
            return (
              <button
                key={label}
                type="button"
                onClick={() => {
                  if (done) {
                    setStep(n);
                    setError('');
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '14px 16px',
                  border: 0,
                  background: 'transparent',
                  cursor: done ? 'pointer' : 'default',
                  textAlign: 'left',
                  borderBottom: `4px solid ${
                    cur ? 'var(--color-accent)' : done ? TN.green.solid : 'transparent'
                  }`,
                  marginBottom: -2,
                }}
              >
                <span
                  style={{
                    width: 26,
                    height: 26,
                    flex: 'none',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 12,
                    fontWeight: 800,
                    background: cur
                      ? 'var(--color-accent)'
                      : done
                      ? TN.green.solid
                      : 'var(--color-neutral-200)',
                    color: cur || done ? 'var(--on-solid)' : 'var(--color-neutral-700)',
                    borderRadius: 'var(--r-sm)',
                  }}
                >
                  {done ? <Icon name="check" size={13} strokeWidth={3.5} /> : n}
                </span>
                <span data-stl="1" style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2, minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 800 }}>{label}</span>
                  <span className="text-muted" style={{ fontSize: 11 }}>
                    {sub}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {/* Form Body */}
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18, minHeight: 380 }}>
          {step === 1 && (
            <>
              <div data-m1="1" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 150px', gap: 16 }}>
                <div className="field">
                  <label htmlFor="cp-name">
                    Project name <span style={{ color: 'var(--color-accent)' }}>*</span>
                  </label>
                  <input
                    id="cp-name"
                    className="input"
                    style={{ minHeight: 44, fontSize: 15 }}
                    placeholder="e.g. Customer feedback portal"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (error) setError('');
                    }}
                    autoFocus
                  />
                </div>
                <div className="field">
                  <label htmlFor="cp-key">Key</label>
                  <input
                    id="cp-key"
                    className="input"
                    style={{ minHeight: 44, fontSize: 15, fontWeight: 700 }}
                    value={key}
                    onChange={(e) => setKey(e.target.value.toUpperCase())}
                  />
                </div>
              </div>

              <div className="field">
                <label htmlFor="cp-desc">Description</label>
                <textarea
                  id="cp-desc"
                  className="input"
                  style={{ minHeight: 88 }}
                  placeholder="What will this project deliver, and for whom?"
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                />
              </div>

              <div className="field">
                <label>Color</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {['blue', 'teal', 'green', 'orange', 'magenta', 'purple', 'indigo'].map((cKey) => {
                    const cVal = OK(0.52, 0.14, HUES[cKey]);
                    const on = color === cKey;
                    return (
                      <button
                        key={cKey}
                        type="button"
                        aria-label={cKey}
                        onClick={() => setColor(cKey)}
                        style={{
                          width: 36,
                          height: 36,
                          border: 0,
                          cursor: 'pointer',
                          background: cVal,
                          outline: on ? '2px solid var(--color-text)' : 'none',
                          outlineOffset: 2,
                          borderRadius: 'var(--r-sm)',
                        }}
                      />
                    );
                  })}
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: 16,
                  background: 'var(--color-surface)',
                  borderRadius: 'var(--r-md)',
                }}
              >
                <span
                  style={{
                    width: 44,
                    height: 44,
                    flex: 'none',
                    background: pBg,
                    color: 'var(--on-solid)',
                    display: 'grid',
                    placeItems: 'center',
                    fontWeight: 800,
                    fontSize: 14,
                    borderRadius: 'var(--r-sm)',
                  }}
                >
                  {pIni}
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span
                    className="text-muted"
                    style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}
                  >
                    Preview · {key}
                  </span>
                  <span style={{ fontWeight: 800, fontSize: 17 }}>
                    {name.trim() || 'Untitled project'}
                  </span>
                </span>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="field">
                <label>Partition</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {partitions.map((p) => {
                    const on = partition === p;
                    const tn = TN.blue;
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPartition(p)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          minHeight: 38,
                          padding: '0 12px',
                          cursor: 'pointer',
                          fontSize: 14,
                          fontWeight: 600,
                          border: on ? `2px solid ${tn.solid}` : '1px solid var(--color-divider)',
                          background: on ? tn.bg : 'transparent',
                          color: on ? tn.fg : 'var(--color-text)',
                          borderRadius: 'var(--r-sm)',
                        }}
                      >
                        <span style={{ width: 10, height: 10, background: tn.solid, borderRadius: 'var(--r-av)' }} />
                        {p}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="field">
                <label>Level</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                  {LEVELS.map(([n, d]) => {
                    const on = level === n;
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setLevel(n as ProjectLevel)}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 4,
                          padding: 14,
                          textAlign: 'left',
                          cursor: 'pointer',
                          border: `2px solid ${on ? 'var(--color-accent)' : 'var(--color-divider)'}`,
                          background: on ? 'var(--color-accent-100)' : 'transparent',
                          borderRadius: 'var(--r-sm)',
                        }}
                      >
                        <span style={{ fontWeight: 800, fontSize: 15 }}>{n}</span>
                        <span className="text-muted" style={{ fontSize: 12 }}>
                          {d}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                <div className="field">
                  <label htmlFor="cp-team">Team</label>
                  <select
                    id="cp-team"
                    className="input"
                    style={{ minHeight: 40 }}
                    value={team}
                    onChange={(e) => {
                      setTeam(e.target.value);
                      const t = teams.find((x) => x.id === e.target.value);
                      if (t) setOwner(t.lead);
                    }}
                  >
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="cp-owner">Owner</label>
                  <select
                    id="cp-owner"
                    className="input"
                    style={{ minHeight: 40 }}
                    value={owner}
                    onChange={(e) => setOwner(e.target.value)}
                  >
                    {[currentTeam.lead, ...currentTeam.members].map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
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
                          minHeight: 34,
                          padding: '0 12px',
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
            </>
          )}

          {step === 3 && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                <div className="field">
                  <label htmlFor="cp-s">Start date</label>
                  <input
                    id="cp-s"
                    type="date"
                    className="input"
                    style={{ minHeight: 40 }}
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="cp-e">Target date</label>
                  <input
                    id="cp-e"
                    type="date"
                    className="input"
                    style={{ minHeight: 40 }}
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="cp-m">Key milestone</label>
                  <input
                    id="cp-m"
                    type="date"
                    className="input"
                    style={{ minHeight: 40 }}
                    value={ms}
                    onChange={(e) => setMs(e.target.value)}
                  />
                </div>
              </div>

              <div className="field">
                <label htmlFor="cp-dep">Depends on</label>
                <select
                  id="cp-dep"
                  className="input"
                  style={{ minHeight: 40 }}
                  value={dep}
                  onChange={(e) => setDep(e.target.value)}
                >
                  <option value="">No dependency</option>
                  {existingProjects
                    .filter((x) => x.status !== 'Done')
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.id} · {x.name}
                      </option>
                    ))}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <h6 className="text-muted" style={{ margin: 0 }}>
                    Schedule preview
                  </h6>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{durLabel}</span>
                </div>
                <div
                  style={{
                    position: 'relative',
                    height: 72,
                    background: 'var(--color-surface)',
                    borderTop: '2px solid var(--color-divider)',
                    borderRadius: 'var(--r-md)',
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 6,
                      paddingLeft: 8,
                      fontSize: 11,
                      fontWeight: 800,
                      letterSpacing: '.08em',
                    }}
                  >
                    SEP
                  </span>
                  <span
                    style={{
                      position: 'absolute',
                      left: '32.97%',
                      top: 0,
                      bottom: 0,
                      borderLeft: '1px solid var(--color-neutral-300)',
                      padding: '6px 8px',
                      fontSize: 11,
                      fontWeight: 800,
                      letterSpacing: '.08em',
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
                      borderLeft: '1px solid var(--color-neutral-300)',
                      padding: '6px 8px',
                      fontSize: 11,
                      fontWeight: 800,
                      letterSpacing: '.08em',
                    }}
                  >
                    NOV
                  </span>
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
                  {hasBar && (
                    <>
                      <span
                        style={{
                          position: 'absolute',
                          top: 34,
                          height: 22,
                          left: barLeft,
                          width: barWidth,
                          background: pBg,
                          borderRadius: 'var(--r-sm)',
                        }}
                      />
                      <span
                        style={{
                          position: 'absolute',
                          top: 39,
                          left: msLeft,
                          width: 12,
                          height: 12,
                          marginLeft: -6,
                          transform: 'rotate(45deg)',
                          background: 'var(--color-text)',
                          border: '1px solid var(--panel)',
                        }}
                      />
                    </>
                  )}
                </div>
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  paddingBottom: 16,
                  borderBottom: '2px solid var(--color-divider)',
                }}
              >
                <span
                  style={{
                    width: 52,
                    height: 52,
                    flex: 'none',
                    background: pBg,
                    color: 'var(--on-solid)',
                    display: 'grid',
                    placeItems: 'center',
                    fontWeight: 800,
                    fontSize: 16,
                    borderRadius: 'var(--r-sm)',
                  }}
                >
                  {pIni}
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--color-neutral-700)' }}>
                    {key}
                  </span>
                  <span style={{ fontWeight: 800, fontSize: 20 }}>{name.trim()}</span>
                  <span className="text-muted" style={{ fontSize: 13 }}>
                    {desc.trim() || 'No description.'}
                  </span>
                </span>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                  columnGap: 32,
                }}
              >
                {[
                  ['Partition', partition],
                  ['Level', level],
                  ['Team', currentTeam.name],
                  ['Owner', owner],
                  ['Priority', priority],
                  ['Schedule', `${dayStr(si)} – ${dayStr(ei)}`],
                  ['Milestone', dayStr(mi)],
                  ['Depends on', dep || '—'],
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
                    <span style={{ fontWeight: 600 }}>{v}</span>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 14, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={starter}
                    onChange={(e) => setStarter(e.target.checked)}
                    style={{
                      accentColor: 'var(--color-accent)',
                      width: 16,
                      height: 16,
                      margin: '2px 0 0',
                    }}
                  />
                  <span>
                    <b>Add starter tasks</b>
                    <span className="text-muted" style={{ display: 'block', fontSize: 12 }}>
                      Kickoff meeting, scope sign-off and delivery review, assigned to the owner.
                    </span>
                  </span>
                </label>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 14, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={channel}
                    onChange={(e) => setChannel(e.target.checked)}
                    style={{
                      accentColor: 'var(--color-accent)',
                      width: 16,
                      height: 16,
                      margin: '2px 0 0',
                    }}
                  />
                  <span>
                    <b>Create a project channel</b>
                    <span className="text-muted" style={{ display: 'block', fontSize: 12 }}>
                      Appears in team chat for everyone on the team.
                    </span>
                  </span>
                </label>
              </div>
            </>
          )}

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

        {/* Footer controls */}
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
          {step > 1 && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setStep(step - 1);
                setError('');
              }}
              style={{ minHeight: 40, borderRadius: 'var(--r-sm)' }}
            >
              <Icon name="back" size={16} />
              Back
            </button>
          )}
          <span style={{ marginLeft: 'auto' }} />
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          {step < 4 ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleNext}
              style={{ minHeight: 40, minWidth: 140, borderRadius: 'var(--r-sm)' }}
            >
              Continue
              <Icon name="right" size={16} style={{ marginLeft: 'auto' }} />
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleCreate}
              style={{ minHeight: 40, minWidth: 160, borderRadius: 'var(--r-sm)' }}
            >
              <Icon name="check" size={16} />
              Create project
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
