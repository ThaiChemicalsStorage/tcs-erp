import type { ApiRequest, ApiResponse } from "./httpTypes.js";
import type { Collection, WithId } from "mongodb";
import { MongoServerError } from "mongodb";
import { HttpError, getPathSegments } from "./http.js";
import { requirePermission, requireUser, type AuthContext } from "./auth.js";
import { codeEntriesCollection, auditLogCollection, toObjectId, withStringId, type CodeEntryFields } from "./collections.js";
import { roleHasPermission } from "../../src/lib/roles.js";
import { nowIso } from "../../src/lib/products.js";
import { sanitizeShortText } from "./quoteValidation.js";
import { codeApprovalStatusOf, codeNeedsApproval } from "../../src/lib/codeRegister.js";
import { activeUserIdsWithPermission, notifyUsers } from "./departmentNotify.js";

/**
 * ทะเบียนรหัสสำหรับใบ PR/PO (2026-08-31) — เจ้าของขอไว้ 2026-08-28:
 * *"เพิ่มหน้าสร้างรหัสแผนก เพื่อเอาไว้ใช้สำหรับใบ PR กับ PO"*
 *
 * **สองชุดใน collection เดียว แยกด้วย `kind`** (ยืนยันกับเจ้าของ 2026-08-31 ว่าเป็นรหัสคนละชุดกัน):
 *   - `department` — รหัสแผนกแบบ `G143` ที่ใบขอซื้อจริงกรอกไว้ในช่อง "แผนก"
 *   - `account`    — ผังบัญชี 479 บัญชีแบบ `5230-15` จากไฟล์ที่เจ้าของส่งมา
 *
 * ทำเป็นโมดูลเดียวสองแท็บแทนสองโมดูล เพราะเช็คลิสต์การเพิ่มโมดูลในแอปนี้ยาว 16 ไฟล์ และทั้งสองชุด
 * ใช้หน้าตา/สิทธิ์/การตรวจซ้ำชุดเดียวกันหมด ต่างกันแค่ฟิลด์เสริมของฝั่งบัญชี
 *
 * **รหัสห้ามซ้ำภายใน `kind` เดียวกัน** — คนละชุดใช้รหัสชนกันได้ไม่เป็นไร index จึงเป็น
 * `{ kind, code }` ไม่ใช่ `{ code }` เดี่ยว ๆ
 */

function toPublicCode(doc: WithId<CodeEntryFields>) {
  const c = withStringId(doc);
  return {
    ...c,
    category: doc.category ?? "",
    level: doc.level ?? null,
    isControl: doc.isControl ?? false,
    parentCode: doc.parentCode ?? "",
    // รหัสก่อน 2026-10-02 ไม่มีฟิลด์นี้ = อนุมัติแล้ว (เจ้าของตอบ) — อ่านผ่าน helper ตัวเดียวกับหน้าจอ
    approvalStatus: codeApprovalStatusOf(doc),
    createdByName: doc.createdByName ?? "",
    approvedAt: doc.approvedAt ?? "",
    approvedByName: doc.approvedByName ?? "",
    rejectionComment: doc.rejectionComment ?? "",
  };
}

/**
 * สถานะตั้งต้นของรหัสใหม่ (2026-10-02) — บัญชี (`codeRegister:approve`) สร้างเอง = อนุมัติทันที
 * (เจ้าของ: *"แผนกบัญชีสามารถสร้างได้เองและก็อนุมัติได้เอง"*) · คนอื่นสร้าง = รอบัญชีอนุมัติ ·
 * ประเภทงานของใบเบิกไม่ผ่านบัญชี
 */
function initialApproval(ctx: AuthContext, kind: CodeEntryFields["kind"], now: string): Partial<CodeEntryFields> {
  if (!codeNeedsApproval(kind)) return { approvalStatus: "approved" };
  if (roleHasPermission(ctx.role, "codeRegister:approve")) {
    return { approvalStatus: "approved", approvedAt: now, approvedByUserId: ctx.user.id, approvedByName: ctx.user.fullName };
  }
  return { approvalStatus: "pending" };
}

const KIND_TH: Record<CodeEntryFields["kind"], string> = { department: "รหัสแผนก", account: "รหัสบัญชี", workType: "ประเภทงาน" };

