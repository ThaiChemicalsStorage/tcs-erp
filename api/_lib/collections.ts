import { ObjectId, type WithId } from "mongodb";
import { getDb } from "./mongodb.js";
import { HttpError } from "./http.js";
import type { User } from "../../src/lib/users.js";
import type { Role } from "../../src/lib/roles.js";
import type { Company } from "../../src/lib/storage.js";
import type { Product, ProductCategory } from "../../src/lib/products.js";
import type { Notification } from "../../src/lib/notifications.js";
import type { AuditLogEntry } from "../../src/lib/auditLog.js";
import type { Quote } from "../../src/lib/quotes.js";
import type { QuotationTemplate } from "../../src/lib/quotationTemplates.js";
import type { ScopeOfWork } from "../../src/lib/scopeOfWork.js";
import type { DeliveryOrder } from "../../src/lib/deliveryOrder.js";
import type { ServiceTemplate } from "../../src/lib/serviceTemplates.js";
import type { ServiceReport } from "../../src/lib/serviceReports.js";
import type { Project } from "../../src/lib/project.js";
import type { MaterialRequisition } from "../../src/lib/materialRequisition.js";
import type { MaterialRequisitionTemplate } from "../../src/lib/materialRequisitionTemplate.js";
import type { JobOrder } from "../../src/lib/jobOrder.js";
import type { PurchaseRequest } from "../../src/lib/purchaseRequest.js";
import type { ProductionOrder } from "../../src/lib/productionOrder.js";
import type { PurchaseOrder } from "../../src/lib/purchaseOrder.js";
import type { CostControl } from "../../src/lib/costControl.js";
import type { ReceivingReport } from "../../src/lib/receivingReport.js";
import type { ApEntry } from "../../src/lib/apEntries.js";
import type { VendorApprovalStatus } from "../../src/lib/vendors.js";

/** DB storage schema — includes passwordHash, which the client-side User type deliberately omits.
 * (`emailAppPasswordEnc` existed briefly on 2026-08-07 for the since-removed Gmail sending feature;
 * `toPublicUser()` still strips it defensively from any legacy document.) */
export type UserFields = Omit<User, "id"> & { passwordHash: string; emailAppPasswordEnc?: string };
export type PublicUser = User;
export type ProductFields = Omit<Product, "id">;
type CategoryFields = Omit<ProductCategory, "id">;
type NotificationFields = Omit<Notification, "id">;
type AuditLogFields = Omit<AuditLogEntry, "id">;
/** Keyed by the human-readable business id (e.g. "QT-2567-0041") stored directly as _id. */
export type QuoteFields = Omit<Quote, "id">;

export async function usersCollection() {
  const db = await getDb();
  return db.collection<UserFields>("users");
}

export async function rolesCollection() {
  const db = await getDb();
  return db.collection<Role>("roles");
}

/** Single document, keyed by a fixed string _id (see SINGLETON_ID in api/company). */
export async function companyCollection() {
  const db = await getDb();
  return db.collection<Company & { _id: string }>("company");
}

export async function productsCollection() {
  const db = await getDb();
  return db.collection<ProductFields>("products");
}

export async function categoriesCollection() {
  const db = await getDb();
  return db.collection<CategoryFields>("categories");
}

export async function notificationsCollection() {
  const db = await getDb();
  return db.collection<NotificationFields>("notifications");
}

export async function auditLogCollection() {
  const db = await getDb();
  return db.collection<AuditLogFields>("audit_log");
}

/** Atomic per-key sequence counters (e.g. `_id: "quote_2567"`) — backs `nextQuoteId()` in api/handlers/quotes.ts. Added 2026-07-10 per the Codex review's Medium finding that the previous scan-all-then-max+1 approach was race-prone under concurrent creates. Keyed by a literal string `_id` (the counter's name), same singleton-style convention as `companyCollection()` below. */
export interface CounterFields {
  _id: string;
  seq: number;
}
export async function countersCollection() {
  const db = await getDb();
  return db.collection<CounterFields>("counters");
}

export async function quotesCollection() {
  const db = await getDb();
  return db.collection<QuoteFields & { _id: string }>("quotes");
}

/**
 * Reusable Job-Type-specific quotation starting structures (added 2026-07-14), imported from the
 * real "Scope of work new template for air pollution control" Excel workbook — see
 * `src/lib/quotationTemplates.ts` for the full domain-shape doc comment and
 * docs/MODULES/QuotationTemplates.md for the Excel source/parsing writeup. `templateCode` is the
 * stable natural key (e.g. "TA-FRP-TANK") used for the idempotent import/upsert — not the MongoDB
 * `_id`, since re-running the import must recognize "the same template" across runs regardless of
 * `_id` generation.
 */
export type QuotationTemplateFields = Omit<QuotationTemplate, "id">;
export async function quotationTemplatesCollection() {
  const db = await getDb();
  return db.collection<QuotationTemplateFields>("quotation_templates");
}

/**
 * Scope of Work (added 2026-07-15) — see `src/lib/scopeOfWork.ts` for the full domain-shape doc
 * comment and docs/MODULES/ScopeOfWork.md for the PDF-to-field mapping. `scopeNumber` is the
 * human-readable business id — since 2026-07-29 it's typed manually by the user (free-form, no
 * auto-generation), so the unique index below IS the one uniqueness mechanism. `yearMonth`/
 * `jobSequence` are legacy fields from the removed auto-numbering scheme (kept on old records,
 * written as ""/0 on new ones); their old `{yearMonth, jobSequence}` unique index is dropped
 * defensively at runtime by `ensureScopeNumberIndexes()` (api/_lib/scopeOfWorkHandler.ts).
 */
export type ScopeOfWorkFields = Omit<ScopeOfWork, "id">;
export async function scopeOfWorksCollection() {
  const db = await getDb();
  return db.collection<ScopeOfWorkFields>("scope_of_works");
}

/** Scope of Work attachment file BYTES (added 2026-07-24, stored in MongoDB so file storage
 * travels with the database rather than depending on a hosting platform's blob store). One document per attached file,
 * kept OUT of the scope_of_works documents so fetching a record never drags megabytes of file
 * data along. `data` is BSON Binary (raw bytes, no base64 overhead). `downloadKey` is a random
 * capability token — the download route serves the file to anyone presenting it (email recipients
 * have no app session in their mail client) — an unguessable-URL security model. Size discipline
 * lives in the upload route's limits (2 MB/file, 5 files/record
 * — see src/lib/scopeOfWork.ts), which is what keeps the free Atlas tier from filling up. */
export interface ScopeAttachmentFileFields {
  scopeOfWorkId: string;
  attachmentId: string;
  downloadKey: string;
  fileName: string;
  contentType: string;
  size: number;
  data: import("mongodb").Binary;
  createdAt: string;
}
export async function scopeAttachmentFilesCollection() {
  const db = await getDb();
  return db.collection<ScopeAttachmentFileFields>("scope_attachment_files");
}

