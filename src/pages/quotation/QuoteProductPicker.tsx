import { useMemo, useState } from "react";
import { Search, Check, Minus } from "lucide-react";
import type { Product, ProductCategory } from "../../lib/products";
import { PickerDialog } from "../../components/ui/Overlays";
import { field, table } from "../../components/ui/styles";
import { fmt } from "../../lib/quotes";
import { useI18n } from "../../lib/i18n";

/**
 * เลือกสินค้าจากคลังเข้าใบเสนอราคา — ติ๊กได้หลายรายการแล้วกดยืนยันครั้งเดียว (ดีไซน์ใหม่ 2026-09-30, Dlg-ProductPicker)
 *
 * แยกจาก `ProductPickerModal` ของหน้าสินค้า (ที่ใบเบิก/ใบขอซื้อ/ใบรับสินค้า/เทมเพลตยังใช้แบบคลิกเดียวอยู่) เพื่อไม่เปลี่ยน
 * พฤติกรรมของหน้าอื่น · กติกาเดิมทุกข้อคงไว้: เห็นทั้งคลังยกเว้นสินค้าที่เก็บถาวร ค้นจากรหัส/ชื่อ กรองหมวดเองได้
 * (ก่อน 2026-09-09 เคยกรองหมวดคลังทิ้งจนสินค้าหาย — ดูคอมเมนต์ใน ProductPickerModal) · เรียงตามรหัส
 */
export function QuoteProductPicker({ open, products, categories, documentLabel, onConfirm, onClose }: {
  open: boolean;
  products: Product[];
  categories: ProductCategory[];
  documentLabel: string;
  onConfirm: (picked: Product[]) => void;
  onClose: () => void;
}) {
  if (!open) return null;
  return <PickerBody {...{ products, categories, documentLabel, onConfirm, onClose }} />;
}

function PickerBody({ products, categories, documentLabel, onConfirm, onClose }: {
  products: Product[];
  categories: ProductCategory[];
  documentLabel: string;
  onConfirm: (picked: Product[]) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? t("products.categoryUnspecified");
  const usableCategories = useMemo(() => categories.filter((c) => !c.archived), [categories]);
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products
      .filter((p) => !p.archived)
      .filter((p) => (categoryId ? p.categoryId === categoryId : true))
      .filter((p) => (q ? p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) : true))
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [products, search, categoryId]);

  const selectedSet = new Set(selected);
  const visibleSelected = visible.filter((p) => selectedSet.has(p.id)).length;
  const allVisibleSelected = visible.length > 0 && visibleSelected === visible.length;
  const toggle = (id: string) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleAllVisible = () => {
    const ids = visible.map((p) => p.id);
    setSelected((prev) => (allVisibleSelected ? prev.filter((id) => !ids.includes(id)) : [...prev, ...ids.filter((id) => !prev.includes(id))]));
  };
  // คงลำดับตามที่ติ๊ก — รายการเข้าไปต่อท้ายใบตามลำดับที่ผู้ใช้เลือก
  const confirm = () => {
    const byId = new Map(products.map((p) => [p.id, p]));
    onConfirm(selected.map((id) => byId.get(id)).filter((p): p is Product => !!p));
  };

  const box = (on: boolean, mixed = false) => (
    <span aria-hidden="true" className={`w-[18px] h-[18px] rounded flex items-center justify-center flex-shrink-0 border-[1.5px] ${on || mixed ? "bg-[#0b1d3a] border-[#0b1d3a] text-white" : "bg-white border-[#a3aec2]"}`}>
      {on ? <Check size={12} strokeWidth={3} /> : mixed ? <Minus size={12} strokeWidth={3} /> : null}
    </span>
  );

  return (
    <PickerDialog
      open
      title={t("quotation.lineItems.pickFromCatalog")}
      subtitle={t("quotation.picker.subtitle").replace("{doc}", documentLabel)}
      onClose={onClose}
      selectedCount={selected.length}
      confirmLabel={t("quotation.picker.confirm").replace("{n}", String(selected.length))}
      confirmDisabled={selected.length === 0}
      onConfirm={confirm}
      toolbar={
        <>
          <label className={`${field.box} w-full sm:w-[340px]`}>
            <Search size={16} className="text-muted-foreground flex-shrink-0" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("products.searchPlaceholder")}
              aria-label={t("products.searchPlaceholder")}
              className="flex-1 min-w-0 bg-transparent text-sm text-foreground placeholder:text-[#8a97ad] outline-none"
            />
          </label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            aria-label={t("products.col.category")}
            className={`${field.input} w-full sm:w-56`}
          >
            <option value="">{t("products.allCategories")}</option>
            {usableCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <span className="flex-1" />
          <span className="text-[13px] text-muted-foreground">{t("ui.itemCount").replace("{n}", String(visible.length))}</span>
        </>
      }
    >
      {visible.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">{t("products.noFilterResults")}</p>
      ) : (
        <table className="w-full min-w-[680px]">
          <thead className="sticky top-0 z-10">
            <tr className={table.head}>
              <th className={`${table.th} w-10`}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={allVisibleSelected ? "true" : visibleSelected > 0 ? "mixed" : "false"}
                  aria-label={t("quotation.picker.selectAll")}
                  onClick={toggleAllVisible}
                  className="flex items-center outline-none focus-visible:ring-2 focus-visible:ring-[#1a5fb4]/40 rounded"
                >
                  {box(allVisibleSelected, visibleSelected > 0)}
                </button>
              </th>
              <th className={table.th}>{t("products.col.code")}</th>
              <th className={table.th}>{t("products.col.name")}</th>
              <th className={table.th}>{t("products.col.category")}</th>
              <th className={table.th}>{t("quotation.lineItems.col.unit")}</th>
              <th className={table.th.replace("text-left", "text-right")}>{t("products.col.price")} (฿)</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => {
              const on = selectedSet.has(p.id);
              return (
                <tr
                  key={p.id}
                  role="checkbox"
                  aria-checked={on}
                  tabIndex={0}
                  onClick={() => toggle(p.id)}
                  onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(p.id); } }}
                  className={`h-[52px] border-b border-[#eef1f6] cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1a5fb4]/40 transition-colors ${on ? "bg-[#eef4fc]" : "bg-white hover:bg-[#f8f9fc]"}`}
                >
                  <td className={table.td}>{box(on)}</td>
                  <td className={`${table.td} font-mono text-[13px] font-medium text-[#3d5173] whitespace-nowrap`}>{p.code}</td>
                  <td className={`${table.td} text-sm font-medium text-foreground max-w-[280px] truncate`} title={p.name}>{p.name}</td>
                  <td className={`${table.td} text-sm text-[#3d5173] max-w-[170px] truncate`}>{categoryName(p.categoryId)}</td>
                  <td className={`${table.td} text-sm text-[#3d5173]`}>{p.unit}</td>
                  <td className={`${table.td} ${table.money} text-sm`}>{fmt(p.defaultPrice)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </PickerDialog>
  );
}
