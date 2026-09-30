import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Building2, Check, ChevronDown, PenLine, Search, X } from "lucide-react";
import type { Customer } from "../../lib/customers";
import { useI18n } from "../../lib/i18n";

/**
 * ช่องเลือกลูกค้าของรายงานบริการ (บอร์ด Pop-ServiceCustomerSearch, ดีไซน์ใหม่ 2026-09-30)
 *
 * เลือกแล้ว = กล่องสูง 48 (ไอคอนบริษัท + ชื่อ + "ค้นหาลูกค้าอื่น ▾") กดแล้วเปลี่ยนเป็นช่องค้นหาที่วางทับตำแหน่งเดิม
 * รายชื่อเปิดลงด้านล่าง (ชื่อ + ผู้ติดต่อ · เบอร์ · เลขภาษี) · ท้ายรายชื่อมีทาง "ไม่อยู่ในรายชื่อ — กรอกเอง"
 * ซึ่งคือการยกเลิกการเลือก (onClear) ให้ช่องกรอกข้อมูลลูกค้าเองโผล่ขึ้นมา — แทนปุ่ม ✕ เดิมของ CustomerSelector
 *
 * Service's own customer field (the quotation module's CustomerSelector is not ours to restyle).
 * Same search pool and matching as CustomerSelector: active, non-archived customers, matched on
 * company/contact/phone/email/tax ID, first 20.
 */