/** ไฟล์แนบแบบใช้ร่วมกันได้ทุกเอกสาร (เพิ่ม 2026-08-27 ตอนที่ใบสั่งงานต้องแนบไฟล์ได้) —
 *  โครงสร้างเหมือน `scope_attachment_files` ทุกอย่าง ต่างแค่แทน `scopeOfWorkId` ด้วยคู่
 *  `docType` + `docId` เพื่อให้เอกสารชนิดไหนก็ใช้ได้ ไฟล์เก็บเป็น BSON Binary แยกจากตัวเอกสาร
 *  เหมือนเดิม การดึงเอกสารจึงไม่ลากไฟล์เป็นเมกะไบต์มาด้วย ลิมิตอยู่ที่ route (2 MB/ไฟล์, 5 ไฟล์/เอกสาร)
 *  ดู api/_lib/documentAttachments.ts — **Scope of Work ยังใช้คอลเลกชันเดิมของตัวเอง ยังไม่ย้ายมา** */
export interface DocumentAttachmentFileFields {
  docType: string;
  docId: string;
  attachmentId: string;
  downloadKey: string;
  fileName: string;
  contentType: string;
  size: number;
  data: import("mongodb").Binary;
  createdAt: string;
}
/** คำขอเพิ่มสินค้า (2026-08-27) — แผนกอื่นขอได้ แต่ตั้งรหัสไม่ได้
 *  รหัสถูกตั้งโดยสโตร์ตอนอนุมัติเท่านั้น แล้วระบบจึงสร้างแถวใน `products` ให้จริง — ดู api/_lib/productRequestHandler.ts */
export type ProductRequestFields = Omit<import("../../src/lib/productRequest.js").ProductRequest, "id">;
export async function productRequestsCollection() {
  const db = await getDb();
  return db.collection<ProductRequestFields>("product_requests");
}
export async function documentAttachmentFilesCollection() {
  const db = await getDb();
  return db.collection<DocumentAttachmentFileFields>("document_attachment_files");
}

/** Failed-login tracking for `POST /api/auth/login`'s rate limiting (added 2026-07-29 — closes the
 * long-standing "no login rate limiting" Known Gap; see docs/RBAC.md). One document per FAILED
 * attempt; successful logins delete the identifier's documents. MongoDB-backed deliberately (not
 * process memory, which resets on every restart and isn't shared if more than one server process
 * runs; not an external key-value service). `createdAt` is a real BSON `Date` — unlike this codebase's usual
 * ISO strings — because the TTL index that auto-purges old attempts only works on `Date` values. */
export interface LoginAttemptFields {
  /** Lowercased login identifier (username or email) as typed — tracked per-target-account. */
  identifier: string;
  /** Requesting IP (first `x-forwarded-for` hop) — tracks cross-account scripted sweeps. */
  ip: string;
  createdAt: Date;
}
export async function loginAttemptsCollection() {
  const db = await getDb();
  return db.collection<LoginAttemptFields>("login_attempts");
}

/** Delivery Order (added 2026-07-23) — see `src/lib/deliveryOrder.ts` for the full domain-shape doc
 * comment and docs/MODULES/DeliveryOrder.md for the PDF-to-field mapping. No uniqueness constraint
 * on `scopeOfWorkId` (a Scope of Work can in principle have more than one, same non-enforced
 * "usually just one" convention Scope of Work itself has relative to its own quotation). */
export type DeliveryOrderFields = Omit<DeliveryOrder, "id">;
export async function deliveryOrdersCollection() {
  const db = await getDb();
  return db.collection<DeliveryOrderFields>("delivery_orders");
}

/**
 * Service Checklist Template (added 2026-08-06) — see `src/lib/serviceTemplates.ts` for the full
 * domain-shape doc comment. `templateCode` is the stable natural key (e.g. "SVC-AIRPOLLUTION-STD")
 * used by the idempotent seed upsert (`api/_lib/serviceTemplateSeedData.ts`) — a handful of
 * hand-curated master templates, not a high-volume collection.
 */
export type ServiceTemplateFields = Omit<ServiceTemplate, "id">;
export async function serviceTemplatesCollection() {
  const db = await getDb();
  return db.collection<ServiceTemplateFields>("service_templates");
}

/**
 * Service Report (added 2026-08-06) — see `src/lib/serviceReports.ts` for the full domain-shape
 * doc comment. `id` is the human-readable business id (e.g. "SR-2569-0001") stored directly as
 * `_id`, atomically reserved via `countersCollection()` — same convention as `QuoteFields`.
 */
/** `customerApproval.tokenHash` (SHA-256 of the approval-link token, 2026-08-10) is server-only —
 * `toServiceReport()` (serviceReportHandler.ts) strips it before any response; leaking it would
 * let any signed-in user forge the customer-approval link. */
export type ServiceReportFields = Omit<ServiceReport, "id" | "customerApproval"> & {
  customerApproval?: (NonNullable<ServiceReport["customerApproval"]> & { tokenHash: string }) | null;
};
export async function serviceReportsCollection() {
  const db = await getDb();
  return db.collection<ServiceReportFields & { _id: string }>("service_reports");
}

/** Service checklist item photo BYTES (added 2026-08-06) — same "keep bytes out of the parent
 * document, serve via an unauthenticated capability-URL" pattern as `ScopeAttachmentFileFields`.
 * One document per photo; `serviceReportId` + `photoId` locate it, `downloadKey` gates the download
 * route. Photo *metadata* lives embedded on the matching checklist item inside `ServiceReport.checklist`
 * (`ServiceChecklistItemPhoto`), never the bytes themselves. */
export interface ServiceChecklistPhotoFileFields {
  serviceReportId: string;
  photoId: string;
  downloadKey: string;
  fileName: string;
  contentType: string;
  size: number;
  data: import("mongodb").Binary;
  createdAt: string;
}
export async function serviceChecklistPhotoFilesCollection() {
  const db = await getDb();
  return db.collection<ServiceChecklistPhotoFileFields>("service_checklist_photo_files");
}

// ─── Schema-prep collections (2026-07 production-readiness pass) ──────────
// These collections exist with proper indexes ahead of the features that will
// use them, per the "prepare every collection before new features are
// implemented" requirement. Most have NO API routes / UI yet — see
// docs/DATABASE.md for which are fully wired vs. schema-only scaffolding.

export interface PermissionFields {
  key: string;
  label: string;
  group: string;
  isSuperAdminOnly: boolean;
  createdAt: string;
}
export async function permissionsCollection() {
  const db = await getDb();
  return db.collection<PermissionFields>("permissions");
}

/**
 * เซสชันที่ยังใช้ได้ — **เขียนจริงตั้งแต่ 2026-08-31** ตอนทำ "1 user เข้าใช้ได้ทีละเครื่องเดียว"
 * (เจ้าของสั่งไว้ 2026-08-28) ก่อนหน้านั้นเป็นแค่โครงที่ไม่มีใครเขียนถึงเลย และ auth เป็น JWT ล้วน
 *
 * `expiresAt` เป็น **`Date` ไม่ใช่ string** — TTL index ของ MongoDB ไม่รู้จักวันที่ที่เป็นข้อความ
 * โครงเดิมประกาศเป็น string ไว้ ซึ่งแปลว่า index `expireAfterSeconds` ที่ `ensureIndexes()` สร้าง
 * ไว้แล้วจะไม่เคยลบอะไรเลย (จดไว้ใน TODO.md ตั้งแต่ตอนสำรวจ)
 *
 * `revokedAt` ไม่ใช่การลบทิ้ง — แถวที่ถูกแทนที่ต้องอยู่ต่อ เพื่อให้เครื่องที่โดนเตะรู้ว่า
 * **โดนเตะ** ไม่ใช่ **เซสชันหมดอายุ** ซึ่งเป็นคนละเรื่องกันสำหรับคนที่กำลังงงว่าทำไมหลุด
 */
