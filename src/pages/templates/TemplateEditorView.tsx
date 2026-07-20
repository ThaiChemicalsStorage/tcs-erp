import { useEffect, useState } from "react";
import {
  ChevronLeft, Plus, Trash2, ArrowUp, ArrowDown, Copy, Package, PencilLine, Loader2, X,
} from "lucide-react";
import {
  type TemplateContentDraft, type TemplateSection, type TemplateItem, type TemplateTermLine,
  type TemplateDynamicField, type TemplateFieldType, type TemplateFieldOption, type TemplateConditionConfig,
  fetchQuotationTemplate, createQuotationTemplate, updateQuotationTemplate,
} from "../../lib/quotationTemplates";
import type { JobType } from "../../lib/jobTypes";
import type { Product, ProductCategory } from "../../lib/products";
import { ProductPickerModal } from "../products/ProductPickerModal";
import { useI18n } from "../../lib/i18n";
import { backLinkButtonClass, secondaryButtonClass } from "../../lib/buttonStyles";

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
    sections: [], defaultTerms: [], internalNotes: [], defaultNotes: [], isActive: false,
  };
}
function newDynamicField(sortOrder: number): TemplateDynamicField {
  return { key: newId(), label: "", type: "text", sortOrder };
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
 * Template Management create/edit form (added 2026-07-15) — sections/items CRUD, reorder
 * (up/down — no drag-and-drop dependency in this codebase), "select existing product" vs "add
 * custom item," specifications/sub-details/editable parameters/internal notes per item, and
 * payment/warranty/tax default terms. See docs/MODULES/QuotationTemplates.md "Template Management
 * Module — Editor."
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
          defaultNotes: full.defaultNotes ?? [], conditions: full.conditions,
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

  const defaultNotes = draft.defaultNotes ?? [];
  const addDefaultNote = () => setDraft((d) => ({ ...d, defaultNotes: [...(d.defaultNotes ?? []), ""] }));
  const updateDefaultNote = (i: number, text: string) => setDraft((d) => ({ ...d, defaultNotes: (d.defaultNotes ?? []).map((n, idx) => (idx === i ? text : n)) }));
  const deleteDefaultNote = (i: number) => setDraft((d) => ({ ...d, defaultNotes: (d.defaultNotes ?? []).filter((_, idx) => idx !== i) }));

  const conditionsEnabled = !!draft.conditions;
  const toggleConditions = (enabled: boolean) => setDraft((d) => ({
    ...d,
    conditions: enabled ? { vatConditionText: "", warrantyUnit: "After Job Completed.", deliveryUnit: "Days After Received P/O", paymentPresets: [] } : undefined,
  }));
  const updateConditions = (fn: (c: TemplateConditionConfig) => TemplateConditionConfig) =>
    setDraft((d) => (d.conditions ? { ...d, conditions: fn(d.conditions) } : d));
  const addPaymentPreset = () => updateConditions((c) => ({ ...c, paymentPresets: [...c.paymentPresets, ""] }));
  const updatePaymentPreset = (i: number, text: string) => updateConditions((c) => ({ ...c, paymentPresets: c.paymentPresets.map((p, idx) => (idx === i ? text : p)) }));
  const deletePaymentPreset = (i: number) => updateConditions((c) => ({ ...c, paymentPresets: c.paymentPresets.filter((_, idx) => idx !== i) }));

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
    <div className="flex-1 overflow-y-auto p-6 space-y-5 max-w-4xl mx-auto w-full">
      <button onClick={onCancel} className={backLinkButtonClass()}>
        <ChevronLeft size={14} /> {t("quotation.wizard.back")}
      </button>

      <h1 className="text-2xl font-semibold text-foreground leading-tight" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>
        {templateId ? t("templates.form.editTitle") : t("templates.form.createTitle")}
      </h1>

      <div className="bg-card border border-border rounded-xl p-5 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">{t("templates.col.code")} <span className="text-[#e05252]">*</span></label>
            <input value={draft.templateCode} onChange={(e) => setDraft((d) => ({ ...d, templateCode: e.target.value.toUpperCase() }))} className="w-full text-sm font-mono text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">{t("templates.col.name")} <span className="text-[#e05252]">*</span></label>
            <input value={draft.templateName} onChange={(e) => setDraft((d) => ({ ...d, templateName: e.target.value }))} className="w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
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
        <div>
          <label className="text-xs text-muted-foreground block mb-1">{t("templates.form.description")}</label>
          <textarea value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} rows={2} className="w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors resize-y" />
        </div>
        {canActivate ? (
          <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-foreground">
            <input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft((d) => ({ ...d, isActive: e.target.checked }))} className="w-4 h-4 rounded border-border accent-[#c9a84c]" />
            {t("templates.form.active")}
          </label>
        ) : (
          <p className="text-xs text-muted-foreground">{t("templates.form.statusReadOnly")}: {originalActive ? t("common.status.active") : t("customers.status.inactive")}</p>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">{t("templates.form.sections")}</h2>
          <button onClick={addSection} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
            <Plus size={13} /> {t("templates.form.addSection")}
          </button>
        </div>

        {draft.sections.length === 0 && <p className="text-xs text-muted-foreground py-4 text-center">{t("templates.form.noSections")}</p>}

        {draft.sections.map((section, sIdx) => (
          <div key={section.id} className="bg-card border border-border rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <input
                value={section.title}
                onChange={(e) => updateSection(section.id, (s) => ({ ...s, title: e.target.value }))}
                placeholder={t("templates.form.sectionTitlePlaceholder")}
                className="flex-1 text-sm font-semibold text-foreground bg-secondary border border-border rounded-lg px-3 py-1.5 outline-none focus:border-[#c9a84c]/50 transition-colors"
              />
              <button onClick={() => moveSection(sIdx, -1)} disabled={sIdx === 0} className="p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"><ArrowUp size={14} /></button>
              <button onClick={() => moveSection(sIdx, 1)} disabled={sIdx === draft.sections.length - 1} className="p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"><ArrowDown size={14} /></button>
              <button onClick={() => deleteSection(section.id)} className="p-1.5 text-muted-foreground hover:text-[#e05252] transition-colors"><Trash2 size={14} /></button>
            </div>

            <div className="space-y-2 pl-2 border-l-2 border-border/60">
              {section.items.map((item, iIdx) => (
                <ItemEditor
                  key={item.id}
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
            </div>

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

      <div className="bg-card border border-border rounded-xl p-5 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">{t("templates.preview.terms")}</h2>
        {(["paymentTerm", "warrantyTerm", "taxNote"] as const).map((type) => (
          <div key={type}>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-medium text-muted-foreground">{termLabel(type)}</p>
              <button onClick={() => addTerm(type)} className="text-[11px] text-[#c9a84c] hover:text-[#f0c040] transition-colors">+ {t("common.add")}</button>
            </div>
            <div className="space-y-1.5">
              {termsOfType(type).map(({ term, i }) => (
                <div key={i} className="flex items-center gap-2">
                  <input value={term.text} onChange={(e) => updateTermText(i, e.target.value)} className="flex-1 text-xs text-foreground bg-secondary border border-border rounded-lg px-3 py-1.5 outline-none focus:border-[#c9a84c]/50 transition-colors" />
                  <button onClick={() => deleteTerm(i)} className="p-1 text-muted-foreground hover:text-[#e05252] transition-colors"><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-card border border-border rounded-xl p-5 space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">{t("templates.preview.notes")}</h2>
          <button onClick={addDefaultNote} className="text-[11px] text-[#c9a84c] hover:text-[#f0c040] transition-colors">+ {t("common.add")}</button>
        </div>
        <p className="text-[11px] text-muted-foreground">{t("templates.form.defaultNotesHint")}</p>
        <div className="space-y-1.5">
          {defaultNotes.map((n, i) => (
            <div key={i} className="flex items-center gap-2">
              <input value={n} onChange={(e) => updateDefaultNote(i, e.target.value)} className="flex-1 text-xs text-foreground bg-secondary border border-border rounded-lg px-3 py-1.5 outline-none focus:border-[#c9a84c]/50 transition-colors" />
              <button onClick={() => deleteDefaultNote(i)} className="p-1 text-muted-foreground hover:text-[#e05252] transition-colors"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5 space-y-3">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={conditionsEnabled} onChange={(e) => toggleConditions(e.target.checked)} className="w-4 h-4 rounded border-border accent-[#c9a84c]" />
          <h2 className="text-sm font-semibold text-foreground">{t("templates.preview.conditions")}</h2>
        </label>
        {draft.conditions && (
          <div className="space-y-3 pl-1">
            <div>
              <label className="text-[11px] text-muted-foreground block mb-1">{t("quotation.field.vatCondition")}</label>
              <input value={draft.conditions.vatConditionText} onChange={(e) => updateConditions((c) => ({ ...c, vatConditionText: e.target.value }))} className="w-full text-xs text-foreground bg-secondary border border-border rounded-lg px-3 py-1.5 outline-none focus:border-[#c9a84c]/50 transition-colors" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-muted-foreground block mb-1">{t("templates.form.warrantyUnit")}</label>
                <input value={draft.conditions.warrantyUnit} onChange={(e) => updateConditions((c) => ({ ...c, warrantyUnit: e.target.value }))} className="w-full text-xs text-foreground bg-secondary border border-border rounded-lg px-3 py-1.5 outline-none focus:border-[#c9a84c]/50 transition-colors" />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground block mb-1">{t("templates.form.deliveryUnit")}</label>
                <input value={draft.conditions.deliveryUnit} onChange={(e) => updateConditions((c) => ({ ...c, deliveryUnit: e.target.value }))} className="w-full text-xs text-foreground bg-secondary border border-border rounded-lg px-3 py-1.5 outline-none focus:border-[#c9a84c]/50 transition-colors" />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] text-muted-foreground">{t("templates.form.paymentPresets")}</label>
                <button onClick={addPaymentPreset} className="text-[11px] text-[#c9a84c] hover:text-[#f0c040] transition-colors">+ {t("common.add")}</button>
              </div>
              <div className="space-y-1.5">
                {draft.conditions.paymentPresets.map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input value={p} onChange={(e) => updatePaymentPreset(i, e.target.value)} className="flex-1 text-xs text-foreground bg-secondary border border-border rounded-lg px-3 py-1.5 outline-none focus:border-[#c9a84c]/50 transition-colors" />
                    <button onClick={() => deletePaymentPreset(i)} className="p-1 text-muted-foreground hover:text-[#e05252] transition-colors"><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl p-5">
        <label className="text-xs font-semibold text-foreground block mb-1">{t("templates.form.internalNotes")}</label>
        <p className="text-[11px] text-muted-foreground mb-1.5">{t("templates.form.internalNotesHint")}</p>
        <textarea
          value={draft.internalNotes.join("\n")}
          onChange={(e) => setDraft((d) => ({ ...d, internalNotes: linesToArray(e.target.value) }))}
          rows={3}
          className="w-full text-xs text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors resize-y"
        />
      </div>

      {error && <p className="text-xs text-[#e05252]">{error}</p>}

      <div className="flex items-center justify-end gap-2 pb-6">
        <button onClick={onCancel} className={secondaryButtonClass("md")}>{t("common.cancel")}</button>
        <button onClick={() => void handleSave()} disabled={saving} className="px-4 py-2 text-sm rounded-lg font-semibold bg-[#c9a84c] text-[#0b1d3a] hover:bg-[#f0c040] transition-colors disabled:opacity-60">
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
  item, onChange, onDelete, onDuplicate, onMoveUp, onMoveDown, canMoveUp, canMoveDown,
}: {
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
  const [expanded, setExpanded] = useState(false);

  const updateParam = (index: number, field: "label" | "unit", value: string) => {
    onChange((it) => ({ ...it, editableParameters: it.editableParameters.map((p, i) => (i === index ? { ...p, [field]: value } : p)) }));
  };
  const addParam = () => onChange((it) => ({ ...it, editableParameters: [...it.editableParameters, { label: "", value: "", unit: "", editable: true }] }));
  const deleteParam = (index: number) => onChange((it) => ({ ...it, editableParameters: it.editableParameters.filter((_, i) => i !== index) }));

  return (
    <div className="bg-secondary/40 border border-border/60 rounded-lg p-2.5 space-y-2">
      <div className="flex items-center gap-1.5">
        <select
          value={item.itemType}
          onChange={(e) => onChange((it) => ({ ...it, itemType: e.target.value as TemplateItem["itemType"] }))}
          className="text-[11px] text-muted-foreground bg-transparent border border-border rounded px-1.5 py-1 outline-none appearance-none flex-shrink-0"
        >
          <option value="item">{t("templates.itemType.item")}</option>
          <option value="subItem">{t("templates.itemType.subItem")}</option>
          <option value="specification">{t("templates.itemType.specification")}</option>
        </select>
        <input
          value={item.name}
          onChange={(e) => onChange((it) => ({ ...it, name: e.target.value, description: e.target.value }))}
          placeholder={t("templates.form.itemNamePlaceholder")}
          className="flex-1 min-w-0 text-xs text-foreground bg-card border border-border rounded px-2 py-1.5 outline-none focus:border-[#c9a84c]/50 transition-colors"
        />
        <input
          type="number"
          value={item.quantity ?? ""}
          onChange={(e) => onChange((it) => ({ ...it, quantity: e.target.value === "" ? null : Number(e.target.value) }))}
          placeholder={t("templates.form.qty")}
          className="w-16 text-xs text-foreground bg-card border border-border rounded px-2 py-1.5 outline-none focus:border-[#c9a84c]/50 transition-colors"
        />
        <input
          value={item.unit}
          onChange={(e) => onChange((it) => ({ ...it, unit: e.target.value }))}
          placeholder={t("templates.form.unit")}
          className="w-16 text-xs text-foreground bg-card border border-border rounded px-2 py-1.5 outline-none focus:border-[#c9a84c]/50 transition-colors"
        />
        <button onClick={() => setExpanded((v) => !v)} className="text-[11px] text-[#c9a84c] hover:text-[#f0c040] transition-colors px-1 flex-shrink-0">
          {expanded ? t("templates.form.collapse") : t("templates.form.expand")}
        </button>
        <button onClick={onMoveUp} disabled={!canMoveUp} className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors flex-shrink-0"><ArrowUp size={12} /></button>
        <button onClick={onMoveDown} disabled={!canMoveDown} className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors flex-shrink-0"><ArrowDown size={12} /></button>
        <button onClick={onDuplicate} className="p-1 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"><Copy size={12} /></button>
        <button onClick={onDelete} className="p-1 text-muted-foreground hover:text-[#e05252] transition-colors flex-shrink-0"><X size={12} /></button>
      </div>

      {item.productSnapshot && (
        <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Package size={10} /> {t("templates.form.linkedProduct")}: {item.productSnapshot.code} — {item.productSnapshot.name}</p>
      )}

      {expanded && (
        <div className="space-y-2 pt-1">
          <div>
            <label className="text-[10px] text-muted-foreground block mb-0.5">{t("templates.form.specifications")}</label>
            <textarea
              value={item.specifications.join("\n")}
              onChange={(e) => onChange((it) => ({ ...it, specifications: linesToArray(e.target.value) }))}
              rows={2}
              className="w-full text-[11px] text-foreground bg-card border border-border rounded px-2 py-1.5 outline-none focus:border-[#c9a84c]/50 transition-colors resize-y"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground block mb-0.5">{t("templates.form.subDetails")}</label>
            <textarea
              value={item.subDetails.join("\n")}
              onChange={(e) => onChange((it) => ({ ...it, subDetails: linesToArray(e.target.value) }))}
              rows={2}
              className="w-full text-[11px] text-foreground bg-card border border-border rounded px-2 py-1.5 outline-none focus:border-[#c9a84c]/50 transition-colors resize-y"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-0.5">
              <label className="text-[10px] text-muted-foreground">{t("templates.form.editableParameters")}</label>
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
          <DynamicFieldsAdminEditor
            fields={item.dynamicFields ?? []}
            onChange={(fields) => onChange((it) => ({ ...it, dynamicFields: fields }))}
          />
          <div>
            <label className="text-[10px] text-muted-foreground block mb-0.5">{t("templates.form.itemInternalNotes")}</label>
            <textarea
              value={item.internalNotes.join("\n")}
              onChange={(e) => onChange((it) => ({ ...it, internalNotes: linesToArray(e.target.value) }))}
              rows={2}
              className="w-full text-[11px] text-foreground bg-card border border-[#e08a3c]/40 rounded px-2 py-1.5 outline-none focus:border-[#e08a3c]/60 transition-colors resize-y"
            />
          </div>
          <label className="flex items-center gap-1.5 cursor-pointer select-none text-[11px] text-foreground">
            <input type="checkbox" checked={item.visibleToCustomer} onChange={(e) => onChange((it) => ({ ...it, visibleToCustomer: e.target.checked }))} className="w-3.5 h-3.5 rounded border-border accent-[#c9a84c]" />
            {t("templates.form.visibleToCustomer")}
          </label>
        </div>
      )}
    </div>
  );
}

/** Options textarea <-> `TemplateFieldOption[]`, one option per line — `[x]`/`[ ]` prefix toggles
 * `defaultChecked` for a checkboxGroup field (matching this feature's own business-requirement
 * input convention); a `!` prefix on a dropdown/radio option toggles `omitFromCustomerDisplay`
 * (e.g. `!No` — selecting "No" prints nothing for this field at all, rather than "Field: No"; see
 * `omitFromCustomerDisplay` in src/lib/quotationTemplates.ts, first used by FRP Lining's Concrete
 * Surface Repair but generic to any dropdown/radio option). A real label that itself needs to start
 * with a literal `!` is escaped as `\!` (both when writing it out and when parsing it back) so it's
 * never misread as the suppression marker. Option keys are reused by line position when re-parsing
 * (not regenerated from the label) so editing a label in place never breaks an existing `visibleWhen`
 * reference to that option — only inserting/deleting a line in the middle can shift a later option's
 * key, an accepted tradeoff of a bulk-text editor. */
function optionsToText(options: TemplateFieldOption[], isCheckbox: boolean): string {
  return options.map((o) => {
    if (isCheckbox) return `${o.defaultChecked ? "[x]" : "[ ]"} ${o.label}`;
    if (o.omitFromCustomerDisplay) return `!${o.label}`;
    return o.label.startsWith("!") ? `\\${o.label}` : o.label;
  }).join("\n");
}
function parseOptionsText(existing: TemplateFieldOption[], isCheckbox: boolean, text: string): TemplateFieldOption[] {
  return text.split("\n").map((s) => s.trim()).filter(Boolean).map((line, i) => {
    if (isCheckbox) {
      const checkboxMatch = /^\[( |x|X)\]\s*(.*)$/.exec(line);
      const label = checkboxMatch ? checkboxMatch[2] : line;
      const defaultChecked = checkboxMatch ? checkboxMatch[1].toLowerCase() === "x" : false;
      return { key: existing[i]?.key ?? newId(), label, defaultChecked };
    }
    if (line.startsWith("\\!")) return { key: existing[i]?.key ?? newId(), label: line.slice(1) };
    const omitFromCustomerDisplay = line.startsWith("!");
    const label = omitFromCustomerDisplay ? line.slice(1).trim() : line;
    return { key: existing[i]?.key ?? newId(), label, ...(omitFromCustomerDisplay ? { omitFromCustomerDisplay: true } : {}) };
  });
}

/** Admin editor for one item's `TemplateDynamicField[]` (added 2026-07-20) — a generic, reusable
 * authoring UI for the dropdown/radio/checkbox-group/text/number field system, not specific to any
 * one template. See `src/lib/templateDynamicFields.ts` for how these are rendered/evaluated once
 * applied to a quotation. */
function DynamicFieldsAdminEditor({
  fields, onChange,
}: {
  fields: TemplateDynamicField[];
  onChange: (fields: TemplateDynamicField[]) => void;
}) {
  const { t } = useI18n();
  const addField = () => onChange([...fields, newDynamicField(fields.length)]);
  const updateField = (key: string, patch: Partial<TemplateDynamicField>) => onChange(fields.map((f) => (f.key === key ? { ...f, ...patch } : f)));
  const deleteField = (key: string) => onChange(fields.filter((f) => f.key !== key));

  return (
    <div>
      <div className="flex items-center justify-between mb-0.5">
        <label className="text-[10px] text-muted-foreground">{t("templates.form.dynamicFields")}</label>
        <button onClick={addField} className="text-[10px] text-[#c9a84c] hover:text-[#f0c040] transition-colors">+ {t("common.add")}</button>
      </div>
      <div className="space-y-2">
        {fields.map((f) => {
          const hasOptions = f.type === "dropdown" || f.type === "radio" || f.type === "checkboxGroup";
          const isCheckbox = f.type === "checkboxGroup";
          return (
            <div key={f.key} className="bg-card border border-border rounded p-2 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <input
                  value={f.label}
                  onChange={(e) => updateField(f.key, { label: e.target.value })}
                  placeholder={t("templates.form.dynamicFieldLabel")}
                  className="flex-1 min-w-0 text-[11px] text-foreground bg-secondary border border-border rounded px-2 py-1 outline-none focus:border-[#c9a84c]/50 transition-colors"
                />
                <select
                  value={f.type}
                  onChange={(e) => updateField(f.key, { type: e.target.value as TemplateFieldType })}
                  className="text-[11px] text-foreground bg-secondary border border-border rounded px-1.5 py-1 outline-none appearance-none flex-shrink-0"
                >
                  <option value="text">{t("templates.form.dynamicFieldType.text")}</option>
                  <option value="number">{t("templates.form.dynamicFieldType.number")}</option>
                  <option value="dropdown">{t("templates.form.dynamicFieldType.dropdown")}</option>
                  <option value="radio">{t("templates.form.dynamicFieldType.radio")}</option>
                  <option value="checkboxGroup">{t("templates.form.dynamicFieldType.checkboxGroup")}</option>
                </select>
                <button onClick={() => deleteField(f.key)} className="p-0.5 text-muted-foreground hover:text-[#e05252] transition-colors flex-shrink-0"><X size={11} /></button>
              </div>
              {(f.type === "text" || f.type === "number") && (
                <div className="flex items-center gap-1.5">
                  <input value={f.unitSuffix ?? ""} onChange={(e) => updateField(f.key, { unitSuffix: e.target.value })} placeholder={t("templates.form.unit")} className="w-24 text-[11px] text-foreground bg-secondary border border-border rounded px-2 py-1 outline-none focus:border-[#c9a84c]/50 transition-colors" />
                  <input value={f.placeholder ?? ""} onChange={(e) => updateField(f.key, { placeholder: e.target.value })} placeholder={t("templates.form.dynamicFieldPlaceholderHint")} className="flex-1 min-w-0 text-[11px] text-foreground bg-secondary border border-border rounded px-2 py-1 outline-none focus:border-[#c9a84c]/50 transition-colors" />
                </div>
              )}
              {hasOptions && (
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-0.5">
                    {isCheckbox ? t("templates.form.dynamicFieldOptionsCheckboxHint") : t("templates.form.dynamicFieldOptionsHint")}
                  </label>
                  <textarea
                    value={optionsToText(f.options ?? [], isCheckbox)}
                    onChange={(e) => updateField(f.key, { options: parseOptionsText(f.options ?? [], isCheckbox, e.target.value) })}
                    rows={3}
                    className="w-full text-[11px] text-foreground bg-secondary border border-border rounded px-2 py-1.5 outline-none focus:border-[#c9a84c]/50 transition-colors resize-y"
                  />
                </div>
              )}
              {isCheckbox && (
                <label className="flex items-center gap-1.5 cursor-pointer select-none text-[11px] text-foreground">
                  <input type="checkbox" checked={!!f.generateIncludedExcluded} onChange={(e) => updateField(f.key, { generateIncludedExcluded: e.target.checked })} className="w-3.5 h-3.5 rounded border-border accent-[#c9a84c]" />
                  {t("templates.form.generateIncludedExcluded")}
                </label>
              )}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-muted-foreground flex-shrink-0">{t("templates.form.visibleWhen")}</span>
                <input
                  value={f.visibleWhen?.fieldKey ?? ""}
                  onChange={(e) => updateField(f.key, { visibleWhen: e.target.value ? { fieldKey: e.target.value, equalsAny: f.visibleWhen?.equalsAny ?? [] } : undefined })}
                  placeholder={t("templates.form.visibleWhenFieldKey")}
                  className="w-28 text-[11px] text-foreground bg-secondary border border-border rounded px-2 py-1 outline-none focus:border-[#c9a84c]/50 transition-colors"
                />
                {f.visibleWhen && (
                  <input
                    value={f.visibleWhen.equalsAny.join(", ")}
                    onChange={(e) => updateField(f.key, { visibleWhen: { fieldKey: f.visibleWhen!.fieldKey, equalsAny: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) } })}
                    placeholder={t("templates.form.visibleWhenValues")}
                    className="flex-1 min-w-0 text-[11px] text-foreground bg-secondary border border-border rounded px-2 py-1 outline-none focus:border-[#c9a84c]/50 transition-colors"
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
