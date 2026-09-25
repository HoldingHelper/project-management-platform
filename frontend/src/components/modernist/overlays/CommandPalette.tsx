import React, { useState } from 'react';
import { Project, Task, Person, DocFile } from '../types';
import { Icon } from '../icons';
import { ini, avBg, projBg, PLUG, TN, TYPE } from '../tokens';

interface CommandPaletteProps {
  projects: Project[];
  tasks: Task[];
  people: Person[];
  docs: DocFile[];
  onClose: () => void;
  onOpenTask: (id: string) => void;
  onOpenProject: (id: string) => void;
  onOpenPerson: (name: string) => void;
  onOpenDoc: (id: string) => void;
  onNavigatePage: (page: string) => void;
  onTriggerAction: (actionKey: string) => void;
}

interface PaletteItem {
  label: string;
  sub: string;
  icon?: string;
  hasIcon?: boolean;
  ini?: string;
  bg?: string;
  fg?: string;
  go: () => void;
}

export function CommandPalette({
  projects,
  tasks,
  people,
  docs,
  onClose,
  onOpenTask,
  onOpenProject,
  onOpenPerson,
  onOpenDoc,
  onNavigatePage,
  onTriggerAction,
}: CommandPaletteProps) {
  const [pq, setPq] = useState('');

  const q = pq.trim().toLowerCase();
  const has = (t: string) => !q || t.toLowerCase().includes(q);

  const acts: PaletteItem[] = [
    {
      label: 'Create task',
      sub: 'Action · opens the task form',
      hasIcon: true,
      icon: 'plus',
      bg: 'var(--color-accent)',
      fg: 'var(--on-solid)',
      go: () => onTriggerAction('task'),
    },
    {
      label: 'Create project',
      sub: 'Action · four-step setup',
      hasIcon: true,
      icon: 'projects',
      bg: 'var(--color-accent)',
      fg: 'var(--on-solid)',
      go: () => onTriggerAction('project'),
    },
    {
      label: 'Invite teammate',
      sub: 'Action',
      hasIcon: true,
      icon: 'userplus',
      bg: 'var(--color-accent)',
      fg: 'var(--on-solid)',
      go: () => onTriggerAction('invite'),
    },
    {
      label: 'Create vault file',
      sub: 'Action · note, sheet, slides, canvas…',
      hasIcon: true,
      icon: 'docs',
      bg: 'var(--color-accent)',
      fg: 'var(--on-solid)',
      go: () => onTriggerAction('doc'),
    },
  ].filter((a) => has(a.label));

  const prj: PaletteItem[] = projects
    .filter((x) => has(`${x.id} ${x.name}`))
    .slice(0, q ? 5 : 3)
    .map((x) => ({
      label: x.name,
      sub: `${x.id} · ${x.partition} · ${x.status}`,
      ini: ini(x.name),
      bg: projBg(x),
      fg: 'var(--on-solid)',
      go: () => onOpenProject(x.id),
    }));

  const tks: PaletteItem[] = (
    q
      ? tasks.filter((t) => has(`${t.id} ${t.title}`))
      : tasks.filter((t) => t.status !== 'Done')
  )
    .slice(0, 5)
    .map((t) => {
      const ty = TYPE[t.type] || TYPE.Chore;
      return {
        label: t.title,
        sub: `${t.id} · ${t.status}`,
        hasIcon: true,
        icon: t.type === 'Feature' ? 'check' : t.type === 'Bug' ? 'target' : 'sparkles',
        bg: TN[ty.t]?.solid || TN.blue.solid,
        fg: 'var(--on-solid)',
        go: () => onOpenTask(t.id),
      };
    });

  const ppl: PaletteItem[] = q
    ? people
        .filter((u) => has(`${u.name} ${u.role}`))
        .slice(0, 5)
        .map((u) => ({
          label: u.name,
          sub: u.role,
          ini: ini(u.name),
          bg: avBg(u.name),
          fg: 'var(--on-solid)',
          go: () => onOpenPerson(u.name),
        }))
    : [];

  const NAVP = [
    ['home', 'Home'],
    ['projects', 'Projects'],
    ['tasks', 'Tasks'],
    ['timeline', 'Timeline'],
    ['ai', 'AI Generator'],
    ['automations', 'Automations'],
    ['notifications', 'Notifications'],
    ['activity', 'Activity'],
    ['org', 'Org Chart'],
    ['perf', 'Team Performance'],
    ['exec', 'Executive'],
    ['admin', 'Administration'],
  ];

  const pgs: PaletteItem[] = q
    ? NAVP.filter(([, l]) => has(l)).map(([k, l]) => ({
        label: l,
        sub: 'Page',
        hasIcon: true,
        icon: k,
        bg: 'var(--color-surface)',
        fg: 'var(--color-text)',
        go: () => onNavigatePage(k),
      }))
    : [];

  const vf: PaletteItem[] = q
    ? docs
        .filter((d) => has(`${d.title} ${d.tags.join(' ')}`))
        .slice(0, 5)
        .map((d) => ({
          label: d.title,
          sub: `${PLUG[d.type].l} · vault`,
          hasIcon: true,
          icon: d.type === 'canvas' ? 'rect' : d.type === 'audio' ? 'music' : d.type,
          bg: TN[PLUG[d.type].c]?.solid || TN.gray.solid,
          fg: 'var(--on-solid)',
          go: () => onOpenDoc(d.id),
        }))
    : [];

  const groups: [string, PaletteItem[]][] = [
    ['Actions', acts],
    ['Vault', vf],
    ['Projects', prj],
    [q ? 'Tasks' : 'My open tasks', tks],
    ['People', ppl],
    ['Pages', pgs],
  ].filter((g) => (g[1] as PaletteItem[]).length > 0) as any;

  const firstItem = groups[0]?.[1]?.[0];

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && firstItem) {
      e.preventDefault();
      firstItem.go();
      onClose();
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: 'color-mix(in srgb, var(--color-text) 40%, transparent)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        padding: '12vh 16px 16px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Search"
        style={{
          width: '100%',
          maxWidth: 640,
          background: 'var(--panel)',
          backdropFilter: 'var(--blur)',
          WebkitBackdropFilter: 'var(--blur)',
          boxShadow: 'var(--shadow-lg)',
          borderTop: '4px solid var(--color-accent)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '70vh',
          borderRadius: 'var(--r-lg)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '0 16px',
            borderBottom: '2px solid var(--color-divider)',
          }}
        >
          <Icon name="search" size={18} style={{ opacity: 0.6 }} />
          <input
            autoFocus
            value={pq}
            onChange={(e) => setPq(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search projects, tasks, people or pages…"
            aria-label="Search"
            style={{
              flex: 1,
              minHeight: 56,
              border: 0,
              background: 'transparent',
              font: 'inherit',
              fontSize: 17,
              outline: 'none',
              color: 'inherit',
            }}
          />
          <span
            style={{
              fontSize: 11,
              border: '1px solid var(--color-divider)',
              padding: '1px 6px',
              borderRadius: 'var(--r-xs)',
            }}
          >
            Esc
          </span>
        </div>

        <div style={{ overflow: 'auto', padding: '4px 8px 8px' }}>
          {groups.map(([label, items]) => (
            <React.Fragment key={label}>
              <h6
                className="text-muted"
                style={{ margin: '12px 8px 4px', fontSize: 10.5 }}
              >
                {label}
              </h6>
              {items.map((it) => (
                <button
                  key={`${it.label}-${it.sub}`}
                  type="button"
                  onClick={() => {
                    it.go();
                    onClose();
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    width: '100%',
                    padding: 8,
                    border: 0,
                    background: 'transparent',
                    textAlign: 'left',
                    cursor: 'pointer',
                    borderRadius: 'var(--r-sm)',
                  }}
                >
                  <span
                    style={{
                      width: 28,
                      height: 28,
                      flex: 'none',
                      display: 'grid',
                      placeItems: 'center',
                      background: it.bg,
                      color: it.fg,
                      fontSize: 10,
                      fontWeight: 800,
                      borderRadius: 'var(--r-sm)',
                    }}
                  >
                    {it.hasIcon && it.icon ? (
                      <Icon name={it.icon} size={14} />
                    ) : (
                      it.ini
                    )}
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{it.label}</span>
                    <span className="text-muted" style={{ fontSize: 12 }}>
                      {it.sub}
                    </span>
                  </span>
                </button>
              ))}
            </React.Fragment>
          ))}

          {groups.length === 0 && (
            <p className="text-muted" style={{ padding: '16px 8px', margin: 0, fontSize: 14 }}>
              Nothing matches that search.
            </p>
          )}
        </div>

        <div
          className="text-muted"
          style={{
            padding: '10px 16px',
            borderTop: '1px solid var(--color-divider)',
            fontSize: 12,
          }}
        >
          Enter opens the first result · ⌘K toggles search
        </div>
      </div>
    </div>
  );
}
