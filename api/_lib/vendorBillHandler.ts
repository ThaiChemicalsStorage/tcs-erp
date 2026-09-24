import type { ApiRequest, ApiResponse } from "./httpTypes.js";
import { HttpError, getPathSegments, isAutoSaveRequest } from "./http.js";
import { requireUser, requirePermission, type AuthContext } from "./auth.js";
import { buildSimpleOwnershipClause } from "./visibility.js";
import {
  vendorBillsCollection, apEntriesCollection, receivingReportsCollection, purchaseOrdersCollection, vendorsCollection,
  countersCollection, auditLogCollection, toObjectId, type VendorBillFields, type ApEntryFields,
} from "./collections.js";
import { nextMonthlyDocumentNumber } from "./documentNumbering.js";
import { roleHasPermission } from "../../src/lib/roles.js";
import { nowIso } from "../../src/lib/products.js";
import { sanitizeLongText, validateIsoDateOrEmpty } from "./quoteValidation.js";
import { sanitizeNullableNumber } from "./projectValidation.js";
import { addDaysIso } from "../../src/lib/printFormat.js";
import {
  vendorBillTotals, type VendorBill, type VendorBillRow, type VendorBillSummary, type VendorBillCandidate,
} from "../../src/lib/vendorBill.js";
import type { ObjectId } from "mongodb";

/**
 * ใบรับวางบิลของสโตร์ (2026-09-23) — ดูกติกาใน `src/lib/vendorBill.ts`
 *
 * สิทธิ์ใช้ชุด `receivingReport:*` ของใบรับสินค้า (แผนกเดียวกันเป็นเจ้าของ และใบนี้อ่านแค่หนี้ที่ใบรับสินค้าตั้งไว้)
 * ไม่สร้างสิทธิ์ใหม่ จึงไม่ต้องไปติ๊กสิทธิ์ให้ role ไหนเพิ่ม · ไม่มีขั้นอนุมัติ (เจ้าของเลือก 2026-09-23)
 *
 * ยอดเงินทุกตัวประกอบจาก `ap_entries` ตอนอ่าน — ใบนี้เก็บแค่ id ของหนี้
 */

type BillDoc = VendorBillFields & { _id: string };
type ApDoc = ApEntryFields & { _id: ObjectId };

async function writeAuditEntry(ctx: AuthContext, action: string, details: string): Promise<void> {
  const auditLog = await auditLogCollection();
  await auditLog.insertOne({
    userId: ctx.user.id, userName: ctx.user.fullName, roleName: ctx.role?.name ?? ctx.user.roleKey,
    module: "ใบรับวางบิล", action, details, createdAt: nowIso(),
  });
}

function canEdit(ctx: AuthContext, doc: { createdBy: string }): boolean {
  if (!roleHasPermission(ctx.role, "receivingReport:edit")) return false;
  return !doc.createdBy || doc.createdBy === ctx.user.id || roleHasPermission(ctx.role, "receivingReport:viewAll");
}

function toClient(doc: BillDoc): VendorBill {
  const { _id, ...rest } = doc;
  return { ...rest, id: _id, documentNumber: doc.documentNumber || _id, apEntryIds: doc.apEntryIds ?? [] };
}

async function loadOrThrow(id: string): Promise<BillDoc> {
  const col = await vendorBillsCollection();
  const doc = await col.findOne({ _id: id });
  if (!doc || doc.isDeleted) throw new HttpError(404, "ไม่พบใบรับวางบิล");
  return doc;
}

function isObjectIdLike(v: string): boolean {
  return /^[a-f0-9]{24}$/i.test(v);
}

/**
 * หนี้ → แถวของใบ · วันครบกำหนด = วันที่ใบกำกับ + เครดิตของใบสั่งซื้อต้นทาง (ใบรับสินค้าเปล่าไม่มีใบสั่งซื้อ ใช้เครดิตหัวใบแทน)
 * เลขที่ใบรับต่อท้าย "/รอบ" เมื่อใบรับสินค้าใบนั้นมีหลายรอบ — ใบรับหนึ่งใบของระบบนี้ = หลายบิลของผู้ขายได้
 */
