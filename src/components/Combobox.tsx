import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../lib/i18n";

/**
 * ช่องพิมพ์ที่มีรายการให้เลือก แต่ **พิมพ์อะไรเองก็ได้** (2026-08-31)
 *
 * เจ้าของขอไว้เมื่อ 2026-08-28: *"เวลาพิมพ์ชื่อลูกค้าของใบสั่งซื้อหรืออะไรต่างๆ ก็ตาม ให้พิมพ์แบบ
 * คีย์เวิร์ดในนั้นก็ขึ้นมาเหมือนค้นหา แค่สามารถพิมพ์ตรงนั้นได้ปกติ"*
 *
 * ก่อนหน้านี้ทั้งแอปไม่มีคอมโพเนนต์แบบนี้ที่ใช้ซ้ำได้เลย มี `role="combobox"` อยู่แค่สองที่ และ
 * ตัวที่ใกล้ที่สุด (`CustomerSelector.tsx`) **ไม่ยอมให้พิมพ์อิสระ** — ข้อความที่พิมพ์เป็นแค่คำค้น
 * ในสเตทของตัวเอง พอ blur แล้วหายไปเฉย ๆ ไม่เคยถูกส่งกลับให้ผู้เรียกเลย
 *
 * ตัวนี้จึงประกอบจากสองที่:
 *   - โครง/สไตล์/การปิดตอน blur จาก `CustomerSelector.tsx`
 *   - คีย์บอร์ดและ ARIA จาก `GlobalSearch.tsx` (`aria-activedescendant`, ลูกศรขึ้น-ลง, Enter,
 *     `scrollIntoView({ block: "nearest" })` แบบอิง DOM id ไม่ต้องเก็บ ref เป็นอาร์เรย์)
 *
 * **สัญญาที่ต่างจากของเดิม**: `value`/`onChange` เป็นข้อความอิสระจริง ๆ ทุกตัวอักษรที่พิมพ์ถูกส่งขึ้น
 * ไปทันที ดรอปดาวน์เป็นแค่ทางลัด ปิดดรอปดาวน์หรือ blur ไม่เคยทำให้สิ่งที่พิมพ์หาย
 *
 * ดรอปดาวน์ถูก **portal ไปที่ `document.body` แล้ววางด้วยพิกัด fixed** เพราะที่ใช้จริงหลายที่เป็น
 * ช่องในตารางรายการซึ่งอยู่ใน `<div className="overflow-x-auto">` — ดรอปดาวน์แบบ absolute จะโดน
 * ตัดหายทันที (ใช้ `createPortal` แบบเดียวกับ `pages/dashboard/ApprovalDashboard.tsx`)
 */

export interface ComboboxOption {
  /** ค่าที่จะถูกใส่ลงช่องเมื่อเลือก */
  value: string;
  /** บรรทัดหลักในรายการ — ถ้าไม่ใส่จะใช้ `value` */
  label?: string;
  /** บรรทัดรอง เช่น ชื่อเต็มของรหัส หรือเบอร์โทรของผู้ขาย */
  hint?: string;
}

/** ตำแหน่งดรอปดาวน์บนจอ คำนวณจากกล่องของ input จริง */
interface DropdownRect {
  left: number;
  top: number;
  width: number;
}

const MAX_VISIBLE = 20;

function optionLabel(o: ComboboxOption): string {
  return o.label ?? o.value;
}

/** ตรงกับคำค้นแบบไม่สนตัวพิมพ์ ดูทั้งค่า ป้าย และบรรทัดรอง */
function matches(o: ComboboxOption, q: string): boolean {
  if (q === "") return true;
  return [o.value, o.label ?? "", o.hint ?? ""].some((f) => f.toLowerCase().includes(q));
}

