import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Binary } from "mongodb";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { HttpError, getPathSegments } from "./http.js";
import { requireUser, requirePermission, type AuthContext } from "./auth.js";
import {
  serviceReportsCollection, serviceTemplatesCollection, customersCollection, usersCollection,
  countersCollection, auditLogCollection, notificationsCollection, rolesCollection,
  serviceChecklistPhotoFilesCollection,
  toObjectId, withStringId, type ServiceReportFields, type CustomerFields,
} from "./collections.js";
import { roleHasPermission, findRole } from "../../src/lib/roles.js";
import { nowIso } from "../../src/lib/products.js";
import { sanitizeShortText, sanitizeLongText, validateIsoDateOrEmpty } from "./quoteValidation.js";
import { validateImageDataUrl } from "./uploadValidation.js";
import { validateServiceReportForCompletion, validateServiceChecklist, sanitizeServiceTemplateSections } from "../../src/lib/validation/serviceReportValidation.js";
import type { ServiceChecklistSectionDef } from "../../src/lib/serviceTemplates.js";
import type {
  ServiceReport, ServiceReportListItem, ServiceReportStatus, ServiceReportCustomerSnapshot,
  ServiceReportTemplateSnapshot, ServiceChecklistSectionValue, ServiceChecklistItemStatus,
  ServiceChecklistItemPhoto,
} from "../../src/lib/serviceReports.js";
import type { NotificationType } from "../../src/lib/notifications.js";
import { companyCollection } from "./collections.js";
import { isLinePushConfigured, pushLineMessage, buildApprovalFlexMessage } from "./lineHandler.js";

/**
 * Service Report API (added 2026-08-06, Phase 1; photo attachments + print added the same day,
 * pulled forward from the original Phase 2/3 roadmap per direct user request via
 * `/impeccable design`) — mounted from `api/handlers/customers.ts` on the raw pathname (Vercel
 * Hobby's 12-function cap is fully used — see docs/ARCHITECTURE.md). Mounted on the customers
 * handler (not quotes.ts) because a Service Report's one real relational anchor is
 * `customerId`/`customerSnapshot`, the same entity that file already owns — a Service Report is
 * created directly against a Customer, not derived from a quotation. See docs/MODULES/Service.md
 * for the full feature writeup. Signature capture, mobile/iPad UX, and customer acceptance remain
 * later phases — not built here.
 */

// ─── Audit ──────────────────────────────────────────────────────────────────────────────────────

async function writeServiceAuditEntry(
  ctx: AuthContext,
  action: string,
  details: string,
  related: { serviceReportId?: string; serviceTemplateId?: string },
): Promise<void> {
  const auditLog = await auditLogCollection();
  await auditLog.insertOne({
    userId: ctx.user.id,
    userName: ctx.user.fullName,
    roleName: ctx.role?.name ?? ctx.user.roleKey,
    module: "บริการ",
    action,
    details,
    createdAt: nowIso(),
    ...(related.serviceReportId ? { relatedServiceReportId: related.serviceReportId } : {}),
    ...(related.serviceTemplateId ? { relatedServiceTemplateId: related.serviceTemplateId } : {}),
  });
}

// ─── Numbering ──────────────────────────────────────────────────────────────────────────────────

/** Atomic-counter auto-generated (unlike Scope of Work, which moved to manual numbers because it's
 * created by office staff copying an already-known document number) — a Service Report is
 * field-created with no pre-existing number to copy, so auto-numbering removes the exact
 * typo/duplicate-number friction manual entry would cause there. The Buddhist year is computed
 * dynamically (unlike Quotes' hardcoded QUOTE_YEAR) so this never needs a yearly code bump. */
async function nextServiceReportId(counters: Awaited<ReturnType<typeof countersCollection>>): Promise<string> {
  const buddhistYear = new Date().getFullYear() + 543;
  const counterId = `service_report_${buddhistYear}`;
  const result = await counters.findOneAndUpdate(
    { _id: counterId },
    { $inc: { seq: 1 } },
    { returnDocument: "after", upsert: true },
  );
  const seq = result?.seq ?? 1;
  return `SR-${buddhistYear}-${String(seq).padStart(4, "0")}`;
}

// ─── Customer snapshot resolution ──────────────────────────────────────────────────────────────

function customerFieldsToSnapshot(customer: CustomerFields): ServiceReportCustomerSnapshot {
  return {
    companyName: customer.companyName, contactName: customer.contactName, address: customer.address,
    taxId: customer.taxId, phone: customer.phone, email: customer.email, projectName: customer.projectName,
  };
}

function sanitizeCustomerSnapshotManual(raw: unknown): ServiceReportCustomerSnapshot {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    companyName: sanitizeShortText(r.companyName, "ชื่อลูกค้า", true),
    contactName: sanitizeShortText(r.contactName, "ชื่อผู้ติดต่อ", true),
    address: sanitizeShortText(r.address, "ที่อยู่ลูกค้า"),
    taxId: sanitizeShortText(r.taxId, "เลขประจำตัวผู้เสียภาษี"),
    phone: sanitizeShortText(r.phone, "เบอร์โทรลูกค้า", true),
    email: sanitizeShortText(r.email, "อีเมลลูกค้า"),
    projectName: sanitizeShortText(r.projectName, "ชื่อโครงการ"),
  };
}

/** `customerId` resolution mirrors `resolveCustomerIdUpdate()`/`buildCustomerSnapshot()` in
 * api/handlers/quotes.ts: a linked customer's snapshot is always server-derived from the real
 * record (never trusted from the client); an unlinked report ("" customerId) takes its snapshot
 * straight from the client-typed fields instead. */
async function resolveCustomerIdAndSnapshot(body: Record<string, unknown>): Promise<{ customerId: string; customerSnapshot: ServiceReportCustomerSnapshot }> {
  const customerId = typeof body.customerId === "string" ? body.customerId.trim() : "";
  if (!customerId) return { customerId: "", customerSnapshot: sanitizeCustomerSnapshotManual(body.customerSnapshot) };
  const customers = await customersCollection();
  const customer = await customers.findOne({ _id: toObjectId(customerId) });
  if (!customer) throw new HttpError(400, "ไม่พบข้อมูลลูกค้าที่เลือก");
  if (customer.isDeleted) throw new HttpError(400, "ลูกค้าที่เลือกถูกเก็บถาวรแล้ว กรุณาเลือกลูกค้ารายอื่น");
  return { customerId, customerSnapshot: customerFieldsToSnapshot(customer) };
}

// ─── Checklist merge/sanitize ──────────────────────────────────────────────────────────────────

function sanitizeChecklistItemStatus(v: unknown): ServiceChecklistItemStatus | null {
  if (v === "not_selected" || v === "normal" || v === "abnormal") return v;
  return null;
}

/**
 * Rebuilds `checklist` by walking the report's own frozen `templateSnapshot.sections` — the client
 * can only ever toggle `status`/`abnormalDetail`/`measurementValue`/`included` on an item/section
 * the server itself generated, never inject a new item/group/section or rename a label. Same
 * defensive-clamp philosophy as `sanitizeChecklistGroups()` (api/_lib/documentRequirements.ts).
 * `existing` supplies fallback values for anything the incoming payload doesn't touch, so a
 * partial PATCH never silently blanks out already-answered items.
 */