async function rowsFor(entries: ApDoc[], fallbackCreditDays: number | null): Promise<Map<string, VendorBillRow>> {
  const rrIds = [...new Set(entries.map((e) => e.receivingReportId).filter(Boolean))];
  const rrs = rrIds.length > 0 ? await (await receivingReportsCollection()).find({ _id: { $in: rrIds } }, { projection: { batches: 1, purchaseOrderId: 1 } }).toArray() : [];
  const rrById = new Map(rrs.map((r) => [r._id, r]));
  const poIds = [...new Set(rrs.map((r) => r.purchaseOrderId).filter(Boolean))];
  const pos = poIds.length > 0 ? await (await purchaseOrdersCollection()).find({ _id: { $in: poIds } }, { projection: { creditDays: 1 } }).toArray() : [];
  const creditByPo = new Map(pos.map((p) => [p._id, p.creditDays ?? null]));

  const out = new Map<string, VendorBillRow>();
  for (const e of entries) {
    const rr = rrById.get(e.receivingReportId);
    const batches = rr?.batches ?? [];
    const batch = batches.find((b) => b.id === e.batchId);
    const seq = batch?.seq;
    const credit = (rr?.purchaseOrderId ? creditByPo.get(rr.purchaseOrderId) : null) ?? fallbackCreditDays;
    const paid = e.status === "Paid" ? e.total : 0;
    out.set(e._id.toString(), {
      apEntryId: e._id.toString(),
      receivingReportId: e.receivingReportId,
      receivingReportNumber: batches.length > 1 && seq ? `${e.receivingReportNumber}/${seq}` : e.receivingReportNumber,
      invoiceNumber: e.invoiceNumber,
      invoiceDate: e.invoiceDate,
      // รอบที่รับตั้งแต่ 2026-09-24 เก็บวันครบกำหนดของบิลไว้เอง (สโตร์กรอกเครดิตตอนรับของ) — ใช้ตัวนั้นก่อน
      dueDate: batch?.dueDate || (credit !== null && credit !== undefined && e.invoiceDate ? addDaysIso(e.invoiceDate, credit) : ""),
      amount: e.total,
      paid,
      outstanding: Math.round((e.total - paid) * 100) / 100,
    });
  }
  return out;
}

async function bundleOf(doc: BillDoc) {
  const ids = (doc.apEntryIds ?? []).filter(isObjectIdLike);
  const entries = ids.length > 0 ? await (await apEntriesCollection()).find({ _id: { $in: ids.map(toObjectId) } }).toArray() as ApDoc[] : [];
  const byId = await rowsFor(entries, doc.creditDays ?? null);
  const rows: VendorBillRow[] = (doc.apEntryIds ?? []).map((id) => byId.get(id) ?? {
    apEntryId: id, receivingReportId: "", receivingReportNumber: "", invoiceNumber: "", invoiceDate: "", dueDate: "",
    amount: 0, paid: 0, outstanding: 0, missing: true,
  });
  return { vendorBill: toClient(doc), rows };
}

/** id ของหนี้ที่อยู่ในใบรับวางบิลใบอื่นแล้ว (ไม่นับใบที่ลบ) */
async function billedEntryIds(exceptBillId?: string): Promise<Set<string>> {
  const col = await vendorBillsCollection();
  const docs = await col.find({ isDeleted: false, ...(exceptBillId ? { _id: { $ne: exceptBillId } } : {}) }, { projection: { apEntryIds: 1 } }).toArray();
  return new Set(docs.flatMap((d) => d.apEntryIds ?? []));
}

/** หนี้ที่เลือกได้: ยังไม่จ่าย และยังไม่อยู่ในใบรับวางบิลใบไหน — เรียงตามวันที่ใบกำกับ */
async function candidateEntries(vendorName?: string): Promise<ApDoc[]> {
  const col = await apEntriesCollection();
  const taken = await billedEntryIds();
  const docs = await col.find({ status: "Unpaid", ...(vendorName ? { vendorName } : {}) }).sort({ invoiceDate: 1, postedAt: 1 }).limit(2000).toArray() as ApDoc[];
  return docs.filter((d) => !taken.has(d._id.toString()));
}

async function handleList(req: ApiRequest, res: ApiResponse) {
  const ctx = await requirePermission(req, "receivingReport:view");
  const col = await vendorBillsCollection();
  const ownership = buildSimpleOwnershipClause(ctx.user.id, roleHasPermission(ctx.role, "receivingReport:viewAll"), "createdBy");
  const docs = await col.find({ isDeleted: false, ...ownership }).sort({ updatedAt: -1 }).limit(1000).toArray();
  // ดึงหนี้ของทุกใบในคำสั่งเดียว (เดิมเรียก bundleOf ทีละใบ = 3 query ต่อใบ) — ยอดในรายการไม่ใช้วันครบกำหนด
  // จึงไม่ต้องส่งเครดิตหัวใบของแต่ละใบเข้าไป
  const ids = [...new Set(docs.flatMap((d) => d.apEntryIds ?? []).filter(isObjectIdLike))];
  const entries = ids.length > 0 ? await (await apEntriesCollection()).find({ _id: { $in: ids.map(toObjectId) } }).toArray() as ApDoc[] : [];
  const rowById = await rowsFor(entries, null);
  const summaries: VendorBillSummary[] = docs.map((d) => {
    const rows = (d.apEntryIds ?? []).map((id) => rowById.get(id)).filter((r): r is VendorBillRow => !!r);
    const totals = vendorBillTotals(rows);
    return {
      id: d._id, documentNumber: d.documentNumber || d._id, vendorName: d.vendorName, billDate: d.billDate,
      paymentDate: d.paymentDate, rowCount: (d.apEntryIds ?? []).length, total: totals.amount, outstanding: totals.outstanding, updatedAt: d.updatedAt,
    };
  });
  res.status(200).json({ vendorBills: summaries });
}

