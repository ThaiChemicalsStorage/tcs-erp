import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Collection, WithId } from "mongodb";
import { HttpError, getPathSegments } from "./http.js";
import { requirePermission, requireUser, type AuthContext } from "./auth.js";
import { customersCollection, auditLogCollection, toObjectId, withStringId, type CustomerFields } from "./collections.js";
import { validateCustomerDraft } from "./customerValidation.js";
import { roleHasPermission } from "../../src/lib/roles.js";
import { nowIso } from "../../src/lib/products.js";
import { generatePairingCode, PAIRING_CODE_TTL_MS } from "./lineHandler.js";

/**
 * Customer master data API (added 2026-07-14, replacing the earlier — wrong — "issuer company"
 * quotation feature). Entry point: `api/handlers/customers.ts`. Briefly (2026-07-14, same day)
 * folded into the `company-profiles` serverless function instead of getting its own file, to stay
 * under Vercel Hobby's 12-function cap — once the Company Profiles module itself was removed later
 * the same day (see docs/MODULES/CompanyProfiles.md "Removed"), that function slot freed up and
 * this logic got its own dedicated `api/handlers/customers.ts` file again.
 */

/** The one place a customer document becomes a client response — strips the server-only
 * `linePairing` code (2026-08-10; leaking it would let any signed-in user hijack the LINE
 * pairing) and defaults `lineUserId` for pre-feature documents. */
function toPublicCustomer(doc: WithId<CustomerFields>) {
  const { linePairing: _linePairing, ...rest } = withStringId(doc);
  return {
    ...rest,
    lineUserId: doc.lineUserId ?? "",
    code: doc.code ?? "",
    apContactName: doc.apContactName ?? "",
    apContactPhone: doc.apContactPhone ?? "",
    apContactEmail: doc.apContactEmail ?? "",
    billingConditions: doc.billingConditions ?? "",
    requiresReport: doc.requiresReport ?? false,
  };
}

let customerIndexesEnsured = false;
async function ensureCustomerIndexes(customers: Collection<CustomerFields>) {
  if (customerIndexesEnsured) return;
  await Promise.all([
    customers.createIndex({ isDeleted: 1 }),
    customers.createIndex({ isActive: 1 }),
    customers.createIndex({ companyName: 1 }),
  ]);
  customerIndexesEnsured = true;
}

async function writeCustomerAuditEntry(
  ctx: AuthContext,
  action: string,
  details: string,
  customer: { id: string; companyName: string },
): Promise<void> {
  const auditLog = await auditLogCollection();
  await auditLog.insertOne({
    userId: ctx.user.id,
    userName: ctx.user.fullName,
    roleName: ctx.role?.name ?? ctx.user.roleKey,
    module: "ลูกค้า",
    action,
    details,
    createdAt: nowIso(),
    relatedCustomerName: customer.companyName,
  });
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  const customers = await customersCollection();
  await ensureCustomerIndexes(customers);

  if (req.method === "GET") {
    // Same "manage vs. pick-for-a-quotation" carve-out as company-profiles.ts's handleList: a
    // Sales user with only `quotations:create` (no `customers:view`) still needs to search saved
    // customers to autofill the Quotation form's Customer Information section.
    const ctx = await requireUser(req);
    const canManage = roleHasPermission(ctx.role, "customers:view");
    const canReadForQuotation = roleHasPermission(ctx.role, "quotations:create");
    if (!canManage && !canReadForQuotation) throw new HttpError(403, "Forbidden");

    const filter = canManage ? {} : { isActive: true, isDeleted: false };
    const docs = await customers.find(filter).sort({ companyName: 1 }).toArray();
    res.status(200).json({ customers: docs.map(toPublicCustomer) });
    return;
  }

  if (req.method === "POST") {
    const ctx = await requirePermission(req, "customers:create");
    const draft = validateCustomerDraft(req.body, false);
    const now = nowIso();
    const doc: CustomerFields = {
      companyName: draft.companyName!,
      contactName: draft.contactName ?? "",
      phone: draft.phone ?? "",
      email: draft.email ?? "",
      address: draft.address ?? "",
      taxId: draft.taxId ?? "",
      deliveryMethod: draft.deliveryMethod ?? "",
      projectName: draft.projectName ?? "",
      deliveryAddress: draft.deliveryAddress ?? "",
      isActive: draft.isActive ?? true,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
      createdBy: ctx.user.id,
      updatedBy: ctx.user.id,
      code: draft.code ?? "",
      apContactName: draft.apContactName ?? "",
      apContactPhone: draft.apContactPhone ?? "",
      apContactEmail: draft.apContactEmail ?? "",
      billingConditions: draft.billingConditions ?? "",
      requiresReport: draft.requiresReport ?? false,
    };
    const insertResult = await customers.insertOne(doc);
    const created = await customers.findOne({ _id: insertResult.insertedId });
    if (!created) throw new HttpError(500, "Failed to create customer");
    const createdPublic = toPublicCustomer(created);
    await writeCustomerAuditEntry(ctx, "Customer Created", `เพิ่มลูกค้า: ${createdPublic.companyName}`, createdPublic);
    res.status(201).json({ customer: createdPublic });
    return;
  }

  throw new HttpError(405, "Method not allowed");
}