export interface SessionFields {
  userId: ObjectId;
  tokenId: string;
  issuedAt: string;
  expiresAt: Date;
  userAgent: string;
  revokedAt: string | null;
  /** ทำไมถึงถูกยกเลิก — "superseded" = มีการเข้าสู่ระบบจากเครื่องอื่น, "logout" = กดออกเอง */
  revokedReason?: "superseded" | "logout";
}
export async function sessionsCollection() {
  const db = await getDb();
  return db.collection<SessionFields>("sessions");
}

export interface DepartmentFields {
  name: string;
  code: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}
export async function departmentsCollection() {
  const db = await getDb();
  return db.collection<DepartmentFields>("departments");
}

/** Sub-grouping within a Department (2026-08-14, direct business request — Sales has 2 teams,
 * each with its own team lead; a lead sees only their own team's quotations/Scope of Work/
 * Delivery Order, not the other team's — there is no single manager who sees both). `departmentId`
 * is the parent `departments` collection's `_id` as a string — not every department needs teams
 * (Sales is the only one with any today); team name only needs to be unique within its own
 * department (enforced by the sanitizer, not a DB index). The permission model also supports a
 * `viewDepartment` tier (whole department, e.g. a role that should see both teams) — it's just not
 * what this specific Sales scenario currently needs. */
export interface TeamFields {
  name: string;
  departmentId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}
export async function teamsCollection() {
  const db = await getDb();
  return db.collection<TeamFields>("teams");
}

export interface PositionFields {
  name: string;
  code: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}
export async function positionsCollection() {
  const db = await getDb();
  return db.collection<PositionFields>("positions");
}

/**
 * Customer master data (redefined 2026-07-14 — corrects an earlier misunderstanding that built
 * a "Company Profiles" / issuer-company selector into the Quotation form instead). A Customer is
 * who a quotation is issued *to*, saved once and reused across quotations via the Customer
 * selector (`src/pages/quotation/CustomerSelector.tsx`) — see `Quote.customerId`/
 * `customerSnapshot` in `src/lib/quotes.ts` and docs/MODULES/Customer.md. Shape intentionally
 * matches the fields the Quotation form's Customer Information section actually collects
 * (companyName/contactName/phone/email/address/taxId/deliveryMethod/projectName/deliveryAddress)
 * rather than the earlier CRM-flavored draft (position/source/salesOwnerId/notes/status) — no live
 * data existed under the old shape (schema-only, zero API routes/UI), so this is a clean redefinition,
 * not a migration.
 */
export interface CustomerFields {
  companyName: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  taxId: string;
  deliveryMethod: string;
  projectName: string;
  deliveryAddress: string;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  /** LINE userId of the customer's approver chat, set once by the pairing webhook (2026-08-10 —
   * see api/_lib/lineHandler.ts). "" / absent = not linked yet. */
  lineUserId?: string;
  /** Outstanding pairing code (server-only — stripped by toPublicCustomer() in
   * customersHandler.ts). Cleared the moment the webhook matches it. */
  linePairing?: { code: string; expiresAt: string } | null;
  /** Accounting AR fields (added 2026-08-17, see docs/MODULES/Accounting.md) — deliberately NOT
   * payment-terms/credit-days, those already live per-installment on ScopeOfWork.paymentConditions
   * and are the real source of truth the printed documents use. `code` is the short business code
   * accounting already uses on paper (e.g. "K-029") — optional since old customers won't have one
   * yet; left blank rather than auto-generated (no established numbering convention to match). */
  code?: string;
  apContactName?: string;
  apContactPhone?: string;
  apContactEmail?: string;
  billingConditions?: string;
  requiresReport?: boolean;
}
export async function customersCollection() {
  const db = await getDb();
  return db.collection<CustomerFields>("customers");
}

/**
 * ทะเบียนผู้ขายของฝ่ายจัดซื้อ (2026-08-31) — ชุดฟิลด์ตรงกับที่ใบสั่งซื้อมีอยู่แล้ว 5 ช่อง
 * บวก `code` (รหัสผู้ขาย) ที่เจ้าของขอไว้ · `code` ว่างได้ แต่ถ้ากรอกแล้วห้ามซ้ำ
 * (unique partial index — ดู `ensureVendorIndexes()` ใน vendorsHandler.ts)
 */
export interface VendorFields {
  name: string;
  code: string;
  contactName: string;
  phone: string;
  taxId: string;
  address: string;
  note: string;
  isActive: boolean;
  /** ขั้นอนุมัติของบัญชี (2026-09-21) — ไม่มีค่า = ผู้ขายก่อนวันนั้น อ่านเป็น "approved" เสมอ
   *  ห้ามอ่านฟิลด์นี้ตรง ๆ ใช้ `vendorApprovalStatusOf()` จาก src/lib/vendors.ts */
  approvalStatus?: VendorApprovalStatus;
  submittedAt?: string;
  submittedBy?: string;
  approvedAt?: string;
  approvedByUserId?: string;
  approvedByName?: string;
  rejectionComment?: string;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}
export async function vendorsCollection() {
  const db = await getDb();
  return db.collection<VendorFields>("vendors");
}

/**
 * เทมเพลตใบเบิกและใบคืนวัสดุ (2026-09-02) — ชุดรายการที่ตั้งชื่อไว้ กดครั้งเดียวแล้วรายการทั้งชุด
 * ไหลลงใบเบิก · ดู src/lib/materialRequisitionTemplate.ts สำหรับเหตุผลที่ไม่ทำเป็นโมดูลใหญ่
 */
export type MaterialRequisitionTemplateFields = Omit<MaterialRequisitionTemplate, "id">;
export async function materialRequisitionTemplatesCollection() {
  const db = await getDb();
  return db.collection<MaterialRequisitionTemplateFields>("material_requisition_templates");
}

/**
 * ทะเบียนรหัสสำหรับใบ PR/PO (2026-08-31) — **สองชุดใน collection เดียว แยกด้วย `kind`**
 * `department` คือรหัสแผนกแบบ `G143` · `account` คือผังบัญชีแบบ `5230-15` (สี่ฟิลด์ล่างใช้เฉพาะฝั่งบัญชี)
 * รหัสห้ามซ้ำ**ภายในชนิดเดียวกัน** — unique index จึงเป็น `{ kind, code }` ไม่ใช่ `{ code }` เดี่ยว
 */
export interface CodeEntryFields {
  /** `workType` (2026-09-03) = ประเภทงานที่ใบเบิก "ตัดเข้างาน" (งานเหล็ก / งานโรงงาน / งานผลิต …) */
  kind: "department" | "account" | "workType";
  code: string;
  name: string;
  category: string;
  level: number | null;
  isControl: boolean;
  parentCode: string;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}
export async function codeEntriesCollection() {
  const db = await getDb();
  return db.collection<CodeEntryFields>("code_entries");
}

export interface CustomerContactFields {
  customerId: string;
  name: string;
  position: string;
  phone: string;
  email: string;
  isPrimary: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  deletedAt: string | null;
}
export async function customerContactsCollection() {
  const db = await getDb();
  return db.collection<CustomerContactFields>("customer_contacts");
}

