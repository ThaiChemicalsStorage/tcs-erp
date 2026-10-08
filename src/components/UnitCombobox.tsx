import { Combobox } from "./Combobox";
import { useUnitOptions } from "../lib/unitOptions";

/** ช่อง "หน่วย" ที่พิมพ์แล้วขึ้นรายการหน่วยจากแคตตาล็อก แต่ยังพิมพ์เองได้ (2026-10-06) — ผู้เรียกคุมหน้าตาด้วย `className` เหมือน `<input>` */
export function UnitCombobox({ value, onChange, className, ariaLabel, placeholder, disabled, id }: {
  value: string;
  onChange: (next: string) => void;
  className?: string;
  ariaLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
}) {
  const options = useUnitOptions();
  return (
    <Combobox value={value} onChange={onChange} options={options} className={className} ariaLabel={ariaLabel}
      placeholder={placeholder} disabled={disabled} id={id} maxLength={40}
      // บรรทัดรอง "ใช้ใน N สินค้า" ไม่ใช่ข้อมูลที่ค้นหา — ถ้าค้นด้วย พิมพ์ "ช" ก็ตรงทุกหน่วย (2026-10-08)
      searchHint={false} />
  );
}
