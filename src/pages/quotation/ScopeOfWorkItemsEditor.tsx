import { Fragment, useRef, useState } from "react";
import { Plus, Trash2, Copy, GripVertical, StickyNote, ChevronUp, ChevronDown } from "lucide-react";
import { type ScopeOfWorkItem, newScopeItemId, newScopeSpecLineId, blankScopeOfWorkItem } from "../../lib/scopeOfWork";
import { FieldError } from "../../components/FieldError";
import { btn, field, surface, table } from "../../components/ui/styles";
import { useI18n } from "../../lib/i18n";

const iconBtn = "w-8 h-9 rounded-lg flex items-center justify-center text-[#8a97ad] hover:bg-[#f4f6fa] hover:text-foreground transition-colors disabled:opacity-30 disabled:pointer-events-none";
const iconBtnGold = iconBtn.replace("text-[#8a97ad]", "text-[#7d6420]");
const thRight = table.th.replace("text-left", "text-right");
const deleteBtn = "w-8 h-9 rounded-lg flex items-center justify-center text-[#8a97ad] hover:bg-[#fcebeb] hover:text-[#b93636] transition-colors";

// ตารางแก้ไขรายการ Scope of Work: เพิ่ม/ลบ/ทำสำเนา/จัดลำดับ และแก้ไขข้อกำหนดย่อย โดยไม่มีคอลัมน์ราคา
// Editable table for Scope of Work items: add/remove/duplicate/reorder and edit spec lines, with no pricing columns
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
  itemErrors?: Record<string, string>;
  noItemsError?: string;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const dragIndex = useRef<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  // เปิด/ปิดการแสดงรายละเอียดข้อกำหนดย่อยของรายการนั้น
  // Toggles the expanded specification-lines detail for a given item
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
  // ทำสำเนารายการพร้อมข้อกำหนดย่อย แล้ววางไว้ถัดจากรายการต้นฉบับ
  // Duplicates an item along with its spec lines, inserting the copy right after the original
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
  // ย้ายรายการจากตำแหน่งหนึ่งไปอีกตำแหน่งหนึ่งในรายการทั้งหมด
  // Moves an item from one index to another within the full list
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
  const itemCount = runningNumber;
  const sectionCount = items.length - itemCount;

  const dragProps = (idx: number) => ({
    draggable: !disabled,
    onDragStart: () => { dragIndex.current = idx; },
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setOverIndex(idx); },
    onDragEnd: () => { setOverIndex(null); dragIndex.current = null; },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      if (dragIndex.current !== null && dragIndex.current !== idx) reorder(dragIndex.current, idx);
      setOverIndex(null);
      dragIndex.current = null;
    },
  });

  // ปุ่มขึ้น/ลงคือทางจัดลำดับด้วยคีย์บอร์ด (ลากวางใช้เมาส์ได้อย่างเดียว) — ซ่อนไว้จนชี้หรือโฟกัสแถว
  const moveButtons = (idx: number) => (
    <>
      <button type="button" onClick={() => reorder(idx, idx - 1)} disabled={idx === 0} title={t("scopeOfWorkItems.moveUp")} aria-label={t("scopeOfWorkItems.moveUp")} className={`${iconBtn} opacity-0 group-hover:opacity-100 focus-visible:opacity-100`}><ChevronUp size={15} /></button>
      <button type="button" onClick={() => reorder(idx, idx + 1)} disabled={idx === items.length - 1} title={t("scopeOfWorkItems.moveDown")} aria-label={t("scopeOfWorkItems.moveDown")} className={`${iconBtn} opacity-0 group-hover:opacity-100 focus-visible:opacity-100`}><ChevronDown size={15} /></button>
    </>
  );

  return (
    <section className={`${surface.card} print:hidden`}>
      <div className={surface.cardHead}>
        <h2 className={surface.cardTitle}>{t("scopeOfWorkItems.title")}</h2>
        <span className="flex-1 text-[13px] text-muted-foreground">
          {t("scopeOfWorkItems.count").replace("{items}", String(itemCount)).replace("{sections}", String(sectionCount))}
        </span>
        {!disabled && (
          <button type="button" onClick={addSectionHeader} className={btn.secondarySm}>
            <Plus size={15} /> {t("scopeOfWorkItems.addSection")}
          </button>
        )}
      </div>
      {noItemsError && <div className="px-6 pt-3"><FieldError message={noItemsError} /></div>}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className={table.head}>
              <th className={`${table.th} w-[76px]`}>#</th>
              <th className={table.th}>{t("scopeOfWorkItems.col.name")}</th>
              <th className={`${thRight} w-28`}>{t("scopeOfWorkItems.col.qty")}</th>
              <th className={`${table.th} w-28`}>{t("scopeOfWorkItems.col.unit")}</th>
              <th className={`${table.th} w-[184px]`} aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              if (item.isSectionHeader) {
                return (
                  <tr key={item.id} {...dragProps(idx)} className={`group border-b border-[#eef1f6] ${overIndex === idx ? "bg-[#e8f0fb]" : "bg-[#fbf7ea]"}`}>
                    <td className="pl-5 pr-3 py-2.5 align-middle">
                      <span className="flex items-center gap-2">
                        <GripVertical size={15} className={`text-[#a3aec2] ${disabled ? "" : "cursor-grab"}`} aria-hidden="true" />
                        <span className="text-xs font-bold text-[#7d6420]">§</span>
                      </span>
                    </td>
                    <td colSpan={3} className="px-3 py-2.5 align-middle">
                      <input
                        disabled={disabled}
                        aria-label={t("scopeOfWorkItems.sectionPlaceholder")}
                        className={`${field.cell} w-full font-semibold`}
                        value={item.name}
                        onChange={(e) => updateItem(item.id, "name", e.target.value)}
                        placeholder={t("scopeOfWorkItems.sectionPlaceholder")}
                      />
                    </td>
                    <td className="pl-3 pr-5 py-2.5 align-middle">
                      {!disabled && (
                        <div className="flex items-center justify-end gap-0.5">
                          {moveButtons(idx)}
                          <button type="button" onClick={() => removeItem(item.id)} title={t("scopeOfWorkItems.removeSection")} aria-label={t("scopeOfWorkItems.removeSection")} className={deleteBtn}><Trash2 size={15} /></button>
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
                  <tr {...dragProps(idx)} className={`group border-b border-[#eef1f6] transition-colors ${overIndex === idx ? "bg-[#e8f0fb]" : itemError ? "bg-[#fcebeb]/60" : "bg-white hover:bg-[#f8f9fc]"}`}>
                    <td className="pl-5 pr-3 py-2 align-top">
                      <span className="h-9 flex items-center gap-2">
                        <GripVertical size={15} className={`text-[#a3aec2] ${disabled ? "" : "cursor-grab"}`} aria-hidden="true" />
                        <span className="text-[13px] text-muted-foreground tabular-nums">{itemNumbers[idx]}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <input disabled={disabled} aria-label={t("scopeOfWorkItems.col.name")} className={`${field.cell} w-full`} value={item.name} onChange={(e) => updateItem(item.id, "name", e.target.value)} placeholder={t("scopeOfWorkItems.namePlaceholder")} />
                      <FieldError message={itemError} />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <input disabled={disabled} type="number" inputMode="decimal" aria-label={t("scopeOfWorkItems.col.qty")} className={`${field.cell} w-full text-right tabular-nums`} value={item.quantity ?? ""} onChange={(e) => updateItem(item.id, "quantity", e.target.value === "" ? null : parseFloat(e.target.value) || 0)} min={0} />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <input disabled={disabled} aria-label={t("scopeOfWorkItems.col.unit")} className={`${field.cell} w-full`} value={item.unit} onChange={(e) => updateItem(item.id, "unit", e.target.value)} />
                    </td>
                    <td className="pl-3 pr-5 py-2 align-top">
                      <div className="flex items-center justify-end gap-0.5">
                        {!disabled && moveButtons(idx)}
                        <button
                          type="button"
                          onClick={() => toggleExpand(item.id)}
                          title={t("scopeOfWorkItems.details")}
                          aria-label={t("scopeOfWorkItems.details")}
                          aria-expanded={isExpanded}
                          className={`${hasSpecs ? iconBtnGold : iconBtn} relative`}
                        >
                          <StickyNote size={15} />
                          {hasSpecs && !isExpanded && <span aria-hidden="true" className="absolute top-2 right-1.5 w-1.5 h-1.5 rounded-full bg-[#c9a84c]" />}
                        </button>
                        {!disabled && (
                          <>
                            <button type="button" onClick={() => duplicateItem(item.id)} title={t("scopeOfWorkItems.duplicate")} aria-label={t("scopeOfWorkItems.duplicate")} className={iconBtn}><Copy size={15} /></button>
                            <button type="button" onClick={() => removeItem(item.id)} title={t("scopeOfWorkItems.removeItem")} aria-label={t("scopeOfWorkItems.removeItem")} className={deleteBtn}><Trash2 size={15} /></button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>

                  {isExpanded && (
                    <tr className="border-b border-[#eef1f6] bg-[#f8f9fc]">
                      <td />
                      <td colSpan={4} className="pl-3 pr-5 pb-4 pt-2">
                        <div className="bg-card border border-border rounded-lg p-4 flex flex-col gap-4">
                          <div className="flex flex-col gap-1.5">
                            <p className={field.label}>{t("scopeOfWorkItems.specsLabel")}</p>
                            {item.specifications.map((sl) => (
                              <div key={sl.id} className="flex items-center gap-1.5">
                                <input
                                  disabled={disabled}
                                  value={sl.text}
                                  aria-label={t("scopeOfWorkItems.specsLabel")}
                                  onChange={(e) => updateSpecLine(item.id, sl.id, e.target.value)}
                                  placeholder={t("scopeOfWorkItems.specPlaceholder")}
                                  className={`${field.cell} flex-1 min-w-0`}
                                />
                                {!disabled && (
                                  <button type="button" onClick={() => removeSpecLine(item.id, sl.id)} title={t("scopeOfWorkItems.removeSpec")} aria-label={t("scopeOfWorkItems.removeSpec")} className={deleteBtn}><Trash2 size={14} /></button>
                                )}
                              </div>
                            ))}
                            {!disabled && (
                              <button type="button" onClick={() => addSpecLine(item.id)} className={`${btn.text} self-start`}>
                                <Plus size={15} /> {t("scopeOfWorkItems.addSpec")}
                              </button>
                            )}
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <label htmlFor={`sow-item-remark-${item.id}`} className={field.label}>{t("scopeOfWorkItems.remarkLabel")}</label>
                            <textarea
                              id={`sow-item-remark-${item.id}`}
                              disabled={disabled}
                              rows={2}
                              value={item.remark}
                              onChange={(e) => updateItem(item.id, "remark", e.target.value)}
                              className={`${field.textarea} w-full resize-y`}
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
                <td colSpan={5} className="py-12 px-6 text-center">
                  <p className="text-sm font-medium text-foreground">{t("scopeOfWorkItems.emptyTitle")}</p>
                  {!disabled && <p className="text-[13px] text-muted-foreground mt-1">{t("scopeOfWorkItems.emptyHint")}</p>}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {!disabled && (
        <div className="px-6 py-2.5">
          <button type="button" onClick={addItem} className={btn.text}>
            <Plus size={16} /> {t("scopeOfWorkItems.addItem")}
          </button>
        </div>
      )}
    </section>
  );
}
