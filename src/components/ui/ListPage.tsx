import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { useI18n } from "../../lib/i18n";
import { surface } from "./styles";

/**
 * โครงหน้ารายการแบบใหม่ (REDESIGN 2026-09-30, แบบ QuoteList):
 * หัวหน้า (ชื่อโมดูลเล็ก + ชื่อหน้า + ปุ่ม ? + ปุ่มหลัก "+ สร้าง…" มุมขวา) แล้วการ์ดขาวใบเดียวที่มี
 * แท็บพร้อมจำนวน → แถบค้นหา/ตัวกรอง/จำนวนรายการ → ตาราง (ทั้งแถวกดเปิดเอกสาร) → แบ่งหน้า
 */

export function ListPageHeader({ module, title, description, help, actions }: {
  /** ชื่อกลุ่มเมนูเล็กเหนือชื่อหน้า เช่น "งานขาย" */
  module?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** ปุ่ม ? ดูคำแนะนำ วางต่อท้ายชื่อหน้า */
  help?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-end gap-4 flex-wrap">
      {/* ขั้นต่ำ 16rem: จอแคบให้ปุ่มด้านขวาตกลงบรรทัดใหม่ แทนที่จะบีบชื่อหน้าจนเหลือ "ภา…" */}
      <div className="flex-1 min-w-[min(100%,16rem)] flex flex-col gap-1">
        {module && <p className="text-[13px] text-muted-foreground">{module}</p>}
        <div className="flex items-center gap-1.5 min-w-0">
          <h1 className="text-2xl font-semibold leading-tight text-foreground truncate">{title}</h1>
          {help}
        </div>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2.5 flex-wrap">{actions}</div>}
    </div>
  );
}

export function ListCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  // flex-shrink-0: หน้ารายการเป็น flex-col ที่เลื่อนได้ — ถ้าการ์ดหดได้ (overflow-hidden ทำให้ min-height เป็น 0) รายการยาวจะบีบแถบแท็บจนโดนตัด
  return <section className={`${surface.card} flex flex-col flex-shrink-0 min-w-0 overflow-hidden ${className}`}>{children}</section>;
}

export interface ListTab<K extends string> {
  key: K;
  label: string;
  count?: number;
}

