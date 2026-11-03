"use client";

import { useEffect, useId, useRef, useState, type InputHTMLAttributes } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { persianMonthDays, persianParts, persianToIso } from "@/lib/i18n/persian-date";
import styles from "./PersianDateInput.module.css";

const months = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];
const weekdays = ["ش", "ی", "د", "س", "چ", "پ", "ج"];
function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function PersianDateInput({ style, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  const intl = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const generatedId = useId();
  const panelId = `${generatedId}-calendar`;
  const iso = String(props.value ?? props.defaultValue ?? "");
  const selected = persianParts(iso);
  const todayIso = localToday();
  const today = persianParts(todayIso)!;
  const [month, setMonth] = useState(selected?.month ?? today.month);
  const [year, setYear] = useState(selected?.year ?? today.year);
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const disabled = props.disabled || props.readOnly;
  useEffect(() => {
    if (selected) { setYear(selected.year); setMonth(selected.month); }
  }, [iso]);
  useEffect(() => {
    if (open) panel.current?.scrollIntoView({ block: "nearest" });
  }, [open]);
  const count = persianMonthDays(year, month);
  const first = persianToIso(year, month, 1)!;
  const offset = (new Date(`${first}T12:00:00Z`).getUTCDay() + 1) % 7;

  function choose(value: string) {
    const node = input.current;
    if (!node) return;
    // Dispatch a real input event so callers keep receiving an ISO date from
    // the original input element, just as with the browser's date picker.
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(node, value);
    node.dispatchEvent(new Event("change", { bubbles: true }));
    setOpen(false);
    trigger.current?.focus();
  }
  function move(delta: number) {
    const next = month + delta;
    setMonth(next === 0 ? 12 : next === 13 ? 1 : next);
    setYear(Math.max(1, Math.min(9375, year + (next === 0 ? -1 : next === 13 ? 1 : 0))));
  }
  return <div className={styles.root} style={style} dir="rtl">
    <input {...props} ref={input} id={undefined} type="date" tabIndex={-1} aria-hidden="true" className={styles.canonical} />
    <button ref={trigger} id={props.id} type="button" className={styles.trigger} disabled={disabled}
      aria-label={props["aria-label"]} aria-describedby={props["aria-describedby"]}
      aria-expanded={open} aria-controls={panelId}
      onClick={() => { if (!disabled) setOpen(!open); }}>
      <bdi>{iso ? intl.date(iso, { year: "numeric", month: "2-digit", day: "2-digit" }) : "سال / ماه / روز"}</bdi>
      <CalendarDays size={17} aria-hidden="true" />
    </button>
    {open && !disabled && <div ref={panel} id={panelId} className={styles.panel} role="group" aria-label="تقویم جلالی"
      onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); setOpen(false); trigger.current?.focus(); } }}>
      <div className={styles.heading}>
        <button type="button" aria-label="ماه قبل" onClick={() => move(-1)}><ChevronRight size={18} /></button>
        <select aria-label="ماه شمسی" value={month} onChange={event => setMonth(Number(event.target.value))}>
          {months.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}
        </select>
        <input aria-label="سال شمسی" type="number" min={1} max={9375} value={year} onChange={event => {
          const value = Number(event.target.value);
          if (Number.isInteger(value) && value >= 1 && value <= 9375) setYear(value);
        }} />
        <button type="button" aria-label="ماه بعد" onClick={() => move(1)}><ChevronLeft size={18} /></button>
      </div>
      <div className={styles.days}>
        {weekdays.map((day, index) => <span key={index} aria-hidden="true">{day}</span>)}
        {Array.from({ length: offset }, (_, index) => <span key={`empty-${index}`} />)}
        {Array.from({ length: count }, (_, index) => {
          const day = index + 1;
          const value = persianToIso(year, month, day)!;
          return <button type="button" key={day} aria-label={`${day} ${months[month - 1]} ${year}`}
            aria-pressed={value === iso} disabled={!!((props.min && value < props.min) || (props.max && value > props.max))}
            onClick={() => choose(value)}>{intl.number(day)}</button>;
        })}
      </div>
      <div className={styles.footer}>
        <button type="button" disabled={!!((props.min && todayIso < props.min) || (props.max && todayIso > props.max))}
          onClick={() => choose(todayIso)}>امروز</button>
        {!props.required && <button type="button" onClick={() => choose("")}>پاک کردن</button>}
        <button type="button" onClick={() => { setOpen(false); trigger.current?.focus(); }}>بستن</button>
      </div>
    </div>}
  </div>;
}
