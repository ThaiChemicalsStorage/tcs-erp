import { useEffect, useRef, useState } from "react";
import { ChevronLeft, FileText, AlertTriangle, RefreshCw, Loader2, PackageOpen } from "lucide-react";
import type { JobType } from "../../lib/jobTypes";
import {
  fetchQuotationTemplates, fetchQuotationTemplate,
  type QuotationTemplateSummary, type QuotationTemplate,
} from "../../lib/quotationTemplates";
import { applyTemplateToQuoteDraft, type AppliedTemplateDraft } from "./applyTemplate";
import { TemplatePreview } from "../../components/TemplatePreview";
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

  return (
    <div className="flex-1 overflow-y-auto flex items-start justify-center py-10 px-6">
      <div className="w-full max-w-3xl">
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>
            {t("quotation.wizard.title")}
          </h1>
        </div>

        {step === "jobType" && (
          <div>
            <h2 className="text-base font-medium text-foreground mb-1">{t("quotation.wizard.step1Title")}</h2>
            <p className="text-sm text-muted-foreground mb-5">{t("quotation.wizard.step1Desc")}</p>
            {activeJobTypes.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("quotation.wizard.noActiveJobTypes")}</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {activeJobTypes.map((jt) => (
                  <button
                    key={jt.id}
                    type="button"
                    onClick={() => handleSelectJobType(jt)}
                    className="flex flex-col items-start gap-1 rounded-lg border border-border bg-card px-4 py-3 text-left hover:border-[#c9a84c]/50 hover:bg-secondary/40 transition-all"
                  >
                    <span className="text-sm font-semibold text-[#c9a84c]">{jt.code}</span>
                    <span className="text-xs text-muted-foreground">{jt.name}</span>
                    <span className={`text-[10px] mt-0.5 ${(templateCounts?.get(jt.code) ?? 0) > 0 ? "text-[#2aa36b]" : "text-muted-foreground"}`}>
                      {badgeFor(jt.code)}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <button onClick={onCancel} className="mt-6 px-4 py-2 text-sm border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-colors">
              {t("quotation.wizard.cancel")}
            </button>
          </div>
        )}

        {step === "template" && selectedJobType && (
          <div>
            {loadingTemplates ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-10 justify-center">
                <Loader2 size={16} className="animate-spin" /> {t("quotation.wizard.loadingTemplates")}
              </div>
            ) : templatesError ? (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <AlertTriangle size={22} className="text-[#e08a3c]" />
                <p className="text-sm text-foreground">{templatesError}</p>
                <div className="flex gap-2">
                  <button onClick={() => void loadTemplates(selectedJobType)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors">
                    <RefreshCw size={13} /> {t("quotation.wizard.retry")}
                  </button>
                  <button onClick={backToJobType} className="px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground transition-colors">
                    {t("quotation.wizard.chooseOtherJobType")}
                  </button>
                </div>
              </div>
            ) : templates.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <PackageOpen size={22} className="text-muted-foreground" />
                <p className="text-sm text-foreground">{t("quotation.wizard.noTemplateTitle")}</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  <button onClick={handleStartBlank} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors">
                    {t("quotation.wizard.startBlank")}
                  </button>
                  <button onClick={backToJobType} className="px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground transition-colors">
                    {t("quotation.wizard.chooseOtherJobType")}
                  </button>
                  {canCreateTemplate && onCreateTemplateForJobType ? (
                    <button
                      onClick={() => onCreateTemplateForJobType(selectedJobType.code, selectedJobType.name)}
                      className="px-3 py-1.5 text-xs border border-[#c9a84c]/40 text-[#c9a84c] rounded-lg hover:bg-[#c9a84c]/10 transition-colors"
                    >
                      {t("quotation.wizard.createTemplateForJobType")}
                    </button>
                  ) : (
                    <button onClick={handleNotifyAdmin} className="px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground transition-colors">
                      {t("quotation.wizard.notifyAdmin")}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div>
                <h2 className="text-base font-medium text-foreground mb-1">{t("quotation.wizard.step2Title")}</h2>
                <p className="text-sm text-muted-foreground mb-5">{t("quotation.wizard.step2Desc")}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {templates.map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => void loadPreview(tpl)}
                      className="flex flex-col items-start gap-1.5 rounded-lg border border-border bg-card px-4 py-3.5 text-left hover:border-[#c9a84c]/50 hover:bg-secondary/40 transition-all"
                    >
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                        <FileText size={14} className="text-[#c9a84c]" /> {tpl.templateName}
                      </span>
                      <span className="text-xs text-muted-foreground line-clamp-2">{tpl.description}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {tpl.sectionCount} {t("quotation.wizard.sections")} · {tpl.itemCount} {t("quotation.wizard.items")}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="mt-6 flex items-center gap-4">
                  <button onClick={backToJobType} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
                    <ChevronLeft size={14} /> {t("quotation.wizard.back")}
                  </button>
                  <button onClick={handleStartBlank} className="text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2">
                    {t("quotation.wizard.startFromBlankForm")}
                  </button>
                  {canCreateTemplate && onCreateTemplateForJobType && (
                    <button
                      onClick={() => onCreateTemplateForJobType(selectedJobType.code, selectedJobType.name)}
                      className="text-sm text-[#c9a84c] hover:text-[#f0c040] transition-colors underline underline-offset-2"
                    >
                      {t("quotation.wizard.createTemplateForJobType")}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {step === "preview" && selectedJobType && (
          <div>
            {loadingPreview ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-10 justify-center">
                <Loader2 size={16} className="animate-spin" /> {t("quotation.wizard.loadingPreview")}
              </div>
            ) : previewError ? (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <AlertTriangle size={22} className="text-[#e08a3c]" />
                <p className="text-sm text-foreground">{previewError}</p>
                <div className="flex gap-2">
                  <button onClick={() => selectedSummary && void loadPreview(selectedSummary)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors">
                    <RefreshCw size={13} /> {t("quotation.wizard.retry")}
                  </button>
                  <button onClick={backFromPreview} className="px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground transition-colors">
                    {t("quotation.wizard.back")}
                  </button>
                </div>
              </div>
            ) : fullTemplate ? (
              <div>
                <h2 className="text-base font-medium text-foreground mb-1">{t("quotation.wizard.step3Title")}</h2>
                <div className="mt-4">
                  <TemplatePreview template={fullTemplate} compact />
                </div>

                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <button onClick={backFromPreview} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
                    <ChevronLeft size={14} /> {t("quotation.wizard.back")}
                  </button>
                  <button onClick={handleUseTemplate} className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors">
                    {t("quotation.wizard.useTemplate")}
                  </button>
                  <button onClick={handleStartBlank} className="text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2">
                    {t("quotation.wizard.startFromBlankForm")}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
