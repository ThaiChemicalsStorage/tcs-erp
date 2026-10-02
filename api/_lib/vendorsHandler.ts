import type { ApiRequest, ApiResponse } from "./httpTypes.js";
import type { Collection, WithId } from "mongodb";
import { MongoServerError } from "mongodb";
import { HttpError, getPathSegments } from "./http.js";
import { requirePermission, requireUser, type AuthContext } from "./auth.js";
import { vendorsCollection, apEntriesCollection, auditLogCollection, toObjectId, withStringId, type VendorFields } from "./collections.js";
import { validateVendorDraft } from "./vendorValidation.js";
import { roleHasPermission } from "../../src/lib/roles.js";
import { nowIso } from "../../src/lib/products.js";
import { vendorApprovalStatusOf, VENDOR_ACCOUNTING_FIELDS, VENDOR_PURCHASING_FIELDS } from "../../src/lib/vendors.js";
import { assertCodeUsable } from "./codeEntriesHandler.js";
import { activeUserIdsWithPermission, notifyUsers } from "./departmentNotify.js";

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
    // ผู้ขายก่อน 2026-09-21 ไม่มีฟิลด์นี้ — ต้องอ่านเป็น "approved" ไม่งั้นวัน deploy จัดซื้อจะ
    // อนุมัติใบสั่งซื้อไม่ได้เลยทั้งระบบ · helper ตัวเดียวกับที่ด่าน beforeApprove ของใบสั่งซื้อใช้
    approvalStatus: vendorApprovalStatusOf(doc),
    submittedAt: doc.submittedAt ?? "",
    submittedBy: doc.submittedBy ?? "",
    approvedAt: doc.approvedAt ?? "",
    approvedByUserId: doc.approvedByUserId ?? "",
    approvedByName: doc.approvedByName ?? "",
    rejectionComment: doc.rejectionComment ?? "",
    // ช่องใหม่ 2026-10-02 — ผู้ขายเก่าไม่มี ส่งค่าว่างออกไปให้ฟอร์มไม่ต้องเดา
    nameEn: doc.nameEn ?? "",
    postalCode: doc.postalCode ?? "",
    branch: doc.branch ?? -1,
    paymentTerms: doc.paymentTerms ?? "",
    whtIncomeType: doc.whtIncomeType ?? "",
    whtRate: doc.whtRate ?? null,
    whtCategory: doc.whtCategory ?? "",
    whtCondition: doc.whtCondition ?? "",
    vendorType: doc.vendorType ?? "",
    accountCode: doc.accountCode ?? "",
    priceType: doc.priceType ?? "",
    vatRate: doc.vatRate ?? null,
    shippingMethod: doc.shippingMethod ?? "",
    creditDays: doc.creditDays ?? null,
    currency: doc.currency ?? "",
    discount: doc.discount ?? "",
    creditLimit: doc.creditLimit ?? null,
    openingBalance: doc.openingBalance ?? null,
    advanceCheque: doc.advanceCheque ?? null,
    inactiveAt: doc.inactiveAt ?? "",
  };
}

/**
 * ยอดคงเหลือ + วันที่บิลล่าสุด (2026-10-02) — **คำนวณ ไม่ใช่ช่องกรอก** (เจ้าของ: ช่องที่ควรคำนวณเอง)
 *
 * ทะเบียนเจ้าหนี้ผูกผู้ขายด้วย**ชื่อ** (`ap_entries.vendorName` ไม่มี vendorId — หนี้ตั้งจากชื่อบนใบรับสินค้า)
 * จึงจับคู่ด้วยชื่อตรงตัว · ยอดคงเหลือ = ยอดยกมา + หนี้ที่ยังไม่จ่าย · ส่งให้เฉพาะคนที่มี `ap:view` — ยอดหนี้
 * ไม่ใช่ข้อมูลที่ทุกคนที่เลือกผู้ขายบนใบสั่งซื้อควรเห็น
 */
