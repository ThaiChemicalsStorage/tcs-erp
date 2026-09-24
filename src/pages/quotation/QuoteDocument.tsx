import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ChevronRight, Printer, Copy, Save, Send, CheckCircle2, Building2, Hash, CalendarDays,
  ThumbsUp, ThumbsDown, Trophy, Frown, Ban, XCircle, History, ClipboardList, GitBranch, Wand2,
} from "lucide-react";
import type { DriveStep } from "driver.js";
import { useModuleTour } from "../../components/GuidedTour";
import { TourReplayButton } from "../../components/TourReplayButton";
import { PromptDialog } from "../../components/PromptDialog";
import { Combobox } from "../../components/Combobox";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import type { Company, CompanyHeaderInfo } from "../../lib/storage";
import type { Product, ProductCategory } from "../../lib/products";
import type { JobType } from "../../lib/jobTypes";
import type { User } from "../../lib/users";
import {
  type Quote, type QuoteStatus, type QuoteInterest, type QuoteLine, type QuoteDraftFields, type ApprovalAction, type QuotePermissions,
  type DiscountMode, type QuoteContact,
  statusStyle, statusLabelKey, computeTotals, todayIso, plusDaysIso, paymentTermsOptions, approvalActionLabelKey, formatQuoteDateThai,
  printQuote, isRevisionQuote,
  quoteContactsOf, normalizeContacts, primaryContactFields, blankContact,
} from "../../lib/quotes";
import { getRevisionPredecessorId, getRevisionNumber, generateQuoteRevisionSummary, appendRevisionNoteEntry } from "../../lib/revisionDiff";
import type { Customer } from "../../lib/customers";
import { fetchScopeOfWorksByQuotation, createScopeOfWorkFromQuotation, type ScopeOfWorkSummary } from "../../lib/scopeOfWork";
import { ApiError } from "../../lib/apiClient";
import { statusIcon } from "./statusIcons";
import { InterestButtons } from "./InterestButtons";
import { LineItemsEditor } from "./LineItemsEditor";
import { CustomerSelector } from "./CustomerSelector";
import { QuoteContactsEditor } from "./QuoteContactsEditor";
import { PrintDocument } from "./PrintDocument";
import type { QuotationWizardResult } from "./QuotationTemplateWizard";
import { BrandMark } from "../../components/BrandMark";
import { RequiredFieldLabel } from "../../components/RequiredFieldLabel";
import { FieldError } from "../../components/FieldError";
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
import { useI18n } from "../../lib/i18n";

const BLOCKED_TOOLTIP = "กรุณากรอกข้อมูลและเลือกหัวข้อที่จำเป็นให้ครบก่อนดำเนินการ";
const VALIDATION_EXEMPT_ACTIONS = new Set<ApprovalAction>(["rejected", "cancelled"]);

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

const ACTION_ICON: Record<ApprovalAction, React.ReactNode> = {
  submitted: <Send size={13} />,
  approved: <ThumbsUp size={13} />,
  rejected: <ThumbsDown size={13} />,
  sent_to_customer: <Send size={13} />,
  customer_accepted: <CheckCircle2 size={13} />,
  customer_rejected: <XCircle size={13} />,
  marked_won: <Trophy size={13} />,
  marked_lost: <Frown size={13} />,
  cancelled: <Ban size={13} />,
};

