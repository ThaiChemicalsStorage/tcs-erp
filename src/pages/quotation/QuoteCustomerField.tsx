import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Building2, Check, ChevronDown, Search, X } from "lucide-react";
import type { Customer } from "../../lib/customers";
import { Field } from "../../components/ui/Field";
import { useI18n } from "../../lib/i18n";

const MAX_MATCHES = 20;

/**
 * ช่อง "ชื่อลูกค้า / บริษัท" ของใบเสนอราคา (ดีไซน์ใหม่ 2026-09-30, Pop-QuoteCustomerSearch)
 *
 * เดิมหน้าเอกสารมีสองช่องแยกกัน: ตัวเลือกลูกค้าจากทะเบียน (`CustomerSelector`) กับช่องพิมพ์ชื่อลูกค้า ตอนนี้รวม
 * เป็นช่องเดียว — พิมพ์ชื่อได้ตรง ๆ เหมือนเดิม และกด "ค้นหาลูกค้าอื่น" เพื่อเลือกจากทะเบียนแล้วเติมข้อมูลลูกค้าให้ทั้งชุด
 * กติกาเดิมคงไว้ทั้งหมด: ค้นจากชื่อบริษัท/ผู้ติดต่อ/เบอร์/อีเมล/เลขผู้เสียภาษี · แสดงเฉพาะลูกค้าที่ใช้งานอยู่ ·
 * สูงสุด 20 ราย · ยกเลิกการเชื่อมกับทะเบียนได้ · เปลี่ยนลูกค้าที่เชื่อมได้เฉพาะตอนที่ `canChangeCustomer`
 *
 * `CustomerSelector` ตัวเดิมยังอยู่ — ใบกำกับภาษีด้วยมือและใบรายงานบริการใช้อยู่
 */