export type LeadStage =
  | "ลูกค้าใหม่"
  | "ติดต่อแล้ว"
  | "ติดตามผล"
  | "สนใจ"
  | "รอใบเสนอราคา"
  | "ส่งใบเสนอราคาแล้ว"
  | "เจรจาต่อรอง"
  | "ปิดการขายสำเร็จ"
  | "เสียโอกาส";

export interface LeadFields {
  companyName: string;
  contactName: string;
  position: string;
  phone: string;
  email: string;
  address: string;
  taxId: string;
  source: string;
  salesOwnerId: string;
  notes: string;
  stage: LeadStage;
  convertedToCustomerId: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  deletedAt: string | null;
}
export async function leadsCollection() {
  const db = await getDb();
  return db.collection<LeadFields>("leads");
}

/** Append-only lead timeline — no updatedAt/deletedAt, matches the audit_log/approvalHistory immutable-event-log convention. */
export interface LeadActivityFields {
  leadId: string;
  type: "stage_change" | "note" | "call" | "email" | "meeting";
  fromStage: LeadStage | null;
  toStage: LeadStage | null;
  description: string;
  userId: string;
  userName: string;
  createdAt: string;
}
export async function leadActivitiesCollection() {
  const db = await getDb();
  return db.collection<LeadActivityFields>("lead_activities");
}

export interface ProductTemplateFields {
  name: string;
  categoryId: string;
  unit: string;
  defaultPrice: number;
  description: string;
  specifications: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}
export async function productTemplatesCollection() {
  const db = await getDb();
  return db.collection<ProductTemplateFields>("product_templates");
}

export interface QuotationCommentFields {
  quoteId: string;
  userId: string;
  userName: string;
  text: string;
  createdAt: string;
  editedAt: string | null;
}
export async function quotationCommentsCollection() {
  const db = await getDb();
  return db.collection<QuotationCommentFields>("quotation_comments");
}

export interface QuotationTagFields {
  name: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}
export async function quotationTagsCollection() {
  const db = await getDb();
  return db.collection<QuotationTagFields>("quotation_tags");
}

/** Mirrors the hardcoded NotificationType union in src/lib/notifications.ts — scaffolding, not read by any live code path yet. */
export interface NotificationTypeFields {
  key: string;
  label: string;
  module: string;
  createdAt: string;
}
export async function notificationTypesCollection() {
  const db = await getDb();
  return db.collection<NotificationTypeFields>("notification_types");
}

/** Singleton, like `company` — application config, distinct from company business identity. */
export interface SystemSettingsFields {
  _id: "singleton";
  defaultPageSize: number;
  maintenanceMode: boolean;
  sessionDurationDays: number;
  updatedAt: string;
  updatedBy: string;
}
export async function systemSettingsCollection() {
  const db = await getDb();
  return db.collection<SystemSettingsFields>("system_settings");
}

/**
 * One row per applied RBAC migration (`_id` = the migration's id in RBAC_MIGRATIONS,
 * api/_lib/rbacSeed.ts). Presence means "already applied, never apply again" — that's what keeps a
 * permission an admin later revokes in Role Management from silently coming back. `_id`-keyed, so
 * it needs no entry in ensureIndexes().
 */
export interface RbacMigrationFields {
  _id: string;
  appliedAt: string;
  appliedRoleKeys: string[];
}
export async function rbacMigrationsCollection() {
  const db = await getDb();
  return db.collection<RbacMigrationFields>("rbac_migrations");
}

/** Nothing writes to this yet — every current upload (logo/stamp/profile picture/signature) is inline base64 on its parent document. Forward-looking scaffolding for real blob storage. */
export interface UploadFields {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storageUrl: string;
  uploadedByUserId: string;
  purpose: "logo" | "stamp" | "profile_picture" | "signature" | "attachment" | "other";
  createdAt: string;
}
export async function uploadsCollection() {
  const db = await getDb();
  return db.collection<UploadFields>("uploads");
}

export interface JobTypeFields {
  code: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}
export async function jobTypesCollection() {
  const db = await getDb();
  return db.collection<JobTypeFields>("job_types");
}

export interface AttachmentFields {
  entityType: "quote" | "lead" | "customer" | "product";
  entityId: string;
  uploadId: string;
  fileName: string;
  uploadedByUserId: string;
  createdAt: string;
}
export async function attachmentsCollection() {
  const db = await getDb();
  return db.collection<AttachmentFields>("attachments");
}

/**
 * Company Profiles — the `company_profiles` MongoDB collection from the multi-issuer-company admin
 * module added 2026-07-13 and removed 2026-07-14 (this ERP has exactly one issuer company; see
 * docs/MODULES/CompanyProfiles.md "Removed (2026-07-14)"). No code anywhere reads or writes this
 * collection anymore — the accessor function and its `CompanyProfileFields` type were deleted along
 * with the rest of the module. **The collection itself, and any documents already in it from when
 * the module was live, were deliberately left untouched in MongoDB** — this removal only touched
 * application code, per the standing "no destructive database cleanup" rule for this pass. If a
 * future data-hygiene pass wants to drop `company_profiles` for good, that's a separate, explicit,
 * reversible-only-via-backup decision, not something to do silently as part of a code removal.
 */

// ─── Accounts Receivable / Milestone Billing (added 2026-08-17) ───────────
// See docs/MODULES/Accounting.md for the full design writeup. Milestones/documents pull job data
// from the *existing* ScopeOfWork record (not a parallel "Work" entity) — ScopeOfWork itself carries
// no pricing, so totalContractValueExVat/retentionPct/workClassification are captured once here,
// frozen at first touch, never re-derived. Deliberately do NOT use the isDeleted soft-delete
// convention every other collection uses: issued tax invoices/billing notes must never disappear —
// cancellation is exclusively the `status: "cancelled"` transition on ArDocumentFields.

export type ArBillingStatus = "not_billed" | "billed" | "work_open" | "closed";
export type ArWorkClassification = "goods" | "service" | "contract";

/** Keys accounting confirmed matter for the §9 attachment checklist — a job's applicable subset is
 * decided in the wizard (e.g. `report`/`bankGuarantee`/`whtEnvelope` only show up when relevant),
 * not every key is required for every milestone. */
export type ArChecklistKey = "poCopy" | "deliveryNote" | "report" | "stampDuty" | "bankGuarantee" | "whtEnvelope";

/** One row per Scope of Work installment AR has touched — created lazily the first time a user
 * opens that installment's Issue Billing Set wizard, never proactively for every installment in the
 * system. `pct`/`label`/`paymentType`/`days` are a snapshot of the source
 * ScopeOfWorkPaymentInstallment at that moment, not re-synced automatically afterward (an explicit
 * "Refresh from Scope of Work" action can re-pull them for a not-yet-billed milestone) — because by
 * the time AR has touched a milestone, `totalContractValueExVat` is already frozen, so the row is a
 * point-in-time snapshot, not a live view. */
export interface ArMilestoneFields {
  scopeOfWorkId: string;
  installmentId: string;
  isDownPayment: boolean;
  pct: number | null;
  label: string;
  paymentType: "" | "Cash" | "Credit";
  days: number | null;
  /** Frozen once at first touch — see file header comment. Pulled transitively via
   * ScopeOfWork.quotationId -> Quote, through computeQuoteAmountBeforeVat() (api/_lib/quoteAmounts.ts). */
  totalContractValueExVat: number;
  retentionPct: number | null;
  workClassification: ArWorkClassification;
  billingStatus: ArBillingStatus;
  checklistState: Partial<Record<ArChecklistKey, boolean>>;
  attachmentIds: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}
