import { useMemo, useState } from "react";
import { ChevronRight, Layers, Plus, Save, X } from "lucide-react";
import { type Product, type ProductCategory, isKitProduct } from "../../lib/products";
import { useI18n } from "../../lib/i18n";
import { Combobox } from "../../components/Combobox";

export interface ProductDraft {
  code: string;
  name: string;
  categoryId: string;
  unit: string;
  defaultPrice: number;
  description: string;
  specifications: string;
  /** "เครื่องมือ — ต้องคืน" ดู Product.isTool (2026-09-03) */
  isTool: boolean;
  /** สูตรชุด (2026-09-29) — ว่าง = ไม่ใช่ชุด · ดู Product.kitComponents */
  kitComponents: { productId: string; qty: number }[];
}

/** แถวสูตรชุดบนฟอร์ม — `text` คือสิ่งที่พิมพ์ในช่องค้นหา (Combobox เป็นข้อความอิสระ) `productId` ตั้งเมื่อเลือกจากรายการ */
interface KitRow {
  key: string;
  productId: string;
  text: string;
  qty: string;
}
let kitRowSeq = 0;
const kitRowKey = () => `kr${++kitRowSeq}`;

const inputCls = "w-full text-sm text-foreground bg-white border border-[#c3ccda] rounded-lg px-3 py-2 outline-none focus:border-[#1a5fb4] focus:ring-2 focus:ring-[#1a5fb4]/20 transition-colors";
const labelCls = "text-xs text-muted-foreground block mb-1.5";