export function QuoteCustomerField({
  customers, customerId, onSelect, onClear, client, onClientChange, canChangeCustomer, error, inputId,
}: {
  customers: Customer[];
  customerId: string;
  onSelect: (c: Customer) => void;
  onClear: () => void;
  client: string;
  onClientChange: (v: string) => void;
  canChangeCustomer: boolean;
  error?: string;
  inputId: string;
}) {
  const { t } = useI18n();
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const linked = customers.find((c) => c.id === customerId);

  const pool = useMemo(() => customers.filter((c) => c.isActive && !c.isDeleted), [customers]);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pool.slice(0, MAX_MATCHES);
    return pool
      .filter((c) => [c.companyName, c.contactName, c.phone, c.email, c.taxId].some((f) => f.toLowerCase().includes(q)))
      .slice(0, MAX_MATCHES);
  }, [pool, query]);

  const close = () => { setSearching(false); setQuery(""); setActive(0); };
  const pick = (c: Customer) => { onSelect(c); close(); };
  // หน่วงนิดหนึ่งให้คลิกตัวเลือกทำงานทันก่อนรายการปิด — แนวเดียวกับ CustomerSelector
  const closeOnBlur = () => {
    window.setTimeout(() => {
      if (!containerRef.current?.contains(document.activeElement)) close();
    }, 120);
  };
  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, matches.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" && matches[active]) { e.preventDefault(); pick(matches[active]); }
  };

  const frame = "min-h-12 px-3 rounded-lg border bg-white flex items-center gap-2.5 transition-colors";
  const help = linked ? t("quotation.customerField.linked").replace("{name}", linked.companyName) : undefined;

  return (
    <Field label={t("quotation.field.clientName")} required htmlFor={searching ? undefined : inputId} error={error} help={help}>
      <div ref={containerRef} className="relative">
        {searching ? (
          <>
            <div data-field-box="" className={`${frame} border-[#1a5fb4] ring-2 ring-[#1a5fb4]/20`}>
              <Search size={16} className="text-muted-foreground flex-shrink-0" />
              <input
                autoFocus
                type="text"
                role="combobox"
                aria-expanded="true"
                aria-controls={listboxId}
                aria-autocomplete="list"
                aria-activedescendant={matches[active] ? `${listboxId}-${matches[active].id}` : undefined}
                aria-label={t("quotation.customerSelector.label")}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setActive(0); }}
                onKeyDown={onSearchKey}
                onBlur={closeOnBlur}
                placeholder={t("quotation.customerSelector.searchPlaceholder")}
                className="flex-1 min-w-0 bg-transparent text-sm text-foreground placeholder:text-[#8a97ad] outline-none"
              />
              <button type="button" onClick={close} aria-label={t("common.close")} className="text-muted-foreground hover:text-foreground flex-shrink-0">
                <X size={16} />
              </button>
            </div>
            <div id={listboxId} role="listbox" aria-label={t("quotation.col.client")} className="absolute z-30 left-0 right-0 mt-1.5 max-h-80 overflow-y-auto bg-card border border-border rounded-[10px] shadow-[0_12px_28px_-8px_rgba(11,29,58,0.22)] p-1.5 flex flex-col">
              <p className="px-2.5 pt-1.5 pb-2 text-xs text-muted-foreground">
                {matches.length === 0 ? t("quotation.customerSelector.noResults") : t("quotation.customerField.count").replace("{n}", String(pool.length))}
              </p>
              {matches.map((c, i) => {
                const on = c.id === customerId;
                return (
                  <button
                    key={c.id}
                    id={`${listboxId}-${c.id}`}
                    type="button"
                    role="option"
                    aria-selected={on}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => pick(c)}
                    className={`min-h-14 px-2.5 py-2 rounded-md flex items-center gap-3 text-left transition-colors ${i === active ? "bg-[#f4f6fa]" : on ? "bg-[#eef4fc]" : "bg-white"}`}
                  >
                    <span className="w-8 h-8 rounded-md bg-[#e8edf7] text-[#1a3a6b] flex items-center justify-center flex-shrink-0"><Building2 size={16} /></span>
                    <span className="flex-1 min-w-0 flex flex-col leading-snug">
                      <span className="text-sm font-medium text-foreground truncate">{c.companyName}</span>
                      <span className="text-xs text-muted-foreground truncate">
                        {[c.contactName, c.phone].filter(Boolean).join(" · ")}
                        {c.taxId && <>{c.contactName || c.phone ? " · " : ""}<span className="font-mono">{c.taxId}</span></>}
                        {!c.contactName && !c.phone && !c.taxId && t("quotation.customerSelector.noExtraInfo")}
                      </span>
                    </span>
                    {on && <Check size={16} className="text-[#1a5fb4] flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <div data-field-box="" className={`${frame} border-[#c3ccda] focus-within:border-[#1a5fb4] focus-within:ring-2 focus-within:ring-[#1a5fb4]/20`}>
            <span className="w-[30px] h-[30px] rounded-md bg-[#e8edf7] text-[#1a3a6b] flex items-center justify-center flex-shrink-0"><Building2 size={16} /></span>
            <input
              id={inputId}
              value={client}
              onChange={(e) => onClientChange(e.target.value)}
              aria-invalid={error ? true : undefined}
              className="flex-1 min-w-0 bg-transparent text-sm font-medium text-foreground outline-none"
            />
            {canChangeCustomer && linked && (
              <button
                type="button"
                onClick={onClear}
                title={t("quotation.customerSelector.clear")}
                aria-label={t("quotation.customerSelector.clear")}
                className="text-muted-foreground hover:text-[#b93636] transition-colors flex-shrink-0"
              >
                <X size={16} />
              </button>
            )}
            {canChangeCustomer && (
              <button
                type="button"
                onClick={() => setSearching(true)}
                aria-haspopup="listbox"
                className="h-8 px-2 -mr-1 rounded-md inline-flex items-center gap-1 text-xs text-muted-foreground hover:bg-[#f4f6fa] hover:text-foreground whitespace-nowrap flex-shrink-0"
              >
                {client.trim() ? t("quotation.customerField.searchOther") : t("quotation.customerField.pick")}
                <ChevronDown size={14} />
              </button>
            )}
          </div>
        )}
      </div>
    </Field>
  );
}
