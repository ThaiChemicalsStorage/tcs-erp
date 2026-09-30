import { Fragment, useEffect, useId, useState, type ReactNode } from "react";
import {
  Plus, Trash2, ArrowUp, ArrowDown, Copy, Package, PencilLine, Loader2, X, StickyNote, Pin, AlertCircle, ChevronDown,
} from "lucide-react";
import {
  type TemplateContentDraft, type TemplateSection, type TemplateItem, type TemplateTermLine,
  fetchQuotationTemplate, createQuotationTemplate, updateQuotationTemplate,
} from "../../lib/quotationTemplates";
import type { JobType } from "../../lib/jobTypes";
import type { Product, ProductCategory } from "../../lib/products";
import { DocumentHeader, RailCard } from "../../components/ui/DocumentLayout";
import { SectionCard } from "../../components/ui/SectionCard";
import { Field, ReadonlyField } from "../../components/ui/Field";
import { btn, field, surface, table } from "../../components/ui/styles";
import { StatusBadge } from "../../components/StatusBadge";
import { useI18n } from "../../lib/i18n";
import { TemplateProductPicker } from "./TemplateProductPicker";

function newId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function emptyItem(sortOrder: number): TemplateItem {
  return {
    id: newId(), itemType: "item", itemCode: String(sortOrder + 1), name: "", description: "",
    quantity: null, unit: "", subDetails: [], sortOrder,
  };
}

// ย้ายข้อมูล specifications แบบเก่าเข้าไปรวมกับ subDetails ของแต่ละรายการ
// Migrates legacy per-item specifications into the subDetails field.
function migrateLegacySpecifications(sections: TemplateSection[]): TemplateSection[] {
  return sections.map((sec) => ({
    ...sec,
    items: sec.items.map((it) => {
      const raw = (it as unknown as { specifications?: unknown }).specifications;
      const legacySpecs = Array.isArray(raw) ? raw.filter((s): s is string => typeof s === "string" && s.trim() !== "") : [];
      return legacySpecs.length === 0 ? it : { ...it, subDetails: [...legacySpecs, ...it.subDetails] };
    }),
  }));
}
function emptySection(sortOrder: number): TemplateSection {
  return { id: newId(), title: "", description: "", sortOrder, items: [] };
}
function emptyDraft(jobTypeCode: string, jobTypeName: string): TemplateContentDraft {
  return {
    templateCode: "", templateName: "", jobTypeCode, jobTypeName, description: "", version: "1.0",
    sections: [], defaultTerms: [], internalNotes: [], isActive: false,
  };
}

// แปลงข้อความหลายบรรทัดเป็นอาร์เรย์ของบรรทัด โดยตัดบรรทัดว่างออก
// Converts multi-line text into an array of non-empty trimmed lines.
function linesToArray(text: string): string[] {
  return text.split("\n").map((s) => s.trim()).filter(Boolean);
}

/** select หน้าตาช่องกรอกแบบใหม่ + ลูกศรชี้ลง (ชุด UI กลางยังไม่มี) */
function SelectBox({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <span className={`relative block ${className}`}>
      {children}
      <ChevronDown size={16} aria-hidden="true" className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground" />
    </span>
  );
}

