import { Fragment, useRef, useState } from "react";
import { Plus, Trash2, Copy, GripVertical, StickyNote, ChevronUp, ChevronDown, ClipboardList } from "lucide-react";
import { type ScopeOfWorkItem, newScopeItemId, newScopeSpecLineId, blankScopeOfWorkItem } from "../../lib/scopeOfWork";
import { FieldError } from "../../components/FieldError";
import { EmptyState } from "../../components/EmptyState";

/**
 * Editable table for a Scope of Work's item list — copied at creation time from the source
 * quotation's line items (see `deriveFromQuotation()` in api/_lib/scopeOfWorkHandler.ts), then
 * fully independent: add/remove/duplicate/reorder items, edit quantity/unit, add specification
 * lines. Deliberately carries no price/discount columns at all (Scope of Work never shows pricing
 * — see docs/MODULES/ScopeOfWork.md "Item Layout"). Modeled after `LineItemsEditor.tsx`'s
 * interaction patterns (drag-reorder, expand-to-edit-details) for a consistent feel.
 */
export function ScopeOfWorkItemsEditor({
  items,
  onChange,
  disabled,
  itemErrors,
  noItemsError,
}: {
  items: ScopeOfWorkItem[];
  onChange: (items: ScopeOfWorkItem[]) => void;
  disabled: boolean;
  /** ScopeOfWorkItem.id -> Thai error message, from validateScopeOfWorkItems() (src/lib/validation/
   * scopeOfWorkValidation.ts) — added 2026-07-16, required-field validation pass. */
  itemErrors?: Record<string, string>;
  /** Shown above the table when there are zero non-header items at all. */
  noItemsError?: string;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const dragIndex = useRef<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const updateItem = <K extends keyof ScopeOfWorkItem>(id: string, field: K, value: ScopeOfWorkItem[K]) =>
    onChange(items.map((it) => (it.id === id ? { ...it, [field]: value } : it)));

  const addItem = () => onChange([...items, blankScopeOfWorkItem()]);
  const addSectionHeader = () =>
    onChange([...items, { id: newScopeItemId(), name: "", specifications: [], quantity: null, unit: "", remark: "", isSectionHeader: true }]);
  const removeItem = (id: string) => onChange(items.filter((it) => it.id !== id));
  const duplicateItem = (id: string) => {
    const idx = items.findIndex((it) => it.id === id);
    if (idx === -1) return;
    const copy: ScopeOfWorkItem = {
      ...items[idx],
      id: newScopeItemId(),
      specifications: items[idx].specifications.map((s) => ({ ...s, id: newScopeSpecLineId() })),
    };
    const next = [...items];
    next.splice(idx + 1, 0, copy);
    onChange(next);
  };
  const reorder = (from: number, to: number) => {
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  };

  const addSpecLine = (itemId: string) =>
    updateItem(itemId, "specifications", [...(items.find((it) => it.id === itemId)?.specifications ?? []), { id: newScopeSpecLineId(), text: "" }]);
  const updateSpecLine = (itemId: string, specId: string, text: string) =>
    updateItem(itemId, "specifications", (items.find((it) => it.id === itemId)?.specifications ?? []).map((s) => (s.id === specId ? { ...s, text } : s)));
  const removeSpecLine = (itemId: string, specId: string) =>
    updateItem(itemId, "specifications", (items.find((it) => it.id === itemId)?.specifications ?? []).filter((s) => s.id !== specId));

  let runningNumber = 0;
  const itemNumbers = items.map((it) => (it.isSectionHeader ? null : ++runningNumber));

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden print:hidden">
      <div className="px-5 py-3.5 border-b border-border flex items-center justify-between bg-muted/30">
        <h2 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>รายการ Scope of Work</h2>
        {!disabled && (
          <div className="flex items-center gap-2">
            <button onClick={addSectionHeader} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all font-medium">
              <Plus size={12} /> เพิ่มหัวข้อ
            </button>
            <button onClick={addItem} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#c9a84c]/10 text-[#c9a84c] border border-[#c9a84c]/25 rounded-lg hover:bg-[#c9a84c]/20 transition-colors font-medium">
              <Plus size={12} /> เพิ่มรายการ
            </button>
          </div>
        )}
      </div>
      {noItemsError && <div className="px-5 pt-3"><FieldError message={noItemsError} /></div>}

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/20">
              {["ลำดับ", "ชื่อรายการ", "จำนวน", "หน่วย", ""].map((h, i) => (
                <th key={i} className={`px-4 py-2.5 text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider ${i === 0 ? "w-10 text-center" : i === 2 || i === 3 ? "w-24 text-right" : i === 4 ? "w-24" : "text-left"}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              if (item.isSectionHeader) {
                return (
                  <tr
                    key={item.id}
                    draggable={!disabled}
                    onDragStart={() => { dragIndex.current = idx; }}
                    onDragOver={(e) => { e.preventDefault(); setOverIndex(idx); }}
                    onDragEnd={() => { setOverIndex(null); dragIndex.current = null; }}
                    onDrop={(e) => { e.preventDefault(); if (dragIndex.current !== null && dragIndex.current !== idx) reorder(dragIndex.current, idx); setOverIndex(null); dragIndex.current = null; }}
                    className={`border-b border-border/50 bg-muted/20 group ${overIndex === idx ? "bg-[#c9a84c]/10" : ""}`}
                  >
                    <td className="px-4 py-2.5 text-center text-muted-foreground align-top cursor-grab"><GripVertical size={13} /></td>
                    <td colSpan={3} className="px-4 py-2.5 align-top">
                      <input
                        disabled={disabled}
                        className="w-full text-sm font-semibold text-foreground bg-transparent border-0 outline-none focus:bg-secondary rounded px-1 py-0.5 transition-colors disabled:opacity-60"
                        value={item.name}
                        onChange={(e) => updateItem(item.id, "name", e.target.value)}
                        placeholder="ชื่อหัวข้อ"
                      />
                    </td>
                    <td className="px-4 py-2.5 align-top">
                      {!disabled && (
                        <div className="flex items-center justify-end gap-1">
                          {/* Keyboard/touch alternative to the drag handle — native HTML5 drag
                              events have no keyboard equivalent, so whole-row reordering was
                              previously mouse-only. */}
                          <button onClick={() => reorder(idx, idx - 1)} disabled={idx === 0} title="ย้ายขึ้น" aria-label="ย้ายขึ้น" className="text-muted-foreground hover:text-[#c9a84c] transition-colors opacity-50 group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-20 disabled:pointer-events-none"><ChevronUp size={13} /></button>
                          <button onClick={() => reorder(idx, idx + 1)} disabled={idx === items.length - 1} title="ย้ายลง" aria-label="ย้ายลง" className="text-muted-foreground hover:text-[#c9a84c] transition-colors opacity-50 group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-20 disabled:pointer-events-none"><ChevronDown size={13} /></button>
                          <button onClick={() => removeItem(item.id)} title="ลบ" aria-label="ลบ" className="text-muted-foreground hover:text-[#e05252] transition-colors opacity-50 group-hover:opacity-100 focus-visible:opacity-100"><Trash2 size={13} /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              }

              const isExpanded = expanded.has(item.id);
              const hasSpecs = item.specifications.some((s) => s.text.trim()) || item.remark.trim();
              const itemError = itemErrors?.[item.id];
              return (
                <Fragment key={item.id}>
                  <tr
                    draggable={!disabled}
                    onDragStart={() => { dragIndex.current = idx; }}
                    onDragOver={(e) => { e.preventDefault(); setOverIndex(idx); }}
                    onDragEnd={() => { setOverIndex(null); dragIndex.current = null; }}
                    onDrop={(e) => { e.preventDefault(); if (dragIndex.current !== null && dragIndex.current !== idx) reorder(dragIndex.current, idx); setOverIndex(null); dragIndex.current = null; }}
                    className={`border-b border-border/50 hover:bg-secondary/30 transition-colors group ${overIndex === idx ? "bg-[#c9a84c]/10" : itemError ? "bg-[#e05252]/5" : ""}`}
                  >
                    <td className="px-4 py-3 text-center text-xs font-mono text-muted-foreground align-top cursor-grab flex items-center justify-center gap-1">
                      <GripVertical size={12} className="text-muted-foreground/60" /> {itemNumbers[idx]}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <input disabled={disabled} className="w-full text-sm text-foreground bg-transparent border-0 outline-none focus:bg-secondary rounded px-1 py-0.5 transition-colors disabled:opacity-60" value={item.name} onChange={(e) => updateItem(item.id, "name", e.target.value)} placeholder="ชื่อรายการ" />
                      <FieldError message={itemError} />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <input disabled={disabled} type="number" className="w-20 text-xs text-right text-foreground bg-transparent border-0 outline-none focus:bg-secondary rounded px-1 py-0.5 transition-colors disabled:opacity-60" value={item.quantity ?? ""} onChange={(e) => updateItem(item.id, "quantity", e.target.value === "" ? null : parseFloat(e.target.value) || 0)} min={0} />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <input disabled={disabled} className="w-20 text-xs text-right text-foreground bg-transparent border-0 outline-none focus:bg-secondary rounded px-1 py-0.5 transition-colors disabled:opacity-60" value={item.unit} onChange={(e) => updateItem(item.id, "unit", e.target.value)} />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => toggleExpand(item.id)}
                          title="รายละเอียด/ข้อกำหนด"
                          aria-label="รายละเอียด/ข้อกำหนด"
                          className={`transition-colors relative ${hasSpecs ? "text-[#c9a84c]" : "text-muted-foreground opacity-50 group-hover:opacity-100 focus-visible:opacity-100"} hover:text-[#c9a84c]`}
                        >
                          <StickyNote size={13} />
                          {hasSpecs && !isExpanded && <span className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-[#c9a84c]" />}
                        </button>
                        {!disabled && (
                          <>
                            {/* Keyboard/touch alternative to the drag handle — native HTML5 drag
                                events have no keyboard equivalent, so whole-row reordering was
                                previously mouse-only. */}
                            <button onClick={() => reorder(idx, idx - 1)} disabled={idx === 0} title="ย้ายขึ้น" aria-label="ย้ายขึ้น" className="text-muted-foreground hover:text-[#c9a84c] transition-colors opacity-50 group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-20 disabled:pointer-events-none"><ChevronUp size={13} /></button>
                            <button onClick={() => reorder(idx, idx + 1)} disabled={idx === items.length - 1} title="ย้ายลง" aria-label="ย้ายลง" className="text-muted-foreground hover:text-[#c9a84c] transition-colors opacity-50 group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-20 disabled:pointer-events-none"><ChevronDown size={13} /></button>
                            <button onClick={() => duplicateItem(item.id)} title="ทำสำเนารายการ" aria-label="ทำสำเนารายการ" className="text-muted-foreground hover:text-foreground transition-colors opacity-50 group-hover:opacity-100 focus-visible:opacity-100"><Copy size={13} /></button>
                            <button onClick={() => removeItem(item.id)} title="ลบ" aria-label="ลบ" className="text-muted-foreground hover:text-[#e05252] transition-colors opacity-50 group-hover:opacity-100 focus-visible:opacity-100"><Trash2 size={13} /></button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>

                  {isExpanded && (
                    <tr className="border-b border-border/50 bg-muted/10">
                      <td />
                      <td colSpan={4} className="px-4 pb-4 pt-1">
                        <div className="bg-card border border-border rounded-lg p-4 space-y-3">
                          <div>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1.5">ข้อกำหนด / รายละเอียดย่อย (แสดงเป็นบรรทัดย่อหน้าใต้ชื่อรายการ)</p>
                            <div className="space-y-1">
                              {item.specifications.map((sl) => (
                                <div key={sl.id} className="flex items-center gap-1.5">
                                  <input
                                    disabled={disabled}
                                    value={sl.text}
                                    onChange={(e) => updateSpecLine(item.id, sl.id, e.target.value)}
                                    placeholder="เช่น พื้นที่ : กว้าง 5 เมตร x ยาว 20 เมตร"
                                    className="flex-1 text-xs text-foreground bg-secondary border border-border rounded-lg px-2.5 py-1.5 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60"
                                  />
                                  {!disabled && (
                                    <button onClick={() => removeSpecLine(item.id, sl.id)} title="ลบ" aria-label="ลบ" className="text-muted-foreground hover:text-[#e05252] transition-colors flex-shrink-0 p-1"><Trash2 size={12} /></button>
                                  )}
                                </div>
                              ))}
                            </div>
                            {!disabled && (
                              <button onClick={() => addSpecLine(item.id)} className="flex items-center gap-1.5 mt-2 px-2.5 py-1.5 text-[11px] bg-[#c9a84c]/10 text-[#c9a84c] border border-[#c9a84c]/25 rounded-lg hover:bg-[#c9a84c]/20 transition-colors font-medium">
                                <Plus size={11} /> เพิ่มข้อกำหนด
                              </button>
                            )}
                          </div>
                          <div>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1.5">หมายเหตุรายการ</p>
                            <textarea
                              disabled={disabled}
                              rows={2}
                              value={item.remark}
                              onChange={(e) => updateItem(item.id, "remark", e.target.value)}
                              className="w-full text-xs text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors resize-none leading-relaxed disabled:opacity-60"
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <EmptyState icon={ClipboardList} title="ยังไม่มีรายการ Scope of Work" description="เพิ่มรายการด้วยปุ่ม “เพิ่มรายการ” ด้านบน" compact />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
