import React, { useState } from 'react';
import { TN } from '../tokens';

interface ChartBlockProps {
  data: {
    labels: string[];
    series: [string, number[]][];
    mode?: 'Bar' | 'Line';
  };
}

export function ChartBlock({ data }: ChartBlockProps) {
  const [metricIdx, setMetricIdx] = useState(0);
  const [mode, setMode] = useState<'Bar' | 'Line'>(data.mode || 'Bar');

  const currentSeries = data.series[metricIdx] || data.series[0];
  const vals = currentSeries[1];
  const N = vals.length;
  const mx = Math.max(...vals);
  const top = Math.ceil((mx * 1.15) / 10) * 10 || 10;
  const col = metricIdx === 1 ? TN.teal.solid : 'var(--color-accent)';

  const poly = vals
    .map(
      (v, k) =>
        `${((k + 0.5) / N) * 100},${100 - (v / top) * 100}`
    )
    .join(' ');
  const area = `0.5,100 ${poly} ${(N - 0.5) / N * 100},100`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 16 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 }}>
        <div className="seg">
          {data.series.map(([name], idx) => (
            <button
              key={name}
              type="button"
              className="seg-opt"
              onClick={() => setMetricIdx(idx)}
              style={{
                border: 0,
                background: metricIdx === idx ? 'var(--color-accent)' : 'transparent',
                color: metricIdx === idx ? 'var(--on-solid)' : 'var(--color-text)',
                minHeight: 34,
                fontWeight: 600,
              }}
            >
              {name}
            </button>
          ))}
        </div>

        <div className="seg">
          {(['Bar', 'Line'] as const).map((m) => (
            <button
              key={m}
              type="button"
              className="seg-opt"
              onClick={() => setMode(m)}
              style={{
                border: 0,
                background: mode === m ? 'var(--color-accent)' : 'transparent',
                color: mode === m ? 'var(--on-solid)' : 'var(--color-text)',
                minHeight: 34,
                fontWeight: 600,
              }}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '32px minmax(0, 1fr)', gap: 8 }}>
        {/* Y-axis Ticks */}
        <div
          className="text-muted"
          style={{ position: 'relative', height: 220, fontSize: 11 }}
        >
          {[1, 0.75, 0.5, 0.25, 0].map((k) => (
            <span
              key={k}
              style={{
                position: 'absolute',
                right: 0,
                top: `${(1 - k) * 100}%`,
                transform: 'translateY(-50%)',
              }}
            >
              {Math.round(top * k)}
            </span>
          ))}
        </div>

        {/* Plot Area */}
        <div
          style={{
            position: 'relative',
            height: 220,
            borderLeft: '1px solid var(--color-divider)',
            borderBottom: '1px solid var(--color-divider)',
          }}
        >
          {[1, 0.75, 0.5, 0.25].map((k) => (
            <span
              key={k}
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: `${(1 - k) * 100}%`,
                borderTop: '1px dashed var(--color-divider)',
              }}
            />
          ))}

          {mode === 'Bar' && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'flex-end',
                gap: 8,
                padding: '0 8px',
              }}
            >
              {vals.map((v, k) => (
                <div
                  key={k}
                  style={{
                    flex: 1,
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    gap: 4,
                  }}
                >
                  <span style={{ fontSize: 11, fontWeight: 800 }}>{v}</span>
                  <span
                    style={{
                      width: '100%',
                      maxWidth: 44,
                      height: `${(v / top) * 100}%`,
                      background: col,
                      borderRadius: 'var(--r-xs) var(--r-xs) 0 0',
                    }}
                  />
                </div>
              ))}
            </div>
          )}

          {mode === 'Line' && (
            <>
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  overflow: 'visible',
                }}
              >
                <polygon
                  points={area}
                  style={{ fill: `color-mix(in srgb, ${col} 14%, transparent)`, stroke: 'none' }}
                />
                <polyline
                  points={poly}
                  vectorEffect="non-scaling-stroke"
                  style={{ fill: 'none', stroke: col, strokeWidth: 2.5, strokeLinejoin: 'round' }}
                />
              </svg>
              {vals.map((v, k) => (
                <span
                  key={k}
                  title={`${data.labels[k]}: ${v}`}
                  style={{
                    position: 'absolute',
                    left: `${((k + 0.5) / N) * 100}%`,
                    top: `${100 - (v / top) * 100}%`,
                    width: 10,
                    height: 10,
                    margin: '-5px 0 0 -5px',
                    borderRadius: '50%',
                    background: 'var(--panel)',
                    border: `2.5px solid ${col}`,
                    boxSizing: 'border-box',
                  }}
                />
              ))}
            </>
          )}
        </div>

        {/* X-axis labels */}
        <span />
        <div style={{ display: 'flex', gap: 8, padding: '0 8px' }}>
          {data.labels.map((l, k) => (
            <span
              key={k}
              className="text-muted"
              style={{ flex: 1, textAlign: 'center', fontSize: 11 }}
            >
              {l}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