export function ServiceCustomerSearch({ customers, selectedId, onSelect, onClear, disabled, selectedName }: {
  customers: Customer[];
  selectedId: string;
  onSelect: (customer: Customer) => void;
  onClear: () => void;
  disabled: boolean;
  /** ชื่อจาก snapshot ของรายงาน — ใช้เมื่อลูกค้าที่ผูกไว้ถูกเก็บถาวร/ไม่อยู่ในรายชื่อที่โหลดมาแล้ว */
  selectedName?: string;
}) {
  const { t } = useI18n();
  const selected = customers.find((c) => c.id === selectedId);
  const hasSelection = !!selectedId;
  const [searching, setSearching] = useState(!hasSelection);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  // ค่าที่เลือกเปลี่ยนจากข้างนอก (เช่นกู้คืนฉบับร่างในเครื่อง) → กลับไปแสดงตามค่าใหม่
  const [prevSelectedId, setPrevSelectedId] = useState(selectedId);
  if (prevSelectedId !== selectedId) {
    setPrevSelectedId(selectedId);
    setSearching(!selectedId);
  }
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = customers.filter((c) => c.isActive && !c.isDeleted);
    if (!q) return pool.slice(0, 20);
    return pool
      .filter((c) => [c.companyName, c.contactName, c.phone, c.email, c.taxId].some((f) => f.toLowerCase().includes(q)))
      .slice(0, 20);
  }, [customers, query]);

  // ปิดรายชื่อเมื่อคลิกนอกกล่อง — และถ้ามีลูกค้าเลือกไว้อยู่แล้ว ให้กลับไปแสดงกล่อง "เลือกแล้ว"
  useEffect(() => {
    if (!open && !(searching && hasSelection)) return;
    const onDown = (e: MouseEvent) => {
      if (containerRef.current?.contains(e.target as Node)) return;
      setOpen(false);
      if (hasSelection) { setSearching(false); setQuery(""); }
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open, searching, hasSelection]);

  const startSearch = () => {
    if (disabled) return;
    setSearching(true);
    setOpen(true);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };
  const stopSearch = () => {
    setOpen(false);
    setQuery("");
    if (hasSelection) setSearching(false);
  };
  const pick = (c: Customer) => {
    onSelect(c);
    setQuery("");
    setOpen(false);
    setSearching(false);
  };
  const enterManually = () => {
    if (hasSelection) onClear();
    setQuery("");
    setOpen(false);
    setSearching(true);
  };

  if (hasSelection && !searching) {
    const name = selected?.companyName || selectedName || t("common.dash");
    if (disabled) {
      return (
        <div className="min-h-10 flex items-center gap-2.5">
          <span className="w-[30px] h-[30px] rounded-md bg-[#e8edf7] text-[#1a3a6b] flex items-center justify-center flex-shrink-0"><Building2 size={16} /></span>
          <span className="text-sm font-medium text-foreground truncate">{name}</span>
        </div>
      );
    }
    return (
      <button
        type="button"
        onClick={startSearch}
        aria-haspopup="listbox"
        className="w-full h-12 px-3 rounded-lg border border-[#c3ccda] bg-white flex items-center gap-2.5 text-left hover:bg-[#f8f9fc] transition-colors outline-none focus-visible:border-[#1a5fb4] focus-visible:ring-2 focus-visible:ring-[#1a5fb4]/20"
      >
        <span className="w-[30px] h-[30px] rounded-md bg-[#e8edf7] text-[#1a3a6b] flex items-center justify-center flex-shrink-0"><Building2 size={16} /></span>
        <span className="flex-1 min-w-0 text-sm font-medium text-foreground truncate">{name}</span>
        <span className="text-xs text-muted-foreground whitespace-nowrap">{t("service.customer.searchOther")}</span>
        <ChevronDown size={16} className="text-muted-foreground flex-shrink-0" />
      </button>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <label data-field-box="" className="h-12 px-3 rounded-lg border border-[#c3ccda] bg-white flex items-center gap-2.5 focus-within:border-[#1a5fb4] focus-within:ring-2 focus-within:ring-[#1a5fb4]/20 transition-colors">
        <Search size={16} className="text-muted-foreground flex-shrink-0" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-label={t("service.customer.searchAria")}
          disabled={disabled}
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onKeyDown={(e) => { if (e.key === "Escape") stopSearch(); }}
          placeholder={t("quotation.customerSelector.searchPlaceholder")}
          className="flex-1 min-w-0 bg-transparent text-sm text-foreground placeholder:text-[#8a97ad] outline-none disabled:opacity-60"
        />
        {hasSelection && (
          <button type="button" onClick={stopSearch} aria-label={t("service.customer.closeSearch")} className="w-7 h-7 rounded-md text-muted-foreground hover:bg-[#f4f6fa] hover:text-foreground flex items-center justify-center flex-shrink-0">
            <X size={16} />
          </button>
        )}
      </label>

      {open && !disabled && (
        <div className="absolute z-30 left-0 right-0 top-full mt-1.5 bg-card border border-border rounded-[10px] shadow-[0_12px_28px_-8px_rgba(11,29,58,0.22)] p-1.5 flex flex-col">
          <div className="px-2.5 pt-1.5 pb-1 text-xs text-muted-foreground">
            {matches.length === 0 ? t("quotation.customerSelector.noResults") : t("service.customer.count").replace("{n}", String(matches.length))}
          </div>
          <div id={listboxId} role="listbox" aria-label={t("service.form.customer")} className="max-h-72 overflow-y-auto flex flex-col">
            {matches.map((c) => {
              const on = c.id === selectedId;
              return (
                <button
                  key={c.id}
                  type="button"
                  role="option"
                  aria-selected={on}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(c)}
                  className={`min-h-14 px-2.5 py-2 rounded-md flex items-center gap-3 text-left transition-colors ${on ? "bg-[#eef4fc]" : "hover:bg-[#f4f6fa]"}`}
                >
                  <span className="w-8 h-8 rounded-md bg-[#e8edf7] text-[#1a3a6b] flex items-center justify-center flex-shrink-0"><Building2 size={16} /></span>
                  <span className="flex-1 min-w-0 flex flex-col leading-snug">
                    <span className="text-sm font-medium text-foreground truncate">{c.companyName}</span>
                    <span className="text-xs text-muted-foreground truncate">
                      {[c.contactName, c.phone, c.taxId].filter(Boolean).join(" · ") || t("quotation.customerSelector.noExtraInfo")}
                    </span>
                  </span>
                  {on && <Check size={16} className="text-[#1a5fb4] flex-shrink-0" />}
                </button>
              );
            })}
          </div>
          <div className="h-px bg-[#eef1f6] my-1.5 mx-1" />
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={enterManually}
            className="self-start h-9 px-2.5 rounded-lg inline-flex items-center gap-2 text-sm font-medium text-[#1a5fb4] hover:bg-[#e8f0fb] transition-colors text-left"
          >
            <PenLine size={16} className="flex-shrink-0" />
            {t("service.customer.enterManually")}
          </button>
        </div>
      )}
    </div>
  );
}