async function handleOne(req: VercelRequest, res: VercelResponse, id: string) {
  const objectId = toObjectId(id);
  const customers = await customersCollection();

  if (req.method === "GET") {
    const ctx = await requireUser(req);
    const canManage = roleHasPermission(ctx.role, "customers:view");
    const canReadForQuotation = roleHasPermission(ctx.role, "quotations:create");
    if (!canManage && !canReadForQuotation) throw new HttpError(403, "Forbidden");
    const doc = await customers.findOne({ _id: objectId });
    if (!doc) throw new HttpError(404, "ไม่พบข้อมูลลูกค้า");
    res.status(200).json({ customer: toPublicCustomer(doc) });
    return;
  }

  if (req.method === "PATCH") {
    const ctx = await requirePermission(req, "customers:edit");
    const target = await customers.findOne({ _id: objectId });
    if (!target) throw new HttpError(404, "ไม่พบข้อมูลลูกค้า");

    const update = validateCustomerDraft(req.body, true);
    if (Object.keys(update).length > 0) {
      await customers.updateOne({ _id: objectId }, { $set: { ...update, updatedAt: nowIso(), updatedBy: ctx.user.id } });
    }
    const updated = await customers.findOne({ _id: objectId });
    if (!updated) throw new HttpError(404, "ไม่พบข้อมูลลูกค้า");
    const updatedPublic = toPublicCustomer(updated);
    if (Object.keys(update).length > 0) {
      await writeCustomerAuditEntry(ctx, "Customer Updated", `แก้ไขข้อมูลลูกค้า: ${updatedPublic.companyName}`, updatedPublic);
    }
    res.status(200).json({ customer: updatedPublic });
    return;
  }

  throw new HttpError(405, "Method not allowed");
}

async function handleArchive(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "customers:archive");

  const objectId = toObjectId(id);
  const customers = await customersCollection();
  const target = await customers.findOne({ _id: objectId });
  if (!target) throw new HttpError(404, "ไม่พบข้อมูลลูกค้า");

  const isDeleted = req.body?.isDeleted === true;
  await customers.updateOne({ _id: objectId }, { $set: { isDeleted, updatedAt: nowIso(), updatedBy: ctx.user.id } });
  const updated = await customers.findOne({ _id: objectId });
  if (!updated) throw new HttpError(404, "ไม่พบข้อมูลลูกค้า");
  const updatedPublic = toPublicCustomer(updated);
  await writeCustomerAuditEntry(
    ctx,
    isDeleted ? "Customer Archived" : "Customer Restored",
    `${isDeleted ? "เก็บถาวร" : "กู้คืน"}ลูกค้า: ${updatedPublic.companyName}`,
    updatedPublic,
  );
  res.status(200).json({ customer: updatedPublic });
}

/** POST /api/customers/:id/line-pairing (added 2026-08-10) — issues the 24-hour pairing code the
 * customer types into the company LINE OA chat (see api/_lib/lineHandler.ts's webhook, which
 * consumes it). Gated by `customers:edit` OR `service:edit` — the flow is driven from the Service
 * Report editor by field/service staff, who typically hold service permissions rather than
 * customer-admin ones. Re-issuing replaces any outstanding code. */
async function handleLinePairing(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requireUser(req);
  if (!roleHasPermission(ctx.role, "customers:edit") && !roleHasPermission(ctx.role, "service:edit")) {
    throw new HttpError(403, "Forbidden");
  }
  const customers = await customersCollection();
  const target = await customers.findOne({ _id: toObjectId(id) });
  if (!target || target.isDeleted) throw new HttpError(404, "ไม่พบข้อมูลลูกค้า");

  const code = generatePairingCode();
  const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MS).toISOString();
  await customers.updateOne({ _id: target._id }, { $set: { linePairing: { code, expiresAt }, updatedAt: nowIso(), updatedBy: ctx.user.id } });
  await writeCustomerAuditEntry(
    ctx, "Customer LINE Pairing Code Issued",
    `ออกรหัสจับคู่ LINE ให้ลูกค้า ${target.companyName}`,
    { id, companyName: target.companyName },
  );
  res.status(200).json({ code, expiresAt });
}

export async function handleCustomers(req: VercelRequest, res: VercelResponse): Promise<void> {
  const parts = getPathSegments(req, "/api/customers");

  if (parts.length === 0) return handleList(req, res);
  if (parts.length === 1) return handleOne(req, res, parts[0]);
  if (parts.length === 2 && parts[1] === "archive") return handleArchive(req, res, parts[0]);
  if (parts.length === 2 && parts[1] === "line-pairing") return handleLinePairing(req, res, parts[0]);
  throw new HttpError(404, "Not found");
}
