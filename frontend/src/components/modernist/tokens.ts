import { ThemeName, RadiusName } from './types';

export const TODAY = 23;
export const SPAN = 91;
export const BASE = Date.UTC(2026, 8, 1); // 2026-09-01
export const ME = 'Platform Admin';
export const D0 = 'var(--color-divider)';

export const dayStr = (d: number | null | undefined): string =>
  d == null
    ? '—'
    : new Date(BASE + d * 864e5).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      });

export const i2d = (i: number | null | undefined): string =>
  i == null ? '' : new Date(BASE + i * 864e5).toISOString().slice(0, 10);

export const d2i = (v: string | null | undefined): number | null =>
  v ? Math.round((Date.parse(v) - BASE) / 864e5) : null;

export const ini = (n: string): string =>
  n
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

export const slug = (n: string): string =>
  n
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z ]/g, '')
    .trim()
    .split(/\s+/)
    .join('.');

export const hash = (n: string): number =>
  [...n].reduce((a, c) => a + c.charCodeAt(0), 0);

export const OK = (l: number, c: number, hh: number): string =>
  `oklch(${l} ${c} ${hh})`;

export const HUES: Record<string, number> = {
  blue: 255,
  green: 152,
  purple: 300,
  amber: 78,
  teal: 195,
  magenta: 345,
  orange: 50,
  indigo: 275,
};

export interface ToneItem {
  bg: string;
  bd: string;
  fg: string;
  solid: string;
}

export const TN: Record<string, ToneItem> = {};

export function buildTN(dark: boolean) {
  Object.entries(HUES).forEach(([k, hh]) => {
    TN[k] = dark
      ? {
          bg: OK(0.3, 0.06, hh),
          bd: OK(0.42, 0.09, hh),
          fg: OK(0.86, 0.1, hh),
          solid: OK(0.66, 0.15, hh),
        }
      : {
          bg: OK(0.95, 0.035, hh),
          bd: OK(0.84, 0.08, hh),
          fg: OK(0.42, 0.13, hh),
          solid: OK(0.58, 0.15, hh),
        };
  });
  if (dark) {
    TN.amber.fg = OK(0.88, 0.12, 85);
    TN.amber.solid = OK(0.78, 0.15, 80);
  } else {
    TN.amber.fg = OK(0.45, 0.1, 65);
    TN.amber.solid = OK(0.75, 0.15, 75);
  }
  TN.red = dark
    ? {
        bg: OK(0.32, 0.08, 25),
        bd: OK(0.45, 0.12, 25),
        fg: OK(0.86, 0.1, 25),
        solid: OK(0.64, 0.2, 28),
      }
    : {
        bg: OK(0.95, 0.03, 25),
        bd: OK(0.85, 0.08, 25),
        fg: OK(0.45, 0.17, 27),
        solid: OK(0.6, 0.21, 28),
      };
  TN.gray = {
    bg: 'var(--color-neutral-200)',
    bd: 'var(--color-neutral-300)',
    fg: 'var(--color-neutral-800)',
    solid: 'var(--color-neutral-500)',
  };
}

buildTN(false);

const RK = [100, 200, 300, 400, 500, 600, 700, 800, 900];
const RMP = (name: string, arr: string[]) =>
  Object.fromEntries(RK.map((k, i) => [`--color-${name}-${k}`, arr[i]]));
const CC = [0.02, 0.045, 0.08, 0.13, 0.18, 0.19, 0.17, 0.14, 0.1];
const LR = (hh: number) =>
  [0.97, 0.93, 0.86, 0.74, 0.6, 0.52, 0.45, 0.38, 0.3].map((l, i) =>
    OK(l, CC[i], hh)
  );
const DR = (hh: number) =>
  [0.28, 0.33, 0.4, 0.52, 0.62, 0.72, 0.8, 0.87, 0.94].map((l, i) =>
    OK(l, CC[i], hh)
  );

