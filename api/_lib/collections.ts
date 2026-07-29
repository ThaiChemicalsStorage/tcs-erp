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

/** DB storage schema — includes passwordHash, which the client-side User type deliberately omits. */
export type UserFields = Omit<User, "id"> & { passwordHash: string };
export type PublicUser = User;
type ProductFields = Omit<Product, "id">;
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

/** Scope of Work attachment file BYTES (added 2026-07-24, reworked same day from Vercel Blob to
 * MongoDB after the user clarified the Vercel deployment is only a trial — the real hosting plan
 * is elsewhere, so file storage must travel with the database). One document per attached file,
 * kept OUT of the scope_of_works documents so fetching a record never drags megabytes of file
 * data along. `data` is BSON Binary (raw bytes, no base64 overhead). `downloadKey` is a random
 * capability token — the download route serves the file to anyone presenting it (email recipients
 * have no app session in their mail client), same unguessable-URL security model Vercel Blob's
 * public URLs used. Size discipline lives in the upload route's limits (2 MB/file, 5 files/record
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

/** Delivery Order (added 2026-07-23) — see `src/lib/deliveryOrder.ts` for the full domain-shape doc
 * comment and docs/MODULES/DeliveryOrder.md for the PDF-to-field mapping. No uniqueness constraint
 * on `scopeOfWorkId` (a Scope of Work can in principle have more than one, same non-enforced
 * "usually just one" convention Scope of Work itself has relative to its own quotation). */
export type DeliveryOrderFields = Omit<DeliveryOrder, "id">;
export async function deliveryOrdersCollection() {
  const db = await getDb();
  return db.collection<DeliveryOrderFields>("delivery_orders");
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

/** Scaffolding for future session revocation ("log out other devices"). Not written to yet — auth stays pure-JWT this pass. */
export interface SessionFields {
  userId: ObjectId;
  tokenId: string;
  issuedAt: string;
  expiresAt: string;
  userAgent: string;
  revokedAt: string | null;
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
 * `customerSnapshot` in `src/lib/quotes.tsx` and docs/MODULES/Customer.md. Shape intentionally
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
}
export async function customersCollection() {
  const db = await getDb();
  return db.collection<CustomerFields>("customers");
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

/** Creates required indexes across every collection. Idempotent — safe to call repeatedly, but only worth calling from setup/cold paths, not every request. */
export async function ensureIndexes() {
  const [
    users, roles, products, categories, quotes, notifications, auditLog,
    permissions, departments, positions, customers, customerContacts,
    leads, leadActivities, productTemplates, quotationComments, quotationTags,
    notificationTypes, jobTypes, quotationTemplates, scopeOfWorks, deliveryOrders,
    scopeAttachmentFiles,
  ] = await Promise.all([
    usersCollection(), rolesCollection(), productsCollection(), categoriesCollection(),
    quotesCollection(), notificationsCollection(), auditLogCollection(),
    permissionsCollection(), departmentsCollection(), positionsCollection(),
    customersCollection(), customerContactsCollection(),
    leadsCollection(), leadActivitiesCollection(), productTemplatesCollection(),
    quotationCommentsCollection(), quotationTagsCollection(), notificationTypesCollection(),
    jobTypesCollection(), quotationTemplatesCollection(), scopeOfWorksCollection(), deliveryOrdersCollection(),
    scopeAttachmentFilesCollection(),
  ]);

  await Promise.all([
    // Existing, already-live collections
    users.createIndex({ employeeId: 1 }, { unique: true }),
    users.createIndex({ username: 1 }, { unique: true }),
    users.createIndex({ email: 1 }, { unique: true }),
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
  ]);

  // sessions: TTL index, auto-purges expired docs — created separately (different option shape)
  const sessions = await sessionsCollection();
  await sessions.createIndex({ userId: 1 });
  await sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
}

export function toObjectId(id: string): ObjectId {
  if (!ObjectId.isValid(id)) {
    throw new HttpError(400, "Invalid id");
  }
  return new ObjectId(id);
}

export function toPublicUser(doc: WithId<UserFields>): PublicUser {
  const { _id, passwordHash: _passwordHash, ...rest } = doc;
  return { id: _id.toString(), ...rest };
}

/** Maps a Mongo _id (ObjectId, or a string business id like a quote number) to the client-side `id` field used across every domain type. */
export function withStringId<T extends { _id: ObjectId | string }>(doc: T): Omit<T, "_id"> & { id: string } {
  const { _id, ...rest } = doc;
  return { id: _id.toString(), ...rest };
}
