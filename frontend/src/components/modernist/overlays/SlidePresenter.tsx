import React, { useEffect } from 'react';
import { DocFile } from '../types';
import { slideView } from '../plugins/SlidesBlock';
import { Icon } from '../icons';

interface SlidePresenterProps {
  doc: DocFile;
  slideIdx: number;
  onUpdateIdx: (newIdx: number) => void;
  onClose: () => void;
}

export function SlidePresenter({
  doc,
  slideIdx,
  onUpdateIdx,
  onClose,
}: SlidePresenterProps) {
  const slides = doc.data?.slides || [];
  const n = slides.length;
  const idx = Math.min(Math.max(0, slideIdx), n - 1);
  const current = slides[idx] || { title: 'Untitled' };
  const v = slideView(current);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        onUpdateIdx(Math.min(n - 1, idx + 1));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onUpdateIdx(Math.max(0, idx - 1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [idx, n, onClose, onUpdateIdx]);

  return (
    <div
      data-screen-label="Presenting"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 80,
        background: '#0b0b0f',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: 24,
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          width: 'min(92vw, calc((100vh - 120px) * 16 / 9))',
          boxShadow: '0 30px 80px rgba(0,0,0,.6)',
          borderRadius: 'var(--r-sm)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            aspectRatio: '16 / 9',
            background: v.bg,
            color: v.fg,
            padding: '6% 7%',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: v.jc as any,
            gap: '3.5cqw',
            containerType: 'inline-size',
            overflow: 'hidden',
            width: '100%',
          }}
        >
          <span
            style={{
              fontSize: '2.6cqw',
              fontWeight: 700,
              letterSpacing: '.1em',
              textTransform: 'uppercase',
              opacity: 0.75,
            }}
          >
            {v.kicker}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-heading)',
              fontWeight: 800,
              fontSize: v.tSize,
              lineHeight: 1.05,
              letterSpacing: '-.02em',
            }}
          >
            {v.title}
          </span>
          {v.hasSub && <span style={{ fontSize: '3cqw' }}>{v.sub}</span>}
          {v.hasBig && (
            <>
              <span
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontWeight: 800,
                  fontSize: '16cqw',
                  lineHeight: 1,
                  color: v.accent,
                }}
              >
                {v.big}
              </span>
              <span style={{ fontSize: '3cqw' }}>{v.bigSub}</span>
            </>
          )}
          {v.hasBullets && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2cqw' }}>
              {v.bullets.map((x, bi) => (
                <span
                  key={bi}
                  style={{
                    display: 'flex',
                    gap: '2cqw',
                    alignItems: 'center',
                    fontSize: '3.4cqw',
                  }}
                >
                  <span
                    style={{
                      width: '1.3cqw',
                      height: '1.3cqw',
                      flex: 'none',
                      background: v.accent,
                      borderRadius: '50%',
                    }}
                  />
                  {x.t}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#fff' }}>
        <button
          type="button"
          aria-label="Previous slide"
          onClick={() => onUpdateIdx(Math.max(0, idx - 1))}
          style={{
            width: 40,
            height: 40,
            display: 'grid',
            placeItems: 'center',
            border: 0,
            background: 'transparent',
            cursor: 'pointer',
            color: '#fff',
            borderRadius: 'var(--r-xs)',
          }}
        >
          <Icon name="cleft" size={20} />
        </button>
        <span style={{ fontSize: 14, fontVariantNumeric: 'tabular-nums', minWidth: 60, textAlign: 'center' }}>
          {idx + 1} / {n}
        </span>
        <button
          type="button"
          aria-label="Next slide"
          onClick={() => onUpdateIdx(Math.min(n - 1, idx + 1))}
          style={{
            width: 40,
            height: 40,
            display: 'grid',
            placeItems: 'center',
            border: 0,
            background: 'transparent',
            cursor: 'pointer',
            color: '#fff',
            borderRadius: 'var(--r-xs)',
          }}
        >
          <Icon name="cright" size={20} />
        </button>
        <span style={{ width: 1, height: 20, background: 'rgba(255,255,255,.3)', margin: '0 6px' }} />
        <button
          type="button"
          onClick={onClose}
          style={{
            border: '1px solid rgba(255,255,255,.35)',
            background: 'transparent',
            color: '#fff',
            padding: '8px 14px',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600,
            borderRadius: 'var(--r-sm)',
          }}
        >
          Exit · Esc
        </button>
      </div>
    </div>
  );
}
