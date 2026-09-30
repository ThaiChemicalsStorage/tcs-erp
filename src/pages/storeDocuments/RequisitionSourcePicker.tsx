import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown, ClipboardList, Search, X } from "lucide-react";
import { useI18n } from "../../lib/i18n";

export interface RequisitionSourceOption {
  id: string;
  /** เลขที่ใบเบิกที่คนอ่าน */
  number: string;
  /** บรรทัดรอง: แผนก · รหัสงาน · ลูกค้า … — ค้นได้ด้วย */
  hint: string;
}

/**
 * ช่อง "อ้างอิงใบเบิก" แบบค้นหาได้ (2026-09-23 — เจ้าของ: *"ทำให้มันค้นหาตรงอ้างอิงใบเบิกได้ด้วย"*) ใช้ทั้งใบจ่ายและใบรับคืน
 * ของสโตร์ · **เลือกจากรายการเท่านั้นถึงจะเปลี่ยนใบเบิกที่อ้าง** (ข้อความที่พิมพ์ค้นไว้ไม่ถูกบันทึก) · ปุ่ม × = ไม่อ้างอิงใบเบิก
 *
 * ดีไซน์ใหม่ 2026-09-30: ช่องสูง 52 โชว์ใบที่อ้างอยู่ (เลขที่ + บรรทัดรอง) · คลิกแล้วรายการลอยเปิดใต้ช่อง มีช่องค้นหาของตัวเอง
 * ด้านบน ใบที่อ้างอยู่มีพื้นฟ้าและเครื่องหมายถูก · ↑/↓ เลื่อน Enter เลือก Esc ปิด · ผู้เรียกใส่ `key={selectedId}` ได้เหมือนเดิม
 */
export function RequisitionSourcePicker({ inputId, selectedId, selectedNumber, options, disabled, placeholder, onSelect }: {
  inputId: string;
  selectedId: string;
  selectedNumber: string;
  options: RequisitionSourceOption[];
  disabled: boolean;
  placeholder: string;
  onSelect: (id: string) => void;
}) {
  const { t } = useI18n();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const selected = options.find((o) => o.id === selectedId);
  const q = query.trim().toLowerCase();
  const matches = options.filter((o) => !q || o.number.toLowerCase().includes(q) || o.hint.toLowerCase().includes(q));

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const openList = () => {
    if (disabled) return;
    setQuery("");
    setActive(Math.max(0, options.findIndex((o) => o.id === selectedId)));
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };
  const pick = (o: RequisitionSourceOption) => {
    setOpen(false);
    triggerRef.current?.focus();
    if (o.id !== selectedId) onSelect(o.id);
  };
  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, matches.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); const o = matches[active]; if (o) pick(o); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
  };

  const shownNumber = selected?.number ?? selectedNumber;
  return (
    <div ref={rootRef} className="relative">
      <div
        className={`h-[52px] pl-2.5 pr-1.5 rounded-lg border flex items-center gap-1.5 transition-colors ${
          disabled ? "border-border bg-[#f8f9fc]" : `bg-white ${open ? "border-[#1a5fb4] ring-2 ring-[#1a5fb4]/20" : "border-[#c3ccda]"}`
        }`}
      >
        <button
          ref={triggerRef}
          id={inputId}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-haspopup="listbox"
          disabled={disabled}
          onClick={() => (open ? setOpen(false) : openList())}
          onKeyDown={(e) => { if (e.key === "ArrowDown" && !open) { e.preventDefault(); openList(); } }}
          className="flex-1 min-w-0 h-[50px] flex items-center gap-2.5 text-left rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[#1a5fb4]/40 disabled:cursor-default"
        >
          <span aria-hidden="true" className="w-[30px] h-[30px] rounded-md bg-[#e8edf7] text-[#1a3a6b] flex items-center justify-center flex-shrink-0">
            <ClipboardList size={16} />
          </span>
          {shownNumber ? (
            <span className="flex-1 min-w-0 flex flex-col leading-snug">
              <span className="font-mono text-[13.5px] font-medium text-foreground truncate">{shownNumber}</span>
              {selected?.hint && <span className="text-xs text-muted-foreground truncate">{selected.hint}</span>}
            </span>
          ) : (
            <span className="flex-1 min-w-0 text-sm text-[#8a97ad] truncate">{placeholder}</span>
          )}
          {!disabled && <ChevronDown size={16} aria-hidden="true" className="text-muted-foreground flex-shrink-0" />}
        </button>
        {selectedId && !disabled && (
          <button type="button" onClick={() => onSelect("")} aria-label={t("storeDocs.sourceClear")} title={t("storeDocs.sourceClear")}
            className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 text-[#8a97ad] hover:text-[#b93636] hover:bg-[#fcebeb] transition-colors">
            <X size={16} />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-30 bg-card border border-border rounded-[10px] shadow-[0_12px_28px_-8px_rgba(11,29,58,0.22)] flex flex-col overflow-hidden">
          <div className="p-2 border-b border-[#eef1f6]">
            <label data-field-box className="h-10 px-3 rounded-lg border border-[#c3ccda] bg-white flex items-center gap-2 focus-within:border-[#1a5fb4] focus-within:ring-2 focus-within:ring-[#1a5fb4]/20">
              <Search size={16} aria-hidden="true" className="text-muted-foreground flex-shrink-0" />
              <input
                autoFocus
                role="combobox"
                aria-expanded="true"
                aria-controls={listId}
                aria-activedescendant={matches[active] ? `${listId}-${matches[active].id}` : undefined}
                aria-label={placeholder}
                placeholder={placeholder}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setActive(0); }}
                onKeyDown={onSearchKey}
                className="flex-1 min-w-0 bg-transparent text-sm text-foreground placeholder:text-[#8a97ad] outline-none"
              />
            </label>
          </div>
          <div id={listId} role="listbox" aria-label={placeholder} className="p-1.5 max-h-[320px] overflow-y-auto flex flex-col">
            {matches.length === 0 ? (
              <p className="px-2.5 py-3 text-[13px] text-muted-foreground">{t("storeDocs.sourceNoMatch")}</p>
            ) : matches.map((o, i) => {
              const sel = o.id === selectedId;
              return (
                <div
                  key={o.id}
                  id={`${listId}-${o.id}`}
                  role="option"
                  aria-selected={sel}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(o)}
                  className={`px-2.5 py-[7px] rounded-md flex items-center gap-3 cursor-pointer ${sel ? "bg-[#e8f0fb]" : i === active ? "bg-[#f4f6fa]" : "bg-white"}`}
                >
                  <span className="flex-1 min-w-0 flex flex-col leading-snug">
                    <span className="font-mono text-[13.5px] font-medium text-foreground">{o.number}</span>
                    {o.hint && <span className="text-xs text-muted-foreground truncate">{o.hint}</span>}
                  </span>
                  {sel && <Check size={16} aria-hidden="true" className="text-[#1a5fb4] flex-shrink-0" />}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
