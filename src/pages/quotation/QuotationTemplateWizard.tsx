import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, FileText, AlertTriangle, RefreshCw, Loader2, PackageOpen, Info, Layers, Plus } from "lucide-react";
import type { JobType } from "../../lib/jobTypes";
import {
  fetchQuotationTemplates, fetchQuotationTemplate,
  type QuotationTemplateSummary, type QuotationTemplate,
} from "../../lib/quotationTemplates";
import { applyTemplateToQuoteDraft, type AppliedTemplateDraft } from "./applyTemplate";
import { TemplatePreview } from "../../components/TemplatePreview";
import { DocumentStepper, DocumentColumns, RailCard, NextStepHint } from "../../components/ui/DocumentLayout";
import { SectionCard } from "../../components/ui/SectionCard";
import { ReadonlyField } from "../../components/ui/Field";
import { btn } from "../../components/ui/styles";
import { useI18n } from "../../lib/i18n";

export interface QuotationWizardResult {
  jobTypeCode: string;
  jobTypeName: string;
  templateSnapshot:
    | (AppliedTemplateDraft & {
        quotationTemplateId: string;
        quotationTemplateName: string;
        quotationTemplateVersion: string;
      })
    | null;
}

type Step = "jobType" | "template" | "preview";

// ตัวช่วยสร้างใบเสนอราคาแบบเป็นขั้นตอน: เลือกประเภทงาน -> เลือก Template -> ดูตัวอย่าง ก่อนเริ่มแบบฟอร์มจริง
// Step-by-step wizard for starting a new quote: pick job type -> pick template -> preview, before the real form
export function QuotationTemplateWizard({
  jobTypes,
  onComplete,
  onCancel,
  showToast,
  initialSelection,
  canCreateTemplate,
  onCreateTemplateForJobType,
}: {
  jobTypes: JobType[];
  onComplete: (result: QuotationWizardResult) => void;
  onCancel: () => void;
  showToast: (msg: string) => void;
  initialSelection?: { jobTypeCode: string; templateId: string } | null;
  canCreateTemplate?: boolean;
  onCreateTemplateForJobType?: (jobTypeCode: string, jobTypeName: string) => void;
}) {
  const { t } = useI18n();

  const initialJobType = initialSelection
    ? jobTypes.find((j) => j.code === initialSelection.jobTypeCode && j.isActive) ?? null
    : null;

  const [step, setStep] = useState<Step>(initialJobType ? "template" : "jobType");
  const [selectedJobType, setSelectedJobType] = useState<JobType | null>(initialJobType);
  const [templates, setTemplates] = useState<QuotationTemplateSummary[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(!!initialJobType);
  const [templatesError, setTemplatesError] = useState("");
  const [selectedSummary, setSelectedSummary] = useState<QuotationTemplateSummary | null>(null);
  const [fullTemplate, setFullTemplate] = useState<QuotationTemplate | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState("");

  const activeJobTypesUnsorted = jobTypes.filter((jt) => jt.isActive);

  const [templateCounts, setTemplateCounts] = useState<Map<string, number> | null>(null);
  const [templateCountsError, setTemplateCountsError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetchQuotationTemplates()
      .then((list) => {
        if (cancelled) return;
        const counts = new Map<string, number>();
        for (const tpl of list.filter((t2) => t2.isActive)) {
          counts.set(tpl.jobTypeCode, (counts.get(tpl.jobTypeCode) ?? 0) + 1);
        }
        setTemplateCounts(counts);
      })
      .catch(() => { if (!cancelled) setTemplateCountsError(true); });
    return () => { cancelled = true; };
  }, []);
  const badgeFor = (jobTypeCode: string): string => {
    if (templateCountsError) return t("quotation.wizard.badge.unknown");
    if (!templateCounts) return t("quotation.wizard.badge.loading");
    const n = templateCounts.get(jobTypeCode) ?? 0;
    if (n === 0) return t("quotation.wizard.badge.none");
    if (n === 1) return t("quotation.wizard.badge.one");
    return t("quotation.wizard.badge.many").replace("{n}", String(n));
  };

  const isGenericOtherJobType = (code: string) => code === "OTHER";
  const isOtherSubcategoryJobType = (code: string) => code.startsWith("OTHER") && code !== "OTHER";
  const hasActiveTemplate = (code: string) => (templateCounts?.get(code) ?? 0) > 0;
  const activeJobTypes = [
    ...activeJobTypesUnsorted.filter((jt) => !isOtherSubcategoryJobType(jt.code) && !isGenericOtherJobType(jt.code) && hasActiveTemplate(jt.code)),
    ...activeJobTypesUnsorted.filter((jt) => !isOtherSubcategoryJobType(jt.code) && !isGenericOtherJobType(jt.code) && !hasActiveTemplate(jt.code)),
    ...activeJobTypesUnsorted.filter((jt) => isOtherSubcategoryJobType(jt.code)),
    ...activeJobTypesUnsorted.filter((jt) => isGenericOtherJobType(jt.code)),
  ];

  const consumedInitialSelection = useRef(false);
  useEffect(() => {
    if (consumedInitialSelection.current || !initialSelection || !initialJobType) return;
    consumedInitialSelection.current = true;
    fetchQuotationTemplates({ jobTypeCode: initialJobType.code })
      .then((list) => {
        const active = list.filter((tpl) => tpl.isActive);
        setTemplates(active);
        const target = active.find((tpl) => tpl.id === initialSelection.templateId) ?? (active.length === 1 ? active[0] : undefined);
        if (!target) { setLoadingTemplates(false); return; }
        setSelectedSummary(target);
        setFullTemplate(null);
        setLoadingPreview(true);
        setPreviewError("");
        setStep("preview");
        setLoadingTemplates(false);
        fetchQuotationTemplate(target.id)
          .then(setFullTemplate)
          .catch(() => setPreviewError(t("quotation.wizard.loadPreviewError")))
          .finally(() => setLoadingPreview(false));
      })
      .catch(() => {
        setTemplatesError(t("quotation.wizard.loadTemplatesError"));
        setLoadingTemplates(false);
      });
  }, [initialSelection, initialJobType, t]);

  // โหลด template แบบเต็มเพื่อแสดงตัวอย่างในขั้นตอนพรีวิว
  // Loads the full template to show in the preview step
  const loadPreview = async (summary: QuotationTemplateSummary) => {
    setSelectedSummary(summary);
    setFullTemplate(null);
    setLoadingPreview(true);
    setPreviewError("");
    setStep("preview");
    try {
      const full = await fetchQuotationTemplate(summary.id);
      setFullTemplate(full);
    } catch {
      setPreviewError(t("quotation.wizard.loadPreviewError"));
    } finally {
      setLoadingPreview(false);
    }
  };

  // โหลดรายการ template ที่ใช้งานได้ของประเภทงานนั้น ถ้ามีเพียงอันเดียวจะข้ามไปพรีวิวเลย
  // Loads active templates for a job type, auto-skipping to preview if there's only one
  const loadTemplates = async (jt: JobType) => {
    setLoadingTemplates(true);
    setTemplatesError("");
    try {
      const list = await fetchQuotationTemplates({ jobTypeCode: jt.code });
      const active = list.filter((tpl) => tpl.isActive);
      setTemplates(active);
      if (active.length === 1) {
        void loadPreview(active[0]);
      }
    } catch {
      setTemplatesError(t("quotation.wizard.loadTemplatesError"));
    } finally {
      setLoadingTemplates(false);
    }
  };

  // จัดการเมื่อเลือกประเภทงานในขั้นที่ 1 แล้วรีเซ็ตสถานะขั้นถัดไปพร้อมโหลด template
  // Handles picking a job type in step 1, resetting downstream state and loading its templates
  const handleSelectJobType = (jt: JobType) => {
    setSelectedJobType(jt);
    setTemplates([]);
    setSelectedSummary(null);
    setFullTemplate(null);
    setPreviewError("");
    setTemplatesError("");
    setStep("template");
    void loadTemplates(jt);
  };

  // ใช้ template ที่เลือกไว้เป็นจุดเริ่มต้นของใบเสนอราคาใหม่ แล้วส่งผลลัพธ์กลับไป
  // Uses the selected template as the seed for a new quote and completes the wizard
  const handleUseTemplate = () => {
    if (!selectedJobType || !fullTemplate) return;
    const applied = applyTemplateToQuoteDraft(fullTemplate);
    onComplete({
      jobTypeCode: selectedJobType.code,
      jobTypeName: selectedJobType.name,
      templateSnapshot: {
        ...applied,
        quotationTemplateId: fullTemplate.id,
        quotationTemplateName: fullTemplate.templateName,
        quotationTemplateVersion: fullTemplate.version,
      },
    });
  };

  // เริ่มใบเสนอราคาจากแบบฟอร์มเปล่า โดยไม่ใช้ template ใด
  // Starts a new quote from a blank form, with no template applied
  const handleStartBlank = () => {
    onComplete({
      jobTypeCode: selectedJobType?.code ?? "",
      jobTypeName: selectedJobType?.name ?? "",
      templateSnapshot: null,
    });
  };

  const handleNotifyAdmin = () => showToast(t("quotation.wizard.notifyAdminToast"));

  // ย้อนกลับไปขั้นตอนเลือกประเภทงาน พร้อมล้างการเลือก template/พรีวิวที่ค้างอยู่
  // Goes back to the job-type step, clearing any selected template and preview state
  const backToJobType = () => {
    setStep("jobType");
    setSelectedJobType(null);
    setTemplates([]);
    setTemplatesError("");
    setSelectedSummary(null);
    setFullTemplate(null);
    setPreviewError("");
  };

  // ย้อนกลับจากขั้นตอนพรีวิว ไปที่ขั้นเลือก template ถ้ามีให้เลือกหลายอัน มิฉะนั้นย้อนไปเลือกประเภทงานเลย
  // Goes back from the preview step to template selection when there's more than one, otherwise straight to job type
  const backFromPreview = () => {
    setPreviewError("");
    setFullTemplate(null);
    if (templates.length > 1) {
      setSelectedSummary(null);
      setStep("template");
    } else {
      backToJobType();
    }
  };

  const stepIndex = step === "jobType" ? 0 : step === "template" ? 1 : 2;
  const wizardSteps = [
    { label: t("quotation.wizard.step1Title") },
    { label: t("quotation.wizard.step2Title") },
    { label: t("quotation.wizard.step3Title") },
    { label: t("quotation.wizard.step4Title") },
  ];
  const templateItemCount = fullTemplate ? fullTemplate.sections.reduce((n, s) => n + s.items.length, 0) : 0;
  const jobTypeChip = (code: string) => (
    <span className="inline-flex items-center h-6 px-2 rounded-md bg-[#eef1f6] text-foreground text-xs font-semibold font-mono whitespace-nowrap">{code}</span>
  );
  const loadingBlock = (text: string) => (
    <div className="flex items-center gap-2 text-sm text-muted-foreground py-12 justify-center">
      <Loader2 size={16} className="animate-spin" /> {text}
    </div>
  );
  const errorBlock = (text: string, onRetry: () => void, onBack: () => void, backLabel: string) => (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <AlertTriangle size={22} className="text-[#b93636]" />
      <p className="text-sm text-foreground">{text}</p>
      <div className="flex gap-2.5">
        <button type="button" onClick={onBack} className={btn.secondary}>{backLabel}</button>
        <button type="button" onClick={onRetry} className={btn.primary}><RefreshCw size={16} /> {t("quotation.wizard.retry")}</button>
      </div>
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="bg-card border-b border-border px-4 md:px-8 pt-3.5 pb-4 flex flex-col gap-2.5">
        <button type="button" onClick={onCancel} className="self-start text-[13px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5">
          <ArrowLeft size={14} /> {t("quotation.backToList")}
        </button>
        <div className="flex items-center gap-3.5 flex-wrap">
          <h1 className="text-[22px] font-semibold leading-snug text-foreground">{t("quotation.wizard.title")}</h1>
          <span className="flex-1" />
          <div className="flex items-center gap-2.5 flex-wrap">
            {step === "preview" ? (
              <>
                <button type="button" onClick={backFromPreview} className={btn.secondary}><ChevronLeft size={16} /> {t("quotation.wizard.back")}</button>
                <button type="button" onClick={handleStartBlank} className={btn.secondary}>{t("quotation.wizard.startFromBlankForm")}</button>
                <button type="button" onClick={handleUseTemplate} disabled={!fullTemplate} className={btn.primary}><Check size={16} /> {t("quotation.wizard.useTemplate")}</button>
              </>
            ) : step === "template" ? (
              <>
                <button type="button" onClick={backToJobType} className={btn.secondary}><ChevronLeft size={16} /> {t("quotation.wizard.back")}</button>
                <button type="button" onClick={onCancel} className={btn.secondary}>{t("quotation.wizard.cancel")}</button>
              </>
            ) : (
              <button type="button" onClick={onCancel} className={btn.secondary}>{t("quotation.wizard.cancel")}</button>
            )}
          </div>
        </div>
      </div>

      <main className="px-4 md:px-8 py-6 flex flex-col gap-5">
        <DocumentStepper ariaLabel={t("quotation.wizard.stepperLabel")} steps={wizardSteps} current={stepIndex} />

        {step === "jobType" && (
          <SectionCard title={t("quotation.wizard.step1Title")} subtitle={t("quotation.wizard.step1Desc")} bodyClassName="">
            <div className="px-6 pt-5 pb-6">
              {activeJobTypes.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("quotation.wizard.noActiveJobTypes")}</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {activeJobTypes.map((jt) => {
                    const has = (templateCounts?.get(jt.code) ?? 0) > 0;
                    return (
                      <button
                        key={jt.id}
                        type="button"
                        onClick={() => handleSelectJobType(jt)}
                        className="group min-h-[84px] px-3.5 py-3 rounded-[10px] border border-border bg-white flex flex-col justify-between gap-1.5 text-left hover:border-[#1a5fb4]/40 hover:bg-[#f8f9fc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a5fb4]/40 transition-colors"
                      >
                        <span className="flex items-center gap-2 w-full">
                          {jobTypeChip(jt.code)}
                          <span className="flex-1" />
                          <span className={`inline-flex items-center h-[22px] px-2 rounded-full text-xs font-semibold whitespace-nowrap ${has ? "bg-[#e6f4ec] text-[#1b7f4f]" : "bg-[#eef1f6] text-[#5f7293]"}`}>
                            {badgeFor(jt.code)}
                          </span>
                        </span>
                        <span className="flex items-center gap-2 w-full">
                          <span className="flex-1 min-w-0 text-sm font-medium text-foreground truncate" title={jt.name}>{jt.name}</span>
                          <ChevronRight size={16} className="text-[#a3aec2] group-hover:text-foreground flex-shrink-0 transition-colors" />
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="px-6 py-3.5 border-t border-[#eef1f6] flex items-center gap-2.5 text-[13px] text-muted-foreground">
              <Info size={16} className="flex-shrink-0" /> {t("quotation.wizard.noTemplateNote")}
            </div>
          </SectionCard>
        )}

        {step === "template" && selectedJobType && (
          <SectionCard
            title={t("quotation.wizard.step2Title")}
            subtitle={templates.length > 1 ? t("quotation.wizard.step2Desc") : undefined}
            actions={
              <span className="flex flex-col items-end gap-0.5">
                <span className="text-xs text-muted-foreground">{t("quotation.field.jobType")}</span>
                <span className="inline-flex items-center gap-2">{jobTypeChip(selectedJobType.code)}<span className="text-sm font-medium text-foreground">{selectedJobType.name}</span></span>
              </span>
            }
            bodyClassName=""
          >
            {loadingTemplates ? (
              loadingBlock(t("quotation.wizard.loadingTemplates"))
            ) : templatesError ? (
              errorBlock(templatesError, () => void loadTemplates(selectedJobType), backToJobType, t("quotation.wizard.chooseOtherJobType"))
            ) : templates.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-12 px-6 text-center">
                <PackageOpen size={22} className="text-muted-foreground" />
                <p className="text-sm text-foreground">{t("quotation.wizard.noTemplateTitle")}</p>
                <div className="flex flex-wrap gap-2.5 justify-center">
                  <button type="button" onClick={backToJobType} className={btn.secondary}>{t("quotation.wizard.chooseOtherJobType")}</button>
                  {canCreateTemplate && onCreateTemplateForJobType ? (
                    <button type="button" onClick={() => onCreateTemplateForJobType(selectedJobType.code, selectedJobType.name)} className={btn.secondary}>
                      <Plus size={16} /> {t("quotation.wizard.createTemplateForJobType")}
                    </button>
                  ) : (
                    <button type="button" onClick={handleNotifyAdmin} className={btn.secondary}>{t("quotation.wizard.notifyAdmin")}</button>
                  )}
                  <button type="button" onClick={handleStartBlank} className={btn.primary}>{t("quotation.wizard.startBlank")}</button>
                </div>
              </div>
            ) : (
              <>
                <div className="px-6 py-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {templates.map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => void loadPreview(tpl)}
                      className="group p-5 rounded-xl border border-border bg-white flex gap-4 items-start text-left hover:border-[#1a5fb4]/40 hover:bg-[#f8f9fc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a5fb4]/40 transition-colors"
                    >
                      <span className="w-10 h-10 rounded-[10px] bg-[#e8edf7] text-[#1a3a6b] flex items-center justify-center flex-shrink-0"><FileText size={18} /></span>
                      <span className="flex-1 min-w-0 flex flex-col gap-1.5">
                        <span className="flex items-baseline gap-2.5 flex-wrap">
                          <span className="text-base font-semibold text-foreground">{tpl.templateName}</span>
                          <span className="text-xs text-muted-foreground">{t("quotation.wizard.version")} {tpl.version}</span>
                        </span>
                        {tpl.description && <span className="text-[13px] leading-relaxed text-[#3d5173] line-clamp-3">{tpl.description}</span>}
                        <span className="flex items-center gap-2 mt-1 text-[13px] text-[#3d5173]">
                          <Layers size={14} className="text-muted-foreground" />
                          {tpl.sectionCount} {t("quotation.wizard.sections")} · {tpl.itemCount} {t("quotation.wizard.items")}
                        </span>
                      </span>
                      <ChevronRight size={18} className="text-[#a3aec2] group-hover:text-foreground flex-shrink-0 mt-2.5 transition-colors" />
                    </button>
                  ))}
                </div>
                <div className="px-6 py-2.5 border-t border-[#eef1f6] flex items-center gap-4 flex-wrap">
                  {canCreateTemplate && onCreateTemplateForJobType && (
                    <button type="button" onClick={() => onCreateTemplateForJobType(selectedJobType.code, selectedJobType.name)} className={btn.text}>
                      <Plus size={16} /> {t("quotation.wizard.createTemplateForJobType")}
                    </button>
                  )}
                  <button type="button" onClick={handleStartBlank} className={btn.text}>{t("quotation.wizard.startFromBlankForm")}</button>
                </div>
              </>
            )}
          </SectionCard>
        )}

        {step === "preview" && selectedJobType && (
          loadingPreview ? (
            <SectionCard title={t("quotation.wizard.step3Title")} bodyClassName="">{loadingBlock(t("quotation.wizard.loadingPreview"))}</SectionCard>
          ) : previewError ? (
            <SectionCard title={t("quotation.wizard.step3Title")} bodyClassName="">
              {errorBlock(previewError, () => { if (selectedSummary) void loadPreview(selectedSummary); }, backFromPreview, t("quotation.wizard.back"))}
            </SectionCard>
          ) : fullTemplate ? (
            <DocumentColumns
              main={
                <SectionCard title={t("quotation.wizard.step3Title")}>
                  <div className="flex flex-col gap-5">
                    <div className="flex gap-3.5 items-start">
                      <span className="w-10 h-10 rounded-[10px] bg-[#e8edf7] text-[#1a3a6b] flex items-center justify-center flex-shrink-0"><FileText size={18} /></span>
                      <div className="flex flex-col gap-1 min-w-0">
                        <span className="flex items-center gap-2.5 flex-wrap">
                          <span className="text-lg font-semibold text-foreground">{fullTemplate.templateName}</span>
                          {jobTypeChip(fullTemplate.jobTypeCode)}
                        </span>
                        {fullTemplate.description && <p className="text-sm leading-relaxed text-[#3d5173]">{fullTemplate.description}</p>}
                      </div>
                    </div>
                    <TemplatePreview template={fullTemplate} compact />
                  </div>
                </SectionCard>
              }
              rail={
                <>
                  <RailCard title={t("quotation.wizard.templateInfo")}>
                    <ReadonlyField label={t("quotation.field.jobType")} value={`${selectedJobType.code} — ${selectedJobType.name}`} />
                    <div className="grid grid-cols-2 gap-3">
                      <ReadonlyField label={t("quotation.wizard.version")} value={fullTemplate.version} />
                      <ReadonlyField label={t("quotation.wizard.size")} value={`${fullTemplate.sections.length} ${t("quotation.wizard.sections")} · ${templateItemCount} ${t("quotation.wizard.items")}`} />
                    </div>
                    <ReadonlyField
                      label={t("quotation.wizard.source")}
                      value={fullTemplate.sourceFileName ? `${fullTemplate.sourceFileName}${fullTemplate.sourceSheetName ? ` — ${fullTemplate.sourceSheetName}` : ""}` : t("templates.preview.manualSource")}
                    />
                  </RailCard>
                  <NextStepHint title={t("quotation.hint.nextTitle")}>{t("quotation.wizard.nextHint")}</NextStepHint>
                </>
              }
            />
          ) : null
        )}
      </main>
    </div>
  );
}
