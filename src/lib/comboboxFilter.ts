import type { ComboboxOption } from "../components/Combobox";

/**
 * กรองตัวเลือกของ `Combobox` ตามคำที่พิมพ์ — แยกจากคอมโพเนนต์ให้เทสต์ได้โดยไม่ต้องเรนเดอร์ React
 *
 * ปกติค้นทั้งค่า ป้าย และบรรทัดรอง (`hint`) เพราะหลายที่ใช้บรรทัดรองเป็นข้อมูลค้นหาได้จริง เช่น ชื่อเต็มของรหัส
 * หรือเบอร์โทรผู้ขาย · `searchHint: false` สำหรับที่ที่บรรทัดรองเป็นแค่คำอธิบาย — ช่องหน่วยนับมีบรรทัดรอง
 * "ใช้ใน N สินค้า" ทุกตัว พิมพ์ "ช"/"ส"/"ค" ก็ตรงกับทุกหน่วย รายการเลยไม่ถูกกรองเลย (2026-10-08, Tuhmo #27)
 */
export function filterComboboxOptions(
  options: ComboboxOption[],
  query: string,
  { searchHint = true, limit }: { searchHint?: boolean; limit?: number } = {},
): ComboboxOption[] {
  const q = query.trim().toLowerCase();
  const matched = q === ""
    ? options
    : options.filter((o) => [o.value, o.label ?? "", searchHint ? o.hint ?? "" : ""].some((f) => f.toLowerCase().includes(q)));
  return limit === undefined ? matched : matched.slice(0, limit);
}