function mergeChecklist(
  templateSnapshot: { sections: ServiceChecklistSectionDef[] },
  incomingRaw: unknown,
  existing: ServiceChecklistSectionValue[] | null,
): ServiceChecklistSectionValue[] {
  const incomingSections = Array.isArray(incomingRaw) ? (incomingRaw as Record<string, unknown>[]) : [];
  const incomingBySection = new Map(
    incomingSections.filter((s) => typeof s === "object" && s !== null && typeof s.key === "string").map((s) => [s.key as string, s]),
  );
  const existingBySection = new Map((existing ?? []).map((s) => [s.key, s]));

  return templateSnapshot.sections.map((sectionDef): ServiceChecklistSectionValue => {
    const inSec = incomingBySection.get(sectionDef.key);
    const exSec = existingBySection.get(sectionDef.key);
    const included = typeof inSec?.included === "boolean" ? inSec.included : (exSec ? exSec.included : !sectionDef.isOptionalAddon);

    const incomingGroups = Array.isArray(inSec?.groups) ? (inSec.groups as Record<string, unknown>[]) : [];
    const incomingGroupsMap = new Map(
      incomingGroups.filter((g) => typeof g === "object" && g !== null && typeof g.key === "string").map((g) => [g.key as string, g]),
    );
    const existingGroupsMap = new Map((exSec?.groups ?? []).map((g) => [g.key, g]));

    const groups = sectionDef.groups.map((groupDef) => {
      const inGroup = incomingGroupsMap.get(groupDef.key);
      const exGroup = existingGroupsMap.get(groupDef.key);
      const incomingItems = Array.isArray(inGroup?.items) ? (inGroup.items as Record<string, unknown>[]) : [];
      const incomingItemsMap = new Map(
        incomingItems.filter((it) => typeof it === "object" && it !== null && typeof it.key === "string").map((it) => [it.key as string, it]),
      );
      const existingItemsMap = new Map((exGroup?.items ?? []).map((it) => [it.key, it]));

      const items = groupDef.items.map((itemDef) => {
        const inItem = incomingItemsMap.get(itemDef.key);
        const exItem = existingItemsMap.get(itemDef.key);
        // `photos` is never client-settable through this merge — same "not a PATCHable field"
        // convention as ScopeOfWork.attachments; only the dedicated upload/delete routes below touch it.
        const photos = exItem?.photos ?? [];
        if (!inItem) {
          return exItem ?? { key: itemDef.key, status: "not_selected" as const, abnormalDetail: "", measurementValue: "", photos };
        }
        const status = sanitizeChecklistItemStatus(inItem.status) ?? (exItem?.status ?? "not_selected");
        const abnormalDetail = typeof inItem.abnormalDetail === "string"
          ? sanitizeLongText(inItem.abnormalDetail, `รายละเอียดของ "${itemDef.label}"`)
          : (exItem?.abnormalDetail ?? "");
        const measurementValue = typeof inItem.measurementValue === "string"
          ? sanitizeShortText(inItem.measurementValue, `ค่าที่วัดของ "${itemDef.label}"`)
          : (exItem?.measurementValue ?? "");
        return { key: itemDef.key, status, abnormalDetail, measurementValue, photos };
      });
      return { key: groupDef.key, items };
    });
    return { key: sectionDef.key, included, groups };
  });
}

function cloneTemplateSections(sections: ServiceChecklistSectionDef[]): ServiceChecklistSectionDef[] {
  return sections.map((s) => ({ ...s, groups: s.groups.map((g) => ({ ...g, items: g.items.map((it) => ({ ...it })) })) }));
}

// ─── Permission helpers ────────────────────────────────────────────────────────────────────────

function isOwnerOf(ctx: AuthContext, doc: { createdBy: string }): boolean {
  return !doc.createdBy || doc.createdBy === ctx.user.id;
}

/** Field staff can only edit their own report; anyone holding `service:complete` (a
 * manager/supervisor role) can edit any not-yet-completed record — same "manager override" idiom
 * as `canEditScope()` in scopeOfWorkHandler.ts. */
function canEditServiceReport(ctx: AuthContext, doc: { createdBy: string }): boolean {
  if (!roleHasPermission(ctx.role, "service:edit")) return false;
  return isOwnerOf(ctx, doc) || roleHasPermission(ctx.role, "service:complete");
}

// ─── Notifications ─────────────────────────────────────────────────────────────────────────────

async function notifyServiceEvent(
  recipientUserIds: string[],
  type: NotificationType,
  title: string,
  description: string,
  serviceReportId: string,
): Promise<void> {
  const ids = [...new Set(recipientUserIds)].filter((uid) => uid !== "");
  if (ids.length === 0) return;
  const createdAt = nowIso();
  const notifications = await notificationsCollection();
  await notifications.insertMany(ids.map((recipientUserId) => ({
    recipientUserId, type, title, description, module: "บริการ", relatedServiceReportId: serviceReportId, createdAt, read: false,
  })));
}

async function activeUserIdsWithPermission(permission: Parameters<typeof roleHasPermission>[1]): Promise<string[]> {
  const [users, roles] = await Promise.all([usersCollection(), rolesCollection()]);
  const [activeUsers, roleList] = await Promise.all([
    users.find({ status: "active" }, { projection: { roleKey: 1 } }).toArray(),
    roles.find({}).toArray(),
  ]);
  return activeUsers.filter((u) => roleHasPermission(findRole(roleList, u.roleKey), permission)).map((u) => u._id.toString());
}

// ─── Handlers ───────────────────────────────────────────────────────────────────────────────────

let indexesEnsured = false;
async function ensureServiceReportIndexes(): Promise<void> {
  if (indexesEnsured) return;
  const serviceReports = await serviceReportsCollection();
  try {
    await Promise.all([
      serviceReports.createIndex({ customerId: 1 }),
      serviceReports.createIndex({ status: 1 }),
      serviceReports.createIndex({ createdBy: 1 }),
      serviceReports.createIndex({ inspectionDate: 1 }),
    ]);
  } catch (err) {
    console.error("[service-reports] ensureServiceReportIndexes failed", err);
  }
  indexesEnsured = true;
}

/**
 * The single response shape for a full Service Report. Defaults the customer sign-off fields
 * (added 2026-08-07) so a report created before they existed comes back well-formed rather than
 * with three `undefined`s — a client checking `customerSignatureDataUrl !== ""` would otherwise
 * read an unsigned legacy report as signed and render a broken `<img>`.
 */
function toServiceReport(doc: ServiceReportFields & { _id: string }): ServiceReport {
  const full = withStringId(doc);
  // `tokenHash` is the approval link's only secret — strip it here so no user-facing response
  // (list/get/update) can leak material to forge the customer's approval URL.
  let customerApproval: ServiceReport["customerApproval"] = null;
  if (full.customerApproval) {
    const { tokenHash: _tokenHash, ...publicApproval } = full.customerApproval;
    customerApproval = publicApproval;
  }
  return {
    ...full,
    customerSignatureDataUrl: full.customerSignatureDataUrl ?? "",
    customerSignedName: full.customerSignedName ?? "",
    customerSignedAt: full.customerSignedAt ?? null,
    customerApproval,
  };
}

