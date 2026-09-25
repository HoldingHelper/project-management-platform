import React, { useState } from 'react';
import { Task } from '../types';
import { Icon } from '../icons';
import {
  TN,
  TYPE,
  PRI,
  ini,
  avBg,
  dayStr,
  TODAY,
} from '../tokens';

interface KanbanBoardViewProps {
  tasks: Task[];
  onOpenTask: (id: string) => void;
  onAddTask: (status?: string) => void;
  onMoveTask: (taskId: string, newStatus: string) => void;
}

const COLS: [string, string[], string][] = [
  ['To do', ['To do', 'Backlog'], 'gray'],
  ['In progress', ['In progress'], 'blue'],
  ['In review', ['In review'], 'purple'],
  ['Blocked', ['Blocked'], 'red'],
  ['Done', ['Done'], 'green'],
];

export function KanbanBoardView({
  tasks,
  onOpenTask,
  onAddTask,
  onMoveTask,
}: KanbanBoardViewProps) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDragId(id);
    try {
      e.dataTransfer.setData('text/plain', id);
      e.dataTransfer.effectAllowed = 'move';
    } catch (_err) {}
  };

  const handleDragEnd = () => {
    setDragId(null);
    setDragOverCol(null);
  };

  const handleDragOver = (e: React.DragEvent, colName: string) => {
    e.preventDefault();
    if (dragOverCol !== colName) {
      setDragOverCol(colName);
    }
  };

  const handleDrop = (e: React.DragEvent, colName: string, sts: string[]) => {
    e.preventDefault();
    const id = dragId || e.dataTransfer.getData('text/plain');
    setDragId(null);
    setDragOverCol(null);
    if (!id) return;
    const targetTask = tasks.find((t) => t.id === id);
    if (targetTask && !sts.includes(targetTask.status)) {
      onMoveTask(id, colName);
    }
  };

  return (
    <div data-screen-label="Board" style={{ overflowX: 'auto', marginTop: -8 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, minmax(230px, 1fr))',
          gap: 10,
          minWidth: 1200,
          alignItems: 'start',
        }}
      >
        {COLS.map(([name, sts, tk]) => {
          const tn = TN[tk] || TN.gray;
          const colCards = tasks.filter((t) => sts.includes(t.status));
          const isOver = dragOverCol === name;

          return (
            <div
              key={name}
              onDragOver={(e) => handleDragOver(e, name)}
              onDrop={(e) => handleDrop(e, name, sts)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                padding: 10,
                minHeight: 460,
                background: isOver ? tn.bg : 'var(--color-surface)',
                borderTop: `3px solid ${tn.solid}`,
                outline: isOver ? `2px dashed ${tn.solid}` : '2px dashed transparent',
                outlineOffset: -2,
                borderRadius: 'var(--r-md)',
              }}
            >
              {/* Column Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 2px 4px' }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    background: tn.solid,
                    borderRadius: 'var(--r-av)',
                  }}
                />
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: '.06em',
                    textTransform: 'uppercase',
                    color: tk === 'gray' ? 'var(--color-neutral-800)' : tn.fg,
                  }}
                >
                  {name}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    padding: '1px 7px',
                    background: 'var(--panel)',
                    backdropFilter: 'var(--blur)',
                    WebkitBackdropFilter: 'var(--blur)',
                    color: 'var(--color-neutral-700)',
                    borderRadius: 'var(--r-xs)',
                  }}
                >
                  {colCards.length}
                </span>
              </div>

              {/* Cards list */}
              {colCards.map((t) => {
                const ty = TYPE[t.type] || TYPE.Chore;
                const pr = PRI[t.priority] || PRI.Medium;
                const late = t.e != null && t.e < TODAY && t.status !== 'Done';
                const dueBg =
                  t.status === 'Done'
                    ? TN.green.bg
                    : late
                    ? TN.red.bg
                    : 'var(--color-neutral-200)';
                const dueFg =
                  t.status === 'Done'
                    ? TN.green.fg
                    : late
                    ? TN.red.fg
                    : 'var(--color-neutral-800)';
                const partBg = TN.blue.bg;
                const partFg = TN.blue.fg;

                return (
                  <div
                    key={t.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, t.id)}
                    onDragEnd={handleDragEnd}
                    onClick={() => onOpenTask(t.id)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                      padding: 12,
                      background: 'var(--color-neutral-100)',
                      border: '1px solid var(--color-neutral-300)',
                      boxShadow: 'var(--shadow-sm)',
                      cursor: 'grab',
                      opacity: dragId === t.id ? 0.4 : 1,
                      borderRadius: 'var(--r-md)',
                    }}
                  >
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        lineHeight: 1.35,
                        textWrap: 'pretty',
                      }}
                    >
                      {t.title}
                    </span>

                    <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '1px 6px',
                          background: partBg,
                          color: partFg,
                          borderRadius: 'var(--r-xs)',
                        }}
                      >
                        {t.partition}
                      </span>
                      {t.labels.map((l) => (
                        <span
                          key={l}
                          style={{
                            fontSize: 11,
                            padding: '1px 6px',
                            background: 'var(--color-neutral-200)',
                            color: 'var(--color-neutral-800)',
                            borderRadius: 'var(--r-xs)',
                          }}
                        >
                          {l}
                        </span>
                      ))}
                    </span>

                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: 'var(--color-neutral-700)',
                        }}
                      >
                        {t.id}
                      </span>
                      <span
                        style={{
                          marginLeft: 'auto',
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '1px 6px',
                          background: dueBg,
                          color: dueFg,
                          borderRadius: 'var(--r-xs)',
                        }}
                      >
                        {t.e == null ? 'No date' : dayStr(t.e)}
                      </span>
                      <Icon
                        name="layers"
                        size={16}
                        style={{ flex: 'none', stroke: pr.c, strokeWidth: 2.5 }}
                      />
                      <span style={{ display: 'flex', gap: 2 }}>
                        {t.assignees.map((a) => (
                          <span
                            key={a}
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
                        ))}
                      </span>
                    </span>
                  </div>
                );
              })}

              {colCards.length === 0 && (
                <div
                  style={{
                    padding: '18px 10px',
                    border: '1px dashed var(--color-neutral-400)',
                    fontSize: 12,
                    color: 'var(--color-neutral-700)',
                    borderRadius: 'var(--r-md)',
                  }}
                >
                  Drop tasks here
                </div>
              )}

              <button
                type="button"
                onClick={() => onAddTask(name)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 6px',
                  border: 0,
                  background: 'transparent',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--color-neutral-700)',
                  textAlign: 'left',
                  borderRadius: 'var(--r-sm)',
                }}
              >
                <Icon name="plus" size={14} />
                Create task
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
