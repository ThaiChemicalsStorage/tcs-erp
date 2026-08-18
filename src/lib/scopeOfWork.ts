import { apiFetch } from "./apiClient.js";
import type { ChecklistOption, ChecklistGroup } from "./documentRequirements.js";

export type { ChecklistOption, ChecklistGroup };

export type ScopeOfWorkStatus = "Draft" | "PendingApproval" | "Final";

export interface ScopeOfWorkCustomerSnapshot {
  companyName: string;
  contactName: string;
  address: string;
  taxId: string;
  phone: string;
  email: string;
  projectName: string;
}

export interface ScopeOfWorkSpecLine {
  id: string;
  text: string;
}
export interface ScopeOfWorkItem {
  id: string;
  name: string;
  specifications: ScopeOfWorkSpecLine[];
  quantity: number | null;
  unit: string;
  remark: string;
  isSectionHeader?: boolean;
}

export type ScopeOfWorkPaymentType = "" | "Cash" | "Credit";

export interface ScopeOfWorkPaymentInstallment {
  id: string;
  pct: number | null;
  label: string;
  paymentType: ScopeOfWorkPaymentType;
  days: number | null;
}

// แปลงข้อมูลประเภทการชำระเงินและจำนวนวันเป็นข้อความแสดงผล เช่น "Credit 30 Days"
// Formats a payment installment's type/days into a display string, e.g. "Credit 30 Days"
export function formatPaymentMethod(installment: Pick<ScopeOfWorkPaymentInstallment, "paymentType" | "days">): string {
  if (!installment.paymentType) return "";
  return installment.days !== null ? `${installment.paymentType} ${installment.days} Days` : installment.paymentType;
}

export interface ScopeOfWorkPaymentConditions {
  installments: ScopeOfWorkPaymentInstallment[];
  description: string;
  notes: string;
}