async function handleCandidates(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
  await requirePermission(req, "receivingReport:view");
  const raw = req.query.vendor;
  const vendor = (Array.isArray(raw) ? raw[0] : raw)?.trim() || undefined;
  const entries = await candidateEntries(vendor);
  const rows = await rowsFor(entries, null);
  const candidates: VendorBillCandidate[] = entries.map((e) => ({ ...rows.get(e._id.toString())!, vendorName: e.vendorName }));
  res.status(200).json({ candidates });
}

async function handleCreate(req: ApiRequest, res: ApiResponse) {
  const ctx = await requirePermission(req, "receivingReport:create");
  const body = (req.body ?? {}) as Record<string, unknown>;
  const vendorName = typeof body.vendorName === "string" ? body.vendorName.trim() : "";
  if (!vendorName) throw new HttpError(400, "กรุณาเลือกผู้ขาย");
  const entries = await candidateEntries(vendorName);
  if (entries.length === 0) throw new HttpError(400, "ผู้ขายรายนี้ไม่มีใบรับสินค้าที่ยังไม่จ่ายและยังไม่ได้วางบิล");

  // เครดิตหัวใบตั้งตามใบสั่งซื้อของบิลแรก (ฟอร์มเดิมพิมพ์ "เครดิต 90 วัน" จากเงื่อนไขของผู้ขาย) — แก้ได้
  const firstRr = entries[0].receivingReportId ? await (await receivingReportsCollection()).findOne({ _id: entries[0].receivingReportId }, { projection: { purchaseOrderId: 1 } }) : null;
  const firstPo = firstRr?.purchaseOrderId ? await (await purchaseOrdersCollection()).findOne({ _id: firstRr.purchaseOrderId }, { projection: { creditDays: 1 } }) : null;
  const vendor = await (await vendorsCollection()).findOne({ name: vendorName, isDeleted: { $ne: true } });

  const counters = await countersCollection();
  const id = await nextMonthlyDocumentNumber(counters, "BR", "vendor_bill");
  const now = nowIso();
  const doc: BillDoc = {
    _id: id, documentNumber: id,
    vendorName, vendorCode: vendor?.code ?? "", vendorTaxId: entries[0].vendorTaxId ?? "", vendorAddress: entries[0].vendorAddress ?? "",
    billDate: now.slice(0, 10), creditDays: firstPo?.creditDays ?? null, paymentDate: "", remarks: "",
    apEntryIds: entries.map((e) => e._id.toString()),
    createdAt: now, updatedAt: now, createdBy: ctx.user.id, updatedBy: ctx.user.id, isDeleted: false,
  };
  await (await vendorBillsCollection()).insertOne(doc);
  await writeAuditEntry(ctx, "Vendor Bill Created", `สร้างใบรับวางบิล ${id} (${vendorName}, ${entries.length} รายการ)`);
  res.status(201).json(await bundleOf(doc));
}

