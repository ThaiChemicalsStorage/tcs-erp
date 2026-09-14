import type { ApiRequest, ApiResponse } from "./httpTypes.js";
import type { Collection, WithId } from "mongodb";
import { MongoServerError } from "mongodb";
import { HttpError, getPathSegments } from "./http.js";
import { requirePermission, requireUser, type AuthContext } from "./auth.js";
import { vendorsCollection, auditLogCollection, toObjectId, withStringId, type VendorFields } from "./collections.js";
import { validateVendorDraft } from "./vendorValidation.js";
import { roleHasPermission } from "../../src/lib/roles.js";
import { nowIso } from "../../src/lib/products.js";

/**
 * ทะเบียนผู้ขาย (Vendor register) — เจ้าของขอไว้ 2026-08-28:
 * *"มีหน้าเพิ่มผู้ขายสำหรับจัดซื้อเพราะมันจะมีรหัสผู้ขายด้วย"*
 *
 * โครงลอกมาจาก `customersHandler.ts` + `customerValidation.ts` ทั้งดุ้น (แม่แบบที่ใหม่และครบที่สุด:
 * `toPublicX` ตัวเดียว, lazy index, audit ทุกการเขียน, soft-delete ไม่ลบจริง) แล้วเติมการเช็ครหัสซ้ำ
 * แบบ `departmentsHandler.ts` เข้าไป
 *
 * **ทำไมถึงมีทั้ง regex และ unique index**: regex เช็คแบบไม่สนตัวพิมพ์เพื่อให้ error สวย ๆ ("รหัสนี้
 * มีผู้ใช้แล้ว") ส่วน unique index เป็นตัวกันแข่ง (สองคนกดบันทึกพร้อมกัน) ซึ่ง regex กันไม่ได้ —
 * `validateVendorDraft` แปลงรหัสเป็นตัวพิมพ์ใหญ่ก่อนเสมอ ทั้งสองชั้นจึงมองเห็นค่าเดียวกันจริง ๆ
 * (ต่างจาก `departmentsHandler.ts` ที่ regex ไม่สนตัวพิมพ์แต่ index สนตัวพิมพ์ = สองชั้นไม่ตรงกัน)
 */

function toPublicVendor(doc: WithId<VendorFields>) {
  const v = withStringId(doc);
  return {
    ...v,
    code: doc.code ?? "",
    contactName: doc.contactName ?? "",
    phone: doc.phone ?? "",
    taxId: doc.taxId ?? "",
    address: doc.address ?? "",
    note: doc.note ?? "",
  };
}

