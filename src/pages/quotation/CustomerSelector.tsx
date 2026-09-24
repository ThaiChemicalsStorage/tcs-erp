import { useId, useMemo, useRef, useState } from "react";
import { Search, X, Building2, ChevronDown } from "lucide-react";
import type { Customer } from "../../lib/customers";
import { useI18n } from "../../lib/i18n";

// ช่องค้นหาและเลือกลูกค้าที่บันทึกไว้ เพื่อเติมข้อมูลลูกค้าในฟอร์มใบเสนอราคาอัตโนมัติ
// Search-and-pick control for choosing a saved customer to autofill the quotation form.
export function CustomerSelector({
  customers,
  selectedId,
  onSelect,
  onClear,
  disabled,
  inputId,
}: {
  customers: Customer[];
  selectedId: string;
  onSelect: (customer: Customer) => void;
  onClear: () => void;
  disabled: boolean;
  inputId?: string;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const selected = customers.find((c) => c.id === selectedId);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = customers.filter((c) => c.isActive && !c.isDeleted);
    if (!q) return pool.slice(0, 20);
    return pool
      .filter((c) => [c.companyName, c.contactName, c.phone, c.email, c.taxId].some((f) => f.toLowerCase().includes(q)))
      .slice(0, 20);
  }, [customers, query]);

  // ปิดดรอปดาวน์เมื่อโฟกัสหลุดออกจากกล่องค้นหา หน่วงเวลาเล็กน้อยเพื่อให้คลิกเลือกตัวเลือกยังทำงานได้
  // Closes the dropdown on blur, deferred slightly so a click on a dropdown option still registers.
  const closeOnBlur = () => {
    window.setTimeout(() => {
      if (!containerRef.current?.contains(document.activeElement)) setOpen(false);
    }, 120);
  };

  if (selected) {
    return (
      // เลือกแล้ว: แก้ได้ = กรอบช่องกรอก (data-field-box) · แก้ไม่ได้ = ข้อความธรรมดา ตามกฎช่องกรอกของหน้าเอกสาร (index.css)
      <div data-field-box={disabled ? undefined : ""} className={`flex items-center gap-2 border rounded-lg px-3 py-2 ${disabled ? "border-transparent" : "bg-secondary border-border"}`}>
        <Building2 size={14} className="text-[#c9a84c] flex-shrink-0" />
        <span className="text-sm text-foreground font-medium truncate flex-1 min-w-0">{selected.companyName}</span>
        {!disabled && (
          <button
            type="button"
            onClick={() => { onClear(); setQuery(""); }}
            title={t("quotation.customerSelector.clear")}
            aria-label={t("quotation.customerSelector.clear")}
            className="text-muted-foreground hover:text-[#e05252] transition-colors flex-shrink-0"
          >
            <X size={14} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div data-field-box="" className="flex items-center gap-2 bg-secondary border border-border rounded-lg px-3 py-2 focus-within:border-[#c9a84c]/50 transition-colors">
        <Search size={14} className="text-muted-foreground flex-shrink-0" />
        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-haspopup="listbox"
          disabled={disabled}
          value={query}
          onFocus={() => setOpen(true)}
          onBlur={closeOnBlur}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
          placeholder={t("quotation.customerSelector.searchPlaceholder")}
          className="bg-transparent text-sm text-foreground placeholder-muted-foreground outline-none w-full disabled:opacity-60"
        />
        <ChevronDown size={13} className="text-muted-foreground flex-shrink-0" />
      </div>

      {open && !disabled && (
        <div id={listboxId} role="listbox" className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto bg-card border border-border rounded-lg shadow-xl py-1">
          {matches.length === 0 ? (
            <p className="px-3 py-2.5 text-xs text-muted-foreground">{t("quotation.customerSelector.noResults")}</p>
          ) : (
            matches.map((c) => (
              <button
                key={c.id}
                type="button"
                role="option"
                aria-selected={c.id === selectedId}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onSelect(c); setQuery(""); setOpen(false); }}
                className="w-full text-left px-3 py-2 hover:bg-secondary/60 transition-colors"
              >
                <p className="text-sm text-foreground font-medium truncate">{c.companyName}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {[c.contactName, c.phone, c.taxId].filter(Boolean).join(" · ") || t("quotation.customerSelector.noExtraInfo")}
                </p>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
