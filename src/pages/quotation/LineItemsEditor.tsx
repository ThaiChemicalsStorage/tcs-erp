import { Fragment, useRef, useState } from "react";
import {
  Plus, Trash2, Percent, PackageSearch,
  List, ListOrdered, GripVertical, StickyNote, X,
} from "lucide-react";
import type { Product, ProductCategory } from "../../lib/products";
import { type QuoteLine, type QuoteLineDynamicFieldValue, type SubDetail, blankLine, newSubDetailId, lineSubtotal, lineHasDetails, computeTotals, fmt, VAT_RATE } from "../../lib/quotes";
import type { TemplateSection } from "../../lib/quotationTemplates";
import { resolveDynamicFieldSchema, isFieldVisible } from "../../lib/templateDynamicFields";
import { ProductPickerModal } from "../products/ProductPickerModal";
import { useI18n } from "../../lib/i18n";

function DynamicFieldsEditor({
  templateSections, sourceTemplateItemId, values, onChange, disabled,
}: {
  templateSections: TemplateSection[] | undefined;
  sourceTemplateItemId: string | undefined;
  values: QuoteLineDynamicFieldValue[];
  onChange: (values: QuoteLineDynamicFieldValue[]) => void;
  disabled: boolean;
}) {
  const { t } = useI18n();
  const schema = resolveDynamicFieldSchema(templateSections, sourceTemplateItemId);
  if (schema.length === 0) return null;

  const valueOf = (key: string): QuoteLineDynamicFieldValue => values.find((v) => v.key === key) ?? { key };
  const setValue = (key: string, patch: Partial<QuoteLineDynamicFieldValue>) => {
    const existing = values.some((v) => v.key === key);
    onChange(existing ? values.map((v) => (v.key === key ? { ...v, ...patch } : v)) : [...values, { key, ...patch }]);
  };

  return (
    <div>
      <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1.5">{t("quotation.lineItems.dynamicFieldsTitle")}</p>
      <div className="space-y-2">
        {schema.filter((f) => isFieldVisible(f, values)).map((field) => {
          const current = valueOf(field.key);
          if (field.type === "checkboxGroup") {
            const checked = new Set(current.checkedOptionKeys ?? []);
            return (
              <div key={field.key}>
                <label className="text-[11px] text-muted-foreground block mb-1">{field.label}</label>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {(field.options ?? []).map((opt) => (
                    <label key={opt.key} className="flex items-center gap-1.5 text-[11px] text-foreground cursor-pointer select-none">
                      <input
                        type="checkbox"
                        disabled={disabled}
                        checked={checked.has(opt.key)}
                        onChange={(e) => {
                          const next = new Set(checked);
                          if (e.target.checked) next.add(opt.key); else next.delete(opt.key);
                          setValue(field.key, { checkedOptionKeys: Array.from(next) });
                        }}
                        className="w-3.5 h-3.5 rounded border-border accent-[#c9a84c] disabled:opacity-60"
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>
            );
          }
          if (field.type === "dropdown") {
            return (
              <div key={field.key}>
                <label className="text-[11px] text-muted-foreground block mb-1">{field.label}</label>
                <select
                  disabled={disabled}
                  value={current.value ?? ""}
                  onChange={(e) => setValue(field.key, { value: e.target.value })}
                  className="w-full text-xs text-foreground bg-card border border-border rounded-lg px-2.5 py-1.5 outline-none focus:border-[#c9a84c]/50 transition-colors appearance-none disabled:opacity-60"
                >
                  <option value="">—</option>
                  {(field.options ?? []).map((opt) => <option key={opt.key} value={opt.key}>{opt.label}</option>)}
                </select>
              </div>
            );
          }
          if (field.type === "radio") {
            return (
              <div key={field.key}>
                <label className="text-[11px] text-muted-foreground block mb-1">{field.label}</label>
                <div className="flex items-center gap-3">
                  {(field.options ?? []).map((opt) => (
                    <label key={opt.key} className="flex items-center gap-1.5 text-[11px] text-foreground cursor-pointer select-none">
                      <input
                        type="radio"
                        disabled={disabled}
                        checked={current.value === opt.key}
                        onChange={() => setValue(field.key, { value: opt.key })}
                        className="w-3.5 h-3.5 accent-[#c9a84c] disabled:opacity-60"
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>
            );
          }
          // text / number
          return (
            <div key={field.key}>
              <label className="text-[11px] text-muted-foreground block mb-1">{field.label}</label>
              <div className="flex items-center gap-1.5">
                <input
                  type={field.type === "number" ? "number" : "text"}
                  min={field.type === "number" ? 0 : undefined}
                  disabled={disabled}
                  value={current.value ?? ""}
                  onChange={(e) => setValue(field.key, { value: e.target.value })}
                  placeholder={field.placeholder}
                  className="flex-1 min-w-0 text-xs text-foreground bg-card border border-border rounded-lg px-2.5 py-1.5 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60"
                />
                {field.unitSuffix && <span className="text-[11px] text-muted-foreground flex-shrink-0">{field.unitSuffix}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function insertAtCursor(textarea: HTMLTextAreaElement, prefix: string, value: string, onChange: (v: string) => void) {
  const start = textarea.selectionStart ?? value.length;
  const end = textarea.selectionEnd ?? value.length;
  const needsNewlineBefore = start > 0 && value[start - 1] !== "\n";
  const insertion = `${needsNewlineBefore ? "\n" : ""}${prefix}`;
  const next = value.slice(0, start) + insertion + value.slice(end);
  onChange(next);
  requestAnimationFrame(() => {
    textarea.focus();
    const pos = start + insertion.length;
    textarea.setSelectionRange(pos, pos);
  });
}

function NotesEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useI18n();
  const ref = useRef<HTMLTextAreaElement>(null);
  return (
    <div>
      <div className="flex items-center gap-1 mb-1.5">
        <button
          type="button"
          onClick={() => ref.current && insertAtCursor(ref.current, "• ", value, onChange)}
          title={t("quotation.lineItems.notesBulletTitle")}
          className="flex items-center gap-1 px-2 py-1 text-[10px] text-muted-foreground border border-border rounded hover:text-foreground hover:border-[#c9a84c]/40 transition-all"
        >
          <List size={11} /> {t("quotation.lineItems.notesBullet")}
        </button>
        <button
          type="button"
          onClick={() => ref.current && insertAtCursor(ref.current, "1. ", value, onChange)}
          title={t("quotation.lineItems.notesNumberedTitle")}
          className="flex items-center gap-1 px-2 py-1 text-[10px] text-muted-foreground border border-border rounded hover:text-foreground hover:border-[#c9a84c]/40 transition-all"
        >
          <ListOrdered size={11} /> {t("quotation.lineItems.notesNumbered")}
        </button>
      </div>
      <textarea
        ref={ref}
        rows={4}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("quotation.lineItems.notesPlaceholder")}
        className="w-full text-xs text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors resize-none leading-relaxed"
      />
    </div>
  );
}

function SubDetailsEditor({
  subDetails,
  onAdd,
  onUpdate,
  onRemove,
  onReorder,
}: {
  subDetails: SubDetail[];
  onAdd: () => void;
  onUpdate: (id: string, text: string) => void;
  onRemove: (id: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}) {
  const { t } = useI18n();
  const dragIndex = useRef<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  return (
    <div>
      <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1.5">{t("quotation.lineItems.subDetailsTitle")}</p>
      <div className="space-y-1">
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
            className={`flex items-center gap-1.5 rounded-lg transition-colors ${overIndex === idx ? "bg-[#c9a84c]/10" : ""}`}
          >
            <span className="text-muted-foreground cursor-grab active:cursor-grabbing flex-shrink-0" title={t("quotation.lineItems.subDetailsDragTitle")}>
              <GripVertical size={13} />
            </span>
            <input
              value={sd.text}
              onChange={(e) => onUpdate(sd.id, e.target.value)}
              placeholder={t("quotation.lineItems.subDetailsPlaceholder")}
              className="flex-1 text-xs text-foreground bg-secondary border border-border rounded-lg px-2.5 py-1.5 outline-none focus:border-[#c9a84c]/50 transition-colors"
            />
            <button onClick={() => onRemove(sd.id)} className="text-muted-foreground hover:text-[#e05252] transition-colors flex-shrink-0 p-1">
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
      <button
        onClick={onAdd}
        className="flex items-center gap-1.5 mt-2 px-2.5 py-1.5 text-[11px] bg-[#c9a84c]/10 text-[#c9a84c] border border-[#c9a84c]/25 rounded-lg hover:bg-[#c9a84c]/20 transition-colors font-medium"
      >
        <Plus size={11} /> {t("quotation.lineItems.addSubDetail")}
      </button>
    </div>
  );
}

function SpecificationsEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useI18n();
  return (
    <div>
      <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1.5">{t("quotation.lineItems.specTitle")}</p>
      <textarea
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("quotation.lineItems.specPlaceholder")}
        className="w-full text-xs text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors resize-none leading-relaxed"
      />
    </div>
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
      <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1.5">{t("quotation.lineItems.tagsTitle")}</p>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {tags.map((tag) => (
          <span key={tag} className="flex items-center gap-1 px-2 py-1 text-[11px] bg-[#c9a84c]/10 text-[#c9a84c] border border-[#c9a84c]/25 rounded-full">
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
        className="w-full text-xs text-foreground bg-secondary border border-border rounded-lg px-2.5 py-1.5 outline-none focus:border-[#c9a84c]/50 transition-colors"
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
  templateSections,
  disabled = false,
}: {
  lines: QuoteLine[];
  onChange: (lines: QuoteLine[]) => void;
  discount: number;
  onDiscountChange: (n: number) => void;
  products: Product[];
  categories: ProductCategory[];
  /** The applied template's sections (added 2026-07-20) — resolves each line's dynamic-field
   * schema by `sourceTemplateItemId`. Undefined for a blank-start quote or one built before this
   * feature existed; a line with no matching schema simply shows no dynamic-fields panel. */
  templateSections?: TemplateSection[];
  /** Gates only the new dynamic-fields panel below — every pre-existing control in this table was
   * already always-editable regardless of permission, unchanged here. */
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const toggleExpand = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const updateLine = <K extends keyof QuoteLine>(id: number, field: K, value: QuoteLine[K]) =>
    onChange(lines.map((l) => (l.id === id ? { ...l, [field]: value } : l)));

  const addLine = () => onChange([...lines, blankLine()]);
  const addLineFromProduct = (product: Product) =>
    onChange([...lines, { ...blankLine(), description: product.name, unit: product.unit, unitPrice: product.defaultPrice, specifications: product.specifications }]);
  const removeLine = (id: number) => onChange(lines.filter((l) => l.id !== id));

  const addSubDetail = (lineId: number) =>
    updateLine(lineId, "subDetails", [...(lines.find((l) => l.id === lineId)?.subDetails ?? []), { id: newSubDetailId(), text: "" }]);
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

  const updateDynamicFields = (lineId: number, values: QuoteLineDynamicFieldValue[]) => updateLine(lineId, "dynamicFields", values);

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
          <button onClick={() => setPickerOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all font-medium">
            <PackageSearch size={12} /> {t("quotation.lineItems.pickFromCatalog")}
          </button>
          <button onClick={addLine} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#c9a84c]/10 text-[#c9a84c] border border-[#c9a84c]/25 rounded-lg hover:bg-[#c9a84c]/20 transition-colors font-medium">
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
                <th key={i} className={`px-4 py-2.5 text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider ${i === 0 ? "w-10 text-center" : i === 1 ? "text-left" : "text-right"} ${i === 7 ? "w-10" : ""}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((line, idx) => {
              // Section-header line copied from a Quotation Template (see applyTemplate.ts) — a
              // non-priced divider, not an ordinary priced line. Rendered as one full-width row
              // (editable title, no unit/qty/price/discount/notes) instead of the normal 8-column
              // layout below.
              if (line.isSectionHeader) {
                return (
                  <tr key={line.id} className="border-b border-border/50 bg-muted/20 group">
                    <td className="px-4 py-2.5 text-center text-xs font-mono text-muted-foreground align-top">§</td>
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
              const hasDetails = lineHasDetails(line);
              return (
                <Fragment key={line.id}>
                  <tr className="border-b border-border/50 hover:bg-secondary/30 transition-colors group">
                    <td className="px-4 py-3 text-center text-xs font-mono text-muted-foreground align-top">{itemNumbers[idx]}</td>
                    <td className="px-4 py-3 align-top">
                      <input className="w-full text-sm text-foreground bg-transparent border-0 outline-none focus:bg-secondary rounded px-1 py-0.5 transition-colors" value={line.description} onChange={(e) => updateLine(line.id, "description", e.target.value)} placeholder={t("quotation.lineItems.descriptionPlaceholder")} />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <input className="w-20 text-xs text-center text-foreground bg-transparent border-0 outline-none focus:bg-secondary rounded px-1 py-0.5 transition-colors" value={line.unit} onChange={(e) => updateLine(line.id, "unit", e.target.value)} />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <input type="number" className="w-20 text-xs text-right text-foreground bg-transparent border-0 outline-none focus:bg-secondary rounded px-1 py-0.5 transition-colors" value={line.qty} onChange={(e) => updateLine(line.id, "qty", parseFloat(e.target.value) || 0)} min={0} />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <input type="number" className="w-32 text-xs text-right font-mono text-foreground bg-transparent border-0 outline-none focus:bg-secondary rounded px-1 py-0.5 transition-colors" value={line.unitPrice} onChange={(e) => updateLine(line.id, "unitPrice", parseFloat(e.target.value) || 0)} min={0} />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex items-center justify-end gap-0.5">
                        <input type="number" className="w-16 text-xs text-right font-mono text-foreground bg-transparent border-0 outline-none focus:bg-secondary rounded px-1 py-0.5 transition-colors" value={line.discount} onChange={(e) => updateLine(line.id, "discount", parseFloat(e.target.value) || 0)} min={0} max={100} />
                        <Percent size={10} className="text-muted-foreground flex-shrink-0" />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-right font-semibold text-foreground align-top">{fmt(lineSubtotal(line))}</td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => toggleExpand(line.id)}
                          title={t("quotation.lineItems.notesIconTitle")}
                          className={`transition-colors relative ${hasDetails ? "text-[#c9a84c]" : "text-muted-foreground opacity-0 group-hover:opacity-100"} hover:text-[#c9a84c]`}
                        >
                          <StickyNote size={13} />
                          {hasDetails && !isExpanded && <span className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-[#c9a84c]" />}
                        </button>
                        <button onClick={() => removeLine(line.id)} className="text-muted-foreground hover:text-[#e05252] transition-colors opacity-0 group-hover:opacity-100"><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>

                  {isExpanded && (
                    <tr className="border-b border-border/50 bg-muted/10">
                      <td />
                      <td colSpan={7} className="px-4 pb-4 pt-1">
                        <div className="grid sm:grid-cols-2 gap-4 bg-card border border-border rounded-lg p-4">
                          <NotesEditor value={line.notes} onChange={(v) => updateLine(line.id, "notes", v)} />
                          <SubDetailsEditor
                            subDetails={line.subDetails}
                            onAdd={() => addSubDetail(line.id)}
                            onUpdate={(subId, text) => updateSubDetail(line.id, subId, text)}
                            onRemove={(subId) => removeSubDetail(line.id, subId)}
                            onReorder={(from, to) => reorderSubDetails(line.id, from, to)}
                          />
                          <SpecificationsEditor value={line.specifications} onChange={(v) => updateLine(line.id, "specifications", v)} />
                          <TagsEditor tags={line.tags} onChange={(tags) => updateLine(line.id, "tags", tags)} />
                          {line.dynamicFields && (
                            <DynamicFieldsEditor
                              templateSections={templateSections}
                              sourceTemplateItemId={line.sourceTemplateItemId}
                              values={line.dynamicFields}
                              onChange={(values) => updateDynamicFields(line.id, values)}
                              disabled={disabled}
                            />
                          )}
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
                <input type="number" className="w-10 text-xs font-mono text-foreground bg-transparent outline-none text-right" value={discount} onChange={(e) => onDiscountChange(parseFloat(e.target.value) || 0)} min={0} max={100} />
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
