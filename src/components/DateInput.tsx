import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { useI18n } from "../lib/i18n";
import {
  addDaysIso, formatDateInput, isWithinRange, maskDateTyping, monthGrid, parseDateInput, parseIso, todayIso, toIso, BE_OFFSET,
  type DateInputEra,
} from "../lib/dateInputFormat";

/**
 * ช่องกรอกวันที่ของทั้งแอป แทน `<input type="date">` (2026-10-08, Tuhmo #48)
 *
 * ช่องของเบราว์เซอร์แสดงตามภาษาเครื่อง — บางเครื่องเดือนขึ้นก่อน และไม่มีทางให้เป็น พ.ศ. ตัวนี้แสดง "วว/ดด/ปปปป"
 * เสมอ (พ.ศ. ในโหมดไทย ค.ศ. ในโหมดอังกฤษ) พิมพ์เองได้ (ตัวเลขล้วน "08102569" ก็ได้) หรือกดปุ่มปฏิทิน
 *
 * **สัญญาเหมือนช่องเดิม**: `value` เข้าและ `onChange` ออกเป็น ISO "YYYY-MM-DD" หรือ "" — ผู้เรียกไม่ต้องแปลงอะไร
 * `onChange` ถูกเรียกเฉพาะตอนข้อความกลายเป็นวันที่ครบและถูกต้อง (หรือถูกลบจนว่าง) ระหว่างพิมพ์ไม่ครบไม่ส่งค่าครึ่ง ๆ ออกไป
 * ออกจากช่องตอนพิมพ์ไม่ครบ = กลับไปแสดงค่าเดิม แบบเดียวกับช่องของเบราว์เซอร์
 *
 * `className` คือคลาสของช่องพิมพ์เหมือนเดิม — คลาสความกว้าง (w-*, min-w-*, max-w-*, flex-1) ถูกย้ายไปกรอบนอก
 * ให้ปุ่มปฏิทินวางชิดขวาของช่องได้ถูกที่ · ปฏิทิน portal ไป `document.body` แบบ `Combobox` จะได้ไม่โดนตาราง
 * `overflow-x-auto` ตัดหาย
 */

const WIDTH_CLASS = /^((sm|md|lg|xl):)?(w-|min-w-|max-w-|flex-1$|flex-none$|grow|shrink|basis-)/;

const TH_WEEKDAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const EN_WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const POPOVER_W = 288;
const POPOVER_H = 344;

function splitWidthClasses(className: string): { wrapper: string; input: string } {
  const wrapper: string[] = [];
  const input: string[] = [];
  for (const c of className.split(/\s+/).filter(Boolean)) (WIDTH_CLASS.test(c) ? wrapper : input).push(c);
  return { wrapper: wrapper.join(" "), input: input.join(" ") };
}

