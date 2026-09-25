export function evaluateSpreadsheet(
  rows: string[][],
  gapCol: boolean = false
): {
  val: (r: number, c: number, dep?: number) => any;
  fmt: (v: any) => string;
} {
  const num = (v: any): number => {
    const q = parseFloat(v);
    return isNaN(q) ? 0 : q;
  };

  const val = (r: number, cc: number, dep: number = 0): any => {
    const raw = (rows[r] || [])[cc];
    if (raw == null || raw === '') return '';
    if (typeof raw === 'string' && raw[0] === '=') {
      if (dep > 8) return '#REF';
      const ex = raw.slice(1).toUpperCase().replace(/\s+/g, '');
      const m = ex.match(/^(SUM|AVG)\(([A-Z])(\d+):([A-Z])(\d+)\)$/);
      if (m) {
        let tot = 0;
        let cnt = 0;
        const rStart = +m[3] - 1;
        const rEnd = +m[5] - 1;
        const cStart = m[2].charCodeAt(0) - 65;
        const cEnd = m[4].charCodeAt(0) - 65;
        for (let rr = rStart; rr <= rEnd; rr++) {
          for (let c2 = cStart; c2 <= cEnd; c2++) {
            tot += num(val(rr, c2, dep + 1));
            cnt++;
          }
        }
        return m[1] === 'SUM' ? tot : cnt ? tot / cnt : 0;
      }
      const sub = ex.replace(/([A-Z])(\d+)/g, (_q, a, b) => {
        const rowIdx = +b - 1;
        const colIdx = a.charCodeAt(0) - 65;
        return `(${num(val(rowIdx, colIdx, dep + 1))})`;
      });
      if (!/^[\d+\-*/().]+$/.test(sub)) return '#ERR';
      try {
        const r2 = Function(`return (${sub})`)();
        return isFinite(r2) ? r2 : '#ERR';
      } catch (e) {
        return '#ERR';
      }
    }
    return raw;
  };

  const fmt = (v: any): string => {
    if (typeof v === 'number') {
      return (Math.round(v * 10) / 10).toLocaleString('en-US');
    }
    return String(v);
  };

  return { val, fmt };
}