async function toListItem(doc: ServiceReportFields & { _id: string }, engineerNameById: Map<string, string>): Promise<ServiceReportListItem> {
  const full = withStringId(doc);
  return {
    id: full.id,
    customerName: full.customerSnapshot?.companyName ?? "",
    serviceLocation: full.serviceLocation ?? "",
    projectOrJobCode: full.projectOrJobCode ?? "",
    serviceSystemName: full.serviceSystemName ?? "",
    status: full.status ?? "Draft",
    inspectionDate: full.inspectionDate ?? "",
    assignedServiceEngineerId: full.assignedServiceEngineerId ?? "",
    assignedServiceEngineerName: engineerNameById.get(full.assignedServiceEngineerId ?? "") ?? "",
    updatedAt: full.updatedAt ?? "",
  };
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "service:view");
  await ensureServiceReportIndexes();

  const serviceReports = await serviceReportsCollection();
  const ownershipMatch = roleHasPermission(ctx.role, "service:viewAll")
    ? {}
    : { $or: [{ createdBy: ctx.user.id }, { createdBy: "" }] };
  const docs = await serviceReports.find({ isDeleted: false, ...ownershipMatch }).sort({ updatedAt: -1 }).toArray();

  const engineerIds = [...new Set(docs.map((d) => d.assignedServiceEngineerId).filter((id): id is string => !!id))];
  const engineerNameById = new Map<string, string>();
  if (engineerIds.length > 0) {
    const users = await usersCollection();
    const userDocs = await users.find({ _id: { $in: engineerIds.map((id) => toObjectId(id)) } }, { projection: { fullName: 1 } }).toArray();
    for (const u of userDocs) engineerNameById.set(u._id.toString(), u.fullName);
  }

  res.status(200).json({ serviceReports: await Promise.all(docs.map((d) => toListItem(d, engineerNameById))) });
}

async function loadReportOrThrow(id: string): Promise<ServiceReportFields & { _id: string }> {
  const serviceReports = await serviceReportsCollection();
  const doc = await serviceReports.findOne({ _id: id });
  if (!doc || doc.isDeleted) throw new HttpError(404, "ไม่พบรายงานบริการ");
  return doc;
}

async function handleGetOne(req: VercelRequest, res: VercelResponse, id: string) {
  await requirePermission(req, "service:view");
  const doc = await loadReportOrThrow(id);
  res.status(200).json({ serviceReport: toServiceReport(doc) });
}

const MAX_ADDITIONAL_INSPECTORS = 20;

function sanitizeAdditionalInspectorNames(raw: unknown): string[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new HttpError(400, "รูปแบบรายชื่อผู้ตรวจสอบเพิ่มเติมไม่ถูกต้อง");
  if (raw.length > MAX_ADDITIONAL_INSPECTORS) throw new HttpError(400, `มีผู้ตรวจสอบเพิ่มเติมมากเกินไป (สูงสุด ${MAX_ADDITIONAL_INSPECTORS} คน)`);
  return raw.map((n, i) => sanitizeShortText(n, `ชื่อผู้ตรวจสอบเพิ่มเติมคนที่ ${i + 1}`)).filter((n) => n !== "");
}

async function assertUserExists(userId: string, label: string): Promise<void> {
  const users = await usersCollection();
  const found = await users.findOne({ _id: toObjectId(userId) }, { projection: { _id: 1 } });
  if (!found) throw new HttpError(400, `ไม่พบ${label}ที่เลือก`);
}

function buildDefaultChecklist(sections: ServiceChecklistSectionDef[]): ServiceChecklistSectionValue[] {
  return mergeChecklist({ sections }, null, null);
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "service:create");
  await ensureServiceReportIndexes();

  const body = (req.body ?? {}) as Record<string, unknown>;
  const templateId = typeof body.templateId === "string" ? body.templateId.trim() : "";
  if (!templateId) throw new HttpError(400, "กรุณาเลือก Template รายงานบริการ");

  const serviceTemplates = await serviceTemplatesCollection();
  const template = await serviceTemplates.findOne({ _id: toObjectId(templateId) });
  if (!template || template.isDeleted || !template.isActive) throw new HttpError(400, "Template ที่เลือกไม่พร้อมใช้งาน กรุณาเลือก Template อื่น");

  const { customerId, customerSnapshot } = await resolveCustomerIdAndSnapshot(body);

  // Defaults to the creating user (same "assume the creator is the one doing the work, freely
  // editable afterward" idea as Scope of Work's resolveDefaultSeller()) — a Draft may otherwise
  // save with no engineer assigned yet, per the project's deliberately minimal required-field
  // policy at creation time (only completeness, not creation, is strictly gated).
  const rawEngineerId = typeof body.assignedServiceEngineerId === "string" ? body.assignedServiceEngineerId.trim() : "";
  if (rawEngineerId) await assertUserExists(rawEngineerId, "ผู้เข้าตรวจสอบหลัก");
  const assignedServiceEngineerId = rawEngineerId || ctx.user.id;

  const templateSnapshot: ServiceReportTemplateSnapshot = {
    templateId: template._id.toString(), templateCode: template.templateCode, templateName: template.templateName,
    version: template.version, sections: cloneTemplateSections(template.sections), sourceHash: template.sourceHash,
    capturedAt: nowIso(),
  };

  const [counters, serviceReports] = await Promise.all([countersCollection(), serviceReportsCollection()]);
  const id = await nextServiceReportId(counters);
  const now = nowIso();

  const doc: ServiceReportFields = {
    customerId, customerSnapshot,
    serviceLocation: sanitizeShortText(body.serviceLocation, "สถานที่ให้บริการ"),
    projectOrJobCode: sanitizeShortText(body.projectOrJobCode, "อ้างอิงโปรเจกต์/รหัสงาน"),
    serviceSystemName: sanitizeShortText(body.serviceSystemName, "ระบบที่ให้บริการ") || template.templateName,
    serviceType: sanitizeShortText(body.serviceType, "ประเภทบริการ"),
    templateId: template._id.toString(),
    templateSnapshot,
    checklist: buildDefaultChecklist(templateSnapshot.sections),
    inspectionDate: validateIsoDateOrEmpty(body.inspectionDate, "วันที่เข้าบริการ"),
    reportDate: validateIsoDateOrEmpty(body.reportDate, "วันที่ออกรายงาน") || now.slice(0, 10),
    nextPmDate: validateIsoDateOrEmpty(body.nextPmDate, "รอบ PM ถัดไป"),
    assignedServiceEngineerId,
    additionalInspectorNames: sanitizeAdditionalInspectorNames(body.additionalInspectorNames),
    onSiteContactName: sanitizeShortText(body.onSiteContactName, "ผู้ติดต่อหน้างาน"),
    onSiteContactPhone: sanitizeShortText(body.onSiteContactPhone, "เบอร์โทรผู้ติดต่อหน้างาน"),
    overallCustomerSummary: sanitizeLongText(body.overallCustomerSummary, "สรุปภาพรวมสำหรับลูกค้า"),
    overallRemark: sanitizeLongText(body.overallRemark, "หมายเหตุ"),
    // A brand-new report is never pre-signed — signing happens on site, after the checklist is
    // filled in, through PATCH.
    customerSignatureDataUrl: "",
    customerSignedName: "",
    customerSignedAt: null,
    status: "Draft",
    isDeleted: false,
    createdAt: now, updatedAt: now, createdBy: ctx.user.id, updatedBy: ctx.user.id,
  };
  await serviceReports.insertOne({ ...doc, _id: id });

  await writeServiceAuditEntry(ctx, "Service Report Created", `สร้างรายงานบริการ ${id} (${doc.customerSnapshot.companyName || "ไม่ระบุลูกค้า"})`, { serviceReportId: id, serviceTemplateId: templateId });
  await notifyServiceEvent(
    (await activeUserIdsWithPermission("service:viewAll")).filter((uid) => uid !== ctx.user.id),
    "service_report_created", "มีรายงานบริการใหม่",
    `${ctx.user.fullName} สร้างรายงานบริการ ${id} (${doc.customerSnapshot.companyName || "ไม่ระบุลูกค้า"})`,
    id,
  );
  res.status(201).json({ serviceReport: toServiceReport({ ...doc, _id: id }) });
}