/** แจ้งบัญชีว่ามีรหัสรออนุมัติ — best-effort เหมือนทุกที่ ส่งไม่ถึงต้องไม่ทำให้การบันทึกล้ม */
async function notifyApprovers(ctx: AuthContext, description: string): Promise<void> {
  try {
    const sent = await notifyUsers(await activeUserIdsWithPermission("codeRegister:approve"), ctx.user.id, {
      type: "code_entry_submitted",
      title: "รหัสรออนุมัติ",
      description,
      module: "ทะเบียนรหัส",
      related: {},
    });
    if (sent === 0) console.warn("[code-entries] pending code but nobody was notified — no active user holds codeRegister:approve");
  } catch (err) {
    console.error("[code-entries] submit notification failed", err);
  }
}

/**
 * **รหัสที่ยังไม่อนุมัติใช้บนใบขอซื้อ/ใบสั่งซื้อไม่ได้** (เจ้าของสั่ง 2026-10-02) — ตรวจเฉพาะรหัสที่**เปลี่ยน**จากค่าเดิมของบรรทัด
 * (จับคู่ด้วย line id) ใบเก่าที่ใส่รหัสไว้ก่อนแล้วจึงยังบันทึกต่อได้ ·
 * ⚠️ รหัสที่พิมพ์เองและ**ไม่มีในทะเบียนเลย**ยังรับเหมือนเดิม (ช่องเป็น "พิมพ์เองได้" มาตั้งแต่แรก) — กันเฉพาะรหัสที่อยู่ในทะเบียน
 * แต่บัญชียังไม่อนุมัติหรือไม่อนุมัติ
 */
export async function assertLineCodesApproved(
  lines: { id: string; departmentCode?: string; costCode?: string }[],
  existing: { id: string; departmentCode?: string; costCode?: string }[],
): Promise<void> {
  const before = new Map(existing.map((l) => [l.id, l]));
  const changed = { department: new Set<string>(), account: new Set<string>() };
  for (const l of lines) {
    const prev = before.get(l.id);
    const dept = (l.departmentCode ?? "").trim().toUpperCase();
    const acct = (l.costCode ?? "").trim().toUpperCase();
    if (dept && dept !== (prev?.departmentCode ?? "").trim().toUpperCase()) changed.department.add(dept);
    if (acct && acct !== (prev?.costCode ?? "").trim().toUpperCase()) changed.account.add(acct);
  }
  if (changed.department.size === 0 && changed.account.size === 0) return;
  const codes = await codeEntriesCollection();
  const blocked = await codes.findOne({
    approvalStatus: { $in: ["pending", "rejected"] },
    $or: [
      ...(changed.department.size > 0 ? [{ kind: "department" as const, code: { $in: [...changed.department] } }] : []),
      ...(changed.account.size > 0 ? [{ kind: "account" as const, code: { $in: [...changed.account] } }] : []),
    ],
  });
  if (blocked) {
    throw new HttpError(400, `${KIND_TH[blocked.kind]} ${blocked.code} ยังไม่ได้รับอนุมัติจากฝ่ายบัญชี — ใช้ไม่ได้จนกว่าบัญชีจะอนุมัติ`);
  }
}

/** รหัสเดี่ยว (เช่นเลขที่บัญชีของผู้ขาย) — กติกาเดียวกับ `assertLineCodesApproved()` ผู้เรียกส่งมาเฉพาะตอนค่าเปลี่ยน */
export async function assertCodeUsable(kind: "department" | "account", code: string): Promise<void> {
  const value = code.trim().toUpperCase();
  if (!value) return;
  await assertLineCodesApproved(
    [{ id: "_", ...(kind === "department" ? { departmentCode: value } : { costCode: value }) }],
    [],
  );
}

