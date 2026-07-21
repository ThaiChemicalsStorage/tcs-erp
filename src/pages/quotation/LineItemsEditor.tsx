import { Fragment, useRef, useState } from "react";
import {
  Plus, Trash2, Percent, PackageSearch, Layers,
  GripVertical, StickyNote, Pin, X,
} from "lucide-react";
import type { Product, ProductCategory } from "../../lib/products";
import { type QuoteLine, type SubDetail, blankLine, newSubDetailId, lineSubtotal, computeTotals, fmt, VAT_RATE } from "../../lib/quotes";
import { ProductPickerModal } from "../products/ProductPickerModal";
import { useI18n } from "../../lib/i18n";

/** Renders each sub-detail as its own "pinned" row directly under the parent line item's row in
 * the main table — a highlighted (gold-tinted) inline strip with a Pin icon, mirroring how
 * `PrintDocument.tsx` prints sub-details with a Pin marker — rather than inside the collapsible
 * tags card below. `colSpan` covers every column after "No." (description through the
 * row-actions column) so the pinned strip runs the full width of the row it belongs to. */
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
              <button onClick={() => onRemove(sd.id)} className="text-muted-foreground hover:text-[#e05252] transition-colors opacity-0 group-hover/pin:opacity-100 flex-shrink-0">
                <Trash2 size={12} />
              </button>
            </div>
          </td>
        </tr>
      ))}
    </>
  );
}

function TagsEditor({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState("");

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

export function LineItemsEditor({
  lines,
  onChange,
  discount,
  onDiscountChange,
  products,
  categories,
}: {
  lines: QuoteLine[];
  onChange: (lines: QuoteLine[]) => void;
  discount: number;
  onDiscountChange: (n: number) => void;
  products: Product[];
  categories: ProductCategory[];
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

  const updateLine = <K extends keyof QuoteLine>(id: number, field: K, value: QuoteLine[K]) =>
    onChange(lines.map((l) => (l.id === id ? { ...l, [field]: value } : l)));

  const addLine = () => onChange([...lines, blankLine()]);
  const addSectionHeader = () => onChange([...lines, { ...blankLine(), isSectionHeader: true }]);
  const addLineFromProduct = (product: Product) => {
    const spec = product.specifications.trim();
    onChange([...lines, {
      ...blankLine(),
      description: product.name,
      unit: product.unit,
      unitPrice: product.defaultPrice,
      subDetails: spec ? [{ id: newSubDetailId(), text: spec }] : [],
    }]);
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

  const { subtotal, discountAmt, afterDiscount, vatAmt, total } = computeTotals(lines, discount);

  // "No." numbering counts only ordinary priced lines — a section-header line (see below) gets its
  // own "§" marker instead, so numbering a template-seeded quotation stays a clean 1, 2, 3... across
  // its real line items rather than skipping a number at every section divider.
  let itemNumber = 0;
  const itemNumbers = lines.map((l) => (l.isSectionHeader ? null : ++itemNumber));

  const columns = [
    t("quotation.lineItems.col.no"), t("quotation.lineItems.col.description"), t("quotation.lineItems.col.unit"),
    t("quotation.lineItems.col.qty"), t("quotation.lineItems.col.unitPrice"), t("quotation.lineItems.col.discount"),
    t("quotation.lineItems.col.amount"), "",
  ];

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden print:hidden">
      <div className="px-5 py-3.5 border-b border-border flex items-center justify-between bg-muted/30">
        <p className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("quotation.lineItems.title")}</p>
        <div className="flex items-center gap-2">
          <button onClick={() => setPickerOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all font-medium">
            <PackageSearch size={12} /> {t("quotation.lineItems.pickFromCatalog")}
          </button>
          <button onClick={addSectionHeader} className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all font-medium">
            <Layers size={12} /> {t("quotation.lineItems.addSection")}
          </button>
          <button onClick={addLine} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-[#c9a84c]/10 text-[#c9a84c] border border-[#c9a84c]/25 rounded-lg hover:bg-[#c9a84c]/20 transition-colors font-medium">
            <Plus size={12} /> {t("quotation.lineItems.addManual")}
          </button>
        </div>
      </div>
      <ProductPickerModal open={pickerOpen} products={products} categories={categories} onSelect={addLineFromProduct} onClose={() => setPickerOpen(false)} />

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
              // Section-header line copied from a Quotation Template (see applyTemplate.ts) — a
              // non-priced divider, not an ordinary priced line. Rendered as one full-width row
              // (editable title, no unit/qty/price/discount) instead of the normal 8-column
              // layout below.
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
                        <button onClick={() => removeLine(line.id)} className="text-muted-foreground hover:text-[#e05252] transition-colors opacity-0 group-hover:opacity-100"><Trash2 size={13} /></button>
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
                        <input type="number" className="w-16 text-sm text-right font-mono text-foreground bg-transparent border-0 outline-none focus:bg-secondary rounded px-1 py-0.5 transition-colors" value={line.discount} onChange={(e) => updateLine(line.id, "discount", parseFloat(e.target.value) || 0)} min={0} max={100} />
                        <Percent size={10} className="text-muted-foreground flex-shrink-0" />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-right font-semibold text-foreground align-top">{fmt(lineSubtotal(line))}</td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => addSubDetail(line.id)}
                          title={t("quotation.lineItems.addSubDetail")}
                          className={`transition-colors relative ${hasSubDetails ? "text-[#c9a84c]" : "text-muted-foreground opacity-0 group-hover:opacity-100"} hover:text-[#c9a84c]`}
                        >
                          <Pin size={13} />
                        </button>
                        <button
                          onClick={() => toggleExpand(line.id)}
                          title={t("quotation.lineItems.tagsTitle")}
                          className={`transition-colors relative ${hasCardDetails ? "text-[#c9a84c]" : "text-muted-foreground opacity-0 group-hover:opacity-100"} hover:text-[#c9a84c]`}
                        >
                          <StickyNote size={13} />
                          {hasCardDetails && !isExpanded && <span className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-[#c9a84c]" />}
                        </button>
                        <button onClick={() => removeLine(line.id)} className="text-muted-foreground hover:text-[#e05252] transition-colors opacity-0 group-hover:opacity-100"><Trash2 size={13} /></button>
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

      {/* Totals */}
      <div className="flex justify-end p-5 border-t border-border">
        <div className="w-72 space-y-2">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>{t("quotation.totals.subtotal")}</span>
            <span className="font-mono">฿{fmt(subtotal)}</span>
          </div>
          <div className="flex justify-between text-sm text-muted-foreground items-center">
            <span className="flex items-center gap-2">
              {t("quotation.totals.discount")}
              <span className="flex items-center gap-1 bg-secondary border border-border rounded px-2 py-0.5">
                <input type="number" className="w-10 text-sm font-mono text-foreground bg-transparent outline-none text-right" value={discount} onChange={(e) => onDiscountChange(parseFloat(e.target.value) || 0)} min={0} max={100} />
                <Percent size={10} className="text-muted-foreground" />
              </span>
            </span>
            <span className="font-mono text-[#e05252]">-฿{fmt(discountAmt)}</span>
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