// แบบฟอร์มใบเสนอราคาแบบเต็ม รวมข้อมูลลูกค้า รายการสินค้า ขั้นตอนอนุมัติ และมุมมองสำหรับพิมพ์
// Full quotation document form, covering customer info, line items, approval workflow, and print view
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
  /** บันทึกอัตโนมัติเบื้องหลัง — มีเฉพาะเอกสารที่มีอยู่จริงบนเซิร์ฟเวอร์แล้วเท่านั้น */
  onAutoSave: (data: QuoteDraftFields) => Promise<void>;
  onDuplicate: () => void;
  onRewrite: () => Promise<void>;
  onInterestChange: (v: QuoteInterest) => void;
  onWorkflowAction: (action: ApprovalAction, comment: string, draft: QuoteDraftFields) => Promise<void>;
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
  // ทั้งสองระดับสลับหน่วยได้อิสระต่อกัน (เช่น ลดรายบรรทัดเป็น % แต่ลดท้ายเอกสารเป็นบาท)
  // The line-level default, fixed once when the document opens. Deliberately not tied to the
  // special-discount toggle: the two levels switch units independently, so flipping one must not
  // silently re-label the other. LineItemsEditor only falls back to this when no line has recorded
  // a unit of its own yet.
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
  const disabled = !permissions.canEdit;

  const originalCustomerId = quote?.customerId ?? "";
  const [customerId, setCustomerId] = useState(originalCustomerId);
  const customerChanged = customerId !== originalCustomerId;
  const canChangeCustomer = !disabled && (mode === "new" || quoteStatus === "ร่าง");

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
  const [scopeOfWorkPromptError, setScopeOfWorkPromptError] = useState("");
  useEffect(() => {
    if (!isDetail || !canViewScopeOfWork) return;
    let cancelled = false;
    fetchScopeOfWorksByQuotation(quote!.id)
      .then((list) => { if (!cancelled) setExistingScopeOfWork(list[0] ?? null); })
      .catch(() => { if (!cancelled) setExistingScopeOfWork(null); });
    return () => { cancelled = true; };
  }, [isDetail, quote, canViewScopeOfWork]);

  // เปิด Scope of Work ที่มีอยู่แล้ว หรือเปิด modal ให้กรอกเลขที่เอกสารเพื่อสร้างใหม่
  // Opens the existing Scope of Work, or opens the prompt to create one with a document number
  const handleScopeOfWorkClick = () => {
    if (!quote) return;
    if (existingScopeOfWork) {
      onOpenScopeOfWork(existingScopeOfWork.id);
      return;
    }
    setScopeOfWorkPromptError("");
    setScopeOfWorkPromptOpen(true);
  };

  // สร้าง Scope of Work ใหม่จากใบเสนอราคานี้ด้วยเลขที่เอกสารที่กรอก แล้วเปิดขึ้นมา
  // Creates a new Scope of Work from this quote with the entered document number, then opens it
  const confirmCreateScopeOfWork = async (scopeOfWorkNumber: string) => {
    if (!quote) return;
    const scopeNumber = scopeOfWorkNumber.trim();
    if (!scopeNumber) { setScopeOfWorkPromptError("กรุณาระบุเลขที่เอกสาร"); return; }
    setScopeOfWorkBusy(true);
    try {
      const created = await createScopeOfWorkFromQuotation(quote.id, scopeNumber);
      setScopeOfWorkPromptOpen(false);
      onOpenScopeOfWork(created.id);
    } catch (err) {
      setScopeOfWorkPromptError(err instanceof ApiError ? err.message : "ไม่สามารถสร้าง Scope of Work ได้");
    } finally {
      setScopeOfWorkBusy(false);
    }
  };

  const docTourSteps: DriveStep[] = [
    { element: '[data-tour="qdoc-actions"]', popover: { title: t("tour.qdoc.actions.title"), description: t("tour.qdoc.actions.desc"), side: "bottom" } },
    { element: '[data-tour="qdoc-customer"]', popover: { title: t("tour.qdoc.customer.title"), description: t("tour.qdoc.customer.desc"), side: "right" } },
    { element: '[data-tour="qdoc-items"]', popover: { title: t("tour.qdoc.items.title"), description: t("tour.qdoc.items.desc"), side: "top" } },
  ];
  const docTour = useModuleTour("quotationDoc", currentUser.id, docTourSteps, { autoStart: isDetail });

  const { total } = computeTotals(lines, discount, discountMode);
  const jobTypeDisplay = jobTypeCode ? `${jobTypeCode} — ${jobTypeName}` : "";

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

  // ── บันทึกอัตโนมัติ (2026-08-25) ───────────────────────────────────────
  // สองชั้น: สำเนาในเครื่องกันร่างหาย (ใช้ได้แม้ยังไม่เคยกดบันทึกเลย) และบันทึกขึ้นเซิร์ฟเวอร์เงียบ ๆ
  // สำหรับใบที่มีอยู่แล้วและยังเป็นฉบับร่าง — ดู src/hooks/useAutoSave.ts
  //
  // Two layers. The local snapshot is what answers the original complaint: a brand-new quotation
  // has no server record to save into, so `mode === "new"` gets the local layer only and is offered
  // its work back when the form is reopened. A quotation that already exists AND is still a Draft
  // also auto-saves for real. Anything past ร่าง is deliberately excluded — an approved/sent
  // quotation must only change when someone presses Save, with the audit entry that comes with it.
  const draftSnapshot = currentDraft();
  const canAutoSaveToServer = !disabled && isDetail && quoteStatus === "ร่าง";
  // ── การ์ด "ยังไม่ได้บันทึก" (2026-08-25) ─────────────────────────────────────────────────────
  // ตัด status ออกจากการเทียบ เพราะสถานะเปลี่ยนจาก workflow (อนุมัติ/ส่งให้ลูกค้า) ไม่ใช่จากการพิมพ์ของผู้ใช้
  // ถ้านับรวม พออนุมัติเสร็จเอกสารจะค้างสถานะ "ยังไม่บันทึก" แล้วเด้งถามทุกครั้งที่เปลี่ยนหน้า
  //
  // `status` is excluded from the comparison: it changes through the approval workflow, not through
  // anything the user typed. Counting it would leave every approved quotation permanently "dirty".
  const dirty = useDirtyTracker(disabled ? null : toGuardPayload(draftSnapshot));
  const draftBackup = useDraftBackup<QuoteDraftFields>({
    storageKey: isDetail ? `quotation:${quote!.id}` : "quotation:new",
    data: draftSnapshot,
    enabled: !disabled,
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

  const revisionPredecessorId = isDetail && quote ? getRevisionPredecessorId(quote.id) : null;
  // สร้างสรุปการแก้ไขอัตโนมัติโดยเทียบใบต้นฉบับกับร่างปัจจุบัน
  // Auto-generates a revision-note summary by diffing the predecessor quote against the current draft
  const handleGenerateRevisionNote = () => {
    if (!revisionPredecessorId || !quote) return;
    const predecessor = allQuotes.find((q) => q.id === revisionPredecessorId);
    if (!predecessor) {
      showToast("ไม่พบข้อมูลต้นฉบับสำหรับเปรียบเทียบ (อาจเป็นเพราะสิทธิ์การเข้าถึง)");
      return;
    }
    const summary = generateQuoteRevisionSummary(predecessor, currentDraft());
    setRevisionNote(appendRevisionNoteEntry(predecessor.revisionNote, getRevisionNumber(quote.id), summary));
    showToast("สร้างสรุปการแก้ไขอัตโนมัติแล้ว — ตรวจสอบและแก้ไขเพิ่มเติมได้ตามต้องการ");
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

  // เรียกใช้ workflow action ก็ต่อเมื่อเอกสารผ่านการตรวจสอบครบถ้วนแล้ว (ยกเว้นบาง action)
  // Runs a workflow action only when the document passes validation (except exempt actions)
  const guardedWorkflowAction = (action: ApprovalAction) => {
    if (!VALIDATION_EXEMPT_ACTIONS.has(action) && !validation.valid) {
      showToast(BLOCKED_TOOLTIP);
      summaryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    openAction(action);
  };

  // ตรวจสอบความครบถ้วน บันทึกสถานะการพิมพ์ที่เซิร์ฟเวอร์ แล้วเปิดหน้าต่างพิมพ์ของเบราว์เซอร์
  // Validates completeness, records the print on the server, then opens the browser print dialog
  const handlePrintClick = async () => {
    if (!validation.valid) {
      showToast(BLOCKED_TOOLTIP);
      summaryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setServerValidationErrors(null);
    try {
      await printQuote(quote!.id);
      window.print();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "ไม่สามารถพิมพ์ได้");
      if (err instanceof ApiError && err.code === "DOCUMENT_INCOMPLETE") {
        setServerValidationErrors({ fieldErrors: err.fieldErrors ?? {}, groupErrors: err.groupErrors ?? {} });
        summaryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  };

  // คำเตือนตอนรีเฟรช/ปิดแท็บ — เดิมใช้ฐานเทียบที่จับไว้ตอนเปิดหน้าครั้งเดียวและไม่เคยตั้งใหม่หลังบันทึก จึงเตือน
  // แม้เอกสารจะบันทึกเรียบร้อยแล้ว ซึ่งสอนให้ผู้ใช้กดข้ามคำเตือนไปเฉย ๆ ตอนนี้อ่านสัญญาณเดียวกับกล่องในแอป
  // จึงพูดเฉพาะตอนที่งานเสี่ยงหายจริง (เบราว์เซอร์ไม่ให้ใส่ปุ่มเองได้ ทางนี้จึงยังเป็นกล่องมาตรฐานของเบราว์เซอร์)
  //
  // The refresh/close warning. Its old baseline was captured once at mount and never re-seeded, so
  // it fired even on a saved, untouched quotation — which teaches people to click straight through
  // it. It now reads the same signal as the in-app dialog and speaks up only when work is really at
  // risk. The browser owns this dialog's buttons, so Save/Don't-save cannot be offered here.
  const guardRiskRef = useRef(guardRisk);
  useEffect(() => {
    guardRiskRef.current = guardRisk;
  });
  useEffect(() => {
    if (disabled) return;
    const handler = (e: BeforeUnloadEvent) => {
      if (guardRiskRef.current() === "none") return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [disabled]);

  // บันทึกใบเสนอราคาหลังตรวจข้อมูลจำเป็นเบื้องต้น พร้อมกันบันทึกซ้ำระหว่างกำลังส่งคำขอ
  // Saves the quote after basic required-field checks, guarding against a concurrent duplicate save
  const [savingBusy, setSavingBusy] = useState(false);
  const save = async (message: string): Promise<boolean> => {
    if (!client.trim()) { showToast(t("quotation.errorClientRequired")); return false; }
    if (mode === "new" && !jobTypeCode) { showToast(t("quotation.errorJobTypeRequired")); return false; }
    if (savingBusy) return false;
    setSavingBusy(true);
    try {
      const saved = currentDraft();
      await onSave(saved);
      // สำเนาในเครื่องหมดหน้าที่แล้ว — โดยเฉพาะคีย์ "quotation:new" ที่ต้องลบทิ้งทันทีที่สร้างเอกสารสำเร็จ
      // The local snapshot has served its purpose. This matters most for the "quotation:new" key:
      // once the record actually exists, leaving it behind would greet the next brand-new
      // quotation with a recovery offer for work that is already saved.
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

  // การ์ด "ยังไม่ได้บันทึก" — ปุ่ม "บันทึก" ในกล่องคือปุ่มบันทึกจริงของหน้านี้ ผ่าน validation เดิมทุกข้อ
  // สำหรับใบใหม่ การ "บันทึก" คือการ "สร้าง" เอกสาร (onSave → createQuote) ไม่ใช่การ PATCH
  const { requestLeave } = useUnsavedChangesGuard(
    disabled
      ? null
      : {
          getRisk: guardRisk,
          documentLabel: isDetail && quote ? quote.id : client.trim(),
          save: () => save(mode === "new" ? t("quotation.savedDraftToast") : t("quotation.savedToast")),
          discard: draftBackup.clear,
        },
  );

  const commentRequired = pendingAction === "rejected" || pendingAction === "customer_rejected" || pendingAction === "cancelled";
  const openAction = (a: ApprovalAction) => { setPendingAction(a); setActionComment(""); setActionError(""); };
  const [actionBusy, setActionBusy] = useState(false);
  // ยืนยันและดำเนินการ workflow action ที่ค้างอยู่ พร้อมตรวจสอบความครบถ้วน/ความคิดเห็นก่อนส่ง
  // Confirms and runs the pending workflow action, re-checking completeness and comment requirements first
  const confirmAction = async () => {
    if (!pendingAction || actionBusy) return;
    if (!VALIDATION_EXEMPT_ACTIONS.has(pendingAction) && !validation.valid) { setActionError(BLOCKED_TOOLTIP); return; }
    if (commentRequired && !actionComment.trim()) { setActionError(t("quotation.errorCommentRequired")); return; }
    setServerValidationErrors(null);
    setActionBusy(true);
    try {
      await onWorkflowAction(pendingAction, actionComment.trim(), currentDraft());
      setPendingAction(null);
    } catch (err) {
      if (err instanceof ApiError && err.code === "DOCUMENT_INCOMPLETE") {
        setServerValidationErrors({ fieldErrors: err.fieldErrors ?? {}, groupErrors: err.groupErrors ?? {} });
        summaryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
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
  const approverUser = lastApprovalEntry ? users.find((u) => u.id === lastApprovalEntry.userId) : undefined;
  const preparerDate = isDetail ? quote!.date : formatQuoteDateThai(todayIso());
  const approverDate = lastApprovalEntry ? formatQuoteDateThai(lastApprovalEntry.createdAt) : "";

  const signatureRoles = [
    { key: "preparer" as const, label: t("quotation.role.preparer") },
    { key: "approver" as const, label: t("quotation.role.approver") },
  ];

  return (
    <div className="doc-form flex-1 overflow-y-auto print:overflow-visible print:block print:h-auto">
      <div className="sticky top-0 z-10 bg-card border-b border-border px-6 py-3 flex items-center gap-3 flex-wrap print:hidden">
        <button onClick={() => requestLeave(onBack)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <ChevronRight size={14} className="rotate-180" /> {t("quotation.breadcrumb")}
        </button>
        <ChevronRight size={13} className="text-muted-foreground" />
        <span className="text-sm text-[#866d28] font-mono font-semibold">
          {isDetail ? quote!.id : t("quotation.newDoc")}
        </span>

        {isDetail && (
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusStyle[quoteStatus]}`}>
            {statusIcon[quoteStatus]} {t(statusLabelKey[quoteStatus])}
          </span>
        )}

        {isDetail && permissions.canEdit && (
          <div className="flex items-center gap-2 ml-1 pl-3 border-l border-border">
            <span className="text-xs text-muted-foreground">{t("quotation.interestLabel")}</span>
            <InterestButtons value={quote!.interest} onChange={onInterestChange} />
          </div>
        )}

        <div data-tour="qdoc-actions" className="ml-auto flex items-center gap-2 flex-wrap justify-end">
          <TourReplayButton onClick={docTour.start} />
          {/* ป้าย "เก็บร่างไว้ในเครื่อง" ใช้ได้เฉพาะใบที่ยังไม่มีอยู่จริงในระบบเท่านั้น — ใบที่บันทึกแล้วแต่
              พ้นสถานะร่างไปแล้ว (อนุมัติ/ส่งลูกค้า/ปิดการขาย) ยังแก้ไขได้ แต่ข้อความนั้นจะกลายเป็นคำโกหก
              The localOnly chip means "no server record exists yet", so it belongs to `mode === "new"`
              alone. `permissions.canEdit` is status-independent, so an approved/sent/won quotation is
              still editable — showing it there would claim the document does not exist in the system. */}
          {!disabled && canAutoSaveToServer && <AutoSaveIndicator state={autoSave.state} lastSavedAt={autoSave.lastSavedAt} />}
          {!disabled && !isDetail && <AutoSaveIndicator state="idle" lastSavedAt={null} localOnly />}
          <DocumentCompletionIndicator totalCount={totalRequiredChecks} missingCount={validation.missingCount} />
          {permissions.canExport && (
            <button
              onClick={handlePrintClick}
              disabled={!validation.valid}
              title={!validation.valid ? BLOCKED_TOOLTIP : undefined}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all ${!validation.valid ? "opacity-40 cursor-not-allowed hover:border-border hover:text-muted-foreground" : ""}`}
            >
              <Printer size={13} /> {t("quotation.printPdf")}
            </button>
          )}
          {isDetail && permissions.canDuplicate && (
            <button onClick={onDuplicate} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
              <Copy size={13} /> {t("quotation.duplicateAction")}
            </button>
          )}
          {isDetail && permissions.canRewrite && (
            <button onClick={handleRewriteClick} disabled={rewriteBusy} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all disabled:opacity-60">
              <GitBranch size={13} /> {t("quotation.rewriteAction")}
            </button>
          )}
          {isDetail && canViewScopeOfWork && (existingScopeOfWork || canCreateScopeOfWork) && (
            <button onClick={handleScopeOfWorkClick} disabled={scopeOfWorkBusy} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all disabled:opacity-60">
              <ClipboardList size={13} /> {existingScopeOfWork ? "เปิด / แก้ไข Scope of Work" : "สร้าง Scope of Work"}
            </button>
          )}
          {!disabled && (
            <button onClick={() => { void save(mode === "new" ? t("quotation.savedDraftToast") : t("quotation.savedToast")); }} disabled={savingBusy} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all disabled:opacity-60">
              <Save size={13} /> {mode === "new" ? t("quotation.saveDraft") : t("common.save")}
            </button>
          )}

          {permissions.canSubmit && (
            <button onClick={() => guardedWorkflowAction("submitted")} disabled={!validation.valid} title={!validation.valid ? BLOCKED_TOOLTIP : undefined} className={`flex items-center gap-1.5 px-4 py-1.5 text-xs bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors ${!validation.valid ? "opacity-40 cursor-not-allowed" : ""}`}>
              <Send size={13} /> {t("quotation.action.submitted")}
            </button>
          )}
          {permissions.canApprove && (
            <button onClick={() => guardedWorkflowAction("approved")} disabled={!validation.valid} title={!validation.valid ? BLOCKED_TOOLTIP : undefined} className={`flex items-center gap-1.5 px-4 py-1.5 text-xs bg-[#2aa36b] text-white rounded-lg font-semibold hover:bg-[#238f5c] transition-colors ${!validation.valid ? "opacity-40 cursor-not-allowed" : ""}`}>
              <ThumbsUp size={13} /> {t("quotation.action.approved")}
            </button>
          )}
          {permissions.canReject && (
            <button onClick={() => openAction("rejected")} className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-[#e05252] text-white rounded-lg font-semibold hover:bg-[#c94444] transition-colors">
              <ThumbsDown size={13} /> {t("quotation.action.rejectBtn")}
            </button>
          )}
          {permissions.canSendToCustomer && (
            <button onClick={() => guardedWorkflowAction("sent_to_customer")} disabled={!validation.valid} title={!validation.valid ? BLOCKED_TOOLTIP : undefined} className={`flex items-center gap-1.5 px-4 py-1.5 text-xs bg-[#3b6fc9] text-white rounded-lg font-semibold hover:bg-[#2f5aa3] transition-colors ${!validation.valid ? "opacity-40 cursor-not-allowed" : ""}`}>
              <Send size={13} /> {t("quotation.action.sentToCustomer")}
            </button>
          )}
          {permissions.canMarkCustomerAccepted && (
            <button onClick={() => guardedWorkflowAction("customer_accepted")} disabled={!validation.valid} title={!validation.valid ? BLOCKED_TOOLTIP : undefined} className={`flex items-center gap-1.5 px-4 py-1.5 text-xs bg-[#1f9d8a] text-white rounded-lg font-semibold hover:bg-[#188577] transition-colors ${!validation.valid ? "opacity-40 cursor-not-allowed" : ""}`}>
              <CheckCircle2 size={13} /> {t("quotation.action.customerAccepted")}
            </button>
          )}
          {permissions.canMarkCustomerRejected && (
            <button onClick={() => guardedWorkflowAction("customer_rejected")} disabled={!validation.valid} title={!validation.valid ? BLOCKED_TOOLTIP : undefined} className={`flex items-center gap-1.5 px-4 py-1.5 text-xs bg-[#e08a3c] text-white rounded-lg font-semibold hover:bg-[#c97627] transition-colors ${!validation.valid ? "opacity-40 cursor-not-allowed" : ""}`}>
              <XCircle size={13} /> {t("quotation.action.customerRejected")}
            </button>
          )}
          {permissions.canMarkWon && (
            <button onClick={() => guardedWorkflowAction("marked_won")} disabled={!validation.valid} title={!validation.valid ? BLOCKED_TOOLTIP : undefined} className={`flex items-center gap-1.5 px-4 py-1.5 text-xs bg-[#157347] text-white rounded-lg font-semibold hover:bg-[#125f3b] transition-colors ${!validation.valid ? "opacity-40 cursor-not-allowed" : ""}`}>
              <Trophy size={13} /> {t("quotation.action.markedWon")}
            </button>
          )}
          {permissions.canMarkLost && (
            <button onClick={() => guardedWorkflowAction("marked_lost")} disabled={!validation.valid} title={!validation.valid ? BLOCKED_TOOLTIP : undefined} className={`flex items-center gap-1.5 px-4 py-1.5 text-xs bg-[#8a94a6] text-white rounded-lg font-semibold hover:bg-[#767f90] transition-colors ${!validation.valid ? "opacity-40 cursor-not-allowed" : ""}`}>
              <Frown size={13} /> {t("quotation.action.markedLost")}
            </button>
          )}
          {permissions.canCancel && (
            <button onClick={() => openAction("cancelled")} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-[#e05252]/40 text-[#e05252] rounded-lg font-medium hover:bg-[#e05252]/10 transition-colors">
              <Ban size={13} /> {t("common.cancel")}
            </button>
          )}
        </div>
      </div>

      <div className="p-3 sm:p-6 space-y-5 max-w-5xl mx-auto print:p-0 print:max-w-none">
        {draftBackup.recovered && draftBackup.recoveredAt !== null && (
          <DraftRecoveryBanner
            savedAt={draftBackup.recoveredAt}
            onRestore={() => applyRecoveredDraft(draftBackup.recovered!)}
            onDiscard={draftBackup.dismiss}
          />
        )}

        <div ref={summaryRef}>
          <ValidationSummary missingCount={validation.missingCount} messages={validationSummaryMessages} />
        </div>

        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {/* หัวเอกสาร: ที่อยู่บริษัทซ้าย ชื่อเอกสารขวา — ห้ามใช้ flex-wrap ตรงนี้ (บั๊กที่แก้ 2026-09-07)
              flex-wrap ตัดสินใจขึ้นบรรทัดใหม่จากความกว้าง max-content ของแต่ละก้อน ที่อยู่จริงของบริษัท
              ยาวเกินความกว้างการ์ดทั้งใบเมื่ออยู่บรรทัดเดียว ก้อนซ้ายจึงกินทั้งแถวและดันชื่อเอกสารตกลง
              มาบรรทัดล่าง กลายเป็นก้อนแคบ ๆ ชิดซ้ายที่ยังจัดข้อความชิดขวาอยู่ข้างใน อ่านแล้วเหมือนย่อหน้าเบี้ยว
              ทางที่ถูกคือซ้อนกันบนจอเล็ก แล้วเรียงสองคอลัมน์ตั้งแต่ sm ขึ้นไปโดยให้ก้อนซ้ายยืดหยุ่นแทน */}
          <div className="bg-[#0b1d3a] px-4 sm:px-7 py-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between print:hidden">
            <div className="min-w-0 sm:flex-1">
              <div className="flex items-center gap-2.5 mb-1">
                {companyHeader.logoDataUrl ? (
                  <img src={companyHeader.logoDataUrl} alt={companyHeader.name} className="h-8 max-w-[140px] object-contain" />
                ) : (
                  <BrandMark size={28} variant="full" theme="dark" />
                )}
              </div>
              <p className="text-[#a8bed8] text-sm mt-1">{companyHeader.name} · {companyHeader.address}</p>
              <p className="text-[#a8bed8] text-sm">{t("quotation.field.contactPhone")}: {companyHeader.phone} · {t("settings.company.emailLabel")}: {companyHeader.email}</p>
            </div>
            <div className="sm:text-right sm:shrink-0">
              <h1 className="text-[#c9a84c] text-xl font-bold">{t("quotation.pageTitle")}</h1>
              <p className="text-[#a8bed8] text-xs font-mono mt-1">QUOTATION</p>
              <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#c9a84c]/20 text-[#c9a84c] border border-[#c9a84c]/30">
                {statusIcon[quoteStatus]}
                {t(statusLabelKey[quoteStatus])}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 border-b border-border print:hidden">
            <div data-tour="qdoc-customer" className="p-6 border-b sm:border-b-0 sm:border-r border-border">
              <h2 className="text-xs font-semibold text-muted-foreground mb-3 flex items-center gap-1.5"><Building2 size={10} /> {t("quotation.section.customerInfo")}</h2>
              <div className="space-y-2.5">
                <div>
                  <label htmlFor="quote-customerSelector" className="text-xs text-muted-foreground block mb-1">{t("quotation.customerSelector.label")}</label>
                  <CustomerSelector
                    inputId="quote-customerSelector"
                    customers={customers}
                    selectedId={customerId}
                    onSelect={handleSelectCustomer}
                    onClear={handleClearCustomer}
                    disabled={!canChangeCustomer}
                  />
                  {!canChangeCustomer && !disabled && (
                    <p className="text-xs text-muted-foreground mt-1">{t("quotation.customerSelector.lockedNotDraft")}</p>
                  )}
                </div>
                <div>
                  <RequiredFieldLabel htmlFor="quote-client">{t("quotation.field.clientName")}</RequiredFieldLabel>
                  <input id="quote-client" disabled={disabled} className="w-full text-sm font-medium text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60" value={client} onChange={(e) => setClient(e.target.value)} />
                  <FieldError message={validation.fieldErrors.client} />
                </div>
                <div>
                  <RequiredFieldLabel required={false} htmlFor="quote-contact-0-name">{t("quotation.field.contactName")}</RequiredFieldLabel>
                  {/* ผู้ติดต่อได้หลายคน (2026-09-07) — โครงเดียวกับปุ่ม "เพิ่มเลข PO" ของ Scope of Work ตามที่เจ้าของขอ */}
                  <QuoteContactsEditor contacts={contacts} onChange={setContacts} disabled={disabled} />
                </div>
                <div>
                  <RequiredFieldLabel required={false} htmlFor="quote-address">{t("quotation.field.address")}</RequiredFieldLabel>
                  <input id="quote-address" disabled={disabled} className="w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60" value={address} onChange={(e) => setAddress(e.target.value)} placeholder={t("quotation.field.addressPlaceholder")} />
                </div>
                <div>
                  <RequiredFieldLabel required={false} htmlFor="quote-taxId">{t("quotation.field.taxId")}</RequiredFieldLabel>
                  <input id="quote-taxId" disabled={disabled} className="w-full text-sm font-mono text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60" value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder={t("quotation.field.taxIdPlaceholder")} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <RequiredFieldLabel required={false} htmlFor="quote-deliveryMethod">{t("quotation.field.deliveryMethod")}</RequiredFieldLabel>
                    <input id="quote-deliveryMethod" disabled={disabled} className="w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60" value={deliveryMethod} onChange={(e) => setDeliveryMethod(e.target.value)} placeholder={t("quotation.field.deliveryMethodPlaceholder")} />
                  </div>
                  <div>
                    <RequiredFieldLabel required={false} htmlFor="quote-project">{t("quotation.field.project")}</RequiredFieldLabel>
                    <input id="quote-project" disabled={disabled} className="w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60" value={project} onChange={(e) => setProject(e.target.value)} />
                  </div>
                </div>
                <div>
                  <RequiredFieldLabel required={false} htmlFor="quote-deliveryAddress">{t("quotation.field.deliveryAddress")}</RequiredFieldLabel>
                  <input id="quote-deliveryAddress" disabled={disabled} className="w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60" value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} placeholder={t("quotation.field.deliveryAddressPlaceholder")} />
                </div>
              </div>
            </div>
            <div className="p-6">
              <h2 className="text-xs font-semibold text-muted-foreground mb-3 flex items-center gap-1.5"><Hash size={10} /> {t("quotation.section.docDetails")}</h2>
              <div className="space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="quote-number" className="text-xs text-muted-foreground block mb-1">{t("quotation.field.quoteNumber")}</label>
                    <input id="quote-number" readOnly className="w-full text-sm font-mono text-[#c9a84c] font-medium bg-secondary border border-border rounded-lg px-3 py-2 outline-none" value={isDetail ? quote!.id : nextId} />
                  </div>
                  <div>
                    <RequiredFieldLabel required={false} htmlFor="quote-poRef">{t("quotation.field.poRef")}</RequiredFieldLabel>
                    <input id="quote-poRef" disabled={disabled} className="w-full text-sm font-mono text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60" value={poRef} onChange={(e) => setPoRef(e.target.value)} placeholder={t("quotation.field.poRefPlaceholder")} />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <RequiredFieldLabel required={false} htmlFor="quote-issueDate" className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><CalendarDays size={9} /> {t("quotation.field.issueDate")}</RequiredFieldLabel>
                    <input id="quote-issueDate" disabled={disabled} type="date" className="w-full text-sm font-mono text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
                    <FieldError message={validation.fieldErrors.issueDate} />
                  </div>
                  <div>
                    <RequiredFieldLabel required={false} htmlFor="quote-expiryDate" className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><CalendarDays size={9} /> {t("quotation.field.expiryDate")}</RequiredFieldLabel>
                    <input id="quote-expiryDate" disabled={disabled} type="date" className="w-full text-sm font-mono text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
                    <FieldError message={validation.fieldErrors.expiryDate} />
                  </div>
                </div>
                <div>
                  <RequiredFieldLabel required={false} htmlFor="quote-salesperson">{t("quotation.field.salesperson")}</RequiredFieldLabel>
                  <input id="quote-salesperson" disabled={disabled} className="w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60" value={salesperson} onChange={(e) => setSalesperson(e.target.value)} />
                </div>
                <div>
                  <RequiredFieldLabel required={false} htmlFor="quote-paymentTerms">{t("quotation.field.paymentTerms")}</RequiredFieldLabel>
                  {/* พิมพ์เงื่อนไขเองได้ทั้งหมด รายการที่ขึ้นมาเป็นแค่ทางลัด ไม่ใช่ค่าที่บังคับ */}
                  <Combobox
                    id="quote-paymentTerms"
                    disabled={disabled}
                    className="w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60"
                    value={paymentTerms}
                    onChange={setPaymentTerms}
                    options={paymentTermsSuggestions}
                    maxLength={300}
                    ariaLabel={t("quotation.field.paymentTerms")}
                    placeholder={t("quotation.field.paymentTermsPlaceholder")}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <RequiredFieldLabel required={false} htmlFor="quote-jobType">{t("quotation.field.jobType")}</RequiredFieldLabel>
                    <select id="quote-jobType" disabled={disabled} className="w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors appearance-none disabled:opacity-60" value={jobTypeCode} onChange={(e) => handleJobTypeChange(e.target.value)}>
                      {mode === "new"
                        ? <option value="" disabled>{t("quotation.field.jobTypeSelectPrompt")}</option>
                        : <option value="">{t("quotation.field.jobTypeUnclassified")}</option>}
                      {jobTypes.filter((jt) => jt.isActive || jt.code === jobTypeCode).map((jt) => (
                        <option key={jt.id} value={jt.code}>{jt.code} — {jt.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="quote-followUpDate" className="text-xs text-muted-foreground block mb-1 flex items-center gap-1"><CalendarDays size={9} /> {t("quotation.field.followUpDate")}</label>
                    <input id="quote-followUpDate" disabled={disabled} type="date" className="w-full text-sm font-mono text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
                  </div>
                </div>
                {quotationTemplateId && (
                  <p className="text-xs text-muted-foreground -mt-1">
                    {t("quotation.field.appliedTemplate")}: {quotationTemplateName} (v{quotationTemplateVersion})
                  </p>
                )}
                <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-foreground">
                  <input
                    type="checkbox"
                    disabled={disabled}
                    checked={isPotentialOpportunity}
                    onChange={(e) => setIsPotentialOpportunity(e.target.checked)}
                    className="w-4 h-4 rounded border-border accent-[#c9a84c] disabled:opacity-60"
                  />
                  {t("quotation.field.potentialOpportunity")}
                </label>
                {isDetail && permissions.canEdit && (
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">{t("quotation.field.customerInterestLevel")}</label>
                    <InterestButtons value={quote!.interest} onChange={onInterestChange} />
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>

        <div data-tour="qdoc-items" className="print:hidden">
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
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 print:hidden">
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 id="quote-remarks-heading" className="text-sm font-semibold text-foreground mb-3" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("quotation.section.remarks")}</h2>
            <textarea rows={5} disabled={disabled} aria-labelledby="quote-remarks-heading" className="w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2.5 outline-none focus:border-[#c9a84c]/50 transition-colors resize-none leading-relaxed disabled:opacity-60"
              value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </div>
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="text-sm font-semibold text-foreground mb-3" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("quotation.section.signatures")}</h2>
            <div className="space-y-3">
              {signatureRoles.map(({ key, label }) => {
                const isPreparer = key === "preparer";
                const signatureUser = isPreparer ? preparerUser : approverUser;
                const printedName = isPreparer ? (preparerUser?.fullName ?? salesperson) : (approverUser?.fullName ?? "");
                const printedDate = isPreparer ? preparerDate : approverDate;
                return (
                  <div key={key}>
                    <p className="text-xs text-muted-foreground font-mono mb-1">{label}</p>
                    <div className="h-14 border border-dashed border-border rounded-lg bg-muted/30 flex items-end justify-between px-3 pb-2 relative">
                      {signatureUser?.signatureDataUrl ? (
                        <img src={signatureUser.signatureDataUrl} alt={printedName} className="absolute left-2 bottom-2 h-9 max-w-[65%] object-contain pointer-events-none" />
                      ) : (
                        <div className="w-full border-b border-border/60" />
                      )}
                      {!isPreparer && companyHeader.stampDataUrl && (
                        <img src={companyHeader.stampDataUrl} alt="" className="absolute right-2 top-1 h-12 w-12 object-contain opacity-80 pointer-events-none" />
                      )}
                    </div>
                    <div className="flex justify-between mt-1">
                      <p className="text-xs text-muted-foreground font-mono">{t("quotation.nameLabel")} {printedName || "................................"}</p>
                      <p className="text-xs text-muted-foreground font-mono">{t("quotation.dateLabel")} {printedDate || "..............."}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {isDetail && quote && isRevisionQuote(quote.id) && (
          <div className="bg-card border border-border rounded-xl p-5 print:hidden">
            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
              <h2 id="quote-revisionNote-heading" className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>
                หมายเหตุการแก้ไข (Revision Note)
              </h2>
              <button
                type="button"
                onClick={handleGenerateRevisionNote}
                disabled={disabled || !revisionPredecessorId}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#c9a84c]/10 text-[#c9a84c] border border-[#c9a84c]/25 rounded-lg hover:bg-[#c9a84c]/20 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Wand2 size={13} /> สร้างสรุปการแก้ไขอัตโนมัติ
              </button>
            </div>
            <p className="text-xs text-muted-foreground mb-2">
              กดปุ่มด้านบนเพื่อให้ระบบตรวจสอบและสรุปว่าใบนี้แก้ไขอะไรไปจากต้นฉบับ ({revisionPredecessorId || "-"}) เป็นข้อความอัตโนมัติ — แก้ไข/เพิ่มเติมข้อความเองได้ตามต้องการก่อนบันทึก
            </p>
            <textarea
              rows={6}
              disabled={disabled}
              aria-labelledby="quote-revisionNote-heading"
              className="w-full text-xs text-foreground bg-secondary border border-border rounded-lg px-3 py-2.5 outline-none focus:border-[#c9a84c]/50 transition-colors resize-y leading-relaxed disabled:opacity-60 font-mono"
              value={revisionNote}
              onChange={(e) => setRevisionNote(e.target.value)}
              placeholder="เช่น • ลูกค้า: &quot;บริษัท A&quot; → &quot;บริษัท B&quot;"
            />
          </div>
        )}

        {isDetail && quote!.approvalHistory.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-5 print:hidden">
            <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>
              <History size={13} /> {t("quotation.section.approvalHistory")}
            </h2>
            <div className="space-y-2.5">
              {reversedApprovalHistory.map((entry) => (
                <div key={entry.id} className="flex items-start gap-3 text-sm">
                  <div className="w-6 h-6 rounded-lg bg-[#c9a84c]/10 text-[#c9a84c] flex items-center justify-center flex-shrink-0 mt-0.5">
                    {ACTION_ICON[entry.action]}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-foreground">
                      <span className="font-semibold">{entry.userName}</span>
                      <span className="text-muted-foreground"> ({entry.roleName}) — {t(approvalActionLabelKey[entry.action])}</span>
                    </p>
                    {entry.comment && <p className="text-muted-foreground mt-0.5">"{entry.comment}"</p>}
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">{new Date(entry.createdAt).toLocaleString("th-TH")}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-[#0b1d3a]/5 border border-[#0b1d3a]/10 rounded-xl p-4 flex items-start gap-3 print:hidden">
          <div className="w-5 h-5 rounded-full bg-[#c9a84c]/20 flex items-center justify-center flex-shrink-0 mt-0.5"><CheckCircle2 size={11} className="text-[#c9a84c]" /></div>
          <p className="text-xs text-muted-foreground leading-relaxed">{t("quotation.footerNote")}</p>
        </div>

        <PrintDocument
          isDetail={isDetail}
          quote={quote}
          nextId={nextId}
          companyHeader={companyHeader}
          client={client}
          contacts={normalizeContacts(contacts)}
          address={address}
          taxId={taxId}
          deliveryMethod={deliveryMethod}
          deliveryAddress={deliveryAddress}
          project={project}
          poRef={poRef}
          paymentTerms={paymentTerms}
          issueDate={issueDate}
          expiryDate={expiryDate}
          jobTypeName={jobTypeDisplay}
          lines={lines}
          discount={discount}
          discountMode={discountMode}
          remarks={remarks}
          preparerUser={preparerUser}
          approverUser={approverUser}
          preparerName={preparerUser?.fullName ?? salesperson}
          preparerDate={preparerDate}
          approverName={approverUser?.fullName ?? ""}
          approverDate={approverDate}
        />
      </div>

      {pendingAction && (
        <WorkflowActionDialog
          actionLabel={t(approvalActionLabelKey[pendingAction])}
          forQuoteMessage={t("quotation.modal.forQuote").replace("{id}", isDetail ? quote!.id : "").replace("{client}", client)}
          commentLabel={t("quotation.modal.commentLabel")}
          commentRequiredLabel={t("quotation.modal.commentRequired")}
          commentOptionalLabel={t("quotation.modal.commentOptional")}
          commentRequired={commentRequired}
          actionComment={actionComment}
          onActionCommentChange={setActionComment}
          actionError={actionError}
          confirmLabel={t("quotation.modal.confirm")}
          cancelLabel={t("common.cancel")}
          busy={actionBusy}
          onConfirm={confirmAction}
          onCancel={() => setPendingAction(null)}
        />
      )}

      <PromptDialog
        open={scopeOfWorkPromptOpen}
        title="สร้าง Scope of Work"
        message="กรุณาพิมพ์เลขที่เอกสาร Scope of Work ด้วยตนเอง (ระบบไม่สร้างเลขอัตโนมัติแล้ว) — กำหนดรูปแบบได้อิสระ ระบบจะตรวจสอบให้ว่าเลขไม่ซ้ำกับใบอื่น"
        label="เลขที่เอกสาร"
        placeholder="เช่น PQ202607-15-LI-SK"
        confirmLabel="สร้าง Scope of Work"
        cancelLabel={t("common.cancel")}
        requiredMessage="กรุณาระบุเลขที่เอกสาร"
        error={scopeOfWorkPromptError}
        mono
        busy={scopeOfWorkBusy}
        onConfirm={confirmCreateScopeOfWork}
        onCancel={() => setScopeOfWorkPromptOpen(false)}
      />
    </div>
  );
}

// โมดัลยืนยัน workflow action (ส่งอนุมัติ/อนุมัติ/ตีกลับ/ส่งลูกค้า ฯลฯ) พร้อมช่องความคิดเห็นและการดักโฟกัสสำหรับผู้ใช้คีย์บอร์ด
// Confirm modal for workflow actions (submit/approve/reject/send-to-customer/etc.), with a comment field and keyboard focus trapping
function WorkflowActionDialog({
  actionLabel, forQuoteMessage, commentLabel, commentRequiredLabel, commentOptionalLabel,
  commentRequired, actionComment, onActionCommentChange, actionError, confirmLabel, cancelLabel,
  busy, onConfirm, onCancel,
}: {
  actionLabel: string;
  forQuoteMessage: string;
  commentLabel: string;
  commentRequiredLabel: string;
  commentOptionalLabel: string;
  commentRequired: boolean;
  actionComment: string;
  onActionCommentChange: (value: string) => void;
  actionError: string;
  confirmLabel: string;
  cancelLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const panelRef = useDialogA11y(onCancel);
  const titleId = useId();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 print:hidden">
      <div className="absolute inset-0 bg-[#0b1d3a]/40" onClick={onCancel} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-sm p-5">
        <h2 id={titleId} className="text-sm font-semibold text-foreground mb-1" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{actionLabel}</h2>
        <p className="text-xs text-muted-foreground mb-4">{forQuoteMessage}</p>
        <label className="text-xs text-muted-foreground block mb-1.5">
          {commentLabel} {commentRequired ? commentRequiredLabel : commentOptionalLabel}
        </label>
        <textarea
          autoFocus
          rows={3}
          className="w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors resize-none"
          value={actionComment}
          onChange={(e) => onActionCommentChange(e.target.value)}
        />
        {actionError && <p className="text-xs text-[#e05252] mt-1.5">{actionError}</p>}
        <div className="flex items-center justify-end gap-2 mt-4">
          <button onClick={onCancel} disabled={busy} className="px-3.5 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground transition-colors disabled:opacity-60">{cancelLabel}</button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={`px-3.5 py-1.5 text-xs rounded-lg font-semibold transition-colors disabled:opacity-60 ${commentRequired ? "bg-[#e05252] text-white hover:bg-[#c94444]" : "bg-[#c9a84c] text-[#0b1d3a] hover:bg-[#f0c040]"}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
