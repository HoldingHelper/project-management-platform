import React, { useState } from 'react';
import { SlideData } from '../types';
import { Icon } from '../icons';

interface SlidesBlockProps {
  slides: SlideData[];
  onPresent: () => void;
}

export function slideView(x: SlideData) {
  const cover = x.kind === 'cover';
  return {
    kicker: x.kicker || '',
    title: x.title,
    bg: cover ? 'var(--color-accent)' : 'var(--panel)',
    fg: cover ? 'var(--on-solid)' : 'var(--color-text)',
    accent: cover ? 'var(--on-solid)' : 'var(--color-accent)',
    jc: cover ? 'flex-end' : 'flex-start',
    tSize: cover ? '8cqw' : '5.2cqw',
    hasSub: !!x.sub,
    sub: x.sub || '',
    hasBig: !!x.big,
    big: x.big || '',
    bigSub: x.bigSub || '',
    hasBullets: !!(x.bullets && x.bullets.length),
    bullets: (x.bullets || []).map((tt) => ({ t: tt })),
  };
}

export function SlidesBlock({ slides, onPresent }: SlidesBlockProps) {
  const [idx, setIdx] = useState(0);
  const n = slides.length;
  const curIdx = Math.min(Math.max(0, idx), n - 1);
  const current = slides[curIdx] || { title: 'Untitled' };
  const v = slideView(current);

  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        padding: 12,
        background: 'var(--color-surface)',
      }}
    >
      <div
        data-mhide="1"
        style={{
          width: 116,
          flex: 'none',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          maxHeight: 380,
          overflow: 'auto',
        }}
      >
        {slides.map((s, k) => {
          const sv = slideView(s);
          return (
            <button
              key={k}
              type="button"
              onClick={() => setIdx(k)}
              style={{
                display: 'flex',
                gap: 6,
                alignItems: 'flex-start',
                border: 0,
                padding: 2,
                cursor: 'pointer',
                background: 'transparent',
              }}
            >
              <span className="text-muted" style={{ fontSize: 10, width: 12 }}>
                {k + 1}
              </span>
              <span
                style={{
                  flex: 1,
                  aspectRatio: '16 / 9',
                  background: sv.bg,
                  color: sv.fg,
                  fontSize: 7,
                  fontWeight: 800,
                  padding: 5,
                  boxSizing: 'border-box',
                  textAlign: 'left',
                  outline: k === curIdx ? '2px solid var(--color-accent)' : 'none',
                  outlineOffset: 2,
                  borderRadius: 'var(--r-xs)',
                  overflow: 'hidden',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                {s.title}
              </span>
            </button>
          );
        })}
      </div>

      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <div style={{ borderRadius: 'var(--r-sm)', overflow: 'hidden', boxShadow: 'var(--shadow-md)' }}>
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

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            type="button"
            aria-label="Previous slide"
            onClick={() => setIdx(Math.max(0, curIdx - 1))}
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
          <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
            {curIdx + 1} / {n}
          </span>
          <button
            type="button"
            aria-label="Next slide"
            onClick={() => setIdx(Math.min(n - 1, curIdx + 1))}
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
            className="btn btn-primary"
            onClick={onPresent}
            style={{ minHeight: 34 }}
          >
            <Icon name="play" size={14} />
            Present
          </button>
        </div>
      </div>
    </div>
  );
}
