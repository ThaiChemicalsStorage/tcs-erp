import { Fragment, useEffect, useState } from "react";
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
    quantity: null, unit: "", specifications: [], subDetails: [], editableParameters: [],
    internalNotes: [], visibleToCustomer: true, sortOrder,
  };
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

/** Multi-line-textarea <-> string[] helper — every free-text list field (specifications,
 * subDetails, internalNotes, template-level internalNotes) edits as one line-per-entry textarea
 * rather than N separate add/remove rows, matching how an admin would naturally paste/type a list
 * of scope lines. Blank lines are dropped on blur/save (see the server's own `sanitizeStringArray`,
 * mirrored here so the on-screen count doesn't visibly disagree with what gets saved). */
function linesToArray(text: string): string[] {
  return text.split("\n").map((s) => s.trim()).filter(Boolean);
}

/**
 * Template Management create/edit form (added 2026-07-15, restyled 2026-07-21 to mirror the real
 * quotation document's look — navy/gold header band, meta grid, table-style line items — so editing
 * a template reads like a preview of the document it produces rather than a generic settings form).
 * Sections/items CRUD, reorder (up/down — no drag-and-drop dependency in this codebase), "select
 * existing product" vs "add custom item," specifications/sub-details/editable parameters/internal
 * notes per item, and payment/warranty/tax default terms. See
 * docs/MODULES/QuotationTemplates.md "Template Management Module — Editor."
 */
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

  useEffect(() => {
    if (!templateId) return;
    let cancelled = false;
    fetchQuotationTemplate(templateId)
      .then((full) => {
        if (cancelled) return;
        setDraft({
          templateCode: full.templateCode, templateName: full.templateName, jobTypeCode: full.jobTypeCode,
          jobTypeName: full.jobTypeName, description: full.description, version: full.version,
          sections: full.sections, defaultTerms: full.defaultTerms, internalNotes: full.internalNotes,
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
  const duplicateItemInSection = (sectionId: string, item: TemplateItem) => updateSection(sectionId, (s) => {
    const idx = s.items.findIndex((it) => it.id === item.id);
    const copy: TemplateItem = { ...item, id: newId(), name: `${item.name} (Copy)` };
    const items = [...s.items];
    items.splice(idx + 1, 0, copy);
    return { ...s, items: items.map((it, i) => ({ ...it, sortOrder: i })) };
  });
  const moveItem = (sectionId: string, index: number, dir: -1 | 1) => {
    updateSection(sectionId, (s) => {
      const arr = [...s.items];
      const j = index + dir;
      if (j < 0 || j >= arr.length) return s;
      [arr[index], arr[j]] = [arr[j], arr[index]];
      return { ...s, items: arr.map((it, i) => ({ ...it, sortOrder: i })) };
    });
  };

  const addProductItem = (sectionId: string, product: Product) => {
    addItem(sectionId, {
      ...emptyItem(0),
      name: product.name,
      description: product.name,
      unit: product.unit,
      specifications: product.specifications ? [product.specifications] : [],
      productId: product.id,
      productSnapshot: { code: product.code, name: product.name, unit: product.unit, defaultPrice: product.defaultPrice },
    });
    setProductPickerFor(null);
  };

  const addTerm = (type: TemplateTermLine["type"]) => setDraft((d) => ({ ...d, defaultTerms: [...d.defaultTerms, { type, text: "" }] }));
  const updateTermText = (index: number, text: string) => setDraft((d) => ({ ...d, defaultTerms: d.defaultTerms.map((term, i) => (i === index ? { ...term, text } : term)) }));
  const deleteTerm = (index: number) => setDraft((d) => ({ ...d, defaultTerms: d.defaultTerms.filter((_, i) => i !== index) }));

  const handleSave = async () => {
    if (!draft.templateCode.trim()) { setError(t("templates.form.error.code")); return; }
    if (!draft.templateName.trim()) { setError(t("templates.form.error.name")); return; }
    if (!draft.jobTypeCode.trim()) { setError(t("templates.form.error.jobType")); return; }
    setError("");
    setSaving(true);
    // A plain `:edit` holder (no `:activate`) must never have this save silently flip active
    // status — the server enforces this too (see `handleOne`'s `touchesActive`), this is just the
    // client staying in sync with what it's actually allowed to submit.
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
    return <div className="flex-1 flex items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" /> {t("common.loading")}</div>;
  }

  const termsOfType = (type: TemplateTermLine["type"]) => draft.defaultTerms.map((term, i) => ({ term, i })).filter(({ term }) => term.type === type);
  const termLabel = (type: TemplateTermLine["type"]) => (type === "paymentTerm" ? t("templates.preview.paymentTerms") : type === "warrantyTerm" ? t("templates.preview.warrantyTerms") : t("templates.preview.taxNotes"));

  return (
    <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-5 max-w-5xl mx-auto w-full">
      <button onClick={onCancel} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ChevronLeft size={14} /> {t("quotation.wizard.back")}
      </button>

      {/* Document header band + meta grid — mirrors QuoteDocument's header so editing a template
          reads like a preview of the quotation it will generate. */}
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
                <label className="text-xs text-muted-foreground block mb-1">{t("templates.col.code")} <span className="text-[#e05252]">*</span></label>
                <input value={draft.templateCode} onChange={(e) => setDraft((d) => ({ ...d, templateCode: e.target.value.toUpperCase() }))} className="w-full text-sm font-mono text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">{t("templates.col.name")} <span className="text-[#e05252]">*</span></label>
                <input value={draft.templateName} onChange={(e) => setDraft((d) => ({ ...d, templateName: e.target.value }))} className="w-full text-sm font-medium text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">{t("templates.form.description")}</label>
                <textarea value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} rows={3} className="w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors resize-y" />
              </div>
            </div>
          </div>
          <div className="p-6">
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-1.5"><Settings2 size={10} /> {t("templates.form.settingsSection")}</p>
            <div className="space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">{t("templates.col.jobType")} <span className="text-[#e05252]">*</span></label>
                  <select
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
                  <label className="text-xs text-muted-foreground block mb-1">{t("templates.col.version")}</label>
                  <input value={draft.version} onChange={(e) => setDraft((d) => ({ ...d, version: e.target.value }))} className="w-full text-sm font-mono text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors" />
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

      {/* Sections + items — styled like LineItemsEditor's table so this reads as a preview of the
          quotation's line-item table rather than a generic list of form rows. */}
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
                <button onClick={() => moveSection(sIdx, -1)} disabled={sIdx === 0} className="p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"><ArrowUp size={14} /></button>
                <button onClick={() => moveSection(sIdx, 1)} disabled={sIdx === draft.sections.length - 1} className="p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"><ArrowDown size={14} /></button>
                <button onClick={() => deleteSection(section.id)} className="p-1.5 text-muted-foreground hover:text-[#e05252] transition-colors"><Trash2 size={14} /></button>
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

      {/* Terms — three columns to mirror the printed quotation's payment/warranty/tax layout. */}
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
                    <button onClick={() => deleteTerm(i)} className="p-1 text-muted-foreground hover:text-[#e05252] transition-colors"><Trash2 size={13} /></button>
                  </div>
                ))}
                {termsOfType(type).length === 0 && <p className="text-[11px] text-muted-foreground/70">—</p>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5">
        <label className="text-xs font-semibold text-foreground mb-1 flex items-center gap-1.5" style={SERIF}>
          <StickyNote size={13} className="text-[#e08a3c]" /> {t("templates.form.internalNotes")}
        </label>
        <p className="text-[11px] text-muted-foreground mb-1.5">{t("templates.form.internalNotesHint")}</p>
        <textarea
          value={draft.internalNotes.join("\n")}
          onChange={(e) => setDraft((d) => ({ ...d, internalNotes: linesToArray(e.target.value) }))}
          rows={3}
          className="w-full text-xs text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors resize-y"
        />
      </div>

      {error && <p className="text-xs text-[#e05252]">{error}</p>}

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

  const updateParam = (paramIndex: number, field: "label" | "unit", value: string) => {
    onChange((it) => ({ ...it, editableParameters: it.editableParameters.map((p, i) => (i === paramIndex ? { ...p, [field]: value } : p)) }));
  };
  const addParam = () => onChange((it) => ({ ...it, editableParameters: [...it.editableParameters, { label: "", value: "", unit: "", editable: true }] }));
  const deleteParam = (paramIndex: number) => onChange((it) => ({ ...it, editableParameters: it.editableParameters.filter((_, i) => i !== paramIndex) }));

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
              className={`p-1 transition-colors ${item.subDetails.some((s) => s.trim()) ? "text-[#c9a84c]" : "text-muted-foreground hover:text-[#c9a84c]"}`}
            >
              <Pin size={12} />
            </button>
            <button onClick={onMoveUp} disabled={!canMoveUp} className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"><ArrowUp size={12} /></button>
            <button onClick={onMoveDown} disabled={!canMoveDown} className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"><ArrowDown size={12} /></button>
            <button onClick={onDuplicate} className="p-1 text-muted-foreground hover:text-foreground transition-colors"><Copy size={12} /></button>
            <button onClick={onDelete} className="p-1 text-muted-foreground hover:text-[#e05252] transition-colors"><X size={12} /></button>
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
              <button onClick={() => removeSubDetail(subIndex)} className="text-muted-foreground hover:text-[#e05252] transition-colors opacity-0 group-hover/pin:opacity-100 flex-shrink-0">
                <Trash2 size={11} />
              </button>
            </div>
          </td>
        </tr>
      ))}

      <tr className="border-b border-border/50 bg-muted/10">
        <td colSpan={6} className="px-4 py-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-widest block mb-1">{t("templates.form.specifications")}</label>
              <textarea
                value={item.specifications.join("\n")}
                onChange={(e) => onChange((it) => ({ ...it, specifications: linesToArray(e.target.value) }))}
                rows={2}
                className="w-full text-[11px] text-foreground bg-card border border-border rounded px-2 py-1.5 outline-none focus:border-[#c9a84c]/50 transition-colors resize-y"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] text-muted-foreground uppercase tracking-widest">{t("templates.form.editableParameters")}</label>
                <button onClick={addParam} className="text-[10px] text-[#c9a84c] hover:text-[#f0c040] transition-colors">+ {t("common.add")}</button>
              </div>
              <div className="space-y-1">
                {item.editableParameters.map((p, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <input value={p.label} onChange={(e) => updateParam(i, "label", e.target.value)} placeholder={t("templates.form.paramLabel")} className="flex-1 text-[11px] text-foreground bg-card border border-border rounded px-2 py-1 outline-none focus:border-[#c9a84c]/50 transition-colors" />
                    <input value={p.unit} onChange={(e) => updateParam(i, "unit", e.target.value)} placeholder={t("templates.form.unit")} className="w-20 text-[11px] text-foreground bg-card border border-border rounded px-2 py-1 outline-none focus:border-[#c9a84c]/50 transition-colors" />
                    <button onClick={() => deleteParam(i)} className="p-0.5 text-muted-foreground hover:text-[#e05252] transition-colors"><X size={11} /></button>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-widest block mb-1">{t("templates.form.itemInternalNotes")}</label>
              <textarea
                value={item.internalNotes.join("\n")}
                onChange={(e) => onChange((it) => ({ ...it, internalNotes: linesToArray(e.target.value) }))}
                rows={2}
                className="w-full text-[11px] text-foreground bg-card border border-[#e08a3c]/40 rounded px-2 py-1.5 outline-none focus:border-[#e08a3c]/60 transition-colors resize-y"
              />
            </div>
          </div>
          <label className="flex items-center gap-1.5 cursor-pointer select-none text-[11px] text-foreground mt-2.5">
            <input type="checkbox" checked={item.visibleToCustomer} onChange={(e) => onChange((it) => ({ ...it, visibleToCustomer: e.target.checked }))} className="w-3.5 h-3.5 rounded border-border accent-[#c9a84c]" />
            {t("templates.form.visibleToCustomer")}
          </label>
        </td>
      </tr>
    </Fragment>
  );
}