const DANGER_L = {
  '--danger': OK(0.6, 0.21, 28),
  '--danger-bg': OK(0.95, 0.03, 25),
  '--danger-fg': OK(0.45, 0.17, 27),
};

export const THEMES: Record<ThemeName, Record<string, string>> = {
  modernist: {
    '--page': '#f3f2f2',
    '--panel': '#f3f2f2',
    '--on-solid': '#f3f2f2',
    '--blur': 'none',
    '--danger': 'var(--color-accent)',
    '--danger-bg': 'var(--color-accent-100)',
    '--danger-fg': 'var(--color-accent-800)',
  },
  ocean: {
    '--color-bg': '#f7f8f9',
    '--color-surface': '#f1f2f4',
    '--color-text': '#172b4d',
    '--color-accent': OK(0.55, 0.19, 260),
    '--color-accent-2': OK(0.55, 0.19, 260),
    '--color-divider': 'rgba(9,30,66,.16)',
    ...RMP('accent', LR(260)),
    ...RMP('neutral', [
      '#f7f8f9',
      '#f1f2f4',
      '#dcdfe4',
      '#b3b9c4',
      '#8590a2',
      '#626f86',
      '#44546f',
      '#2c3e5d',
      '#172b4d',
    ]),
    '--page': '#f7f8f9',
    '--panel': '#ffffff',
    '--on-solid': '#ffffff',
    '--blur': 'none',
    ...DANGER_L,
    '--shadow-sm': '0 1px 1px rgba(9,30,66,.18), 0 0 1px rgba(9,30,66,.3)',
    '--shadow-md': '0 8px 12px rgba(9,30,66,.12), 0 0 1px rgba(9,30,66,.3)',
    '--shadow-lg': '0 16px 40px rgba(9,30,66,.22), 0 0 1px rgba(9,30,66,.3)',
  },
  midnight: {
    '--color-bg': '#1d2125',
    '--color-surface': '#22272b',
    '--color-text': '#dee4ea',
    '--color-accent': OK(0.62, 0.17, 258),
    '--color-accent-2': OK(0.62, 0.17, 258),
    '--color-divider': 'rgba(222,228,234,.14)',
    ...RMP('accent', DR(258)),
    ...RMP('neutral', [
      '#22272b',
      '#2c333a',
      '#38414a',
      '#454f59',
      '#738496',
      '#8c9bab',
      '#9fadbc',
      '#b6c2cf',
      '#dee4ea',
    ]),
    '--page': '#161a1d',
    '--panel': '#1d2125',
    '--on-solid': '#ffffff',
    '--blur': 'none',
    '--danger': OK(0.64, 0.2, 28),
    '--danger-bg': OK(0.32, 0.08, 25),
    '--danger-fg': OK(0.86, 0.1, 25),
    '--shadow-sm': '0 1px 1px rgba(0,0,0,.5)',
    '--shadow-md':
      '0 8px 16px rgba(0,0,0,.45), 0 0 0 1px rgba(255,255,255,.06)',
    '--shadow-lg':
      '0 20px 48px rgba(0,0,0,.6), 0 0 0 1px rgba(255,255,255,.08)',
  },
  glass: {
    '--color-bg': 'rgba(255,255,255,.6)',
    '--color-surface': 'rgba(255,255,255,.45)',
    '--color-text': '#1c1b3a',
    '--color-accent': OK(0.55, 0.21, 288),
    '--color-accent-2': OK(0.55, 0.21, 288),
    '--color-divider': 'rgba(40,36,110,.14)',
    ...RMP('accent', LR(288)),
    ...RMP('neutral', [
      'rgba(255,255,255,.72)',
      'rgba(40,36,110,.07)',
      'rgba(40,36,110,.13)',
      'rgba(40,36,110,.28)',
      '#7d7ca3',
      '#626189',
      '#4b4a73',
      '#35345c',
      '#1c1b3a',
    ]),
    '--page': `radial-gradient(at 8% 6%, ${OK(
      0.84,
      0.12,
      300
    )} 0, transparent 42%), radial-gradient(at 92% 10%, ${OK(
      0.86,
      0.1,
      205
    )} 0, transparent 44%), radial-gradient(at 72% 92%, ${OK(
      0.88,
      0.1,
      350
    )} 0, transparent 48%), radial-gradient(at 12% 88%, ${OK(
      0.89,
      0.09,
      250
    )} 0, transparent 48%), ${OK(0.95, 0.02, 280)}`,
    '--panel': 'rgba(255,255,255,.58)',
    '--on-solid': '#ffffff',
    '--blur': 'blur(20px) saturate(170%)',
    ...DANGER_L,
    '--shadow-sm': '0 1px 2px rgba(40,36,110,.1)',
    '--shadow-md': '0 8px 24px rgba(40,36,110,.14)',
    '--shadow-lg': '0 24px 60px rgba(40,36,110,.24)',
  },
};

