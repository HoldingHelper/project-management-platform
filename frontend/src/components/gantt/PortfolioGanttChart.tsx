"use client";

/* Project-level Gantt: one row per project, date-scaled bars with progress
   fill, milestone diamonds, cross-project dependency arrows (SVG overlay),
   a today line, and a pulse on blocked/delayed projects. */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Diamond, GripHorizontal, ZoomIn, ZoomOut } from "lucide-react";
import { toSemantic, semanticColor } from "@/lib/format";
import type { PortfolioGantt } from "@/lib/types";

const DAY_MS = 86_400_000;

interface Layout {
  id: string;
  name: string;
  left: number;
  width: number;
  row: number;
  color: string;
  bg: string;
  pulse: boolean;
  progress: number;
  currentPhase?: string | null;
  startMs: number;
  endMs: number;
  milestones: { name: string; x: number; done: boolean; date: string }[];
}

type BarDragMode = "move" | "start" | "end";
interface BarDrag {
  id: string;
  mode: BarDragMode;
  startX: number;
  origStartMs: number;
  origEndMs: number;
  startMs: number; // live preview
  endMs: number; // live preview
}

function toIso(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function PortfolioGanttChart({
  data,
  editable = false,
  onSchedule,
}: {
  data: PortfolioGantt;
  editable?: boolean;
  onSchedule?: (id: string, dates: { start_date: string; end_date: string }) => void;
}) {
  const router = useRouter();
  const [zoom, setZoom] = useState(1);
  const [offsetDays, setOffsetDays] = useState(0);
  const dragRef = useRef<{ x: number; offset: number } | null>(null);
  // Set true while a bar is actually dragged, so a plain click still navigates.
  const barMovedRef = useRef(false);
  const [barDrag, setBarDrag] = useState<BarDrag | null>(null);
  const barDragRef = useRef<BarDrag | null>(null);
  barDragRef.current = barDrag;
  const canDrag = editable && !!onSchedule;
  const dayWidthRef = useRef(1);

  // Global listeners for an active bar drag: live preview, commit on drop.
  useEffect(() => {
    if (!barDrag) return;
    const onMove = (e: MouseEvent) => {
      const d = barDragRef.current;
      if (!d) return;
      if (Math.abs(e.clientX - d.startX) > 3) barMovedRef.current = true;
      const deltaDays = Math.round((e.clientX - d.startX) / dayWidthRef.current);
      const deltaMs = deltaDays * DAY_MS;
      let startMs = d.origStartMs;
      let endMs = d.origEndMs;
      if (d.mode === "move") {
        startMs = d.origStartMs + deltaMs;
        endMs = d.origEndMs + deltaMs;
      } else if (d.mode === "start") {
        startMs = Math.min(d.origStartMs + deltaMs, d.origEndMs - DAY_MS);
      } else {
        endMs = Math.max(d.origEndMs + deltaMs, d.origStartMs + DAY_MS);
      }
      setBarDrag({ ...d, startMs, endMs });
    };
    const onUp = () => {
      const d = barDragRef.current;
      if (d && onSchedule) {
        const changed = d.startMs !== d.origStartMs || d.endMs !== d.origEndMs;
        if (changed) onSchedule(d.id, { start_date: toIso(d.startMs), end_date: toIso(d.endMs) });
      }
      setBarDrag(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [barDrag, onSchedule]);

  const dated = data.projects.filter((p) => p.start_date);
  const undated = data.projects.filter((p) => !p.start_date);

  if (dated.length === 0) {
    return (
      <div style={{ padding: 24, fontSize: 13, color: "var(--text-tertiary)" }}>
        No projects have start dates yet — set start/end dates to see them on the timeline.
      </div>
    );
  }

  const starts = dated.map((p) => new Date(p.start_date!).getTime());
  const ends = dated.map((p) =>
    p.end_date ? new Date(p.end_date).getTime() : new Date(p.start_date!).getTime() + 30 * DAY_MS,
  );
  const baseMin = Math.min(...starts, Date.now()) - 10 * DAY_MS;
  const baseMax = Math.max(...ends, Date.now()) + 14 * DAY_MS;
  const min = baseMin + offsetDays * DAY_MS;
  const max = baseMax + offsetDays * DAY_MS;
  const totalDays = Math.max(14, Math.round((max - min) / DAY_MS));

  const labelWidth = 260;
  const dayWidth = Math.max(8, Math.min(38, (1280 / totalDays) * zoom));
  dayWidthRef.current = dayWidth;
  const gridWidth = totalDays * dayWidth;
  const rowHeight = 52;
  const barHeight = 22;

  const x = (iso: string) => ((new Date(iso).getTime() - min) / DAY_MS) * dayWidth;

  const xMs = (ms: number) => ((ms - min) / DAY_MS) * dayWidth;
  const rows: Layout[] = dated.map((p, i) => {
    const dragging = barDrag && barDrag.id === p.id;
    const start = dragging ? xMs(barDrag.startMs) : x(p.start_date!);
    const end = dragging
      ? xMs(barDrag.endMs)
      : p.end_date
        ? x(p.end_date)
        : start + 30 * dayWidth;
    const semantic = toSemantic(String(p.health_status));
    const { fg, bg } = semanticColor(semantic);
    const startMs = new Date(p.start_date!).getTime();
    const endMs = p.end_date ? new Date(p.end_date).getTime() : startMs + 30 * DAY_MS;
    return {
      id: p.id,
      name: p.name,
      left: start,
      width: Math.max(end - start, 10),
      row: i,
      color: fg,
      bg,
      pulse: semantic === "blocked" || semantic === "delayed",
      progress: Number(p.progress_percentage),
      currentPhase: p.current_phase,
      startMs,
      endMs,
      milestones: p.milestones
        .filter((m) => m.due_date)
        .map((m) => ({
          name: m.name,
          x: x(m.due_date!),
          done: !!m.completed_at,
          date: new Date(m.due_date!).toLocaleDateString([], { month: "short", day: "numeric" }),
        })),
    };
  });
  const rowById = new Map(rows.map((r) => [r.id, r]));
  const todayX = ((Date.now() - min) / DAY_MS) * dayWidth;

  const months: { label: string; x: number; width: number }[] = [];
  const cursor = new Date(min);
  cursor.setDate(1);
  while (cursor.getTime() < max) {
    const next = new Date(cursor);
    next.setMonth(cursor.getMonth() + 1);
    months.push({
      label: cursor.toLocaleDateString([], { month: "short", year: "numeric" }),
      x: ((cursor.getTime() - min) / DAY_MS) * dayWidth,
      width: Math.max(64, ((next.getTime() - cursor.getTime()) / DAY_MS) * dayWidth),
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  // Dated tick row: pick a step so labels stay ~70px apart and never collide.
  // Denser when zoomed in (each day wide), sparser when zoomed out.
  const stepDays = dayWidth >= 26 ? 1 : dayWidth >= 14 ? 2 : dayWidth >= 8 ? 7 : 14;
  const dayTicks: { label: string; x: number }[] = [];
  const tickCursor = new Date(min);
  tickCursor.setHours(0, 0, 0, 0);
  // Align the first tick to a step boundary from the range start.
  while (tickCursor.getTime() < max) {
    dayTicks.push({
      label: tickCursor.toLocaleDateString([], { month: "short", day: "numeric" }),
      x: ((tickCursor.getTime() - min) / DAY_MS) * dayWidth,
    });
    tickCursor.setDate(tickCursor.getDate() + stepDays);
  }

  const height = rows.length * rowHeight;
  const panBy = (days: number) => setOffsetDays((current) => current + days);

  const beginBarDrag = (e: React.PointerEvent, r: Layout, mode: BarDragMode) => {
    if (!canDrag) return;
    e.preventDefault();
    e.stopPropagation(); // don't start a timeline pan
    barMovedRef.current = false;
    setBarDrag({
      id: r.id,
      mode,
      startX: e.clientX,
      origStartMs: r.startMs,
      origEndMs: r.endMs,
      startMs: r.startMs,
      endMs: r.endMs,
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-tertiary)", fontSize: 12.5 }}>
          <GripHorizontal size={15} /> Drag the timeline or use controls
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" title="Earlier dates" aria-label="Pan earlier" onClick={() => panBy(-14)} style={toolButton}>
            <ChevronLeft size={15} />
          </button>
          <button type="button" title="Later dates" aria-label="Pan later" onClick={() => panBy(14)} style={toolButton}>
            <ChevronRight size={15} />
          </button>
          <button type="button" title="Zoom out" aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(0.55, Number((value - 0.2).toFixed(2))))} style={toolButton}>
            <ZoomOut size={15} />
          </button>
          <button type="button" title="Zoom in" aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(2.8, Number((value + 0.2).toFixed(2))))} style={toolButton}>
            <ZoomIn size={15} />
          </button>
        </div>
      </div>
      <div
        style={{ overflowX: "auto", cursor: "grab" }}
        onPointerDown={(event) => {
          dragRef.current = { x: event.clientX, offset: offsetDays };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!dragRef.current) return;
          const deltaPx = event.clientX - dragRef.current.x;
          setOffsetDays(Math.round(dragRef.current.offset - deltaPx / dayWidth));
        }}
        onPointerUp={() => {
          dragRef.current = null;
        }}
        onPointerCancel={() => {
          dragRef.current = null;
        }}
      >
      <div style={{ minWidth: `max(100%, ${labelWidth + gridWidth}px)`, position: "relative" }}>
        {/* Month header */}
        <div style={{ display: "flex" }}>
          <div style={{ width: labelWidth, flexShrink: 0 }} />
          <div style={{ position: "relative", width: gridWidth, height: 24 }}>
            {months.map((m) => (
              <span
                key={m.label + m.x}
                style={{
                  position: "absolute",
                  left: m.x,
                  width: m.width,
                  fontSize: 11.5,
                  fontWeight: 700,
                  fontFamily: "var(--font-mono)",
                  color: "var(--text-secondary)",
                  borderLeft: "1px solid var(--border-default)",
                  paddingLeft: 7,
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                {m.label}
              </span>
            ))}
          </div>
        </div>

        {/* Dated tick row — specific dates so the timeline is readable */}
        <div style={{ display: "flex" }}>
          <div style={{ width: labelWidth, flexShrink: 0 }} />
          <div style={{ position: "relative", width: gridWidth, height: 20 }}>
            {dayTicks.map((t) => (
              <span
                key={`tick-${t.x}`}
                style={{
                  position: "absolute",
                  left: t.x,
                  transform: "translateX(-50%)",
                  fontSize: 10,
                  fontFamily: "var(--font-mono)",
                  color: "var(--text-tertiary)",
                  whiteSpace: "nowrap",
                  pointerEvents: "none",
                }}
              >
                {t.label}
              </span>
            ))}
          </div>
        </div>

        <div style={{ display: "flex" }}>
          {/* Labels */}
          <div style={{ width: labelWidth, flexShrink: 0 }}>
            {rows.map((r) => (
              <div
                key={r.id}
                style={{
                  height: rowHeight,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  paddingRight: 16,
                  borderTop: "1px solid var(--border-subtle)",
                }}
              >
                <Link
                  href={`/projects/${r.id}`}
                  style={{ fontSize: 13.5, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                >
                  {r.name}
                </Link>
                {r.currentPhase && (
                  <span style={{ fontSize: 10.5, color: "var(--text-tertiary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {r.currentPhase}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Grid */}
          <div style={{ position: "relative", width: gridWidth, height }}>
            {rows.map((r) => (
              <div
                key={`grid-${r.id}`}
                style={{ position: "absolute", top: r.row * rowHeight, left: 0, right: 0, height: rowHeight, borderTop: "1px solid var(--border-subtle)" }}
              />
            ))}

            {/* Vertical date gridlines aligned to the tick row */}
            {dayTicks.map((t) => (
              <div
                key={`vline-${t.x}`}
                style={{ position: "absolute", top: 0, bottom: 0, left: t.x, width: 1, background: "var(--border-subtle)", opacity: 0.5, pointerEvents: "none" }}
              />
            ))}

            {/* Today line */}
            {todayX >= 0 && todayX <= gridWidth && (
              <div style={{ position: "absolute", top: 0, bottom: 0, left: todayX, width: 2, background: "var(--status-delayed)", zIndex: 3 }} />
            )}

            {/* Dependency arrows */}
            <svg width={gridWidth} height={height} style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 2 }}>
              <defs>
                <marker id="dep-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                  <path d="M0,0 L7,3.5 L0,7 Z" fill="var(--accent-secondary)" />
                </marker>
              </defs>
              {data.links.map((l) => {
                const from = rowById.get(l.predecessor_project_id);
                const to = rowById.get(l.successor_project_id);
                if (!from || !to) return null;
                const x1 = from.left + from.width;
                const y1 = from.row * rowHeight + rowHeight / 2;
                const x2 = to.left;
                const y2 = to.row * rowHeight + rowHeight / 2;
                const midX = Math.max(x1 + 14, x2 - 14);
                return (
                  <path
                    key={l.id}
                    d={`M ${x1} ${y1} C ${x1 + 24} ${y1}, ${midX - 24} ${y2}, ${Math.max(x2 - 4, x1 + 8)} ${y2}`}
                    fill="none"
                    stroke="var(--accent-secondary)"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    markerEnd="url(#dep-arrow)"
                    opacity={0.85}
                  />
                );
              })}
            </svg>

            {/* Bars */}
            {rows.map((r) => (
              <div key={`bar-${r.id}`}>
                <div
                  className={r.pulse && !(barDrag && barDrag.id === r.id) ? "pmp-pulse" : undefined}
                  title={canDrag ? `${r.name} · drag to reschedule · click to open` : `${r.name} · ${Math.round(r.progress)}% · click to open`}
                  onPointerDown={canDrag ? (e) => beginBarDrag(e, r, "move") : undefined}
                  onClick={() => {
                    // Ignore the click that ends a real drag; otherwise open the project.
                    if (barMovedRef.current) {
                      barMovedRef.current = false;
                      return;
                    }
                    router.push(`/projects/${r.id}`);
                  }}
                  style={{
                    position: "absolute",
                    top: r.row * rowHeight + (rowHeight - barHeight) / 2,
                    left: r.left,
                    width: r.width,
                    height: barHeight,
                    borderRadius: 7,
                    background: r.bg,
                    border: `1px solid ${r.color}`,
                    overflow: "hidden",
                    zIndex: 1,
                    cursor: canDrag ? "grab" : "pointer",
                    boxShadow: barDrag && barDrag.id === r.id ? `0 0 0 2px ${r.color}` : undefined,
                  }}
                >
                  <div style={{ width: `${Math.max(0, Math.min(100, r.progress))}%`, height: "100%", background: r.color, opacity: 0.85, pointerEvents: "none" }} />
                  {canDrag && (
                    <>
                      <div
                        onPointerDown={(e) => beginBarDrag(e, r, "start")}
                        title="Drag project start"
                        style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 9, cursor: "ew-resize" }}
                      />
                      <div
                        onPointerDown={(e) => beginBarDrag(e, r, "end")}
                        title="Drag project end"
                        style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 9, cursor: "ew-resize" }}
                      />
                    </>
                  )}
                </div>
                {r.milestones.map((m, i) => (
                  <span
                    key={i}
                    title={`${m.name} · ${m.date}${m.done ? " ✓" : ""}`}
                    style={{
                      position: "absolute",
                      top: r.row * rowHeight + rowHeight / 2 - 7,
                      left: m.x - 7,
                      zIndex: 4,
                      color: m.done ? "var(--status-completed)" : "var(--accent-gold-bright)",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <Diamond size={14} fill={m.done ? "var(--status-completed)" : "var(--accent-gold)"} style={{ flexShrink: 0 }} />
                    <span
                      style={{
                        fontSize: 10,
                        lineHeight: 1.1,
                        whiteSpace: "nowrap",
                        color: m.done ? "var(--text-tertiary)" : "var(--text-secondary)",
                        textShadow: "0 1px 3px var(--surface-1)",
                      }}
                    >
                      <span style={{ fontWeight: 700 }}>{m.name}</span>
                      <span style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}> · {m.date}</span>
                    </span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>

        {undated.length > 0 && (
          <div style={{ padding: "10px 0 0", fontSize: 11.5, color: "var(--text-tertiary)" }}>
            {undated.length} project(s) without dates are hidden from the timeline.
          </div>
        )}
      </div>
    </div>
    </div>
  );
}

const toolButton: React.CSSProperties = {
  width: 34,
  height: 32,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "var(--radius-2)",
  border: "1px solid var(--border-default)",
  background: "var(--surface-2)",
  color: "var(--text-secondary)",
  cursor: "pointer",
};