// สร้างรหัส id ใหม่สำหรับงวดชำระเงิน
// Generates a new payment installment id
export function newPaymentInstallmentId(): string {
  return `pi-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
// สร้างงวดชำระเงินเปล่าเริ่มต้น
// Creates a blank payment installment
export function blankPaymentInstallment(): ScopeOfWorkPaymentInstallment {
  return { id: newPaymentInstallmentId(), pct: null, label: "", paymentType: "", days: null };
}

export const PAYMENT_TERM_PRESETS: { label: string; installments: Omit<ScopeOfWorkPaymentInstallment, "id">[] }[] = [
  {
    label: "40% Down Payment (Cash) / 60% After Job Complete (Cash)",
    installments: [
      { pct: 40, label: "Down Payment", paymentType: "Cash", days: null },
      { pct: 60, label: "After Job Complete", paymentType: "Cash", days: null },
    ],
  },
  {
    label: "30% Down Payment (Cash) / 70% After Job Complete (Credit 30 Days)",
    installments: [
      { pct: 30, label: "Down Payment", paymentType: "Cash", days: null },
      { pct: 70, label: "After Job Complete", paymentType: "Credit", days: 30 },
    ],
  },
  {
    label: "100% After Job Complete (Credit 30 Days)",
    installments: [
      { pct: 100, label: "After Job Complete", paymentType: "Credit", days: 30 },
    ],
  },
];

const VALID_PAYMENT_TYPES: readonly ScopeOfWorkPaymentType[] = ["", "Cash", "Credit"];

// แกะข้อความวิธีชำระเงินแบบเก่า (free text) ให้เป็นรูปแบบ paymentType/days ที่มีโครงสร้าง
// Parses a legacy free-text payment method string into the structured paymentType/days shape
function parsePaymentMethodText(text: string): { paymentType: ScopeOfWorkPaymentType; days: number | null } {
  const dayMatch = /(\d+)\s*Days?/i.exec(text);
  const days = dayMatch ? parseInt(dayMatch[1], 10) : null;
  const paymentType: ScopeOfWorkPaymentType = /credit/i.test(text) ? "Credit" : /cash/i.test(text) ? "Cash" : "";
  return { paymentType, days };
}

// แปลงข้อมูลเงื่อนไขการชำระเงินที่บันทึกไว้ (รวมข้อมูลรูปแบบเก่า) ให้เป็นรูปแบบปัจจุบัน
// Normalizes a stored payment conditions value (including legacy shapes) to the current format
export function normalizePaymentConditions(raw: unknown): ScopeOfWorkPaymentConditions {
  const r = (raw ?? {}) as Record<string, unknown>;
  const description = typeof r.description === "string" ? r.description : "";
  const notes = typeof r.notes === "string" ? r.notes : "";
  if (Array.isArray(r.installments)) {
    return {
      installments: (r.installments as Record<string, unknown>[]).map((it) => {
        const id = typeof it.id === "string" && it.id ? it.id : newPaymentInstallmentId();
        const pct = typeof it.pct === "number" ? it.pct : null;
        const label = typeof it.label === "string" ? it.label : "";
        if (typeof it.paymentType === "string" && (VALID_PAYMENT_TYPES as readonly string[]).includes(it.paymentType)) {
          return { id, pct, label, paymentType: it.paymentType as ScopeOfWorkPaymentType, days: typeof it.days === "number" ? it.days : null };
        }
        const parsed = typeof it.method === "string" ? parsePaymentMethodText(it.method) : { paymentType: "" as ScopeOfWorkPaymentType, days: null };
        return { id, pct, label, ...parsed };
      }),
      description,
      notes,
    };
  }
  const legacy = typeof r.method === "string" ? parsePaymentMethodText(r.method) : { paymentType: "" as ScopeOfWorkPaymentType, days: null };
  const installments: ScopeOfWorkPaymentInstallment[] = [];
  if (typeof r.downPaymentPct === "number") installments.push({ id: newPaymentInstallmentId(), pct: r.downPaymentPct, label: "Down Payment", ...legacy });
  if (typeof r.finalPaymentPct === "number") installments.push({ id: newPaymentInstallmentId(), pct: r.finalPaymentPct, label: "After Job Complete", ...legacy });
  return { installments, description, notes };
}

// แปลงค่า documentRecipients ดิบให้เป็นรูปแบบมาตรฐาน (ป้องกันข้อมูลเก่าที่ไม่มีฟิลด์นี้)
// Normalizes a raw documentRecipients value to the standard shape (handles legacy records missing the field)
export function normalizeDocumentRecipients(raw: unknown): Record<string, string[]> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const out: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (Array.isArray(value)) out[key] = value.filter((v): v is string => typeof v === "string");
  }
  return out;
}

export interface ScopeOfWorkSignatory {
  name: string;
  userId: string;
  date: string;
}

export interface ScopeOfWork {
  id: string;
  scopeNumber: string;
  yearMonth: string;
  jobSequence: number;
  secondaryCode: string;
  quotationId: string;
  quotationNumber: string;
  jobTypeCode: string;
  jobTypeName: string;
  quotationSalesperson: string;
  issueDate: string;
  deliveryDate: string;
  drawingCode: string;
  customerPoNumber: string;
  customerSnapshot: ScopeOfWorkCustomerSnapshot;
  deliveryLocation: string;
  shippingContact: string;
  shippingPhone: string;
  billingContact: string;
  billingPhone: string;
  checklistGroups: ChecklistGroup[];
  items: ScopeOfWorkItem[];
  paymentConditions: ScopeOfWorkPaymentConditions;
  documentRecipients: Record<string, string[]>;
  documentRecipientMessage: string;
  revisionNote: string;
  remarks: string;
  seller: ScopeOfWorkSignatory;
  approver: ScopeOfWorkSignatory;
  attachments: ScopeOfWorkAttachment[];
  status: ScopeOfWorkStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  isDeleted: boolean;
}

export interface ScopeOfWorkAttachment {
  id: string;
  fileName: string;
  url: string;
  size: number;
  contentType: string;
  uploadedBy: string;
  uploadedByName: string;
  uploadedAt: string;
}

export const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_SCOPE = 5;

// แปลงขนาดไฟล์เป็นข้อความแสดงผลที่อ่านง่าย (KB หรือ MB)
// Formats a byte count into a human-readable display string (KB or MB)
export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export interface ScopeOfWorkSummary {
  id: string;
  scopeNumber: string;
  quotationId: string;
  status: ScopeOfWorkStatus;
  updatedAt: string;
}

export interface ScopeOfWorkListItem {
  id: string;
  scopeNumber: string;
  secondaryCode: string;
  quotationId: string;
  quotationNumber: string;
  jobTypeCode: string;
  jobTypeName: string;
  customerName: string;
  quotationSalesperson: string;
  customerPoNumber: string;
  issueDate: string;
  deliveryDate: string;
  status: ScopeOfWorkStatus;
  updatedAt: string;
}

export type ScopeOfWorkUpdateFields = Partial<{
  scopeNumber: string;
  issueDate: string;
  deliveryDate: string;
  drawingCode: string;
  customerPoNumber: string;
  secondaryCode: string;
  deliveryLocation: string;
  shippingContact: string;
  shippingPhone: string;
  billingContact: string;
  billingPhone: string;
  checklistGroups: ChecklistGroup[];
  items: ScopeOfWorkItem[];
  paymentConditions: ScopeOfWorkPaymentConditions;
  documentRecipients: Record<string, string[]>;
  documentRecipientMessage: string;
  revisionNote: string;
  remarks: string;
  seller: ScopeOfWorkSignatory;
  approver: ScopeOfWorkSignatory;
}>;

// ดึงรายการ Scope of Work แบบย่อของใบเสนอราคาที่ระบุ
// Fetches summary Scope of Work records for a given quotation
export async function fetchScopeOfWorksByQuotation(quotationId: string): Promise<ScopeOfWorkSummary[]> {
  const { scopeOfWorks } = await apiFetch<{ scopeOfWorks: ScopeOfWorkSummary[] }>(`/scope-of-works?quotationId=${encodeURIComponent(quotationId)}`);
  return scopeOfWorks;
}
// ดึงรายการ Scope of Work ทั้งหมดในระบบ (สำหรับหน้าจัดการแบบรายการ)
// Fetches every Scope of Work company-wide (for the standalone management list page)
export async function fetchAllScopeOfWorks(): Promise<ScopeOfWorkListItem[]> {
  const { scopeOfWorks } = await apiFetch<{ scopeOfWorks: ScopeOfWorkListItem[] }>("/scope-of-works");
  return scopeOfWorks;
}
// ดึงข้อมูลเต็มของ Scope of Work รายการเดียวตาม id
// Fetches the full content of a single Scope of Work by id
export async function fetchScopeOfWork(id: string): Promise<ScopeOfWork> {
  const { scopeOfWork } = await apiFetch<{ scopeOfWork: ScopeOfWork }>(`/scope-of-works/${encodeURIComponent(id)}`);
  return scopeOfWork;
}
// สร้าง Scope of Work ใหม่จากใบเสนอราคาที่ระบุ
// Creates a new Scope of Work from the given quotation
export async function createScopeOfWorkFromQuotation(quotationId: string, scopeNumber: string): Promise<ScopeOfWork> {
  const { scopeOfWork } = await apiFetch<{ scopeOfWork: ScopeOfWork }>("/scope-of-works", {
    method: "POST",
    body: JSON.stringify({ quotationId, scopeNumber }),
  });
  return scopeOfWork;
}
// แก้ไขข้อมูล Scope of Work ที่มีอยู่ตาม id
// Updates an existing Scope of Work identified by id
export async function updateScopeOfWork(id: string, fields: ScopeOfWorkUpdateFields): Promise<ScopeOfWork> {
  const { scopeOfWork } = await apiFetch<{ scopeOfWork: ScopeOfWork }>(`/scope-of-works/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(fields),
  });
  return scopeOfWork;
}
// อนุมัติ Scope of Work (PendingApproval → Final)
// Approves a Scope of Work (PendingApproval → Final)
export async function finalizeScopeOfWork(id: string): Promise<ScopeOfWork> {
  const { scopeOfWork } = await apiFetch<{ scopeOfWork: ScopeOfWork }>(`/scope-of-works/${encodeURIComponent(id)}/finalize`, { method: "POST" });
  return scopeOfWork;
}
// ส่งขออนุมัติ Scope of Work (Draft → PendingApproval)
// Submits a Scope of Work for approval (Draft → PendingApproval)
export async function submitScopeOfWorkApproval(id: string): Promise<ScopeOfWork> {
  const { scopeOfWork } = await apiFetch<{ scopeOfWork: ScopeOfWork }>(`/scope-of-works/${encodeURIComponent(id)}/submit-approval`, { method: "POST" });
  return scopeOfWork;
}
// ปฏิเสธ/ตีกลับ Scope of Work พร้อมความคิดเห็น (PendingApproval → Draft)
// Rejects a Scope of Work with a required comment (PendingApproval → Draft)
export async function rejectScopeOfWork(id: string, comment: string): Promise<ScopeOfWork> {
  const { scopeOfWork } = await apiFetch<{ scopeOfWork: ScopeOfWork }>(`/scope-of-works/${encodeURIComponent(id)}/reject`, {
    method: "POST",
    body: JSON.stringify({ comment }),
  });
  return scopeOfWork;
}
// ถอนคำขออนุมัติ Scope of Work (PendingApproval → Draft)
// Withdraws a pending Scope of Work approval request (PendingApproval → Draft)
export async function withdrawScopeOfWorkApproval(id: string): Promise<ScopeOfWork> {
  const { scopeOfWork } = await apiFetch<{ scopeOfWork: ScopeOfWork }>(`/scope-of-works/${encodeURIComponent(id)}/withdraw-approval`, { method: "POST" });
  return scopeOfWork;
}
// ทำสำเนา Scope of Work ด้วยเลขเอกสารใหม่ที่ผู้ใช้กำหนด
// Duplicates a Scope of Work under a new user-provided document number
export async function duplicateScopeOfWork(id: string, scopeNumber: string): Promise<ScopeOfWork> {
  const { scopeOfWork } = await apiFetch<{ scopeOfWork: ScopeOfWork }>(`/scope-of-works/${encodeURIComponent(id)}/duplicate`, {
    method: "POST",
    body: JSON.stringify({ scopeNumber }),
  });
  return scopeOfWork;
}
// สร้างรีวิชันใหม่ของ Scope of Work โดยไม่แก้ไขต้นฉบับ
// Creates a new revision of a Scope of Work without modifying the source record
export async function rewriteScopeOfWork(id: string): Promise<ScopeOfWork> {
  const { scopeOfWork } = await apiFetch<{ scopeOfWork: ScopeOfWork }>(`/scope-of-works/${encodeURIComponent(id)}/rewrite`, { method: "POST" });
  return scopeOfWork;
}
// ดึงข้อมูลล่าสุดจากใบเสนอราคาต้นทางมาอัปเดต Scope of Work
// Re-pulls the latest data from the source quotation into this Scope of Work
export async function refreshScopeOfWorkFromQuotation(id: string): Promise<ScopeOfWork> {
  const { scopeOfWork } = await apiFetch<{ scopeOfWork: ScopeOfWork }>(`/scope-of-works/${encodeURIComponent(id)}/refresh`, { method: "POST" });
  return scopeOfWork;
}
// ลบ Scope of Work ตาม id
// Deletes a Scope of Work identified by id
export async function deleteScopeOfWork(id: string): Promise<void> {
  await apiFetch<void>(`/scope-of-works/${encodeURIComponent(id)}`, { method: "DELETE" });
}
// ส่งแจ้งเตือนทวงเลข PO ไปยังพนักงานขายที่รับผิดชอบ
// Sends a notification chasing the customer PO number to the resolved salesperson
export async function chaseScopeOfWorkPo(id: string): Promise<{ notifiedUserName: string }> {
  return apiFetch<{ notifiedUserName: string }>(`/scope-of-works/${encodeURIComponent(id)}/chase-po`, { method: "POST" });
}
// บันทึกประวัติว่ามีการพิมพ์ Scope of Work นี้
// Logs that this Scope of Work was printed
export async function logScopeOfWorkPrinted(id: string): Promise<void> {
  await apiFetch<void>(`/scope-of-works/${encodeURIComponent(id)}/print`, { method: "POST" });
}

