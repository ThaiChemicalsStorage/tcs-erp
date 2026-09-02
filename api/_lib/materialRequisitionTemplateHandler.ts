import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Collection, WithId } from "mongodb";
import { HttpError, getPathSegments } from "./http.js";
import { requirePermission, requireUser, type AuthContext } from "./auth.js";
import {
  materialRequisitionTemplatesCollection, auditLogCollection, toObjectId, withStringId,
  type MaterialRequisitionTemplateFields,
} from "./collections.js";
import { roleHasPermission } from "../../src/lib/roles.js";
import { nowIso, newId } from "../../src/lib/products.js";
import { sanitizeShortText, sanitizeLongText } from "./quoteValidation.js";
import { sanitizeNullableNumber } from "./projectValidation.js";
import type { MaterialRequisitionTemplateLine } from "../../src/lib/materialRequisitionTemplate.js";
import { MAX_TEMPLATE_LINES } from "../../src/lib/materialRequisitionTemplate.js";
import type { MaterialRequisitionCategory } from "../../src/lib/materialRequisition.js";

/**
 * API เทมเพลตใบเบิกและใบคืนวัสดุ (2026-09-02) — ดูเหตุผลของโมดูลที่
 * `src/lib/materialRequisitionTemplate.ts`
 *
 * **สิทธิ์**: ตั้งใจ**ไม่**สร้างสิทธิ์ชุดใหม่ — อ่าน/ใช้ ต้องมี `materialRequisition:create`
 * (คนที่ออกใบเบิกได้คือคนที่ต้องใช้เทมเพลต) ส่วนแก้ทะเบียนต้องมี `materialRequisition:edit`
 * สิทธิ์ใหม่ต้องมี RBAC migration ตามไปแจกบนเครื่องจริง ซึ่งโมดูลก่อนหน้าในระบบนี้ลืมไปแล้วสองรอบ
 * และผลคือเมนูที่ไม่มีใครมองเห็นเลยเป็นเดือน (ดู TODO.md) — ที่นี่จึงเลือกไม่เปิดช่องนั้นตั้งแต่ต้น
 *
 * ลบเป็น soft-delete เสมอ ไม่ลบแถวจริง เพื่อให้ audit log ย้อนหลังยังอ่านชื่อเทมเพลตออก
 */

const MATERIAL_CATEGORIES: readonly MaterialRequisitionCategory[] = ["chemical", "consumable", "hardware", "other"];

let indexesEnsured = false;
async function ensureIndexes(templates: Collection<MaterialRequisitionTemplateFields>) {
  if (indexesEnsured) return;
  try {
    await templates.createIndex({ isDeleted: 1, name: 1 });
  } catch (err) {
    // ห้ามให้การสร้าง index ทำให้ request ล้ม — แนวเดียวกับ vendorsHandler.ts
    console.error("[material-requisition-templates] ensureIndexes failed", err);
  }
  indexesEnsured = true;
}

function toClient(doc: WithId<MaterialRequisitionTemplateFields>) {
  const full = withStringId(doc);
  return { ...full, lines: (doc.lines ?? []).map((l) => ({ ...l })), description: doc.description ?? "" };
}

async function writeAuditEntry(ctx: AuthContext, action: string, details: string): Promise<void> {
  const auditLog = await auditLogCollection();
  await auditLog.insertOne({
    userId: ctx.user.id, userName: ctx.user.fullName, roleName: ctx.role?.name ?? ctx.user.roleKey,
    module: "เทมเพลตใบเบิกและใบคืนวัสดุ", action, details, createdAt: nowIso(),
  });
}