export const RADII: Record<RadiusName, Record<string, string>> = {
  sharp: {
    '--r-xs': '0',
    '--r-sm': '0',
    '--r-md': '0',
    '--r-lg': '0',
    '--r-av': '0',
    '--r-bar': '0',
    '--radius-sm': '0px',
    '--radius-md': '0px',
    '--radius-lg': '0px',
  },
  soft: {
    '--r-xs': '4px',
    '--r-sm': '6px',
    '--r-md': '10px',
    '--r-lg': '14px',
    '--r-av': '50%',
    '--r-bar': '99px',
    '--radius-sm': '4px',
    '--radius-md': '6px',
    '--radius-lg': '14px',
  },
  round: {
    '--r-xs': '7px',
    '--r-sm': '10px',
    '--r-md': '16px',
    '--r-lg': '22px',
    '--r-av': '50%',
    '--r-bar': '99px',
    '--radius-sm': '8px',
    '--radius-md': '10px',
    '--radius-lg': '22px',
  },
};

export const THEME_KEYS = [
  ...new Set(
    [...Object.values(THEMES), ...Object.values(RADII)].flatMap((o) =>
      Object.keys(o)
    )
  ),
];

export const PARTS = [
  'Tech',
  'Operations',
  'Business',
  'Marketing',
  'Sales',
  'Design',
];


export const SMAP: Record<string, string> = {
  'To do': 'gray',
  Backlog: 'gray',
  Planned: 'gray',
  Draft: 'gray',
  Invited: 'gray',
  'Not connected': 'gray',
  'In progress': 'blue',
  'In review': 'purple',
  Review: 'purple',
  Done: 'green',
  'On track': 'green',
  Healthy: 'green',
  Connected: 'green',
  Published: 'green',
  Active: 'green',
  'At risk': 'amber',
  Watch: 'amber',
  Blocked: 'red',
};

export const stT = (s: string): ToneItem => TN[SMAP[s] || 'gray'] || TN.gray;

export const st = (s: string) => {
  const t = stT(s);
  return s === 'Blocked'
    ? { sBg: t.solid, sFg: 'var(--on-solid)', sBd: t.solid, sDot: t.solid }
    : { sBg: t.bg, sFg: t.fg, sBd: 'transparent', sDot: t.solid };
};

export const PRI: Record<string, { c: string; d: string }> = {
  Critical: { c: OK(0.6, 0.21, 28), d: 'M7 13l5-5 5 5 M7 19l5-5 5 5' },
  High: { c: OK(0.62, 0.17, 45), d: 'M7 15l5-5 5 5' },
  Medium: { c: OK(0.72, 0.15, 78), d: 'M6 9h12 M6 15h12' },
  Low: { c: OK(0.58, 0.15, 255), d: 'M7 9l5 5 5-5' },
};

