import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Collection } from "mongodb";
import { HttpError } from "./http.js";
import { requireUser, requirePermission, type AuthContext } from "./auth.js";
import { nowIso } from "../../src/lib/products.js";
import type { Permission } from "../../src/lib/permissions.js";

/**
 * ขั้นตอนอนุมัติเอกสารร่วม (ร่าง → รออนุมัติ → อนุมัติ) สำหรับใบเบิก-คืนวัสดุ / ใบขอซื้อ / ใบสั่งงาน /
 * ใบสั่งผลิต — เพิ่ม 2026-08-20 ตามคำสั่งเจ้าของ "ใบที่ต้องมีการอนุมัติต้องมีปุ่มอนุมัติด้วย"
 *
 * Deliberately mirrors Scope of Work's existing workflow (`api/_lib/scopeOfWorkHandler.ts`) rather
 * than inventing a second shape — the owner asked for it to behave "เหมือน Scope of Work เป๊ะ":
 *   Draft --submit-approval--> PendingApproval --finalize--> Final
 *                                    |  \--withdraw-approval--> Draft   (submitter takes it back)
 *                                    \-----reject-------------> Draft   (approver sends it back)
 *
 * Factored into one generic helper because four document types need identical semantics; the
 * alternative was four near-copies that would drift apart the first time one of them was fixed.
 * Scope of Work itself is NOT migrated onto this — it has its own validation gates and notification
 * fan-out, and rewriting a live, heavily-used workflow to share code carries more risk than value.
 */

/** สถานะเอกสารที่ใช้ขั้นตอนอนุมัติร่วมนี้ */
export type ApprovableStatus = "Draft" | "PendingApproval" | "Final";

/** ฟิลด์ที่ทุกเอกสารในกลุ่มนี้ต้องมี เพื่อให้ helper อ่าน/เขียนได้ */
export interface ApprovableFields {
  status: ApprovableStatus;
  /** ชื่อผู้อนุมัติที่พิมพ์ลงในฟอร์ม — มีอยู่ก่อนแล้วในทุกเอกสาร (ช่อง "ผู้อนุมัติ") ระบบจะเติมให้
   * อัตโนมัติตอนอนุมัติ ถ้ายังว่างอยู่ แต่ไม่ทับค่าที่เจ้าหน้าที่พิมพ์เองไว้ */
  approvedBy: string;
  /** ผู้กดอนุมัติจริงในระบบ — เก็บแยกจาก `approvedBy` เพราะช่องนั้นเป็นข้อความพิมพ์อิสระ แก้ได้
   * ส่วนช่องนี้เซิร์ฟเวอร์เขียนเท่านั้น ใช้ตรวจสอบย้อนหลังได้ */
  approvedByUserId?: string;
  approvedAt?: string;
  /** เหตุผลตอนปฏิเสธ ล้างทิ้งทุกครั้งที่ส่งขออนุมัติใหม่ */
  rejectionComment?: string;
  updatedAt: string;
  updatedBy: string;
}

export const APPROVAL_DEFAULTS: Pick<ApprovableFields, "approvedByUserId" | "approvedAt" | "rejectionComment"> = {
  approvedByUserId: "", approvedAt: "", rejectionComment: "",
};

/**
 * เอกสารเก่าที่บันทึกไว้ก่อน 2026-08-20 ไม่มี 3 ฟิลด์นี้ — normalize ตอนอ่านเสมอ ไม่ทำ migration
 * (แนวเดียวกับที่ `toServiceReport()` ทำกับฟิลด์ลายเซ็นลูกค้าที่เพิ่มทีหลัง)
 */
export function withApprovalDefaults<T extends Partial<ApprovableFields>>(doc: T): T & Pick<ApprovableFields, "approvedByUserId" | "approvedAt" | "rejectionComment"> {
  return {
    ...doc,
    approvedByUserId: doc.approvedByUserId ?? "",
    approvedAt: doc.approvedAt ?? "",
    rejectionComment: doc.rejectionComment ?? "",
  };
}

export interface ApprovalConfig<TDoc extends ApprovableFields> {
  /** ชื่อเอกสารภาษาไทย ใช้ในข้อความ error/audit เช่น "ใบสั่งผลิต" */
  label: string;
  /** สิทธิ์ที่ใช้อนุมัติ/ปฏิเสธ เช่น "productionOrder:finalize" */
  approvePermission: Permission;
  collection: () => Promise<Collection<TDoc>>;
  load: (id: string) => Promise<TDoc>;
  /** ตรวจว่าผู้ใช้แก้เอกสารนี้ได้ไหม — ใช้กับ submit/withdraw (คนแก้ได้ = คนส่งขออนุมัติได้) */
  canEdit: (ctx: AuthContext, doc: TDoc) => boolean;
  /** เขียน audit log — แต่ละ handler มีฟังก์ชันของตัวเองอยู่แล้ว ส่งเข้ามาใช้ */
  writeAudit: (ctx: AuthContext, action: string, detail: string, doc: TDoc) => Promise<void>;
  /** ทำงานเพิ่มหลังอนุมัติสำเร็จ เช่น อัปเดตสถานะรายการใน Project ให้เป็น fulfilled */
  onApproved?: (ctx: AuthContext, doc: TDoc) => Promise<void>;
  /** ส่งผลลัพธ์กลับ — แต่ละเอกสารใช้ชื่อ key ไม่เหมือนกัน (materialRequisition/jobOrder/...) */
  respond: (res: VercelResponse, doc: TDoc) => void;
}

