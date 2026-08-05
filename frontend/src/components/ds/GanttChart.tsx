"use client";

import { useEffect, useRef, useState } from "react";
import { toSemantic, semanticColor } from "@/lib/format";

export interface GanttBar {
  id?: string; // task id; enables open + quick-edit + drag
  name: string;
  startOffset: number; // days from chart start
  duration: number; // days
  status: string;
  progress?: number;
  critical?: boolean;
  overdueDays?: number; // red tail from bar end to today (unfinished + past due)
  doneLate?: boolean; // completed but after due date → lighter green
  dueDate?: string | null; // ISO due date, for the inline quick-edit
}

interface Props {
  tasks: GanttBar[];
  days: number;
  todayOffset?: number | null; // days from chart start; null hides the line
  startDate?: string | null; // ISO date of column 0; enables real calendar labels
  dayWidth?: number;
  labelWidth?: number;
  onOpen?: (id: string) => void; // click task → open detail
  onUpdateDue?: (id: string, dueDate: string) => void; // inline deadline edit
  // Drag-reschedule (project manager+): fires on drop with the new dates.
  editable?: boolean;
  onSchedule?: (id: string, dates: { start_date: string; due_date: string }) => void;
  /** Freeze zoom, drag-pan, label resizing and schedule edits. Native scrolling remains available. */
  interactionLocked?: boolean;
}

type DragMode = "move" | "start" | "end";
interface DragState {
  id: string;
  mode: DragMode;
  startX: number;
  origOffset: number;
  origDuration: number;
  offset: number; // live preview
  duration: number; // live preview
}

const MIN_DAY_WIDTH = 6; // most zoomed-out
const MAX_DAY_WIDTH = 120; // most zoomed-in
const MIN_LABEL_WIDTH = 90;
const MAX_LABEL_WIDTH = 520;

// Pan the time axis by dragging empty grid; resize the label column by dragging
// the splitter. Kept separate from the bar-reschedule DragState above.
interface PanState {
  startX: number;
  startScroll: number;
}
interface LabelResizeState {
  startX: number;
  startWidth: number;
}

