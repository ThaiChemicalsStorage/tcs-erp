import { Fragment, useEffect, useId, useState } from "react";
import {
  ChevronLeft, Plus, Trash2, ArrowUp, ArrowDown, Copy, Package, PencilLine, Loader2, X,
  FileText, Settings2, Layers, ScrollText, StickyNote, CheckCircle2, Circle, Pin,
} from "lucide-react";
import {
  type TemplateContentDraft, type TemplateSection, type TemplateItem, type TemplateTermLine,
  fetchQuotationTemplate, createQuotationTemplate, updateQuotationTemplate,
} from "../../lib/quotationTemplates";
import type { JobType } from "../../lib/jobTypes";
import type { Product, ProductCategory } from "../../lib/products";
import { ProductPickerModal } from "../products/ProductPickerModal";
import { BrandMark } from "../../components/BrandMark";
import { useI18n } from "../../lib/i18n";

const SERIF = { fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" };

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

// ฟอร์มสร้าง/แก้ไข Template ใบเสนอราคา จัดการหมวดหมู่ รายการ และเงื่อนไขต่างๆ
// Create/edit form for quotation templates, managing sections, items, and default terms.
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

  // เพิ่มรายการจากสินค้าที่เลือกไว้ในหมวดหมู่
  // Adds an item to a section based on a selected product.
  const addProductItem = (sectionId: string, product: Product) => {
    addItem(sectionId, {
      ...emptyItem(0),
      name: product.name,
      description: product.name,
      unit: product.unit,
      subDetails: product.specifications.trim() ? [product.specifications.trim()] : [],
      productId: product.id,
      productSnapshot: { code: product.code, name: product.name, unit: product.unit, defaultPrice: product.defaultPrice },
    });
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

  return (
    <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-5 max-w-5xl mx-auto w-full">
      <button onClick={onCancel} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ChevronLeft size={14} /> {t("quotation.wizard.back")}
      </button>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="bg-[#0b1d3a] px-4 sm:px-7 py-5 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <BrandMark size={28} variant="full" theme="dark" />
            <p className="text-[#a8bed8] text-xs mt-2">{t("templates.pageTitle")}</p>
          </div>
          <div className="text-right">
            <p className="text-[#c9a84c] text-xl font-bold tracking-wide" style={SERIF}>
              {templateId ? t("templates.form.editTitle") : t("templates.form.createTitle")}
            </p>
            <p className="text-[#a8bed8] text-xs font-mono mt-1 tracking-widest">TEMPLATE</p>
            <div className={`mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${draft.isActive ? "bg-[#c9a84c]/20 text-[#c9a84c] border-[#c9a84c]/30" : "bg-white/5 text-[#a8bed8] border-white/10"}`}>
              {draft.isActive ? <CheckCircle2 size={12} /> : <Circle size={12} />}
              {draft.isActive ? t("common.status.active") : t("customers.status.inactive")}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 border-b border-border">
          <div className="p-6 border-b sm:border-b-0 sm:border-r border-border">
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-1.5"><FileText size={10} /> {t("templates.form.templateInfo")}</p>
            <div className="space-y-2.5">
              <div>
                <label htmlFor={codeId} className="text-xs text-muted-foreground block mb-1">{t("templates.col.code")} <span className="text-[#e05252]">*</span></label>
                <input id={codeId} value={draft.templateCode} onChange={(e) => setDraft((d) => ({ ...d, templateCode: e.target.value.toUpperCase() }))} className="w-full text-sm font-mono text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors" />
              </div>
              <div>
                <label htmlFor={nameId} className="text-xs text-muted-foreground block mb-1">{t("templates.col.name")} <span className="text-[#e05252]">*</span></label>
                <input id={nameId} value={draft.templateName} onChange={(e) => setDraft((d) => ({ ...d, templateName: e.target.value }))} className="w-full text-sm font-medium text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors" />
              </div>
              <div>
                <label htmlFor={descriptionId} className="text-xs text-muted-foreground block mb-1">{t("templates.form.description")}</label>
                <textarea id={descriptionId} value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} rows={3} className="w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors resize-y" />
              </div>
            </div>
          </div>
          <div className="p-6">
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-1.5"><Settings2 size={10} /> {t("templates.form.settingsSection")}</p>
            <div className="space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label htmlFor={jobTypeId} className="text-xs text-muted-foreground block mb-1">{t("templates.col.jobType")} <span className="text-[#e05252]">*</span></label>
                  <select
                    id={jobTypeId}
                    value={draft.jobTypeCode}
                    onChange={(e) => {
                      const jt = jobTypes.find((j) => j.code === e.target.value);
                      setDraft((d) => ({ ...d, jobTypeCode: e.target.value, jobTypeName: jt?.name ?? d.jobTypeName }));
                    }}
                    className="w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors appearance-none"
                  >
                    <option value="">—</option>
                    {jobTypes.filter((jt) => jt.isActive).map((jt) => <option key={jt.id} value={jt.code}>{jt.code} — {jt.name}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor={versionId} className="text-xs text-muted-foreground block mb-1">{t("templates.col.version")}</label>
                  <input id={versionId} value={draft.version} onChange={(e) => setDraft((d) => ({ ...d, version: e.target.value }))} className="w-full text-sm font-mono text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors" />
                </div>
              </div>
              <div className="pt-1">
                {canActivate ? (
                  <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-foreground">
                    <input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft((d) => ({ ...d, isActive: e.target.checked }))} className="w-4 h-4 rounded border-border accent-[#c9a84c]" />
                    {t("templates.form.active")}
                  </label>
                ) : (
                  <p className="text-xs text-muted-foreground">{t("templates.form.statusReadOnly")}: {originalActive ? t("common.status.active") : t("customers.status.inactive")}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border flex items-center justify-between bg-muted/30">
          <p className="text-sm font-semibold text-foreground flex items-center gap-2" style={SERIF}>
            <Layers size={14} className="text-[#c9a84c]" /> {t("templates.form.sections")}
          </p>
          <button onClick={addSection} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#c9a84c]/10 text-[#c9a84c] border border-[#c9a84c]/25 rounded-lg hover:bg-[#c9a84c]/20 transition-colors font-medium">
            <Plus size={12} /> {t("templates.form.addSection")}
          </button>
        </div>

        {draft.sections.length === 0 && <p className="text-xs text-muted-foreground py-8 text-center">{t("templates.form.noSections")}</p>}

        <div className="divide-y divide-border">
          {draft.sections.map((section, sIdx) => (
            <div key={section.id} className="p-4 space-y-3">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-mono text-muted-foreground w-6 text-center flex-shrink-0">§{sIdx + 1}</span>
                <input
                  value={section.title}
                  onChange={(e) => updateSection(section.id, (s) => ({ ...s, title: e.target.value }))}
                  placeholder={t("templates.form.sectionTitlePlaceholder")}
                  className="flex-1 text-sm font-semibold text-foreground bg-transparent border-0 outline-none focus:bg-secondary rounded px-2 py-1.5 transition-colors"
                  style={SERIF}
                />
                <button onClick={() => moveSection(sIdx, -1)} disabled={sIdx === 0} title={t("quotation.lineItems.moveUp")} aria-label={t("quotation.lineItems.moveUp")} className="p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"><ArrowUp size={14} /></button>
                <button onClick={() => moveSection(sIdx, 1)} disabled={sIdx === draft.sections.length - 1} title={t("quotation.lineItems.moveDown")} aria-label={t("quotation.lineItems.moveDown")} className="p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"><ArrowDown size={14} /></button>
                <button onClick={() => deleteSection(section.id)} title={t("common.delete")} aria-label={t("common.delete")} className="p-1.5 text-muted-foreground hover:text-[#e05252] transition-colors"><Trash2 size={14} /></button>
              </div>

              {section.items.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-muted/20">
                        <th className="px-3 py-2 text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider w-10 text-center">{t("templates.form.col.no")}</th>
                        <th className="px-2 py-2 text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider w-24 text-left">{t("templates.form.col.type")}</th>
                        <th className="px-2 py-2 text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider text-left">{t("templates.form.col.name")}</th>
                        <th className="px-2 py-2 text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider w-16 text-left">{t("templates.form.qty")}</th>
                        <th className="px-2 py-2 text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider w-16 text-left">{t("templates.form.unit")}</th>
                        <th className="px-2 py-2 w-32" />
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

              <div className="flex items-center gap-2">
                <button onClick={() => setProductPickerFor(section.id)} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
                  <Package size={12} /> {t("templates.form.selectProduct")}
                </button>
                <button onClick={() => addItem(section.id, emptyItem(0))} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
                  <PencilLine size={12} /> {t("templates.form.addCustomItem")}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border bg-muted/30">
          <p className="text-sm font-semibold text-foreground flex items-center gap-2" style={SERIF}>
            <ScrollText size={14} className="text-[#c9a84c]" /> {t("templates.preview.terms")}
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border">
          {(["paymentTerm", "warrantyTerm", "taxNote"] as const).map((type) => (
            <div key={type} className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">{termLabel(type)}</p>
                <button onClick={() => addTerm(type)} className="text-[11px] text-[#c9a84c] hover:text-[#f0c040] transition-colors">+ {t("common.add")}</button>
              </div>
              <div className="space-y-1.5">
                {termsOfType(type).map(({ term, i }) => (
                  <div key={i} className="flex items-center gap-2">
                    <input value={term.text} onChange={(e) => updateTermText(i, e.target.value)} className="flex-1 text-xs text-foreground bg-secondary border border-border rounded-lg px-3 py-1.5 outline-none focus:border-[#c9a84c]/50 transition-colors" />
                    <button onClick={() => deleteTerm(i)} title={t("common.delete")} aria-label={t("common.delete")} className="p-1 text-muted-foreground hover:text-[#e05252] transition-colors"><Trash2 size={13} /></button>
                  </div>
                ))}
                {termsOfType(type).length === 0 && <p className="text-[11px] text-muted-foreground/70">—</p>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5">
        <label htmlFor={internalNotesId} className="text-xs font-semibold text-foreground mb-1 flex items-center gap-1.5" style={SERIF}>
          <StickyNote size={13} className="text-[#e08a3c]" /> {t("templates.form.internalNotes")}
        </label>
        <p className="text-[11px] text-muted-foreground mb-1.5">{t("templates.form.internalNotesHint")}</p>
        <textarea
          id={internalNotesId}
          value={draft.internalNotes.join("\n")}
          onChange={(e) => setDraft((d) => ({ ...d, internalNotes: linesToArray(e.target.value) }))}
          rows={3}
          className="w-full text-xs text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors resize-y"
        />
      </div>

      {error && <p role="alert" className="text-xs text-[#e05252]">{error}</p>}

      <div className="flex items-center justify-end gap-2 pt-2 pb-6 border-t border-border">
        <button onClick={onCancel} className="px-4 py-2 text-sm border border-border rounded-lg text-muted-foreground hover:text-foreground transition-colors mt-3">{t("common.cancel")}</button>
        <button onClick={() => void handleSave()} disabled={saving} className="px-4 py-2 text-sm rounded-lg font-semibold bg-[#c9a84c] text-[#0b1d3a] hover:bg-[#f0c040] transition-colors disabled:opacity-60 mt-3">
          {saving ? <Loader2 size={14} className="animate-spin" /> : t("templates.form.save")}
        </button>
      </div>

      <ProductPickerModal
        open={productPickerFor !== null}
        products={products}
        categories={categories}
        onSelect={(product) => { if (productPickerFor) addProductItem(productPickerFor, product); }}
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

  return (
    <Fragment>
      <tr className="border-b border-border/50 hover:bg-secondary/30 transition-colors group">
        <td className="px-3 py-2.5 text-center text-xs font-mono text-muted-foreground align-top">{index + 1}</td>
        <td className="px-2 py-2.5 align-top">
          <select
            value={item.itemType}
            onChange={(e) => onChange((it) => ({ ...it, itemType: e.target.value as TemplateItem["itemType"] }))}
            className="w-full text-[11px] text-muted-foreground bg-transparent border border-border rounded px-1.5 py-1 outline-none appearance-none"
          >
            <option value="item">{t("templates.itemType.item")}</option>
            <option value="subItem">{t("templates.itemType.subItem")}</option>
            <option value="specification">{t("templates.itemType.specification")}</option>
          </select>
        </td>
        <td className="px-2 py-2.5 align-top">
          <input
            value={item.name}
            onChange={(e) => onChange((it) => ({ ...it, name: e.target.value, description: e.target.value }))}
            placeholder={t("templates.form.itemNamePlaceholder")}
            className="w-full min-w-[140px] text-sm text-foreground bg-transparent border-0 outline-none focus:bg-secondary rounded px-1.5 py-1 transition-colors"
          />
          {item.productSnapshot && (
            <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5"><Package size={10} /> {item.productSnapshot.code} — {item.productSnapshot.name}</p>
          )}
        </td>
        <td className="px-2 py-2.5 align-top">
          <input
            type="number"
            value={item.quantity ?? ""}
            onChange={(e) => onChange((it) => ({ ...it, quantity: e.target.value === "" ? null : Number(e.target.value) }))}
            placeholder="—"
            className="w-16 text-xs font-mono text-foreground bg-transparent border-0 outline-none focus:bg-secondary rounded px-1.5 py-1 transition-colors"
          />
        </td>
        <td className="px-2 py-2.5 align-top">
          <input
            value={item.unit}
            onChange={(e) => onChange((it) => ({ ...it, unit: e.target.value }))}
            placeholder={t("templates.form.unit")}
            className="w-16 text-xs text-foreground bg-transparent border-0 outline-none focus:bg-secondary rounded px-1.5 py-1 transition-colors"
          />
        </td>
        <td className="px-2 py-2.5 align-top">
          <div className="flex items-center justify-end gap-0.5">
            <button
              onClick={addSubDetail}
              title={t("quotation.lineItems.addSubDetail")}
              aria-label={t("quotation.lineItems.addSubDetail")}
              className={`p-1 transition-colors ${item.subDetails.some((s) => s.trim()) ? "text-[#c9a84c]" : "text-muted-foreground hover:text-[#c9a84c]"}`}
            >
              <Pin size={12} />
            </button>
            <button onClick={onMoveUp} disabled={!canMoveUp} title={t("quotation.lineItems.moveUp")} aria-label={t("quotation.lineItems.moveUp")} className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"><ArrowUp size={12} /></button>
            <button onClick={onMoveDown} disabled={!canMoveDown} title={t("quotation.lineItems.moveDown")} aria-label={t("quotation.lineItems.moveDown")} className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"><ArrowDown size={12} /></button>
            <button onClick={onDuplicate} title={t("templates.action.duplicate")} aria-label={t("templates.action.duplicate")} className="p-1 text-muted-foreground hover:text-foreground transition-colors"><Copy size={12} /></button>
            <button onClick={onDelete} title={t("common.delete")} aria-label={t("common.delete")} className="p-1 text-muted-foreground hover:text-[#e05252] transition-colors"><X size={12} /></button>
          </div>
        </td>
      </tr>

      {item.subDetails.map((text, subIndex) => (
        <tr key={subIndex} className="border-b border-border/50 bg-[#c9a84c]/10 group/pin">
          <td />
          <td colSpan={5} className="px-2 py-1.5">
            <div className="flex items-center gap-2">
              <Pin size={11} className="text-[#c9a84c]/70 flex-shrink-0" />
              <input
                autoFocus={subIndex === pendingFocusIndex}
                value={text}
                onChange={(e) => updateSubDetail(subIndex, e.target.value)}
                placeholder={t("quotation.lineItems.subDetailsPlaceholder")}
                className="flex-1 text-[11px] text-foreground bg-transparent border-0 outline-none placeholder:text-muted-foreground/50"
              />
              <button onClick={() => removeSubDetail(subIndex)} title={t("common.delete")} aria-label={t("common.delete")} className="text-muted-foreground hover:text-[#e05252] transition-colors opacity-50 group-hover/pin:opacity-100 group-focus-within/pin:opacity-100 flex-shrink-0">
                <Trash2 size={11} />
              </button>
            </div>
          </td>
        </tr>
      ))}
    </Fragment>
  );
}