async function handleUpdate(req: VercelRequest, res: VercelResponse, id: string) {
  const ctx = await requireUser(req);
  const doc = await loadReportOrThrow(id);
  if (!canEditServiceReport(ctx, doc)) throw new HttpError(403, "Forbidden");
  if (doc.status !== "Draft") {
    throw new HttpError(400, "แก้ไขได้เฉพาะรายงานที่เป็นร่างเท่านั้น — กรุณาเปิดใหม่ (Reopen) ก่อนหากต้องการแก้ไข");
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const update: Partial<ServiceReportFields> = {};

  if ("customerId" in body || "customerSnapshot" in body) {
    const resolved = await resolveCustomerIdAndSnapshot(body);
    update.customerId = resolved.customerId;
    update.customerSnapshot = resolved.customerSnapshot;
  }
  if ("serviceLocation" in body) update.serviceLocation = sanitizeShortText(body.serviceLocation, "สถานที่ให้บริการ");
  if ("projectOrJobCode" in body) update.projectOrJobCode = sanitizeShortText(body.projectOrJobCode, "อ้างอิงโปรเจกต์/รหัสงาน");
  if ("serviceSystemName" in body) update.serviceSystemName = sanitizeShortText(body.serviceSystemName, "ระบบที่ให้บริการ");
  if ("serviceType" in body) update.serviceType = sanitizeShortText(body.serviceType, "ประเภทบริการ");
  if ("inspectionDate" in body) update.inspectionDate = validateIsoDateOrEmpty(body.inspectionDate, "วันที่เข้าบริการ");
  if ("reportDate" in body) update.reportDate = validateIsoDateOrEmpty(body.reportDate, "วันที่ออกรายงาน");
  if ("nextPmDate" in body) update.nextPmDate = validateIsoDateOrEmpty(body.nextPmDate, "รอบ PM ถัดไป");
  if ("assignedServiceEngineerId" in body) {
    const nextId = typeof body.assignedServiceEngineerId === "string" ? body.assignedServiceEngineerId.trim() : "";
    if (!nextId) throw new HttpError(400, "กรุณาระบุผู้เข้าตรวจสอบหลัก");
    await assertUserExists(nextId, "ผู้เข้าตรวจสอบหลัก");
    update.assignedServiceEngineerId = nextId;
  }
  if ("additionalInspectorNames" in body) update.additionalInspectorNames = sanitizeAdditionalInspectorNames(body.additionalInspectorNames);
  if ("onSiteContactName" in body) update.onSiteContactName = sanitizeShortText(body.onSiteContactName, "ผู้ติดต่อหน้างาน");
  if ("onSiteContactPhone" in body) update.onSiteContactPhone = sanitizeShortText(body.onSiteContactPhone, "เบอร์โทรผู้ติดต่อหน้างาน");
  if ("overallCustomerSummary" in body) update.overallCustomerSummary = sanitizeLongText(body.overallCustomerSummary, "สรุปภาพรวมสำหรับลูกค้า");
  if ("overallRemark" in body) update.overallRemark = sanitizeLongText(body.overallRemark, "หมายเหตุ");

  // Customer sign-off (added 2026-08-07) — an ordinary editable field group, not a workflow step:
  // it neither gates nor is gated by completion, since a customer often isn't on site to sign.
  // `customerSignedAt` is stamped here, never accepted from the client, so a sign-off can't be
  // backdated; it's re-stamped only when the signature image itself changes, so editing just the
  // signer's name doesn't silently move the recorded signing time.
  if ("customerSignatureDataUrl" in body) {
    const nextSignature = validateImageDataUrl(body.customerSignatureDataUrl, "ลายเซ็นลูกค้า");
    update.customerSignatureDataUrl = nextSignature;
    if (nextSignature !== (doc.customerSignatureDataUrl ?? "")) {
      update.customerSignedAt = nextSignature ? nowIso() : null;
    }
    if (!nextSignature) update.customerSignedName = "";
  }
  if ("customerSignedName" in body && update.customerSignedName === undefined) {
    update.customerSignedName = sanitizeShortText(body.customerSignedName, "ชื่อผู้ลงนามของลูกค้า");
  }

  // Per-report checklist customization (added 2026-08-06): the client may add/remove groups and
  // items inside this report's own frozen snapshot (each job differs from the paper form) — the
  // sections themselves stay those the template defined, and the master template is never touched.
  let effectiveSnapshot = doc.templateSnapshot;
  if ("templateSections" in body) {
    const sanitized = sanitizeServiceTemplateSections(body.templateSections, doc.templateSnapshot.sections);
    if (!sanitized) throw new HttpError(400, "โครงสร้างรายการตรวจเช็คไม่ถูกต้อง");
    effectiveSnapshot = { ...doc.templateSnapshot, sections: sanitized };
    update.templateSnapshot = effectiveSnapshot;
  }
  // A structure change must also rebuild checklist values (pruning removed items, defaulting new
  // ones), even if the payload carried no checklist of its own.
  if ("checklist" in body || "templateSections" in body) {
    update.checklist = mergeChecklist(effectiveSnapshot, "checklist" in body ? body.checklist : null, doc.checklist);
  }
  // Removing an item (or its whole group) drops its photo *metadata* with it — also delete the
  // orphaned photo bytes so the files collection can't accumulate unreachable Binary blobs.
  if (update.templateSnapshot && update.checklist) {
    const collectPhotoIds = (checklist: ServiceChecklistSectionValue[]): Set<string> =>
      new Set(checklist.flatMap((s) => s.groups.flatMap((g) => g.items.flatMap((it) => (it.photos ?? []).map((p) => p.id)))));
    const survivingIds = collectPhotoIds(update.checklist);
    const orphanedIds = [...collectPhotoIds(doc.checklist)].filter((pid) => !survivingIds.has(pid));
    if (orphanedIds.length > 0) {
      const files = await serviceChecklistPhotoFilesCollection();
      await files.deleteMany({ serviceReportId: id, photoId: { $in: orphanedIds } });
    }
  }

  update.updatedAt = nowIso();
  update.updatedBy = ctx.user.id;
  const serviceReports = await serviceReportsCollection();
  await serviceReports.updateOne({ _id: doc._id }, { $set: update });
  const updated = await serviceReports.findOne({ _id: doc._id });
  if (!updated) throw new HttpError(404, "ไม่พบรายงานบริการ");

  // A signature is an evidentiary artifact, so capturing or clearing one is called out in the audit
  // trail rather than folded silently into a generic "updated" entry.
  const signatureNote = update.customerSignedAt === undefined ? ""
    : update.customerSignedAt ? ` (ลูกค้าเซ็นรับงาน: ${update.customerSignedName || doc.customerSignedName || "ไม่ระบุชื่อ"})`
    : " (ลบลายเซ็นลูกค้า)";
  await writeServiceAuditEntry(
    ctx, "Service Report Updated",
    `แก้ไขรายงานบริการ ${id}${update.templateSnapshot ? " (ปรับโครงสร้างรายการตรวจเช็ค)" : ""}${signatureNote}`,
    { serviceReportId: id },
  );
  res.status(200).json({ serviceReport: toServiceReport(updated) });
}

function throwIfIncomplete(
  validation: { valid: boolean; fieldErrors: Record<string, string>; groupErrors: Record<string, string[]> },
  message: string,
  checklistItemErrors?: Record<string, string>,
): void {
  if (validation.valid) return;
  throw new HttpError(422, message, {
    code: "DOCUMENT_INCOMPLETE",
    details: { fieldErrors: validation.fieldErrors, groupErrors: validation.groupErrors, ...(checklistItemErrors ? { checklistItemErrors } : {}) },
  });
}

const STATUS_ACTIONS = new Set(["complete", "reopen", "cancel"]);

async function handleStatusChange(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requireUser(req);
  const doc = await loadReportOrThrow(id);
  const action = typeof (req.body as { action?: unknown } | undefined)?.action === "string" ? (req.body as { action: string }).action : "";
  if (!STATUS_ACTIONS.has(action)) throw new HttpError(400, "การดำเนินการไม่ถูกต้อง");

  let nextStatus: ServiceReportStatus;
  let auditAction: string;
  let auditDetails: string;

  if (action === "complete") {
    if (!roleHasPermission(ctx.role, "service:complete")) throw new HttpError(403, "Forbidden");
    if (doc.status !== "Draft") throw new HttpError(400, "ยืนยันเสร็จสิ้นได้เฉพาะรายงานที่เป็นร่างเท่านั้น");
    throwIfIncomplete(
      validateServiceReportForCompletion({
        customerSnapshot: doc.customerSnapshot, serviceLocation: doc.serviceLocation, projectOrJobCode: doc.projectOrJobCode,
        serviceSystemName: doc.serviceSystemName, serviceType: doc.serviceType, inspectionDate: doc.inspectionDate,
        reportDate: doc.reportDate, nextPmDate: doc.nextPmDate, assignedServiceEngineerId: doc.assignedServiceEngineerId,
        onSiteContactName: doc.onSiteContactName, onSiteContactPhone: doc.onSiteContactPhone,
        overallCustomerSummary: doc.overallCustomerSummary, overallRemark: doc.overallRemark,
        checklist: doc.checklist, templateSnapshot: doc.templateSnapshot,
      }),
      "กรุณากรอกข้อมูลและเช็คลิสต์ให้ครบก่อนยืนยันเสร็จสิ้น",
      // Item-path-keyed errors (e.g. "core.blower.vibration") so the client can highlight the
      // exact failing control instead of only a flat message list — validateServiceChecklist()
      // already returns this shape; validateServiceReportForCompletion() flattens it to
      // groupErrors.checklist (a plain string[]) to match the shared ValidationResult type.
      validateServiceChecklist(doc.checklist, doc.templateSnapshot).itemErrors,
    );
    nextStatus = "Completed";
    auditAction = "Service Report Completed";
    auditDetails = `ยืนยันเสร็จสิ้นรายงานบริการ ${id}`;
  } else if (action === "reopen") {
    if (!canEditServiceReport(ctx, doc)) throw new HttpError(403, "Forbidden");
    if (doc.status !== "Completed") throw new HttpError(400, "เปิดใหม่ได้เฉพาะรายงานที่เสร็จสิ้นแล้วเท่านั้น");
    nextStatus = "Draft";
    auditAction = "Service Report Reopened";
    auditDetails = `เปิดรายงานบริการ ${id} กลับเป็นร่าง`;
  } else {
    if (!roleHasPermission(ctx.role, "service:complete")) throw new HttpError(403, "Forbidden");
    if (doc.status === "Cancelled") throw new HttpError(400, "รายงานนี้ถูกยกเลิกแล้ว");
    nextStatus = "Cancelled";
    auditAction = "Service Report Cancelled";
    auditDetails = `ยกเลิกรายงานบริการ ${id}`;
  }

  const serviceReports = await serviceReportsCollection();
  await serviceReports.updateOne({ _id: doc._id as string }, { $set: { status: nextStatus, updatedAt: nowIso(), updatedBy: ctx.user.id } });
  const updated = await serviceReports.findOne({ _id: doc._id as string });
  if (!updated) throw new HttpError(404, "ไม่พบรายงานบริการ");

  await writeServiceAuditEntry(ctx, auditAction, auditDetails, { serviceReportId: id });
  if (action === "complete") {
    await notifyServiceEvent(
      (await activeUserIdsWithPermission("service:viewAll")).filter((uid) => uid !== ctx.user.id),
      "service_report_completed", "รายงานบริการเสร็จสิ้นแล้ว",
      `${ctx.user.fullName} ยืนยันเสร็จสิ้นรายงานบริการ ${id} (${updated.customerSnapshot.companyName || "ไม่ระบุลูกค้า"})`,
      id,
    );
  }
  res.status(200).json({ serviceReport: toServiceReport(updated) });
}

// ─── Checklist item photos (added 2026-08-06, pulled forward from the Phase 2 roadmap) ──────────
// Same Binary-in-Mongo + unauthenticated capability-URL pattern as Scope of Work's attachments
// (api/_lib/scopeOfWorkHandler.ts) — bytes live in a dedicated collection, kept out of the parent
// document; the parent only carries lightweight metadata (`ServiceChecklistItemPhoto`, embedded on
// the matching checklist item). Managed only through these dedicated routes — `checklist.*.photos`
// is deliberately not settable through the generic PATCH (see `mergeChecklist()` above).

const MAX_PHOTO_BYTES = 4 * 1024 * 1024; // 4 MB — camera photos run larger than Scope of Work's 2 MB document cap
const MAX_PHOTOS_PER_ITEM = 6;

let photoIndexesEnsured = false;
async function ensurePhotoIndexes(): Promise<void> {
  if (photoIndexesEnsured) return;
  const files = await serviceChecklistPhotoFilesCollection();
  try {
    await Promise.all([
      files.createIndex({ photoId: 1 }, { unique: true }),
      files.createIndex({ serviceReportId: 1 }),
    ]);
  } catch (err) {
    console.error("[service-reports] ensurePhotoIndexes failed", err);
  }
  photoIndexesEnsured = true;
}

/** Locates a checklist item by its (sectionKey, groupKey, itemKey) path; throws 404 if any segment doesn't exist. */
function findChecklistItemPath(
  checklist: ServiceChecklistSectionValue[],
  sectionKey: string, groupKey: string, itemKey: string,
): { section: ServiceChecklistSectionValue; itemIndex: number } {
  const section = checklist.find((s) => s.key === sectionKey);
  if (!section) throw new HttpError(404, "ไม่พบหมวดตรวจเช็ค");
  const group = section.groups.find((g) => g.key === groupKey);
  if (!group) throw new HttpError(404, "ไม่พบกลุ่มตรวจเช็ค");
  const itemIndex = group.items.findIndex((it) => it.key === itemKey);
  if (itemIndex === -1) throw new HttpError(404, "ไม่พบรายการตรวจเช็ค");
  return { section, itemIndex };
}

async function handlePhotoUpload(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requireUser(req);
  const doc = await loadReportOrThrow(id);
  if (!canEditServiceReport(ctx, doc)) throw new HttpError(403, "Forbidden");
  if (doc.status !== "Draft") throw new HttpError(400, "แนบรูปภาพได้เฉพาะรายงานที่เป็นร่างเท่านั้น");

  const body = (req.body ?? {}) as Record<string, unknown>;
  const sectionKey = typeof body.sectionKey === "string" ? body.sectionKey : "";
  const groupKey = typeof body.groupKey === "string" ? body.groupKey : "";
  const itemKey = typeof body.itemKey === "string" ? body.itemKey : "";
  const { section, itemIndex } = findChecklistItemPath(doc.checklist, sectionKey, groupKey, itemKey);
  const group = section.groups.find((g) => g.key === groupKey)!;
  const currentItem = group.items[itemIndex];
  if ((currentItem.photos ?? []).length >= MAX_PHOTOS_PER_ITEM) {
    throw new HttpError(400, `แนบรูปภาพได้สูงสุด ${MAX_PHOTOS_PER_ITEM} รูปต่อรายการ — ลบรูปเดิมออกก่อน`);
  }

  const fileName = sanitizeShortText(body.fileName, "ชื่อไฟล์");
  if (!fileName.trim()) throw new HttpError(400, "กรุณาระบุชื่อไฟล์");
  const contentType = typeof body.contentType === "string" && body.contentType.trim() ? body.contentType.trim().slice(0, 120) : "application/octet-stream";
  if (!contentType.startsWith("image/")) throw new HttpError(400, "รองรับเฉพาะไฟล์รูปภาพเท่านั้น");
  const dataBase64 = typeof body.dataBase64 === "string" ? body.dataBase64 : "";
  if (!dataBase64) throw new HttpError(400, "ไม่พบข้อมูลไฟล์");
  if (dataBase64.length > Math.ceil((MAX_PHOTO_BYTES * 4) / 3) + 8) {
    throw new HttpError(400, `รูปภาพต้องมีขนาดไม่เกิน ${Math.floor(MAX_PHOTO_BYTES / 1024 / 1024)} MB`);
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(dataBase64)) throw new HttpError(400, "ข้อมูลไฟล์ไม่ถูกต้อง");
  const data = Buffer.from(dataBase64, "base64");
  if (data.length === 0) throw new HttpError(400, "ไม่พบข้อมูลไฟล์");
  if (data.length > MAX_PHOTO_BYTES) throw new HttpError(400, `รูปภาพต้องมีขนาดไม่เกิน ${Math.floor(MAX_PHOTO_BYTES / 1024 / 1024)} MB`);

  await ensurePhotoIndexes();
  const photoId = randomUUID();
  const downloadKey = randomBytes(24).toString("base64url");
  const files = await serviceChecklistPhotoFilesCollection();
  await files.insertOne({
    serviceReportId: id, photoId, downloadKey, fileName, contentType, size: data.length,
    data: new Binary(data), createdAt: nowIso(),
  });

  const photo: ServiceChecklistItemPhoto = {
    id: photoId, fileName, size: data.length, uploadedAt: nowIso(),
    url: `/api/service-reports/${id}/photos/${photoId}/download?key=${downloadKey}`,
  };
  const nextChecklist = doc.checklist.map((s) => (s.key !== sectionKey ? s : {
    ...s,
    groups: s.groups.map((g) => (g.key !== groupKey ? g : {
      ...g,
      items: g.items.map((it) => (it.key !== itemKey ? it : { ...it, photos: [...(it.photos ?? []), photo] })),
    })),
  }));

  const serviceReports = await serviceReportsCollection();
  await serviceReports.updateOne({ _id: doc._id }, { $set: { checklist: nextChecklist, updatedAt: nowIso(), updatedBy: ctx.user.id } });
  const updated = await serviceReports.findOne({ _id: doc._id });
  if (!updated) throw new HttpError(404, "ไม่พบรายงานบริการ");
  await writeServiceAuditEntry(ctx, "Service Report Photo Added", `แนบรูปภาพ "${fileName}" กับรายงานบริการ ${id}`, { serviceReportId: id });
  res.status(200).json({ serviceReport: toServiceReport(updated) });
}

async function handlePhotoDelete(req: VercelRequest, res: VercelResponse, id: string, photoId: string) {
  if (req.method !== "DELETE") throw new HttpError(405, "Method not allowed");
  const ctx = await requireUser(req);
  const doc = await loadReportOrThrow(id);
  if (!canEditServiceReport(ctx, doc)) throw new HttpError(403, "Forbidden");
  if (doc.status !== "Draft") throw new HttpError(400, "ลบรูปภาพได้เฉพาะรายงานที่เป็นร่างเท่านั้น");

  let found = false;
  const nextChecklist = doc.checklist.map((s) => ({
    ...s,
    groups: s.groups.map((g) => ({
      ...g,
      items: g.items.map((it) => {
        if (!(it.photos ?? []).some((p) => p.id === photoId)) return it;
        found = true;
        return { ...it, photos: it.photos.filter((p) => p.id !== photoId) };
      }),
    })),
  }));
  if (!found) throw new HttpError(404, "ไม่พบรูปภาพ");

  const files = await serviceChecklistPhotoFilesCollection();
  await files.deleteOne({ serviceReportId: id, photoId });
  const serviceReports = await serviceReportsCollection();
  await serviceReports.updateOne({ _id: doc._id }, { $set: { checklist: nextChecklist, updatedAt: nowIso(), updatedBy: ctx.user.id } });
  const updated = await serviceReports.findOne({ _id: doc._id });
  if (!updated) throw new HttpError(404, "ไม่พบรายงานบริการ");
  await writeServiceAuditEntry(ctx, "Service Report Photo Removed", `ลบรูปภาพออกจากรายงานบริการ ${id}`, { serviceReportId: id });
  res.status(200).json({ serviceReport: toServiceReport(updated) });
}

const INLINE_SAFE_PHOTO_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

function encodeRfc5987(value: string): string {
  return encodeURIComponent(value).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** Deliberately NO session auth — same capability-token model as Scope of Work's attachment
 * download (`handleAttachmentDownload`): a wrong/missing key is an opaque 404. */
async function handlePhotoDownload(req: VercelRequest, res: VercelResponse, id: string, photoId: string) {
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
  const key = typeof req.query.key === "string" ? req.query.key : "";
  if (!key) throw new HttpError(404, "ไม่พบรูปภาพ");

  const files = await serviceChecklistPhotoFilesCollection();
  const file = await files.findOne({ serviceReportId: id, photoId });
  if (!file || file.downloadKey !== key) throw new HttpError(404, "ไม่พบรูปภาพ");

  const buffer = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data.buffer);
  const storedType = (file.contentType || "").split(";")[0].trim().toLowerCase();
  const inlineSafe = INLINE_SAFE_PHOTO_TYPES.has(storedType);
  res.setHeader("Content-Type", inlineSafe ? storedType : "application/octet-stream");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Disposition", `${inlineSafe ? "inline" : "attachment"}; filename*=UTF-8''${encodeRfc5987(file.fileName)}`);
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.status(200).send(buffer);
}

// ─── Customer approval via time-boxed link / LINE OA (added 2026-08-10) ────────────────────────
// The remote half of customer acceptance (docs/MODULES/Service.md "Customer Approval via LINE"):
// staff generate a single-purpose capability link (7-day expiry, SHA-256-hashed token — the same
// "unguessable URL, no session" model as photo downloads but deliberately TIME-BOXED, per the
// owner's recorded preference against always-live public views); the customer opens it (directly
// or from the LINE OA push), reviews the report read-only, and signs+approves or rejects with a
// reason. Approving writes the same `customerSignatureDataUrl`/`customerSignedName`/
// `customerSignedAt` fields the on-site SignaturePad uses, so the printed report shows the
// signature identically regardless of which path captured it.

const APPROVAL_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function hashApprovalToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

function approvalUrlFor(id: string, token: string): string {
  const appUrl = (process.env.APP_URL || "https://tcs-erp-nine.vercel.app").replace(/\/+$/, "");
  return `${appUrl}/approve?report=${encodeURIComponent(id)}&key=${encodeURIComponent(token)}`;
}

/** POST /api/service-reports/:id/send-approval — `service:edit` (like Scope of Work's send, this
 * distributes the document rather than changing it, so no ownership check and no Draft-only
 * lock; only Cancelled is blocked). Re-sending replaces the outstanding link (old token dies). */
async function handleSendApproval(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "service:edit");
  const doc = await loadReportOrThrow(id);
  if (doc.status === "Cancelled") throw new HttpError(400, "รายงานนี้ถูกยกเลิกแล้ว ส่งให้ลูกค้าอนุมัติไม่ได้");
  if (doc.customerApproval?.status === "approved") {
    throw new HttpError(400, "ลูกค้าอนุมัติรายงานนี้ไปแล้ว ไม่จำเป็นต้องส่งซ้ำ");
  }

  const token = randomBytes(24).toString("base64url");
  const now = nowIso();
  const approval: NonNullable<ServiceReportFields["customerApproval"]> = {
    status: "pending",
    tokenHash: hashApprovalToken(token),
    sentAt: now,
    sentBy: ctx.user.id,
    sentByName: ctx.user.fullName,
    expiresAt: new Date(Date.now() + APPROVAL_TOKEN_TTL_MS).toISOString(),
    sentViaLine: false,
    respondedAt: null,
    rejectReason: "",
    signedName: "",
  };
  const approvalUrl = approvalUrlFor(id, token);

  // LINE push is best-effort: a linked customer + configured channel sends automatically; any
  // failure (unlinked, unconfigured, quota, non-HTTPS APP_URL) degrades to copy-the-link.
  let lineError: string | undefined;
  if (doc.customerId && isLinePushConfigured()) {
    const customers = await customersCollection();
    const customer = await customers.findOne({ _id: toObjectId(doc.customerId) }, { projection: { lineUserId: 1, companyName: 1 } });
    if (customer?.lineUserId) {
      try {
        const company = await (await companyCollection()).findOne({});
        await pushLineMessage(customer.lineUserId, [buildApprovalFlexMessage({
          reportId: id,
          companyName: company?.name ?? "TCS ERP",
          customerName: doc.customerSnapshot.companyName,
          serviceSystemName: doc.serviceSystemName,
          inspectionDate: doc.inspectionDate,
          approvalUrl,
          expiresAt: approval.expiresAt,
        })]);
        approval.sentViaLine = true;
      } catch (err) {
        console.error(`[service-reports] LINE push for ${id} failed`, err);
        lineError = "ส่งเข้า LINE ไม่สำเร็จ — คัดลอกลิงก์ส่งเองได้ตามปกติ";
      }
    }
  }

  const serviceReports = await serviceReportsCollection();
  await serviceReports.updateOne({ _id: doc._id }, { $set: { customerApproval: approval, updatedAt: now, updatedBy: ctx.user.id } });
  const updated = await serviceReports.findOne({ _id: doc._id });
  if (!updated) throw new HttpError(404, "ไม่พบรายงานบริการ");

  await writeServiceAuditEntry(
    ctx, "Service Report Approval Link Sent",
    `ส่งรายงานบริการ ${id} ให้ลูกค้าอนุมัติ (${approval.sentViaLine ? "ผ่าน LINE" : "ลิงก์สำหรับส่งเอง"} หมดอายุ ${approval.expiresAt.slice(0, 10)})`,
    { serviceReportId: id },
  );
  res.status(200).json({ serviceReport: toServiceReport(updated), approvalUrl, sentViaLine: approval.sentViaLine, ...(lineError ? { lineError } : {}) });
}

