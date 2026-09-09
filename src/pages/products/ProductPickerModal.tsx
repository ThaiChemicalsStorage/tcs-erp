import { useId, useMemo, useState } from "react";
import { Search, X, Package, PackagePlus, Loader2 } from "lucide-react";
import type { Product, ProductCategory } from "../../lib/products";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import { useI18n } from "../../lib/i18n";

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
}

// มอดัลเลือกสินค้าจากแคตตาล็อก จะ mount ฟอร์มจริงเฉพาะตอนเปิดเท่านั้น
// Product picker modal — only mounts the inner form while open.
export function ProductPickerModal(props: ProductPickerModalProps) {
  if (!props.open) return null;
  return <ProductPickerModalForm {...props} />;
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
          <h2 id={titleId} className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("quotation.lineItems.pickFromCatalog")}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors"><X size={16} /></button>
        </div>
        <div className="px-5 py-3 border-b border-border flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 bg-secondary border border-border rounded-lg px-3 py-2 focus-within:border-[#c9a84c]/40 transition-colors flex-1">
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
            className="text-xs text-foreground bg-secondary border border-border rounded-lg px-2.5 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors sm:w-44"
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
