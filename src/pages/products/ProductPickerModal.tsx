import { useId, useMemo, useState, type KeyboardEvent } from "react";
import { Search, X, Package, PackagePlus, Loader2, Check, Minus, Plus } from "lucide-react";
import type { Product, ProductCategory } from "../../lib/products";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import { useI18n } from "../../lib/i18n";
import { btn } from "../../components/ui/styles";

export interface ProductPickerModalProps {
  open: boolean;
  products: Product[];
  categories: ProductCategory[];
  onSelect: (product: Product) => void;
  onClose: () => void;
  /**
   * หมวดที่ควรขึ้นก่อน (เช่น 4 หมวดคลังของใบเบิก/ใบขอซื้อ) — **จัดลำดับและจัดกลุ่มในช่องเลือกหมวดเท่านั้น
   * ไม่ซ่อนสินค้าตัวไหนเลย**
   *
   * ก่อน 2026-09-09 ใบเบิก/ใบขอซื้อ/เทมเพลตใบเบิกกรองรายการสินค้าด้วยลิสต์ชื่อหมวด 4 ชื่อที่ฮาร์ดโค้ดไว้
   * (`MATERIAL_CATEGORY_NAMES`) ก่อนส่งเข้ามาที่นี่ และหน้าใบเสนอราคากรองกลับทาง ผลคือสินค้าที่สโตร์
   * ตั้งรหัสให้แล้วลงหมวดอื่น **หายไปจากตัวเลือกอย่างถาวร** โดยไม่มีอะไรบอก — เจ้าของเจอเองว่า
   * "ตั้งรหัสเสร็จแล้วสินค้าไม่ขึ้นเลย" การกรองจึงย้ายมาเป็นตัวเลือกที่คนมองเห็นและเปลี่ยนได้เอง
   */
  preferCategoryNames?: string[];
  /** โชว์ยอดคงเหลือแทนราคาขาย — ใบเบิก/ใบขอซื้อ/สโตร์ใช้ (ราคาขายไม่มีความหมายกับเอกสารฝั่งคลัง) */
  showStock?: boolean;
  /**
   * ปุ่ม "ขอรหัสสินค้าใหม่" ท้ายรายการ — รับชื่อที่ผู้ใช้พิมพ์ในช่องค้นหาไป ไม่ส่ง prop นี้มา = ไม่โชว์ปุ่ม
   * จำเป็นกับใบเบิก เพราะบรรทัดใบเบิก**บังคับ**ต้องอ้างสินค้าในคลัง ของที่ยังไม่มีรหัสจึงตีบตัน
   */
  onRequestProductCode?: (name: string) => void | Promise<void>;
  /**
   * โหมดติ๊กหลายรายการ (ดีไซน์ใหม่ 2026-09-30) — **ผู้เรียกต้องเปิดเอง** ผู้เรียกเดิมทุกหน้ายังได้แบบเดิมทุกประการ
   * (คลิกแถวเดียว = เลือกแล้วปิดทันที) · เปิดแล้วเป็นกล่อง 880 แบบตาราง ติ๊กได้หลายรายการ แล้วกด "เพิ่ม N รายการ"
   * ทีเดียว → ได้ `onSelectMany` ตามลำดับที่ติ๊ก (ไม่ส่ง `onSelectMany` = เรียก `onSelect` ทีละตัวตามลำดับนั้น)
   */
  multiSelect?: boolean;
  onSelectMany?: (products: Product[]) => void;
  /** หัวกล่อง/คำอธิบายของโหมดติ๊กหลายรายการ — ไม่ส่ง = "เลือกจากคลังสินค้า" */
  title?: string;
  subtitle?: string;
}

// มอดัลเลือกสินค้าจากแคตตาล็อก จะ mount ฟอร์มจริงเฉพาะตอนเปิดเท่านั้น
// Product picker modal — only mounts the inner form while open.
export function ProductPickerModal(props: ProductPickerModalProps) {
  if (!props.open) return null;
  if (props.multiSelect) return <ProductPickerMultiForm {...props} />;
  return <ProductPickerModalForm {...props} />;
}

/** รายการหมวดที่ใช้ได้ แยก "หมวดที่ควรขึ้นก่อน" กับที่เหลือ — ใช้ทั้งสองโหมด */
function useCategoryGroups(categories: ProductCategory[], preferCategoryNames: string[] | undefined) {
  const preferred = useMemo(() => new Set(preferCategoryNames ?? []), [preferCategoryNames]);
  const usableCategories = useMemo(() => categories.filter((c) => !c.archived), [categories]);
  const preferredCategories = useMemo(() => usableCategories.filter((c) => preferred.has(c.name)), [usableCategories, preferred]);
  const otherCategories = useMemo(() => usableCategories.filter((c) => !preferred.has(c.name)), [usableCategories, preferred]);
  return { preferred, usableCategories, preferredCategories, otherCategories };
}