/** ตรวจ + ทำความสะอาดรายการทั้งชุด — `id` สร้างใหม่ฝั่งเซิร์ฟเวอร์เสมอ ไม่เชื่อค่าที่ส่งมา */
function sanitizeLines(raw: unknown): MaterialRequisitionTemplateLine[] {
  if (!Array.isArray(raw)) throw new HttpError(400, "รูปแบบรายการไม่ถูกต้อง");
  if (raw.length > MAX_TEMPLATE_LINES) throw new HttpError(400, `เทมเพลตมีได้สูงสุด ${MAX_TEMPLATE_LINES} รายการ`);
  return raw.map((entry) => {
    const l = (entry ?? {}) as Record<string, unknown>;
    return {
      id: newId("mrtline"),
      productId: sanitizeShortText(l.productId, "รหัสอ้างอิงสินค้า"),
      productCode: sanitizeShortText(l.productCode, "รหัสสินค้า"),
      productName: sanitizeShortText(l.productName, "ชื่อสินค้า"),
      unit: sanitizeShortText(l.unit, "หน่วย"),
      // หมวดที่ส่งมาผิด/ไม่ส่ง ให้ตกลงมาที่ "other" แทนที่จะ 400 ทั้งใบ — ค่านี้มีผลแค่การจัดกลุ่มบนจอ
      category: MATERIAL_CATEGORIES.includes(l.category as MaterialRequisitionCategory) ? (l.category as MaterialRequisitionCategory) : "other",
      plannedQty: sanitizeNullableNumber(l.plannedQty, "จำนวน"),
    };
  });
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  const templates = await materialRequisitionTemplatesCollection();
  await ensureIndexes(templates);

  if (req.method === "GET") {
    // คนที่ออกใบเบิกได้ ต้องอ่านเทมเพลตได้ ไม่งั้นปุ่ม "ใช้เทมเพลต" บนใบเบิกจะว่างเปล่าสำหรับคนที่ใช้จริง
    const ctx = await requireUser(req);
    if (!roleHasPermission(ctx.role, "materialRequisition:create") && !roleHasPermission(ctx.role, "materialRequisition:view")) {
      throw new HttpError(403, "Forbidden");
    }
    const docs = await templates.find({ isDeleted: { $ne: true } }).sort({ name: 1 }).toArray();
    res.status(200).json({ templates: docs.map(toClient) });
    return;
  }

  if (req.method === "POST") {
    const ctx = await requirePermission(req, "materialRequisition:edit");
    const body = (req.body ?? {}) as Record<string, unknown>;
    const name = sanitizeShortText(body.name, "ชื่อเทมเพลต");
    if (!name.trim()) throw new HttpError(400, "กรุณาตั้งชื่อเทมเพลต");
    const now = nowIso();
    const doc: MaterialRequisitionTemplateFields = {
      name,
      description: sanitizeLongText(body.description, "คำอธิบาย"),
      lines: sanitizeLines(body.lines ?? []),
      createdAt: now, updatedAt: now, createdBy: ctx.user.id, updatedBy: ctx.user.id, isDeleted: false,
    };
    const inserted = await templates.insertOne(doc);
    const created = await templates.findOne({ _id: inserted.insertedId });
    if (!created) throw new HttpError(500, "Failed to create template");
    await writeAuditEntry(ctx, "Material Requisition Template Created", `สร้างเทมเพลตใบเบิก: ${name}`);
    res.status(201).json({ template: toClient(created) });
    return;
  }

  throw new HttpError(405, "Method not allowed");
}

async function handleOne(req: VercelRequest, res: VercelResponse, id: string) {
  const objectId = toObjectId(id);
  const templates = await materialRequisitionTemplatesCollection();

  if (req.method === "PATCH") {
    const ctx = await requirePermission(req, "materialRequisition:edit");
    const target = await templates.findOne({ _id: objectId });
    if (!target || target.isDeleted) throw new HttpError(404, "ไม่พบเทมเพลต");

    const body = (req.body ?? {}) as Record<string, unknown>;
    const update: Partial<MaterialRequisitionTemplateFields> = {};
    if ("name" in body) {
      const name = sanitizeShortText(body.name, "ชื่อเทมเพลต");
      if (!name.trim()) throw new HttpError(400, "กรุณาตั้งชื่อเทมเพลต");
      update.name = name;
    }
    if ("description" in body) update.description = sanitizeLongText(body.description, "คำอธิบาย");
    if ("lines" in body) update.lines = sanitizeLines(body.lines);

    if (Object.keys(update).length > 0) {
      await templates.updateOne({ _id: objectId }, { $set: { ...update, updatedAt: nowIso(), updatedBy: ctx.user.id } });
    }
    const updated = await templates.findOne({ _id: objectId });
    if (!updated) throw new HttpError(404, "ไม่พบเทมเพลต");
    if (Object.keys(update).length > 0) {
      await writeAuditEntry(ctx, "Material Requisition Template Updated", `แก้ไขเทมเพลตใบเบิก: ${updated.name}`);
    }
    res.status(200).json({ template: toClient(updated) });
    return;
  }

  if (req.method === "DELETE") {
    const ctx = await requirePermission(req, "materialRequisition:edit");
    const target = await templates.findOne({ _id: objectId });
    if (!target || target.isDeleted) throw new HttpError(404, "ไม่พบเทมเพลต");
    await templates.updateOne({ _id: objectId }, { $set: { isDeleted: true, updatedAt: nowIso(), updatedBy: ctx.user.id } });
    await writeAuditEntry(ctx, "Material Requisition Template Deleted", `ลบเทมเพลตใบเบิก: ${target.name}`);
    res.status(200).json({ ok: true });
    return;
  }

  throw new HttpError(405, "Method not allowed");
}

export async function handleMaterialRequisitionTemplates(req: VercelRequest, res: VercelResponse): Promise<void> {
  const parts = getPathSegments(req, "/api/material-requisition-templates");
  if (parts.length === 0) return handleList(req, res);
  if (parts.length === 1) return handleOne(req, res, parts[0]);
  throw new HttpError(404, "Not found");
}