async function payablesByVendorName(): Promise<Map<string, { unpaid: number; lastBillDate: string }>> {
  const ap = await apEntriesCollection();
  const rows = await ap.aggregate<{ _id: string; unpaid: number; lastBillDate: string }>([
    { $group: {
      _id: "$vendorName",
      unpaid: { $sum: { $cond: [{ $eq: ["$status", "Paid"] }, 0, "$total"] } },
      lastBillDate: { $max: "$invoiceDate" },
    } },
  ]).toArray();
  return new Map(rows.map((r) => [r._id, { unpaid: r.unpaid, lastBillDate: r.lastBillDate ?? "" }]));
}

function withPayables(
  v: ReturnType<typeof toPublicVendor>,
  payables: Map<string, { unpaid: number; lastBillDate: string }> | null,
) {
  if (!payables) return { ...v, balance: null, lastBillDate: "" };
  const p = payables.get(v.name);
  const balance = Math.round(((v.openingBalance ?? 0) + (p?.unpaid ?? 0)) * 100) / 100;
  return { ...v, balance, lastBillDate: p?.lastBillDate ?? "" };
}

/** ค่าที่ถือว่า "ยังไม่ได้กรอก" ของช่องบัญชี — ใช้ตัดสินว่าจัดซื้อส่งช่องบัญชีมาแก้จริงหรือแค่ส่งค่าว่างตามฟอร์ม */
function isBlank(v: unknown): boolean {
  return v === undefined || v === null || v === "";
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
    const payables = canManage && roleHasPermission(ctx.role, "ap:view") ? await payablesByVendorName() : null;
    res.status(200).json({ vendors: docs.map((d) => withPayables(toPublicVendor(d), payables)) });
    return;
  }

  if (req.method === "POST") {
    const ctx = await requirePermission(req, "vendor:create");
    const draft = validateVendorDraft(req.body, false);
    const code = draft.code ?? "";
    await assertCodeAvailable(vendors, code);
    // ช่องบัญชีกรอกได้เฉพาะ `vendor:approve` (2026-10-02) — จัดซื้อส่งค่าว่างมาตามฟอร์มได้ แต่ส่งค่าจริงมา = 403
    const accountingFields = VENDOR_ACCOUNTING_FIELDS.filter((f) => !isBlank(draft[f]));
    if (accountingFields.length > 0 && !roleHasPermission(ctx.role, "vendor:approve")) {
      throw new HttpError(403, "ข้อมูลบัญชีของผู้ขายกรอกได้เฉพาะฝ่ายบัญชี");
    }
    if (draft.accountCode) await assertCodeUsable("account", draft.accountCode);

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
      ...Object.fromEntries([...VENDOR_PURCHASING_FIELDS, ...VENDOR_ACCOUNTING_FIELDS]
        .filter((f) => draft[f] !== undefined && !["name", "code", "contactName", "phone", "taxId", "address", "note"].includes(f))
        .map((f) => [f, draft[f]])),
      ...(draft.isActive === false ? { inactiveAt: now } : {}),
      // ผู้ขายใหม่เริ่มที่ "ร่าง" ชัดเจน (2026-09-21) — ต่างจากผู้ขายเก่าที่ไม่มีฟิลด์นี้เลยและถูก
      // อ่านเป็น "approved" · ตั้งค่าตรงนี้เสมอ ไม่ปล่อยให้ undefined ไปชนกฎของใบเก่า
      approvalStatus: "draft",
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
    res.status(201).json({ vendor: withPayables(publicVendor, roleHasPermission(ctx.role, "ap:view") ? await payablesByVendorName() : null) });
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
    res.status(200).json({ vendor: withPayables(toPublicVendor(doc), roleHasPermission(ctx.role, "ap:view") ? await payablesByVendorName() : null) });
    return;
  }

  if (req.method === "PATCH") {
    /**
     * แบ่งช่องตามฝ่าย (2026-10-02) — เจ้าของ: *"แผนกจัดซื้อกรอกได้แค่นี้ ... ส่วนที่เหลือให้บัญชีกรอกเอง"*
     * ช่องจัดซื้อ (+ เปิด/ปิดใช้งาน) = `vendor:edit` · ช่องบัญชี = `vendor:approve` · **ตัดสินจากช่องที่ค่าเปลี่ยนจริง**
     * ฟอร์มจึงส่งทั้งชุดมาได้โดยไม่ต้องรู้ว่าใครแก้อะไรได้ · คนที่ไม่มีทั้งสองสิทธิ์ = 403 ตั้งแต่ประตู
     */
    const ctx = await requireUser(req);
    const canEditPurchasing = roleHasPermission(ctx.role, "vendor:edit");
    const canEditAccounting = roleHasPermission(ctx.role, "vendor:approve");
    if (!canEditPurchasing && !canEditAccounting) throw new HttpError(403, "Forbidden");
    const target = await vendors.findOne({ _id: objectId });
    if (!target) throw new HttpError(404, "ไม่พบข้อมูลผู้ขาย");

    const update = validateVendorDraft(req.body, true);
    const current = toPublicVendor(target) as Record<string, unknown>;
    const changed = (f: string) => (update as Record<string, unknown>)[f] !== undefined
      && !(isBlank((update as Record<string, unknown>)[f]) && isBlank(current[f]))
      && (update as Record<string, unknown>)[f] !== current[f];
    if (!canEditPurchasing && ([...VENDOR_PURCHASING_FIELDS, "isActive"] as string[]).some(changed)) {
      throw new HttpError(403, "ข้อมูลผู้ขายส่วนนี้แก้ได้เฉพาะฝ่ายจัดซื้อ");
    }
    if (!canEditAccounting && (VENDOR_ACCOUNTING_FIELDS as readonly string[]).some(changed)) {
      throw new HttpError(403, "ข้อมูลบัญชีของผู้ขายแก้ได้เฉพาะฝ่ายบัญชี");
    }
    if (update.accountCode !== undefined && changed("accountCode")) await assertCodeUsable("account", update.accountCode);
    if (update.code !== undefined) await assertCodeAvailable(vendors, update.code, id);
    /**
     * แก้ข้อมูลที่ระบุตัวผู้ขาย = ต้องให้บัญชีอนุมัติใหม่ (2026-09-21)
     *
     * ผู้ขายที่บัญชีอนุมัติแล้วแต่เลขผู้เสียภาษีหรือชื่อถูกเปลี่ยนเงียบ ๆ แย่กว่าความยุ่งยากที่ต้องกดส่ง
     * อนุมัติใหม่ — การอนุมัติหมายถึง "ตรวจข้อมูลชุดนี้แล้ว" ไม่ใช่ "ไว้ใจผู้ขายรายนี้ตลอดไป"
     * ช่องอื่น (ผู้ติดต่อ/โทร/หมายเหตุ/เปิด-ปิดใช้งาน) แก้ได้โดยไม่ตกสถานะ
     */
    // สาขาอยู่ในชุดนี้ด้วย (2026-10-02) — ใบกำกับภาษีต้องระบุสาขา เปลี่ยนสาขาคือเปลี่ยนตัวตนทางภาษี
    const IDENTITY_FIELDS = ["name", "code", "taxId", "address", "branch"] as const;
    const identityChanged = IDENTITY_FIELDS.some((f) => changed(f));
    const resetApproval = identityChanged && vendorApprovalStatusOf(target) !== "draft"
      ? { approvalStatus: "draft" as const, submittedAt: "", submittedBy: "", approvedAt: "", approvedByUserId: "", approvedByName: "", rejectionComment: "" }
      : {};
    if (Object.keys(update).length > 0) {
      await vendors
        .updateOne({ _id: objectId }, { $set: {
          ...update, ...resetApproval,
          // วันที่เลิกใช้ (2026-10-02) — ตั้งตอนปิดใช้งาน ล้างตอนเปิด · ไม่ใช่ช่องกรอก
          ...(update.isActive !== undefined && update.isActive !== target.isActive ? { inactiveAt: update.isActive ? "" : nowIso() } : {}),
          updatedAt: nowIso(), updatedBy: ctx.user.id,
        } })
        .catch(rethrowDuplicate);
    }
    const updated = await vendors.findOne({ _id: objectId });
    if (!updated) throw new HttpError(404, "ไม่พบข้อมูลผู้ขาย");
    const publicVendor = toPublicVendor(updated);
    if (Object.keys(update).length > 0) {
      await writeVendorAuditEntry(ctx, "Vendor Updated", `แก้ไขข้อมูลผู้ขาย: ${publicVendor.name}`);
    }
    res.status(200).json({ vendor: withPayables(publicVendor, roleHasPermission(ctx.role, "ap:view") ? await payablesByVendorName() : null) });
    return;
  }

  throw new HttpError(405, "Method not allowed");
}

