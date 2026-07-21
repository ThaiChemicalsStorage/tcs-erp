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

/**
 * "สร้างใบเสนอราคา" pre-form wizard — added 2026-07-14 per the P'Suki/P'Keng requirement that a
 * new quotation must start from a Job Type + Template choice, not a blank form. See
 * docs/MODULES/QuotationTemplates.md "Required Quotation Creation Flow." This component only
 * decides *what* the new quotation should start with; `QuoteDocument.tsx` (via the
 * `templateSnapshot` prop) is what actually seeds the form once the wizard completes.
 *
 * Step count is dynamic, not fixed at 4: a Job Type with exactly one active template (TA/BF/LI)
 * skips the template-choice screen entirely and goes straight to Preview, per the task's explicit
 * "skip an unnecessary second selection since only one active template" instruction. A Job Type
 * with 2+ active templates (SC: Wet Scrubber / Activated Carbon) shows the choice screen. A Job
 * Type with zero active templates shows the empty state (still counted as the "template" step).
 */

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
  /** Set by a Global Search "Template ใบเสนอราคา" result click (see `GlobalSearch.tsx` /
   * `QuotationPage.tsx`) — jumps straight to that template's Preview step instead of starting at
   * Step 1. Consumed once at mount only; a stale/unmatched code+id (e.g. the template was
   * deactivated between the search result loading and the click) just falls back to the normal
   * Step 1 job-type grid rather than erroring. */
  initialSelection?: { jobTypeCode: string; templateId: string } | null;
  /** Whether the current user holds `quotationTemplates:create` (or `:manage`) — gates the "สร้าง
   * Template ใหม่สำหรับประเภทงานนี้" affordance on the template-choice/empty-state screens, per the
   * spec's "Do Not Confuse 'OTHER' Job Type with Blank Template" requirement: this button routes to
   * the real Template Management create flow, never to "เริ่มจากแบบฟอร์มเปล่า". */
  canCreateTemplate?: boolean;
  onCreateTemplateForJobType?: (jobTypeCode: string, jobTypeName: string) => void;
}) {
  const { t } = useI18n();

  // Resolved once, straight from props, for the lazy `useState` initializers below — NOT a
  // `useEffect` synchronous setState (that pattern is flagged by react-hooks/set-state-in-effect;
  // see the fetch-triggering effect further down for why). Falls back to `null` for a
  // stale/unmatched `initialSelection.jobTypeCode` (e.g. the Job Type was deactivated between the
  // search result loading and the click), which naturally makes every initializer below fall back
  // to the normal Step 1 job-type grid.
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

  // Per-Job-Type active-template counts for the grid's "มี Template N แบบ" / "ยังไม่มี Template"
  // badges — fetched once, unfiltered, independent of `templates` (which only ever holds the
  // *selected* Job Type's list). A separate small fetch rather than reusing/caching into `templates`
  // deliberately keeps the existing per-Job-Type fetch/retry flow below untouched.
  //
  // 2026-07-15, second Codex-review fix pass (Medium Priority): a loading-in-progress state and a
  // failed-fetch state used to both collapse into the same "no template" badge (`templateCounts`
  // was `null` while loading, then `new Map()` on failure — `badgeFor`'s `?? 0` fallback treated
  // both identically to a genuine zero-templates result), which could falsely advertise the blank
  // fallback for a Job Type that actually has templates, just not loaded yet. Now tracked as 3
  // explicit states so the grid never claims "no template" until the count is actually known.
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

  // Step 1 grid order: Job Types that already have an active Template come first (so the ones a
  // user can actually pick a template for are the first thing they see), then Job Types with no
  // Template yet, and — regardless of Template availability — every "OTHER"-prefixed catch-all
  // code (OTHER, OTHER BF, OTHER SC, OTHER TA) is pushed to the very end. Each group otherwise
  // keeps its original relative order (a stable 3-way partition, not a fresh alphabetical sort).
  // Depends on `templateCounts`, so the grid quietly reorders once that fetch resolves — the same
  // "badge appears once loaded" behavior `badgeFor` above already has.
  const isOtherJobType = (code: string) => code.startsWith("OTHER");
  const hasActiveTemplate = (code: string) => (templateCounts?.get(code) ?? 0) > 0;
  const activeJobTypes = [
    ...activeJobTypesUnsorted.filter((jt) => !isOtherJobType(jt.code) && hasActiveTemplate(jt.code)),
    ...activeJobTypesUnsorted.filter((jt) => !isOtherJobType(jt.code) && !hasActiveTemplate(jt.code)),
    ...activeJobTypesUnsorted.filter((jt) => isOtherJobType(jt.code)),
  ];

  // Kicks off the actual template fetch for a deep-linked selection — the synchronous "start
  // loading" state above already happened at mount via the lazy initializers, so this effect body
  // begins directly with the async call itself (matches the working pattern already established
  // in GlobalSearch.tsx: every setState here runs inside a `.then`/`.catch`/`.finally` callback,
  // never synchronously as the first thing the effect does).
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
    // The ref guard above makes this idempotent past the first real run, so it's safe to list every
    // value the body actually closes over — a later identity change of `initialSelection`/
    // `initialJobType` (there shouldn't be one; this component only ever mounts fresh per wizard
    // run) would just re-enter and immediately no-op via the guard.
  }, [initialSelection, initialJobType, t]);

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

  const handleStartBlank = () => {
    onComplete({
      jobTypeCode: selectedJobType?.code ?? "",
      jobTypeName: selectedJobType?.name ?? "",
      templateSnapshot: null,
    });
  };

  const handleNotifyAdmin = () => showToast(t("quotation.wizard.notifyAdminToast"));

  const backToJobType = () => {
    setStep("jobType");
    setSelectedJobType(null);
    setTemplates([]);
    setTemplatesError("");
    setSelectedSummary(null);
    setFullTemplate(null);
    setPreviewError("");
  };

  const backFromPreview = () => {
    setPreviewError("");
    setFullTemplate(null);
    // A single-template Job Type never showed the choice screen, so "back" from its preview must
    // return straight to Job Type selection, not to a screen the user never saw.
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
