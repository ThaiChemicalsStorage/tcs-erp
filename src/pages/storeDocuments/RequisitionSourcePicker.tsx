import { useState } from "react";
import { X } from "lucide-react";
import { Combobox, type ComboboxOption } from "../../components/Combobox";
import { useI18n } from "../../lib/i18n";

export interface RequisitionSourceOption {
  id: string;
  /** เลขที่ใบเบิกที่คนอ่าน */
  number: string;
  /** บรรทัดรอง: แผนก · รหัสงาน · ลูกค้า … — ค้นได้ด้วย */
  hint: string;
}

/**
 * ช่อง "อ้างอิงใบเบิก" แบบพิมพ์ค้นหาได้ (2026-09-23 — เจ้าของ: *"ทำให้มันค้นหาตรงอ้างอิงใบเบิกได้ด้วย"*) ใช้ทั้งใบจ่ายและใบรับคืน
 * ของสโตร์ · พิมพ์เลขใบเบิก รหัสงาน แผนก หรือชื่อลูกค้า แล้วเลือกจากรายการ — **เลือกจากรายการเท่านั้นถึงจะเปลี่ยนใบเบิกที่อ้าง**
 * (ข้อความที่พิมพ์ค้างไว้ไม่ถูกบันทึก) · ปุ่ม × = ไม่อ้างอิงใบเบิก
 *
 * ช่องพิมพ์เริ่มว่างเสมอ เลขของใบที่เลือกอยู่แสดงเป็น placeholder สีตัวอักษรปกติ — คลิกแล้วรายการจึงขึ้นครบทุกใบ
 * (ถ้าใส่เลขไว้ในช่อง รายการจะถูกกรองเหลือใบเดียวทันทีที่คลิก) · ผู้เรียกใส่ `key={selectedId}` ให้ช่องล้างตัวเอง
 * ทุกครั้งที่ใบที่อ้างเปลี่ยน โดยไม่ต้องซิงก์สเตทใน effect
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
  const [query, setQuery] = useState("");
  const comboOptions: ComboboxOption[] = options.map((o) => ({ value: o.id, label: o.number, hint: o.hint }));

  return (
    <div className="relative">
      <Combobox
        id={inputId}
        value={query}
        onChange={(next) => {
          // Combobox ใส่ value (= id) ลงช่องตอนเลือก — แสดงเลขที่ใบแทน id
          const picked = options.find((o) => o.id === next);
          setQuery(picked ? picked.number : next);
        }}
        onPick={(o) => { if (o.value !== selectedId) onSelect(o.value); }}
        options={comboOptions}
        disabled={disabled}
        placeholder={selectedNumber || placeholder}
        ariaLabel={placeholder}
        emptyMessage={t("storeDocs.sourceNoMatch")}
        className={`w-full text-sm font-mono text-foreground bg-secondary border border-border rounded-lg pl-3 pr-9 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-70${selectedId ? " placeholder:text-foreground" : ""}`}
      />
      {selectedId && !disabled && (
        <button type="button" onClick={() => onSelect("")} aria-label={t("storeDocs.sourceClear")} title={t("storeDocs.sourceClear")}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-muted-foreground hover:text-[#e05252] hover:bg-[#e05252]/10 transition-colors">
          <X size={14} />
        </button>
      )}
    </div>
  );
}
