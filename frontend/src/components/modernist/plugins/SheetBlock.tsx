import React, { useState } from 'react';
import { evaluateSpreadsheet } from '../formulaEngine';
import { TN } from '../tokens';

interface SheetBlockProps {
  data: {
    rows: string[][];
    gapCol?: boolean;
  };
  onUpdateRows: (rows: string[][]) => void;
}

export function SheetBlock({ data, onUpdateRows }: SheetBlockProps) {
  const [sel, setSel] = useState<[number, number]>([1, 1]);
  const rows = data.rows;
  const R = rows.length;
  const C = rows[0]?.length || 0;

  const L = (k: number) => String.fromCharCode(65 + k);
  const { val, fmt } = evaluateSpreadsheet(rows, data.gapCol);

  const rawVal = rows[sel[0]]?.[sel[1]] ?? '';
  const refLabel = `${L(sel[1])}${sel[0] + 1}`;

  const handleCellChange = (newVal: string) => {
    const updated = rows.map((row, r) =>
      r === sel[0]
        ? row.map((cell, c) => (c === sel[1] ? newVal : cell))
        : row
    );
    onUpdateRows(updated);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          borderBottom: '1px solid var(--color-divider)',
          background: 'var(--color-surface)',
        }}
      >
        <span
          style={{
            minWidth: 44,
            fontSize: 12,
            fontWeight: 800,
            padding: '4px 8px',
            background: 'var(--panel)',
            border: '1px solid var(--color-divider)',
            borderRadius: 'var(--r-xs)',
            textAlign: 'center',
          }}
        >
          {refLabel}
        </span>
        <span style={{ fontStyle: 'italic', fontWeight: 700, opacity: 0.55 }}>
          fx
        </span>
        <input
          aria-label="Cell value or formula"
          value={rawVal}
          onChange={(e) => handleCellChange(e.target.value)}
          style={{
            flex: 1,
            minWidth: 0,
            border: 0,
            background: 'transparent',
            fontSize: 13,
            fontFamily: 'ui-monospace, Menlo, monospace',
            outline: 'none',
            color: 'inherit',
            padding: '4px 0',
          }}
        />
      </div>

      <div style={{ overflow: 'auto' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `44px repeat(${C}, minmax(110px, 1fr))`,
            minWidth: `${44 + C * 110}px`,
            fontSize: 13,
          }}
        >
          {/* Header row with corner cell and column letters */}
          <div
            style={{
              padding: '8px 10px',
              fontWeight: 700,
              background: 'var(--color-surface)',
              color: 'var(--color-neutral-700)',
              textAlign: 'center',
              borderRight: '1px solid var(--color-divider)',
              borderBottom: '1px solid var(--color-divider)',
            }}
          />
          {Array.from({ length: C }, (_, cc) => (
            <div
              key={cc}
              style={{
                padding: '8px 10px',
                fontWeight: 700,
                background: 'var(--color-surface)',
                color:
                  sel[1] === cc
                    ? 'var(--color-accent-800)'
                    : 'var(--color-neutral-700)',
                textAlign: 'center',
                borderRight: '1px solid var(--color-divider)',
                borderBottom: '1px solid var(--color-divider)',
              }}
            >
              {L(cc)}
            </div>
          ))}

          {/* Data rows with row numbers */}
          {rows.map((row, r) => (
            <React.Fragment key={r}>
              <div
                style={{
                  padding: '8px 10px',
                  fontWeight: 700,
                  background: 'var(--color-surface)',
                  color:
                    sel[0] === r
                      ? 'var(--color-accent-800)'
                      : 'var(--color-neutral-700)',
                  textAlign: 'center',
                  borderRight: '1px solid var(--color-divider)',
                  borderBottom: '1px solid var(--color-divider)',
                }}
              >
                {r + 1}
              </div>
              {row.map((_, cc) => {
                const v = val(r, cc);
                const isNum =
                  typeof v === 'number' || (v !== '' && !isNaN(+v));
                const isSelected = sel[0] === r && sel[1] === cc;
                const isHead = r === 0;
                const isTotal = row[0] === 'Total';

                let fg = 'var(--color-text)';
                if (data.gapCol && cc === C - 1 && r > 0 && isNum) {
                  fg = +v > 0 ? TN.red.fg : TN.green.fg;
                }
                if (v === '#ERR' || v === '#REF') {
                  fg = TN.red.fg;
                }

                return (
                  <button
                    key={cc}
                    type="button"
                    onClick={() => setSel([r, cc])}
                    style={{
                      textAlign: isNum ? 'right' : 'left',
                      padding: '8px 10px',
                      border: 0,
                      borderRight: '1px solid var(--color-divider)',
                      borderBottom: '1px solid var(--color-divider)',
                      background: isSelected
                        ? 'var(--color-accent-100)'
                        : isHead || isTotal
                        ? 'var(--color-surface)'
                        : 'var(--panel)',
                      color: fg,
                      fontWeight: isHead || isTotal ? 700 : 400,
                      cursor: 'cell',
                      outline: isSelected
                        ? '2px solid var(--color-accent)'
                        : 'none',
                      outlineOffset: -2,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      fontVariantNumeric: 'tabular-nums',
                      fontSize: 13,
                    }}
                  >
                    {fmt(isNum && typeof v !== 'number' ? +v : v)}
                  </button>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
      <div
        className="text-muted"
        style={{ padding: '8px 12px', fontSize: 12 }}
      >
        Select a cell and edit it in the bar above. Formulas: =SUM(B2:B7), =AVG(C2:C7) or arithmetic like =D2-C2.
      </div>
    </div>
  );
}