export async function arMilestonesCollection() {
  const db = await getDb();
  return db.collection<ArMilestoneFields>("ar_milestones");
}

/** Checklist attachment BYTES for an ar_milestones row (2026-08-17) — a dedicated collection, NOT
 * Scope of Work's `scope_attachment_files` (that system is hard-scoped to 5 files *per Scope of Work
 * record*, embedded on the ScopeOfWork document, and gated by Sales' `scopeOfWork:edit` permission —
 * reusing it would both blow through the cap on any multi-installment job and require Accounting
 * staff to hold a Sales document-edit permission). Internal-only checklist evidence (never emailed to
 * an external recipient the way Scope of Work's attachments are), so downloads are gated by a normal
 * session + `ar:view` permission check — no unguessable capability-URL token needed here. */
export interface ArAttachmentFileFields {
  milestoneId: string;
  attachmentId: string;
  checklistKey: ArChecklistKey;
  fileName: string;
  contentType: string;
  size: number;
  data: import("mongodb").Binary;
  createdAt: string;
  createdBy: string;
}
export async function arAttachmentFilesCollection() {
  const db = await getDb();
  return db.collection<ArAttachmentFileFields>("ar_attachment_files");
}

export type ArDocumentType = "AR" | "IV" | "BI" | "RE";
export type ArDocumentStatus = "issued" | "cancelled";

export interface ArDocumentLine {
  seq: number;
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
  /** May be negative for a down-payment deduction line. */
  amount: number;
  /** Set only on a deduction line — traces back to the milestone-1 AR it deducts. */
  linkedArDocumentId?: string;
}

export interface ArDocumentCustomerSnapshot {
  companyName: string;
  address: string;
  taxId: string;
  branch: string;
  contactName: string;
  phone: string;
  email: string;
}

/** One row per issued AR/IV/BI/RE (discriminated by `docType` — RE, the receipt, added 2026-08-18
 * when the owner confirmed the 4-document set; the others are Phase 1, 2026-08-17). Never
 * soft-deleted (see file header) — `status: "cancelled"` is the only way an issued document stops
 * being active, and it stays visible/auditable forever. */
export interface ArDocumentFields {
  scopeOfWorkId: string;
  milestoneId: string;
  docType: ArDocumentType;
  docNo: string;
  docDate: string;
  dueDate: string;
  /** Denormalized from the source milestone at issue time (added 2026-08-18, for the Invoice/
   * Billing Note's "เงื่อนไขการชำระเงิน" field on the real reference form) — never re-derived, so a
   * later milestone edit (impossible post-billing anyway) can't retroactively change an issued
   * document's printed condition. */
  paymentType: "" | "Cash" | "Credit";
  customerSnapshot: ArDocumentCustomerSnapshot;
  reference: string;
  lines: ArDocumentLine[];
  subtotal: number;
  discount: number;
  valueAmount: number;
  vatRate: number;
  vatAmount: number;
  netTotal: number;
  amountTextTh: string;
  remarks: string[];
  /** True once any stock has been cut against this document (added 2026-08-18, IV only in
   * practice — AR/BI/RE carry no real product lines, see stockHandler.ts). Denormalized off the
   * `stock_movements` ledger purely so the print layout can stamp "ตัดสต๊อกแล้ว"/"ยังไม่ตัดสต๊อก"
   * without a join; the ledger itself (filter by sourceId) is the source of truth for what/how much. */
  stockDeducted: boolean;
  /** True for a freestanding tax invoice created via "+ สร้างใบกำกับภาษี (Manual)" (added
   * 2026-08-18) — no Scope of Work/milestone behind it at all (`scopeOfWorkId`/`milestoneId` are
   * both `""`). Lets list/detail UI label it clearly instead of implying a job link that doesn't
   * exist. `false` on every job-derived AR/IV/BI/RE. */
  isManual: boolean;
  status: ArDocumentStatus;
  cancelledReason?: string;
  cancelledBy?: string;
  cancelledAt?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}
export async function arDocumentsCollection() {
  const db = await getDb();
  return db.collection<ArDocumentFields>("ar_documents");
}

// ─── Product Stock (added 2026-08-18) ──────────────────────────────────────
// Deliberately shared, document-agnostic infrastructure, NOT an Accounting-only private stock
// number — Accounting's Tax Invoice (IV) stock-cutting feature is the first caller, but
// `sourceType`/`sourceId` exist precisely so a future ใบเบิกของ (Material Requisition)/PR module
// (the "Project" department's parallel workstream — see the coordination note in docs/CLAUDE.md and
// docs/TODO.md High Priority) can write its own movement rows into this SAME collection/ledger
// instead of inventing a second, competing stock-quantity system that would silently drift out of
// sync with this one. `Product.stockQty` (src/lib/products.ts) is the denormalized current balance,
// kept in sync via applyStockMovement() (api/_lib/stockHandler.ts) — the only writer, so every
// balance change is traceable through a StockMovementFields row. See docs/MODULES/Product.md "Stock".
/**
 * `return` เพิ่ม 2026-09-03 — เจ้าของสั่ง *"ประวัติปรับ Stock ให้มีของคืนด้วย"* ของที่คืนจากใบเบิกเคยลง
 * เป็น `receive` ธรรมดา แยกไม่ออกจากของที่ซื้อเข้ามา · delta เป็นบวกเหมือน `receive`
 *
 * **ต้องประกาศให้ตรงกับ `StockMovementKind` ใน src/lib/stock.ts** — สอง union นี้ประกาศแยกกัน
 */
export type StockMovementKind = "receive" | "deduct" | "adjust" | "return";
/**
 * `material_requisition` เพิ่ม 2026-09-02 ตอนทำ "ตัดของอัตโนมัติ" ซึ่ง**ถูกถอดออกแล้วเมื่อ 2026-09-03** —
 * ตอนนี้ของออกจากคลังตอน**สโตร์กดจ่ายจริง**เท่านั้น ไม่มีการตัดสต๊อกอัตโนมัติตอนอนุมัติเอกสารใดเลย
 * (`goods_receipt` เคยมีแล้วถูกลบไปเมื่อ 2026-08-28d พร้อมกับการถอดใบตรวจรับออก)
 * `receiving_report` เพิ่ม 2026-09-03 — ใบรับสินค้าของสโตร์ (สร้างจากใบสั่งซื้อ) รับของเข้าพร้อมต้นทุน
 * `purchase_request` เพิ่ม 2026-09-09 — สโตร์เช็คใบขอซื้อแล้วพบว่ามีของในสต๊อก จึงจ่ายจากใบขอซื้อนั้นเลย
 * (เจ้าของเลือกทางนี้แทนการสร้างใบเบิกอีกใบ ดู src/lib/purchaseRequest.ts `PurchaseRequestIssueBatch`)
 */
export type StockMovementSourceType = "manual" | "ar_document" | "material_requisition" | "receiving_report" | "tool_issue" | "purchase_request";