export function Combobox({
  value,
  onChange,
  options,
  onPick,
  disabled = false,
  id,
  placeholder,
  ariaLabel,
  className = "",
  emptyMessage,
  maxLength,
}: {
  value: string;
  /** เรียกทุกครั้งที่พิมพ์ และตอนเลือกจากรายการ — ข้อความที่พิมพ์ไม่เคยถูกกลืน */
  onChange: (next: string) => void;
  options: ComboboxOption[];
  /** เรียกเพิ่มเมื่อ**เลือกจากรายการ**เท่านั้น ใช้ตอนที่การเลือกต้องเซ็ตค่าอื่นด้วย (เช่น vendorId) */
  onPick?: (option: ComboboxOption) => void;
  disabled?: boolean;
  id?: string;
  placeholder?: string;
  ariaLabel?: string;
  /** คลาสของ `<input>` เอง — ผู้เรียกคุมหน้าตาเองทั้งหมด จะได้ฝังในตารางหรือในฟอร์มก็ได้ */
  className?: string;
  emptyMessage?: string;
  /**
   * จำกัดจำนวนตัวอักษรของช่องพิมพ์ — ส่งต่อให้ `<input maxLength>` ตรง ๆ
   *
   * มีไว้เพราะบางช่องมีเพดานฝั่งเซิร์ฟเวอร์อยู่แล้ว (เช่น `MAX_SHORT_TEXT` = 300 ของใบเสนอราคา)
   * ให้เบราว์เซอร์กันตั้งแต่ตอนพิมพ์ ดีกว่าปล่อยไปโดน 400 ตอนกดบันทึกแล้วไม่รู้ว่าเพราะอะไร
   */
  maxLength?: number;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [activeIndexRaw, setActiveIndex] = useState(0);
  const [rect, setRect] = useState<DropdownRect | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const optionIdPrefix = `${listboxId}-opt`;

  const visible = useMemo(() => {
    const q = value.trim().toLowerCase();
    return options.filter((o) => matches(o, q)).slice(0, MAX_VISIBLE);
  }, [options, value]);

  // ดัชนีที่เลือกอยู่ต้องไม่ค้างเกินรายการหลังผู้ใช้พิมพ์จนตัวเลือกเหลือน้อยลง — บีบตอนเรนเดอร์
  // ไม่ใช่ใน effect เพราะการ setState ใน effect ทำให้เกิดการเรนเดอร์ซ้อน (eslint จับได้ถูกแล้ว)
  const activeIndex = Math.min(activeIndexRaw, Math.max(visible.length - 1, 0));

  // วัดตำแหน่งก่อนเบราว์เซอร์วาด ไม่งั้นดรอปดาวน์จะกระพริบที่ตำแหน่งเก่าหนึ่งเฟรม
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const el = inputRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect({ left: r.left, top: r.bottom + 2, width: r.width });
    };
    measure();
    // ปิดเมื่อหน้าเลื่อน แทนที่จะวิ่งตาม — ดรอปดาวน์ที่ลอยตามตอนสกรอลล์ตารางกว้าง ๆ อ่านยากกว่าเดิม
    // ต้องดักแบบ capture เพราะตัวที่เลื่อนจริงคือ `<div className="overflow-x-auto">` ของตาราง ไม่ใช่ window
    const closeOnScroll = () => setOpen(false);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", closeOnScroll, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", closeOnScroll, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    document.getElementById(`${optionIdPrefix}-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open, optionIdPrefix]);

  const pick = (option: ComboboxOption) => {
    onChange(option.value);
    onPick?.(option);
    setOpen(false);
    setActiveIndex(0);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      // ปิดเฉย ๆ — ข้อความที่พิมพ์ไว้ยังอยู่ ไม่ย้อนกลับเป็นค่าเดิม
      if (open) { e.preventDefault(); setOpen(false); }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      setActiveIndex((i) => Math.min(i + 1, Math.max(visible.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && open) {
      const option = visible[activeIndex];
      // ไม่มีตัวเลือกที่ตรง = ปล่อยให้ Enter ทำงานตามปกติ ผู้ใช้กำลังพิมพ์ค่าที่ยังไม่มีในทะเบียน
      if (option) { e.preventDefault(); pick(option); }
    }
  };

  // หน่วงเล็กน้อยให้คลิกตัวเลือกทำงานทัน — แนวเดียวกับ CustomerSelector.tsx
  const onBlur = () => {
    window.setTimeout(() => {
      if (listRef.current?.contains(document.activeElement)) return;
      setOpen(false);
    }, 120);
  };

  return (
    <>
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-haspopup="listbox"
        aria-activedescendant={open && visible.length > 0 ? `${optionIdPrefix}-${activeIndex}` : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActiveIndex(0); }}
        onFocus={() => setOpen(true)}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        className={className}
      />
      {open && !disabled && rect && createPortal(
        <div
          ref={listRef}
          id={listboxId}
          role="listbox"
          style={{ position: "fixed", left: rect.left, top: rect.top, width: Math.max(rect.width, 180) }}
          className="z-50 max-h-64 overflow-y-auto bg-card border border-border rounded-lg shadow-xl py-1"
        >
          {visible.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">{emptyMessage ?? t("combobox.noResults")}</p>
          ) : (
            visible.map((o, i) => (
              <button
                key={`${o.value}-${i}`}
                id={`${optionIdPrefix}-${i}`}
                type="button"
                role="option"
                aria-selected={i === activeIndex}
                onMouseDown={(e) => e.preventDefault()}
                onMouseMove={() => setActiveIndex(i)}
                onClick={() => pick(o)}
                className={`w-full text-left px-3 py-1.5 transition-colors ${i === activeIndex ? "bg-secondary/70" : "hover:bg-secondary/40"}`}
              >
                <span className="block text-xs text-foreground truncate">{optionLabel(o)}</span>
                {/* บรรทัดรองแยกด้วยสี ไม่ใช่ด้วยขนาด — ตามที่ CustomerSelector.tsx ทำอยู่แล้ว */}
                {o.hint && <span className="block text-xs text-muted-foreground truncate">{o.hint}</span>}
              </button>
            ))
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