let vendorIndexesEnsured = false;
async function ensureVendorIndexes(vendors: Collection<VendorFields>) {
  if (vendorIndexesEnsured) return;
  try {
    await Promise.all([
      vendors.createIndex({ isDeleted: 1 }),
      vendors.createIndex({ isActive: 1 }),
      vendors.createIndex({ name: 1 }),
      // partial index — รหัสว่างได้หลายแถว แต่รหัสที่กรอกแล้วห้ามซ้ำ
      vendors.createIndex({ code: 1 }, { unique: true, partialFilterExpression: { code: { $type: "string", $gt: "" } } }),
    ]);
  } catch (err) {
    // ห้ามให้การสร้าง index ทำให้ request ล้ม — แนวเดียวกับ quotationTemplatesHandler.ts
    console.error("[vendors] ensureVendorIndexes failed", err);
  }
  vendorIndexesEnsured = true;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** รหัสผู้ขายห้ามซ้ำแบบไม่สนตัวพิมพ์ — `excludeId` ไว้ตอน PATCH จะได้ไม่ชนกับตัวเอง */
async function assertCodeAvailable(vendors: Collection<VendorFields>, code: string, excludeId?: string): Promise<void> {
  if (code === "") return;
  const clash = await vendors.findOne({
    ...(excludeId ? { _id: { $ne: toObjectId(excludeId) } } : {}),
    code: { $regex: `^${escapeRegExp(code)}$`, $options: "i" },
  });
  if (clash) throw new HttpError(409, "รหัสผู้ขายนี้มีผู้ใช้งานแล้ว");
}

/** แปลง E11000 จาก unique index ให้เป็น 409 ที่ผู้ใช้อ่านรู้เรื่อง แทนที่จะเป็น 500 */
function rethrowDuplicate(err: unknown): never {
  if (err instanceof MongoServerError && err.code === 11000) {
    throw new HttpError(409, "รหัสผู้ขายนี้มีผู้ใช้งานแล้ว");
  }
  throw err;
}

async function writeVendorAuditEntry(
  ctx: AuthContext,
  action: string,
  details: string,
): Promise<void> {
  const auditLog = await auditLogCollection();
  await auditLog.insertOne({
    userId: ctx.user.id,
    userName: ctx.user.fullName,
    roleName: ctx.role?.name ?? ctx.user.roleKey,
    module: "ผู้ขาย",
    action,
    details,
    createdAt: nowIso(),
  });
}

async function handleList(req: ApiRequest, res: ApiResponse) {
  const vendors = await vendorsCollection();
  await ensureVendorIndexes(vendors);

  if (req.method === "GET") {
    // การ์ฟเอาต์แบบเดียวกับลูกค้า: คนที่ต้อง**เลือก**ผู้ขายบนใบสั่งซื้อ/ใบขอซื้อ ต้องอ่านทะเบียนได้
    // แม้ไม่มีสิทธิ์ดูแลทะเบียน ไม่งั้น Combobox บนใบสั่งซื้อจะว่างเปล่าสำหรับคนที่ใช้งานจริง
    const ctx = await requireUser(req);
    const canManage = roleHasPermission(ctx.role, "vendor:view");
    const canPick = roleHasPermission(ctx.role, "purchaseOrder:view") || roleHasPermission(ctx.role, "purchaseRequest:view");
    if (!canManage && !canPick) throw new HttpError(403, "Forbidden");

    const filter = canManage ? {} : { isActive: true, isDeleted: false };
    const docs = await vendors.find(filter).sort({ name: 1 }).toArray();
    res.status(200).json({ vendors: docs.map(toPublicVendor) });
    return;
  }

  if (req.method === "POST") {
    const ctx = await requirePermission(req, "vendor:create");
    const draft = validateVendorDraft(req.body, false);
    const code = draft.code ?? "";
    await assertCodeAvailable(vendors, code);

    const now = nowIso();
    const doc: VendorFields = {
      name: draft.name!,
      code,
      contactName: draft.contactName ?? "",
      phone: draft.phone ?? "",
      taxId: draft.taxId ?? "",
      address: draft.address ?? "",
      note: draft.note ?? "",
      isActive: draft.isActive ?? true,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
      createdBy: ctx.user.id,
      updatedBy: ctx.user.id,
    };
    const inserted = await vendors.insertOne(doc).catch(rethrowDuplicate);
    const created = await vendors.findOne({ _id: inserted.insertedId });
    if (!created) throw new HttpError(500, "Failed to create vendor");
    const publicVendor = toPublicVendor(created);
    await writeVendorAuditEntry(ctx, "Vendor Created", `เพิ่มผู้ขาย: ${publicVendor.name}${publicVendor.code ? ` (${publicVendor.code})` : ""}`);
    res.status(201).json({ vendor: publicVendor });
    return;
  }

  throw new HttpError(405, "Method not allowed");
}

async function handleOne(req: ApiRequest, res: ApiResponse, id: string) {
  const objectId = toObjectId(id);
  const vendors = await vendorsCollection();

  if (req.method === "GET") {
    const ctx = await requireUser(req);
    if (!roleHasPermission(ctx.role, "vendor:view")) throw new HttpError(403, "Forbidden");
    const doc = await vendors.findOne({ _id: objectId });
    if (!doc) throw new HttpError(404, "ไม่พบข้อมูลผู้ขาย");
    res.status(200).json({ vendor: toPublicVendor(doc) });
    return;
  }

  if (req.method === "PATCH") {
    const ctx = await requirePermission(req, "vendor:edit");
    const target = await vendors.findOne({ _id: objectId });
    if (!target) throw new HttpError(404, "ไม่พบข้อมูลผู้ขาย");

    const update = validateVendorDraft(req.body, true);
    if (update.code !== undefined) await assertCodeAvailable(vendors, update.code, id);
    if (Object.keys(update).length > 0) {
      await vendors
        .updateOne({ _id: objectId }, { $set: { ...update, updatedAt: nowIso(), updatedBy: ctx.user.id } })
        .catch(rethrowDuplicate);
    }
    const updated = await vendors.findOne({ _id: objectId });
    if (!updated) throw new HttpError(404, "ไม่พบข้อมูลผู้ขาย");
    const publicVendor = toPublicVendor(updated);
    if (Object.keys(update).length > 0) {
      await writeVendorAuditEntry(ctx, "Vendor Updated", `แก้ไขข้อมูลผู้ขาย: ${publicVendor.name}`);
    }
    res.status(200).json({ vendor: publicVendor });
    return;
  }

  throw new HttpError(405, "Method not allowed");
}

/** เก็บถาวร/กู้คืน — soft-delete เสมอ ไม่เคยลบแถวจริง เพราะใบสั่งซื้อเก่าอ้างชื่อผู้ขายไว้ */
async function handleArchive(req: ApiRequest, res: ApiResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "vendor:archive");

  const objectId = toObjectId(id);
  const vendors = await vendorsCollection();
  const target = await vendors.findOne({ _id: objectId });
  if (!target) throw new HttpError(404, "ไม่พบข้อมูลผู้ขาย");

  const isDeleted = req.body?.isDeleted === true;
  await vendors.updateOne({ _id: objectId }, { $set: { isDeleted, updatedAt: nowIso(), updatedBy: ctx.user.id } });
  const updated = await vendors.findOne({ _id: objectId });
  if (!updated) throw new HttpError(404, "ไม่พบข้อมูลผู้ขาย");
  const publicVendor = toPublicVendor(updated);
  await writeVendorAuditEntry(
    ctx,
    isDeleted ? "Vendor Archived" : "Vendor Restored",
    `${isDeleted ? "เก็บถาวร" : "กู้คืน"}ผู้ขาย: ${publicVendor.name}`,
  );
  res.status(200).json({ vendor: publicVendor });
}

export async function handleVendors(req: ApiRequest, res: ApiResponse): Promise<void> {
  const parts = getPathSegments(req, "/api/vendors");

  if (parts.length === 0) return handleList(req, res);
  if (parts.length === 1) return handleOne(req, res, parts[0]);
  if (parts.length === 2 && parts[1] === "archive") return handleArchive(req, res, parts[0]);
  throw new HttpError(404, "Not found");
}
