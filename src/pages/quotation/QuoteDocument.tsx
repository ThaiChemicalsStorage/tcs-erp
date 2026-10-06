import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Printer, Copy, Save, Send, CheckCircle2, ThumbsUp, ThumbsDown, Trophy, Frown, Ban, XCircle, ClipboardList, GitBranch, Wand2,
  Lock, ChevronRight, Building2, type LucideIcon,
} from "lucide-react";
import { useModuleTour, type TourStep } from "../../components/GuidedTour";
import { TourReplayButton } from "../../components/TourReplayButton";
import { Combobox } from "../../components/Combobox";
import { DocumentHeader, DocumentTabs, DocumentStepper, DocumentColumns, RailTotalCard, RailCard, NextStepHint } from "../../components/ui/DocumentLayout";
import { SectionCard } from "../../components/ui/SectionCard";
import { Field, ReadonlyField } from "../../components/ui/Field";
import { MoreMenu } from "../../components/ui/MoreMenu";
import { btn, field } from "../../components/ui/styles";
import type { Company, CompanyHeaderInfo } from "../../lib/storage";
import type { Product, ProductCategory } from "../../lib/products";
import type { JobType } from "../../lib/jobTypes";
import { type User, initials } from "../../lib/users";
import {
  type Quote,
  type QuoteStatus,
  type QuoteInterest,
  type QuoteLine,
  type QuoteDraftFields,
  type QuoteUpdateFields,
  type ApprovalAction,
  type QuotePermissions,
  type DiscountMode,
  type QuoteContact,
  statusLabelKey,
  computeTotals,
  todayIso,
  plusDaysIso,
  paymentTermsOptions,
  approvalActionLabelKey,
  printQuote,
  isRevisionQuote,
  fmt,
  VAT_RATE,
  quoteContactsOf,
  normalizeContacts,
  primaryContactFields,
  blankContact,
  formatQuoteDateThai,
} from "../../lib/quotes";
import { getRevisionPredecessorId, getRevisionNumber, generateQuoteRevisionSummary, appendRevisionNoteEntry } from "../../lib/revisionDiff";
import type { Customer } from "../../lib/customers";
import { fetchScopeOfWorksByQuotation, createScopeOfWorkFromQuotation, type ScopeOfWorkSummary } from "../../lib/scopeOfWork";
import { ApiError } from "../../lib/apiClient";
import { QuoteStatusPill } from "./statusIcons";
import { InterestButtons } from "./InterestButtons";
import { LineItemsEditor, ReadonlyLineItems } from "./LineItemsEditor";
import { QuoteCustomerField } from "./QuoteCustomerField";
import { QuoteContactsEditor } from "./QuoteContactsEditor";
import { QuoteActionDialog } from "./QuoteActionDialog";
import { PrintDocument } from "./PrintDocument";
import type { QuotationWizardResult } from "./QuotationTemplateWizard";
import { ValidationSummary } from "../../components/ValidationSummary";
import { DocumentCompletionIndicator } from "../../components/DocumentCompletionIndicator";
import { AutoSaveIndicator } from "../../components/AutoSaveIndicator";
import { useDirtyTracker } from "../../hooks/useDirtyTracker";
import { useUnsavedChangesGuard } from "../../hooks/useNavigationGuard";
import { assessUnsavedRisk, type UnsavedRisk } from "../../lib/unsavedChanges";
import { DraftRecoveryBanner } from "../../components/DraftRecoveryBanner";
import { useAutoSave, useDraftBackup } from "../../hooks/useAutoSave";
import { validateQuotationForFinalization, quotationRequiredFields } from "../../lib/validation/quotationValidation";
import { mergeServerValidationErrors } from "../../lib/validation/types";
import { useI18n, type TranslationKey } from "../../lib/i18n";
import { formatDisplayDate, formatDisplayDateTime } from "../../lib/displayDate";

const VALIDATION_EXEMPT_ACTIONS = new Set<ApprovalAction>(["rejected", "cancelled"]);

/** ช่องที่ยังแก้ได้หลังส่งขออนุมัติ (ความสนใจบันทึกทันทีผ่าน onInterestChange จึงไม่อยู่ในนี้) — ตรงกับ POST_SUBMIT_EDITABLE_FIELDS ฝั่งเซิร์ฟเวอร์ */
export type QuoteFollowUpFields = Pick<Quote, "poRef" | "followUpDate" | "isPotentialOpportunity">;

// ทุกช่องที่ผู้ใช้แก้เองได้ ตัด status ออก เพราะสถานะมาจาก workflow ไม่ใช่การพิมพ์ ใช้เทียบหา "การแก้ไขที่ยังไม่ได้บันทึก"
// Everything the user can actually change, minus `status`, which moves through the approval
// workflow rather than through the form. Used only for the unsaved-changes comparison.
function toGuardPayload({ status, ...rest }: QuoteDraftFields): Omit<QuoteDraftFields, "status"> {
  void status;
  return rest;
}

// รายการเงื่อนไขการชำระเงินที่ขึ้นมาให้เลือก — เป็น**ข้อเสนอแนะ** ไม่ใช่ค่าที่บังคับ ดูคอมเมนต์ที่
// `paymentTermsOptions` ใน `lib/quotes.ts` · คงที่ทั้งไฟล์ จึงสร้างไว้นอกคอมโพเนนต์ครั้งเดียว
const paymentTermsSuggestions = paymentTermsOptions.map((value) => ({ value }));

// ยุบข้อความหลายบรรทัดให้เหลือบรรทัดเดียว — ใช้กับ "เงื่อนไขการชำระเงิน" ที่ตอนนี้เป็นช่องพิมพ์ (`<input>`)
//
// เทมเพลตใบเสนอราคาบางอันส่งเงื่อนไขมาเป็นหลายบรรทัด (`applyTemplate.ts` join ด้วย `\n` เช่น
// "30% Down payment / 40% …" ของเทมเพลต Wet Scrubber) แต่ `<input>` ตัด CR/LF ทิ้งเงียบ ๆ ตามสเปก
// HTML สเตทกับ DOM จะไม่ตรงกันทันที · ใบพิมพ์ก็ยุบขึ้นบรรทัดใหม่เป็นช่องว่างอยู่แล้ว (`PrintDocument.tsx`
// วาง `Field` ไว้ในแถว flex ไม่มี `whitespace-pre-line`) การยุบตรงนี้จึงไม่เปลี่ยนสิ่งที่พิมพ์ออกมา
function singleLine(text: string): string {
  return text.replace(/\s*\r?\n\s*/g, " / ");
}

const DEFAULT_TERMS = "1. ราคานี้ยังไม่รวมค่าขนส่งและค่าติดตั้ง\n2. ราคามีผลภายใน 30 วันนับจากวันที่ในเอกสาร\n3. การส่งมอบภายใน 45 วันทำการหลังได้รับ PO\n4. การชำระเงินมัดจำ 30% ก่อนเริ่มผลิต";

// หน้าตากล่องยืนยันของแต่ละขั้น (ดีไซน์ใหม่ 2026-09-30) — ปุ่มยืนยันใช้ชื่อการกระทำจริง
const ACTION_DIALOG: Record<ApprovalAction, {
  icon: LucideIcon; tone: "info" | "success" | "danger"; title?: TranslationKey; desc: TranslationKey; help: TranslationKey;
  confirm?: TranslationKey; danger?: boolean; closeLabel?: boolean;
}> = {
  submitted: { icon: Send, tone: "info", desc: "quotation.dialog.submitted.desc", help: "quotation.dialog.helpApprover" },
  approved: { icon: CheckCircle2, tone: "success", title: "quotation.dialog.approved.title", desc: "quotation.dialog.approved.desc", help: "quotation.dialog.helpPreparer" },
  rejected: { icon: ThumbsDown, tone: "danger", desc: "quotation.dialog.rejected.desc", help: "quotation.dialog.rejected.help", confirm: "quotation.action.rejectBtn", danger: true },
  sent_to_customer: { icon: Send, tone: "info", desc: "quotation.dialog.sent.desc", help: "quotation.dialog.helpHistory" },
  customer_accepted: { icon: CheckCircle2, tone: "success", desc: "quotation.dialog.accepted.desc", help: "quotation.dialog.helpHistory" },
  customer_rejected: { icon: XCircle, tone: "danger", desc: "quotation.dialog.customerRejected.desc", help: "quotation.dialog.reasonRequired", danger: true },
  marked_won: { icon: Trophy, tone: "success", desc: "quotation.dialog.won.desc", help: "quotation.dialog.helpHistory" },
  marked_lost: { icon: Frown, tone: "danger", desc: "quotation.dialog.lost.desc", help: "quotation.dialog.helpHistory" },
  cancelled: { icon: Ban, tone: "danger", desc: "quotation.dialog.cancelled.desc", help: "quotation.dialog.reasonRequired", danger: true, closeLabel: true },
};

const ACTION_ICON: Record<ApprovalAction, LucideIcon> = {
  submitted: Send, approved: ThumbsUp, rejected: ThumbsDown, sent_to_customer: Send, customer_accepted: CheckCircle2,
  customer_rejected: XCircle, marked_won: Trophy, marked_lost: Frown, cancelled: Ban,
};
const NEGATIVE_ACTIONS = new Set<ApprovalAction>(["rejected", "customer_rejected", "marked_lost", "cancelled"]);