/**
 * โหมดติ๊กหลายรายการ — ตัวกรองและลำดับเหมือนโหมดเดิมทุกอย่าง (หมวดที่ควรขึ้นก่อนเรียงก่อน ไม่ซ่อนสินค้าตัวไหน)
 * การติ๊กค้างอยู่แม้เปลี่ยนคำค้นหรือหมวด จึงค้นหาสลับไปมาแล้วเก็บหลายตัวรวดเดียวได้
 */
function ProductPickerMultiForm({
  products, categories, onSelect, onSelectMany, onClose, preferCategoryNames, showStock, onRequestProductCode, title, subtitle,
}: ProductPickerModalProps) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [requesting, setRequesting] = useState(false);
  const panelRef = useDialogA11y(onClose);
  const titleId = useId();
  const { preferred, usableCategories, preferredCategories, otherCategories } = useCategoryGroups(categories, preferCategoryNames);
  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? t("products.categoryUnspecified");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rank = (p: Product) => (preferred.has(categories.find((c) => c.id === p.categoryId)?.name ?? "") ? 0 : 1);
    return products
      .filter((p) => !p.archived)
      .filter((p) => (categoryId ? p.categoryId === categoryId : true))
      .filter((p) => (q ? p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) : true))
      .sort((a, b) => rank(a) - rank(b) || a.code.localeCompare(b.code));
  }, [products, categories, search, categoryId, preferred]);

  const pickedSet = new Set(picked);
  const visiblePicked = filtered.filter((p) => pickedSet.has(p.id)).length;
  const allState: boolean | "mixed" = visiblePicked === 0 ? false : visiblePicked === filtered.length ? true : "mixed";
  const toggle = (id: string) => setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleAll = () => {
    const ids = filtered.map((p) => p.id);
    setPicked((prev) => (allState === true ? prev.filter((id) => !ids.includes(id)) : [...prev, ...ids.filter((id) => !prev.includes(id))]));
  };
  const confirm = () => {
    const chosen = picked.map((id) => products.find((p) => p.id === id)).filter((p): p is Product => !!p);
    if (chosen.length === 0) return;
    if (onSelectMany) onSelectMany(chosen);
    else chosen.forEach((p) => onSelect(p));
    onClose();
  };
  const onRowKey = (e: KeyboardEvent<HTMLDivElement>, id: string) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(id); }
  };

  const requestName = search.trim();
  const handleRequestCode = async () => {
    if (!onRequestProductCode || !requestName) return;
    setRequesting(true);
    try {
      await onRequestProductCode(requestName);
    } finally {
      setRequesting(false);
    }
  };

  const cols = "grid-cols-[18px_110px_minmax(0,1fr)_150px_72px_100px]";
  const mark = (state: boolean | "mixed") => (
    <span aria-hidden="true" className={`w-[18px] h-[18px] rounded border-[1.5px] flex items-center justify-center flex-shrink-0 text-white ${state !== false ? "bg-[#0b1d3a] border-[#0b1d3a]" : "bg-white border-[#a3aec2]"}`}>
      {state === "mixed" ? <Minus size={12} strokeWidth={3} /> : state ? <Check size={12} strokeWidth={3} /> : null}
    </span>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 print:hidden">
      <div className="absolute inset-0 bg-[#0b1d3a]/45" onClick={onClose} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="relative w-full max-w-[880px] h-[720px] max-h-[90vh] bg-card rounded-xl shadow-[0_24px_48px_-12px_rgba(11,29,58,0.35)] flex flex-col overflow-hidden">
        <div className="px-6 pt-5 pb-4 flex items-start gap-3 border-b border-[#eef1f6]">
          <div className="flex-1 min-w-0">
            <h2 id={titleId} className="text-lg font-semibold text-foreground leading-snug">{title ?? t("quotation.lineItems.pickFromCatalog")}</h2>
            <p className="text-[13px] text-muted-foreground mt-0.5">{subtitle ?? t("products.picker.multiHint")}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t("common.close")} className="w-9 h-9 -mr-2 -mt-1 rounded-lg text-muted-foreground hover:bg-[#f4f6fa] hover:text-foreground flex items-center justify-center flex-shrink-0">
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-3.5 flex items-center gap-2.5 flex-wrap border-b border-[#eef1f6]">
          <label className="w-full sm:w-[340px] h-10 px-3 rounded-lg border border-[#c3ccda] bg-white flex items-center gap-2 focus-within:border-[#1a5fb4] focus-within:ring-2 focus-within:ring-[#1a5fb4]/20 transition-colors">
            <Search size={16} className="text-muted-foreground flex-shrink-0" />
            <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("products.searchPlaceholder")} aria-label={t("products.searchPlaceholder")}
              className="flex-1 min-w-0 bg-transparent text-sm text-foreground placeholder:text-[#8a97ad] outline-none" />
          </label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            aria-label={t("products.col.category")}
            className="h-10 w-full sm:w-[220px] px-3 rounded-lg border border-[#c3ccda] bg-white text-sm text-foreground outline-none focus:border-[#1a5fb4] focus:ring-2 focus:ring-[#1a5fb4]/20 transition-colors"
          >
            <option value="">{t("products.allCategories")}</option>
            {preferredCategories.length > 0 && otherCategories.length > 0 ? (
              <>
                <optgroup label={t("products.picker.storeGroup")}>
                  {preferredCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </optgroup>
                <optgroup label={t("products.picker.otherGroup")}>
                  {otherCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </optgroup>
              </>
            ) : (
              usableCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)
            )}
          </select>
          <span className="flex-1" />
          <span className="text-[13px] text-muted-foreground whitespace-nowrap">{t("ui.itemCount").replace("{n}", String(filtered.length))}</span>
        </div>
        <div className="flex-1 min-h-0 overflow-auto">
          <div className="min-w-[720px]">
            <div className={`sticky top-0 z-[1] h-10 px-6 grid gap-3.5 items-center bg-[#f8f9fc] border-b border-border text-[12.5px] font-semibold text-[#3d5173] ${cols}`}>
              {filtered.length > 0 ? (
                <span role="checkbox" aria-checked={allState} aria-label={t("project.picker.selectAll")} tabIndex={0} onClick={toggleAll}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleAll(); } }}
                  className="cursor-pointer rounded outline-none focus-visible:ring-2 focus-visible:ring-[#1a5fb4]/40">
                  {mark(allState)}
                </span>
              ) : <span />}
              <span>{t("products.col.code")}</span>
              <span>{t("products.col.name")}</span>
              <span>{t("products.col.category")}</span>
              <span>{t("products.col.unit")}</span>
              <span className="text-right">{showStock ? t("products.picker.stockLabel") : t("products.col.price")}</span>
            </div>
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <Package size={20} className="text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{t("products.noFilterResults")}</p>
              </div>
            ) : filtered.map((p) => {
              const on = pickedSet.has(p.id);
              const stock = p.stockQty ?? 0;
              return (
                <div
                  key={p.id}
                  role="checkbox"
                  aria-checked={on}
                  tabIndex={0}
                  onClick={() => toggle(p.id)}
                  onKeyDown={(e) => onRowKey(e, p.id)}
                  className={`grid gap-3.5 items-center px-6 min-h-[50px] py-1.5 border-b border-[#eef1f6] cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1a5fb4]/40 transition-colors ${cols} ${on ? "bg-[#eef4fc]" : "bg-white hover:bg-[#f8f9fc]"}`}
                >
                  {mark(on)}
                  <span className="font-mono text-[13px] font-medium text-[#3d5173] truncate">{p.code}</span>
                  <span className="text-sm font-medium text-foreground truncate" title={p.name}>{p.name}</span>
                  <span className="text-sm text-[#3d5173] truncate">{categoryName(p.categoryId)}</span>
                  <span className="text-sm text-[#3d5173] truncate">{p.unit}</span>
                  {showStock ? (
                    <span className={`text-sm text-right font-semibold tabular-nums ${stock > 0 ? "text-foreground" : "text-[#8a5a00]"}`}>{stock.toLocaleString()}</span>
                  ) : (
                    <span className="text-sm text-right font-semibold tabular-nums text-foreground">฿{p.defaultPrice.toLocaleString()}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div className="px-6 py-3.5 border-t border-border flex items-center gap-2.5 flex-wrap">
          <span className="text-sm text-[#3d5173]">{t("ui.selectedCount").replace("{n}", String(picked.length))}</span>
          {onRequestProductCode && (
            <>
              <span aria-hidden="true" className="w-px h-5 bg-border mx-1" />
              <button
                type="button"
                onClick={() => void handleRequestCode()}
                disabled={!requestName || requesting}
                title={t("products.picker.requestCodeHint")}
                className={btn.text}
              >
                {requesting ? <Loader2 size={16} className="animate-spin" /> : <PackagePlus size={16} />}
                {requestName ? t("products.picker.requestCode").replace("{name}", requestName) : t("products.picker.requestCodeEmpty")}
              </button>
            </>
          )}
          <span className="flex-1" />
          <button type="button" onClick={onClose} className={btn.secondary}>{t("common.cancel")}</button>
          <button type="button" onClick={confirm} disabled={picked.length === 0} className={btn.primary}>
            <Plus size={16} /> {t("products.picker.addSelected").replace("{n}", String(picked.length))}
          </button>
        </div>
      </div>
    </div>
  );
}

// ฟอร์มค้นหาและเลือกสินค้าจากรายการสินค้าที่ยังไม่ถูกเก็บถาวร
// Form for searching and selecting a product from the non-archived catalog.
function ProductPickerModalForm({
  products,
  categories,
  onSelect,
  onClose,
  preferCategoryNames,
  showStock,
  onRequestProductCode,
}: ProductPickerModalProps) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [requesting, setRequesting] = useState(false);
  const panelRef = useDialogA11y(onClose);
  const titleId = useId();

  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? t("products.categoryUnspecified");

  const preferred = useMemo(() => new Set(preferCategoryNames ?? []), [preferCategoryNames]);
  const usableCategories = useMemo(() => categories.filter((c) => !c.archived), [categories]);
  const preferredCategories = useMemo(() => usableCategories.filter((c) => preferred.has(c.name)), [usableCategories, preferred]);
  const otherCategories = useMemo(() => usableCategories.filter((c) => !preferred.has(c.name)), [usableCategories, preferred]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rank = (p: Product) => (preferred.has(categories.find((c) => c.id === p.categoryId)?.name ?? "") ? 0 : 1);
    return products
      .filter((p) => !p.archived)
      .filter((p) => (categoryId ? p.categoryId === categoryId : true))
      .filter((p) => (q ? p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) : true))
      .sort((a, b) => rank(a) - rank(b) || a.code.localeCompare(b.code));
  }, [products, categories, search, categoryId, preferred]);

  const requestName = search.trim();
  const handleRequestCode = async () => {
    if (!onRequestProductCode || !requestName) return;
    setRequesting(true);
    try {
      await onRequestProductCode(requestName);
    } finally {
      setRequesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#0b1d3a]/40" onClick={onClose} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 id={titleId} className="text-sm font-semibold text-foreground">{t("quotation.lineItems.pickFromCatalog")}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors"><X size={16} /></button>
        </div>
        <div className="px-5 py-3 border-b border-border flex flex-col gap-2 sm:flex-row sm:items-center">
          <div data-field-box="" className="flex items-center gap-2 bg-white border border-[#c3ccda] rounded-lg px-3 py-2 focus-within:border-[#1a5fb4] focus-within:ring-2 focus-within:ring-[#1a5fb4]/20 transition-colors flex-1">
            <Search size={14} className="text-muted-foreground flex-shrink-0" />
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("products.searchPlaceholder")}
              className="bg-transparent text-sm text-foreground placeholder-muted-foreground outline-none w-full"
            />
          </div>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            aria-label={t("products.col.category")}
            className="text-xs text-foreground bg-white border border-[#c3ccda] rounded-lg px-2.5 py-2 outline-none focus:border-[#1a5fb4] focus:ring-2 focus:ring-[#1a5fb4]/20 transition-colors sm:w-44"
          >
            <option value="">{t("products.allCategories")}</option>
            {preferredCategories.length > 0 && otherCategories.length > 0 ? (
              <>
                <optgroup label={t("products.picker.storeGroup")}>
                  {preferredCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </optgroup>
                <optgroup label={t("products.picker.otherGroup")}>
                  {otherCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </optgroup>
              </>
            ) : (
              usableCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)
            )}
          </select>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <Package size={20} className="text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t("products.noFilterResults")}</p>
            </div>
          ) : (
            filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => { onSelect(p); onClose(); }}
                className="w-full flex items-center justify-between px-5 py-3 border-b border-border/50 hover:bg-secondary/40 transition-colors text-left"
              >
                <div className="min-w-0">
                  <p className="text-sm text-foreground font-medium truncate">{p.name}</p>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">{p.code} · {categoryName(p.categoryId)} · {p.unit}</p>
                </div>
                {showStock ? (
                  <span className="text-xs font-mono text-muted-foreground flex-shrink-0 ml-3">
                    {t("products.picker.stockLabel")}{" "}
                    <span className={`font-semibold ${(p.stockQty ?? 0) > 0 ? "text-foreground" : "text-amber-600"}`}>{(p.stockQty ?? 0).toLocaleString()}</span>
                  </span>
                ) : (
                  <span className="text-sm font-mono text-[#c9a84c] font-semibold flex-shrink-0 ml-3">฿{p.defaultPrice.toLocaleString()}</span>
                )}
              </button>
            ))
          )}
        </div>
        {onRequestProductCode && (
          <div className="px-5 py-3 border-t border-border">
            <button
              onClick={() => void handleRequestCode()}
              disabled={!requestName || requesting}
              title={t("products.picker.requestCodeHint")}
              className="flex items-center gap-1.5 text-xs text-[#c9a84c] hover:text-[#b8973f] transition-colors disabled:opacity-50"
            >
              {requesting ? <Loader2 size={12} className="animate-spin" /> : <PackagePlus size={12} />}
              {requestName
                ? t("products.picker.requestCode").replace("{name}", requestName)
                : t("products.picker.requestCodeEmpty")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