/** ตัวกรอง `_id` — เอกสารกลุ่มนี้ใช้เลขที่เอกสารเป็น `_id` (string) ไม่ใช่ ObjectId */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const byId = (id: string): any => ({ _id: id });

async function applyStatusChange<TDoc extends ApprovableFields>(
  cfg: ApprovalConfig<TDoc>, id: string, ctx: AuthContext, set: Partial<ApprovableFields>,
): Promise<TDoc> {
  const col = await cfg.collection();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await col.updateOne(byId(id), { $set: { ...set, updatedAt: nowIso(), updatedBy: ctx.user.id } as any });
  return cfg.load(id);
}

/** ร่าง → รออนุมัติ */
export async function handleSubmitApproval<TDoc extends ApprovableFields>(
  req: VercelRequest, res: VercelResponse, id: string, cfg: ApprovalConfig<TDoc>,
) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requireUser(req);
  const doc = await cfg.load(id);
  if (!cfg.canEdit(ctx, doc)) throw new HttpError(403, "Forbidden");
  if (doc.status !== "Draft") throw new HttpError(400, `ส่งขออนุมัติได้เฉพาะ${cfg.label}ที่เป็นฉบับร่างเท่านั้น`);

  // ล้างเหตุผลปฏิเสธเดิมทิ้ง — ไม่งั้นใบที่แก้แล้วส่งใหม่จะยังโชว์เหตุผลรอบก่อนค้างอยู่
  const updated = await applyStatusChange(cfg, id, ctx, { status: "PendingApproval", rejectionComment: "" });
  await cfg.writeAudit(ctx, `${cfg.label} Submitted`, `ส่งขออนุมัติ${cfg.label} ${id}`, updated);
  cfg.respond(res, updated);
}

/** รออนุมัติ → อนุมัติแล้ว (ปุ่ม "อนุมัติ") */
export async function handleApprove<TDoc extends ApprovableFields>(
  req: VercelRequest, res: VercelResponse, id: string, cfg: ApprovalConfig<TDoc>,
) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, cfg.approvePermission);
  const doc = await cfg.load(id);
  if (doc.status === "Final") throw new HttpError(400, `${cfg.label}นี้อนุมัติแล้ว`);
  if (doc.status !== "PendingApproval") throw new HttpError(400, `ต้องส่งขออนุมัติก่อน จึงจะอนุมัติ${cfg.label}ได้`);

  const updated = await applyStatusChange(cfg, id, ctx, {
    status: "Final",
    // ไม่ทับชื่อที่เจ้าหน้าที่พิมพ์ไว้เองในช่องผู้อนุมัติของฟอร์ม เติมให้เฉพาะตอนที่ยังว่าง
    approvedBy: doc.approvedBy?.trim() ? doc.approvedBy : ctx.user.fullName,
    approvedByUserId: ctx.user.id,
    approvedAt: nowIso().slice(0, 10),
  });
  await cfg.onApproved?.(ctx, updated);
  await cfg.writeAudit(ctx, `${cfg.label} Approved`, `อนุมัติ${cfg.label} ${id}`, updated);
  cfg.respond(res, updated);
}

/** รออนุมัติ → ร่าง (ผู้อนุมัติตีกลับ ต้องระบุเหตุผล) */
export async function handleReject<TDoc extends ApprovableFields>(
  req: VercelRequest, res: VercelResponse, id: string, cfg: ApprovalConfig<TDoc>,
) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, cfg.approvePermission);
  const doc = await cfg.load(id);
  if (doc.status !== "PendingApproval") throw new HttpError(400, `ปฏิเสธได้เฉพาะ${cfg.label}ที่รออนุมัติเท่านั้น`);

  const body = (req.body ?? {}) as Record<string, unknown>;
  const comment = typeof body.comment === "string" ? body.comment.trim() : "";
  if (!comment) throw new HttpError(400, "กรุณาระบุเหตุผลที่ไม่อนุมัติ");

  const updated = await applyStatusChange(cfg, id, ctx, { status: "Draft", rejectionComment: comment });
  await cfg.writeAudit(ctx, `${cfg.label} Rejected`, `ไม่อนุมัติ${cfg.label} ${id} — ${comment}`, updated);
  cfg.respond(res, updated);
}

/** รออนุมัติ → ร่าง (ผู้ส่งขอถอนกลับมาแก้เอง ไม่ต้องมีสิทธิ์อนุมัติ) */
export async function handleWithdrawApproval<TDoc extends ApprovableFields>(
  req: VercelRequest, res: VercelResponse, id: string, cfg: ApprovalConfig<TDoc>,
) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requireUser(req);
  const doc = await cfg.load(id);
  if (!cfg.canEdit(ctx, doc)) throw new HttpError(403, "Forbidden");
  if (doc.status !== "PendingApproval") throw new HttpError(400, `ถอนได้เฉพาะ${cfg.label}ที่รออนุมัติเท่านั้น`);

  const updated = await applyStatusChange(cfg, id, ctx, { status: "Draft" });
  await cfg.writeAudit(ctx, `${cfg.label} Withdrawn`, `ถอนการขออนุมัติ${cfg.label} ${id}`, updated);
  cfg.respond(res, updated);
}