export const TYPE: Record<string, { t: string; d: string }> = {
  Feature: { t: 'green', d: 'M6 3h12v18l-6-4-6 4z' },
  Bug: { t: 'red', d: 'M8 12a4 4 0 1 0 8 0a4 4 0 1 0-8 0' },
  Chore: { t: 'blue', d: 'M20 6L9 17l-5-5' },
  Research: {
    t: 'purple',
    d: 'M3 11a8 8 0 1 0 16 0a8 8 0 1 0-16 0 M21 21l-4.3-4.3',
  },
};

export const STATUSES = [
  'Backlog',
  'To do',
  'In progress',
  'In review',
  'Blocked',
  'Done',
];

export const PCOL: Record<string, string> = {
  Tech: 'blue',
  Operations: 'teal',
  Business: 'orange',
  Marketing: 'magenta',
  Sales: 'green',
  Design: 'purple',
};

export const pcol = (p: string) =>
  PCOL[p] || ['indigo', 'teal', 'orange', 'magenta'][hash(p) % 4];

export const AVH = [255, 152, 300, 195, 345, 45, 275, 230];
export const avBg = (n: string) => OK(0.5, 0.13, AVH[hash(n) % 8]);

export const projBg = (x: { color?: string; partition: string }) =>
  OK(0.52, 0.14, HUES[x.color || pcol(x.partition)] || 255);

export const taskX = (t: {
  type: string;
  e: number | null;
  status: string;
  priority: string;
  partition: string;
}) => {
  const ty = TYPE[t.type] || TYPE.Chore;
  const late = t.e != null && t.e < TODAY && t.status !== 'Done';
  const pc = TN[pcol(t.partition)] || TN.blue;
  const pr = PRI[t.priority] || PRI.Medium;
  return {
    typeBg: TN[ty.t]?.solid || TN.blue.solid,
    typeIcon: ty.d,
    priColor: pr.c,
    priIcon: pr.d,
    dueBg:
      t.status === 'Done'
        ? TN.green.bg
        : late
        ? TN.red.bg
        : 'var(--color-neutral-200)',
    dueFg:
      t.status === 'Done'
        ? TN.green.fg
        : late
        ? TN.red.fg
        : 'var(--color-neutral-800)',
    partBg: pc.bg,
    partFg: pc.fg,
  };
};

export const FOLDERS: [string, string, string][] = [
  ['handbook', 'Company handbook', 'indigo'],
  ['eng', 'Engineering', 'blue'],
  ['ops', 'Operations', 'teal'],
  ['com', 'Commercial', 'green'],
  ['dsn', 'Design', 'purple'],
  ['meet', 'Meetings', 'orange'],
  ['att', 'Attachments', 'magenta'],
];

export interface PluginMeta {
  l: string;
  d: string;
  s: string;
  c: string;
  i: string;
}

export const PLUG: Record<string, PluginMeta> = {
  note: {
    l: 'Note',
    d: 'Text, checklists and callouts, linked to anything',
    s: 'Linked text',
    c: 'indigo',
    i: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z M14 2v4a2 2 0 0 0 2 2h4 M16 13H8 M16 17H8 M10 9H8',
  },
  canvas: {
    l: 'Canvas',
    d: 'Excalidraw-style whiteboard for flows and sketches',
    s: 'Whiteboard',
    c: 'purple',
    i: 'M12 19l7-7 3 3-7 7-3-3z M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z M2 2l7.6 7.6 M11 13a2 2 0 1 0 0-4a2 2 0 0 0 0 4',
  },
  sheet: {
    l: 'Sheet',
    d: 'Rows, columns and live formulas',
    s: 'Spreadsheet',
    c: 'green',
    i: 'M3 3h18v18H3z M3 9h18 M3 15h18 M9 3v18 M15 3v18',
  },
  slides: {
    l: 'Slides',
    d: 'Decks you can present from the vault',
    s: 'Presentation',
    c: 'orange',
    i: 'M2 3h20 M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3 M7 21l5-5 5 5',
  },
  pdf: {
    l: 'PDF',
    d: 'Upload, read and annotate documents',
    s: 'Document',
    c: 'red',
    i: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z M14 2v4a2 2 0 0 0 2 2h4 M9 15h6 M9 11h2',
  },
  audio: {
    l: 'Audio',
    d: 'Recordings with a synced transcript',
    s: 'Recording',
    c: 'magenta',
    i: 'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z M19 10v2a7 7 0 0 1-14 0v-2 M12 19v3',
  },
  image: {
    l: 'Image',
    d: 'Screenshots, photos and diagrams',
    s: 'Picture',
    c: 'teal',
    i: 'M3 3h18v18H3z M9 10a2 2 0 1 0 0-4a2 2 0 0 0 0 4 M21 15l-3.1-3.1a2 2 0 0 0-2.8 0L6 21',
  },
  chart: {
    l: 'Chart',
    d: 'Bar or line graph from a data series',
    s: 'Graph',
    c: 'blue',
    i: 'M3 3v18h18 M18 17V9 M13 17V5 M8 17v-3',
  },
};

