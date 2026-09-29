import type { KitRecipe } from "../../lib/products";
import type { StoreSlipRow } from "./StoreSlipPrint";

/** ต่อบรรทัดชิ้นส่วนไว้ใต้บรรทัดสินค้าชุด — ผู้เรียกส่ง `productId` ของแต่ละบรรทัดมาด้วย */
export function withKitChildRows(rows: (StoreSlipRow & { productId: string })[], kits: Map<string, KitRecipe>): StoreSlipRow[] {
  return rows.flatMap(({ productId, ...r }) => {
    const kit = kits.get(productId);
    if (!kit) return [r];
    return [r, ...kit.components.map((c) => ({
      key: `${r.key}-${c.productId}`, code: c.code, name: c.name, qty: Math.round(c.qty * r.qty * 10000) / 10000, unit: c.unit, unitCost: 0, child: true,
    }))];
  });
}
