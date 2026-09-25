import React, { useState } from 'react';
import { Icon } from '../icons';
import { hash } from '../tokens';

interface PdfBlockProps {
  id: string;
  title: string;
  data: {
    pages: string[];
    note: [number, string] | null;
  };
  onToast: (msg: string) => void;
}

export function PdfBlock({ id, title, data, onToast }: PdfBlockProps) {
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(100);

  const n = data.pages.length;
  const pg = Math.min(page, n);
  const seed = hash(id) + pg * 7;
  const hasNote = !!(data.note && data.note[0] === pg);
  const widthPx = Math.round((430 * zoom) / 100);

  const lines = Array.from({ length: 13 }, (_, k) => ({
    w: k % 5 === 4 ? 35 + ((seed * (k + 1)) % 25) + '%' : 80 + ((seed + k * 13) % 20) + '%',
    c: hasNote && k === 3 ? '#ffe27a' : '#dcdfe5',
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '6px 10px',
          borderBottom: '1px solid var(--color-divider)',
          background: 'var(--color-surface)',
          fontSize: 13,
        }}
      >
        <button
          type="button"
          aria-label="Previous page"
          onClick={() => setPage(Math.max(1, pg - 1))}
          style={{
            width: 32,
            height: 32,
            display: 'grid',
            placeItems: 'center',
            border: 0,
            background: 'transparent',
            cursor: 'pointer',
            color: 'inherit',
            borderRadius: 'var(--r-xs)',
          }}
        >
          <Icon name="cleft" size={16} />
        </button>
        <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
          Page {pg} of {n}
        </span>
        <button
          type="button"
          aria-label="Next page"
          onClick={() => setPage(Math.min(n, pg + 1))}
          style={{
            width: 32,
            height: 32,
            display: 'grid',
            placeItems: 'center',
            border: 0,
            background: 'transparent',
            cursor: 'pointer',
            color: 'inherit',
            borderRadius: 'var(--r-xs)',
          }}
        >
          <Icon name="cright" size={16} />
        </button>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => setZoom(Math.max(60, zoom - 20))}
          style={{
            width: 32,
            height: 32,
            display: 'grid',
            placeItems: 'center',
            border: 0,
            background: 'transparent',
            cursor: 'pointer',
            color: 'inherit',
            borderRadius: 'var(--r-xs)',
          }}
        >
          <Icon name="zoomout" size={16} />
        </button>
        <span style={{ minWidth: 40, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
          {zoom}%
        </span>
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => setZoom(Math.min(160, zoom + 20))}
          style={{
            width: 32,
            height: 32,
            display: 'grid',
            placeItems: 'center',
            border: 0,
            background: 'transparent',
            cursor: 'pointer',
            color: 'inherit',
            borderRadius: 'var(--r-xs)',
          }}
        >
          <Icon name="zoomin" size={16} />
        </button>
        <button
          type="button"
          aria-label="Download"
          onClick={() => onToast(`${title} downloaded`)}
          style={{
            width: 32,
            height: 32,
            display: 'grid',
            placeItems: 'center',
            border: 0,
            background: 'transparent',
            cursor: 'pointer',
            color: 'inherit',
            borderRadius: 'var(--r-xs)',
          }}
        >
          <Icon name="download" size={16} />
        </button>
      </div>

      <div style={{ display: 'flex', background: 'var(--color-surface)' }}>
        <div
          data-mhide="1"
          style={{
            width: 88,
            flex: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            padding: '14px 12px',
            maxHeight: 540,
            overflow: 'auto',
            borderRight: '1px solid var(--color-divider)',
          }}
        >
          {data.pages.map((_, k) => (
            <button
              key={k}
              type="button"
              onClick={() => setPage(k + 1)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                border: 0,
                background: 'transparent',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              <span
                style={{
                  width: 56,
                  aspectRatio: '8.5 / 11',
                  background: '#fff',
                  boxShadow: 'var(--shadow-sm)',
                  outline: k + 1 === pg ? '2px solid var(--color-accent)' : 'none',
                  outlineOffset: 2,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 3,
                  padding: '7px 6px',
                  boxSizing: 'border-box',
                  borderRadius: 2,
                }}
              >
                <span style={{ height: 4, width: '70%', background: '#9aa0ab' }} />
                <span style={{ height: 3, width: '100%', background: '#dde0e5' }} />
                <span style={{ height: 3, width: '90%', background: '#dde0e5' }} />
                <span style={{ height: 3, width: '95%', background: '#dde0e5' }} />
                <span style={{ height: 3, width: '60%', background: '#dde0e5' }} />
              </span>
              <span className="text-muted" style={{ fontSize: 11 }}>
                {k + 1}
              </span>
            </button>
          ))}
        </div>

        <div
          style={{
            flex: 1,
            minWidth: 0,
            overflow: 'auto',
            padding: 20,
            display: 'flex',
            justifyContent: 'center',
            maxHeight: 540,
          }}
        >
          <div
            style={{
              width: widthPx,
              maxWidth: '100%',
              flex: 'none',
              aspectRatio: '8.5 / 11',
              background: '#fff',
              color: '#1b1b1f',
              boxShadow: 'var(--shadow-md)',
              padding: '7% 8%',
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: 'column',
              gap: 9,
              borderRadius: 2,
            }}
          >
            <span
              style={{
                fontSize: 10,
                letterSpacing: '.1em',
                textTransform: 'uppercase',
                color: '#6b6f7a',
              }}
            >
              {title}
            </span>
            <span
              style={{
                fontFamily: 'var(--font-heading)',
                fontWeight: 800,
                fontSize: 20,
                lineHeight: 1.15,
                color: '#1b1b1f',
              }}
            >
              {data.pages[pg - 1]}
            </span>
            {lines.map((ln, idx) => (
              <span
                key={idx}
                style={{
                  height: 6,
                  flex: 'none',
                  width: ln.w,
                  background: ln.c,
                  borderRadius: 2,
                }}
              />
            ))}
            {hasNote && (
              <span
                style={{
                  alignSelf: 'flex-start',
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '5px 8px',
                  background: '#fff1b8',
                  color: '#5c4400',
                  borderRadius: 4,
                  boxShadow: '0 2px 6px rgba(0,0,0,.12)',
                }}
              >
                {data.note![1]}
              </span>
            )}
            <span style={{ marginTop: 'auto', fontSize: 10, color: '#6b6f7a' }}>
              Page {pg} of {n}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