// หน้าสร้าง/แก้ไข Template ใบเสนอราคา (หน้าเอกสารแบบใหม่ 2026-09-30) — ปุ่มยกเลิก/บันทึกอยู่บนแถบหัวที่เดียว
// Create/edit page for quotation templates, managing sections, items, and default terms.
export function TemplateEditorView({
  templateId,
  jobTypes,
  products,
  categories,
  canActivate,
  initialJobTypeCode,
  onSaved,
  onCancel,
}: {
  templateId: string | null;
  jobTypes: JobType[];
  products: Product[];
  categories: ProductCategory[];
  canActivate: boolean;
  initialJobTypeCode: string | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(!!templateId);
  const [draft, setDraft] = useState<TemplateContentDraft>(() => {
    const jt = initialJobTypeCode ? jobTypes.find((j) => j.code === initialJobTypeCode) : null;
    return emptyDraft(jt?.code ?? "", jt?.name ?? "");
  });
  const [originalActive, setOriginalActive] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [productPickerFor, setProductPickerFor] = useState<string | null>(null);
  const codeId = useId();
  const nameId = useId();
  const descriptionId = useId();
  const jobTypeId = useId();
  const versionId = useId();
  const internalNotesId = useId();
  const internalNotesHintId = useId();

  useEffect(() => {
    if (!templateId) return;
    let cancelled = false;
    fetchQuotationTemplate(templateId)
      .then((full) => {
        if (cancelled) return;
        setDraft({
          templateCode: full.templateCode, templateName: full.templateName, jobTypeCode: full.jobTypeCode,
          jobTypeName: full.jobTypeName, description: full.description, version: full.version,
          sections: migrateLegacySpecifications(full.sections), defaultTerms: full.defaultTerms, internalNotes: full.internalNotes,
          isActive: full.isActive,
        });
        setOriginalActive(full.isActive);
      })
      .catch(() => setError(t("templates.saveError")))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [templateId, t]);

  const updateSection = (sectionId: string, fn: (s: TemplateSection) => TemplateSection) => {
    setDraft((d) => ({ ...d, sections: d.sections.map((s) => (s.id === sectionId ? fn(s) : s)) }));
  };
  const updateItem = (sectionId: string, itemId: string, fn: (it: TemplateItem) => TemplateItem) => {
    updateSection(sectionId, (s) => ({ ...s, items: s.items.map((it) => (it.id === itemId ? fn(it) : it)) }));
  };
  const addSection = () => setDraft((d) => ({ ...d, sections: [...d.sections, emptySection(d.sections.length)] }));
  const deleteSection = (sectionId: string) => setDraft((d) => ({ ...d, sections: d.sections.filter((s) => s.id !== sectionId).map((s, i) => ({ ...s, sortOrder: i })) }));
  // ย้ายลำดับหมวดหมู่ขึ้นหรือลง
  // Moves a section up or down in the order.
  const moveSection = (index: number, dir: -1 | 1) => {
    setDraft((d) => {
      const arr = [...d.sections];
      const j = index + dir;
      if (j < 0 || j >= arr.length) return d;
      [arr[index], arr[j]] = [arr[j], arr[index]];
      return { ...d, sections: arr.map((s, i) => ({ ...s, sortOrder: i })) };
    });
  };
  const addItem = (sectionId: string, item: TemplateItem) => updateSection(sectionId, (s) => ({ ...s, items: [...s.items, { ...item, sortOrder: s.items.length }] }));
  const deleteItem = (sectionId: string, itemId: string) => updateSection(sectionId, (s) => ({ ...s, items: s.items.filter((it) => it.id !== itemId).map((it, i) => ({ ...it, sortOrder: i })) }));
  // ทำสำเนารายการภายในหมวดหมู่เดิม
  // Duplicates an item within the same section.
  const duplicateItemInSection = (sectionId: string, item: TemplateItem) => updateSection(sectionId, (s) => {
    const idx = s.items.findIndex((it) => it.id === item.id);
    const copy: TemplateItem = { ...item, id: newId(), name: `${item.name} (Copy)` };
    const items = [...s.items];
    items.splice(idx + 1, 0, copy);
    return { ...s, items: items.map((it, i) => ({ ...it, sortOrder: i })) };
  });
  // ย้ายลำดับรายการขึ้นหรือลงภายในหมวดหมู่
  // Moves an item up or down within its section.
  const moveItem = (sectionId: string, index: number, dir: -1 | 1) => {
    updateSection(sectionId, (s) => {
      const arr = [...s.items];
      const j = index + dir;
      if (j < 0 || j >= arr.length) return s;
      [arr[index], arr[j]] = [arr[j], arr[index]];
      return { ...s, items: arr.map((it, i) => ({ ...it, sortOrder: i })) };
    });
  };

  // เพิ่มสินค้าที่ติ๊กเลือกไว้ต่อท้าย Section ตามลำดับที่เลือก
  // Appends the picked products to a section, in the order they were ticked.
  const addProductItems = (sectionId: string, picked: Product[]) => {
    updateSection(sectionId, (s) => ({
      ...s,
      items: [
        ...s.items,
        ...picked.map((product, k): TemplateItem => ({
          ...emptyItem(0),
          name: product.name,
          description: product.name,
          unit: product.unit,
          subDetails: product.specifications.trim() ? [product.specifications.trim()] : [],
          productId: product.id,
          productSnapshot: { code: product.code, name: product.name, unit: product.unit, defaultPrice: product.defaultPrice },
          sortOrder: s.items.length + k,
        })),
      ],
    }));
    setProductPickerFor(null);
  };

  const addTerm = (type: TemplateTermLine["type"]) => setDraft((d) => ({ ...d, defaultTerms: [...d.defaultTerms, { type, text: "" }] }));
  const updateTermText = (index: number, text: string) => setDraft((d) => ({ ...d, defaultTerms: d.defaultTerms.map((term, i) => (i === index ? { ...term, text } : term)) }));
  const deleteTerm = (index: number) => setDraft((d) => ({ ...d, defaultTerms: d.defaultTerms.filter((_, i) => i !== index) }));

  // ตรวจสอบข้อมูลและบันทึก Template (สร้างใหม่หรืออัปเดต)
  // Validates and saves the template draft (create or update).
  const handleSave = async () => {
    if (!draft.templateCode.trim()) { setError(t("templates.form.error.code")); return; }
    if (!draft.templateName.trim()) { setError(t("templates.form.error.name")); return; }
    if (!draft.jobTypeCode.trim()) { setError(t("templates.form.error.jobType")); return; }
    setError("");
    setSaving(true);
    const payload: TemplateContentDraft = canActivate ? draft : { ...draft, isActive: originalActive };
    try {
      if (templateId) await updateQuotationTemplate(templateId, payload);
      else await createQuotationTemplate(payload);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("templates.saveError"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div role="status" aria-live="polite" className="flex-1 flex items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" /> {t("common.loading")}</div>;
  }

  const termsOfType = (type: TemplateTermLine["type"]) => draft.defaultTerms.map((term, i) => ({ term, i })).filter(({ term }) => term.type === type);
  const termLabel = (type: TemplateTermLine["type"]) => (type === "paymentTerm" ? t("templates.preview.paymentTerms") : type === "warrantyTerm" ? t("templates.preview.warrantyTerms") : t("templates.preview.taxNotes"));
  const itemTotal = draft.sections.reduce((n, s) => n + s.items.length, 0);
  const countsLabel = t("templates.summary.counts").replace("{s}", String(draft.sections.length)).replace("{n}", String(itemTotal));
  const modeLabel = templateId ? t("templates.form.editTitle") : t("templates.form.createTitle");
  const pickerSection = productPickerFor ? draft.sections.findIndex((s) => s.id === productPickerFor) : -1;
  const shownActive = canActivate ? draft.isActive : originalActive;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <DocumentHeader
        backLabel={t("templates.editor.back")}
        onBack={onCancel}
        number={<span className="font-sans font-semibold tracking-normal">{draft.templateName.trim() || modeLabel}</span>}
        status={
          <>
            {draft.templateCode.trim() && (
              <span className="h-[26px] px-2 rounded-md bg-[#eef1f6] text-[#3d5173] text-[12.5px] font-medium font-mono inline-flex items-center">{draft.templateCode}</span>
            )}
            <StatusBadge status={shownActive ? "active" : "inactive"} label={shownActive ? t("common.status.active") : t("customers.status.inactive")} />
          </>
        }
        meta={<span>{modeLabel} · {countsLabel}</span>}
        actions={
          <>
            <button type="button" onClick={onCancel} disabled={saving} className={btn.secondary}>{t("common.cancel")}</button>
            <button type="button" onClick={() => void handleSave()} disabled={saving} className={`${btn.primary} min-w-[88px]`}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : t("templates.form.save")}
            </button>
          </>
        }
      >
        {error && (
          <p role="alert" className="-mt-1 pb-3 text-[13px] text-[#b93636] flex items-center gap-1.5">
            <AlertCircle size={14} className="flex-shrink-0" /> {error}
          </p>
        )}
      </DocumentHeader>

      <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col lg:flex-row gap-6 items-stretch">
            <SectionCard title={t("templates.form.templateInfo")} className="flex-1 min-w-0">
              <div className="grid grid-cols-1 sm:grid-cols-[280px_minmax(0,1fr)] gap-x-5 gap-y-[18px]">
                <Field label={t("templates.col.code")} htmlFor={codeId} required>
                  <input id={codeId} value={draft.templateCode} onChange={(e) => setDraft((d) => ({ ...d, templateCode: e.target.value.toUpperCase() }))} className={`${field.input} w-full font-mono`} />
                </Field>
                <Field label={t("templates.col.name")} htmlFor={nameId} required>
                  <input id={nameId} value={draft.templateName} onChange={(e) => setDraft((d) => ({ ...d, templateName: e.target.value }))} className={`${field.input} w-full`} />
                </Field>
                <Field label={t("templates.form.description")} htmlFor={descriptionId} className="sm:col-span-2">
                  <textarea id={descriptionId} value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} rows={3} className={`${field.textarea} w-full resize-y`} />
                </Field>
              </div>
            </SectionCard>

            <div className="w-full lg:w-80 flex-shrink-0 flex flex-col">
              <RailCard title={t("templates.form.settingsSection")}>
                <div className="flex flex-col gap-4">
                  <Field label={t("templates.col.jobType")} htmlFor={jobTypeId} required>
                    <SelectBox>
                      <select
                        id={jobTypeId}
                        value={draft.jobTypeCode}
                        onChange={(e) => {
                          const jt = jobTypes.find((j) => j.code === e.target.value);
                          setDraft((d) => ({ ...d, jobTypeCode: e.target.value, jobTypeName: jt?.name ?? d.jobTypeName }));
                        }}
                        className={`${field.input} w-full pr-9 appearance-none`}
                      >
                        <option value="">—</option>
                        {jobTypes.filter((jt) => jt.isActive).map((jt) => <option key={jt.id} value={jt.code}>{jt.code} — {jt.name}</option>)}
                      </select>
                    </SelectBox>
                  </Field>
                  <Field label={t("templates.col.version")} htmlFor={versionId}>
                    <input id={versionId} value={draft.version} onChange={(e) => setDraft((d) => ({ ...d, version: e.target.value }))} className={`${field.input} w-[120px] tabular-nums`} />
                  </Field>
                  {canActivate ? (
                    <label className="flex items-start gap-3 cursor-pointer select-none pt-1">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={draft.isActive}
                        onClick={() => setDraft((d) => ({ ...d, isActive: !d.isActive }))}
                        className={`relative mt-px w-10 h-[22px] rounded-full flex-shrink-0 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#1a5fb4]/40 ${draft.isActive ? "bg-[#0b1d3a]" : "bg-[#c3ccda]"}`}
                      >
                        <span className={`absolute top-[3px] w-4 h-4 rounded-full bg-white transition-[left] ${draft.isActive ? "left-[21px]" : "left-[3px]"}`} />
                      </button>
                      <span className="flex flex-col leading-snug">
                        <span className="text-sm font-medium text-foreground">{t("templates.form.active")}</span>
                        <span className={field.help}>{t("templates.form.activeHint")}</span>
                      </span>
                    </label>
                  ) : (
                    <ReadonlyField label={t("templates.form.statusReadOnly")} value={originalActive ? t("common.status.active") : t("customers.status.inactive")} />
                  )}
                </div>
              </RailCard>
            </div>
          </div>

          <div className="flex items-center gap-2.5 -mb-1.5 flex-wrap">
            <h2 className={surface.cardTitle}>{t("templates.form.sections")}</h2>
            <span className="flex-1 text-[13px] text-muted-foreground">{countsLabel}</span>
            <button type="button" onClick={addSection} className={btn.secondarySm}>
              <Plus size={15} /> {t("templates.form.addSection")}
            </button>
          </div>

          {draft.sections.length === 0 && (
            <div className={`${surface.card} py-10 px-6 text-center text-sm text-muted-foreground`}>{t("templates.form.noSections")}</div>
          )}

          {draft.sections.map((section, sIdx) => (
            <section key={section.id} className={surface.card}>
              <div className="px-4 sm:px-6 py-3 border-b border-[#eef1f6] bg-[#fbf7ea] rounded-t-xl flex items-center gap-2">
                <span className="w-9 flex-shrink-0 text-[13px] font-bold text-[#7d6420]">§{sIdx + 1}</span>
                <input
                  value={section.title}
                  onChange={(e) => updateSection(section.id, (s) => ({ ...s, title: e.target.value }))}
                  placeholder={t("templates.form.sectionTitlePlaceholder")}
                  aria-label={t("templates.form.sectionTitlePlaceholder")}
                  className={`${field.cell} flex-1 min-w-0 font-semibold`}
                />
                <button type="button" onClick={() => moveSection(sIdx, -1)} disabled={sIdx === 0} title={t("quotation.lineItems.moveUp")} aria-label={t("quotation.lineItems.moveUp")} className={btn.icon}><ArrowUp size={16} /></button>
                <button type="button" onClick={() => moveSection(sIdx, 1)} disabled={sIdx === draft.sections.length - 1} title={t("quotation.lineItems.moveDown")} aria-label={t("quotation.lineItems.moveDown")} className={btn.icon}><ArrowDown size={16} /></button>
                <button type="button" onClick={() => deleteSection(section.id)} title={t("common.delete")} aria-label={t("common.delete")} className={`${btn.icon} group`}><Trash2 size={16} className="group-hover:text-[#b93636]" /></button>
              </div>

              {section.items.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[780px] table-fixed">
                    <thead>
                      <tr className={table.head}>
                        <th className={`${table.th} w-16`}>{t("templates.form.col.no")}</th>
                        <th className={`${table.th} w-[150px]`}>{t("templates.form.col.type")}</th>
                        <th className={table.th}>{t("templates.form.col.name")}</th>
                        <th className={`${table.th} w-[96px] text-right`}>{t("templates.form.qty")}</th>
                        <th className={`${table.th} w-[110px]`}>{t("templates.form.unit")}</th>
                        <th className={`${table.th} w-[204px]`}><span className="sr-only">{t("ui.more")}</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {section.items.map((item, iIdx) => (
                        <ItemEditor
                          key={item.id}
                          index={iIdx}
                          item={item}
                          onChange={(fn) => updateItem(section.id, item.id, fn)}
                          onDelete={() => deleteItem(section.id, item.id)}
                          onDuplicate={() => duplicateItemInSection(section.id, item)}
                          onMoveUp={() => moveItem(section.id, iIdx, -1)}
                          onMoveDown={() => moveItem(section.id, iIdx, 1)}
                          canMoveUp={iIdx > 0}
                          canMoveDown={iIdx < section.items.length - 1}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="px-4 sm:px-6 py-2.5 flex items-center gap-5 flex-wrap">
                <button type="button" onClick={() => setProductPickerFor(section.id)} className={btn.text}>
                  <Package size={16} /> {t("templates.form.selectProduct")}
                </button>
                <button type="button" onClick={() => addItem(section.id, emptyItem(0))} className={btn.text}>
                  <PencilLine size={16} /> {t("templates.form.addCustomItem")}
                </button>
              </div>
            </section>
          ))}

          <SectionCard title={t("templates.preview.terms")} subtitle={t("templates.form.termsHint")}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {(["paymentTerm", "warrantyTerm", "taxNote"] as const).map((type) => (
                <div key={type} className="flex flex-col gap-2 min-w-0">
                  <span className={field.label}>{termLabel(type)}</span>
                  {termsOfType(type).map(({ term, i }) => (
                    <div key={i} className="flex items-center gap-1">
                      <input value={term.text} onChange={(e) => updateTermText(i, e.target.value)} aria-label={termLabel(type)} className={`${field.input} flex-1 min-w-0`} />
                      <button type="button" onClick={() => deleteTerm(i)} title={t("common.delete")} aria-label={t("common.delete")} className={`${btn.icon} group`}><Trash2 size={16} className="group-hover:text-[#b93636]" /></button>
                    </div>
                  ))}
                  <button type="button" onClick={() => addTerm(type)} className={`${btn.text} self-start`}>
                    <Plus size={16} /> {t("common.add")}
                  </button>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard
            title={t("templates.form.internalNotes")}
            actions={
              <span className="h-6 px-2 rounded-full bg-[#fdf3e0] text-[#8a5a00] text-xs font-semibold inline-flex items-center gap-1.5">
                <StickyNote size={12} /> {t("templates.form.internalOnly")}
              </span>
            }
          >
            <div className="flex flex-col gap-1.5">
              <p id={internalNotesHintId} className={field.help}>{t("templates.form.internalNotesHint")}</p>
              <textarea
                id={internalNotesId}
                aria-label={t("templates.form.internalNotes")}
                aria-describedby={internalNotesHintId}
                value={draft.internalNotes.join("\n")}
                onChange={(e) => setDraft((d) => ({ ...d, internalNotes: linesToArray(e.target.value) }))}
                rows={4}
                className={`${field.textarea} w-full resize-y`}
              />
            </div>
          </SectionCard>
        </div>
      </div>

      <TemplateProductPicker
        open={productPickerFor !== null && pickerSection >= 0}
        sectionLabel={pickerSection >= 0 ? `§${pickerSection + 1} ${draft.sections[pickerSection].title}`.trim() : ""}
        products={products}
        categories={categories}
        onConfirm={(picked) => { if (productPickerFor) addProductItems(productPickerFor, picked); }}
        onClose={() => setProductPickerFor(null)}
      />
    </div>
  );
}

// แถวแก้ไขรายการแต่ละอันในตาราง พร้อมช่องเพิ่ม sub-detail
// Row editor for a single template item, including sub-detail management.
function ItemEditor({
  index, item, onChange, onDelete, onDuplicate, onMoveUp, onMoveDown, canMoveUp, canMoveDown,
}: {
  index: number;
  item: TemplateItem;
  onChange: (fn: (it: TemplateItem) => TemplateItem) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const { t } = useI18n();
  const [pendingFocusIndex, setPendingFocusIndex] = useState<number | null>(null);

  const addSubDetail = () => {
    setPendingFocusIndex(item.subDetails.length);
    onChange((it) => ({ ...it, subDetails: [...it.subDetails, ""] }));
  };
  const updateSubDetail = (subIndex: number, text: string) =>
    onChange((it) => ({ ...it, subDetails: it.subDetails.map((s, i) => (i === subIndex ? text : s)) }));
  const removeSubDetail = (subIndex: number) =>
    onChange((it) => ({ ...it, subDetails: it.subDetails.filter((_, i) => i !== subIndex) }));

  const hasSubs = item.subDetails.length > 0;
  const td = "px-2 py-2 align-top last:pr-4 sm:last:pr-6";

  return (
    <Fragment>
      <tr className={hasSubs ? "" : "border-b border-[#eef1f6]"}>
        <td className="pl-4 sm:pl-6 pr-2 pt-4 pb-2 align-top text-[13px] text-muted-foreground tabular-nums">{index + 1}</td>
        <td className={td}>
          <SelectBox>
            <select
              value={item.itemType}
              onChange={(e) => onChange((it) => ({ ...it, itemType: e.target.value as TemplateItem["itemType"] }))}
              aria-label={t("templates.form.col.type")}
              className={`${field.cell} w-full pr-8 appearance-none`}
            >
              <option value="item">{t("templates.itemType.item")}</option>
              <option value="subItem">{t("templates.itemType.subItem")}</option>
              <option value="specification">{t("templates.itemType.specification")}</option>
            </select>
          </SelectBox>
        </td>
        <td className={td}>
          <input
            value={item.name}
            onChange={(e) => onChange((it) => ({ ...it, name: e.target.value, description: e.target.value }))}
            placeholder={t("templates.form.itemNamePlaceholder")}
            aria-label={t("templates.form.col.name")}
            className={`${field.cell} w-full`}
          />
          {item.productSnapshot && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1 pl-0.5 min-w-0">
              <Package size={12} className="flex-shrink-0" />
              <span className="font-mono text-[#3d5173]">{item.productSnapshot.code}</span>
              <span className="truncate">{item.productSnapshot.name}</span>
            </p>
          )}
        </td>
        <td className={td}>
          <input
            type="number"
            value={item.quantity ?? ""}
            onChange={(e) => onChange((it) => ({ ...it, quantity: e.target.value === "" ? null : Number(e.target.value) }))}
            placeholder="—"
            aria-label={t("templates.form.qty")}
            className={`${field.cell} w-full text-right tabular-nums`}
          />
        </td>
        <td className={td}>
          <input
            value={item.unit}
            onChange={(e) => onChange((it) => ({ ...it, unit: e.target.value }))}
            placeholder={t("templates.form.unit")}
            aria-label={t("templates.form.unit")}
            className={`${field.cell} w-full`}
          />
        </td>
        <td className={td}>
          <div className="flex items-center justify-end gap-0.5">
            <button
              type="button"
              onClick={addSubDetail}
              title={t("quotation.lineItems.addSubDetail")}
              aria-label={t("quotation.lineItems.addSubDetail")}
              className={btn.icon}
            >
              <Pin size={16} className={item.subDetails.some((s) => s.trim()) ? "text-[#1a5fb4]" : ""} />
            </button>
            <button type="button" onClick={onMoveUp} disabled={!canMoveUp} title={t("quotation.lineItems.moveUp")} aria-label={t("quotation.lineItems.moveUp")} className={btn.icon}><ArrowUp size={16} /></button>
            <button type="button" onClick={onMoveDown} disabled={!canMoveDown} title={t("quotation.lineItems.moveDown")} aria-label={t("quotation.lineItems.moveDown")} className={btn.icon}><ArrowDown size={16} /></button>
            <button type="button" onClick={onDuplicate} title={t("templates.action.duplicate")} aria-label={t("templates.action.duplicate")} className={btn.icon}><Copy size={16} /></button>
            <button type="button" onClick={onDelete} title={t("common.delete")} aria-label={t("common.delete")} className={`${btn.icon} group`}><X size={16} className="group-hover:text-[#b93636]" /></button>
          </div>
        </td>
      </tr>

      {item.subDetails.map((text, subIndex) => (
        <tr key={subIndex} className={subIndex === item.subDetails.length - 1 ? "border-b border-[#eef1f6]" : ""}>
          <td colSpan={2} />
          <td colSpan={4} className="pl-2 pr-4 sm:pr-6 pb-2.5">
            <div className="flex items-center gap-2">
              <Pin size={14} aria-hidden="true" className="text-[#a3aec2] flex-shrink-0" />
              <input
                autoFocus={subIndex === pendingFocusIndex}
                value={text}
                onChange={(e) => updateSubDetail(subIndex, e.target.value)}
                placeholder={t("quotation.lineItems.subDetailsPlaceholder")}
                aria-label={t("quotation.lineItems.subDetailsPlaceholder")}
                className={`${field.cell} flex-1 min-w-0`}
              />
              <button type="button" onClick={() => removeSubDetail(subIndex)} title={t("common.delete")} aria-label={t("common.delete")} className={`${btn.icon} group flex-shrink-0`}>
                <Trash2 size={16} className="group-hover:text-[#b93636]" />
              </button>
            </div>
          </td>
        </tr>
      ))}
    </Fragment>
  );
}