// ส่งแจ้งเตือนในระบบถึงผู้รับทุกคนที่เลือกไว้ใน documentRecipients (อีเมลถูกถอดออก 2026-08-07)
// Sends the in-app notification to every recipient selected in documentRecipients (email removed 2026-08-07)
export async function sendScopeOfWorkDocumentNotifications(id: string): Promise<{ sentCount: number; failedCount: number; recipientCount: number }> {
  return apiFetch<{ sentCount: number; failedCount: number; recipientCount: number }>(`/scope-of-works/${encodeURIComponent(id)}/send-documents`, { method: "POST" });
}
// อัปโหลดไฟล์แนบหนึ่งไฟล์เข้ากับ Scope of Work นี้
// Uploads a single attachment to this Scope of Work
export async function uploadScopeOfWorkAttachment(
  id: string,
  file: { fileName: string; contentType: string; dataBase64: string },
): Promise<ScopeOfWork> {
  const { scopeOfWork } = await apiFetch<{ scopeOfWork: ScopeOfWork }>(`/scope-of-works/${encodeURIComponent(id)}/attachments`, {
    method: "POST",
    body: JSON.stringify(file),
  });
  return scopeOfWork;
}
// ลบไฟล์แนบออกจาก Scope of Work นี้
// Deletes an attachment from this Scope of Work
export async function deleteScopeOfWorkAttachment(id: string, attachmentId: string): Promise<ScopeOfWork> {
  const { scopeOfWork } = await apiFetch<{ scopeOfWork: ScopeOfWork }>(
    `/scope-of-works/${encodeURIComponent(id)}/attachments/${encodeURIComponent(attachmentId)}`,
    { method: "DELETE" },
  );
  return scopeOfWork;
}

// สร้างรหัส id ใหม่สำหรับบรรทัดข้อกำหนด
// Generates a new spec line id
export function newScopeSpecLineId(): string {
  return `sl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
// สร้างรหัส id ใหม่สำหรับรายการงาน
// Generates a new item id
export function newScopeItemId(): string {
  return `si-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
// สร้างรายการงานเปล่าเริ่มต้น
// Creates a blank Scope of Work item
export function blankScopeOfWorkItem(): ScopeOfWorkItem {
  return { id: newScopeItemId(), name: "", specifications: [], quantity: null, unit: "", remark: "" };
}