// ขั้นของแถบขั้นตอน — ลูกค้าปฏิเสธ/เสียโอกาสแตกออกจากขั้นที่ 5 · ยกเลิกไม่มีแถบ
function stepsFor(status: QuoteStatus, t: (k: TranslationKey) => string): { steps: { label: string }[]; current: number } | null {
  const base = [t("quotation.status.draft"), t("quotation.status.pendingApproval"), t("quotation.status.approved"), t("quotation.status.sentToCustomer")];
  if (status === "ยกเลิก") return null;
  if (status === "ลูกค้าปฏิเสธ" || status === "เสียโอกาส") {
    return { steps: [...base, t("quotation.status.customerRejected"), t("quotation.status.lost")].map((label) => ({ label })), current: status === "เสียโอกาส" ? 6 : 4 };
  }
  const order: QuoteStatus[] = ["ร่าง", "รออนุมัติ", "อนุมัติแล้ว", "ส่งให้ลูกค้าแล้ว", "ลูกค้ายอมรับ", "ปิดการขายสำเร็จ"];
  const idx = order.indexOf(status);
  return {
    steps: [...base, t("quotation.status.customerAccepted"), t("quotation.step.closed")].map((label) => ({ label })),
    current: status === "ปิดการขายสำเร็จ" ? 6 : Math.max(idx, 0),
  };
}

