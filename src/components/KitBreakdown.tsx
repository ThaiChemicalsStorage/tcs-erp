import { kitBreakdownText, type KitRecipe } from "../lib/products";
import { useI18n } from "../lib/i18n";

/** สินค้าชุด (2026-09-29) — เจ้าของเลือก "โชว์ทั้ง 2 อย่าง": บรรทัดเอกสารแสดงชื่อชุด และแตกชิ้นส่วนที่ถูกตัดจริงไว้ข้างใต้ · สูตรมาจาก `useKitRecipes()` */

/**
 * บรรทัดเล็กใต้ชื่อสินค้า: "ชุด · สกรู M6x30 ×10 ตัว · แหวน M6 ×20 ตัว" — ไม่ใช่ชุด = ไม่แสดงอะไร
 * `qty` ว่าง/0 = แสดงต่อหนึ่งชุด (ยังไม่ได้กรอกจำนวน)
 */
export function KitBreakdown({ productId, qty, kits, className = "" }: {
  productId: string | null | undefined;
  qty: number | null | undefined;
  kits: Map<string, KitRecipe>;
  className?: string;
}) {
  const { t } = useI18n();
  const kit = productId ? kits.get(productId) : undefined;
  if (!kit) return null;
  const perKit = !qty || qty <= 0;
  return (
    <span className={`block text-xs text-muted-foreground mt-0.5 font-normal ${className}`}>
      <span className="inline-flex items-center px-1.5 rounded bg-[#c9a84c]/10 text-[#866d28] border border-[#c9a84c]/25 mr-1.5">{t("kit.badge")}</span>
      {perKit && <span className="mr-1">{t("kit.perKit")}</span>}
      {kitBreakdownText(kit.components, perKit ? 1 : qty)}
    </span>
  );
}
