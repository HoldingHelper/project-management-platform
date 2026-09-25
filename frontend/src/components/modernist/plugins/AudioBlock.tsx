import React, { useState, useEffect, useRef } from 'react';
import { Icon } from '../icons';
import { hash, avBg } from '../tokens';

interface AudioBlockProps {
  id: string;
  data: {
    dur: number;
    lines: [number, string, string][];
  };
}

export function AudioBlock({ id, data }: AudioBlockProps) {
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [speed, setSpeed] = useState(1);
  const timerRef = useRef<any>(null);

  const dur = data.dur;
  const NB = 64;
  const seed = hash(id);

  const mmss = (q: number) =>
    Math.floor(q / 60) + ':' + String(Math.floor(q % 60)).padStart(2, '0');

  useEffect(() => {
    if (playing) {
      timerRef.current = setInterval(() => {
        setPos((prev) => {
          const next = prev + 0.25 * speed;
          if (next >= dur) {
            setPlaying(false);
            return dur;
          }
          return next;
        });
      }, 250);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [playing, speed, dur]);

  const togglePlay = () => {
    if (pos >= dur) setPos(0);
    setPlaying(!playing);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    setPos(ratio * dur);
  };

  const curLineIdx = data.lines.reduce(
    (acc, l, k) => (l[0] <= pos ? k : acc),
    0
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <button
          type="button"
          onClick={togglePlay}
          aria-label={playing ? 'Pause' : 'Play'}
          style={{
            width: 48,
            height: 48,
            flex: 'none',
            border: 0,
            borderRadius: 'var(--r-av)',
            background: 'var(--color-accent)',
            color: 'var(--on-solid)',
            display: 'grid',
            placeItems: 'center',
            cursor: 'pointer',
          }}
        >
          <Icon name={playing ? 'pause' : 'play'} size={20} />
        </button>

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div
            onClick={handleSeek}
            role="slider"
            aria-label="Seek"
            tabIndex={0}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              height: 44,
              cursor: 'pointer',
            }}
          >
            {Array.from({ length: NB }, (_, k) => {
              const h = 18 + ((seed * (k + 3) * 7919 + k * k * 31) % 82);
              const isPast = pos > 0 && k / NB <= pos / dur;
              return (
                <span
                  key={k}
                  style={{
                    flex: 1,
                    height: `${h}%`,
                    background: isPast ? 'var(--color-accent)' : 'var(--color-neutral-300)',
                    borderRadius: 2,
                  }}
                />
              );
            })}
          </div>
          <div
            className="text-muted"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 12,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            <span>{mmss(pos)}</span>
            <span>{mmss(dur)}</span>
          </div>
        </div>

        <div data-mhide="1" className="seg" style={{ flex: 'none' }}>
          {[
            { l: '1×', v: 1 },
            { l: '1.5×', v: 1.5 },
            { l: '2×', v: 2 },
          ].map((sp) => (
            <button
              key={sp.l}
              type="button"
              className="seg-opt"
              onClick={() => setSpeed(sp.v)}
              style={{
                border: 0,
                background: speed === sp.v ? 'var(--color-accent)' : 'transparent',
                color: speed === sp.v ? 'var(--on-solid)' : 'var(--color-text)',
                minHeight: 34,
                fontWeight: 600,
              }}
            >
              {sp.l}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', borderTop: '1px solid var(--color-divider)' }}>
        {data.lines.map(([timeSec, who, text], k) => {
          const isActive = pos > 0 && k === curLineIdx;
          return (
            <button
              key={k}
              type="button"
              onClick={() => {
                setPos(timeSec);
                if (!playing) setPlaying(true);
              }}
              style={{
                display: 'grid',
                gridTemplateColumns: '48px minmax(0, 1fr)',
                gap: 10,
                padding: '9px 6px',
                border: 0,
                borderBottom: '1px solid var(--color-divider)',
                background: isActive ? 'var(--color-accent-100)' : 'transparent',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <span
                className="text-muted"
                style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', paddingTop: 2 }}
              >
                {mmss(timeSec)}
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: avBg(who) }}>
                  {who}
                </span>
                <span style={{ fontSize: 14 }}>{text}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