/** Validates the capability key against the stored hash. Wrong/missing anything → opaque 404
 * (never reveal whether the report exists); a correct key whose link expired is reported as
 * `expired` so the page can say so. */
async function loadReportForApprovalKey(id: string, key: string): Promise<{ doc: ServiceReportFields & { _id: string }; approval: NonNullable<ServiceReportFields["customerApproval"]>; expired: boolean }> {
  if (!key) throw new HttpError(404, "ไม่พบลิงก์อนุมัติ");
  const serviceReports = await serviceReportsCollection();
  const doc = await serviceReports.findOne({ _id: id });
  if (!doc || doc.isDeleted || !doc.customerApproval) throw new HttpError(404, "ไม่พบลิงก์อนุมัติ");
  if (doc.customerApproval.tokenHash !== hashApprovalToken(key)) throw new HttpError(404, "ไม่พบลิงก์อนุมัติ");
  const expired = doc.customerApproval.status === "pending" && doc.customerApproval.expiresAt <= nowIso();
  return { doc, approval: doc.customerApproval, expired };
}

/** Only the fields a customer may see — internal user ids resolved to a display name. */
async function buildApprovalPublicPayload(doc: ServiceReportFields & { _id: string }, approval: NonNullable<ServiceReportFields["customerApproval"]>, expired: boolean) {
  const [company, users] = await Promise.all([(await companyCollection()).findOne({}), usersCollection()]);
  let engineerName = "";
  if (doc.assignedServiceEngineerId) {
    const engineer = await users.findOne({ _id: toObjectId(doc.assignedServiceEngineerId) }, { projection: { fullName: 1 } });
    engineerName = engineer?.fullName ?? "";
  }
  return {
    report: {
      id: doc._id,
      customerSnapshot: doc.customerSnapshot,
      serviceLocation: doc.serviceLocation,
      projectOrJobCode: doc.projectOrJobCode,
      serviceSystemName: doc.serviceSystemName,
      serviceType: doc.serviceType,
      inspectionDate: doc.inspectionDate,
      reportDate: doc.reportDate,
      nextPmDate: doc.nextPmDate,
      engineerName,
      additionalInspectorNames: doc.additionalInspectorNames ?? [],
      onSiteContactName: doc.onSiteContactName,
      onSiteContactPhone: doc.onSiteContactPhone,
      overallCustomerSummary: doc.overallCustomerSummary,
      overallRemark: doc.overallRemark,
      templateSnapshot: doc.templateSnapshot,
      checklist: doc.checklist,
      customerSignatureDataUrl: doc.customerSignatureDataUrl ?? "",
      customerSignedName: doc.customerSignedName ?? "",
    },
    companyName: company?.name ?? "",
    companyLogoDataUrl: company?.logoDataUrl ?? "",
    approval: {
      status: approval.status,
      expired,
      expiresAt: approval.expiresAt,
      respondedAt: approval.respondedAt,
      rejectReason: approval.rejectReason,
      signedName: approval.signedName,
    },
  };
}