// ฟอร์มสำหรับสร้างหรือแก้ไขข้อมูลสินค้าหนึ่งรายการ
// Form for creating or editing a single product.
export function ProductForm({
  mode,
  initial,
  categories,
  existingCodes,
  allProducts,
  onSave,
  onCancel,
}: {
  mode: "create" | "edit";
  initial?: Product;
  categories: ProductCategory[];
  existingCodes: string[];
  /** ตัวเลือกชิ้นส่วนของสูตรชุด (2026-09-29) */
  allProducts: Product[];
  onSave: (draft: ProductDraft) => Promise<string | null>;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const activeCategories = categories.filter((c) => !c.archived || c.id === initial?.categoryId);

  const [code, setCode] = useState(initial?.code ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? activeCategories[0]?.id ?? "");
  const [unit, setUnit] = useState(initial?.unit ?? "");
  const [defaultPrice, setDefaultPrice] = useState(initial?.defaultPrice ?? 0);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [specifications, setSpecifications] = useState(initial?.specifications ?? "");
  const [isTool, setIsTool] = useState(initial?.isTool === true);
  // สูตรชุด (2026-09-29) — เปิดส่วนนี้เมื่อเป็นชุดอยู่แล้วหรือกด "ตั้งเป็นสินค้าชุด"
  const [kitRows, setKitRows] = useState<KitRow[]>(() => (initial?.kitComponents ?? []).map((c) => ({
    key: kitRowKey(), productId: c.productId, text: `${c.code} ${c.name}`, qty: String(c.qty),
  })));
  const isKit = kitRows.length > 0;
  // ชิ้นส่วนที่เลือกได้: ไม่ใช่ตัวเอง ไม่ใช่ชุด ไม่ถูกเก็บถาวร
  const componentOptions = useMemo(() => allProducts
    .filter((p) => p.id !== initial?.id && !isKitProduct(p) && !p.archived)
    .map((p) => ({ id: p.id, option: { value: `${p.code} ${p.name}`, hint: p.unit ? `${t("products.kit.stockHint")} ${p.stockQty.toLocaleString()} ${p.unit}` : undefined } })),
  [allProducts, initial?.id, t]);
  const idByOptionValue = useMemo(() => new Map(componentOptions.map((o) => [o.option.value, o.id])), [componentOptions]);
  const setKitRow = (key: string, patch: Partial<KitRow>) => setKitRows((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // ตรวจสอบความถูกต้องของทุกฟิลด์ในฟอร์มก่อนบันทึก
  // Validates all form fields before saving.
  const validate = () => {
    const e: Record<string, string> = {};
    if (!code.trim()) e.code = t("products.form.errorCode");
    else if (existingCodes.includes(code.trim().toUpperCase())) e.code = t("products.form.errorCodeTaken");
    if (!name.trim()) e.name = t("products.form.errorName");
    if (!categoryId) e.categoryId = t("products.form.errorCategory");
    if (!unit.trim()) e.unit = t("products.form.errorUnit");
    if (defaultPrice < 0) e.defaultPrice = t("products.form.errorPrice");
    if (kitRows.some((r) => !r.productId)) e.kit = t("products.kit.errorPick");
    else if (kitRows.some((r) => !(Number(r.qty) > 0))) e.kit = t("products.kit.errorQty");
    else if (new Set(kitRows.map((r) => r.productId)).size !== kitRows.length) e.kit = t("products.kit.errorDuplicate");
    else if (isKit && isTool) e.kit = t("products.kit.errorTool");
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // ตรวจสอบฟอร์มแล้วเรียก onSave พร้อมป้องกันการกดซ้ำระหว่างบันทึก
  // Validates the form then calls onSave, guarding against double-submit while saving.
  const handleSave = async () => {
    if (saving || !validate()) return;
    setSaving(true);
    try {
      const error = await onSave({
        code: code.trim().toUpperCase(),
        name: name.trim(),
        categoryId,
        unit: unit.trim(),
        defaultPrice,
        description: description.trim(),
        specifications: specifications.trim(),
        isTool,
        kitComponents: kitRows.map((r) => ({ productId: r.productId, qty: Number(r.qty) })),
      });
      if (error) setErrors({ [/ชุด|ชิ้นส่วน|สูตร/.test(error) ? "kit" : "code"]: error });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="sticky top-0 z-10 bg-card border-b border-border px-6 py-3 flex items-center gap-3">
        <button onClick={onCancel} className="flex items-center gap-1.5 text-sm text-foreground transition-colors">
          <ChevronRight size={14} className="rotate-180" /> {t("products.breadcrumb")}
        </button>
        <ChevronRight size={13} className="text-muted-foreground" />
        <span className="text-sm text-[#c9a84c] font-medium">
          {mode === "create" ? t("products.addNew") : t("products.form.editTitle").replace("{code}", initial?.code ?? "")}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={onCancel} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-foreground hover:border-[#c3ccda] hover:shadow-sm transition-all disabled:opacity-60">
            <X size={13} /> {t("common.cancel")}
          </button>
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-[#0b1d3a] text-white rounded-lg font-semibold hover:bg-[#1a2f55] transition-colors disabled:opacity-60">
            <Save size={13} /> {t("products.form.save")}
          </button>
        </div>
      </div>

      <div className="p-6 max-w-3xl mx-auto">
        <div className="bg-card border border-[#c3ccda] bg-white rounded-xl p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="product-code" className={labelCls}>{t("products.form.codeLabel")} <span className="text-[#e05252]">*</span></label>
              <input id="product-code" className={`${inputCls} font-mono`} value={code} onChange={(e) => setCode(e.target.value)} placeholder={t("products.form.codePlaceholder")} />
              {errors.code && <p className="text-xs text-[#e05252] mt-1">{errors.code}</p>}
            </div>
            <div>
              <label htmlFor="product-categoryId" className={labelCls}>{t("products.col.category")} <span className="text-[#e05252]">*</span></label>
              <select id="product-categoryId" className={`${inputCls} appearance-none`} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                {activeCategories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}{c.archived ? t("products.categoryArchivedSuffix") : ""}</option>
                ))}
              </select>
              {errors.categoryId && <p className="text-xs text-[#e05252] mt-1">{errors.categoryId}</p>}
            </div>
          </div>

          <div>
            <label htmlFor="product-name" className={labelCls}>{t("products.col.name")} <span className="text-[#e05252]">*</span></label>
            <input id="product-name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("products.form.namePlaceholder")} />
            {errors.name && <p className="text-xs text-[#e05252] mt-1">{errors.name}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="product-unit" className={labelCls}>{t("products.col.unit")}</label>
              <input id="product-unit" className={inputCls} value={unit} onChange={(e) => setUnit(e.target.value)} placeholder={t("products.form.unitPlaceholder")} />
              {errors.unit && <p className="text-xs text-[#e05252] mt-1">{errors.unit}</p>}
            </div>
            <div>
              <label htmlFor="product-defaultPrice" className={labelCls}>{t("products.form.priceLabel")}</label>
              <input id="product-defaultPrice" type="number" min={0} className={`${inputCls} font-mono`} value={defaultPrice} onChange={(e) => setDefaultPrice(parseFloat(e.target.value) || 0)} />
              {errors.defaultPrice && <p className="text-xs text-[#e05252] mt-1">{errors.defaultPrice}</p>}
            </div>
          </div>

          <div>
            <label htmlFor="product-description" className={labelCls}>{t("products.form.descriptionLabel")}</label>
            <textarea id="product-description" rows={3} className={`${inputCls} resize-none leading-relaxed`} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("products.form.descriptionPlaceholder")} />
          </div>

          <div>
            <label htmlFor="product-specifications" className={labelCls}>{t("products.form.specLabel")}</label>
            <textarea id="product-specifications" rows={3} className={`${inputCls} resize-none leading-relaxed`} value={specifications} onChange={(e) => setSpecifications(e.target.value)} placeholder={t("products.form.specPlaceholder")} />
 </div>

 {/* เครื่องมือ (2026-09-03) — สินค้าที่ทีมเบิกไปแล้ว "ถือ" อยู่จนกว่าจะคืน ต่างจากวัสดุสิ้นเปลืองที่ใช้หมด
 ติ๊กแล้วจะถูกนับในหน้า "เครื่องมือประจำทีม" */}
 <label className="flex items-start gap-3 rounded-lg border border-[#c3ccda] bg-white px-3 py-2.5 cursor-pointer">
 <input type="checkbox" className="mt-0.5 accent-[#c9a84c]" checked={isTool} onChange={(e) => setIsTool(e.target.checked)} />
 <span className="text-sm text-foreground">
 {t("products.form.isToolLabel")}
 <span className="block text-xs text-muted-foreground mt-0.5">{t("products.form.isToolHint")}</span>
 </span>
 </label>

 {/* สูตรชุด (2026-09-29) — เบิกชุดแล้วตัดชิ้นส่วนตามสูตร ชุดไม่มีสต๊อกของตัวเอง */}
 <div className="rounded-lg border border-[#c3ccda] bg-white px-3 py-3 space-y-3">
 <div className="flex items-start justify-between gap-3">
 <div className="flex items-start gap-2">
 <Layers size={15} className="mt-0.5 text-[#866d28] shrink-0" />
 <div>
 <p className="text-sm text-foreground">{t("products.kit.title")}</p>
 <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{t("products.kit.hint")}</p>
 </div>
 </div>
 {!isKit && (
 <button type="button" onClick={() => setKitRows([{ key: kitRowKey(), productId: "", text: "", qty: "1" }])}
 className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs border border-[#c3ccda] bg-white rounded-lg text-foreground hover:bg-[#f4f6fa] transition-all">
 <Layers size={13} /> {t("products.kit.makeKit")}
 </button>
 )}
 </div>
 {isKit && (
 <>
 <div className="space-y-2">
 {kitRows.map((r) => (
 <div key={r.key} className="flex items-center gap-2">
 <div className="flex-1 min-w-0">
 <Combobox
 value={r.text}
 onChange={(next) => setKitRow(r.key, { text: next, productId: idByOptionValue.get(next) ?? "" })}
 onPick={(opt) => setKitRow(r.key, { text: opt.value, productId: idByOptionValue.get(opt.value) ?? "" })}
 options={componentOptions.map((o) => o.option)}
 placeholder={t("products.kit.pickPlaceholder")}
 ariaLabel={t("products.kit.component")}
 className={inputCls}
 />
 </div>
 <div className="w-24 shrink-0">
 <input type="number" min={0} step="any" className={`${inputCls} text-right font-mono`} value={r.qty}
                          aria-label={t("products.kit.qtyPerKit")} title={t("products.kit.qtyPerKit")}
                          onChange={(e) => setKitRow(r.key, { qty: e.target.value })} />
                      </div>
                      <button type="button" onClick={() => setKitRows((rows) => rows.filter((x) => x.key !== r.key))}
                        aria-label={t("products.kit.removeComponent")} title={t("products.kit.removeComponent")}
                        className="shrink-0 text-muted-foreground opacity-60 hover:opacity-100 hover:text-[#e05252] transition-opacity">
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={() => setKitRows((rows) => [...rows, { key: kitRowKey(), productId: "", text: "", qty: "1" }])}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-dashed border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
                  <Plus size={13} /> {t("products.kit.addComponent")}
                </button>
                <p className="text-xs text-muted-foreground leading-relaxed">{t("products.kit.rules")}</p>
              </>
            )}
            {errors.kit && <p className="text-xs text-[#e05252]" role="alert">{errors.kit}</p>}
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed pt-1 border-t border-border">
            {t("products.form.editHint")}
          </p>
        </div>
      </div>
    </div>
  );
}