let codeIndexesEnsured = false;
async function ensureCodeIndexes(codes: Collection<CodeEntryFields>) {
  if (codeIndexesEnsured) return;
  try {
    await Promise.all([
      codes.createIndex({ kind: 1, isDeleted: 1 }),
      codes.createIndex({ kind: 1, code: 1 }, { unique: true }),
    ]);
  } catch (err) {
    console.error("[code-entries] ensureCodeIndexes failed", err);
  }
  codeIndexesEnsured = true;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseKind(v: unknown): CodeEntryFields["kind"] {
  if (v === "department" || v === "account" || v === "workType") return v;
  throw new HttpError(400, "ชนิดรหัสไม่ถูกต้อง");
}

/** รหัสห้ามซ้ำภายในชนิดเดียวกัน เทียบแบบไม่สนตัวพิมพ์ — `excludeId` ไว้ตอน PATCH จะได้ไม่ชนตัวเอง */
async function assertCodeAvailable(
  codes: Collection<CodeEntryFields>,
  kind: CodeEntryFields["kind"],
  code: string,
  excludeId?: string,
): Promise<void> {
  const clash = await codes.findOne({
    ...(excludeId ? { _id: { $ne: toObjectId(excludeId) } } : {}),
    kind,
    code: { $regex: `^${escapeRegExp(code)}$`, $options: "i" },
  });
  if (clash) throw new HttpError(409, "รหัสนี้มีอยู่แล้วในทะเบียน");
}

function rethrowDuplicate(err: unknown): never {
  if (err instanceof MongoServerError && err.code === 11000) throw new HttpError(409, "รหัสนี้มีอยู่แล้วในทะเบียน");
  throw err;
}

async function writeCodeAudit(ctx: AuthContext, action: string, details: string): Promise<void> {
  const auditLog = await auditLogCollection();
  await auditLog.insertOne({
    userId: ctx.user.id,
    userName: ctx.user.fullName,
    roleName: ctx.role?.name ?? ctx.user.roleKey,
    module: "ทะเบียนรหัส",
    action,
    details,
    createdAt: nowIso(),
  });
}

/** ฟิลด์ที่รับจาก body — ฝั่งบัญชีมีเสริมสี่ช่อง ฝั่งแผนกไม่ใช้ */
function readDraft(body: unknown, partial: boolean): Partial<CodeEntryFields> {
  const b = (body ?? {}) as Record<string, unknown>;
  const out: Partial<CodeEntryFields> = {};
  if (!partial || b.kind !== undefined) out.kind = parseKind(b.kind);
  // รหัสเก็บเป็นตัวพิมพ์ใหญ่เสมอ ทั้ง regex และ unique index จะได้เห็นค่าเดียวกัน
  if (!partial || b.code !== undefined) out.code = sanitizeShortText(b.code, "รหัส", true).toUpperCase();
  if (!partial || b.name !== undefined) out.name = sanitizeShortText(b.name, "ชื่อ", true);
  if (!partial || b.category !== undefined) out.category = sanitizeShortText(b.category, "หมวด");
  if (!partial || b.parentCode !== undefined) out.parentCode = sanitizeShortText(b.parentCode, "บัญชีคุม").toUpperCase();
  if (!partial || b.isControl !== undefined) out.isControl = b.isControl === true;
  if (!partial || b.level !== undefined) {
    const raw = b.level;
    out.level = raw === null || raw === undefined || raw === "" ? null : Number(raw);
    if (out.level !== null && !Number.isFinite(out.level)) throw new HttpError(400, "ระดับต้องเป็นตัวเลข");
  }
  if (!partial || b.isActive !== undefined) out.isActive = b.isActive === undefined ? true : b.isActive === true;
  return out;
}

async function handleList(req: ApiRequest, res: ApiResponse) {
  const codes = await codeEntriesCollection();
  await ensureCodeIndexes(codes);

  if (req.method === "GET") {
    // เหมือนทะเบียนผู้ขาย: คนที่ต้อง**เลือก**รหัสบนใบ PR/PO ต้องอ่านได้ ไม่ต้องมีสิทธิ์ดูแลทะเบียน
    const ctx = await requireUser(req);
    const canManage = roleHasPermission(ctx.role, "codeRegister:view");
    const canPick = roleHasPermission(ctx.role, "purchaseRequest:view") || roleHasPermission(ctx.role, "purchaseOrder:view");
    if (!canManage && !canPick) throw new HttpError(403, "Forbidden");

    // คนที่แค่เลือกรหัสเห็นเฉพาะที่บัญชีอนุมัติแล้ว (2026-10-02) — ไม่มีฟิลด์ = อนุมัติแล้ว จึงกรองแบบ $nin
    const filter = canManage ? {} : { isActive: true, isDeleted: false, approvalStatus: { $nin: ["pending", "rejected"] as ("pending" | "rejected")[] } };
    const docs = await codes.find(filter).sort({ kind: 1, code: 1 }).toArray();
    res.status(200).json({ codes: docs.map(toPublicCode) });
    return;
  }

  if (req.method === "POST") {
    const ctx = await requirePermission(req, "codeRegister:create");
    const draft = readDraft(req.body, false);
    await assertCodeAvailable(codes, draft.kind!, draft.code!);
    const now = nowIso();
    const doc: CodeEntryFields = {
      kind: draft.kind!,
      code: draft.code!,
      name: draft.name!,
      category: draft.category ?? "",
      level: draft.level ?? null,
      isControl: draft.isControl ?? false,
      parentCode: draft.parentCode ?? "",
      isActive: draft.isActive ?? true,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
      createdBy: ctx.user.id,
      updatedBy: ctx.user.id,
      createdByName: ctx.user.fullName,
      ...initialApproval(ctx, draft.kind!, now),
    };
    const inserted = await codes.insertOne(doc).catch(rethrowDuplicate);
    const created = await codes.findOne({ _id: inserted.insertedId });
    if (!created) throw new HttpError(500, "Failed to create code entry");
    const publicCode = toPublicCode(created);
    await writeCodeAudit(ctx, "Code Entry Created", `เพิ่มรหัส ${publicCode.code} (${publicCode.name})`);
    if (publicCode.approvalStatus === "pending") {
      await notifyApprovers(ctx, `${ctx.user.fullName} เพิ่ม${KIND_TH[publicCode.kind]} ${publicCode.code} ${publicCode.name} รอบัญชีอนุมัติ`);
    }
    res.status(201).json({ code: publicCode });
    return;
  }

  throw new HttpError(405, "Method not allowed");
}

/**
 * นำเข้าหลายรหัสพร้อมกัน — ใช้ตอนโยนผังบัญชีจากไฟล์เข้ามาครั้งแรก
 *
 * **รหัสที่มีอยู่แล้วถูกข้าม ไม่ทับของเดิม** เพราะการนำเข้าซ้ำเป็นเรื่องปกติ (เจ้าของอาจส่งไฟล์ที่
 * เพิ่มบัญชีใหม่มาให้อีกรอบ) และการทับจะกลืนชื่อที่แอดมินแก้เอง — คืนจำนวนที่สร้าง/ข้ามให้หน้าจอบอกผู้ใช้
 */
async function handleImport(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "codeRegister:create");
  const body = (req.body ?? {}) as Record<string, unknown>;
  const kind = parseKind(body.kind);
  const rawEntries = Array.isArray(body.entries) ? body.entries : [];
  if (rawEntries.length === 0) throw new HttpError(400, "ไม่มีรายการให้นำเข้า");
  if (rawEntries.length > 2000) throw new HttpError(400, "นำเข้าได้ครั้งละไม่เกิน 2000 รายการ");

  const codes = await codeEntriesCollection();
  await ensureCodeIndexes(codes);
  const now = nowIso();

  let created = 0;
  let skipped = 0;
  const approval = initialApproval(ctx, kind, now);
  for (const raw of rawEntries as Record<string, unknown>[]) {
    const draft = readDraft({ ...raw, kind }, false);
    const existing = await codes.findOne({ kind, code: { $regex: `^${escapeRegExp(draft.code!)}$`, $options: "i" } });
    if (existing) { skipped += 1; continue; }
    try {
      await codes.insertOne({
        kind, code: draft.code!, name: draft.name!,
        category: draft.category ?? "", level: draft.level ?? null,
        isControl: draft.isControl ?? false, parentCode: draft.parentCode ?? "",
        isActive: true, isDeleted: false,
        createdAt: now, updatedAt: now, createdBy: ctx.user.id, updatedBy: ctx.user.id,
        createdByName: ctx.user.fullName, ...approval,
      });
      created += 1;
    } catch (err) {
      // แพ้การแข่งใส่พร้อมกัน — unique index กันซ้ำให้แล้ว นับเป็นข้าม ไม่ใช่ล้ม
      if (err instanceof MongoServerError && err.code === 11000) { skipped += 1; continue; }
      throw err;
    }
  }

  await writeCodeAudit(ctx, "Code Entries Imported", `นำเข้าทะเบียนรหัส (${kind}) สร้างใหม่ ${created} ข้าม ${skipped}`);
  if (created > 0 && approval.approvalStatus === "pending") {
    await notifyApprovers(ctx, `${ctx.user.fullName} นำเข้า${KIND_TH[kind]} ${created} รายการ รอบัญชีอนุมัติ`);
  }
  res.status(200).json({ created, skipped });
}