export function DateInput({
  value, onChange, id, className = "", min, max, disabled = false, ariaLabel, placeholder,
}: {
  /** ISO "YYYY-MM-DD" หรือ "" */
  value: string;
  onChange: (iso: string) => void;
  id?: string;
  className?: string;
  min?: string;
  max?: string;
  disabled?: boolean;
  ariaLabel?: string;
  placeholder?: string;
}) {
  const { t, lang } = useI18n();
  const era: DateInputEra = lang === "en" ? "ce" : "be";
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const popId = useId();

  // ระหว่างโฟกัสอยู่ แสดงข้อความที่ผู้ใช้พิมพ์จริง (อาจยังไม่ครบ) · นอกนั้นแสดงค่าจริงที่จัดรูปแล้ว
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const shown = editing ? text : formatDateInput(value, era);
  const typedInvalid = editing && text !== "" && (() => {
    const iso = parseDateInput(text, era);
    return !iso || !isWithinRange(iso, min, max);
  })();

  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [view, setView] = useState<{ y: number; m: number }>(() => monthOf(value));
  const [focusDay, setFocusDay] = useState<string>("");

  const { wrapper: wrapperWidth, input: inputClasses } = splitWidthClasses(className);

  const handleTyping = (raw: string) => {
    const masked = maskDateTyping(raw);
    setText(masked);
    if (masked === "") { if (value !== "") onChange(""); return; }
    const iso = parseDateInput(masked, era);
    if (iso && isWithinRange(iso, min, max) && iso !== value) onChange(iso);
  };

  const openCalendar = () => {
    if (disabled) return;
    const start = parseIso(value) ? value : clampToRange(todayIso(), min, max);
    setView(monthOf(start));
    setFocusDay(start);
    setOpen(true);
  };

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  };

  const pick = (iso: string) => {
    if (!isWithinRange(iso, min, max)) return;
    onChange(iso);
    close(true);
  };

  // วางปฏิทินใต้ช่อง ถ้าที่ข้างล่างไม่พอให้ขึ้นข้างบน · ชิดขอบจอไม่ให้ล้น
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const el = inputRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const below = window.innerHeight - r.bottom;
      const top = below < POPOVER_H + 8 && r.top > POPOVER_H + 8 ? r.top - POPOVER_H - 4 : r.bottom + 4;
      const left = Math.max(8, Math.min(r.left, window.innerWidth - POPOVER_W - 8));
      setPos({ left, top });
    };
    measure();
    // ปิดเมื่อหน้าเลื่อน แทนที่จะลอยตาม — แบบเดียวกับ Combobox
    const onScroll = (e: Event) => { if (!popRef.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  // คลิกนอกปฏิทินและนอกช่อง = ปิด
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (popRef.current?.contains(target) || inputRef.current?.parentElement?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // โฟกัสวันที่เลือกอยู่ทุกครั้งที่เปลี่ยน (เปิดปฏิทิน / ลูกศร / เปลี่ยนเดือน) · ต้องรอ `pos` ด้วย — ตอนเปิดครั้งแรก
  // ปฏิทินยังไม่ถูกวาดจนกว่าจะวัดตำแหน่งเสร็จ ถ้าไม่รอ โฟกัสจะค้างที่ปุ่มปฏิทิน แล้ว Enter กลายเป็นปิดปฏิทินแทนเลือกวัน
  useEffect(() => {
    if (!open || !pos || !focusDay) return;
    popRef.current?.querySelector<HTMLButtonElement>(`[data-iso="${focusDay}"]`)?.focus();
  }, [open, pos, focusDay, view]);

  const moveFocus = (iso: string) => {
    setFocusDay(iso);
    setView(monthOf(iso));
  };

  const onGridKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (e.key in step) { e.preventDefault(); moveFocus(addDaysIso(focusDay, step[e.key])); return; }
    if (e.key === "PageUp" || e.key === "PageDown") {
      e.preventDefault();
      moveFocus(addMonthsIso(focusDay, (e.key === "PageUp" ? -1 : 1) * (e.shiftKey ? 12 : 1)));
      return;
    }
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(true); }
  };

  const shiftView = (months: number) => {
    const d = new Date(view.y, view.m - 1 + months, 1);
    const next = { y: d.getFullYear(), m: d.getMonth() + 1 };
    setView(next);
    // วันที่โฟกัสตามไปเดือนใหม่ (วันเดิม หรือวันสุดท้ายของเดือนถ้าเดือนสั้นกว่า)
    const cur = parseIso(focusDay);
    const day = Math.min(cur?.d ?? 1, new Date(next.y, next.m, 0).getDate());
    setFocusDay(toIso(next.y, next.m, day));
  };

  const monthLabel = new Date(view.y, view.m - 1, 1).toLocaleDateString(lang === "en" ? "en-GB" : "th-TH", { month: "long" });
  const yearLabel = era === "be" ? view.y + BE_OFFSET : view.y;
  const today = todayIso();
  const weekdays = lang === "en" ? EN_WEEKDAYS : TH_WEEKDAYS;
  const navBtn = "w-8 h-8 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:bg-[#f4f6fa] hover:text-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#1a5fb4]";

  return (
    <span className={`relative inline-block align-middle ${wrapperWidth}`}>
      <input
        ref={inputRef}
        id={id}
        type="text"
        data-date-input=""
        inputMode="numeric"
        autoComplete="off"
        aria-label={ariaLabel}
        aria-invalid={typedInvalid || undefined}
        title={typedInvalid ? t("dateInput.invalid") : undefined}
        disabled={disabled}
        value={shown}
        placeholder={placeholder ?? t("dateInput.placeholder")}
        maxLength={10}
        // ไม่มีคลาสความกว้าง = กว้างพอดี "08/10/2569" + ปุ่มปฏิทิน ใกล้เคียงช่องเดิมของเบราว์เซอร์
        size={12}
        onFocus={() => { setEditing(true); setText(formatDateInput(value, era)); }}
        onBlur={() => setEditing(false)}
        onChange={(e) => handleTyping(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && e.altKey) { e.preventDefault(); openCalendar(); }
        }}
        className={`${inputClasses} w-full ${disabled ? "" : "pr-9"} tabular-nums`}
      />
      {!disabled && (
        <button
          ref={buttonRef}
          type="button"
          tabIndex={-1}
          aria-label={t("dateInput.openCalendar")}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? popId : undefined}
          onClick={() => (open ? close(false) : openCalendar())}
          className="absolute right-1 top-1/2 -translate-y-1/2 w-7 h-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-[#f4f6fa] hover:text-foreground transition-colors"
        >
          <CalendarDays size={16} aria-hidden="true" />
        </button>
      )}
      {open && pos && createPortal(
        <div
          ref={popRef}
          id={popId}
          role="dialog"
          aria-label={t("dateInput.calendar")}
          style={{ position: "fixed", left: pos.left, top: pos.top, width: POPOVER_W }}
          className="z-50 bg-card border border-border rounded-xl shadow-xl p-3 select-none"
          onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); close(true); } }}
        >
          <div className="flex items-center gap-0.5 mb-2">
            <button type="button" className={navBtn} aria-label={`${t("dateInput.prevMonth")} ×12`} onClick={() => shiftView(-12)}><ChevronsLeft size={16} aria-hidden="true" /></button>
            <button type="button" className={navBtn} aria-label={t("dateInput.prevMonth")} onClick={() => shiftView(-1)}><ChevronLeft size={16} aria-hidden="true" /></button>
            <p className="flex-1 text-center text-sm font-semibold text-foreground" aria-live="polite">{monthLabel} {yearLabel}</p>
            <button type="button" className={navBtn} aria-label={t("dateInput.nextMonth")} onClick={() => shiftView(1)}><ChevronRight size={16} aria-hidden="true" /></button>
            <button type="button" className={navBtn} aria-label={`${t("dateInput.nextMonth")} ×12`} onClick={() => shiftView(12)}><ChevronsRight size={16} aria-hidden="true" /></button>
          </div>
          <div role="grid" aria-label={`${monthLabel} ${yearLabel}`} onKeyDown={onGridKey}>
            <div role="row" className="grid grid-cols-7 mb-1">
              {weekdays.map((w, i) => (
                <span key={w} role="columnheader" className={`h-7 flex items-center justify-center text-xs font-medium ${i === 0 ? "text-[#b93636]" : "text-muted-foreground"}`}>{w}</span>
              ))}
            </div>
            {chunk(monthGrid(view.y, view.m), 7).map((week, wi) => (
              <div role="row" key={wi} className="grid grid-cols-7">
                {week.map((day, di) => {
                  if (day === null) return <span key={di} role="gridcell" />;
                  const iso = toIso(view.y, view.m, day);
                  const selected = iso === value;
                  const isToday = iso === today;
                  const allowed = isWithinRange(iso, min, max);
                  return (
                    <span key={di} role="gridcell" aria-selected={selected}>
                      <button
                        type="button"
                        data-iso={iso}
                        tabIndex={iso === focusDay ? 0 : -1}
                        disabled={!allowed}
                        aria-current={isToday ? "date" : undefined}
                        onClick={() => pick(iso)}
                        className={`w-9 h-9 mx-auto flex items-center justify-center rounded-lg text-sm tabular-nums transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#1a5fb4] disabled:opacity-30 disabled:cursor-not-allowed ${
                          selected ? "bg-[#0b1d3a] text-white font-semibold"
                          : isToday ? "border border-[#1a5fb4] text-[#1a5fb4] font-semibold hover:bg-[#e8f0fb]"
                          : "text-foreground hover:bg-[#f4f6fa]"
                        }`}
                      >
                        {day}
                      </button>
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#eef1f6]">
            <button type="button" className="h-8 px-2.5 rounded-lg text-[13px] font-medium text-[#1a5fb4] hover:bg-[#e8f0fb] disabled:opacity-40" disabled={!isWithinRange(today, min, max)} onClick={() => pick(today)}>
              {t("dateInput.today")}
            </button>
            <button type="button" className="h-8 px-2.5 rounded-lg text-[13px] font-medium text-muted-foreground hover:bg-[#f4f6fa]" onClick={() => { onChange(""); close(true); }}>
              {t("dateInput.clear")}
            </button>
          </div>
        </div>,
        document.body,
      )}
    </span>
  );
}

function monthOf(iso: string): { y: number; m: number } {
  const p = parseIso(iso) ?? parseIso(todayIso())!;
  return { y: p.y, m: p.m };
}

function clampToRange(iso: string, min?: string, max?: string): string {
  if (min && iso < min) return min;
  if (max && iso > max) return max;
  return iso;
}

function addMonthsIso(iso: string, months: number): string {
  const p = parseIso(iso);
  if (!p) return iso;
  const d = new Date(p.y, p.m - 1 + months, 1);
  const day = Math.min(p.d, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate());
  return toIso(d.getFullYear(), d.getMonth() + 1, day);
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
