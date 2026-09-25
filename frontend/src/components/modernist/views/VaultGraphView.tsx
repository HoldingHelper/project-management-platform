'use client';

import React, { useState, useMemo } from 'react';
import { DocFile } from '../types';
import { FOLDERS, PLUG, tone } from '../tokens';

interface VaultGraphViewProps {
  docs: DocFile[];
  onOpenDoc: (id: string) => void;
}

export const VaultGraphView: React.FC<VaultGraphViewProps> = ({ docs, onOpenDoc }) => {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  const linksOf = (d: DocFile): string[] => {
    const embedIds = (d.blocks || []).filter(b => b.k === 'embed' && b.id).map(b => b.id as string);
    const combined = [...(d.links || []), ...embedIds];
    return Array.from(new Set(combined)).filter(x => x !== d.id && docs.some(doc => doc.id === x));
  };

  const graphData = useMemo(() => {
    const pos: Record<string, [number, number]> = {};
    const NF = FOLDERS.length;

    FOLDERS.forEach(([k], i) => {
      const fs = docs.filter(d => d.folder === k);
      const a = (i / NF) * Math.PI * 2 - Math.PI / 2;
      const cx = 50 + 34 * Math.cos(a);
      const cy = 50 + 33 * Math.sin(a);

      fs.forEach((d, j) => {
        const r = fs.length > 1 ? 7 : 0;
        const b = (j / fs.length) * Math.PI * 2 + i;
        pos[d.id] = [cx + r * Math.cos(b), cy + r * 1.6 * Math.sin(b)];
      });
    });

    const edges: [string, string][] = [];
    docs.forEach(d => {
      linksOf(d).forEach(x => {
        if (pos[x]) {
          edges.push([d.id, x]);
        }
      });
    });

    const deg: Record<string, number> = {};
    edges.forEach(([a, b]) => {
      deg[a] = (deg[a] || 0) + 1;
      deg[b] = (deg[b] || 0) + 1;
    });

    const nb = new Set(
      hoveredNode ? [hoveredNode, ...edges.filter(e => e.includes(hoveredNode)).flat()] : []
    );
    const AR = 1.6;

    const renderedEdges = edges.map(([a, b], idx) => {
      const [x1, y1] = pos[a];
      const [x2, y2] = pos[b];
      const dx = x2 - x1;
      const dy = (y2 - y1) / AR;
      const on = hoveredNode && (a === hoveredNode || b === hoveredNode);
      return {
        id: `${a}-${b}-${idx}`,
        x: x1 + '%',
        y: y1 + '%',
        len: Math.hypot(dx, dy) + '%',
        ang: Math.atan2(dy, dx) + 'rad',
        c: on ? 'var(--color-accent)' : 'color-mix(in srgb, var(--color-text) 25%, transparent)',
        h: on ? '2px' : '1px',
        op: hoveredNode && !on ? 0.2 : 1,
      };
    });

    const renderedNodes = docs.map(d => {
      const pl = PLUG[d.type] || PLUG.note;
      const [x, y] = pos[d.id] || [50, 50];
      const k = deg[d.id] || 0;
      return {
        id: d.id,
        label: d.title,
        x: x + '%',
        y: y + '%',
        s: 10 + k * 3 + 'px',
        c: tone(pl.c).solid,
        op: hoveredNode && !nb.has(d.id) ? 0.25 : 1,
        w: hoveredNode === d.id ? 800 : 600,
      };
    });

    const legend = Object.values(PLUG).map(p => ({
      l: p.l,
      c: tone(p.c).solid,
    }));

    return {
      edges: renderedEdges,
      nodes: renderedNodes,
      legend,
      sub: `${docs.length} files · ${edges.length} links. Embeds and links both count.`,
    };
  }, [docs, hoveredNode]);

  return (
    <div data-screen-label="Graph" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '12px' }}>
        <span className="text-muted" style={{ fontSize: '13px' }}>
          {graphData.sub}
        </span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '12px' }}>
          {graphData.legend.map((lg, i) => (
            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: lg.c,
                }}
              />
              {lg.l}
            </span>
          ))}
        </div>
      </div>

      <div style={{ overflowX: 'auto', borderRadius: 'var(--r-lg)' }}>
        <div
          style={{
            position: 'relative',
            minWidth: '720px',
            aspectRatio: '16/10',
            background: 'var(--color-surface)',
            backgroundImage:
              'radial-gradient(color-mix(in srgb, var(--color-text) 12%, transparent) 1px, transparent 1px)',
            backgroundSize: '22px 22px',
            overflow: 'hidden',
          }}
        >
          {graphData.edges.map(e => (
            <span
              key={e.id}
              style={{
                position: 'absolute',
                left: e.x,
                top: e.y,
                width: e.len,
                height: e.h,
                background: e.c,
                opacity: e.op,
                transform: `rotate(${e.ang})`,
                transformOrigin: '0 50%',
                pointerEvents: 'none',
              }}
            />
          ))}

          {graphData.nodes.map(g => (
            <button
              key={g.id}
              onClick={() => onOpenDoc(g.id)}
              onMouseEnter={() => setHoveredNode(g.id)}
              onMouseLeave={() => setHoveredNode(null)}
              title={g.label}
              style={{
                position: 'absolute',
                left: g.x,
                top: g.y,
                transform: 'translate(-50%,-50%)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '5px',
                border: 0,
                background: 'transparent',
                cursor: 'pointer',
                opacity: g.op,
                padding: 0,
              }}
            >
              <span
                style={{
                  width: g.s,
                  height: g.s,
                  borderRadius: '50%',
                  background: g.c,
                  boxShadow: '0 0 0 3px var(--color-surface)',
                }}
              />
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: g.w,
                  whiteSpace: 'nowrap',
                  maxWidth: '150px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  padding: '1px 6px',
                  background: 'color-mix(in srgb, var(--color-surface) 85%, transparent)',
                  borderRadius: 'var(--r-xs)',
                }}
              >
                {g.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