async function handleOne(req: ApiRequest, res: ApiResponse, id: string) {
  const objectId = toObjectId(id);
  const codes = await codeEntriesCollection();

  if (req.method === "PATCH") {
    const ctx = await requirePermission(req, "codeRegister:edit");
    const target = await codes.findOne({ _id: objectId });
    if (!target) throw new HttpError(404, "ไม่พบรหัสนี้ในทะเบียน");

    const update = readDraft(req.body, true);
    // ชนิดเปลี่ยนไม่ได้ — ย้ายรหัสข้ามชุดคือการสร้างใหม่ ไม่ใช่การแก้
    delete update.kind;
    if (update.code !== undefined) await assertCodeAvailable(codes, target.kind, update.code, id);

    // คนที่ไม่ใช่บัญชีแก้รหัส/ชื่อของรหัสที่อนุมัติแล้ว หรือแก้รหัสที่ถูกตีกลับ = ส่งให้บัญชีอนุมัติใหม่ (2026-10-02)
    // แนวเดียวกับผู้ขาย — ไม่งั้นแก้ "G143 ฝ่ายผลิต" เป็นรหัสอื่นทั้งดุ้นได้โดยบัญชีไม่เห็น · ปิด/เปิดใช้งานไม่นับ
    const status = codeApprovalStatusOf(target);
    const contentChanged = (Object.keys(update) as (keyof CodeEntryFields)[])
      .some((k) => k !== "isActive" && update[k] !== target[k]);
    const identityChanged = (update.code !== undefined && update.code !== target.code) || (update.name !== undefined && update.name !== target.name);
    const resubmit = codeNeedsApproval(target.kind) && !roleHasPermission(ctx.role, "codeRegister:approve")
      && ((status === "approved" && identityChanged) || (status === "rejected" && contentChanged));
    const approvalReset: Partial<CodeEntryFields> = resubmit
      ? { approvalStatus: "pending", approvedAt: "", approvedByUserId: "", approvedByName: "", rejectionComment: "" }
      : {};
    if (Object.keys(update).length > 0) {
      await codes
        .updateOne({ _id: objectId }, { $set: { ...update, ...approvalReset, updatedAt: nowIso(), updatedBy: ctx.user.id } })
        .catch(rethrowDuplicate);
    }
    const updated = await codes.findOne({ _id: objectId });
    if (!updated) throw new HttpError(404, "ไม่พบรหัสนี้ในทะเบียน");
    const publicCode = toPublicCode(updated);
    if (Object.keys(update).length > 0) await writeCodeAudit(ctx, "Code Entry Updated", `แก้ไขรหัส ${publicCode.code}`);
    if (resubmit) await notifyApprovers(ctx, `${ctx.user.fullName} แก้${KIND_TH[publicCode.kind]} ${publicCode.code} ${publicCode.name} รอบัญชีอนุมัติใหม่`);
    res.status(200).json({ code: publicCode });
    return;
  }

  throw new HttpError(405, "Method not allowed");
}

