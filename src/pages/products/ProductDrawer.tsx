import { useId, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Archive, ArchiveRestore, Copy, Info, Layers, Loader2, Plus, Trash2, X } from "lucide-react";
import { type Product, type ProductCategory, isKitProduct } from "../../lib/products";
import { useI18n } from "../../lib/i18n";
import { Combobox } from "../../components/Combobox";
import { Drawer } from "../../components/ui/Overlays";
import { Field, SelectBox } from "../../components/ui/Field";
import { MoreMenu } from "../../components/ui/MoreMenu";
import { btn, field } from "../../components/ui/styles";
import { StatusBadge } from "../../components/StatusBadge";
import { Tag, UnitInput } from "../stock/inventoryUi";
import { fmtProductDate } from "../stock/inventoryFormat";

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

function Group({ title, hint, icon, children }: { title: ReactNode; hint?: ReactNode; icon?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-[15px] font-semibold text-foreground flex items-center gap-2">{icon}{title}</h3>
        {hint && <p className={field.help}>{hint}</p>}
      </div>
      {children}
    </section>
  );
}

const Divider = () => <div className="h-px bg-[#eef1f6] flex-shrink-0" />;

/**
 * แผงข้อมูลสินค้า (ดีไซน์ใหม่ 2026-09-30) แทนหน้าฟอร์มเต็มจอเดิม — สร้าง/แก้ไขในแผงเดียว รวมสูตรชุด (สินค้าชุด)
 * ทำสำเนา / เก็บถาวร / ลบถาวร ย้ายจากไอคอนท้ายแถวมาอยู่ในเมนู "เพิ่มเติม" ท้ายแผง
 */