// จำนวนวันจากวันนี้ (หรือวันที่กำหนด) ถึงวันที่ ISO — null เมื่อวันที่ว่าง/ไม่ถูกต้อง
function daysBetween(fromIso: string, toIso: string): number | null {
  if (!fromIso || !toIso) return null;
  const a = Date.parse(`${fromIso}T00:00:00`);
  const b = Date.parse(`${toIso}T00:00:00`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

// กล่องบอกสถานะ/ขั้นต่อไปของใบที่ล็อกแล้ว — สีตามสถานะ (เหลือง = รออนุมัติ, เขียว = อนุมัติ/ลูกค้ายอมรับ)
function StatusHint({ tone, children }: { tone: "amber" | "green" | "blue" | "grey"; children: ReactNode }) {
  const cls = {
    amber: "bg-[#fdf3e0] border-[#efd3a0] text-[#6b4600]",
    green: "bg-[#e6f4ec] border-[#b5dcc6] text-[#14603b]",
    blue: "bg-[#e8f0fb] border-[#b9d0f0] text-[#16407a]",
    grey: "bg-[#f4f6fa] border-border text-[#3d5173]",
  }[tone];
  return (
    <div className={`rounded-xl border p-4 flex gap-2.5 ${cls}`}>
      <Lock size={16} className="flex-shrink-0 mt-0.5" />
      <p className="text-[13px] leading-relaxed">{children}</p>
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <span aria-hidden="true" className="w-[34px] h-[34px] rounded-full bg-[#e8edf7] text-[#1a3a6b] text-[13px] font-semibold flex items-center justify-center flex-shrink-0">
      {initials(name) || "—"}
    </span>
  );
}

// แบบฟอร์มใบเสนอราคาแบบเต็ม รวมข้อมูลลูกค้า รายการสินค้า ขั้นตอนอนุมัติ และมุมมองสำหรับพิมพ์
// Full quotation document: an editable form while Draft, a read-only record from Pending onward
// (2026-09-30 lock — only the sales follow-up fields stay editable), plus print preview and history.
export function QuoteDocument({
  mode,
  quote,
  allQuotes,
  wizardResult,
  nextId,
  company,
  currentUser,
  users,
  products,
  categories,
  jobTypes,
  customers,
  permissions,
  canViewScopeOfWork,
  canCreateScopeOfWork,
  onOpenScopeOfWork,
  onBack,
  onSave,
  onSaveFollowUp,
  onAutoSave,
  onDuplicate,
  onRewrite,
  onInterestChange,
  onWorkflowAction,
  showToast,
}: {
  mode: "new" | "detail";
  quote?: Quote;
  allQuotes: Quote[];
  wizardResult?: QuotationWizardResult | null;
  nextId: string;
  company: Company;
  currentUser: User;
  users: User[];
  products: Product[];
  categories: ProductCategory[];
  jobTypes: JobType[];
  customers: Customer[];
  permissions: QuotePermissions;
  canViewScopeOfWork: boolean;
  canCreateScopeOfWork: boolean;
  onOpenScopeOfWork: (scopeOfWorkId: string) => void;
  onBack: () => void;
  onSave: (data: QuoteDraftFields) => Promise<void>;
  /** บันทึกช่องติดตามการขายของใบที่ล็อกแล้ว (เลข PO วันที่ติดตาม โอกาสในการขาย) */
  onSaveFollowUp: (data: QuoteFollowUpFields) => Promise<void>;
  /** บันทึกอัตโนมัติเบื้องหลัง — มีเฉพาะเอกสารที่มีอยู่จริงบนเซิร์ฟเวอร์แล้วเท่านั้น */
  onAutoSave: (data: QuoteDraftFields) => Promise<void>;
  onDuplicate: () => void;
  onRewrite: () => Promise<void>;
  onInterestChange: (v: QuoteInterest) => void;
  onWorkflowAction: (action: ApprovalAction, comment: string, draft: QuoteUpdateFields) => Promise<void>;
  showToast: (msg: string) => void;
}) {
  const { t } = useI18n();
  const isDetail = mode === "detail" && !!quote;

  const customerSnapshot = quote?.customerSnapshot;

  const [client, setClient] = useState(customerSnapshot?.companyName ?? quote?.client ?? "");
  const quoteStatus: QuoteStatus = quote?.status ?? "ร่าง";

  const templateSnapshot = wizardResult?.templateSnapshot ?? null;
  const quotationTemplateId = quote?.quotationTemplateId ?? templateSnapshot?.quotationTemplateId ?? "";
  const quotationTemplateName = quote?.quotationTemplateName ?? templateSnapshot?.quotationTemplateName ?? "";
  const quotationTemplateVersion = quote?.quotationTemplateVersion ?? templateSnapshot?.quotationTemplateVersion ?? "";

  const [lines, setLines] = useState<QuoteLine[]>(quote?.lines ?? templateSnapshot?.lines ?? []);
  const [discount, setDiscount] = useState(quote?.discount ?? 0);
  // หน่วยของส่วนลดพิเศษ — เอกสารเดิมที่ไม่เคยระบุไว้ถือเป็น "%" ส่วนเอกสารใหม่เริ่มต้นเป็นบาท
  // Unit of the special discount. A stored quotation that never recorded one is percent (that is
  // what every quotation written before 2026-08-25 meant); a brand-new quotation starts in baht,
  // which is what the business actually asked for.
  const [discountMode, setDiscountMode] = useState<DiscountMode>(quote?.discountMode ?? (mode === "new" ? "amount" : "percent"));
  // หน่วยเริ่มต้นของส่วนลด "ระดับรายการ" — ตั้งครั้งเดียวตอนเปิดเอกสารและไม่ผูกกับปุ่มสลับของส่วนลดพิเศษ
  // The line-level default, fixed once when the document opens. Deliberately not tied to the
  // special-discount toggle: the two levels switch units independently.
  const [defaultLineDiscountMode] = useState<DiscountMode>(mode === "new" ? "amount" : "percent");
  const [salesperson, setSalesperson] = useState(quote?.salesperson ?? currentUser.fullName);
  // ผู้ติดต่อหลายคน (2026-09-07) — ใบที่มี `contacts` ใช้เลย · ใบเก่าที่มีแค่สามช่องเดิมได้คนเดียวตาม
  // ลำดับเดิม snapshot → ค่าในใบ → ว่าง (ดู Quotation.md "Customer Selection") · ไม่มีใครเลยให้แถวว่างหนึ่งแถว
  const [contacts, setContacts] = useState<QuoteContact[]>(() => {
    if (quote?.contacts?.length) return quote.contacts;
    const seeded = quoteContactsOf({
      contactName: customerSnapshot?.contactName ?? quote?.contactName ?? "",
      contactPhone: customerSnapshot?.phone ?? quote?.contactPhone ?? "",
      contactEmail: customerSnapshot?.email ?? quote?.contactEmail ?? "",
    });
    return seeded.length > 0 ? seeded : [blankContact()];
  });
  const [address, setAddress] = useState(customerSnapshot?.address ?? quote?.address ?? "");
  const [taxId, setTaxId] = useState(customerSnapshot?.taxId ?? quote?.taxId ?? "");
  const [deliveryMethod, setDeliveryMethod] = useState(customerSnapshot?.deliveryMethod ?? quote?.deliveryMethod ?? "");
  const [deliveryAddress, setDeliveryAddress] = useState(customerSnapshot?.deliveryAddress ?? quote?.deliveryAddress ?? "");
  const [project, setProject] = useState(customerSnapshot?.projectName ?? quote?.project ?? "");
  const [poRef, setPoRef] = useState(quote?.poRef ?? "");
  const [paymentTerms, setPaymentTerms] = useState(singleLine(quote?.paymentTerms ?? (templateSnapshot?.paymentTerms || paymentTermsOptions[0])));
  const [issueDate, setIssueDate] = useState(quote?.issueDate ?? todayIso());
  const [expiryDate, setExpiryDate] = useState(quote?.expiryDate ?? plusDaysIso(30));
  const [remarks, setRemarks] = useState(quote?.remarks ?? (templateSnapshot?.remarks || company.termsAndConditions || DEFAULT_TERMS));
  const [revisionNote, setRevisionNote] = useState(quote?.revisionNote ?? "");
  const [jobTypeCode, setJobTypeCode] = useState(quote?.jobTypeCode ?? wizardResult?.jobTypeCode ?? "");
  const [jobTypeName, setJobTypeName] = useState(quote?.jobTypeName ?? wizardResult?.jobTypeName ?? "");
  const [isPotentialOpportunity, setIsPotentialOpportunity] = useState(quote?.isPotentialOpportunity ?? false);
  const [followUpDate, setFollowUpDate] = useState(quote?.followUpDate ?? "");

  // ── ล็อกหลังส่งขออนุมัติ (2026-09-30) ──────────────────────────────────────────────────────
  // `contentEditable` = ใบใหม่ หรือใบร่างที่ผู้ใช้แก้ได้ → ฟอร์มเต็ม · นอกนั้นเป็นหน้าอ่านอย่างเดียว
  // `followUpEditable` = ใบที่พ้นร่างแล้วแต่ผู้ใช้ยังดูแลการติดตามการขายได้ (เลข PO วันที่ติดตาม โอกาส ความสนใจ)
  const contentEditable = permissions.canEditContent;
  const locked = isDetail && quoteStatus !== "ร่าง";
  const followUpEditable = locked && permissions.canEdit;

  const originalCustomerId = quote?.customerId ?? "";
  const [customerId, setCustomerId] = useState(originalCustomerId);
  const customerChanged = customerId !== originalCustomerId;
  const canChangeCustomer = contentEditable;

  // เติมข้อมูลลูกค้าทั้งหมดในแบบฟอร์มจากลูกค้าที่เลือก รวมถึงช่องที่ว่างเปล่าด้วย
  // Fills in all customer fields on the form from the selected customer, including blank ones
  const handleSelectCustomer = (c: Customer) => {
    setCustomerId(c.id);
    setClient(c.companyName);
    // ทะเบียนลูกค้ามีผู้ติดต่อหลักคนเดียว — ทับเฉพาะแถวแรก แถวที่พิมพ์เพิ่มไว้คงอยู่
    setContacts((prev) => [{ ...(prev[0] ?? blankContact()), name: c.contactName, phone: c.phone, email: c.email }, ...prev.slice(1)]);
    setAddress(c.address);
    setTaxId(c.taxId);
    setDeliveryMethod(c.deliveryMethod);
    setProject(c.projectName);
    setDeliveryAddress(c.deliveryAddress);
  };
  const handleClearCustomer = () => setCustomerId("");

  const companyHeader: CompanyHeaderInfo = {
    name: company.name, nameEn: "", logoDataUrl: company.logoDataUrl, address: company.address,
    phone: company.phone, fax: "", email: company.email, website: company.website,
    facebookName: company.facebookName, lineId: company.lineId, taxId: company.taxId,
    branchName: "", branchCode: "", stampDataUrl: company.stampDataUrl,
  };

  const [tab, setTab] = useState<"details" | "preview" | "history">("details");
  const [pendingAction, setPendingAction] = useState<ApprovalAction | null>(null);
  const [actionComment, setActionComment] = useState("");
  const [actionError, setActionError] = useState("");
  const [rewriteBusy, setRewriteBusy] = useState(false);
  // เขียนใบเสนอราคาใหม่ พร้อมกันการกดซ้ำระหว่างที่กำลังดำเนินการ
  // Triggers rewrite, guarding against a repeat click while the request is in flight
  const handleRewriteClick = async () => {
    if (rewriteBusy) return;
    setRewriteBusy(true);
    try {
      await onRewrite();
    } finally {
      setRewriteBusy(false);
    }
  };

  const [existingScopeOfWork, setExistingScopeOfWork] = useState<ScopeOfWorkSummary | null>(null);
  const [scopeOfWorkBusy, setScopeOfWorkBusy] = useState(false);
  const [scopeOfWorkPromptOpen, setScopeOfWorkPromptOpen] = useState(false);
  const [scopeOfWorkNumber, setScopeOfWorkNumber] = useState("");
  const [scopeOfWorkPromptError, setScopeOfWorkPromptError] = useState("");
  useEffect(() => {
    if (!isDetail || !canViewScopeOfWork) return;
    let cancelled = false;
    fetchScopeOfWorksByQuotation(quote!.id)
      .then((list) => { if (!cancelled) setExistingScopeOfWork(list[0] ?? null); })
      .catch(() => { if (!cancelled) setExistingScopeOfWork(null); });
    return () => { cancelled = true; };
  }, [isDetail, quote, canViewScopeOfWork]);

  // เปิด Scope of Work ที่มีอยู่แล้ว หรือเปิดกล่องให้กรอกเลขที่เอกสารเพื่อสร้างใหม่
  // Opens the existing Scope of Work, or opens the dialog to create one with a document number
  const handleScopeOfWorkClick = () => {
    if (!quote) return;
    if (existingScopeOfWork) {
      onOpenScopeOfWork(existingScopeOfWork.id);
      return;
    }
    setScopeOfWorkPromptError("");
    setScopeOfWorkNumber("");
    setScopeOfWorkPromptOpen(true);
  };

  // สร้าง Scope of Work ใหม่จากใบเสนอราคานี้ด้วยเลขที่เอกสารที่กรอก แล้วเปิดขึ้นมา
  // Creates a new Scope of Work from this quote with the entered document number, then opens it
  const confirmCreateScopeOfWork = async () => {
    if (!quote || scopeOfWorkBusy) return;
    const scopeNumber = scopeOfWorkNumber.trim();
    if (!scopeNumber) { setScopeOfWorkPromptError(t("quotation.sow.numberRequired")); return; }
    setScopeOfWorkBusy(true);
    try {
      const created = await createScopeOfWorkFromQuotation(quote.id, scopeNumber);
      setScopeOfWorkPromptOpen(false);
      onOpenScopeOfWork(created.id);
    } catch (err) {
      setScopeOfWorkPromptError(err instanceof ApiError ? err.message : t("quotation.sow.createError"));
    } finally {
      setScopeOfWorkBusy(false);
    }
  };

  const docTourSteps: TourStep[] = [
    { element: '[data-tour="qdoc-primary"]', manual: "ch6-3", popover: { title: t("tour.qdoc.primary.title"), description: t("tour.qdoc.primary.desc"), side: "bottom" } },
    { element: '[data-tour="qdoc-more"]', manual: "ch6-4", popover: { title: t("tour.qdoc.more.title"), description: t("tour.qdoc.more.desc"), side: "bottom" } },
    { element: '[data-tour="qdoc-stepper"]', manual: "ch6-3", popover: { title: t("tour.qdoc.stepper.title"), description: t("tour.qdoc.stepper.desc"), side: "bottom" } },
    { element: '[data-tour="qdoc-customer"]', manual: "ch6-2", popover: { title: t("tour.qdoc.customer.title"), description: t("tour.qdoc.customer.desc"), side: "top" } },
    { element: '[data-tour="qdoc-items"]', manual: "ch6-2", popover: { title: t("tour.qdoc.items.title"), description: t("tour.qdoc.items.desc"), side: "top" } },
  ];
  const docTour = useModuleTour("quotationDoc", currentUser.id, docTourSteps, { autoStart: isDetail });

  const totals = computeTotals(lines, discount, discountMode);
  const { total } = totals;
  const jobTypeDisplay = jobTypeCode ? `${jobTypeCode} — ${jobTypeName}` : "";
  const itemCount = lines.filter((l) => !l.isSectionHeader).length;

  // เปลี่ยนประเภทงานที่เลือก แล้วอัปเดตชื่อประเภทงานที่แสดงให้ตรงกัน
  // Changes the selected job type and syncs its display name
  const handleJobTypeChange = (code: string) => {
    setJobTypeCode(code);
    setJobTypeName(jobTypes.find((jt) => jt.code === code)?.name ?? "");
  };

  // รวบรวมข้อมูลร่างปัจจุบันบนหน้าจอทั้งหมดเป็นก้อนเดียวสำหรับบันทึก/ส่งอนุมัติ
  // Gathers the current on-screen draft into one object for saving or workflow actions
  const currentDraft = (): QuoteDraftFields => ({
    client, status: quoteStatus, lines, discount, discountMode, amount: total,
    salesperson, ...primaryContactFields(normalizeContacts(contacts)), contacts: normalizeContacts(contacts), address, taxId,
    deliveryMethod, deliveryAddress, project, poRef, paymentTerms, issueDate, expiryDate, remarks,
    revisionNote,
    jobTypeCode,
    jobTypeName,
    isPotentialOpportunity,
    followUpDate,
    ...(customerChanged ? { customerId } : {}),
    ...(mode === "new" && quotationTemplateId ? { quotationTemplateId } : {}),
  });
  const followUpPayload: QuoteFollowUpFields = { poRef, followUpDate, isPotentialOpportunity };

  // ── บันทึกอัตโนมัติ (2026-08-25) ───────────────────────────────────────
  // สองชั้น: สำเนาในเครื่องกันร่างหาย (ใช้ได้แม้ยังไม่เคยกดบันทึกเลย) และบันทึกขึ้นเซิร์ฟเวอร์เงียบ ๆ
  // สำหรับใบที่มีอยู่แล้วและยังเป็นฉบับร่าง — ดู src/hooks/useAutoSave.ts
  //
  // Two layers. The local snapshot protects a brand-new quotation (no server record yet); an
  // existing Draft also auto-saves for real. Anything past ร่าง is locked (2026-09-30): only its
  // follow-up fields can change, through the follow-up card's Save button (with an audit entry),
  // and they keep their own local snapshot under a separate key.
  const draftSnapshot = currentDraft();
  const canAutoSaveToServer = contentEditable && isDetail;
  // ตัด status ออกจากการเทียบ เพราะสถานะเปลี่ยนจาก workflow (อนุมัติ/ส่งให้ลูกค้า) ไม่ใช่จากการพิมพ์ของผู้ใช้
  const guardPayload: object | null = contentEditable ? toGuardPayload(draftSnapshot) : followUpEditable ? followUpPayload : null;
  const dirty = useDirtyTracker<object>(guardPayload);
  // ส่งขออนุมัติ/ถูกปฏิเสธกลับ บนหน้าเดิม = สิ่งที่ติดตามเปลี่ยนรูปทั้งก้อน (ฟอร์มเต็ม ↔ ช่องติดตามการขาย) —
  // ต้องตั้งฐานเทียบใหม่ ไม่งั้นการออกจากหน้าครั้งถัดไปจะถามว่า "ยังไม่ได้บันทึก" ทั้งที่ไม่มีอะไรค้าง
  const editScope = contentEditable ? "content" : followUpEditable ? "followUp" : "none";
  const editScopeRef = useRef(editScope);
  const guardPayloadRef = useRef(guardPayload);
  useEffect(() => { guardPayloadRef.current = guardPayload; });
  useEffect(() => {
    if (editScopeRef.current === editScope) return;
    editScopeRef.current = editScope;
    dirty.markSaved(guardPayloadRef.current ?? undefined);
  }, [editScope, dirty]);
  const draftBackup = useDraftBackup<QuoteDraftFields>({
    storageKey: isDetail ? `quotation:${quote!.id}` : "quotation:new",
    data: draftSnapshot,
    enabled: contentEditable,
  });
  const followUpBackup = useDraftBackup<QuoteFollowUpFields>({
    storageKey: isDetail ? `quotation:${quote!.id}:followUp` : null,
    data: followUpPayload,
    enabled: followUpEditable,
  });
  const autoSave = useAutoSave<QuoteDraftFields>({
    data: draftSnapshot,
    enabled: canAutoSaveToServer,
    onSave: onAutoSave,
  });

  // ใบที่ยังไม่เคยบันทึก (mode === "new") ไม่มีเรคอร์ดบนเซิร์ฟเวอร์ให้ auto-save ยิงไปหา และใบที่พ้นสถานะร่าง
  // แล้วก็ถูกกันออกจาก auto-save โดยตั้งใจ — สองกรณีนี้คือที่ที่งานหายจริง
  const guardRisk = (): UnsavedRisk => assessUnsavedRisk({
    isDirty: dirty.isDirtyNow(),
    hasServerRecord: isDetail,
    autoSaveEnabled: canAutoSaveToServer,
    autoSaveState: autoSave.state,
  });

  // นำร่างที่กู้คืนมาใส่กลับลงในแบบฟอร์มทั้งหมด
  // Puts a recovered snapshot back into the form. `status`/`amount` are derived, never restored.
  const applyRecoveredDraft = (d: QuoteDraftFields) => {
    setClient(d.client);
    setLines(d.lines);
    setDiscount(d.discount);
    setDiscountMode(d.discountMode ?? "percent");
    setSalesperson(d.salesperson);
    // สำเนาร่างที่บันทึกไว้ก่อน 2026-09-07 ไม่มี `contacts` แต่มีสามช่องเดิม
    const recoveredContacts = d.contacts?.length ? d.contacts : quoteContactsOf(d);
    setContacts(recoveredContacts.length > 0 ? recoveredContacts : [blankContact()]);
    setAddress(d.address);
    setTaxId(d.taxId);
    setDeliveryMethod(d.deliveryMethod);
    setDeliveryAddress(d.deliveryAddress);
    setProject(d.project);
    setPoRef(d.poRef);
    setPaymentTerms(singleLine(d.paymentTerms));
    setIssueDate(d.issueDate);
    setExpiryDate(d.expiryDate);
    setRemarks(d.remarks);
    setRevisionNote(d.revisionNote);
    setJobTypeCode(d.jobTypeCode);
    setJobTypeName(d.jobTypeName);
    setIsPotentialOpportunity(d.isPotentialOpportunity);
    setFollowUpDate(d.followUpDate);
    if (canChangeCustomer && d.customerId !== undefined) setCustomerId(d.customerId);
    draftBackup.clear();
    showToast(t("common.draftRecovery.restoredToast"));
  };
  const applyRecoveredFollowUp = (d: QuoteFollowUpFields) => {
    setPoRef(d.poRef);
    setFollowUpDate(d.followUpDate);
    setIsPotentialOpportunity(d.isPotentialOpportunity);
    followUpBackup.clear();
    showToast(t("common.draftRecovery.restoredToast"));
  };

  const revisionPredecessorId = isDetail && quote ? getRevisionPredecessorId(quote.id) : null;
  // สร้างสรุปการแก้ไขอัตโนมัติโดยเทียบใบต้นฉบับกับร่างปัจจุบัน
  // Auto-generates a revision-note summary by diffing the predecessor quote against the current draft
  const handleGenerateRevisionNote = () => {
    if (!revisionPredecessorId || !quote) return;
    const predecessor = allQuotes.find((q) => q.id === revisionPredecessorId);
    if (!predecessor) {
      showToast(t("quotation.revisionNote.noPredecessor"));
      return;
    }
    const summary = generateQuoteRevisionSummary(predecessor, currentDraft());
    setRevisionNote(appendRevisionNoteEntry(predecessor.revisionNote, getRevisionNumber(quote.id), summary));
    showToast(t("quotation.revisionNote.generatedToast"));
  };

  const clientValidation = useMemo(
    () => validateQuotationForFinalization({
      client, salesperson, ...primaryContactFields(normalizeContacts(contacts)), address, taxId,
      deliveryMethod, deliveryAddress, project, poRef, paymentTerms, issueDate, expiryDate,
      jobTypeCode, remarks, followUpDate, isPotentialOpportunity,
    }),
    [client, salesperson, contacts, address, taxId, deliveryMethod, deliveryAddress,
      project, poRef, paymentTerms, issueDate, expiryDate, jobTypeCode, remarks,
      followUpDate, isPotentialOpportunity],
  );
  const [serverValidationErrors, setServerValidationErrors] = useState<{ fieldErrors: Record<string, string>; groupErrors: Record<string, string[]> } | null>(null);
  const validation = mergeServerValidationErrors(clientValidation, serverValidationErrors);
  const validationSummaryMessages = [...Object.values(validation.fieldErrors), ...Object.values(validation.groupErrors).flat()];
  const totalRequiredChecks = Object.values(quotationRequiredFields).filter((f) => f.required).length;
  const summaryRef = useRef<HTMLDivElement>(null);
  const blockedTooltip = t("quotation.blockedTooltip");

  const scrollToSummary = () => {
    setTab("details");
    summaryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // เรียกใช้ workflow action ก็ต่อเมื่อเอกสารผ่านการตรวจสอบครบถ้วนแล้ว (ยกเว้นบาง action)
  // Runs a workflow action only when the document passes validation (except exempt actions)
  const guardedWorkflowAction = (action: ApprovalAction) => {
    if (!VALIDATION_EXEMPT_ACTIONS.has(action) && !validation.valid) {
      showToast(blockedTooltip);
      scrollToSummary();
      return;
    }
    openAction(action);
  };

  // ตรวจสอบความครบถ้วน บันทึกสถานะการพิมพ์ที่เซิร์ฟเวอร์ แล้วเปิดหน้าต่างพิมพ์ของเบราว์เซอร์
  // Validates completeness, records the print on the server, then opens the browser print dialog
  const handlePrintClick = async () => {
    if (!validation.valid) {
      showToast(blockedTooltip);
      scrollToSummary();
      return;
    }
    setServerValidationErrors(null);
    try {
      await printQuote(quote!.id);
      window.print();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("quotation.printError"));
      if (err instanceof ApiError && err.code === "DOCUMENT_INCOMPLETE") {
        setServerValidationErrors({ fieldErrors: err.fieldErrors ?? {}, groupErrors: err.groupErrors ?? {} });
        scrollToSummary();
      }
    }
  };

  // คำเตือนตอนรีเฟรช/ปิดแท็บ — อ่านสัญญาณเดียวกับกล่องในแอป จึงพูดเฉพาะตอนที่งานเสี่ยงหายจริง
  // The refresh/close warning reads the same signal as the in-app dialog and speaks up only when
  // work is really at risk. The browser owns this dialog's buttons, so Save/Don't-save cannot be offered.
  const guardRiskRef = useRef(guardRisk);
  useEffect(() => {
    guardRiskRef.current = guardRisk;
  });
  const anythingEditable = contentEditable || followUpEditable;
  useEffect(() => {
    if (!anythingEditable) return;
    const handler = (e: BeforeUnloadEvent) => {
      if (guardRiskRef.current() === "none") return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [anythingEditable]);

  // บันทึกใบเสนอราคาหลังตรวจข้อมูลจำเป็นเบื้องต้น พร้อมกันบันทึกซ้ำระหว่างกำลังส่งคำขอ
  // Saves the quote after basic required-field checks, guarding against a concurrent duplicate save.
  // On a locked quotation it saves only the follow-up fields (the server rejects anything else).
  const [savingBusy, setSavingBusy] = useState(false);
  const save = async (message: string): Promise<boolean> => {
    if (savingBusy) return false;
    if (!contentEditable) {
      if (!followUpEditable) return false;
      setSavingBusy(true);
      try {
        const saved = followUpPayload;
        await onSaveFollowUp(saved);
        followUpBackup.clear();
        dirty.markSaved(saved);
        showToast(message);
        return true;
      } catch {
        return false;
      } finally {
        setSavingBusy(false);
      }
    }
    if (!client.trim()) { showToast(t("quotation.errorClientRequired")); return false; }
    if (mode === "new" && !jobTypeCode) { showToast(t("quotation.errorJobTypeRequired")); return false; }
    setSavingBusy(true);
    try {
      const saved = currentDraft();
      await onSave(saved);
      // สำเนาในเครื่องหมดหน้าที่แล้ว — โดยเฉพาะคีย์ "quotation:new" ที่ต้องลบทิ้งทันทีที่สร้างเอกสารสำเร็จ
      draftBackup.clear();
      // ส่ง payload ที่บันทึกไปจริง ไม่ใช่สิ่งที่อยู่บนจอตอนนี้ — ถ้าผู้ใช้พิมพ์ต่อระหว่างรอผลบันทึก
      // ตัวอักษรที่พิมพ์เพิ่มยังไม่เคยขึ้นเซิร์ฟเวอร์ และต้องถูกบันทึกอัตโนมัติต่อไป
      autoSave.markSaved(saved);
      dirty.markSaved(toGuardPayload(saved));
      showToast(message);
      return true;
    } catch {
      // caller already surfaced the error toast; nothing further to do
      return false;
    } finally {
      setSavingBusy(false);
    }
  };
  const saveMessage = mode === "new" ? t("quotation.savedDraftToast") : t("quotation.savedToast");

  // การ์ด "ยังไม่ได้บันทึก" — ปุ่ม "บันทึก" ในกล่องคือปุ่มบันทึกจริงของหน้านี้ ผ่าน validation เดิมทุกข้อ
  // สำหรับใบใหม่ การ "บันทึก" คือการ "สร้าง" เอกสาร (onSave → createQuote) ไม่ใช่การ PATCH
  const { requestLeave } = useUnsavedChangesGuard(
    anythingEditable
      ? {
          getRisk: guardRisk,
          documentLabel: isDetail && quote ? quote.id : client.trim(),
          save: () => save(saveMessage),
          discard: contentEditable ? draftBackup.clear : followUpBackup.clear,
        }
      : null,
  );

  const commentRequired = pendingAction === "rejected" || pendingAction === "customer_rejected" || pendingAction === "cancelled";
  const openAction = (a: ApprovalAction) => { setPendingAction(a); setActionComment(""); setActionError(""); };
  const [actionBusy, setActionBusy] = useState(false);
  // ยืนยันและดำเนินการ workflow action ที่ค้างอยู่ พร้อมตรวจสอบความครบถ้วน/ความคิดเห็นก่อนส่ง
  // Confirms and runs the pending workflow action. Only a Draft carries its on-screen content along
  // (the Submit click bundling the last edits); a locked quotation sends an empty draft — the server
  // refuses content changes past ร่าง with 409 (2026-09-30).
  const confirmAction = async () => {
    if (!pendingAction || actionBusy) return;
    if (!VALIDATION_EXEMPT_ACTIONS.has(pendingAction) && !validation.valid) { setActionError(blockedTooltip); return; }
    if (commentRequired && !actionComment.trim()) { setActionError(t("quotation.errorCommentRequired")); return; }
    setServerValidationErrors(null);
    setActionBusy(true);
    try {
      await onWorkflowAction(pendingAction, actionComment.trim(), contentEditable ? currentDraft() : {});
      setPendingAction(null);
    } catch (err) {
      if (err instanceof ApiError && err.code === "DOCUMENT_INCOMPLETE") {
        setServerValidationErrors({ fieldErrors: err.fieldErrors ?? {}, groupErrors: err.groupErrors ?? {} });
        setPendingAction(null);
        scrollToSummary();
      } else if (err instanceof ApiError) {
        setActionError(err.message);
      }
    } finally {
      setActionBusy(false);
    }
  };

  const preparerUser = isDetail
    ? users.find((u) => u.id === quote!.createdByUserId)
    : currentUser;
  const reversedApprovalHistory = isDetail ? [...quote!.approvalHistory].reverse() : [];
  const lastApprovalEntry = reversedApprovalHistory.find((e) => e.action === "approved");
  const lastSubmitEntry = reversedApprovalHistory.find((e) => e.action === "submitted");
  const approverUser = lastApprovalEntry ? users.find((u) => u.id === lastApprovalEntry.userId) : undefined;
  const preparerName = preparerUser?.fullName ?? salesperson;
  // preparerDate/approverDate ไปลงใบพิมพ์ (printProps) จึงเป็นไทยเสมอ · บนจอใช้ preparerDateDisplay ตามภาษาที่เลือก
  const preparerDate = isDetail ? quote!.date : formatQuoteDateThai(todayIso());
  const preparerDateDisplay = isDetail ? quote!.date : formatDisplayDate(todayIso());
  const approverDate = lastApprovalEntry ? formatQuoteDateThai(lastApprovalEntry.createdAt) : "";
  const dateTime = formatDisplayDateTime;

  // ── ปุ่มบนหัวเอกสาร ─────────────────────────────────────────────────────────────────────
  // ปุ่มหลักหนึ่งปุ่ม = ขั้นต่อไปของงาน · ปุ่มรองของขั้นเดียวกัน (ปฏิเสธ/ลูกค้าปฏิเสธ) อยู่ข้าง ๆ ·
  // คำสั่งที่ใช้ไม่บ่อย (คัดลอก Scope of Work แก้ไข ยกเลิก) อยู่ใน "เพิ่มเติม ▾"
  const primaryAction: ApprovalAction | null =
    permissions.canSubmit ? "submitted"
    : permissions.canApprove ? "approved"
    : permissions.canSendToCustomer ? "sent_to_customer"
    : permissions.canMarkCustomerAccepted ? "customer_accepted"
    : permissions.canMarkWon ? "marked_won"
    : permissions.canMarkLost ? "marked_lost"
    : null;
  const secondaryAction: ApprovalAction | null =
    permissions.canReject ? "rejected" : permissions.canMarkCustomerRejected ? "customer_rejected" : null;
  const PrimaryIcon = primaryAction ? ACTION_ICON[primaryAction] : null;
  const actionButtonLabel = (a: ApprovalAction) => (a === "rejected" ? t("quotation.action.rejectBtn") : t(approvalActionLabelKey[a]));
  const runAction = (a: ApprovalAction) => (VALIDATION_EXEMPT_ACTIONS.has(a) ? openAction(a) : guardedWorkflowAction(a));
  const actionBlocked = (a: ApprovalAction) => !VALIDATION_EXEMPT_ACTIONS.has(a) && !validation.valid;

  const moreItems = [
    isDetail && permissions.canDuplicate && { key: "duplicate", label: t("quotation.menu.duplicate"), icon: Copy, onSelect: onDuplicate },
    isDetail && canViewScopeOfWork && (existingScopeOfWork || canCreateScopeOfWork) && {
      key: "sow", icon: ClipboardList, onSelect: handleScopeOfWorkClick, disabled: scopeOfWorkBusy,
      label: existingScopeOfWork ? t("quotation.menu.openScopeOfWork") : t("quotation.sow.create"),
    },
    isDetail && permissions.canRewrite && {
      key: "rewrite", icon: GitBranch, onSelect: () => { void handleRewriteClick(); }, disabled: rewriteBusy,
      label: t("quotation.menu.rewrite"), hint: t("quotation.menu.rewriteHint"),
    },
    permissions.canCancel && { key: "cancel", icon: Ban, danger: true, label: t("quotation.action.cancelled"), onSelect: () => openAction("cancelled") },
  ];

  const headerMeta = contentEditable ? (
    <>
      {canAutoSaveToServer && <AutoSaveIndicator state={autoSave.state} lastSavedAt={autoSave.lastSavedAt} />}
      {!isDetail && <AutoSaveIndicator state="idle" lastSavedAt={null} localOnly />}
      <DocumentCompletionIndicator totalCount={totalRequiredChecks} missingCount={validation.missingCount} />
    </>
  ) : isDetail ? (
    <span className="inline-flex items-center gap-1.5">
      <Lock size={14} />
      {!locked ? t("quotation.lock.readonly") : permissions.canApprove ? t("quotation.lock.awaitingYou") : t("quotation.lock.locked")}
    </span>
  ) : null;

  const headerActions = (
    <div data-tour="qdoc-actions" className="flex items-center gap-2.5 flex-wrap">
      <TourReplayButton variant="title" onClick={docTour.start} />
      {permissions.canExport && (
        <button type="button" onClick={handlePrintClick} disabled={!validation.valid} title={!validation.valid ? blockedTooltip : undefined} className={btn.secondary}>
          <Printer size={16} /> {t("quotation.printPdf")}
        </button>
      )}
      {contentEditable && (
        <button type="button" onClick={() => { void save(saveMessage); }} disabled={savingBusy} className={btn.secondary}>
          <Save size={16} /> {mode === "new" ? t("quotation.saveDraft") : t("common.save")}
        </button>
      )}
      {moreItems.some(Boolean) && <div data-tour="qdoc-more"><MoreMenu items={moreItems} /></div>}
      {secondaryAction && (
        <button type="button" onClick={() => runAction(secondaryAction)} disabled={actionBlocked(secondaryAction)} title={actionBlocked(secondaryAction) ? blockedTooltip : undefined} className={btn.secondary}>
          <XCircle size={16} className="text-[#b93636]" /> {actionButtonLabel(secondaryAction)}
        </button>
      )}
      {primaryAction && PrimaryIcon && (
        <button type="button" data-tour="qdoc-primary" onClick={() => runAction(primaryAction)} disabled={actionBlocked(primaryAction)} title={actionBlocked(primaryAction) ? blockedTooltip : undefined} className={btn.primary}>
          <PrimaryIcon size={16} /> {actionButtonLabel(primaryAction)}
        </button>
      )}
    </div>
  );

  const stepper = stepsFor(quoteStatus, t);
  const expiryFromIssue = daysBetween(issueDate, expiryDate);
  const expiryRemaining = daysBetween(todayIso(), expiryDate);
  const normalizedContacts = normalizeContacts(contacts);
  const input = `${field.input} w-full`;

  // ── การ์ด "ติดตามการขาย" (คอลัมน์ขวา) — แก้ได้ทั้งตอนร่างและหลังล็อก ─────────────────────────
  const followUpCard = (
    <RailCard
      title={t("quotation.followUp.title")}
      actions={followUpEditable ? (
        <button type="button" onClick={() => { void save(t("quotation.savedToast")); }} disabled={savingBusy} className={btn.secondarySm}>
          <Save size={14} /> {t("common.save")}
        </button>
      ) : undefined}
    >
      {contentEditable || followUpEditable ? (
        <>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              role="switch"
              checked={isPotentialOpportunity}
              onChange={(e) => setIsPotentialOpportunity(e.target.checked)}
              className="peer sr-only"
            />
            <span aria-hidden="true" className={`relative mt-0.5 w-10 h-[22px] rounded-full flex-shrink-0 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-[#1a5fb4]/40 ${isPotentialOpportunity ? "bg-[#0b1d3a]" : "bg-[#c3ccda]"}`}>
              <span className={`absolute top-[3px] w-4 h-4 rounded-full bg-white transition-all ${isPotentialOpportunity ? "left-[21px]" : "left-[3px]"}`} />
            </span>
            <span className="flex flex-col leading-snug">
              <span className="text-sm font-medium text-foreground">{t("quotation.tab.opportunity")}</span>
              <span className="text-xs text-muted-foreground">{t("quotation.followUp.opportunityHelp")}</span>
            </span>
          </label>
          {isDetail && (
            <div className="flex flex-col gap-1.5">
              <span className={field.label}>{t("quotation.field.customerInterestLevel")}</span>
              <InterestButtons value={quote!.interest} onChange={onInterestChange} />
            </div>
          )}
          <Field label={t("quotation.field.followUpDate")} htmlFor="quote-followUpDate">
            <input id="quote-followUpDate" type="date" className={input} value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
          </Field>
          {followUpEditable && (
            <Field label={t("quotation.field.poRef")} htmlFor="quote-poRef" help={t("quotation.followUp.editableHelp")}>
              <input id="quote-poRef" className={`${input} font-mono`} value={poRef} onChange={(e) => setPoRef(e.target.value)} placeholder={t("quotation.field.poRefPlaceholder")} />
            </Field>
          )}
        </>
      ) : (
        <>
          <ReadonlyField label={t("quotation.tab.opportunity")} value={isPotentialOpportunity ? t("quotation.followUp.opportunityYes") : t("quotation.followUp.opportunityNo")} />
          <div className="grid grid-cols-2 gap-3">
            <ReadonlyField label={t("quotation.col.interest")} value={quote?.interest ? t(quote.interest === "น่าสนใจ" ? "quotation.interest.interested" : "quotation.interest.notInterested") : t("quotation.interest.notEvaluated")} />
            <ReadonlyField label={t("quotation.field.followUpDate")} value={formatDisplayDate(followUpDate)} />
          </div>
        </>
      )}
    </RailCard>
  );

  const signatureImg = (user: User | undefined, alt: string) =>
    user?.signatureDataUrl ? <img src={user.signatureDataUrl} alt={alt} className="h-9 max-w-[180px] object-contain object-left" /> : null;

  const approvalCard = locked && (quoteStatus === "รออนุมัติ" ? (
    <RailCard title={t("quotation.approvalCard.requestTitle")}>
      <div className="flex items-center gap-2.5">
        <Avatar name={preparerName} />
        <ReadonlyField label={t("quotation.role.preparer")} value={lastSubmitEntry?.roleName ? `${preparerName} · ${lastSubmitEntry.roleName}` : preparerName} />
      </div>
      {signatureImg(preparerUser, preparerName)}
      <ReadonlyField label={t("quotation.approvalCard.submittedAt")} value={lastSubmitEntry ? dateTime(lastSubmitEntry.createdAt) : ""} />
    </RailCard>
  ) : (
    <RailCard title={t("quotation.approvalCard.title")}>
      {lastApprovalEntry ? (
        <>
          <div className="flex items-center gap-2.5">
            <Avatar name={approverUser?.fullName ?? lastApprovalEntry.userName} />
            <ReadonlyField label={t("quotation.role.approver")} value={approverUser?.fullName ?? lastApprovalEntry.userName} />
          </div>
          {signatureImg(approverUser, approverUser?.fullName ?? lastApprovalEntry.userName)}
          <ReadonlyField label={t("quotation.approvalCard.approvedAt")} value={dateTime(lastApprovalEntry.createdAt)} />
          {lastApprovalEntry.comment && <ReadonlyField label={t("quotation.modal.commentLabel")} value={lastApprovalEntry.comment} />}
          <div className="h-px bg-[#eef1f6]" />
        </>
      ) : null}
      <ReadonlyField label={t("quotation.role.preparer")} value={`${preparerName} · ${preparerDateDisplay}`} />
      {signatureImg(preparerUser, preparerName)}
      {isDetail && quote!.approvalHistory.length > 0 && (
        <button type="button" onClick={() => setTab("history")} className={`${btn.text} self-start`}>
          {t("quotation.approvalCard.viewHistory")} <ChevronRight size={16} />
        </button>
      )}
    </RailCard>
  ));

  const lockedHint = (() => {
    if (!isDetail || contentEditable) return null;
    if (!locked) return <StatusHint tone="grey">{t("quotation.hint.readonlyDraft")}</StatusHint>;
    switch (quoteStatus) {
      case "รออนุมัติ":
        return <StatusHint tone="amber">{permissions.canApprove ? t("quotation.hint.pendingApprover") : t("quotation.hint.pending")}</StatusHint>;
      case "อนุมัติแล้ว":
        return <StatusHint tone="green">{t("quotation.hint.approved")}</StatusHint>;
      case "ส่งให้ลูกค้าแล้ว":
        return <StatusHint tone="blue">{t("quotation.hint.sent")}</StatusHint>;
      case "ลูกค้ายอมรับ":
        return <StatusHint tone="green">{t("quotation.hint.accepted")}</StatusHint>;
      case "ลูกค้าปฏิเสธ":
        return <StatusHint tone="amber">{t("quotation.hint.customerRejected")}</StatusHint>;
      default:
        return <StatusHint tone="grey">{t("quotation.hint.closed")}</StatusHint>;
    }
  })();

  const historyList = (
    <ol className="m-0 p-0 list-none flex flex-col">
      {reversedApprovalHistory.map((entry, i) => {
        const Icon = ACTION_ICON[entry.action];
        const negative = NEGATIVE_ACTIONS.has(entry.action);
        return (
          <li key={entry.id} className="flex gap-3.5">
            <span className="flex flex-col items-center flex-shrink-0">
              <span className={`w-7 h-7 rounded-full flex items-center justify-center ${negative ? "bg-[#fcebeb] text-[#b93636]" : "bg-[#e8f0fb] text-[#1a5fb4]"}`}>
                <Icon size={14} />
              </span>
              <span aria-hidden="true" className={`w-0.5 flex-1 min-h-3 ${i === reversedApprovalHistory.length - 1 ? "bg-transparent" : "bg-border"}`} />
            </span>
            <div className="flex-1 min-w-0 pb-4 flex flex-col gap-1">
              <div className="flex items-baseline gap-2.5 flex-wrap">
                <span className="text-sm font-semibold text-foreground">{entry.userName}</span>
                <span className="text-[13px] text-muted-foreground">{entry.roleName}</span>
                <span className={`text-[13px] font-semibold ${negative ? "text-[#b93636]" : "text-[#1a5fb4]"}`}>{t(approvalActionLabelKey[entry.action])}</span>
                <span className="flex-1" />
                <span className="text-xs text-muted-foreground tabular-nums">{dateTime(entry.createdAt)}</span>
              </div>
              {entry.comment && <p className="px-3 py-2 bg-[#f8f9fc] border border-[#eef1f6] rounded-lg text-[13.5px] text-[#3d5173] break-words">{entry.comment}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );

  const historyCard = isDetail && (
    <SectionCard
      title={t("quotation.section.approvalHistory")}
      actions={<span className="text-[13px] text-muted-foreground">{t("ui.itemCount").replace("{n}", String(quote!.approvalHistory.length))}</span>}
    >
      {quote!.approvalHistory.length > 0 ? historyList : <p className="text-sm text-muted-foreground">{t("quotation.history.empty")}</p>}
    </SectionCard>
  );

  const revisionCard = isDetail && quote && isRevisionQuote(quote.id) && (contentEditable || revisionNote.trim()) && (
    <SectionCard
      title={t("quotation.revisionNote.title")}
      actions={contentEditable ? (
        <button type="button" onClick={handleGenerateRevisionNote} disabled={!revisionPredecessorId} className={btn.secondarySm}>
          <Wand2 size={14} /> {t("quotation.revisionNote.generate")}
        </button>
      ) : undefined}
      className="print:hidden"
    >
      {contentEditable ? (
        <Field label={t("quotation.revisionNote.title")} htmlFor="quote-revisionNote" help={t("quotation.revisionNote.help").replace("{id}", revisionPredecessorId || "-")}>
          <textarea
            id="quote-revisionNote"
            rows={6}
            className={`${field.textarea} w-full resize-y font-mono text-[13px]`}
            value={revisionNote}
            onChange={(e) => setRevisionNote(e.target.value)}
            placeholder={t("quotation.revisionNote.placeholder")}
          />
        </Field>
      ) : (
        <p className="text-[13px] font-mono leading-relaxed whitespace-pre-line break-words text-foreground">{revisionNote}</p>
      )}
    </SectionCard>
  );

  const printProps = {
    isDetail, quote, nextId, companyHeader, client, contacts: normalizedContacts, address, taxId, deliveryMethod, deliveryAddress,
    project, poRef, paymentTerms, issueDate, expiryDate, jobTypeName: jobTypeDisplay, lines, discount, discountMode, remarks,
    preparerUser, approverUser, preparerName, preparerDate, approverName: approverUser?.fullName ?? "", approverDate,
  };

  // ── เนื้อหาแท็บ "รายละเอียด" ───────────────────────────────────────────────────────────────
  const editableMain = (
    <>
      <SectionCard title={t("quotation.section.customer")} className="print:hidden">
        <div data-tour="qdoc-customer" className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
          <div className="sm:col-span-2">
            <QuoteCustomerField
              inputId="quote-client"
              customers={customers}
              customerId={customerId}
              onSelect={handleSelectCustomer}
              onClear={handleClearCustomer}
              client={client}
              onClientChange={setClient}
              canChangeCustomer={canChangeCustomer}
              error={validation.fieldErrors.client}
            />
          </div>
          <Field label={t("quotation.field.address")} htmlFor="quote-address" className="sm:col-span-2">
            <input id="quote-address" className={input} value={address} onChange={(e) => setAddress(e.target.value)} placeholder={t("quotation.field.addressPlaceholder")} />
          </Field>
          <Field label={t("quotation.field.taxId")} htmlFor="quote-taxId">
            <input id="quote-taxId" className={`${input} font-mono`} value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder={t("quotation.field.taxIdPlaceholder")} />
          </Field>
          <div className="sm:col-span-2 pt-4 border-t border-[#eef1f6]">
            {/* ผู้ติดต่อได้หลายคน (2026-09-07) — โครงเดียวกับปุ่ม "เพิ่มเลข PO" ของ Scope of Work ตามที่เจ้าของขอ */}
            <QuoteContactsEditor contacts={contacts} onChange={setContacts} disabled={false} />
          </div>
        </div>
      </SectionCard>

      <SectionCard title={t("quotation.section.docInfo")} className="print:hidden">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-4">
          <Field label={t("quotation.field.project")} htmlFor="quote-project" className="sm:col-span-2">
            <input id="quote-project" className={input} value={project} onChange={(e) => setProject(e.target.value)} />
          </Field>
          <Field label={t("quotation.field.jobType")} htmlFor="quote-jobType" required={mode === "new"}>
            <select id="quote-jobType" className={input} value={jobTypeCode} onChange={(e) => handleJobTypeChange(e.target.value)}>
              {mode === "new"
                ? <option value="" disabled>{t("quotation.field.jobTypeSelectPrompt")}</option>
                : <option value="">{t("quotation.field.jobTypeUnclassified")}</option>}
              {jobTypes.filter((jt) => jt.isActive || jt.code === jobTypeCode).map((jt) => (
                <option key={jt.id} value={jt.code}>{jt.code} — {jt.name}</option>
              ))}
            </select>
          </Field>
          <Field label={t("quotation.field.issueDate")} htmlFor="quote-issueDate" error={validation.fieldErrors.issueDate}>
            <input id="quote-issueDate" type="date" className={input} value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          </Field>
          <Field
            label={t("quotation.field.expiryDate")}
            htmlFor="quote-expiryDate"
            error={validation.fieldErrors.expiryDate}
            help={expiryFromIssue !== null && expiryFromIssue >= 0 ? t("quotation.expiry.fromIssue").replace("{n}", String(expiryFromIssue)) : undefined}
          >
            <input id="quote-expiryDate" type="date" className={input} value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
          </Field>
          <Field label={t("quotation.field.poRef")} htmlFor="quote-poRef">
            <input id="quote-poRef" className={`${input} font-mono`} value={poRef} onChange={(e) => setPoRef(e.target.value)} placeholder={t("quotation.field.poRefPlaceholder")} />
          </Field>
          <Field label={t("quotation.field.salesperson")} htmlFor="quote-salesperson">
            <input id="quote-salesperson" className={input} value={salesperson} onChange={(e) => setSalesperson(e.target.value)} />
          </Field>
          <Field label={t("quotation.field.deliveryMethod")} htmlFor="quote-deliveryMethod">
            <input id="quote-deliveryMethod" className={input} value={deliveryMethod} onChange={(e) => setDeliveryMethod(e.target.value)} placeholder={t("quotation.field.deliveryMethodPlaceholder")} />
          </Field>
          <Field label={t("quotation.field.paymentTerms")} htmlFor="quote-paymentTerms" className="sm:col-span-2 lg:col-span-3">
            {/* พิมพ์เงื่อนไขเองได้ทั้งหมด รายการที่ขึ้นมาเป็นแค่ทางลัด ไม่ใช่ค่าที่บังคับ */}
            <Combobox
              id="quote-paymentTerms"
              className={input}
              value={paymentTerms}
              onChange={setPaymentTerms}
              options={paymentTermsSuggestions}
              maxLength={300}
              ariaLabel={t("quotation.field.paymentTerms")}
              placeholder={t("quotation.field.paymentTermsPlaceholder")}
            />
          </Field>
          <Field label={t("quotation.field.deliveryAddress")} htmlFor="quote-deliveryAddress" className="sm:col-span-2 lg:col-span-3">
            <input id="quote-deliveryAddress" className={input} value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} placeholder={t("quotation.field.deliveryAddressPlaceholder")} />
          </Field>
        </div>
      </SectionCard>
    </>
  );

  const readonlyMain = (
    <>
      <SectionCard title={t("quotation.section.customer")} className="print:hidden">
        <div data-tour="qdoc-customer" className="grid grid-cols-1 sm:grid-cols-3 gap-x-5 gap-y-4">
          <div className="sm:col-span-2 flex items-center gap-3 min-w-0">
            <span className="w-9 h-9 rounded-lg bg-[#e8edf7] text-[#1a3a6b] flex items-center justify-center flex-shrink-0"><Building2 size={18} /></span>
            <ReadonlyField label={t("quotation.field.clientName")} value={client} />
          </div>
          <ReadonlyField label={t("quotation.field.taxId")} value={taxId} mono />
          <ReadonlyField label={t("quotation.field.address")} value={address} className="sm:col-span-3" />
          {(normalizedContacts.length > 0 ? normalizedContacts : [blankContact()]).map((c) => (
            <div key={c.id} className="sm:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-x-5 gap-y-4">
              <ReadonlyField label={t("quotation.field.contactName")} value={c.name ? <>{c.name}{c.position && <span className="block text-xs font-normal text-muted-foreground">{c.position}</span>}</> : ""} />
              <ReadonlyField label={t("quotation.field.contactPhone")} value={c.phone} />
              <ReadonlyField label={t("quotation.field.contactEmail")} value={c.email} />
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title={t("quotation.section.docInfo")} className="print:hidden">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-5 gap-y-4">
          <ReadonlyField label={t("quotation.field.project")} value={project} className="sm:col-span-2" />
          <ReadonlyField label={t("quotation.field.jobType")} value={jobTypeDisplay} />
          <ReadonlyField label={t("quotation.field.issueDate")} value={formatDisplayDate(issueDate)} />
          <ReadonlyField
            label={t("quotation.field.expiryDate")}
            value={expiryDate ? (
              <>
                {formatDisplayDate(expiryDate)}
                {expiryRemaining !== null && (
                  <span className="block text-xs font-normal text-muted-foreground">
                    {expiryRemaining >= 0 ? t("quotation.expiry.remaining").replace("{n}", String(expiryRemaining)) : t("quotation.expiry.expired")}
                  </span>
                )}
              </>
            ) : ""}
          />
          {!followUpEditable && <ReadonlyField label={t("quotation.field.poRef")} value={poRef} mono />}
          <ReadonlyField label={t("quotation.field.salesperson")} value={salesperson} />
          <ReadonlyField label={t("quotation.field.deliveryMethod")} value={deliveryMethod} />
          <ReadonlyField label={t("quotation.field.deliveryAddress")} value={deliveryAddress} />
          <ReadonlyField label={t("quotation.field.paymentTerms")} value={paymentTerms} className="sm:col-span-2" />
          {quotationTemplateId && <ReadonlyField label={t("quotation.field.appliedTemplate")} value={`${quotationTemplateName} (v${quotationTemplateVersion})`} />}
        </div>
      </SectionCard>

      {quoteStatus === "รออนุมัติ" && historyCard}
    </>
  );

  const rail = (
    <>
      <RailTotalCard
        label={t("quotation.totals.grandTotal")}
        amount={`฿${fmt(total)}`}
        rows={[
          ...(totals.discountAmt > 0 ? [{ label: t("quotation.totals.discount"), value: `−฿${fmt(totals.discountAmt)}` }] : []),
          { label: t("quotation.totals.afterDiscount"), value: `฿${fmt(totals.afterDiscount)}` },
          { label: t("quotation.totals.vat").replace("{rate}", String(VAT_RATE)), value: `฿${fmt(totals.vatAmt)}` },
          { label: t("quotation.rail.items"), value: t("ui.itemCount").replace("{n}", String(itemCount)) },
        ]}
      />
      {approvalCard}
      {followUpCard}
      {contentEditable && (
        <RailCard title={t("quotation.rail.otherInfo")}>
          {quotationTemplateId && <ReadonlyField label={t("quotation.field.appliedTemplate")} value={`${quotationTemplateName} (v${quotationTemplateVersion})`} />}
          <ReadonlyField label={t("quotation.rail.createdBy")} value={`${preparerName} · ${preparerDateDisplay}`} />
        </RailCard>
      )}
      {contentEditable && (
        <NextStepHint title={t("quotation.hint.nextTitle")}>
          {mode === "new" ? t("quotation.hint.new") : t("quotation.hint.draft")}
        </NextStepHint>
      )}
      {lockedHint}
    </>
  );

  const dialogCfg = pendingAction ? ACTION_DIALOG[pendingAction] : null;
  const summaryLine = [client, project].filter((s) => s.trim()).join(" · ");

  return (
    <div className="doc-form flex-1 overflow-y-auto print:overflow-visible print:block print:h-auto">
      <div className="sticky top-0 z-20 print:hidden">
        <DocumentHeader
          backLabel={t("quotation.backToList")}
          onBack={() => requestLeave(onBack)}
          number={isDetail ? quote!.id : t("quotation.newDoc")}
          status={isDetail ? <QuoteStatusPill status={quoteStatus} label={t(statusLabelKey[quoteStatus])} /> : undefined}
          meta={headerMeta}
          actions={headerActions}
          tabs={
            <DocumentTabs
              ariaLabel={t("quotation.docTabs.ariaLabel")}
              active={tab}
              onChange={setTab}
              tabs={[
                { key: "details", label: t("quotation.docTabs.details") },
                { key: "preview", label: t("quotation.docTabs.preview") },
                ...(isDetail ? [{ key: "history" as const, label: t("quotation.docTabs.history") }] : []),
              ]}
            />
          }
        />
      </div>

      <div className="px-4 md:px-8 py-6 flex flex-col gap-5 print:block print:p-0">
        {draftBackup.recovered && draftBackup.recoveredAt !== null && (
          <DraftRecoveryBanner
            savedAt={draftBackup.recoveredAt}
            onRestore={() => applyRecoveredDraft(draftBackup.recovered!)}
            onDiscard={draftBackup.dismiss}
          />
        )}
        {followUpBackup.recovered && followUpBackup.recoveredAt !== null && (
          <DraftRecoveryBanner
            savedAt={followUpBackup.recoveredAt}
            onRestore={() => applyRecoveredFollowUp(followUpBackup.recovered!)}
            onDiscard={followUpBackup.dismiss}
          />
        )}

        <div ref={summaryRef} className="print:hidden">
          <ValidationSummary missingCount={validation.missingCount} messages={validationSummaryMessages} />
        </div>

        {tab === "details" && (
          <>
            {stepper && <div data-tour="qdoc-stepper"><DocumentStepper ariaLabel={t("quotation.stepper.ariaLabel")} steps={stepper.steps} current={stepper.current} /></div>}
            <DocumentColumns main={contentEditable ? editableMain : readonlyMain} rail={rail} />
            <div data-tour="qdoc-items" className="print:hidden">
              {contentEditable ? (
                <LineItemsEditor
                  lines={lines}
                  onChange={setLines}
                  discount={discount}
                  onDiscountChange={setDiscount}
                  discountMode={discountMode}
                  onDiscountModeChange={setDiscountMode}
                  defaultLineDiscountMode={defaultLineDiscountMode}
                  products={products}
                  categories={categories}
                  documentLabel={isDetail ? quote!.id : t("quotation.newDoc")}
                />
              ) : (
                <ReadonlyLineItems lines={lines} discount={discount} discountMode={discountMode} remarks={remarks} />
              )}
            </div>
            {contentEditable && (
              <SectionCard title={t("quotation.section.remarks")} className="print:hidden">
                <Field label={t("quotation.remarks.printedLabel")} htmlFor="quote-remarks">
                  <textarea id="quote-remarks" rows={5} className={`${field.textarea} w-full resize-y`} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
                </Field>
              </SectionCard>
            )}
            {revisionCard}
            <p className="text-xs text-muted-foreground leading-relaxed print:hidden">{t("quotation.footerNote")}</p>
          </>
        )}

        {tab === "preview" && (
          <div className="print:hidden overflow-x-auto">
            {/* ใบพิมพ์ตัวจริง (PrintDocument) ซ่อนตัวเองบนจอด้วย `hidden print:block` — ตรงนี้บังคับให้โชว์ภายในกรอบกระดาษ
                เพื่อดูก่อนพิมพ์เท่านั้น ใบที่พิมพ์ออกจริงคือตัวล่างสุดของหน้าเสมอ */}
            {/* ไม่มี py-[12mm] แล้ว — ใบพิมพ์จัดหน้าเองเป็นหน้า A4 ที่มีขอบ 12mm ในตัว (PaginatedPrintForm, 2026-10-06) */}
            <div className="mx-auto w-[210mm] bg-white border border-border rounded-xl overflow-hidden [&>div]:block">
              <PrintDocument {...printProps} />
            </div>
          </div>
        )}

        {tab === "history" && historyCard}

        <PrintDocument {...printProps} />
      </div>

      {pendingAction && dialogCfg && (
        <QuoteActionDialog
          icon={dialogCfg.icon}
          tone={dialogCfg.tone}
          title={t(dialogCfg.title ?? approvalActionLabelKey[pendingAction])}
          description={t(dialogCfg.desc)}
          summary={{ id: isDetail ? quote!.id : "", line: client, amount: `฿${fmt(total)}` }}
          error={actionError}
          cancelLabel={dialogCfg.closeLabel ? t("common.close") : undefined}
          confirmLabel={t(dialogCfg.confirm ?? approvalActionLabelKey[pendingAction])}
          confirmIcon={dialogCfg.danger ? undefined : dialogCfg.icon}
          confirmTone={dialogCfg.danger ? "danger" : "primary"}
          busy={actionBusy}
          onConfirm={confirmAction}
          onCancel={() => setPendingAction(null)}
        >
          <Field
            label={<>{t("quotation.modal.commentLabel")} {commentRequired ? <span className="text-[#b93636]">*</span> : <span className="font-normal text-muted-foreground">{t("quotation.modal.commentOptional")}</span>}</>}
            htmlFor="quote-action-comment"
            help={t(dialogCfg.help)}
          >
            <textarea
              id="quote-action-comment"
              autoFocus
              rows={3}
              className={`${field.textarea} w-full h-24 resize-none`}
              value={actionComment}
              onChange={(e) => setActionComment(e.target.value)}
              placeholder={commentRequired ? t("quotation.dialog.reasonPlaceholder") : undefined}
            />
          </Field>
        </QuoteActionDialog>
      )}

      {scopeOfWorkPromptOpen && isDetail && (
        <QuoteActionDialog
          icon={ClipboardList}
          tone="info"
          title={t("quotation.sow.create")}
          description={t("quotation.sow.desc")}
          summary={{ id: quote!.id, line: summaryLine }}
          error={scopeOfWorkPromptError}
          confirmLabel={t("quotation.sow.create")}
          confirmIcon={ClipboardList}
          busy={scopeOfWorkBusy}
          onConfirm={() => { void confirmCreateScopeOfWork(); }}
          onCancel={() => setScopeOfWorkPromptOpen(false)}
        >
          <Field label={t("quotation.sow.numberLabel")} required htmlFor="quote-sow-number" help={t("quotation.sow.numberHelp")}>
            <input
              id="quote-sow-number"
              autoFocus
              className={`${input} font-mono`}
              value={scopeOfWorkNumber}
              onChange={(e) => setScopeOfWorkNumber(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void confirmCreateScopeOfWork(); } }}
              placeholder={t("quotation.sow.numberPlaceholder")}
            />
          </Field>
        </QuoteActionDialog>
      )}
    </div>
  );
}