export interface StockMovementFields {
  productId: string;
  /** Denormalized snapshot — code/name may change on the Product later; the movement log should
   * always show what they were at the time, like ArDocumentCustomerSnapshot does for customers. */
  productCode: string;
  productName: string;
  kind: StockMovementKind;
  /** Signed effect on `Product.stockQty` — positive for "receive", negative for "deduct", either
   * sign for "adjust" (a manual correction, e.g. after a physical stock count). */
  delta: number;
  /** `Product.stockQty` immediately after this movement was applied — an audit snapshot, not
   * re-derived, so the log stays readable even if later movements are viewed out of order. */
  balanceAfter: number;
  reason: string;
  sourceType: StockMovementSourceType;
  /** Set only when sourceType === "ar_document" — the ArDocument _id this movement was cut against. */
  sourceId?: string;
  /** Denormalized, e.g. the AR document's docNo, so the movement log reads without a join. */
  sourceLabel?: string;
  /**
   * ต้นทุน/หน่วยของการเคลื่อนไหวนี้ (2026-09-03, การ์ดสต๊อกและมูลค่าสต๊อก) — รับเข้าจากใบรับสินค้า
   * ใช้ราคาที่ซื้อจริง ส่วนจ่ายออก/คืน/ปรับ ใช้ต้นทุนถัวเฉลี่ยของสินค้า ณ ตอนนั้น (`Product.avgCost`)
   * แถวที่บันทึกก่อนวันนั้นไม่มีฟิลด์นี้ — การ์ดสต๊อกพิมพ์ขีดกลาง ไม่ได้ทำ migration
   */
  unitCost?: number;
  /** |delta| × unitCost — เก็บไว้ให้การ์ดสต๊อกอ่านโดยไม่ต้องคูณเอง */
  amount?: number;
  /** stockQty × avgCost หลังการเคลื่อนไหว — คู่กับ `balanceAfter` */
  balanceValueAfter?: number;
  /**
   * แผนก/ทีม/ประเภทงานที่ของถูกตัดให้ หรือคืนจาก (2026-09-03, เจ้าของสั่ง *"เลือกตัดของแผนกไหนทีมไหน
   * ตัด/คืนเหมือนกัน"* และ *"ตัดงานนี้เป็นงานเหล็ก งานโรงงาน งานผลิต"*) — ประทับจากหัวใบเบิกตอนจ่าย/คืน
   * ชื่อเก็บเป็น snapshot เพราะรายงานเครื่องมือประจำทีมต้องอ่านย้อนหลังได้แม้ทีมถูกเปลี่ยนชื่อ
   */
  departmentId?: string;
  departmentName?: string;
  teamId?: string;
  teamName?: string;
  workTypeCode?: string;
  workTypeName?: string;
  createdAt: string;
  createdBy: string;
}
export async function stockMovementsCollection() {
  const db = await getDb();
  return db.collection<StockMovementFields>("stock_movements");
}

// ─── Project module (added 2026-08-18, Stage 2 — data layer only, no API routes/UI yet) ──────────
// See src/lib/project.ts / materialRequisition.ts / jobOrder.ts / purchaseRequest.ts for the full
// domain-shape doc comments and the PDF-to-field mapping (public/reference/FM-PJ-01, FM-ST-04 x4,
// -ED6908027). Generated from an existing ScopeOfWork record, same relationship shape as
// DeliveryOrder — see deliveryOrdersCollection() above.

/** ObjectId-keyed, like scope_of_works/delivery_orders — a Project has no printed document number of
 * its own (it's an internal grouping record, not a printed document like its 3 sub-document types
 * below). No uniqueness constraint on scopeOfWorkId, same non-enforced "usually just one" convention
 * every other Scope-of-Work-derived collection uses. */
export type ProjectFields = Omit<Project, "id">;
export async function projectsCollection() {
  const db = await getDb();
  return db.collection<ProjectFields>("projects");
}

/** Business-id-keyed (`MR-{YYYYMM}-{NNNN}` since 2026-09-03; `MR-{พ.ศ.}-{NNNN}` and
 * `{SC}-MR{n}` before that), same convention as quotes/service_reports. `documentNumber` (2026-09-03)
 * is the number printed on the form — defaults to `_id`, user-editable while Draft, unique via the
 * lazy `ensureMaterialRequisitionNumberIndex()` in materialRequisitionHandler.ts. */
export type MaterialRequisitionFields = Omit<MaterialRequisition, "id">;
export async function materialRequisitionsCollection() {
  const db = await getDb();
  return db.collection<MaterialRequisitionFields & { _id: string }>("material_requisitions");
}

/** Business-id-keyed (e.g. "JO-2569-0001"), same convention as MaterialRequisitionFields above. */
export type JobOrderFields = Omit<JobOrder, "id">;
export async function jobOrdersCollection() {
  const db = await getDb();
  return db.collection<JobOrderFields & { _id: string }>("job_orders");
}

/** Business-id-keyed (e.g. "PR-2569-0001"), same convention as MaterialRequisitionFields above. */
export type PurchaseRequestFields = Omit<PurchaseRequest, "id">;
export async function purchaseRequestsCollection() {
  const db = await getDb();
  return db.collection<PurchaseRequestFields & { _id: string }>("purchase_requests");
}

/** Business-id-keyed (e.g. "SC-2026-08-009") — ใบสั่งผลิตของฝ่ายผลิต (2026-08-20). ต่างจาก 3 ใบ
 * ด้านบนตรงที่สร้างจาก Scope of Work โดยตรง ไม่ได้ผูกกับรายการใน Project และเลขที่ใช้ ค.ศ.+เดือน
 * ตามฟอร์มจริง FM-PD-02 ไม่ใช่ พ.ศ. แบบเอกสารอื่น — ดู src/lib/productionOrder.ts */
export type ProductionOrderFields = Omit<ProductionOrder, "id">;
export async function productionOrdersCollection() {
  const db = await getDb();
  return db.collection<ProductionOrderFields & { _id: string }>("production_orders");
}

/* ── โมดูลจัดซื้อ (2026-08-28) ────────────────────────────────────────────────
 * สามใบตามผังกระบวนการจัดซื้อของเจ้าของ: ใบขอซื้อ (มีอยู่แล้ว) → ใบสั่งซื้อ → ใบตรวจรับสินค้า →
 * ใบรับวางบิล ทุกใบ business-id-keyed แบบเดียวกับใบขอซื้อ/ใบเบิก/ใบสั่งงาน และใช้ปี พ.ศ.
 * (ใบสั่งผลิตที่ใช้ ค.ศ. เป็นข้อยกเว้นเฉพาะตัวตามฟอร์มจริง ไม่ใช่แบบแผนที่ต้องตาม) */

/** Business-id-keyed (e.g. "PO-2569-0001") — ใบสั่งซื้อของฝ่ายจัดซื้อ สร้างจากใบขอซื้อที่อนุมัติแล้ว */
export type PurchaseOrderFields = Omit<PurchaseOrder, "id">;
export async function purchaseOrdersCollection() {
  const db = await getDb();
  return db.collection<PurchaseOrderFields & { _id: string }>("purchase_orders");
}

/**
 * Business-id-keyed (e.g. "CC-2569-0001") — Cost Control ของแผนก BD สร้างจากไฟล์ Excel ของงาน
 * ยอดรวมทุกตัว **ไม่ได้เก็บไว้** คำนวณจาก `lines` ตอนอ่านเสมอ (ดู `costControlTotals()`)
 */