/**
 * ขั้นอนุมัติของทะเบียนผู้ขาย (2026-09-21) — เจ้าของสั่งว่าจัดซื้อกรอกข้อมูลแล้ว *"นำส่งข้อมูลไปที่บัญชี
 * ให้บัญชีอนุมัติก่อนเปิด PO สั่งซื้อ"*
 *
 * **เขียน route เอง ไม่ใช้ `documentApproval.ts`** — helper ตัวนั้นตรึง `_id` เป็น string แต่ทะเบียน
 * ผู้ขายใช้ `ObjectId` (`toObjectId()`) ทั้งไฟล์ ใช้ร่วมกันไม่ได้จริง ๆ ไม่ใช่แค่ไม่สะดวก
 */
async function handleVendorApprovalStage(
  req: ApiRequest, res: ApiResponse, id: string, stage: "submit" | "approve" | "reject",
) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const objectId = toObjectId(id);

  const now = nowIso();
  let ctx: AuthContext;
  let update: Partial<VendorFields>;
  let action: string;

  /**
   * **ด่านสิทธิ์มาก่อนการอ่านฐานข้อมูลเสมอ** — เดิม `findOne()` ถูกเรียกก่อน คนที่ยังไม่ล็อกอินจึงยิง
   * route นี้แล้วแยกได้ว่า id ไหนมีอยู่จริง (404 "ไม่พบข้อมูลผู้ขาย") กับ id ไหนไม่มี · ด่านของทั้งสอง
   * ขั้นไม่ได้ขึ้นกับตัวเอกสารเลย จึงย้ายขึ้นมาก่อนได้ตรง ๆ
   */
  if (stage === "submit") {
    // จัดซื้อเป็นคนส่ง จึงใช้สิทธิ์ที่จัดซื้อมีอยู่แล้ว ไม่สร้างสิทธิ์ใหม่ให้ต้องไปติ๊กมืออีกตัว
    ctx = await requireUser(req);
    if (!roleHasPermission(ctx.role, "vendor:create") && !roleHasPermission(ctx.role, "vendor:edit")) {
      throw new HttpError(403, "Forbidden");
    }
  } else {
    ctx = await requirePermission(req, "vendor:approve");
  }

  const vendors = await vendorsCollection();
  const target = await vendors.findOne({ _id: objectId });
  if (!target) throw new HttpError(404, "ไม่พบข้อมูลผู้ขาย");
  // ผู้ขายที่ถูกเก็บถาวรไม่ต้องเดินขั้นนี้ — หน้าจอซ่อนปุ่มไว้อยู่แล้ว ด่านนี้กันคนที่ยิง API ตรง ๆ
  if (target.isDeleted) throw new HttpError(400, "ผู้ขายรายนี้ถูกเก็บถาวรแล้ว");
  const current = vendorApprovalStatusOf(target);

  if (stage === "submit") {
    if (current !== "draft" && current !== "rejected") {
      throw new HttpError(400, current === "pendingApproval" ? "ผู้ขายรายนี้ส่งให้บัญชีอนุมัติไปแล้ว" : "ผู้ขายรายนี้บัญชีอนุมัติแล้ว");
    }
    update = { approvalStatus: "pendingApproval", submittedAt: now, submittedBy: ctx.user.id, rejectionComment: "" };
    action = "Vendor Submitted For Approval";
  } else {
    if (current !== "pendingApproval") throw new HttpError(400, "ผู้ขายรายนี้ไม่ได้อยู่ระหว่างรออนุมัติ");
    if (stage === "approve") {
      update = {
        approvalStatus: "approved", approvedAt: now,
        approvedByUserId: ctx.user.id, approvedByName: ctx.user.fullName, rejectionComment: "",
      };
      action = "Vendor Approved";
    } else {
      // บังคับใส่เหตุผลเหมือนการตีกลับเอกสารทุกใบในระบบ — ข้อความเดียวกับ documentApproval.ts
      const comment = typeof req.body?.comment === "string" ? req.body.comment.trim() : "";
      if (!comment) throw new HttpError(400, "กรุณาระบุเหตุผลที่ไม่อนุมัติ");
      update = { approvalStatus: "rejected", rejectionComment: comment, approvedAt: "", approvedByUserId: "", approvedByName: "" };
      action = "Vendor Rejected";
    }
  }

  await vendors.updateOne({ _id: objectId }, { $set: { ...update, updatedAt: now, updatedBy: ctx.user.id } });
  const updated = await vendors.findOne({ _id: objectId });
  if (!updated) throw new HttpError(404, "ไม่พบข้อมูลผู้ขาย");
  const publicVendor = toPublicVendor(updated);
  await writeVendorAuditEntry(ctx, action, `${action === "Vendor Approved" ? "บัญชีอนุมัติผู้ขาย" : action === "Vendor Rejected" ? "บัญชีไม่อนุมัติผู้ขาย" : "ส่งผู้ขายให้บัญชีอนุมัติ"}: ${publicVendor.name}`);

  // แจ้งเตือนแบบ best-effort เหมือนทุกที่ในระบบ — ส่งไม่ถึงต้องไม่ทำให้การบันทึกล้ม
  try {
    if (stage === "submit") {
      const sent = await notifyUsers(await activeUserIdsWithPermission("vendor:approve"), ctx.user.id, {
        type: "vendor_submitted",
        title: "ผู้ขายรออนุมัติ",
        description: `${ctx.user.fullName} ส่งผู้ขาย ${publicVendor.name} ให้บัญชีอนุมัติ`,
        module: "ทะเบียนผู้ขาย",
        related: {},
      });
      if (sent === 0) {
        console.warn("[vendors] submitted but nobody was notified — no active user holds vendor:approve");
      }
    } else if (target.submittedBy) {
      await notifyUsers([target.submittedBy], ctx.user.id, {
        type: stage === "approve" ? "vendor_approved" : "vendor_rejected",
        title: stage === "approve" ? "บัญชีอนุมัติผู้ขายแล้ว" : "บัญชีไม่อนุมัติผู้ขาย",
        description: stage === "approve"
          ? `${ctx.user.fullName} อนุมัติผู้ขาย ${publicVendor.name} — เปิดใบสั่งซื้อกับรายนี้ได้แล้ว`
          : `${ctx.user.fullName} ไม่อนุมัติผู้ขาย ${publicVendor.name}: ${update.rejectionComment}`,
        module: "ทะเบียนผู้ขาย",
        related: {},
      });
    }
  } catch (err) {
    console.error("[vendors] approval-stage notification failed", err);
  }

  res.status(200).json({ vendor: withPayables(publicVendor, roleHasPermission(ctx.role, "ap:view") ? await payablesByVendorName() : null) });
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
  res.status(200).json({ vendor: withPayables(publicVendor, roleHasPermission(ctx.role, "ap:view") ? await payablesByVendorName() : null) });
}

export async function handleVendors(req: ApiRequest, res: ApiResponse): Promise<void> {
  const parts = getPathSegments(req, "/api/vendors");

  if (parts.length === 0) return handleList(req, res);
  if (parts.length === 1) return handleOne(req, res, parts[0]);
  if (parts.length === 2 && parts[1] === "archive") return handleArchive(req, res, parts[0]);
  // ขั้นอนุมัติของบัญชี (2026-09-21)
  if (parts.length === 2 && parts[1] === "submit-approval") return handleVendorApprovalStage(req, res, parts[0], "submit");
  if (parts.length === 2 && parts[1] === "approve") return handleVendorApprovalStage(req, res, parts[0], "approve");
  if (parts.length === 2 && parts[1] === "reject") return handleVendorApprovalStage(req, res, parts[0], "reject");
  throw new HttpError(404, "Not found");
}
