import { Fragment, useRef, useState } from "react";
import {
  Plus, Trash2, Percent, PackageSearch,
  List, ListOrdered, GripVertical, StickyNote,
} from "lucide-react";
import type { Product, ProductCategory } from "../../lib/products";
import { type QuoteLine, type SubDetail, blankLine, newSubDetailId, lineSubtotal, computeTotals, fmt, VAT_RATE } from "../../lib/quotes";
import { FormattedNotes } from "./notesFormat";
import { ProductPickerModal } from "../products/ProductPickerModal";

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
  const ref = useRef<HTMLTextAreaElement>(null);
  return (
    <div>
      <div className="flex items-center gap-1 mb-1.5">
        <button
          type="button"
          onClick={() => ref.current && insertAtCursor(ref.current, "• ", value, onChange)}
          title="เพิ่มรายการหัวข้อย่อย"
          className="flex items-center gap-1 px-2 py-1 text-[10px] text-muted-foreground border border-border rounded hover:text-foreground hover:border-[#c9a84c]/40 transition-all"
        >
          <List size={11} /> บูลเลต
        </button>
        <button
          type="button"
          onClick={() => ref.current && insertAtCursor(ref.current, "1. ", value, onChange)}
          title="เพิ่มรายการลำดับเลข"
          className="flex items-center gap-1 px-2 py-1 text-[10px] text-muted-foreground border border-border rounded hover:text-foreground hover:border-[#c9a84c]/40 transition-all"
        >
          <ListOrdered size={11} /> ลำดับเลข
        </button>
      </div>
      <textarea
        ref={ref}
        rows={4}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="เช่น ขอบเขตงาน, รายละเอียดการติดตั้ง, การรับประกัน, ความต้องการของลูกค้า, เงื่อนไข, หมายเหตุภายใน..."
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
  const dragIndex = useRef<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  return (
    <div>
      <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1.5">รายละเอียดย่อย</p>
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
            <span className="text-muted-foreground cursor-grab active:cursor-grabbing flex-shrink-0" title="ลากเพื่อจัดลำดับใหม่">
              <GripVertical size={13} />
            </span>
            <input
              value={sd.text}
              onChange={(e) => onUpdate(sd.id, e.target.value)}
              placeholder="รายละเอียดย่อย เช่น จัดหากล้อง 4MP"
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
        <Plus size={11} /> เพิ่มรายละเอียดย่อย
      </button>
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
    onChange([...lines, { ...blankLine(), description: product.name, unit: product.unit, unitPrice: product.defaultPrice }]);
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

  const { subtotal, discountAmt, afterDiscount, vatAmt, total } = computeTotals(lines, discount);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border flex items-center justify-between bg-muted/30 print:hidden">
        <p className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', serif" }}>รายการสินค้า / บริการ</p>
        <div className="flex items-center gap-2">
          <button onClick={() => setPickerOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all font-medium">
            <PackageSearch size={12} /> เลือกจากคลังสินค้า
          </button>
          <button onClick={addLine} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#c9a84c]/10 text-[#c9a84c] border border-[#c9a84c]/25 rounded-lg hover:bg-[#c9a84c]/20 transition-colors font-medium">
            <Plus size={12} /> เพิ่มรายการเอง
          </button>
        </div>
      </div>
      <ProductPickerModal open={pickerOpen} products={products} categories={categories} onSelect={addLineFromProduct} onClose={() => setPickerOpen(false)} />

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="print:hidden">
            <tr className="border-b border-border bg-muted/20">
              {["#", "รายละเอียด", "หน่วย", "จำนวน", "ราคา/หน่วย (฿)", "ส่วนลด (%)", "จำนวนเงิน (฿)", ""].map((h, i) => (
                <th key={i} className={`px-4 py-2.5 text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider ${i === 0 ? "w-10 text-center" : i === 1 ? "text-left" : "text-right"} ${i === 7 ? "w-10" : ""}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((line, idx) => {
              const isExpanded = expanded.has(line.id);
              const hasDetails = line.notes.trim() !== "" || line.subDetails.length > 0;
              return (
                <Fragment key={line.id}>
                  <tr className="border-b border-border/50 hover:bg-secondary/30 transition-colors group print:hidden">
                    <td className="px-4 py-3 text-center text-xs font-mono text-muted-foreground align-top">{idx + 1}</td>
                    <td className="px-4 py-3 align-top">
                      <input className="w-full text-sm text-foreground bg-transparent border-0 outline-none focus:bg-secondary rounded px-1 py-0.5 transition-colors" value={line.description} onChange={(e) => updateLine(line.id, "description", e.target.value)} placeholder="รายละเอียด" />
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
                          title="หมายเหตุ / รายละเอียดย่อย"
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
                    <tr className="border-b border-border/50 bg-muted/10 print:hidden">
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
                        </div>
                      </td>
                    </tr>
                  )}

                  {/* Print-only static rendering: always in the DOM, visible only in print/PDF output */}
                  <tr className="hidden print:table-row align-top">
                    <td className="px-4 py-2 text-center text-xs font-mono text-muted-foreground">{idx + 1}</td>
                    <td className="px-4 py-2" colSpan={4}>
                      <p className="text-sm text-foreground">{line.description}</p>
                      {hasDetails && (
                        <div className="mt-1 pl-3 border-l-2 border-[#c9a84c]/40 text-xs text-muted-foreground leading-relaxed">
                          <FormattedNotes text={line.notes} />
                          {line.subDetails.length > 0 && (
                            <ul className="list-disc pl-4 mt-1 space-y-0.5">
                              {line.subDetails.filter((sd) => sd.text.trim()).map((sd) => <li key={sd.id}>{sd.text}</li>)}
                            </ul>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-right font-mono text-muted-foreground">{line.qty} {line.unit}</td>
                    <td className="px-4 py-2 text-xs text-right font-mono text-muted-foreground">{fmt(line.unitPrice)}</td>
                    <td className="px-4 py-2 text-xs text-right font-mono font-semibold text-foreground">{fmt(lineSubtotal(line))}</td>
                  </tr>
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
            <span>ยอดรวมก่อนหักส่วนลด</span>
            <span className="font-mono">฿{fmt(subtotal)}</span>
          </div>
          <div className="flex justify-between text-sm text-muted-foreground items-center">
            <span className="flex items-center gap-2">
              ส่วนลดพิเศษ
              <span className="flex items-center gap-1 bg-secondary border border-border rounded px-2 py-0.5 print:hidden">
                <input type="number" className="w-10 text-xs font-mono text-foreground bg-transparent outline-none text-right" value={discount} onChange={(e) => onDiscountChange(parseFloat(e.target.value) || 0)} min={0} max={100} />
                <Percent size={10} className="text-muted-foreground" />
              </span>
              <span className="hidden print:inline font-mono">({discount}%)</span>
            </span>
            <span className="font-mono text-[#e05252]">-฿{fmt(discountAmt)}</span>
          </div>
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>ยอดหลังหักส่วนลด</span>
            <span className="font-mono">฿{fmt(afterDiscount)}</span>
          </div>
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>ภาษีมูลค่าเพิ่ม (VAT {VAT_RATE}%)</span>
            <span className="font-mono">฿{fmt(vatAmt)}</span>
          </div>
          <div className="flex justify-between text-base font-bold text-foreground pt-2 border-t border-border">
            <span style={{ fontFamily: "'Playfair Display', serif" }}>ยอดรวมทั้งสิ้น</span>
            <span className="font-mono text-[#c9a84c] text-lg">฿{fmt(total)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