export function ProductDrawer({
  product, categories, existingCodes, allProducts, locked, onSave, onClose, onDuplicate, onArchiveToggle, onDelete,
  canCreate, canEdit, canDelete,
}: {
  /** null = สินค้าใหม่ */
  product: Product | null;
  categories: ProductCategory[];
  existingCodes: string[];
  /** ตัวเลือกชิ้นส่วนของสูตรชุด (2026-09-29) */
  allProducts: Product[];
  /** มีกล่องยืนยันซ้อนอยู่ด้านบน — กัน Escape/คลิกพื้นหลังปิดแผงไปพร้อมกัน */
  locked: boolean;
  onSave: (draft: ProductDraft) => Promise<string | null>;
  onClose: () => void;
  onDuplicate: (p: Product) => void;
  onArchiveToggle: (p: Product) => void;
  onDelete: (p: Product) => void;
  /** สิทธิ์ (2026-10-06) — ไม่มีสิทธิ์แก้ = แผงอ่านอย่างเดียว · เมนูเหลือเฉพาะคำสั่งที่มีสิทธิ์ */
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const { t } = useI18n();
  const formId = useId();
  const initial = product ?? undefined;
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
  const productById = useMemo(() => new Map(allProducts.map((p) => [p.id, p])), [allProducts]);
  const setKitRow = (key: string, patch: Partial<KitRow>) => setKitRows((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addKitRow = () => setKitRows((rows) => [...rows, { key: kitRowKey(), productId: "", text: "", qty: "1" }]);
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
  const handleSubmit = async (ev?: FormEvent) => {
    ev?.preventDefault();
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

  const subtitle = product ? (
    <span className="inline-flex items-center gap-2.5 flex-wrap">
      <span className="font-mono text-[13px] font-medium text-[#3d5173]">{product.code}</span>
      {isKitProduct(product) && <Tag tone="blue" icon={Layers}>{t("products.tag.kit")}</Tag>}
      {product.isTool && <Tag tone="grey">{t("stock.toolBadge")}</Tag>}
      {product.archived && <StatusBadge status="archived" label={t("common.status.archived")} />}
      {t("products.drawer.updated").replace("{date}", fmtProductDate(product.updatedAt))}
    </span>
  ) : undefined;

  // อ่านอย่างเดียวเมื่อไม่มีสิทธิ์บันทึกสิ่งที่เปิดอยู่ — เซิร์ฟเวอร์กันอยู่แล้ว ที่นี่แค่ไม่ให้กดแล้วเจอ 403
  const readOnly = product ? !canEdit : !canCreate;
  const menuItems = product ? [
    ...(canCreate ? [{ key: "duplicate", label: t("products.action.duplicate"), icon: Copy, onSelect: () => onDuplicate(product) }] : []),
    ...(canEdit ? [{
      key: "archive",
      label: product.archived ? t("common.unarchive") : t("common.archive"),
      hint: product.archived ? undefined : t("products.menu.archiveHint"),
      icon: product.archived ? ArchiveRestore : Archive,
      onSelect: () => onArchiveToggle(product),
    }] : []),
    ...(canDelete ? [{ key: "delete", label: t("products.deletePermanently"), icon: Trash2, danger: true, onSelect: () => onDelete(product) }] : []),
  ] : [];
  const footerLeft = menuItems.length > 0 ? <MoreMenu align="left" items={menuItems} /> : undefined;

  const footerRight = readOnly ? (
    <button type="button" onClick={onClose} className={btn.secondary}>{t("common.close")}</button>
  ) : (
    <>
      <button type="button" onClick={onClose} disabled={saving} className={btn.secondary}>{t("common.cancel")}</button>
      <button type="submit" form={formId} disabled={saving} className={`${btn.primary} min-w-[88px]`}>
        {saving ? <Loader2 size={16} className="animate-spin" /> : t("products.form.save")}
      </button>
    </>
  );

  /** กล่องช่องกรอก — มีข้อผิดพลาดแล้วกรอบแดงแทนกรอบเทา */
  const inputCls = (key: string) => (errors[key] ? field.input.replace("border-[#c3ccda]", "border-[#b93636]") : field.input);

  return (
    <Drawer
      open
      title={product ? product.name : t("products.addNew")}
      subtitle={subtitle}
      onClose={onClose}
      busy={saving || locked}
      footerLeft={footerLeft}
      footerRight={footerRight}
    >
      <form id={formId} onSubmit={(e) => { if (readOnly) e.preventDefault(); else void handleSubmit(e); }} noValidate>
       {/* fieldset disabled ปิดทุกช่อง/ปุ่มในฟอร์มทีเดียวเมื่ออ่านอย่างเดียว */}
       <fieldset disabled={readOnly} className="flex flex-col gap-6 min-w-0">
        <Group title={t("products.drawer.eyebrow")} hint={readOnly ? t("products.form.readOnlyHint") : t("products.form.editHint")}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={t("products.form.codeLabel")} htmlFor="product-code" required error={errors.code}>
              <input id="product-code" autoFocus={!product} value={code} onChange={(e) => setCode(e.target.value)} placeholder={t("products.form.codePlaceholder")}
                aria-invalid={!!errors.code} className={`${inputCls("code")} w-full font-mono`} />
            </Field>
            <Field label={t("products.col.category")} htmlFor="product-categoryId" required error={errors.categoryId}>
              <SelectBox id="product-categoryId" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                {activeCategories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}{c.archived ? t("products.categoryArchivedSuffix") : ""}</option>
                ))}
              </SelectBox>
            </Field>
          </div>
          <Field label={t("products.col.name")} htmlFor="product-name" required error={errors.name}>
            <input id="product-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("products.form.namePlaceholder")}
              aria-invalid={!!errors.name} className={`${inputCls("name")} w-full`} />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-[180px_minmax(0,1fr)] gap-4">
            <Field label={t("products.col.unit")} htmlFor="product-unit" error={errors.unit}>
              <input id="product-unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder={t("products.form.unitPlaceholder")}
                aria-invalid={!!errors.unit} className={`${inputCls("unit")} w-full`} />
            </Field>
            <Field label={t("products.col.price")} htmlFor="product-defaultPrice" error={errors.defaultPrice}>
              <UnitInput id="product-defaultPrice" type="number" min={0} step="any" unit={t("stock.unit.baht")}
                value={defaultPrice} onChange={(e) => setDefaultPrice(parseFloat(e.target.value) || 0)} />
            </Field>
          </div>
          {/* เครื่องมือ (2026-09-03) — สินค้าที่ทีมเบิกไปแล้ว "ถือ" อยู่จนกว่าจะคืน ต่างจากวัสดุสิ้นเปลืองที่ใช้หมด
              ติ๊กแล้วจะถูกนับในหน้า "เครื่องมือประจำทีม" */}
          <label className="flex items-start gap-3 rounded-lg border border-[#c3ccda] bg-white px-3.5 py-3 cursor-pointer">
            <input type="checkbox" className="mt-0.5 w-[18px] h-[18px] rounded accent-[#0b1d3a] flex-shrink-0" checked={isTool} onChange={(e) => setIsTool(e.target.checked)} />
            <span className="flex flex-col gap-0.5 min-w-0">
              <span className="text-sm font-medium text-foreground">{t("products.form.isToolLabel")}</span>
              <span className={field.help}>{t("products.form.isToolHint")}</span>
            </span>
          </label>
        </Group>

        <Divider />

        <Group title={t("products.form.descriptionLabel")}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={t("products.form.descriptionLabel")} htmlFor="product-description">
              <textarea id="product-description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder={t("products.form.descriptionPlaceholder")} className={`${field.textarea} w-full resize-y`} />
            </Field>
            <Field label={t("products.form.specLabel")} htmlFor="product-specifications">
              <textarea id="product-specifications" rows={3} value={specifications} onChange={(e) => setSpecifications(e.target.value)}
                placeholder={t("products.form.specPlaceholder")} className={`${field.textarea} w-full resize-y`} />
            </Field>
          </div>
        </Group>

        <Divider />

        {/* สูตรชุด (2026-09-29) — เบิกชุดแล้วตัดชิ้นส่วนตามสูตร ชุดไม่มีสต๊อกของตัวเอง */}
        <Group title={t("products.kit.title")} hint={t("products.kit.hint")} icon={<Layers size={16} className="text-[#1a5fb4]" />}>
          {isKit ? (
            <div className="border border-border rounded-[10px] overflow-hidden">
              <div className="grid grid-cols-[minmax(0,1fr)_128px_36px] gap-2 items-center px-3 h-9 bg-[#f8f9fc] border-b border-border text-[12.5px] font-semibold text-[#3d5173]">
                <span>{t("products.kit.component")}</span>
                <span className="text-right">{t("products.kit.qtyPerKit")}</span>
                <span />
              </div>
              {kitRows.map((r) => {
                const part = r.productId ? productById.get(r.productId) : undefined;
                return (
                  <div key={r.key} className="grid grid-cols-[minmax(0,1fr)_128px_36px] gap-2 items-center px-3 py-2 border-b border-[#eef1f6]">
                    <span className="h-9 px-2.5 rounded-lg border border-[#c3ccda] bg-white flex items-center gap-2 min-w-0 focus-within:border-[#1a5fb4] focus-within:ring-2 focus-within:ring-[#1a5fb4]/20 transition-colors">
                      <Combobox
                        value={r.text}
                        onChange={(next) => setKitRow(r.key, { text: next, productId: idByOptionValue.get(next) ?? "" })}
                        onPick={(opt) => setKitRow(r.key, { text: opt.value, productId: idByOptionValue.get(opt.value) ?? "" })}
                        options={componentOptions.map((o) => o.option)}
                        placeholder={t("products.kit.pickPlaceholder")}
                        ariaLabel={t("products.kit.component")}
                        className="flex-1 min-w-0 bg-transparent text-sm text-foreground placeholder:text-[#8a97ad] outline-none"
                      />
                      {part && (
                        <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
                          {t("products.kit.stockHint")} {part.stockQty.toLocaleString()}
                        </span>
                      )}
                    </span>
                    <UnitInput type="number" min={0} step="any" small value={r.qty} unit={part?.unit || undefined}
                      aria-label={t("products.kit.qtyPerKit")} title={t("products.kit.qtyPerKit")}
                      onChange={(e) => setKitRow(r.key, { qty: e.target.value })} />
                    <button type="button" onClick={() => setKitRows((rows) => rows.filter((x) => x.key !== r.key))}
                      aria-label={t("products.kit.removeComponent")} title={t("products.kit.removeComponent")}
                      className="w-9 h-9 rounded-lg flex items-center justify-center text-[#8a97ad] hover:bg-[#fcebeb] hover:text-[#b93636] transition-colors">
                      <X size={16} />
                    </button>
                  </div>
                );
              })}
              <div className="px-3 py-1.5">
                <button type="button" onClick={addKitRow} className={btn.text}>
                  <Plus size={16} /> {t("products.kit.addComponent")}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <button type="button" onClick={addKitRow} className={btn.secondarySm}>
                <Layers size={15} /> {t("products.kit.makeKit")}
              </button>
            </div>
          )}
          <p className="flex gap-2 text-xs text-muted-foreground leading-relaxed">
            <Info size={14} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
            {t("products.kit.rules")}
          </p>
          {errors.kit && <p className={field.error} role="alert">{errors.kit}</p>}
        </Group>
       </fieldset>
      </form>
    </Drawer>
  );
}
