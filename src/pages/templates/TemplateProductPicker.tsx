import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import type { Product, ProductCategory } from "../../lib/products";
import { PickerDialog } from "../../components/ui/Overlays";
import { ListEmpty } from "../../components/ui/ListPage";
import { field, table } from "../../components/ui/styles";
import { useI18n } from "../../lib/i18n";

/**
 * หน้าต่างเลือกสินค้าให้ Section ของ Template (ดีไซน์ใหม่ 2026-09-30) — ติ๊กได้หลายรายการแล้วกดยืนยันครั้งเดียว
 * แทน ProductPickerModal ที่คลิกแล้วเพิ่มทันทีทีละตัว · รายการถูกเพิ่มตามลำดับที่ติ๊ก
 */
export function TemplateProductPicker({ open, sectionLabel, products, categories, onConfirm, onClose }: {
  open: boolean;
  /** เช่น "§1 FRP Tank" */
  sectionLabel: string;
  products: Product[];
  categories: ProductCategory[];
  onConfirm: (picked: Product[]) => void;
  onClose: () => void;
}) {
  if (!open) return null;
  return <PickerBody {...{ sectionLabel, products, categories, onConfirm, onClose }} />;
}

function PickerBody({ sectionLabel, products, categories, onConfirm, onClose }: {
  sectionLabel: string;
  products: Product[];
  categories: ProductCategory[];
  onConfirm: (picked: Product[]) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const allRef = useRef<HTMLInputElement>(null);

  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? t("products.categoryUnspecified");
  const usableCategories = useMemo(() => categories.filter((c) => !c.archived), [categories]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products
      .filter((p) => !p.archived)
      .filter((p) => (categoryId ? p.categoryId === categoryId : true))
      .filter((p) => (q ? p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) : true))
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [products, search, categoryId]);

  const selectedSet = new Set(selected);
  const shownSelected = filtered.filter((p) => selectedSet.has(p.id)).length;
  const allShown = filtered.length > 0 && shownSelected === filtered.length;

  useEffect(() => {
    if (allRef.current) allRef.current.indeterminate = shownSelected > 0 && !allShown;
  }, [shownSelected, allShown]);

  const toggle = (id: string) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleAll = () => {
    const ids = filtered.map((p) => p.id);
    setSelected((prev) => (allShown ? prev.filter((id) => !ids.includes(id)) : [...prev, ...ids.filter((id) => !prev.includes(id))]));
  };
  const confirm = () => {
    const byId = new Map(products.map((p) => [p.id, p]));
    onConfirm(selected.map((id) => byId.get(id)).filter((p): p is Product => !!p));
  };

  return (
    <PickerDialog
      open
      title={t("quotation.lineItems.pickFromCatalog")}
      subtitle={t("templates.picker.subtitle").replace("{section}", sectionLabel)}
      onClose={onClose}
      selectedCount={selected.length}
      confirmLabel={t("templates.picker.add").replace("{n}", String(selected.length))}
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
            {search && (
              <button type="button" onClick={() => setSearch("")} aria-label={t("common.close")} className="text-muted-foreground hover:text-foreground">
                <X size={14} />
              </button>
            )}
          </label>
          <span className="relative w-full sm:w-[220px]">
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              aria-label={t("products.col.category")}
              className={`${field.input} w-full pr-9 appearance-none`}
            >
              <option value="">{t("products.allCategories")}</option>
              {usableCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute right-3 top-3 pointer-events-none text-muted-foreground"><path d="m6 9 6 6 6-6" /></svg>
          </span>
          <span className="flex-1" />
          <span className="text-[13px] text-muted-foreground whitespace-nowrap">{t("ui.itemCount").replace("{n}", String(filtered.length))}</span>
        </>
      }
    >
      {filtered.length === 0 ? (
        <ListEmpty title={t("products.noFilterResults")} />
      ) : (
        <table className="w-full min-w-[720px] table-fixed text-sm">
          <thead className="sticky top-0 z-10">
            <tr className={table.head}>
              <th className={`${table.th} w-[52px]`}>
                <input
                  ref={allRef}
                  type="checkbox"
                  checked={allShown}
                  onChange={toggleAll}
                  aria-label={t("templates.picker.selectAll")}
                  className="w-[18px] h-[18px] align-middle accent-[#0b1d3a] cursor-pointer"
                />
              </th>
              <th className={`${table.th} w-[120px]`}>{t("products.col.code")}</th>
              <th className={table.th}>{t("products.col.name")}</th>
              <th className={`${table.th} w-[170px]`}>{t("products.col.category")}</th>
              <th className={`${table.th} w-[80px]`}>{t("products.col.unit")}</th>
              <th className={`${table.th} w-[140px] text-right`}>{t("products.col.price")} (฿)</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => {
              const on = selectedSet.has(p.id);
              return (
                <tr
                  key={p.id}
                  onClick={() => toggle(p.id)}
                  className={`h-[52px] border-b border-[#eef1f6] cursor-pointer transition-colors ${on ? "bg-[#eef4fc]" : "bg-white hover:bg-[#f8f9fc]"}`}
                >
                  <td className={table.td}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggle(p.id)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`${p.code} ${p.name}`}
                      className="w-[18px] h-[18px] align-middle accent-[#0b1d3a] cursor-pointer"
                    />
                  </td>
                  <td className={`${table.td} font-mono text-[13px] font-medium text-[#3d5173] truncate`}>{p.code}</td>
                  <td className={`${table.td} font-medium text-foreground truncate`} title={p.name}>{p.name}</td>
                  <td className={`${table.td} text-[#3d5173] truncate`}>{categoryName(p.categoryId)}</td>
                  <td className={`${table.td} text-[#3d5173] truncate`}>{p.unit}</td>
                  <td className={`${table.td} ${table.money}`}>{p.defaultPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </PickerDialog>
  );
}