/** GET /api/service-reports/:id/approval?key= — public (capability key IS the auth). */
async function handleApprovalGet(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
  const key = typeof req.query.key === "string" ? req.query.key : "";
  const { doc, approval, expired } = await loadReportForApprovalKey(id, key);
  res.status(200).json(await buildApprovalPublicPayload(doc, approval, expired));
}

/** POST /api/service-reports/:id/approval/respond — public. Approve requires a signature (written
 * into the same on-site sign-off fields); reject requires a reason. One response per link. */
async function handleApprovalRespond(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const body = (req.body ?? {}) as Record<string, unknown>;
  const key = typeof body.key === "string" ? body.key : "";
  const { doc, approval, expired } = await loadReportForApprovalKey(id, key);
  if (approval.status !== "pending") throw new HttpError(400, "รายงานนี้ได้รับคำตอบไปแล้ว");
  if (expired) throw new HttpError(410, "ลิงก์อนุมัตินี้หมดอายุแล้ว กรุณาติดต่อเจ้าหน้าที่เพื่อขอลิงก์ใหม่");

  const decision = body.decision === "approved" || body.decision === "rejected" ? body.decision : null;
  if (!decision) throw new HttpError(400, "คำตอบไม่ถูกต้อง");
  const signedName = sanitizeShortText(body.signedName, "ชื่อผู้ตอบ");
  const now = nowIso();
  const update: Partial<ServiceReportFields> = { updatedAt: now };
  const nextApproval = { ...approval, respondedAt: now, signedName };

  if (decision === "approved") {
    const signature = validateImageDataUrl(body.signatureDataUrl, "ลายเซ็นลูกค้า");
    if (!signature) throw new HttpError(400, "กรุณาลงลายเซ็นก่อนกดอนุมัติ");
    nextApproval.status = "approved";
    update.customerSignatureDataUrl = signature;
    update.customerSignedName = signedName || doc.customerSnapshot.contactName;
    update.customerSignedAt = now;
  } else {
    const rejectReason = sanitizeLongText(body.rejectReason, "เหตุผลที่ไม่อนุมัติ");
    if (!rejectReason.trim()) throw new HttpError(400, "กรุณาระบุเหตุผลที่ไม่อนุมัติ");
    nextApproval.status = "rejected";
    nextApproval.rejectReason = rejectReason;
  }
  update.customerApproval = nextApproval;

  const serviceReports = await serviceReportsCollection();
  await serviceReports.updateOne({ _id: doc._id }, { $set: update });
  const updated = await serviceReports.findOne({ _id: doc._id });
  if (!updated) throw new HttpError(404, "ไม่พบรายงานบริการ");

  // The actor is the customer, not an ERP user — recorded with an empty userId, same shape the
  // LINE webhook's pairing entry uses.
  const auditLog = await auditLogCollection();
  await auditLog.insertOne({
    userId: "",
    userName: `ลูกค้า (${signedName || doc.customerSnapshot.companyName})`,
    roleName: "ลูกค้า",
    module: "บริการ",
    action: decision === "approved" ? "Service Report Customer Approved" : "Service Report Customer Rejected",
    details: decision === "approved"
      ? `ลูกค้าอนุมัติรายงานบริการ ${id} ผ่านลิงก์อนุมัติ`
      : `ลูกค้าไม่อนุมัติรายงานบริการ ${id}: ${nextApproval.rejectReason}`,
    createdAt: now,
    relatedServiceReportId: id,
  });
  await notifyServiceEvent(
    [approval.sentBy, updated.createdBy, updated.assignedServiceEngineerId],
    decision === "approved" ? "service_report_customer_approved" : "service_report_customer_rejected",
    decision === "approved" ? "ลูกค้าอนุมัติรายงานบริการแล้ว" : "ลูกค้าไม่อนุมัติรายงานบริการ",
    decision === "approved"
      ? `ลูกค้า${signedName ? ` (${signedName})` : ""} อนุมัติรายงานบริการ ${id} (${doc.customerSnapshot.companyName})`
      : `ลูกค้าไม่อนุมัติรายงานบริการ ${id} (${doc.customerSnapshot.companyName}) — เหตุผล: ${nextApproval.rejectReason}`,
    id,
  );

  res.status(200).json(await buildApprovalPublicPayload(updated, nextApproval, false));
}