/** แท็บพร้อมจำนวน — ใช้แทนการ์ดนับ/ปุ่มกรองสถานะ · ←/→ เลื่อนแท็บได้ (roving tabindex) */
export function ListTabs<K extends string>({ tabs, active, onChange, ariaLabel }: {
  tabs: ListTab<K>[];
  active: K;
  onChange: (key: K) => void;
  ariaLabel: string;
}) {
  const refs = useRef(new Map<K, HTMLButtonElement>());
  const move = (to: number) => {
    const next = tabs[(to + tabs.length) % tabs.length];
    if (!next) return;
    onChange(next.key);
    refs.current.get(next.key)?.focus();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (e.key === "ArrowRight") move(i + 1);
    else if (e.key === "ArrowLeft") move(i - 1);
    else return;
    e.preventDefault();
  };
  return (
    <div role="tablist" aria-label={ariaLabel} className="flex gap-1 px-5 border-b border-border overflow-x-auto overflow-y-hidden [scrollbar-width:thin]">
      {tabs.map((tab, i) => {
        const sel = tab.key === active;
        return (
          <button
            key={tab.key}
            ref={(el) => { if (el) refs.current.set(tab.key, el); else refs.current.delete(tab.key); }}
            type="button"
            role="tab"
            aria-selected={sel}
            tabIndex={sel ? 0 : -1}
            onClick={() => onChange(tab.key)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`h-12 px-3 -mb-px flex items-center gap-2 text-sm whitespace-nowrap border-b-2 outline-none focus-visible:ring-2 focus-visible:ring-[#1a5fb4]/40 transition-colors ${
              sel ? "border-[#c9a84c] text-foreground font-semibold" : "border-transparent text-muted-foreground font-medium hover:text-foreground"
            }`}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className={`min-w-[22px] h-5 px-1.5 rounded-full text-xs font-semibold inline-flex items-center justify-center ${sel ? "bg-[#0b1d3a] text-white" : "bg-[#eef1f6] text-[#3d5173]"}`}>
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** แถบค้นหา (340px ซ้าย) + ตัวกรอง + จำนวนรายการชิดขวา */
export function ListToolbar({ search, onSearch, searchPlaceholder, searchLabel, count, children }: {
  search?: string;
  onSearch?: (v: string) => void;
  searchPlaceholder?: string;
  searchLabel?: string;
  /** ข้อความจำนวนรายการชิดขวา เช่น "8 รายการ" */
  count?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5 flex-wrap px-5 py-3.5 border-b border-[#eef1f6]">
      {onSearch && (
        <label className="w-full sm:w-[340px] h-10 px-3 rounded-lg border border-[#c3ccda] bg-white flex items-center gap-2 focus-within:border-[#1a5fb4] focus-within:ring-2 focus-within:ring-[#1a5fb4]/20 transition-colors">
          <Search size={16} className="text-muted-foreground flex-shrink-0" />
          <input
            value={search ?? ""}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchLabel ?? searchPlaceholder}
            className="flex-1 min-w-0 bg-transparent text-sm text-foreground placeholder:text-[#8a97ad] outline-none"
          />
          {search && (
            <button type="button" onClick={() => onSearch("")} aria-label={searchLabel ?? searchPlaceholder} className="text-muted-foreground hover:text-foreground">
              <X size={14} />
            </button>
          )}
        </label>
      )}
      {children}
      <span className="flex-1" />
      {count !== undefined && <span className="text-[13px] text-muted-foreground whitespace-nowrap">{count}</span>}
    </div>
  );
}

/** ปุ่มตัวกรองแบบ select หน้าตาปุ่มรอง — "ประเภทงาน: ทั้งหมด ▾" */
export function FilterSelect<V extends string>({ label, value, options, onChange }: {
  label: string;
  value: V;
  options: { value: V; label: string }[];
  onChange: (v: V) => void;
}) {
  return (
    <label className="relative h-10 rounded-lg border border-[#c3ccda] bg-white hover:bg-[#f4f6fa] flex items-center text-sm text-foreground focus-within:border-[#1a5fb4] focus-within:ring-2 focus-within:ring-[#1a5fb4]/20 transition-colors">
      <span className="pl-3 text-muted-foreground whitespace-nowrap">{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as V)}
        className="h-full pl-1.5 pr-8 bg-transparent appearance-none outline-none font-medium cursor-pointer max-w-[220px] truncate"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute right-2.5 pointer-events-none text-muted-foreground"><path d="m6 9 6 6 6-6" /></svg>
    </label>
  );
}

/** ท้ายการ์ด: "แสดง 1–8 จาก 8 รายการ" + ปุ่มหน้า */
export function ListPagination({ page, pageCount, from, to, total, onPage }: {
  page: number;
  pageCount: number;
  from: number;
  to: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-2 px-5 py-3 border-t border-[#eef1f6] text-[13px] text-muted-foreground">
      <span className="flex-1">{t("ui.pageRange").replace("{from}", String(from)).replace("{to}", String(to)).replace("{total}", String(total))}</span>
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label={t("common.previous")} className="w-9 h-9 rounded-lg border border-border bg-white flex items-center justify-center text-foreground disabled:text-[#c3ccda] hover:bg-[#f4f6fa] disabled:hover:bg-white">
        <ChevronLeft size={16} />
      </button>
      <span className="min-w-9 h-9 px-2 rounded-lg bg-[#0b1d3a] text-white font-semibold flex items-center justify-center tabular-nums">{page}</span>
      {pageCount > 1 && <span className="tabular-nums">/ {pageCount}</span>}
      <button type="button" disabled={page >= pageCount} onClick={() => onPage(page + 1)} aria-label={t("common.next")} className="w-9 h-9 rounded-lg border border-border bg-white flex items-center justify-center text-foreground disabled:text-[#c3ccda] hover:bg-[#f4f6fa] disabled:hover:bg-white">
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

/** หน้ารายการว่าง / ไม่พบผลค้นหา ในตาราง */
export function ListEmpty({ title, hint, action }: { title: ReactNode; hint?: ReactNode; action?: ReactNode }) {
  return (
    <div className="py-16 px-6 flex flex-col items-center gap-2 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      {hint && <p className="text-[13px] text-muted-foreground max-w-md">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
