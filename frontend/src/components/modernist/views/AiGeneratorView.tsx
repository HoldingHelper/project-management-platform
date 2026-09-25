import React, { useState } from 'react';
import { ProjectLevel } from '../types';
import { Icon } from '../icons';
import { LEVELS, AI_PH, TN } from '../tokens';

import { Project, Task } from '../types';

interface AiGeneratorViewProps {
  partitions?: string[];
  partsList?: string[];
  onCreateProjectFromAi?: (plan: {
    name: string;
    prompt: string;
    partition: string;
    level: ProjectLevel;
    duration: string;
    excludedTasks: Record<string, boolean>;
  }) => void;
  onCreateProject?: (newProj: Project, starterTasks: Task[], createChannel: boolean) => void;
}

export function AiGeneratorView({
  partitions,
  partsList = ['Tech', 'Operations', 'Business', 'Marketing', 'Sales', 'Design'],
  onCreateProjectFromAi,
  onCreateProject,
}: AiGeneratorViewProps) {
  const activePartitions = partitions || partsList;
  const [prompt, setPrompt] = useState('');
  const [partition, setPartition] = useState(activePartitions[0] || 'Tech');
  const [level, setLevel] = useState<ProjectLevel>('Inter-team');
  const [duration, setDuration] = useState('8 weeks');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    name: string;
    partition: string;
    level: ProjectLevel;
    duration: string;
  } | null>(null);
  const [excluded, setExcluded] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');

  const examples = [
    'Launch a customer feedback portal for enterprise clients by December',
    'Hire and onboard 20 annotators for the Q4 evaluation project',
    'Refresh the pricing page and sales deck for the new price bands',
  ];

  const handleGenerate = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!prompt.trim()) {
      setError('Describe the project in a sentence or two.');
      return;
    }
    setError('');
    setLoading(true);
    setResult(null);
    setExcluded({});

    setTimeout(() => {
      let derivedName = prompt
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/[.!?]+$/, '')
        .replace(/\s+(by|before|in time for)\s+.*$/i, '');
      if (derivedName.length > 52) {
        derivedName = derivedName.slice(0, 50).replace(/\s+\S*$/, '') + '…';
      }
      derivedName = derivedName.charAt(0).toUpperCase() + derivedName.slice(1);

      setResult({
        name: derivedName,
        partition,
        level,
        duration,
      });
      setLoading(false);
    }, 1100);
  };

  const wk = parseInt(duration) || 8;
  const cuts = [Math.round(wk * 0.25), Math.round(wk * 0.75)];

  const totalTasksCount = AI_PH.reduce(
    (acc, [, ts], i) =>
      acc + ts.filter((l) => !excluded[`${i}:${l}`]).length,
    0
  );

  return (
    <div
      data-screen-label="AI Generator"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 48,
        alignItems: 'flex-start',
      }}
    >
      {/* Left Form */}
      <form
        onSubmit={handleGenerate}
        noValidate
        style={{
          flex: '1 1 380px',
          maxWidth: 520,
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
        }}
      >
        <div className="field">
          <label htmlFor="ai-prompt">What should this project achieve?</label>
          <textarea
            id="ai-prompt"
            className="input"
            style={{ minHeight: 140, fontSize: 15 }}
            placeholder="e.g. Launch a customer feedback portal for enterprise clients by December"
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              if (error) setError('');
            }}
          />
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <span className="text-muted" style={{ fontSize: 12, width: '100%' }}>
            Examples
          </span>
          {examples.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => {
                setPrompt(ex);
                if (error) setError('');
              }}
              style={{
                padding: '6px 10px',
                fontSize: 12,
                border: '1px solid var(--color-divider)',
                background: 'transparent',
                cursor: 'pointer',
                textAlign: 'left',
                borderRadius: 'var(--r-sm)',
              }}
            >
              {ex}
            </button>
          ))}
        </div>

        <div className="field">
          <label htmlFor="ai-part">Partition</label>
          <select
            id="ai-part"
            className="input"
            style={{ minHeight: 44 }}
            value={partition}
            onChange={(e) => setPartition(e.target.value)}
          >
            {activePartitions.map((pt) => (
              <option key={pt} value={pt}>
                {pt}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>Project level</label>
          <div className="seg">
            {LEVELS.map(([lvlKey], i) => (
              <button
                key={lvlKey}
                type="button"
                className="seg-opt"
                onClick={() => setLevel(lvlKey as ProjectLevel)}
                style={{
                  border: 0,
                  borderLeft: i ? '1px solid var(--color-divider)' : 0,
                  background: level === lvlKey ? 'var(--color-accent)' : 'transparent',
                  color: level === lvlKey ? 'var(--on-solid)' : 'var(--color-text)',
                  minHeight: 40,
                }}
              >
                {lvlKey}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>Duration</label>
          <div className="seg">
            {['4 weeks', '8 weeks', '12 weeks'].map((durKey, i) => (
              <button
                key={durKey}
                type="button"
                className="seg-opt"
                onClick={() => setDuration(durKey)}
                style={{
                  border: 0,
                  borderLeft: i ? '1px solid var(--color-divider)' : 0,
                  background: duration === durKey ? 'var(--color-accent)' : 'transparent',
                  color: duration === durKey ? 'var(--on-solid)' : 'var(--color-text)',
                  minHeight: 40,
                }}
              >
                {durKey}
              </button>
            ))}
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
              borderRadius: 'var(--r-md)',
            }}
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          className="btn btn-primary btn-block"
          disabled={loading}
          style={{ minHeight: 48, fontSize: 15, borderRadius: 'var(--r-sm)' }}
        >
          <Icon name="sparkles" size={17} />
          {loading ? 'Drafting…' : result ? 'Generate again' : 'Generate draft plan'}
        </button>
      </form>

      {/* Right Result Section */}
      <section
        style={{
          flex: '1 1 440px',
          minWidth: 0,
          borderTop: '2px solid var(--color-divider)',
          paddingTop: 20,
        }}
      >
        {!loading && !result && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '24px 0' }}>
            <h4 style={{ margin: 0 }}>No draft yet</h4>
            <p className="text-muted" style={{ margin: 0, fontSize: 14, maxWidth: 420 }}>
              The draft plan appears here with phases, tasks and dates. Untick anything you don’t want before creating the project.
            </p>
          </div>
        )}

        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '24px 0' }}>
            <h6 style={{ color: 'var(--color-accent)' }}>Drafting phases…</h6>
            <div style={{ height: 14, width: '60%', background: 'var(--color-neutral-200)' }} />
            <div style={{ height: 14, width: '85%', background: 'var(--color-neutral-200)' }} />
            <div style={{ height: 14, width: '70%', background: 'var(--color-neutral-200)' }} />
          </div>
        )}

        {!loading && result && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <h6 style={{ color: 'var(--color-accent)', marginBottom: 8 }}>Draft plan</h6>
              <h3 style={{ margin: '0 0 6px' }}>{result.name}</h3>
              <p className="text-muted" style={{ margin: 0, fontSize: 14 }}>
                {result.partition} · {result.level} · {result.duration} · starts Sep 28
              </p>
            </div>

            {AI_PH.map(([phaseName, phaseTasks], i) => (
              <div
                key={phaseName}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '48px minmax(0, 1fr)',
                  gap: 12,
                  paddingBottom: 16,
                  borderBottom: '1px solid var(--color-divider)',
                }}
              >
                <span
                  style={{
                    fontWeight: 800,
                    color: 'var(--color-accent)',
                    fontSize: 14,
                    paddingTop: 2,
                  }}
                >
                  0{i + 1}
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <span style={{ fontWeight: 800, fontSize: 17 }}>{phaseName}</span>
                    <span className="text-muted" style={{ fontSize: 12 }}>
                      {i === 0
                        ? `Weeks 1–${cuts[0]}`
                        : i === 1
                        ? `Weeks ${cuts[0] + 1}–${cuts[1]}`
                        : `Weeks ${cuts[1] + 1}–${wk}`}
                    </span>
                  </div>
                  {phaseTasks.map((tName) => {
                    const key = `${i}:${tName}`;
                    const isOff = !!excluded[key];
                    return (
                      <button
                        key={tName}
                        type="button"
                        onClick={() =>
                          setExcluded({ ...excluded, [key]: !isOff })
                        }
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '4px 0',
                          border: 0,
                          background: 'transparent',
                          textAlign: 'left',
                          cursor: 'pointer',
                          fontSize: 14,
                          opacity: isOff ? 0.45 : 1,
                          borderRadius: 'var(--r-sm)',
                        }}
                      >
                        <span
                          style={{
                            width: 16,
                            height: 16,
                            flex: 'none',
                            border: `1.5px solid ${isOff ? 'var(--color-divider)' : TN.green.solid}`,
                            background: isOff ? 'transparent' : TN.green.solid,
                            display: 'grid',
                            placeItems: 'center',
                            color: isOff ? 'transparent' : 'var(--on-solid)',
                            borderRadius: 'var(--r-sm)',
                          }}
                        >
                          <Icon name="check" size={11} strokeWidth={3.5} />
                        </span>
                        {tName}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="btn btn-primary"
                style={{ minHeight: 40, borderRadius: 'var(--r-sm)' }}
                onClick={() => {
                  if (onCreateProjectFromAi) {
                    onCreateProjectFromAi({
                      name: result.name,
                      prompt,
                      partition: result.partition,
                      level: result.level,
                      duration: result.duration,
                      excludedTasks: excluded,
                    });
                  } else if (onCreateProject) {
                    const len = parseInt(result.duration) * 7;
                    const s0 = 27;
                    const id = `P-${Date.now().toString().slice(-3)}`;
                    const newProj: Project = {
                      id,
                      name: result.name,
                      owner: 'Jonas Brandt',
                      partition: result.partition,
                      level: result.level,
                      progress: 0,
                      status: 'Planned',
                      priority: 'Medium',
                      updated: 'Sep 25',
                      s: s0,
                      e: s0 + len,
                      m: s0 + Math.round(len * 0.75),
                      team: 'plt',
                      desc: prompt.trim(),
                    };
                    let n = 250;
                    const cuts = [0, Math.round(len * 0.25), Math.round(len * 0.75), len];
                    const newTasks: Task[] = [];
                    AI_PH.forEach(([, ts], phIdx) => {
                      ts.forEach((l, taskIdx) => {
                        if (excluded[`${phIdx}:${l}`]) return;
                        const a = s0 + cuts[phIdx];
                        const b = s0 + cuts[phIdx + 1];
                        const ss = a + Math.floor(((b - a) * taskIdx) / ts.length);
                        newTasks.push({
                          id: `T-${n++}`,
                          title: l,
                          project: id,
                          partition: result.partition,
                          labels: ['ai-draft'],
                          status: 'To do',
                          type: phIdx === 0 ? 'Research' : 'Feature',
                          priority: 'Medium',
                          assignees: [],
                          s: ss,
                          e: Math.min(b, ss + 7),
                          source: 'AI',
                          desc: '',
                        });
                      });
                    });
                    onCreateProject(newProj, newTasks, true);
                  }
                }}
              >
                Create project with {totalTasksCount} tasks
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ minHeight: 40, borderRadius: 'var(--r-sm)' }}
                onClick={() => handleGenerate()}
              >
                Regenerate
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
