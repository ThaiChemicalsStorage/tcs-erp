import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Product } from "./products";
import type { ComboboxOption } from "../components/Combobox";

/**
 * ตัวเลือกหน่วยนับสำหรับช่อง "หน่วย" ทุกเอกสาร (2026-10-06, Tuhmo #27) — เดิมเป็นช่องพิมพ์อิสระ 13 จุด แต่ละคนพิมพ์ต่างกัน
 * ("ชุด"/"Set"/"set") ตอนนี้พิมพ์แล้วขึ้นรายการหน่วยที่แคตตาล็อกสินค้าใช้อยู่จริง (เรียงตามจำนวนสินค้าที่ใช้) ยังพิมพ์หน่วยใหม่เองได้
 *
 * ใช้สินค้าที่ `App.tsx` โหลดไว้แล้วตอนบูต (แบบเดียวกับ `UserDirectoryProvider`) ไม่ยิง API เพิ่ม · ระหว่างยังโหลดไม่เสร็จ
 * หรือไม่มีสิทธิ์ดูสินค้า ได้รายการหน่วยพื้นฐานชุดเดียวกัน
 */

const COMMON_UNITS = ["ชิ้น", "ชุด", "ตัว", "อัน", "เมตร", "ม้วน", "แผ่น", "กล่อง", "ถุง", "ลิตร", "กก.", "Set", "Lot", "Job"];

export function buildUnitOptions(products: Pick<Product, "unit" | "archived">[]): ComboboxOption[] {
  const counts = new Map<string, number>();
  for (const p of products) {
    const unit = p.unit?.trim();
    if (!unit || p.archived) continue;
    counts.set(unit, (counts.get(unit) ?? 0) + 1);
  }
  const fromCatalog = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "th"))
    .map(([value, n]) => ({ value, hint: `ใช้ใน ${n.toLocaleString("en-US")} สินค้า` }));
  const seen = new Set(fromCatalog.map((o) => o.value.toLowerCase()));
  return [...fromCatalog, ...COMMON_UNITS.filter((u) => !seen.has(u.toLowerCase())).map((value) => ({ value }))];
}

const UnitOptionsContext = createContext<ComboboxOption[]>(buildUnitOptions([]));

export function UnitOptionsProvider({ products, children }: { products: Pick<Product, "unit" | "archived">[]; children: ReactNode }) {
  const options = useMemo(() => buildUnitOptions(products), [products]);
  return <UnitOptionsContext.Provider value={options}>{children}</UnitOptionsContext.Provider>;
}

export function useUnitOptions(): ComboboxOption[] {
  return useContext(UnitOptionsContext);
}