async function handleArchive(req: ApiRequest, res: ApiResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "codeRegister:archive");
  const objectId = toObjectId(id);
  const codes = await codeEntriesCollection();
  const target = await codes.findOne({ _id: objectId });
  if (!target) throw new HttpError(404, "ไม่พบรหัสนี้ในทะเบียน");

  const isDeleted = req.body?.isDeleted === true;
  await codes.updateOne({ _id: objectId }, { $set: { isDeleted, updatedAt: nowIso(), updatedBy: ctx.user.id } });
  const updated = await codes.findOne({ _id: objectId });
  if (!updated) throw new HttpError(404, "ไม่พบรหัสนี้ในทะเบียน");
  const publicCode = toPublicCode(updated);
  await writeCodeAudit(ctx, isDeleted ? "Code Entry Archived" : "Code Entry Restored", `${isDeleted ? "เก็บถาวร" : "กู้คืน"}รหัส ${publicCode.code}`);
  res.status(200).json({ code: publicCode });
}

/**
 * บัญชีอนุมัติ / ไม่อนุมัติรหัส (2026-10-02) — อนุมัติได้จาก "รออนุมัติ" หรือ "ไม่อนุมัติ" (บัญชีเปลี่ยนใจได้) ·
 * ไม่อนุมัติได้เฉพาะ "รออนุมัติ" และต้องมีเหตุผลเสมอ เหมือนการตีกลับเอกสารทุกใบในระบบ · แจ้งคนสร้างรหัส
 */