export type CostControlFields = Omit<CostControl, "id">;
export async function costControlsCollection() {
  const db = await getDb();
  return db.collection<CostControlFields & { _id: string }>("cost_controls");
}
/**
 * Business-id-keyed (e.g. "RR-202609-0001") — ใบรับสินค้าของแผนกสโตร์ (2026-09-03) หนึ่งใบต่อหนึ่ง
 * ใบสั่งซื้อ (unique partial index บน `purchaseOrderId` เฉพาะใบที่ยังไม่ถูกลบ) รับได้หลายรอบในใบเดียว
 * ยอด รับแล้ว/ค้างรับ **ไม่ได้เก็บ** คิดจาก `batches` ตอนอ่านเสมอ (ดู `receivingReportTotals()`)
 */
export type ReceivingReportFields = Omit<ReceivingReport, "id">;
export async function receivingReportsCollection() {
  const db = await getDb();
  return db.collection<ReceivingReportFields & { _id: string }>("receiving_reports");
}

/**
 * ทะเบียนเจ้าหนี้/ภาษีซื้อ (2026-09-03) — หนึ่งแถวต่อหนึ่งรอบการรับของ เขียนโดยเซิร์ฟเวอร์เท่านั้น
 * ตอนบันทึกรับของ ไม่มีทางสร้างด้วยมือ บัญชีแก้ได้แค่สถานะจ่าย/ไม่จ่าย
 */
export type ApEntryFields = Omit<ApEntry, "id">;
export async function apEntriesCollection() {
  const db = await getDb();
  return db.collection<ApEntryFields>("ap_entries");
}