/** chart-start + N days → ISO yyyy-mm-dd (local). */
function offsetToIso(chartStart: Date, offset: number): string {
  const d = new Date(chartStart);
  d.setDate(d.getDate() + offset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function GanttChart({
  tasks,
  days,
  todayOffset = null,
  startDate = null,
  dayWidth: dayWidthProp = 34,
  labelWidth: labelWidthProp = 200,
  onOpen,
  onUpdateDue,
  editable = false,
  onSchedule,
  interactionLocked = false,
}: Props) {
  // Zoom (dayWidth) + label column width are interactive. Props seed the initial
  // value; once the user zooms/pans/resizes we own it and ignore prop changes
  // (the parent recomputes dayWidth on container resize to fit — we opt out of
  // that once the user has taken control).
  const [dayWidth, setDayWidth] = useState(dayWidthProp);
  const [labelWidth, setLabelWidth] = useState(labelWidthProp);
  const userOwnsZoom = useRef(false);
  useEffect(() => {
    if (!userOwnsZoom.current) setDayWidth(dayWidthProp);
  }, [dayWidthProp]);

  const rowHeight = 34;
  const gridWidth = days * dayWidth;
  const chartStart = startDate ? new Date(startDate) : null;
  const today = todayOffset != null ? Math.round(todayOffset) : null;
  const canDrag = !interactionLocked && editable && !!onSchedule && !!chartStart;

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;

  // Wheel-to-zoom the time axis, anchored at the cursor (TradingView feel):
  // the day under the pointer stays put while dayWidth scales.
  const onWheel = (e: React.WheelEvent) => {
    if (drag || interactionLocked) return;
    // Horizontal intent (shift or trackpad X) → pan, let native scroll handle it.
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    e.preventDefault();
    const sc = scrollRef.current;
    if (!sc) return;
    const rect = sc.getBoundingClientRect();
    const cursorInGrid = e.clientX - rect.left + sc.scrollLeft - labelWidth;
    const dayAtCursor = cursorInGrid / dayWidth;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const next = Math.min(MAX_DAY_WIDTH, Math.max(MIN_DAY_WIDTH, dayWidth * factor));
    if (next === dayWidth) return;
    userOwnsZoom.current = true;
    setDayWidth(next);
    // Restore cursor anchor after the width change.
    requestAnimationFrame(() => {
      if (scrollRef.current)
        scrollRef.current.scrollLeft = dayAtCursor * next + labelWidth - (e.clientX - rect.left);
    });
  };

  // Drag empty grid background → pan the time axis horizontally.
  const [pan, setPan] = useState<PanState | null>(null);
  const panRef = useRef<PanState | null>(null);
  panRef.current = pan;
  useEffect(() => {
    if (!pan) return;
    const onMove = (e: MouseEvent) => {
      const p = panRef.current;
      const sc = scrollRef.current;
      if (!p || !sc) return;
      sc.scrollLeft = p.startScroll - (e.clientX - p.startX);
    };
    const onUp = () => setPan(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [pan]);
  const beginPan = (e: React.MouseEvent) => {
    if (drag || interactionLocked || !scrollRef.current) return;
    userOwnsZoom.current = true;
    setPan({ startX: e.clientX, startScroll: scrollRef.current.scrollLeft });
  };

  // Drag the label/grid splitter → resize the name column.
  const [labelResize, setLabelResize] = useState<LabelResizeState | null>(null);
  const labelResizeRef = useRef<LabelResizeState | null>(null);
  labelResizeRef.current = labelResize;
  useEffect(() => {
    if (!labelResize) return;
    const onMove = (e: MouseEvent) => {
      const r = labelResizeRef.current;
      if (!r) return;
      const w = Math.min(MAX_LABEL_WIDTH, Math.max(MIN_LABEL_WIDTH, r.startWidth + (e.clientX - r.startX)));
      setLabelWidth(w);
    };
    const onUp = () => setLabelResize(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [labelResize]);

  useEffect(() => {
    if (!interactionLocked) return;
    setDrag(null);
    setPan(null);
    setLabelResize(null);
  }, [interactionLocked]);

  // Global mouse listeners for the active drag: update live preview, commit on up.
  useEffect(() => {
    if (!drag) return;
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const deltaDays = Math.round((e.clientX - d.startX) / dayWidth);
      let offset = d.origOffset;
      let duration = d.origDuration;
      if (d.mode === "move") {
        offset = d.origOffset + deltaDays;
      } else if (d.mode === "start") {
        offset = d.origOffset + deltaDays;
        duration = d.origDuration - deltaDays;
      } else {
        duration = d.origDuration + deltaDays;
      }
      offset = Math.max(0, offset);
      duration = Math.max(1, duration);
      setDrag({ ...d, offset, duration });
    };
    const onUp = () => {
      const d = dragRef.current;
      if (d && chartStart && onSchedule) {
        const changed = d.offset !== d.origOffset || d.duration !== d.origDuration;
        if (changed) {
          onSchedule(d.id, {
            start_date: offsetToIso(chartStart, d.offset),
            due_date: offsetToIso(chartStart, d.offset + Math.max(d.duration, 1) - 1),
          });
        }
      }
      setDrag(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [drag, dayWidth, chartStart, onSchedule]);

  const beginDrag = (e: React.MouseEvent, t: GanttBar, mode: DragMode) => {
    if (!canDrag || !t.id) return;
    e.preventDefault();
    e.stopPropagation();
    setDrag({
      id: t.id,
      mode,
      startX: e.clientX,
      origOffset: t.startOffset,
      origDuration: t.duration,
      offset: t.startOffset,
      duration: t.duration,
    });
  };

  // Ticks: column 0, every 10 days, the last column, and today (deduped).
  const dateLabel = (i: number): string => {
    if (!chartStart) return String(i + 1);
    const d = new Date(chartStart);
    d.setDate(d.getDate() + i);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };
  const tickSet = new Set<number>();
  for (let i = 0; i < days; i += 10) tickSet.add(i);
  tickSet.add(days - 1);
  if (today != null && today >= 0 && today <= days) tickSet.add(today);
  const ticks = Array.from(tickSet)
    .filter((i) => i >= 0 && i < days)
    .sort((a, b) => a - b);

  const busy = drag || pan || labelResize;

  return (
    <div
      ref={scrollRef}
      onWheel={onWheel}
      className="pmp-gantt-scroll"
      data-locked={interactionLocked ? "true" : "false"}
      aria-label={interactionLocked ? "Timeline locked. Scroll to view." : "Timeline unlocked. Wheel to zoom and drag to edit."}
      style={{ overflowX: "auto" }}
    >
      <div style={{ minWidth: labelWidth + gridWidth, userSelect: busy ? "none" : undefined }}>
        {/* Date header */}
        <div style={{ display: "flex", alignItems: "flex-end" }}>
          <div style={{ width: labelWidth, flexShrink: 0 }} />
          <div style={{ position: "relative", width: gridWidth, height: 22 }}>
            {ticks.map((i) => {
              const isToday = today != null && i === today;
              return (
                <div
                  key={i}
                  style={{
                    position: "absolute",
                    bottom: 4,
                    left: i * dayWidth + dayWidth / 2,
                    transform: "translateX(-50%)",
                    fontSize: 10.5,
                    fontFamily: "var(--font-mono)",
                    color: isToday ? "var(--status-delayed)" : "var(--text-tertiary)",
                    fontWeight: isToday ? 800 : 500,
                    whiteSpace: "nowrap",
                    pointerEvents: "none",
                  }}
                >
                  {dateLabel(i)}
                </div>
              );
            })}
          </div>
        </div>

        {/* Rows */}
        <div style={{ position: "relative" }}>
          {/* Today line spanning all rows */}
          {todayOffset != null && todayOffset >= 0 && todayOffset <= days && (
            <div
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: labelWidth + todayOffset * dayWidth,
                width: 2,
                background: "var(--status-delayed)",
                zIndex: 2,
                pointerEvents: "none",
              }}
            />
          )}

          {/* Label/grid splitter — drag to resize the name column */}
          <div
            onMouseDown={(e) => {
              if (interactionLocked) return;
              e.preventDefault();
              setLabelResize({ startX: e.clientX, startWidth: labelWidth });
            }}
            title={interactionLocked ? "Unlock timeline to resize the names column" : "Drag to resize names column"}
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: labelWidth - 3,
              width: 6,
              cursor: interactionLocked ? "default" : "col-resize",
              zIndex: 3,
              background: labelResize ? "var(--accent-primary)" : "transparent",
            }}
          />
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: labelWidth - 1,
              width: 1,
              background: "var(--border-subtle)",
              pointerEvents: "none",
            }}
          />

          {tasks.length === 0 && (
            <div style={{ padding: 24, color: "var(--text-tertiary)", fontSize: 13 }}>
              No scheduled tasks for this project.
            </div>
          )}

          {tasks.map((t, idx) => {
            const semantic = toSemantic(t.status);
            // Done on time = full green; done late = a lighter, desaturated green.
            const fg = t.doneLate
              ? "color-mix(in srgb, var(--status-completed) 45%, var(--surface-3))"
              : semanticColor(semantic).fg;
            const pulse = semantic === "blocked" || semantic === "delayed";
            const dragging = drag && drag.id === t.id;
            const effOffset = dragging ? drag.offset : t.startOffset;
            const effDuration = dragging ? drag.duration : t.duration;
            const left = effOffset * dayWidth;
            const width = Math.max(effDuration * dayWidth, 6);
            const overdue = t.overdueDays && t.overdueDays > 0 ? t.overdueDays : 0;
            const overdueWidth = overdue * dayWidth;
            const overdueLeft = left + width;
            const rowDraggable = canDrag && !!t.id;
            return (
              <div
                key={idx}
                style={{
                  display: "flex",
                  alignItems: "center",
                  height: rowHeight,
                  borderTop: "1px solid var(--border-subtle)",
                }}
              >
                <div
                  style={{
                    width: labelWidth,
                    flexShrink: 0,
                    paddingLeft: 12,
                    paddingRight: 10,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span
                    title={t.critical ? "On critical path" : undefined}
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      flexShrink: 0,
                      background: t.critical ? "var(--status-delayed)" : "transparent",
                    }}
                  />
                  {onOpen && t.id ? (
                    <button
                      type="button"
                      title={`Open ${t.name}`}
                      onClick={() => onOpen(t.id as string)}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        textAlign: "left",
                        border: "none",
                        background: "none",
                        padding: 0,
                        cursor: "pointer",
                        fontSize: 12.5,
                        color: "var(--text-primary)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {t.name}
                    </button>
                  ) : (
                    <span
                      title={t.name}
                      style={{
                        flex: 1,
                        fontSize: 12.5,
                        color: "var(--text-primary)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        minWidth: 0,
                      }}
                    >
                      {t.name}
                    </span>
                  )}
                  {!interactionLocked && onUpdateDue && t.id && (
                    <input
                      type="date"
                      value={t.dueDate ?? ""}
                      title="Set deadline"
                      onChange={(e) => e.target.value && onUpdateDue(t.id as string, e.target.value)}
                      style={{
                        flexShrink: 0,
                        width: 20,
                        height: 20,
                        padding: 0,
                        border: "none",
                        background: "none",
                        color: "var(--text-tertiary)",
                        cursor: "pointer",
                        colorScheme: "dark",
                      }}
                    />
                  )}
                </div>
                <div
                  onMouseDown={beginPan}
                  style={{
                    position: "relative",
                    width: gridWidth,
                    height: "100%",
                    cursor: interactionLocked ? "default" : pan ? "grabbing" : "grab",
                  }}
                >
                  {overdue > 0 && (
                    <div
                      title={`${t.name} · overdue ${overdue}d`}
                      style={{
                        position: "absolute",
                        top: (rowHeight - 16) / 2,
                        left: overdueLeft,
                        width: overdueWidth,
                        height: 16,
                        borderRadius: 5,
                        background: "color-mix(in srgb, var(--status-delayed) 12%, transparent)",
                        border: "1px dashed color-mix(in srgb, var(--status-delayed) 55%, transparent)",
                      }}
                    />
                  )}
                  <div
                    className={pulse && !dragging ? "pmp-pulse" : undefined}
                    title={
                      rowDraggable
                        ? `${t.name} · drag to reschedule`
                        : onOpen && t.id
                          ? `Open ${t.name} · ${t.status}`
                          : `${t.name} · ${t.status}`
                    }
                    onMouseDown={rowDraggable ? (e) => beginDrag(e, t, "move") : undefined}
                    onClick={!rowDraggable && onOpen && t.id ? () => onOpen(t.id as string) : undefined}
                    style={{
                      position: "absolute",
                      top: (rowHeight - 16) / 2,
                      left,
                      width,
                      height: 16,
                      borderRadius: 5,
                      background: `color-mix(in srgb, ${fg} 30%, transparent)`,
                      border: `1px solid ${fg}`,
                      overflow: "hidden",
                      cursor: rowDraggable ? "grab" : onOpen && t.id ? "pointer" : undefined,
                      boxShadow: dragging ? `0 0 0 2px ${fg}` : undefined,
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.max(0, Math.min(100, t.progress ?? 0))}%`,
                        height: "100%",
                        background: fg,
                        pointerEvents: "none",
                      }}
                    />
                    {/* Status label inside the bar (only if it fits). */}
                    {width >= 46 && (
                      <span
                        style={{
                          position: "absolute",
                          inset: 0,
                          display: "flex",
                          alignItems: "center",
                          paddingLeft: 6,
                          paddingRight: 6,
                          fontSize: 9.5,
                          lineHeight: 1,
                          fontFamily: "var(--font-mono)",
                          fontWeight: 600,
                          letterSpacing: "0.02em",
                          textTransform: "uppercase",
                          color: "var(--text-primary)",
                          textShadow: "0 1px 2px rgba(0,0,0,0.55)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          pointerEvents: "none",
                        }}
                      >
                        {t.status.replace(/_/g, " ")}
                      </span>
                    )}
                    {rowDraggable && (
                      <>
                        {/* left edge → drag start_date */}
                        <div
                          onMouseDown={(e) => beginDrag(e, t, "start")}
                          title="Drag start date"
                          style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 7, cursor: "ew-resize" }}
                        />
                        {/* right edge → drag due_date */}
                        <div
                          onMouseDown={(e) => beginDrag(e, t, "end")}
                          title="Drag deadline"
                          style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 7, cursor: "ew-resize" }}
                        />
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
