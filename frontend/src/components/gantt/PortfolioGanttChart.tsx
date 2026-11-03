"use client";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { LocalizedText } from "@/lib/i18n/I18nProvider";

/* Project-level Gantt: one row per project, date-scaled bars with progress
   fill, milestone diamonds, cross-project dependency arrows (SVG overlay),
   a today line, and a pulse on blocked/delayed projects. */

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Diamond, GripHorizontal, ZoomIn, ZoomOut } from "lucide-react";
import { toSemantic, semanticColor } from "@/lib/format";
import { StatusChip } from "@/components/ds";
import type { PortfolioGantt } from "@/lib/types";
import { calendarMonth, monthBoundary, shiftMonth } from "@/lib/i18n/calendar-month";

const DAY_MS = 86_400_000;

interface Layout {
  id: string;
  name: string;
  left: number;
  width: number;
  row: number;
  color: string;
  bg: string;
  healthStatus: string;
  pulse: boolean;
  archived: boolean;
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
  return new Date(ms).toISOString().slice(0, 10);
}

function dateMs(value?: string | null): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms) && toIso(ms) === value ? ms : null;
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
  const { t: translateUI, date: displayDate, locale, calendar, number: displayNumber } = useI18n();

  const router = useRouter();
  const [zoom, setZoom] = useState(1);
  const [offsetDays, setOffsetDays] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1280);
  const markerId = `dependency-${useId().replace(/:/g, "")}`;
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setContainerWidth(node.clientWidth));
    setContainerWidth(node.clientWidth);
    observer.observe(node);
    return () => observer.disconnect();
  }, [data]);
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
    const onMove = (e: PointerEvent) => {
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
        startMs = Math.min(d.origStartMs + deltaMs, d.origEndMs);
      } else {
        endMs = Math.max(d.origEndMs + deltaMs, d.origStartMs);
      }
      barDragRef.current = { ...d, startMs, endMs };
      setBarDrag(barDragRef.current);
    };
    const onUp = () => {
      const d = barDragRef.current;
      if (d && onSchedule) {
        const changed = d.startMs !== d.origStartMs || d.endMs !== d.origEndMs;
        if (changed) onSchedule(d.id, { start_date: toIso(d.startMs), end_date: toIso(d.endMs) });
      }
      setBarDrag(null);
      barDragRef.current = null;
    };
    const onCancel = () => { setBarDrag(null); barDragRef.current = null; };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
  }, [barDrag, onSchedule]);

  const dated = data.projects.filter((p) => dateMs(p.start_date) !== null);
  const undated = data.projects.filter((p) => dateMs(p.start_date) === null);

  if (dated.length === 0) {
    return (
      <div style={{ padding: 32, fontSize: 13, color: "var(--text-tertiary)", textAlign: "center", background: "var(--surface-2)", borderRadius: "var(--radius-3)", border: "1px solid var(--border-subtle)" }}>{" "}<LocalizedText message={"No projects have start dates scheduled. Set start and due dates to view them on the interactive timeline."} />{" "}</div>
    );
  }

  const now = new Date();
  const todayMs = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const starts = dated.map((p) => dateMs(p.start_date)!);
  const ends = dated.map((p) =>
    Math.max(dateMs(p.start_date)!, dateMs(p.end_date) ?? dateMs(p.start_date)! + 29 * DAY_MS),
  );
  const baseMin = Math.min(...starts, todayMs) - 10 * DAY_MS;
  const baseMax = Math.max(...ends, todayMs) + 15 * DAY_MS;
  const min = baseMin + offsetDays * DAY_MS;
  const max = baseMax + offsetDays * DAY_MS;
  const totalDays = Math.max(14, Math.round((max - min) / DAY_MS));

  const labelWidth = containerWidth < 600 ? 180 : 320;
  const availableWidth = Math.max(160, containerWidth - labelWidth);
  const dayWidth = Math.max(0.1, Math.min(120, (availableWidth / totalDays) * zoom));
  dayWidthRef.current = dayWidth;
  const gridWidth = totalDays * dayWidth;
  const rowHeight = 56;
  const barHeight = 24;

  const x = (iso: string) => ((dateMs(iso)! - min) / DAY_MS) * dayWidth;
  const xMs = (ms: number) => ((ms - min) / DAY_MS) * dayWidth;

  const rows: Layout[] = dated.map((p, i) => {
    const dragging = barDrag && barDrag.id === p.id;
    const start = dragging ? xMs(barDrag.startMs) : x(p.start_date!);
    const end = dragging
      ? xMs(barDrag.endMs)
      : p.end_date
        ? xMs(ends[i])
        : start + 29 * dayWidth;
    const status = p.status === "in-progress" && ["blocked", "delayed", "at-risk"].includes(p.health_status) ? p.health_status : p.status;
    const semantic = toSemantic(String(status));
    const { fg, bg } = semanticColor(semantic);
    const startMs = starts[i];
    const endMs = ends[i];
    return {
      id: p.id,
      name: p.name,
      left: start,
      width: Math.max(end - start + dayWidth, 2),
      row: i,
      color: fg,
      bg,
      healthStatus: String(status),
      pulse: semantic === "blocked" || semantic === "delayed",
      archived: p.status === "archived",
      progress: Number.isFinite(Number(p.progress_percentage)) ? Number(p.progress_percentage) : 0,
      currentPhase: p.current_sprint ?? p.current_phase,
      startMs,
      endMs,
      milestones: p.milestones
        .filter((m) => dateMs(m.due_date) !== null)
        .map((m) => ({
          name: m.name,
          x: x(m.due_date!),
          done: !!m.completed_at,
          date: displayDate(m.due_date!, { year: undefined, month: "short", day: "numeric" }),
        })),
    };
  });
  const rowById = new Map(rows.map((r) => [r.id, r]));
  const todayX = ((todayMs - min) / DAY_MS + 0.5) * dayWidth;

  const months: { label: string; x: number; width: number }[] = [];
  let month = calendarMonth(toIso(min), calendar);
  const monthStride = dayWidth * 30 >= 72 ? 1 : dayWidth * 90 >= 72 ? 3 : 12;
  const [headerYear, headerMonth] = month.split("-").map(Number);
  month = `${headerYear}-${String(Math.floor((headerMonth - 1) / monthStride) * monthStride + 1).padStart(2, "0")}`;
  while (dateMs(monthBoundary(month, calendar))! < max) {
    const cursor = dateMs(monthBoundary(month, calendar))!;
    const next = dateMs(monthBoundary(shiftMonth(month, monthStride), calendar))!;
    const visibleStart = Math.max(cursor, min);
    const visibleEnd = Math.min(next, max);
    months.push({
      label: displayDate(toIso(cursor), { day: undefined, month: monthStride === 12 ? undefined : "short", year: "numeric" }),
      x: ((visibleStart - min) / DAY_MS) * dayWidth,
      width: ((visibleEnd - visibleStart) / DAY_MS) * dayWidth,
    });
    month = shiftMonth(month, monthStride);
  }

  // Adaptive tick spacing: guarantee minimum 72px between ticks to eliminate all text collisions
  const minPxPerTick = 72;
  const rawStep = Math.ceil(minPxPerTick / dayWidth);
  const stepDays = [1, 3, 7, 14, 30, 60, 90, 180, 365].find(step => step >= rawStep) ?? Math.ceil(rawStep / 365) * 365;
  const dayTicks: { label: string; x: number }[] = [];
  let tickCursor = min;
  while (tickCursor < max) {
    dayTicks.push({
      label: displayDate(toIso(tickCursor), { year: undefined, month: "short", day: "numeric" }),
      x: ((tickCursor - min) / DAY_MS) * dayWidth,
    });
    tickCursor += stepDays * DAY_MS;
  }

  const height = rows.length * rowHeight;
  const panBy = (days: number) => setOffsetDays((current) => current + days);

  const beginBarDrag = (e: React.PointerEvent, r: Layout, mode: BarDragMode) => {
    e.stopPropagation();
    if (!canDrag || e.button !== 0) return;
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
          <GripHorizontal size={15} />{" "}<LocalizedText message={"Drag the timeline or use controls"} />{" "}</div>
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" title={translateUI("Earlier dates")} aria-label={translateUI("Pan earlier")} onClick={() => panBy(-14)} style={toolButton}>
            <ChevronLeft size={15} />
          </button>
          <button type="button" title={translateUI("Later dates")} aria-label={translateUI("Pan later")} onClick={() => panBy(14)} style={toolButton}>
            <ChevronRight size={15} />
          </button>
          <button type="button" title={translateUI("Zoom out")} aria-label={translateUI("Zoom out")} onClick={() => setZoom((value) => Math.max(0.55, Number((value - 0.2).toFixed(2))))} style={toolButton}>
            <ZoomOut size={15} />
          </button>
          <button type="button" title={translateUI("Zoom in")} aria-label={translateUI("Zoom in")} onClick={() => setZoom((value) => Math.min(2.8, Number((value + 0.2).toFixed(2))))} style={toolButton}>
            <ZoomIn size={15} />
          </button>
        </div>
      </div>
      <div
        ref={scrollRef}
        className="pmp-chart-time-axis"
        style={{ overflowX: "auto", maxWidth: "100%", cursor: "grab", touchAction: "pan-y" }}
        onPointerDown={(event) => {
          if (event.button !== 0 || (event.target as Element).closest("a, button, [data-project-label], [data-timeline-bar]")) return;
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
      <div style={{ width: labelWidth + gridWidth, position: "relative" }}>
        {/* Month header */}
        <div style={{ display: "flex" }}>
          <div style={{ width: labelWidth, flexShrink: 0, position: "sticky", left: 0, zIndex: 6, background: "var(--surface-1)" }} />
          <div style={{ position: "relative", width: gridWidth, flexShrink: 0, height: 24, overflow: "hidden" }}>
            {months.map((m) => (
              <span
                key={m.label + m.x}
                style={{
                  position: "absolute",
                  left: m.x,
                  width: m.width,
                  fontSize: 11.5,
                  fontWeight: 700,
                  fontFamily: locale === "fa" ? "var(--font-sans)" : "var(--font-mono)",
                  color: "var(--text-secondary)",
                  borderLeft: "1px solid var(--border-default)",
                  paddingLeft: 7,
                  height: "100%",
                  boxSizing: "border-box",
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                {m.width >= 64 ? m.label : ""}
              </span>
            ))}
          </div>
        </div>

        {/* Dated tick row — specific dates so the timeline is readable */}
        <div style={{ display: "flex" }}>
          <div style={{ width: labelWidth, flexShrink: 0, position: "sticky", left: 0, zIndex: 6, background: "var(--surface-1)" }} />
          <div style={{ position: "relative", width: gridWidth, flexShrink: 0, height: 20, overflow: "hidden" }}>
            {dayTicks.map((t) => (
              <span
                key={`tick-${t.x}`}
                style={{
                  position: "absolute",
                  left: t.x,
                  transform: "none",
                  fontSize: 10,
                  fontFamily: locale === "fa" ? "var(--font-sans)" : "var(--font-mono)",
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
          {/* Labels Column matching Project Timeline */}
          <div data-project-label dir={locale === "fa" ? "rtl" : "ltr"} style={{ width: labelWidth, flexShrink: 0, boxSizing: "border-box", position: "sticky", left: 0, zIndex: 6, borderRight: "1px solid var(--border-default)", background: "var(--surface-1)" }}>
            {rows.map((r) => (
              <div
                key={r.id}
                className={r.archived ? "pmp-archived" : undefined}
                style={{
                  height: rowHeight,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0 14px",
                  borderTop: "1px solid var(--border-subtle)",
                  gap: 8,
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <Link
                    href={`/projects/${r.id}`}
                    style={{ fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block", color: r.archived ? "var(--text-secondary)" : "var(--text-primary)", textDecoration: "none" }}
                    title={r.name}
                  >
                    {r.name}
                  </Link>
                  {r.currentPhase && (
                    <span style={{ fontSize: 10.5, color: "var(--text-tertiary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>
                      {r.currentPhase}
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                  <StatusChip status={r.healthStatus} />
                </div>
              </div>
            ))}
          </div>

          {/* Grid */}
          <div data-timeline-grid style={{ position: "relative", width: gridWidth, flexShrink: 0, height, overflow: "hidden" }}>
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
                style={{ position: "absolute", top: 0, bottom: 0, left: t.x, width: 1, background: "var(--border-subtle)", opacity: 0.4, pointerEvents: "none" }}
              />
            ))}

            {/* Today line & today pill */}
            {todayX >= 0 && todayX <= gridWidth && (
              <>
                <div style={{ position: "absolute", top: 0, bottom: 0, left: todayX, width: 2, background: "var(--status-delayed)", zIndex: 3 }} />
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: todayX,
                    transform: "translateX(-50%)",
                    background: "var(--status-delayed)",
                    color: "#FFFFFF",
                    fontSize: 9.5,
                    fontWeight: 800,
                    padding: "1px 6px",
                    borderRadius: "var(--radius-full)",
                    zIndex: 4,
                    whiteSpace: "nowrap",
                  }}
                >{" "}<LocalizedText message={"Today"} />{" "}</div>
              </>
            )}

            {/* Dependency arrows */}
            <svg width={gridWidth} height={height} style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 2 }}>
              <defs>
                <marker id={markerId} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
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
                    d={`M ${x1} ${y1} C ${x1 + 24} ${y1}, ${midX} ${y2}, ${x2 - 4} ${y2}`}
                    fill="none"
                    stroke="var(--accent-secondary)"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    markerEnd={`url(#${markerId})`}
                    opacity={0.85}
                  />
                );
              })}
            </svg>

            {/* Bars */}
            {rows.map((r) => (
              <div key={`bar-${r.id}`}>
                <div
                  data-timeline-bar={r.id}
                  role="link"
                  tabIndex={0}
                  aria-label={r.name}
                  onKeyDown={event => { if (event.key === "Enter") router.push(`/projects/${r.id}`); }}
                  className={r.archived ? "pmp-archived pmp-archived-timeline-bar" : r.pulse && !(barDrag && barDrag.id === r.id) ? "pmp-pulse" : undefined}
                  title={canDrag ? `${r.name} · drag to reschedule · click to open` : `${r.name} · ${Math.round(r.progress)}% · click to open`}
                  onPointerDown={(e) => beginBarDrag(e, r, "move")}
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
                  <div style={{ width: `${Math.max(0, Math.min(100, r.progress))}%`, height: "100%", background: r.archived ? "var(--text-tertiary)" : r.color, opacity: r.archived ? 0.45 : 0.85, pointerEvents: "none" }} />
                  {canDrag && (
                    <>
                      <div
                        onPointerDown={(e) => beginBarDrag(e, r, "start")}
                        title={translateUI("Drag project start")}
                        style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 9, cursor: "ew-resize" }}
                      />
                      <div
                        onPointerDown={(e) => beginBarDrag(e, r, "end")}
                        title={translateUI("Drag project end")}
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
                      <span style={{ color: "var(--text-tertiary)", fontFamily: locale === "fa" ? "var(--font-sans)" : "var(--font-mono)" }}> · {m.date}</span>
                    </span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>

        {undated.length > 0 && (
          <div style={{ padding: "10px 0 0", fontSize: 11.5, color: "var(--text-tertiary)" }}>
            {displayNumber(undated.length)}{" "}<LocalizedText message={"project(s) without dates are hidden from the timeline."} />{" "}</div>
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
