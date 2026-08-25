import { Fragment, useRef, useState } from "react";
import {
  Plus, Trash2, Percent, PackageSearch, Layers,
  GripVertical, StickyNote, Pin, X, ChevronUp, ChevronDown,
} from "lucide-react";
import type { Product, ProductCategory } from "../../lib/products";
import { type QuoteLine, type SubDetail, type DiscountMode, blankLine, newSubDetailId, lineSubtotal, computeTotals, fmt, VAT_RATE } from "../../lib/quotes";
import { MATERIAL_CATEGORY_NAMES } from "../../lib/materialRequisition";
import { ProductPickerModal } from "../products/ProductPickerModal";
import { useI18n } from "../../lib/i18n";

// ปุ่มสลับหน่วยของส่วนลดระหว่างเปอร์เซ็นต์ (%) กับจำนวนเงิน (฿) — เพิ่ม 2026-08-25
// Compact segmented control switching a discount between percent (%) and a straight baht amount (฿).
// The number the user typed is kept as-is; only how it is interpreted changes, and the totals right
// underneath recompute immediately, so the effect of flipping the unit is never hidden.
/**
 * ตัวเลขส่วนลดที่ใช้ได้จริงในหน่วยที่เลือก — สลับกลับมาเป็น % ต้องไม่เกิน 100
 *
 * A discount figure valid in the unit being switched to. Switching ฿500 back to "%" would otherwise
 * leave 500% sitting in the field: the totals clamp it harmlessly, but the server rejects any
 * percentage over 100, so the whole document would silently stop auto-saving until someone noticed.
 * Capping at the switch keeps every document saveable, and the totals right below update visibly,
 * so the adjustment is never hidden from the person who made it.
 */
function clampForMode(discount: number, mode: DiscountMode): number {
  return mode === "percent" ? Math.min(discount, 100) : discount;
}

