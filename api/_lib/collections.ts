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

export async function quotesCollection() {
  const db = await getDb();
  return db.collection<QuoteFields & { _id: string }>("quotes");
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

export interface CustomerFields {
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
  status: "active" | "inactive";
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  deletedAt: string | null;
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

/** Creates required indexes across every collection. Idempotent — safe to call repeatedly, but only worth calling from setup/cold paths, not every request. */
export async function ensureIndexes() {
  const [
    users, roles, products, categories, quotes, notifications, auditLog,
    permissions, departments, positions, customers, customerContacts,
    leads, leadActivities, productTemplates, quotationComments, quotationTags,
    notificationTypes,
  ] = await Promise.all([
    usersCollection(), rolesCollection(), productsCollection(), categoriesCollection(),
    quotesCollection(), notificationsCollection(), auditLogCollection(),
    permissionsCollection(), departmentsCollection(), positionsCollection(),
    customersCollection(), customerContactsCollection(),
    leadsCollection(), leadActivitiesCollection(), productTemplatesCollection(),
    quotationCommentsCollection(), quotationTagsCollection(), notificationTypesCollection(),
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
    notifications.createIndex({ recipientUserId: 1, createdAt: -1 }),
    auditLog.createIndex({ createdAt: -1 }),

    // New schema-prep collections
    permissions.createIndex({ key: 1 }, { unique: true }),
    departments.createIndex({ code: 1 }, { unique: true }),
    positions.createIndex({ code: 1 }, { unique: true }),
    customers.createIndex({ salesOwnerId: 1 }),
    customers.createIndex({ deletedAt: 1 }),
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