async function handleApprovalStage(req: ApiRequest, res: ApiResponse, id: string, stage: "approve" | "reject") {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "codeRegister:approve");
  const objectId = toObjectId(id);
  const codes = await codeEntriesCollection();
  const target = await codes.findOne({ _id: objectId });
  if (!target) throw new HttpError(404, "ไม่พบรหัสนี้ในทะเบียน");
  if (!codeNeedsApproval(target.kind)) throw new HttpError(400, "รหัสชนิดนี้ไม่ต้องผ่านการอนุมัติ");

  const current = codeApprovalStatusOf(target);
  const now = nowIso();
  let update: Partial<CodeEntryFields>;
  if (stage === "approve") {
    if (current === "approved") throw new HttpError(400, "รหัสนี้บัญชีอนุมัติแล้ว");
    update = { approvalStatus: "approved", approvedAt: now, approvedByUserId: ctx.user.id, approvedByName: ctx.user.fullName, rejectionComment: "" };
  } else {
    if (current !== "pending") throw new HttpError(400, "รหัสนี้ไม่ได้อยู่ระหว่างรออนุมัติ");
    const comment = typeof req.body?.comment === "string" ? req.body.comment.trim() : "";
    if (!comment) throw new HttpError(400, "กรุณาระบุเหตุผลที่ไม่อนุมัติ");
    update = { approvalStatus: "rejected", rejectionComment: comment.slice(0, 500), approvedAt: "", approvedByUserId: "", approvedByName: "" };
  }
  await codes.updateOne({ _id: objectId }, { $set: { ...update, updatedAt: now, updatedBy: ctx.user.id } });
  const updated = await codes.findOne({ _id: objectId });
  if (!updated) throw new HttpError(404, "ไม่พบรหัสนี้ในทะเบียน");
  const publicCode = toPublicCode(updated);
  await writeCodeAudit(ctx, stage === "approve" ? "Code Entry Approved" : "Code Entry Rejected",
    `${stage === "approve" ? "บัญชีอนุมัติ" : "บัญชีไม่อนุมัติ"}${KIND_TH[publicCode.kind]} ${publicCode.code}`);

  try {
    if (target.createdBy && target.createdBy !== ctx.user.id) {
      await notifyUsers([target.createdBy], ctx.user.id, {
        type: stage === "approve" ? "code_entry_approved" : "code_entry_rejected",
        title: stage === "approve" ? "บัญชีอนุมัติรหัสแล้ว" : "บัญชีไม่อนุมัติรหัส",
        description: stage === "approve"
          ? `${ctx.user.fullName} อนุมัติ${KIND_TH[publicCode.kind]} ${publicCode.code} — ใช้บนใบขอซื้อ/ใบสั่งซื้อได้แล้ว`
          : `${ctx.user.fullName} ไม่อนุมัติ${KIND_TH[publicCode.kind]} ${publicCode.code}: ${publicCode.rejectionComment}`,
        module: "ทะเบียนรหัส",
        related: {},
      });
    }
  } catch (err) {
    console.error("[code-entries] approval notification failed", err);
  }
  res.status(200).json({ code: publicCode });
}

export async function handleCodeEntries(req: ApiRequest, res: ApiResponse): Promise<void> {
  const parts = getPathSegments(req, "/api/code-entries");

  if (parts.length === 0) return handleList(req, res);
  if (parts.length === 1 && parts[0] === "import") return handleImport(req, res);
  if (parts.length === 1) return handleOne(req, res, parts[0]);
  if (parts.length === 2 && parts[1] === "archive") return handleArchive(req, res, parts[0]);
  if (parts.length === 2 && parts[1] === "approve") return handleApprovalStage(req, res, parts[0], "approve");
  if (parts.length === 2 && parts[1] === "reject") return handleApprovalStage(req, res, parts[0], "reject");
  throw new HttpError(404, "Not found");
}