function DiscountModeToggle({
  value,
  onChange,
  label,
}: {
  value: DiscountMode;
  onChange: (mode: DiscountMode) => void;
  label: string;
}) {
  const options: { mode: DiscountMode; text: string }[] = [
    { mode: "percent", text: "%" },
    { mode: "amount", text: "฿" },
  ];
  return (
    <span role="group" aria-label={label} className="inline-flex items-center rounded border border-border overflow-hidden bg-card align-middle">
      {options.map((o) => (
        <button
          key={o.mode}
          type="button"
          onClick={() => onChange(o.mode)}
          aria-pressed={value === o.mode}
          title={label}
          className={`px-1.5 py-0.5 text-[11px] font-mono leading-none transition-colors ${
            value === o.mode ? "bg-[#c9a84c]/15 text-[#c9a84c] font-semibold" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.text}
        </button>
      ))}
    </span>
  );
}

// แสดงรายการรายละเอียดย่อยแบบ "ปักหมุด" ใต้แถวรายการหลักในตาราง พร้อมลากสลับลำดับได้
// Renders each sub-detail as a "pinned" row under its parent line item, with drag-to-reorder support
function PinnedSubDetailRows({
  lineId,
  subDetails,
  focusId,
  onUpdate,
  onRemove,
  onReorder,
}: {
  lineId: number;
  subDetails: SubDetail[];
  focusId: string | null;
  onUpdate: (id: string, text: string) => void;
  onRemove: (id: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}) {
  const { t } = useI18n();
  const dragIndex = useRef<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  return (
    <>
      {subDetails.map((sd, idx) => (
        <tr
          key={sd.id}
          draggable
          onDragStart={() => { dragIndex.current = idx; }}
          onDragOver={(e) => { e.preventDefault(); setOverIndex(idx); }}
          onDragEnd={() => { setOverIndex(null); dragIndex.current = null; }}
          onDrop={(e) => {
            e.preventDefault();
            if (dragIndex.current !== null && dragIndex.current !== idx) onReorder(dragIndex.current, idx);
            setOverIndex(null);
            dragIndex.current = null;
          }}
          className={`border-b border-border/50 bg-[#c9a84c]/10 group/pin transition-colors ${overIndex === idx ? "bg-[#c9a84c]/20" : ""}`}
        >
          <td className="px-4 py-1.5 align-top">
            <span className="text-muted-foreground/50 cursor-grab active:cursor-grabbing" title={t("quotation.lineItems.subDetailsDragTitle")}>
              <GripVertical size={12} />
            </span>
          </td>
          <td colSpan={7} className="px-4 py-1.5">
            <div className="flex items-center gap-2">
              <Pin size={12} className="text-[#c9a84c]/70 flex-shrink-0" />
              <input
                key={`${lineId}-${sd.id}`}
                autoFocus={sd.id === focusId}
                value={sd.text}
                onChange={(e) => onUpdate(sd.id, e.target.value)}
                placeholder={t("quotation.lineItems.subDetailsPlaceholder")}
                className="flex-1 text-sm text-foreground bg-transparent border-0 outline-none placeholder:text-muted-foreground/50"
              />
              <button
                type="button"
                onClick={() => onReorder(idx, idx - 1)}
                disabled={idx === 0}
                title={t("quotation.lineItems.moveUp")}
                aria-label={t("quotation.lineItems.moveUp")}
                className="text-muted-foreground hover:text-[#c9a84c] transition-colors opacity-50 group-hover/pin:opacity-100 focus-visible:opacity-100 disabled:opacity-20 disabled:pointer-events-none flex-shrink-0"
              >
                <ChevronUp size={12} />
              </button>
              <button
                type="button"
                onClick={() => onReorder(idx, idx + 1)}
                disabled={idx === subDetails.length - 1}
                title={t("quotation.lineItems.moveDown")}
                aria-label={t("quotation.lineItems.moveDown")}
                className="text-muted-foreground hover:text-[#c9a84c] transition-colors opacity-50 group-hover/pin:opacity-100 focus-visible:opacity-100 disabled:opacity-20 disabled:pointer-events-none flex-shrink-0"
              >
                <ChevronDown size={12} />
              </button>
              <button
                onClick={() => onRemove(sd.id)}
                title={t("common.delete")}
                aria-label={t("common.delete")}
                className="text-muted-foreground hover:text-[#e05252] transition-colors opacity-50 group-hover/pin:opacity-100 focus-visible:opacity-100 flex-shrink-0"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </td>
        </tr>
      ))}
    </>
  );
}

// แก้ไขรายการแท็กของรายการหนึ่ง เพิ่มด้วยการพิมพ์แล้วกด Enter หรือคลิกออกจากช่อง
// Edits a line item's tags, adding one on Enter or blur
function TagsEditor({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState("");

  // เพิ่มแท็กใหม่จากข้อความที่พิมพ์ไว้ ถ้ายังไม่มีแท็กนี้อยู่แล้ว
  // Adds a new tag from the typed draft text, if not already present
  const addTag = () => {
    const tag = draft.trim();
    if (tag && !tags.includes(tag)) onChange([...tags, tag]);
    setDraft("");
  };

  return (
    <div>
      <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1.5">{t("quotation.lineItems.tagsTitle")}</p>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {tags.map((tag) => (
          <span key={tag} className="flex items-center gap-1 px-2 py-1 text-xs bg-[#c9a84c]/10 text-[#c9a84c] border border-[#c9a84c]/25 rounded-full">
            {tag}
            <button onClick={() => onChange(tags.filter((x) => x !== tag))} className="hover:text-[#e05252] transition-colors">
              <X size={10} />
            </button>
          </span>
        ))}
      </div>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
        onBlur={addTag}
        placeholder={t("quotation.lineItems.tagsPlaceholder")}
        className="w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-2.5 py-1.5 outline-none focus:border-[#c9a84c]/50 transition-colors"
      />
    </div>
  );
}

