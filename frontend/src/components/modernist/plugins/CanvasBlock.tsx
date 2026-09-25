import React, { useState, useRef, useEffect } from 'react';
import { CanvasElement } from '../types';
import { Icon } from '../icons';
import { TN, OK } from '../tokens';

interface CanvasBlockProps {
  id: string;
  data: {
    els: CanvasElement[];
    arrows: [string, string, string][];
  };
  onUpdate: (data: { els: CanvasElement[]; arrows: [string, string, string][] }) => void;
}

const TOOLS = [
  { id: 'select', label: 'Select and drag', icon: 'pointer' },
  { id: 'rect', label: 'Rectangle', icon: 'rect' },
  { id: 'diamond', label: 'Decision', icon: 'diamond' },
  { id: 'sticky', label: 'Sticky note', icon: 'sticky' },
  { id: 'text', label: 'Text', icon: 'textT' },
  { id: 'arrow', label: 'Connect two shapes', icon: 'arrowTool' },
];

export function CanvasBlock({ id: _blockId, data, onUpdate }: CanvasBlockProps) {
  const [tool, setTool] = useState('select');
  const [sel, setSel] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const dragRef = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number } | null>(null);

  const els = data.els;
  const arrows = data.arrows;
  const byE = (id: string) => els.find((e) => e.id === id);
  const selectedEl = sel ? byE(sel) : null;

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const g = dragRef.current;
      if (!g) return;
      const dx = e.clientX - g.sx;
      const dy = e.clientY - g.sy;
      if (Math.abs(dx) + Math.abs(dy) < 3) return;
      onUpdate({
        els: els.map((q) =>
          q.id === g.id
            ? {
                ...q,
                x: Math.max(0, Math.min(880 - q.w, g.ox + dx)),
                y: Math.max(0, Math.min(380 - q.h, g.oy + dy)),
              }
            : q
        ),
        arrows,
      });
    };
    const onUp = () => {
      dragRef.current = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [els, arrows, onUpdate]);

  const handleStageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (tool === 'select' || tool === 'arrow') {
      setSel(null);
      setLink(null);
      return;
    }
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const SZ: Record<string, [number, number, string, string]> = {
      rect: [150, 64, 'Step', 'blue'],
      diamond: [120, 120, 'Decision?', 'amber'],
      sticky: [160, 110, 'New idea', 'amber'],
      text: [170, 44, 'Label', 'gray'],
    };
    const conf = SZ[tool] || [150, 64, 'Step', 'blue'];
    const newId = 'e' + Date.now().toString(36);
    const newEl: CanvasElement = {
      id: newId,
      kind: tool as any,
      x: Math.max(0, Math.min(880 - conf[0], x - conf[0] / 2)),
      y: Math.max(0, Math.min(380 - conf[1], y - conf[1] / 2)),
      w: conf[0],
      h: conf[1],
      text: conf[2],
      c: conf[3],
    };
    onUpdate({
      els: [...els, newEl],
      arrows,
    });
    setTool('select');
    setSel(newId);
  };

  const handleElPointerDown = (e: React.PointerEvent, el: CanvasElement) => {
    e.stopPropagation();
    if (tool === 'arrow') {
      if (link && link !== el.id) {
        onUpdate({
          els,
          arrows: [...arrows, [link, el.id, '']],
        });
        setLink(null);
        setTool('select');
      } else {
        setLink(el.id);
      }
      return;
    }
    if (tool !== 'select') return;
    setSel(el.id);
    dragRef.current = {
      id: el.id,
      sx: e.clientX,
      sy: e.clientY,
      ox: el.x,
      oy: el.y,
    };
  };

  const handleDeleteSel = () => {
    if (!sel) return;
    onUpdate({
      els: els.filter((q) => q.id !== sel),
      arrows: arrows.filter((a) => a[0] !== sel && a[1] !== sel),
    });
    setSel(null);
  };

  const handleUpdateText = (v: string) => {
    if (!sel) return;
    onUpdate({
      els: els.map((q) => (q.id === sel ? { ...q, text: v } : q)),
      arrows,
    });
  };

  return (
    <div style={{ position: 'relative', background: 'var(--color-surface)' }}>
      {/* Sticky top toolbar */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 3,
          display: 'flex',
          justifyContent: 'center',
          padding: 10,
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            padding: 4,
            background: 'var(--panel)',
            boxShadow: 'var(--shadow-md)',
            borderRadius: 'var(--r-sm)',
            pointerEvents: 'auto',
            flexWrap: 'wrap',
            maxWidth: '100%',
          }}
        >
          {TOOLS.map((tl) => (
            <button
              key={tl.id}
              type="button"
              title={tl.label}
              aria-label={tl.label}
              onClick={() => {
                setTool(tl.id);
                setLink(null);
              }}
              style={{
                width: 34,
                height: 34,
                display: 'grid',
                placeItems: 'center',
                border: 0,
                cursor: 'pointer',
                background: tool === tl.id ? 'var(--color-accent-100)' : 'transparent',
                color: tool === tl.id ? 'var(--color-accent-800)' : 'var(--color-text)',
                borderRadius: 'var(--r-xs)',
              }}
            >
              <Icon name={tl.icon} size={16} />
            </button>
          ))}
          {sel && tool === 'select' && (
            <>
              <span style={{ width: 1, height: 22, background: 'var(--color-divider)', margin: '0 4px' }} />
              <input
                aria-label="Shape text"
                value={selectedEl?.text || ''}
                onChange={(e) => handleUpdateText(e.target.value)}
                style={{
                  width: 150,
                  border: '1px solid var(--color-divider)',
                  background: 'var(--color-surface)',
                  font: 'inherit',
                  fontSize: 13,
                  padding: '6px 8px',
                  borderRadius: 'var(--r-xs)',
                  color: 'inherit',
                  outline: 'none',
                }}
              />
              <button
                type="button"
                aria-label="Delete shape"
                onClick={handleDeleteSel}
                style={{
                  width: 32,
                  height: 32,
                  display: 'grid',
                  placeItems: 'center',
                  border: 0,
                  background: 'transparent',
                  cursor: 'pointer',
                  color: 'var(--danger)',
                  borderRadius: 'var(--r-xs)',
                }}
              >
                <Icon name="trash" size={15} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Canvas workspace area */}
      <div style={{ overflow: 'auto', paddingTop: 56 }}>
        <div
          onClick={handleStageClick}
          style={{
            position: 'relative',
            width: 880,
            height: 380,
            margin: '0 auto',
            cursor: tool === 'select' ? 'default' : 'crosshair',
            backgroundImage:
              'radial-gradient(color-mix(in srgb, var(--color-text) 16%, transparent) 1px, transparent 1px)',
            backgroundSize: '20px 20px',
            fontFamily: 'Caveat, cursive',
          }}
        >
          {/* Arrow connections */}
          {arrows.map(([a, b, label], ai) => {
            const A = byE(a);
            const Bx = byE(b);
            if (!A || !Bx) return null;
            const ax = A.x + A.w / 2;
            const ay = A.y + A.h / 2;
            const bx = Bx.x + Bx.w / 2;
            const by = Bx.y + Bx.h / 2;
            const dx = bx - ax;
            const dy = by - ay;
            const clip = (E: CanvasElement) =>
              Math.min(dx ? (E.w / 2 + 8) / Math.abs(dx) : 1e9, dy ? (E.h / 2 + 8) / Math.abs(dy) : 1e9);
            const t1 = clip(A);
            const t2 = clip(Bx);
            const x1 = ax + dx * t1;
            const y1 = ay + dy * t1;
            const x2 = bx - dx * t2;
            const y2 = by - dy * t2;
            const len = Math.max(0, Math.hypot(x2 - x1, y2 - y1) - 4);
            const ang = Math.atan2(y2 - y1, x2 - x1);

            return (
              <React.Fragment key={ai}>
                <div
                  style={{
                    position: 'absolute',
                    left: `${x1}px`,
                    top: `${y1}px`,
                    width: `${len}px`,
                    height: 2,
                    marginTop: -1,
                    background: 'var(--color-neutral-700)',
                    transform: `rotate(${ang}rad)`,
                    transformOrigin: '0 50%',
                    pointerEvents: 'none',
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      right: -2,
                      top: -5,
                      borderLeft: '11px solid var(--color-neutral-700)',
                      borderTop: '6px solid transparent',
                      borderBottom: '6px solid transparent',
                    }}
                  />
                </div>
                {label && (
                  <span
                    style={{
                      position: 'absolute',
                      left: `${(x1 + x2) / 2}px`,
                      top: `${(y1 + y2) / 2}px`,
                      transform: 'translate(-50%, -50%)',
                      fontSize: 19,
                      fontWeight: 700,
                      background: 'var(--color-surface)',
                      padding: '0 5px',
                      pointerEvents: 'none',
                    }}
                  >
                    {label}
                  </span>
                )}
              </React.Fragment>
            );
          })}

          {/* Placed Elements */}
          {els.map((el) => {
            const tt = TN[el.c] || TN.gray;
            const K = el.kind;
            const isSelected = (sel === el.id && tool === 'select') || link === el.id;

            return (
              <div
                key={el.id}
                onPointerDown={(e) => handleElPointerDown(e, el)}
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: 'absolute',
                  left: `${el.x}px`,
                  top: `${el.y}px`,
                  width: `${el.w}px`,
                  height: `${el.h}px`,
                  display: 'grid',
                  placeItems: 'center',
                  cursor: tool === 'select' ? 'move' : 'pointer',
                  touchAction: 'none',
                  outline: isSelected ? '2px dashed var(--color-accent)' : '2px dashed transparent',
                  outlineOffset: 5,
                  userSelect: 'none',
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: K === 'text' ? 'transparent' : K === 'sticky' ? OK(0.94, 0.09, 95) : tt.bg,
                    border:
                      K === 'text'
                        ? 'none'
                        : K === 'sticky'
                        ? `2.5px solid ${OK(0.82, 0.12, 90)}`
                        : `2.5px solid ${tt.solid}`,
                    borderRadius: K === 'rect' ? 12 : K === 'sticky' ? 3 : 4,
                    transform:
                      K === 'diamond' ? 'scale(.72) rotate(45deg)' : K === 'sticky' ? 'rotate(-1.5deg)' : 'none',
                    boxShadow: K === 'sticky' ? '0 6px 14px rgba(0,0,0,.14)' : 'none',
                  }}
                />
                <span
                  style={{
                    position: 'relative',
                    fontSize: K === 'sticky' ? 21 : K === 'text' ? 26 : 22,
                    fontWeight: 700,
                    lineHeight: 1.05,
                    textAlign: 'center',
                    padding: 8,
                    color: K === 'sticky' ? '#3b3000' : 'var(--color-text)',
                  }}
                >
                  {el.text}
                </span>
              </div>
            );
          })}

          {els.length === 0 && (
            <div
              className="text-muted"
              style={{
                position: 'absolute',
                inset: 0,
                display: 'grid',
                placeItems: 'center',
                fontFamily: 'var(--font-body)',
                fontSize: 14,
                pointerEvents: 'none',
              }}
            >
              Pick a tool above, then click the board to place it.
            </div>
          )}
        </div>
      </div>
      <div className="text-muted" style={{ padding: '8px 12px', fontSize: 12 }}>
        {tool === 'arrow'
          ? link
            ? 'Now click the shape to connect to.'
            : 'Click the first shape, then the second, to draw an arrow.'
          : tool === 'select'
          ? 'Drag shapes to move them. Select a shape to rename or delete it.'
          : 'Click anywhere on the board to place the shape.'}
      </div>
    </div>
  );
}
