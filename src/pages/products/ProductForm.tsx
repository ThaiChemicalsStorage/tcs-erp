import { useState } from "react";
import { ChevronRight, Save, X } from "lucide-react";
import type { Product, ProductCategory } from "../../lib/products";
import { useI18n } from "../../lib/i18n";

export interface ProductDraft {
  code: string;
  name: string;
  categoryId: string;
  unit: string;
  defaultPrice: number;
  description: string;
  specifications: string;
}

const inputCls = "w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors";
const labelCls = "text-xs text-muted-foreground block mb-1.5";

export function ProductForm({
  mode,
  initial,
  categories,
  existingCodes,
  onSave,
  onCancel,
}: {
  mode: "create" | "edit";
  initial?: Product;
  categories: ProductCategory[];
  existingCodes: string[];
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
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!code.trim()) e.code = t("products.form.errorCode");
    else if (existingCodes.includes(code.trim().toUpperCase())) e.code = t("products.form.errorCodeTaken");
    if (!name.trim()) e.name = t("products.form.errorName");
    if (!categoryId) e.categoryId = t("products.form.errorCategory");
    if (!unit.trim()) e.unit = t("products.form.errorUnit");
    if (defaultPrice < 0) e.defaultPrice = t("products.form.errorPrice");
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    const error = await onSave({
      code: code.trim().toUpperCase(),
      name: name.trim(),
      categoryId,
      unit: unit.trim(),
      defaultPrice,
      description: description.trim(),
      specifications: specifications.trim(),
    });
    if (error) setErrors({ code: error });
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="sticky top-0 z-10 bg-card border-b border-border px-6 py-3 flex items-center gap-3">
        <button onClick={onCancel} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ChevronRight size={14} className="rotate-180" /> {t("products.breadcrumb")}
        </button>
        <ChevronRight size={13} className="text-muted-foreground" />
        <span className="text-sm text-[#c9a84c] font-medium" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>
          {mode === "create" ? t("products.addNew") : t("products.form.editTitle").replace("{code}", initial?.code ?? "")}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={onCancel} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
            <X size={13} /> {t("common.cancel")}
          </button>
          <button onClick={handleSave} className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors">
            <Save size={13} /> {t("products.form.save")}
          </button>
        </div>
      </div>

      <div className="p-6 max-w-3xl mx-auto">
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>{t("products.form.codeLabel")} <span className="text-[#e05252]">*</span></label>
              <input className={`${inputCls} font-mono`} value={code} onChange={(e) => setCode(e.target.value)} placeholder={t("products.form.codePlaceholder")} />
              {errors.code && <p className="text-xs text-[#e05252] mt-1">{errors.code}</p>}
            </div>
            <div>
              <label className={labelCls}>{t("products.col.category")} <span className="text-[#e05252]">*</span></label>
              <select className={`${inputCls} appearance-none`} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                {activeCategories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}{c.archived ? t("products.categoryArchivedSuffix") : ""}</option>
                ))}
              </select>
              {errors.categoryId && <p className="text-xs text-[#e05252] mt-1">{errors.categoryId}</p>}
            </div>
          </div>

          <div>
            <label className={labelCls}>{t("products.col.name")} <span className="text-[#e05252]">*</span></label>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("products.form.namePlaceholder")} />
            {errors.name && <p className="text-xs text-[#e05252] mt-1">{errors.name}</p>}
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>{t("products.col.unit")}</label>
              <input className={inputCls} value={unit} onChange={(e) => setUnit(e.target.value)} placeholder={t("products.form.unitPlaceholder")} />
              {errors.unit && <p className="text-xs text-[#e05252] mt-1">{errors.unit}</p>}
            </div>
            <div>
              <label className={labelCls}>{t("products.form.priceLabel")}</label>
              <input type="number" min={0} className={`${inputCls} font-mono`} value={defaultPrice} onChange={(e) => setDefaultPrice(parseFloat(e.target.value) || 0)} />
              {errors.defaultPrice && <p className="text-xs text-[#e05252] mt-1">{errors.defaultPrice}</p>}
            </div>
          </div>

          <div>
            <label className={labelCls}>{t("products.form.descriptionLabel")}</label>
            <textarea rows={3} className={`${inputCls} resize-none leading-relaxed`} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("products.form.descriptionPlaceholder")} />
          </div>

          <div>
            <label className={labelCls}>{t("products.form.specLabel")}</label>
            <textarea rows={3} className={`${inputCls} resize-none leading-relaxed`} value={specifications} onChange={(e) => setSpecifications(e.target.value)} placeholder={t("products.form.specPlaceholder")} />
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed pt-1 border-t border-border">
            {t("products.form.editHint")}
          </p>
        </div>
      </div>
    </div>
  );
}