// ตารางแก้ไขรายการสินค้า/บริการในใบเสนอราคา รวมส่วนลด ยอดรวม และตัวเลือกจากแคตตาล็อก
// Editable table of quote line items, with discount, totals, and catalog picker
export function LineItemsEditor({
  lines,
  onChange,
  discount,
  onDiscountChange,
  discountMode,
  onDiscountModeChange,
  defaultLineDiscountMode,
  products,
  categories,
}: {
  lines: QuoteLine[];
  onChange: (lines: QuoteLine[]) => void;
  discount: number;
  onDiscountChange: (n: number) => void;
  discountMode: DiscountMode;
  onDiscountModeChange: (mode: DiscountMode) => void;
  /** หน่วยส่วนลดของรายการ ใช้เมื่อยังไม่มีรายการใดระบุไว้ (เอกสารใหม่ = บาท) */
  defaultLineDiscountMode: DiscountMode;
  products: Product[];
  categories: ProductCategory[];
}) {
  const { t } = useI18n();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);

  // เปิด/ปิดการแสดงการ์ดรายละเอียดเพิ่มเติม (แท็ก) ของรายการนั้น
  // Toggles the expanded tags-detail card for a given line
  const toggleExpand = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const updateLine = <K extends keyof QuoteLine>(id: number, field: K, value: QuoteLine[K]) =>
    onChange(lines.map((l) => (l.id === id ? { ...l, [field]: value } : l)));

  // หน่วยส่วนลดระดับรายการ — อ่านจากรายการที่มีอยู่ก่อน ถ้ายังไม่มีเลยจึงใช้ค่าเริ่มต้นของเอกสาร
  // The line-level discount unit. Read off the existing lines first — each line stores its own
  // `discountMode`, so a historical quotation always renders in the unit it was written in.
  // `lineModeOverride` only carries a switch the user made while the table is still empty, so the
  // choice survives until there is a line to record it on.
  const [lineModeOverride, setLineModeOverride] = useState<DiscountMode | null>(null);
  const lineDiscountMode: DiscountMode =
    lines.find((l) => l.discountMode)?.discountMode ?? lineModeOverride ?? defaultLineDiscountMode;
  const setLineDiscountMode = (mode: DiscountMode) => {
    setLineModeOverride(mode);
    onChange(lines.map((l) => ({ ...l, discountMode: mode, discount: clampForMode(l.discount, mode) })));
  };
  const newLine = () => ({ ...blankLine(), discountMode: lineDiscountMode });

  const addLine = () => onChange([...lines, newLine()]);
  const addSectionHeader = () => onChange([...lines, { ...newLine(), isSectionHeader: true }]);
  // เพิ่มรายการใหม่โดยดึงชื่อ หน่วย ราคา และสเปกจากสินค้าที่เลือกในแคตตาล็อก
  // Adds a new line pre-filled from a picked catalog product (name, unit, price, spec)
  const addLineFromProduct = (product: Product) => {
    const spec = product.specifications.trim();
    onChange([...lines, {
      ...newLine(),
      description: product.name,
      unit: product.unit,
      unitPrice: product.defaultPrice,
      subDetails: spec ? [{ id: newSubDetailId(), text: spec }] : [],
    }]);
  };
  const removeLine = (id: number) => onChange(lines.filter((l) => l.id !== id));

  // เพิ่มรายละเอียดย่อยใหม่ให้กับรายการ แล้วตั้งโฟกัสไปที่ช่องที่เพิ่ง
  // Adds a new sub-detail to a line and focuses the newly created input
  const addSubDetail = (lineId: number) => {
    const newId = newSubDetailId();
    updateLine(lineId, "subDetails", [...(lines.find((l) => l.id === lineId)?.subDetails ?? []), { id: newId, text: "" }]);
    setPendingFocusId(newId);
  };
  const updateSubDetail = (lineId: number, subId: string, text: string) =>
    updateLine(lineId, "subDetails", (lines.find((l) => l.id === lineId)?.subDetails ?? []).map((sd) => (sd.id === subId ? { ...sd, text } : sd)));
  const removeSubDetail = (lineId: number, subId: string) =>
    updateLine(lineId, "subDetails", (lines.find((l) => l.id === lineId)?.subDetails ?? []).filter((sd) => sd.id !== subId));
  // ย้ายตำแหน่งรายละเอียดย่อยในรายการเดียวกันจากตำแหน่งหนึ่งไปอีกตำแหน่ง
  // Moves a sub-detail within a line from one index to another
  const reorderSubDetails = (lineId: number, from: number, to: number) => {
    const current = [...(lines.find((l) => l.id === lineId)?.subDetails ?? [])];
    const [moved] = current.splice(from, 1);
    current.splice(to, 0, moved);
    updateLine(lineId, "subDetails", current);
  };

  const { subtotal, discountAmt, afterDiscount, vatAmt, total } = computeTotals(lines, discount, discountMode);

  // Excludes the 4 categories seeded for Material Requisition/Purchase Request's internal-only
  // store catalog (เคมี/เรซิ่น, วัสดุสิ้นเปลือง, น็อตและสกรู, อื่นๆ (คลัง)) from the sales-facing quote
  // picker — those items were never meant to be quoted to a customer. This is a category-level
  // assumption, not a per-product flag: a future customer-facing product added to one of these
  // categories, or an internal-only product added to an existing customer-facing category, won't be
  // caught by this filter and would need revisiting then.
  const quotationProducts = products.filter((p) => {
    const categoryName = categories.find((c) => c.id === p.categoryId)?.name ?? "";
    return !MATERIAL_CATEGORY_NAMES.includes(categoryName);
  });

  let itemNumber = 0;
  const itemNumbers = lines.map((l) => (l.isSectionHeader ? null : ++itemNumber));

  const columns: React.ReactNode[] = [
    t("quotation.lineItems.col.no"), t("quotation.lineItems.col.description"), t("quotation.lineItems.col.unit"),
    t("quotation.lineItems.col.qty"), t("quotation.lineItems.col.unitPrice"),
    (
      <span className="inline-flex items-center gap-1.5 justify-end normal-case">
        {t("quotation.lineItems.col.discount")}
        <DiscountModeToggle value={lineDiscountMode} onChange={setLineDiscountMode} label={t("quotation.discountMode.lineLabel")} />
      </span>
    ),
    t("quotation.lineItems.col.amount"), "",
  ];

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden print:hidden">
      <div className="px-5 py-3.5 border-b border-border flex items-center justify-between bg-muted/30">
        <h2 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("quotation.lineItems.title")}</h2>
        <div className="flex items-center gap-2">
          <button onClick={() => setPickerOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all font-medium">
            <PackageSearch size={12} /> {t("quotation.lineItems.pickFromCatalog")}
          </button>
          <button onClick={addSectionHeader} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all font-medium">
            <Layers size={12} /> {t("quotation.lineItems.addSection")}
          </button>
          <button onClick={addLine} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#c9a84c]/10 text-[#c9a84c] border border-[#c9a84c]/25 rounded-lg hover:bg-[#c9a84c]/20 transition-colors font-medium">
            <Plus size={12} /> {t("quotation.lineItems.addManual")}
          </button>
        </div>
      </div>
      <ProductPickerModal open={pickerOpen} products={quotationProducts} categories={categories} onSelect={addLineFromProduct} onClose={() => setPickerOpen(false)} />

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/20">
              {columns.map((h, i) => (
                <th key={i} className={`px-4 py-2.5 text-xs font-mono font-semibold text-muted-foreground uppercase tracking-wider ${i === 0 || i === 2 ? "text-center" : i === 1 ? "text-left" : "text-right"} ${i === 0 ? "w-10" : ""} ${i === 7 ? "w-10" : ""}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((line, idx) => {
              if (line.isSectionHeader) {
                return (
                  <tr key={line.id} className="border-b border-border/50 bg-muted/20 group">
                    <td className="px-4 py-2.5 text-center text-sm font-mono text-muted-foreground align-top">§</td>
                    <td colSpan={6} className="px-4 py-2.5 align-top">
                      <input
                        className="w-full text-sm font-semibold text-foreground bg-transparent border-0 outline-none focus:bg-secondary rounded px-1 py-0.5 transition-colors"
                        value={line.description}
                        onChange={(e) => updateLine(line.id, "description", e.target.value)}
                        placeholder={t("quotation.lineItems.sectionHeaderPlaceholder")}
                      />
                    </td>
                    <td className="px-4 py-2.5 align-top">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => removeLine(line.id)} title={t("common.delete")} aria-label={t("common.delete")} className="text-muted-foreground hover:text-[#e05252] transition-colors opacity-50 group-hover:opacity-100 focus-visible:opacity-100"><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                );
              }

              const isExpanded = expanded.has(line.id);
              const hasSubDetails = line.subDetails.some((sd) => sd.text.trim() !== "");
              const hasCardDetails = line.tags.length > 0;
              return (
                <Fragment key={line.id}>
                  <tr className="border-b border-border/50 hover:bg-secondary/30 transition-colors group">
                    <td className="px-4 py-3 text-center text-sm font-mono text-muted-foreground align-top">{itemNumbers[idx]}</td>
                    <td className="px-4 py-3 align-top">
                      <input className="w-full text-sm text-foreground bg-transparent border-0 outline-none focus:bg-secondary rounded px-1 py-0.5 transition-colors" value={line.description} onChange={(e) => updateLine(line.id, "description", e.target.value)} placeholder={t("quotation.lineItems.descriptionPlaceholder")} />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex items-center justify-center">
                        <input className="w-20 text-sm text-center text-foreground bg-transparent border-0 outline-none focus:bg-secondary rounded px-1 py-0.5 transition-colors" value={line.unit} onChange={(e) => updateLine(line.id, "unit", e.target.value)} />
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex items-center justify-end">
                        <input type="number" className="w-20 text-sm text-right text-foreground bg-transparent border-0 outline-none focus:bg-secondary rounded px-1 py-0.5 transition-colors" value={line.qty} onChange={(e) => updateLine(line.id, "qty", parseFloat(e.target.value) || 0)} min={0} />
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex items-center justify-end">
                        <input type="number" className="w-32 text-sm text-right font-mono text-foreground bg-transparent border-0 outline-none focus:bg-secondary rounded px-1 py-0.5 transition-colors" value={line.unitPrice} onChange={(e) => updateLine(line.id, "unitPrice", parseFloat(e.target.value) || 0)} min={0} />
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex items-center justify-end gap-0.5">
                        <input
                          type="number"
                          className="w-16 text-sm text-right font-mono text-foreground bg-transparent border-0 outline-none focus:bg-secondary rounded px-1 py-0.5 transition-colors"
                          value={line.discount}
                          // ประทับ discountMode ลงบรรทัดที่แก้ด้วยเสมอ ไม่งั้นบรรทัดจากเทมเพลต (ที่ยังไม่มีหน่วย)
                          // จะแสดงเป็น ฿ แต่คำนวณเป็น % — ตัวเลขที่พิมพ์ต้องหมายถึงหน่วยที่เห็นบนหัวคอลัมน์เสมอ
                          // Stamps the unit onto the line being edited. Without it, a line that
                          // carries no `discountMode` yet (a fresh template line, or any pre-
                          // 2026-08-25 line) would render under a "฿" header while still computing
                          // as a percentage. The number typed must always mean the unit shown.
                          onChange={(e) => onChange(lines.map((l) => (
                            l.id === line.id
                              ? { ...l, discount: parseFloat(e.target.value) || 0, discountMode: lineDiscountMode }
                              : l
                          )))}
                          min={0}
                          max={lineDiscountMode === "percent" ? 100 : undefined}
                          aria-label={lineDiscountMode === "percent" ? t("quotation.discountMode.percentLabel") : t("quotation.discountMode.amountLabel")}
                        />
                        {lineDiscountMode === "percent"
                          ? <Percent size={10} className="text-muted-foreground flex-shrink-0" />
                          : <span className="text-[11px] font-mono text-muted-foreground flex-shrink-0">฿</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-right font-semibold text-foreground align-top">{fmt(lineSubtotal(line))}</td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => addSubDetail(line.id)}
                          title={t("quotation.lineItems.addSubDetail")}
                          aria-label={t("quotation.lineItems.addSubDetail")}
                          className={`transition-colors relative ${hasSubDetails ? "text-[#c9a84c]" : "text-muted-foreground opacity-50 group-hover:opacity-100 focus-visible:opacity-100"} hover:text-[#c9a84c]`}
                        >
                          <Pin size={13} />
                        </button>
                        <button
                          onClick={() => toggleExpand(line.id)}
                          title={t("quotation.lineItems.tagsTitle")}
                          aria-label={t("quotation.lineItems.tagsTitle")}
                          className={`transition-colors relative ${hasCardDetails ? "text-[#c9a84c]" : "text-muted-foreground opacity-50 group-hover:opacity-100 focus-visible:opacity-100"} hover:text-[#c9a84c]`}
                        >
                          <StickyNote size={13} />
                          {hasCardDetails && !isExpanded && <span className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-[#c9a84c]" />}
                        </button>
                        <button onClick={() => removeLine(line.id)} title={t("common.delete")} aria-label={t("common.delete")} className="text-muted-foreground hover:text-[#e05252] transition-colors opacity-50 group-hover:opacity-100 focus-visible:opacity-100"><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>

                  <PinnedSubDetailRows
                    lineId={line.id}
                    subDetails={line.subDetails}
                    focusId={pendingFocusId}
                    onUpdate={(subId, text) => updateSubDetail(line.id, subId, text)}
                    onRemove={(subId) => removeSubDetail(line.id, subId)}
                    onReorder={(from, to) => reorderSubDetails(line.id, from, to)}
                  />

                  {isExpanded && (
                    <tr className="border-b border-border/50 bg-muted/10">
                      <td />
                      <td colSpan={7} className="px-4 pb-4 pt-1">
                        <div className="bg-card border border-border rounded-lg p-4">
                          <TagsEditor tags={line.tags} onChange={(tags) => updateLine(line.id, "tags", tags)} />
                        </div>
                      </td>
                    </tr>
                  )}

                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end p-5 border-t border-border">
        {/* กว้างขึ้นจาก w-72 เป็น w-80 เพราะแถวส่วนลดพิเศษมีปุ่มสลับหน่วย % / ฿ เพิ่มเข้ามา (2026-08-25)
            Widened from w-72 to fit the % / ฿ unit toggle the special-discount row gained on
            2026-08-25 — at the old width the label and the amount both wrapped. */}
        <div className="w-80 space-y-2">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>{t("quotation.totals.subtotal")}</span>
            <span className="font-mono">฿{fmt(subtotal)}</span>
          </div>
          <div className="flex justify-between gap-2 text-sm text-muted-foreground items-center">
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              {t("quotation.totals.discount")}
              <span className="flex items-center gap-1 bg-secondary border border-border rounded px-2 py-0.5">
                <input
                  type="number"
                  className={`${discountMode === "percent" ? "w-10" : "w-16"} text-sm font-mono text-foreground bg-transparent outline-none text-right`}
                  value={discount}
                  onChange={(e) => onDiscountChange(parseFloat(e.target.value) || 0)}
                  min={0}
                  max={discountMode === "percent" ? 100 : undefined}
                  aria-label={discountMode === "percent" ? t("quotation.discountMode.percentLabel") : t("quotation.discountMode.amountLabel")}
                />
                {discountMode === "percent"
                  ? <Percent size={10} className="text-muted-foreground" />
                  : <span className="text-[11px] font-mono text-muted-foreground">฿</span>}
              </span>
              <DiscountModeToggle
                value={discountMode}
                onChange={(mode) => { onDiscountModeChange(mode); onDiscountChange(clampForMode(discount, mode)); }}
                label={t("quotation.discountMode.totalLabel")}
              />
            </span>
            <span className="font-mono text-[#e05252] whitespace-nowrap">-฿{fmt(discountAmt)}</span>
          </div>
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>{t("quotation.totals.afterDiscount")}</span>
            <span className="font-mono">฿{fmt(afterDiscount)}</span>
          </div>
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>{t("quotation.totals.vat").replace("{rate}", String(VAT_RATE))}</span>
            <span className="font-mono">฿{fmt(vatAmt)}</span>
          </div>
          <div className="flex justify-between text-base font-bold text-foreground pt-2 border-t border-border">
            <span style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("quotation.totals.grandTotal")}</span>
            <span className="font-mono text-[#c9a84c] text-lg">฿{fmt(total)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