async function handlePrint(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "service:print");
  const doc = await loadReportOrThrow(id);
  await writeServiceAuditEntry(ctx, "Service Report Printed", `พิมพ์ / ส่งออกรายงานบริการ ${id}`, { serviceReportId: id });
  res.status(200).json({ ok: true, serviceReport: toServiceReport(doc) });
}

async function handleDelete(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "DELETE") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "service:delete");
  const doc = await loadReportOrThrow(id);
  if (!isOwnerOf(ctx, doc) && !roleHasPermission(ctx.role, "service:complete")) throw new HttpError(403, "Forbidden");

  const serviceReports = await serviceReportsCollection();
  await serviceReports.updateOne({ _id: doc._id }, { $set: { isDeleted: true, updatedAt: nowIso(), updatedBy: ctx.user.id } });
  await writeServiceAuditEntry(ctx, "Service Report Deleted", `ลบรายงานบริการ ${id}`, { serviceReportId: id });
  res.status(200).json({ ok: true });
}

async function handleOne(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method === "GET") return handleGetOne(req, res, id);
  if (req.method === "PATCH") return handleUpdate(req, res, id);
  if (req.method === "DELETE") return handleDelete(req, res, id);
  throw new HttpError(405, "Method not allowed");
}

export async function handleServiceReport(req: VercelRequest, res: VercelResponse): Promise<void> {
  const parts = getPathSegments(req, "/api/service-reports");
  if (parts.length === 0) {
    if (req.method === "POST") return handleCreate(req, res);
    return handleList(req, res);
  }
  if (parts.length === 1) return handleOne(req, res, parts[0]);
  if (parts.length === 2 && parts[1] === "status") return handleStatusChange(req, res, parts[0]);
  if (parts.length === 2 && parts[1] === "send-approval") return handleSendApproval(req, res, parts[0]);
  if (parts.length === 2 && parts[1] === "approval") return handleApprovalGet(req, res, parts[0]);
  if (parts.length === 3 && parts[1] === "approval" && parts[2] === "respond") return handleApprovalRespond(req, res, parts[0]);
  if (parts.length === 2 && parts[1] === "print") return handlePrint(req, res, parts[0]);
  if (parts.length === 2 && parts[1] === "photos") return handlePhotoUpload(req, res, parts[0]);
  if (parts.length === 3 && parts[1] === "photos") return handlePhotoDelete(req, res, parts[0], parts[2]);
  if (parts.length === 4 && parts[1] === "photos" && parts[3] === "download") return handlePhotoDownload(req, res, parts[0], parts[2]);
  throw new HttpError(404, "Not found");
}