export const TPLS: Record<string, [string, string][]> = {
  note: [
    ['Blank', 'Empty page'],
    ['Meeting notes', 'Agenda, decisions, actions'],
    ['Runbook', 'Warning, steps, escalation'],
    ['Project brief', 'Goal, scope, milestones, risks'],
  ],
  sheet: [
    ['Blank', 'Four empty columns'],
    ['Budget', 'Quarter comparison with totals'],
    ['Tracker', 'Task, owner, status, due'],
  ],
  slides: [
    ['Blank', 'One title slide'],
    ['All-hands', 'Cover, update, next steps'],
    ['Project kickoff', 'Goal, scope, timeline'],
  ],
  canvas: [
    ['Blank', 'Empty whiteboard'],
    ['Flowchart', 'Start, decision, two outcomes'],
    ['Mind map', 'Central idea with branches'],
  ],
  chart: [
    ['Bar', 'Bars from a data series'],
    ['Line', 'Trend line from a data series'],
  ],
  pdf: [['Upload', 'Add a PDF from your computer']],
  audio: [['Upload', 'Add a recording']],
  image: [['Upload', 'Add a screenshot or photo']],
};

export const tone = (k: string): ToneItem => TN[k] || TN.gray;

export const LEVELS: [string, string][] = [
  ['Inter-team', 'Projects inside one partition'],
  ['Inter-partition', 'Cross-partition projects'],
  ['Organization', 'Company-wide projects'],
];

export const AI_PH: [string, string[]][] = [
  ['Discover and scope', ['Interview stakeholders', 'Write the project brief', 'Agree success metrics']],
  ['Build', ['Draft the delivery plan', 'Build the first version', 'Review with stakeholders', 'Fix review findings']],
  ['Launch and review', ['Prepare the launch checklist', 'Launch to first users', 'Run the retrospective']],
];

export interface SegOption {
  label: string;
  bl: string;
  bg: string;
  fg: string;
  pick: () => void;
}

export const seg = (labels: string[], cur: string, pick: (l: string) => void): SegOption[] =>
  labels.map((l, i) => {
    const on = cur === l;
    return {
      label: l,
      bl: i ? '1px solid ' + D0 : '0',
      bg: on ? 'var(--color-accent)' : 'transparent',
      fg: on ? 'var(--on-solid)' : 'var(--color-text)',
      pick: () => pick(l),
    };
  });

export interface TabOption {
  label: string;
  count: string | number;
  bar: string;
  color: string;
  pick: () => void;
}

export const tabs = (
  list: [string, string, (string | number)?][],
  cur: string,
  pick: (k: string) => void
): TabOption[] =>
  list.map(([k, l, c]) => {
    const on = cur === k;
    return {
      label: l,
      count: c == null ? '' : c,
      bar: on ? 'var(--color-accent)' : 'transparent',
      color: on ? 'var(--color-text)' : 'color-mix(in srgb, var(--color-text) 60%, transparent)',
      pick: () => pick(k),
    };
  });


