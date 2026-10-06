import { useRef, useState, type ReactNode } from "react";
import { Plus, Trash2, PackageSearch, Layers, GripVertical, X, ChevronUp, ChevronDown, Tag } from "lucide-react";
import type { Product, ProductCategory } from "../../lib/products";
import {
  type QuoteLine, type SubDetail, type DiscountMode, blankLine, newSubDetailId, lineSubtotal, lineDiscountAmount, computeTotals, fmt, VAT_RATE,
} from "../../lib/quotes";
import { QuoteProductPicker } from "./QuoteProductPicker";
import { SectionCard } from "../../components/ui/SectionCard";
import { btn, field, table } from "../../components/ui/styles";
import { useI18n } from "../../lib/i18n";
import { UnitCombobox } from "../../components/UnitCombobox";

// ช่องย่อยใต้รายการ (รายละเอียดย่อย แท็ก) — เตี้ยกว่าช่องในตารางหนึ่งขั้น
const compactCell = field.cell.replace("h-9", "h-8").replace("text-sm", "text-[13px]");

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

// ปุ่มสลับหน่วยของส่วนลดระหว่างเปอร์เซ็นต์ (%) กับจำนวนเงิน (฿) — เพิ่ม 2026-08-25
// Segmented control switching a discount between percent (%) and a straight baht amount (฿).
// The number the user typed is kept as-is; only how it is interpreted changes, and the totals right
// underneath recompute immediately, so the effect of flipping the unit is never hidden.
function DiscountModeToggle({ value, onChange, label }: {
  value: DiscountMode;
  onChange: (mode: DiscountMode) => void;
  label: string;
}) {
  const options: { mode: DiscountMode; text: string }[] = [
    { mode: "percent", text: "%" },
    { mode: "amount", text: "฿" },
  ];
  return (
    <span role="group" aria-label={label} className="inline-flex items-center gap-0.5 rounded-md bg-[#eef1f6] p-0.5 flex-shrink-0">
      {options.map((o) => (
        <button
          key={o.mode}
          type="button"
          onClick={() => onChange(o.mode)}
          aria-pressed={value === o.mode}
          title={label}
          className={`h-[26px] min-w-6 px-1 rounded-[5px] text-xs transition-colors ${
            value === o.mode ? "bg-white text-foreground font-semibold shadow-[0_1px_2px_rgba(11,29,58,0.12)]" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.text}
        </button>
      ))}
    </span>
  );
}

// รายละเอียดย่อยใต้รายการหลัก — ลากสลับลำดับได้ และมีปุ่มขึ้น/ลงให้ใช้คีย์บอร์ดได้
// Sub-detail rows under a line item: native drag to reorder, plus up/down buttons for keyboard users
function SubDetailRows({ lineId, subDetails, focusId, onUpdate, onRemove, onReorder }: {
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
  const iconBtn = "w-8 h-8 rounded-md inline-flex items-center justify-center text-[#8a97ad] hover:text-foreground hover:bg-[#f4f6fa] transition-colors disabled:opacity-30 disabled:pointer-events-none flex-shrink-0";

  return (
    <>
      {subDetails.map((sd, idx) => (
        <div
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
          className={`flex items-center gap-1.5 pl-3.5 rounded-md transition-colors ${overIndex === idx ? "bg-[#fbf7ea]" : ""}`}
        >
          <span className="text-[#a3aec2] cursor-grab active:cursor-grabbing flex" title={t("quotation.lineItems.subDetailsDragTitle")} aria-hidden="true">
            <GripVertical size={14} />
          </span>
          <span aria-hidden="true" className="text-[13px] text-[#7d6420]">–</span>
          <input
            key={`${lineId}-${sd.id}`}
            autoFocus={sd.id === focusId}
            value={sd.text}
            onChange={(e) => onUpdate(sd.id, e.target.value)}
            placeholder={t("quotation.lineItems.subDetailsPlaceholder")}
            aria-label={t("quotation.lineItems.subDetailsTitle")}
            className={`${compactCell.replace("text-foreground", "text-[#26395a]")} flex-1 min-w-0`}
          />
          <button type="button" onClick={() => onReorder(idx, idx - 1)} disabled={idx === 0} title={t("quotation.lineItems.moveUp")} aria-label={t("quotation.lineItems.moveUp")} className={iconBtn}>
            <ChevronUp size={14} />
          </button>
          <button type="button" onClick={() => onReorder(idx, idx + 1)} disabled={idx === subDetails.length - 1} title={t("quotation.lineItems.moveDown")} aria-label={t("quotation.lineItems.moveDown")} className={iconBtn}>
            <ChevronDown size={14} />
          </button>
          <button type="button" onClick={() => onRemove(sd.id)} title={t("common.delete")} aria-label={t("common.delete")} className={`${iconBtn} hover:text-[#b93636] hover:bg-[#fcebeb]`}>
            <Trash2 size={14} />
          </button>
        </div>
      ))}
    </>
  );
}

// แก้ไขรายการแท็กของรายการหนึ่ง เพิ่มด้วยการพิมพ์แล้วกด Enter หรือคลิกออกจากช่อง
// Edits a line item's tags, adding one on Enter or blur
function TagsEditor({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState("");

  const addTag = () => {
    const tag = draft.trim();
    if (tag && !tags.includes(tag)) onChange([...tags, tag]);
    setDraft("");
  };

  return (
    <div className="pl-3.5 flex flex-col gap-2">
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
        onBlur={addTag}
        placeholder={t("quotation.lineItems.tagsPlaceholder")}
        aria-label={t("quotation.lineItems.tagsTitle")}
        className={`${compactCell} w-full`}
      />
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span key={tag} className="h-6 pl-2 pr-1 inline-flex items-center gap-1 rounded-md bg-[#fbf6e7] border border-[#ecdcaa] text-[#7d6420] text-xs font-medium">
              {tag}
              <button type="button" onClick={() => onChange(tags.filter((x) => x !== tag))} aria-label={`${t("common.delete")} ${tag}`} className="w-4 h-4 inline-flex items-center justify-center rounded hover:text-[#b93636]">
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function TagChips({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <span key={tag} className="h-6 px-2 inline-flex items-center rounded-md bg-[#fbf6e7] border border-[#ecdcaa] text-[#7d6420] text-xs font-medium">{tag}</span>
      ))}
    </div>
  );
}

// ตัวเลขส่วนลดของรายการแบบอ่านอย่างเดียว: % แสดงเป็นเปอร์เซ็นต์ บาทแสดงเป็นจำนวนเงิน ว่างเมื่อไม่มีส่วนลด
function lineDiscountLabel(l: QuoteLine): string {
  if (lineDiscountAmount(l) <= 0) return "—";
  return l.discountMode === "amount" ? fmt(l.discount) : `${l.discount}%`;
}

// ส่วนสรุปยอดท้ายตาราง — ใช้ทั้งหน้าแก้ไขและหน้าอ่านอย่างเดียว
function TotalsBlock({ lines, discount, discountMode, discountControl }: {
  lines: QuoteLine[];
  discount: number;
  discountMode: DiscountMode;
  discountControl?: ReactNode;
}) {
  const { t } = useI18n();
  const { subtotal, discountAmt, afterDiscount, vatAmt, total } = computeTotals(lines, discount, discountMode);
  const row = "flex justify-between gap-3 text-sm text-[#3d5173]";
  return (
    <div className="w-full sm:w-[440px] flex flex-col gap-2.5">
      <div className={row}><span>{t("quotation.totals.subtotal")}</span><span className="tabular-nums text-foreground">{fmt(subtotal)}</span></div>
      {(discountControl || discountAmt > 0) && (
        <div className="flex items-center gap-3 text-sm text-[#3d5173]">
          <span className="flex-1">{t("quotation.totals.discount")}</span>
          {discountControl}
          <span className="w-28 text-right tabular-nums text-[#b93636]">−{fmt(discountAmt)}</span>
        </div>
      )}
      <div className={row}><span>{t("quotation.totals.afterDiscount")}</span><span className="tabular-nums text-foreground">{fmt(afterDiscount)}</span></div>
      <div className={row}><span>{t("quotation.totals.vat").replace("{rate}", String(VAT_RATE))}</span><span className="tabular-nums text-foreground">{fmt(vatAmt)}</span></div>
      <div className="h-px bg-border my-1" />
      <div className="flex justify-between items-baseline gap-3">
        <span className="text-sm font-semibold text-foreground">{t("quotation.totals.grandTotal")}</span>
        <span className="text-[22px] font-bold tabular-nums text-foreground">฿{fmt(total)}</span>
      </div>
    </div>
  );
}

function itemNumbersOf(lines: QuoteLine[]): (number | null)[] {
  let n = 0;
  return lines.map((l) => (l.isSectionHeader ? null : ++n));
}

// ตารางแก้ไขรายการสินค้า/บริการในใบเสนอราคา รวมส่วนลด ยอดรวม และตัวเลือกจากแคตตาล็อก (เฉพาะใบร่าง/ใบใหม่)
// Editable table of quote line items, with discount, totals, and catalog picker — Draft/new only
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
  documentLabel,
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
  /** เลขที่ใบ (หรือ "ใบใหม่") สำหรับคำอธิบายในหน้าต่างเลือกสินค้า */
  documentLabel: string;
}) {
  const { t } = useI18n();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);

  const toggleExpand = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const updateLine = <K extends keyof QuoteLine>(id: number, key: K, value: QuoteLine[K]) =>
    onChange(lines.map((l) => (l.id === id ? { ...l, [key]: value } : l)));

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
  // เพิ่มหลายรายการจากสินค้าที่ติ๊กในคลัง — ชื่อ หน่วย ราคาเริ่มต้น และสเปกเป็นรายละเอียดย่อย ตามลำดับที่เลือก
  // Appends one line per picked product (name, unit, default price, spec as a sub-detail), in pick order
  const addLinesFromProducts = (picked: Product[]) => {
    onChange([
      ...lines,
      ...picked.map((product) => {
        const spec = product.specifications.trim();
        return {
          ...newLine(),
          description: product.name,
          unit: product.unit,
          unitPrice: product.defaultPrice,
          subDetails: spec ? [{ id: newSubDetailId(), text: spec }] : [],
        };
      }),
    ]);
    setPickerOpen(false);
  };
  const removeLine = (id: number) => onChange(lines.filter((l) => l.id !== id));

  const addSubDetail = (lineId: number) => {
    const newId = newSubDetailId();
    updateLine(lineId, "subDetails", [...(lines.find((l) => l.id === lineId)?.subDetails ?? []), { id: newId, text: "" }]);
    setPendingFocusId(newId);
  };
  const updateSubDetail = (lineId: number, subId: string, text: string) =>
    updateLine(lineId, "subDetails", (lines.find((l) => l.id === lineId)?.subDetails ?? []).map((sd) => (sd.id === subId ? { ...sd, text } : sd)));
  const removeSubDetail = (lineId: number, subId: string) =>
    updateLine(lineId, "subDetails", (lines.find((l) => l.id === lineId)?.subDetails ?? []).filter((sd) => sd.id !== subId));
  const reorderSubDetails = (lineId: number, from: number, to: number) => {
    const current = [...(lines.find((l) => l.id === lineId)?.subDetails ?? [])];
    const [moved] = current.splice(from, 1);
    current.splice(to, 0, moved);
    updateLine(lineId, "subDetails", current);
  };

  const itemNumbers = itemNumbersOf(lines);
  const itemCount = itemNumbers.filter((n) => n !== null).length;
  const num = `${field.cell} w-full min-w-0 text-right tabular-nums`;
  const thRight = table.th.replace("text-left", "text-right");
  const delBtn = "w-9 h-9 rounded-lg inline-flex items-center justify-center text-[#8a97ad] hover:text-[#b93636] hover:bg-[#fcebeb] transition-colors";
  const textBtn = "h-7 px-2 rounded-md inline-flex items-center gap-1.5 text-[13px] font-medium text-[#1a5fb4] hover:bg-[#e8f0fb] transition-colors";

  return (
    <SectionCard
      title={
        <span className="flex items-center gap-2.5">
          {t("quotation.lineItems.title")}
          <span className="text-[13px] font-normal text-muted-foreground">{t("ui.itemCount").replace("{n}", String(itemCount))}</span>
        </span>
      }
      actions={
        <>
          <button type="button" onClick={addSectionHeader} className={btn.secondarySm}>
            <Layers size={14} /> {t("quotation.lineItems.addSection")}
          </button>
          <button type="button" onClick={() => setPickerOpen(true)} className={btn.secondarySm}>
            <PackageSearch size={14} /> {t("quotation.lineItems.pickFromCatalog")}
          </button>
        </>
      }
      bodyClassName=""
      className="print:hidden"
    >
      {/* ก่อน 2026-09-09 ที่นี่กรองหมวดคลัง 4 หมวดของใบเบิกออกจากตัวเลือก โดยเดาจาก "ชื่อหมวด" —
          สินค้าที่สโตร์ตั้งรหัสลงหมวดคลังจึงหายไปจากใบเสนอราคาอย่างถาวรและกลับกัน ตอนนี้ตัวเลือกแสดง
          ทั้งคลังแล้ว และให้คนเลือกหมวดเองในช่องกรองที่มองเห็น */}
      <QuoteProductPicker
        open={pickerOpen}
        products={products}
        categories={categories}
        documentLabel={documentLabel}
        onConfirm={addLinesFromProducts}
        onClose={() => setPickerOpen(false)}
      />

      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px]">
          <thead>
            <tr className={table.head}>
              <th className={`${table.th} w-10`}>{t("quotation.lineItems.col.no")}</th>
              <th className={table.th}>{t("quotation.lineItems.col.description")}</th>
              <th className={`${table.th} w-24`}>{t("quotation.lineItems.col.unit")}</th>
              <th className={`${thRight} w-24`}>{t("quotation.lineItems.col.qty")}</th>
              <th className={`${thRight} w-36`}>{t("quotation.lineItems.col.unitPrice")}</th>
              <th className={`${thRight} w-36`}>
                <span className="inline-flex items-center gap-1.5">
                  {t("quotation.lineItems.col.discount")}
                  <DiscountModeToggle value={lineDiscountMode} onChange={setLineDiscountMode} label={t("quotation.discountMode.lineLabel")} />
                </span>
              </th>
              <th className={`${thRight} w-36`}>{t("quotation.lineItems.col.amount")}</th>
              <th className={`${table.th} w-12`}><span className="sr-only">{t("common.delete")}</span></th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-10 text-center text-sm text-muted-foreground">{t("quotation.lineItems.empty")}</td>
              </tr>
            )}
            {lines.map((line, idx) => {
              if (line.isSectionHeader) {
                return (
                  <tr key={line.id} className="bg-[#fbf7ea] border-b border-[#eef1f6]">
                    <td className={`${table.td} py-2.5 text-xs font-bold text-[#7d6420]`}>§</td>
                    <td colSpan={6} className={`${table.td} py-2.5`}>
                      <input
                        className={`${field.cell} w-full font-semibold`}
                        value={line.description}
                        onChange={(e) => updateLine(line.id, "description", e.target.value)}
                        placeholder={t("quotation.lineItems.sectionHeaderPlaceholder")}
                        aria-label={t("quotation.lineItems.sectionHeaderPlaceholder")}
                      />
                    </td>
                    <td className={`${table.td} py-2.5`}>
                      <button type="button" onClick={() => removeLine(line.id)} title={t("common.delete")} aria-label={t("common.delete")} className={delBtn}><Trash2 size={15} /></button>
                    </td>
                  </tr>
                );
              }

              const isExpanded = expanded.has(line.id);
              return (
                <tr key={line.id} className="border-b border-[#eef1f6] align-top">
                  <td className={`${table.td} py-2 align-top`}><span className="block pt-2 text-[13px] text-muted-foreground tabular-nums">{itemNumbers[idx]}</span></td>
                  <td className={`${table.td} py-2 align-top`}>
                    <div className="flex flex-col gap-1.5 min-w-0">
                      <input
                        className={`${field.cell} w-full min-w-0`}
                        value={line.description}
                        onChange={(e) => updateLine(line.id, "description", e.target.value)}
                        placeholder={t("quotation.lineItems.descriptionPlaceholder")}
                        aria-label={t("quotation.lineItems.col.description")}
                      />
                      <SubDetailRows
                        lineId={line.id}
                        subDetails={line.subDetails}
                        focusId={pendingFocusId}
                        onUpdate={(subId, text) => updateSubDetail(line.id, subId, text)}
                        onRemove={(subId) => removeSubDetail(line.id, subId)}
                        onReorder={(from, to) => reorderSubDetails(line.id, from, to)}
                      />
                      {isExpanded
                        ? <TagsEditor tags={line.tags} onChange={(tags) => updateLine(line.id, "tags", tags)} />
                        : <div className="pl-3.5"><TagChips tags={line.tags} /></div>}
                      <div className="flex gap-0.5 pl-1">
                        <button type="button" onClick={() => addSubDetail(line.id)} className={textBtn}>
                          <Plus size={14} /> {t("quotation.lineItems.addSubDetail")}
                        </button>
                        <button type="button" onClick={() => toggleExpand(line.id)} aria-expanded={isExpanded} className={textBtn}>
                          <Tag size={14} /> {t("quotation.lineItems.tagsTitle")}
                        </button>
                      </div>
                    </div>
                  </td>
                  <td className={`${table.td} py-2 align-top`}>
                    <UnitCombobox className={`${field.cell} w-full min-w-0`} value={line.unit} onChange={(next) => updateLine(line.id, "unit", next)} ariaLabel={t("quotation.lineItems.col.unit")} />
                  </td>
                  <td className={`${table.td} py-2 align-top`}>
                    <input type="number" className={num} value={line.qty} onChange={(e) => updateLine(line.id, "qty", parseFloat(e.target.value) || 0)} min={0} aria-label={t("quotation.lineItems.col.qty")} />
                  </td>
                  <td className={`${table.td} py-2 align-top`}>
                    <input type="number" className={num} value={line.unitPrice} onChange={(e) => updateLine(line.id, "unitPrice", parseFloat(e.target.value) || 0)} min={0} aria-label={t("quotation.lineItems.col.unitPrice")} />
                  </td>
                  <td className={`${table.td} py-2 align-top`}>
                    <div data-field-box="" className="h-9 pl-2.5 pr-2 rounded-lg border border-[#c3ccda] bg-white flex items-center gap-1 focus-within:border-[#1a5fb4] focus-within:ring-2 focus-within:ring-[#1a5fb4]/20 transition-colors">
                      <input
                        type="number"
                        className="flex-1 min-w-0 bg-transparent text-sm text-right tabular-nums text-foreground outline-none"
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
                      <span className="text-xs text-muted-foreground flex-shrink-0">{lineDiscountMode === "percent" ? "%" : "฿"}</span>
                    </div>
                  </td>
                  <td className={`${table.td} py-2 align-top text-right`}>
                    <span className="block pt-2 text-sm font-semibold tabular-nums text-foreground">{fmt(lineSubtotal(line))}</span>
                  </td>
                  <td className={`${table.td} py-2 align-top`}>
                    <button type="button" onClick={() => removeLine(line.id)} title={t("common.delete")} aria-label={t("common.delete")} className={delBtn}><Trash2 size={15} /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="px-6 py-2.5 border-b border-[#eef1f6]">
        <button type="button" onClick={addLine} className={btn.text}>
          <Plus size={16} /> {t("quotation.lineItems.addManual")}
        </button>
      </div>

      <div className="flex justify-end px-6 pt-5 pb-6">
        <TotalsBlock
          lines={lines}
          discount={discount}
          discountMode={discountMode}
          discountControl={
            <div data-field-box="" className="w-44 h-9 pl-2.5 pr-1 rounded-lg border border-[#c3ccda] bg-white flex items-center gap-1 focus-within:border-[#1a5fb4] focus-within:ring-2 focus-within:ring-[#1a5fb4]/20 transition-colors">
              <input
                type="number"
                className="flex-1 min-w-0 bg-transparent text-sm text-right tabular-nums text-foreground outline-none"
                value={discount}
                onChange={(e) => onDiscountChange(parseFloat(e.target.value) || 0)}
                min={0}
                max={discountMode === "percent" ? 100 : undefined}
                aria-label={discountMode === "percent" ? t("quotation.discountMode.percentLabel") : t("quotation.discountMode.amountLabel")}
              />
              <DiscountModeToggle
                value={discountMode}
                onChange={(mode) => { onDiscountModeChange(mode); onDiscountChange(clampForMode(discount, mode)); }}
                label={t("quotation.discountMode.totalLabel")}
              />
            </div>
          }
        />
      </div>
    </SectionCard>
  );
}

// ตารางรายการแบบอ่านอย่างเดียว (ใบที่ส่งขออนุมัติแล้ว — ดีไซน์ใหม่ QuoteDocument-Approved) + หมายเหตุซ้าย ยอดรวมขวา
// Read-only line items for a submitted quotation, with the remarks on the left and totals on the right
export function ReadonlyLineItems({ lines, discount, discountMode, remarks }: {
  lines: QuoteLine[];
  discount: number;
  discountMode: DiscountMode;
  remarks: string;
}) {
  const { t } = useI18n();
  const itemNumbers = itemNumbersOf(lines);
  const itemCount = itemNumbers.filter((n) => n !== null).length;
  const thRight = table.th.replace("text-left", "text-right");
  return (
    <SectionCard
      title={
        <span className="flex items-center gap-2.5">
          {t("quotation.lineItems.title")}
          <span className="text-[13px] font-normal text-muted-foreground">{t("ui.itemCount").replace("{n}", String(itemCount))}</span>
        </span>
      }
      bodyClassName=""
      className="print:hidden"
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px]">
          <thead>
            <tr className={table.head}>
              <th className={`${table.th} w-10`}>{t("quotation.lineItems.col.no")}</th>
              <th className={table.th}>{t("quotation.lineItems.col.description")}</th>
              <th className={`${table.th} w-20`}>{t("quotation.lineItems.col.unit")}</th>
              <th className={`${thRight} w-20`}>{t("quotation.lineItems.col.qty")}</th>
              <th className={`${thRight} w-36`}>{t("quotation.lineItems.col.unitPrice")}</th>
              <th className={`${thRight} w-28`}>{t("quotation.lineItems.col.discount")}</th>
              <th className={`${thRight} w-36`}>{t("quotation.lineItems.col.amount")}</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && (
              <tr><td colSpan={7} className="px-5 py-10 text-center text-sm text-muted-foreground">{t("quotation.lineItems.empty")}</td></tr>
            )}
            {lines.map((line, idx) => line.isSectionHeader ? (
              <tr key={line.id} className="bg-[#fbf7ea] border-b border-[#eef1f6]">
                <td className={`${table.td} py-2.5 text-xs font-bold text-[#7d6420]`}>§</td>
                <td colSpan={6} className={`${table.td} py-2.5 text-sm font-semibold text-foreground`}>{line.description || "—"}</td>
              </tr>
            ) : (
              <tr key={line.id} className="border-b border-[#eef1f6] align-baseline">
                <td className={`${table.td} py-3 text-[13px] text-muted-foreground tabular-nums`}>{itemNumbers[idx]}</td>
                <td className={`${table.td} py-3`}>
                  <div className="flex flex-col gap-1 min-w-0">
                    <span className="text-sm text-foreground break-words">{line.description || "—"}</span>
                    {line.subDetails.filter((sd) => sd.text.trim()).map((sd) => (
                      <span key={sd.id} className="text-[12.5px] text-muted-foreground break-words">– {sd.text}</span>
                    ))}
                    <TagChips tags={line.tags} />
                  </div>
                </td>
                <td className={`${table.td} py-3 text-sm text-[#3d5173]`}>{line.unit}</td>
                <td className={`${table.td} py-3 text-sm text-right tabular-nums`}>{line.qty.toLocaleString("th-TH")}</td>
                <td className={`${table.td} py-3 text-sm text-right tabular-nums`}>{fmt(line.unitPrice)}</td>
                <td className={`${table.td} py-3 text-sm text-right tabular-nums ${lineDiscountAmount(line) > 0 ? "text-foreground" : "text-[#8a97ad]"}`}>{lineDiscountLabel(line)}</td>
                <td className={`${table.td} py-3 text-sm text-right font-semibold tabular-nums`}>{fmt(lineSubtotal(line))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col lg:flex-row gap-6 lg:gap-10 px-6 pt-5 pb-6">
        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">{t("quotation.section.remarks")}</span>
          <p className={`text-sm leading-relaxed whitespace-pre-line break-words ${remarks.trim() ? "text-foreground" : "text-[#8a97ad]"}`}>{remarks.trim() || "—"}</p>
        </div>
        <TotalsBlock lines={lines} discount={discount} discountMode={discountMode} />
      </div>
    </SectionCard>
  );
}