/** Creates required indexes across every collection. Idempotent — safe to call repeatedly, but only worth calling from setup/cold paths, not every request. */
export async function ensureIndexes() {
  const [
    users, roles, products, categories, quotes, notifications, auditLog,
    permissions, departments, teams, positions, customers, customerContacts,
    leads, leadActivities, productTemplates, quotationComments, quotationTags,
    notificationTypes, jobTypes, quotationTemplates, scopeOfWorks, deliveryOrders,
    scopeAttachmentFiles, serviceTemplates, serviceReports, serviceChecklistPhotoFiles,
    arMilestones, arAttachmentFiles, arDocuments, stockMovements,
    projects, materialRequisitions, jobOrders, purchaseRequests, productionOrders,
    productRequests,
    purchaseOrders, costControls,
    receivingReports, apEntries,
  ] = await Promise.all([
    usersCollection(), rolesCollection(), productsCollection(), categoriesCollection(),
    quotesCollection(), notificationsCollection(), auditLogCollection(),
    permissionsCollection(), departmentsCollection(), teamsCollection(), positionsCollection(),
    customersCollection(), customerContactsCollection(),
    leadsCollection(), leadActivitiesCollection(), productTemplatesCollection(),
    quotationCommentsCollection(), quotationTagsCollection(), notificationTypesCollection(),
    jobTypesCollection(), quotationTemplatesCollection(), scopeOfWorksCollection(), deliveryOrdersCollection(),
    scopeAttachmentFilesCollection(), serviceTemplatesCollection(), serviceReportsCollection(),
    serviceChecklistPhotoFilesCollection(),
    arMilestonesCollection(), arAttachmentFilesCollection(), arDocumentsCollection(),
    stockMovementsCollection(),
    projectsCollection(), materialRequisitionsCollection(), jobOrdersCollection(), purchaseRequestsCollection(),
    productionOrdersCollection(),
    productRequestsCollection(),
    purchaseOrdersCollection(), costControlsCollection(),
    receivingReportsCollection(), apEntriesCollection(),
  ]);

  await Promise.all([
    // Existing, already-live collections
    users.createIndex({ employeeId: 1 }, { unique: true }),
    users.createIndex({ username: 1 }, { unique: true }),
    users.createIndex({ email: 1 }, { unique: true }),
    // Backs buildOwnershipClause()'s department/team member-resolution queries (2026-08-14).
    users.createIndex({ department: 1 }),
    users.createIndex({ teamId: 1 }),
    roles.createIndex({ key: 1 }, { unique: true }),
    products.createIndex({ categoryId: 1 }),
    products.createIndex({ archived: 1 }),
    categories.createIndex({ name: 1 }),
    quotes.createIndex({ status: 1 }),
    quotes.createIndex({ createdByUserId: 1 }),
    quotes.createIndex({ issueDate: 1 }),
    quotes.createIndex({ jobTypeCode: 1 }),
    quotes.createIndex({ salesperson: 1 }),
    quotes.createIndex({ followUpDate: 1 }),
    quotes.createIndex({ isPotentialOpportunity: 1 }),
    quotes.createIndex({ client: 1 }),
    notifications.createIndex({ recipientUserId: 1, createdAt: -1 }),
    auditLog.createIndex({ createdAt: -1 }),

    // New schema-prep collections
    permissions.createIndex({ key: 1 }, { unique: true }),
    departments.createIndex({ code: 1 }, { unique: true }),
    teams.createIndex({ departmentId: 1 }),
    positions.createIndex({ code: 1 }, { unique: true }),
    customers.createIndex({ isDeleted: 1 }),
    customers.createIndex({ isActive: 1 }),
    customers.createIndex({ companyName: 1 }),
    customerContacts.createIndex({ customerId: 1 }),
    leads.createIndex({ salesOwnerId: 1 }),
    leads.createIndex({ stage: 1 }),
    leads.createIndex({ deletedAt: 1 }),
    leadActivities.createIndex({ leadId: 1, createdAt: -1 }),
    productTemplates.createIndex({ categoryId: 1 }),
    productTemplates.createIndex({ isActive: 1 }),
    quotationComments.createIndex({ quoteId: 1, createdAt: 1 }),
    quotationTags.createIndex({ name: 1 }, { unique: true }),
    notificationTypes.createIndex({ key: 1 }, { unique: true }),
    jobTypes.createIndex({ code: 1 }, { unique: true }),
    jobTypes.createIndex({ isActive: 1 }),
    quotationTemplates.createIndex({ templateCode: 1 }, { unique: true }),
    quotationTemplates.createIndex({ jobTypeCode: 1 }),
    quotationTemplates.createIndex({ isActive: 1 }),
    quotationTemplates.createIndex({ isDeleted: 1 }),
    scopeOfWorks.createIndex({ scopeNumber: 1 }, { unique: true }),
    scopeOfWorks.createIndex({ quotationId: 1 }),
    scopeOfWorks.createIndex({ status: 1 }),
    scopeOfWorks.createIndex({ isDeleted: 1 }),
    deliveryOrders.createIndex({ scopeOfWorkId: 1 }),
    deliveryOrders.createIndex({ status: 1 }),
    deliveryOrders.createIndex({ isDeleted: 1 }),
    // Attachment file bytes — the download route looks up by {scopeOfWorkId, attachmentId}; these
    // docs each carry up to 2 MB of Binary, so an unindexed scan is disproportionately expensive.
    // Also declared defensively per-instance in scopeOfWorkHandler.ts (ensureAttachmentIndexes())
    // because this function only runs from the one-time Setup Wizard.
    scopeAttachmentFiles.createIndex({ attachmentId: 1 }, { unique: true }),
    scopeAttachmentFiles.createIndex({ scopeOfWorkId: 1 }),
    serviceTemplates.createIndex({ templateCode: 1 }, { unique: true }),
    serviceTemplates.createIndex({ isActive: 1 }),
    serviceTemplates.createIndex({ isDeleted: 1 }),
    serviceReports.createIndex({ customerId: 1 }),
    serviceReports.createIndex({ status: 1 }),
    serviceReports.createIndex({ createdBy: 1 }),
    serviceReports.createIndex({ inspectionDate: 1 }),
    serviceChecklistPhotoFiles.createIndex({ photoId: 1 }, { unique: true }),
    serviceChecklistPhotoFiles.createIndex({ serviceReportId: 1 }),
    // Accounts Receivable (added 2026-08-17) — see docs/MODULES/Accounting.md.
    arMilestones.createIndex({ scopeOfWorkId: 1, installmentId: 1 }, { unique: true }),
    arMilestones.createIndex({ billingStatus: 1 }),
    arAttachmentFiles.createIndex({ attachmentId: 1 }, { unique: true }),
    arAttachmentFiles.createIndex({ milestoneId: 1 }),
    arDocuments.createIndex({ scopeOfWorkId: 1 }),
    arDocuments.createIndex({ milestoneId: 1 }),
    arDocuments.createIndex({ docNo: 1 }, { unique: true }),
    arDocuments.createIndex({ status: 1 }),
    arDocuments.createIndex({ dueDate: 1 }),
    // Product Stock (added 2026-08-18)
    stockMovements.createIndex({ productId: 1, createdAt: -1 }),
    stockMovements.createIndex({ sourceType: 1, sourceId: 1 }),

    // Project module (added 2026-08-18, Stage 2).
    projects.createIndex({ scopeOfWorkId: 1 }),
    projects.createIndex({ status: 1 }),
    projects.createIndex({ isDeleted: 1 }),
    materialRequisitions.createIndex({ projectId: 1 }),
    materialRequisitions.createIndex({ scopeOfWorkId: 1 }),
    materialRequisitions.createIndex({ status: 1 }),
    materialRequisitions.createIndex({ isDeleted: 1 }),
    jobOrders.createIndex({ projectId: 1 }),
    jobOrders.createIndex({ scopeOfWorkId: 1 }),
    jobOrders.createIndex({ status: 1 }),
    jobOrders.createIndex({ isDeleted: 1 }),
    purchaseRequests.createIndex({ projectId: 1 }),
    purchaseRequests.createIndex({ scopeOfWorkId: 1 }),
    purchaseRequests.createIndex({ status: 1 }),
    purchaseRequests.createIndex({ isDeleted: 1 }),

    // ใบสั่งผลิต (2026-08-20) — สร้างจาก Scope of Work โดยตรง ไม่มี projectId
    productionOrders.createIndex({ scopeOfWorkId: 1 }),
    productionOrders.createIndex({ status: 1 }),
    productionOrders.createIndex({ isDeleted: 1 }),

    // คำขอเพิ่มสินค้า (2026-08-27) — หน้ารายการกรองตามผู้ขอ/สถานะ และเรียงตามวันที่สร้าง
    productRequests.createIndex({ requestedBy: 1 }),
    productRequests.createIndex({ status: 1 }),
    productRequests.createIndex({ isDeleted: 1 }),

    // โมดูลจัดซื้อ (2026-08-28) — ไล่ตามสายเอกสาร PR → PO → ตรวจรับ → รับวางบิล
    // หมายเหตุ: unique index ของ documentNumber ไม่ได้ประกาศตรงนี้ เพราะ ensureIndexes() รันแค่ตอน
    // Setup Wizard ครั้งเดียว ฐานข้อมูลที่ติดตั้งไปแล้วจะไม่ได้ — handler สร้างเองแบบ lazy
    purchaseOrders.createIndex({ purchaseRequestId: 1 }),
    purchaseOrders.createIndex({ status: 1 }),
    purchaseOrders.createIndex({ isDeleted: 1 }),
    purchaseOrders.createIndex({ createdBy: 1 }),
    costControls.createIndex({ status: 1 }),
    costControls.createIndex({ isDeleted: 1 }),
    costControls.createIndex({ createdBy: 1 }),
    costControls.createIndex({ jobOrder: 1 }),
    // FK ไป Scope of Work (2026-08-31) — ใช้ทั้งตอนเช็คว่า Scope ใบนี้มี Cost Control แล้วหรือยัง
    // และตอนกรองใบที่ผู้ใช้เห็นได้เพราะถูกส่ง Scope ถึง · ไม่ unique โดยตั้งใจ ("ปกติใบเดียว แต่ไม่บังคับ")
    costControls.createIndex({ scopeOfWorkId: 1 }),
    // ใบรับสินค้า: หนึ่งใบสั่งซื้อมีได้ใบเดียว — partial index เพื่อให้ใบที่ลบไปแล้วไม่กันการเปิดใบใหม่
    receivingReports.createIndex({ purchaseOrderId: 1 }, { unique: true, partialFilterExpression: { isDeleted: false } }),
    receivingReports.createIndex({ status: 1 }),
    receivingReports.createIndex({ isDeleted: 1 }),
    receivingReports.createIndex({ createdBy: 1 }),
    // ทะเบียนภาษีซื้อกรองตามเดือนของ `invoiceDate` ส่วนทะเบียนเจ้าหนี้จัดกลุ่มตามผู้ขาย/สถานะ
    apEntries.createIndex({ invoiceDate: 1 }),
    apEntries.createIndex({ vendorName: 1 }),
    apEntries.createIndex({ status: 1 }),
    apEntries.createIndex({ receivingReportId: 1 }),
    apEntries.createIndex({ batchId: 1 }),
  ]);

  // sessions: TTL index, auto-purges expired docs — created separately (different option shape)
  const sessions = await sessionsCollection();
  await sessions.createIndex({ userId: 1 });
  await sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

  // login_attempts (2026-07-29, login rate limiting): TTL auto-purge + the two count-query keys.
  // Also declared defensively per-instance in api/handlers/auth.ts (ensureLoginAttemptIndexes())
  // because this function only runs from the one-time Setup Wizard.
  const loginAttempts = await loginAttemptsCollection();
  await Promise.all([
    loginAttempts.createIndex({ createdAt: 1 }, { expireAfterSeconds: 15 * 60 }),
    loginAttempts.createIndex({ identifier: 1, createdAt: 1 }),
    loginAttempts.createIndex({ ip: 1, createdAt: 1 }),
  ]);
}

export function toObjectId(id: string): ObjectId {
  if (!ObjectId.isValid(id)) {
    throw new HttpError(400, "Invalid id");
  }
  return new ObjectId(id);
}

export function toPublicUser(doc: WithId<UserFields>): PublicUser {
  // `emailAppPasswordEnc` (legacy, feature removed 2026-08-07) is still destructured out
  // defensively — old documents may carry it, and this function feeds every user-facing response.
  const { _id, passwordHash: _passwordHash, emailAppPasswordEnc: _legacyEnc, ...rest } = doc;
  return { id: _id.toString(), ...rest };
}

/** Maps a Mongo _id (ObjectId, or a string business id like a quote number) to the client-side `id` field used across every domain type. */
export function withStringId<T extends { _id: ObjectId | string }>(doc: T): Omit<T, "_id"> & { id: string } {
  const { _id, ...rest } = doc;
  return { id: _id.toString(), ...rest };
}