async function handleUpdate(req: ApiRequest, res: ApiResponse, id: string) {
  const ctx = await requirePermission(req, "receivingReport:edit");
  const autoSave = isAutoSaveRequest(req);
  const doc = await loadOrThrow(id);
  if (!canEdit(ctx, doc)) throw new HttpError(403, "คุณไม่มีสิทธิ์แก้ไขใบรับวางบิลใบนี้");
  const body = (req.body ?? {}) as Record<string, unknown>;
  const set: Partial<VendorBillFields> = {};
  if ("billDate" in body) set.billDate = validateIsoDateOrEmpty(body.billDate, "วันที่รับวางบิล");
  if ("paymentDate" in body) set.paymentDate = validateIsoDateOrEmpty(body.paymentDate, "วันที่จ่ายชำระ");
  if ("creditDays" in body) set.creditDays = sanitizeNullableNumber(body.creditDays, "เครดิต", { min: 0, max: 3650 });
  if ("remarks" in body) set.remarks = sanitizeLongText(body.remarks, "หมายเหตุ");
  if ("apEntryIds" in body) {
    if (!Array.isArray(body.apEntryIds) || body.apEntryIds.some((v) => typeof v !== "string" || !isObjectIdLike(v))) {
      throw new HttpError(400, "รายการใบรับสินค้าไม่ถูกต้อง");
    }
    const ids = [...new Set(body.apEntryIds as string[])];
    const current = new Set(doc.apEntryIds ?? []);
    const added = ids.filter((x) => !current.has(x));
    if (added.length > 0) {
      const entries = await (await apEntriesCollection()).find({ _id: { $in: added.map(toObjectId) } }).toArray() as ApDoc[];
      if (entries.length !== added.length) throw new HttpError(400, "ไม่พบใบรับสินค้าบางรายการในทะเบียนเจ้าหนี้");
      const other = entries.find((e) => e.vendorName !== doc.vendorName);
      if (other) throw new HttpError(400, `${other.receivingReportNumber} เป็นของผู้ขายรายอื่น (${other.vendorName})`);
      const taken = await billedEntryIds(id);
      const dup = entries.find((e) => taken.has(e._id.toString()));
      if (dup) throw new HttpError(409, `${dup.receivingReportNumber} อยู่ในใบรับวางบิลใบอื่นแล้ว`);
    }
    set.apEntryIds = ids;
  }
  const col = await vendorBillsCollection();
  await col.updateOne({ _id: id }, { $set: { ...set, updatedAt: nowIso(), updatedBy: ctx.user.id } });
  // บันทึกอัตโนมัติไม่เขียน audit — ไม่งั้นทุกการพิมพ์กลายเป็นหนึ่งแถวใน audit log (กติกาเดียวกับหน้าแก้เอกสารอื่น)
  if (!autoSave) await writeAuditEntry(ctx, "Vendor Bill Updated", `แก้ไขใบรับวางบิล ${id}`);
  res.status(200).json(await bundleOf(await loadOrThrow(id)));
}

async function handleDelete(req: ApiRequest, res: ApiResponse, id: string) {
  const ctx = await requirePermission(req, "receivingReport:delete");
  const doc = await loadOrThrow(id);
  if (!canEdit(ctx, doc) && !roleHasPermission(ctx.role, "receivingReport:viewAll")) throw new HttpError(403, "คุณไม่มีสิทธิ์ลบใบรับวางบิลใบนี้");
  await (await vendorBillsCollection()).updateOne({ _id: id }, { $set: { isDeleted: true, updatedAt: nowIso(), updatedBy: ctx.user.id } });
  await writeAuditEntry(ctx, "Vendor Bill Deleted", `ลบใบรับวางบิล ${id}`);
  res.status(204).end();
}

async function handlePrint(req: ApiRequest, res: ApiResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "receivingReport:print");
  await loadOrThrow(id);
  await writeAuditEntry(ctx, "Vendor Bill Printed", `พิมพ์ใบรับวางบิล ${id}`);
  res.status(204).end();
}

/**
 * รอบการรับที่อยู่ในใบรับวางบิลที่ยังไม่ถูกลบ — ใบรับสินค้าเรียกก่อนยกเลิกรอบ (ยกเลิกรอบ = ลบหนี้ก้อนนั้นทิ้ง
 * ถ้าปล่อยไป แถวในใบรับวางบิลจะชี้ไปหาหนี้ที่ไม่มีแล้ว)
 */
export async function vendorBillHoldingEntry(apEntryId: string): Promise<string | null> {
  const col = await vendorBillsCollection();
  const doc = await col.findOne({ isDeleted: false, apEntryIds: apEntryId }, { projection: { documentNumber: 1 } });
  return doc ? (doc.documentNumber || doc._id) : null;
}

export async function handleVendorBill(req: ApiRequest, res: ApiResponse): Promise<void> {
  const parts = getPathSegments(req, "/api/vendor-bills");
  await requireUser(req);
  if (parts.length === 0) {
    if (req.method === "POST") return handleCreate(req, res);
    if (req.method === "GET") return handleList(req, res);
    throw new HttpError(405, "Method not allowed");
  }
  if (parts.length === 1 && parts[0] === "candidates") return handleCandidates(req, res);
  const id = parts[0];
  if (parts.length === 1) {
    if (req.method === "GET") {
      await requirePermission(req, "receivingReport:view");
      res.status(200).json(await bundleOf(await loadOrThrow(id)));
      return;
    }
    if (req.method === "PATCH") return handleUpdate(req, res, id);
    if (req.method === "DELETE") return handleDelete(req, res, id);
    throw new HttpError(405, "Method not allowed");
  }
  if (parts.length === 2 && parts[1] === "print") return handlePrint(req, res, id);
  throw new HttpError(404, "Not found");
}
