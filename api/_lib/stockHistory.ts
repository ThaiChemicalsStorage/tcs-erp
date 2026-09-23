import type { ApiRequest, ApiResponse } from "./httpTypes.js";
import type { Filter } from "mongodb";
import { ObjectId } from "mongodb";
import { HttpError } from "./http.js";
import { requirePermission } from "./auth.js";
import {
  stockMovementsCollection, materialRequisitionsCollection, receivingReportsCollection, purchaseRequestsCollection,
  storeReceiptsCollection, usersCollection, withStringId,
  type StockMovementFields, type StockMovementKind, type StockMovementSourceType,
} from "./collections.js";
import { escapeRegExp } from "./searchShared.js";
import type { StockHistoryRow, StockMovementLink, StockHistorySummaryRow } from "../../src/lib/stock.js";

/**
 * ประวัติความเคลื่อนไหวสต๊อก — หน้าแยกของตัวเอง (คำสั่งเจ้าของ 2026-09-23: *"แยกประวัติปรับสต๊อกออกมาเป็น
 * หน้าใหม่และสามารถค้นหาดูได้ว่าของชิ้นนี้ตัดไปกับงานไหนบ้างเข้ายังไงบ้าง"*)
 *
 * ต่างจาก `GET /api/stock-movements` (ซึ่งยังอยู่เหมือนเดิมให้ใบพิมพ์การ์ดสต๊อกและหน้าอื่นใช้) สามเรื่อง:
 *  1. **กรองได้ทุกมิติ** — ประเภท, ที่มา, ช่วงวันที่ (เวลาไทย), สินค้า, แผนก และคำค้นเดียวที่ค้นทั้งรหัส/ชื่อสินค้า
 *     เลขเอกสาร และ **เลขงาน/ใบสั่งงาน/ใบสั่งซื้อ/ผู้ขาย** ที่อยู่บนเอกสารต้นทาง
 *  2. **แบ่งหน้าได้และบอกยอดรวม** — เดิมตัดที่ 200 แถวล่าสุดโดยไม่บอกว่ามีอีกเท่าไร
 *  3. **เติมที่มาให้แต่ละแถว** (`link`) — แถวสต๊อกเก็บแค่เลขเอกสาร ส่วน "ไปใช้กับงานไหน" อยู่บนใบเบิก
 *     และ "มาจากใบสั่งซื้อ/ผู้ขายไหน" อยู่บนใบรับสินค้า จึงตามไปอ่านเฉพาะเอกสารของแถวในหน้านี้
 *
 * ไม่คัดลอกงาน/ผู้ขายลงแถวสต๊อก (denormalize) โดยตั้งใจ: แถวเก่าหลายพันแถวไม่มีข้อมูลนั้นอยู่แล้ว
 * การอ่านจากต้นทางทำให้แถวเก่าและใหม่ได้คำตอบเดียวกันโดยไม่ต้อง migrate
 */

const MAX_PAGE = 500;
const DEFAULT_PAGE = 50;
/** เพดานของเอกสารต้นทางที่คำค้นหนึ่งคำดึงเข้ามาได้ — กันคำค้นกว้าง ๆ อย่าง "2" ดึงทั้งฐานข้อมูล */
const MAX_SOURCE_MATCHES = 500;

const KINDS: StockMovementKind[] = ["receive", "deduct", "adjust", "return"];
const SOURCE_TYPES: StockMovementSourceType[] = [
  "manual", "ar_document", "material_requisition", "receiving_report", "tool_issue", "purchase_request",
  "stock_import", "store_receipt",
];

/** YYYY-MM-DD เวลาไทย → ขอบเวลา UTC ในรูป ISO เดียวกับ `createdAt` ที่เก็บไว้ (สตริงเทียบกันตรง ๆ ได้) */
function bangkokDayStartIso(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) throw new HttpError(400, "รูปแบบวันที่ไม่ถูกต้อง");
  const d = new Date(`${ymd}T00:00:00+07:00`);
  if (Number.isNaN(d.getTime())) throw new HttpError(400, "รูปแบบวันที่ไม่ถูกต้อง");
  return d.toISOString();
}
function nextDay(iso: string): string {
  return new Date(new Date(iso).getTime() + 24 * 60 * 60 * 1000).toISOString();
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** เอกสารต้นทางที่ช่องงาน/ผู้ขาย/เลขที่ตรงกับคำค้น — คืน sourceId ไปรวมกับเงื่อนไขอื่นด้วย $or */
async function sourceIdsMatching(rx: RegExp): Promise<string[]> {
  const [mrs, rrs, prs, srs] = await Promise.all([
    materialRequisitionsCollection().then((c) => c.find(
      { $or: [{ jobCode: rx }, { jobOrderCode: rx }, { productionOrderId: rx }, { customerName: rx }, { documentNumber: rx }, { storeReference: rx }] },
      { projection: { _id: 1 } },
    ).limit(MAX_SOURCE_MATCHES).toArray()),
    receivingReportsCollection().then((c) => c.find(
      { $or: [{ purchaseOrderNumber: rx }, { vendorName: rx }, { jobCode: rx }, { documentNumber: rx }] },
      { projection: { _id: 1 } },
    ).limit(MAX_SOURCE_MATCHES).toArray()),
    purchaseRequestsCollection().then((c) => c.find({ jobCode: rx }, { projection: { _id: 1 } }).limit(MAX_SOURCE_MATCHES).toArray()),
    storeReceiptsCollection().then((c) => c.find(
      { $or: [{ jobCode: rx }, { reference: rx }, { sourceRequisitionNumber: rx }, { customerName: rx }, { documentNumber: rx }] },
      { projection: { _id: 1 } },
    ).limit(MAX_SOURCE_MATCHES).toArray()),
  ]);
  return [...mrs, ...rrs, ...prs, ...srs].map((d) => String(d._id));
}

/** เติม `link` + ชื่อผู้ทำรายการ ให้แถวในหน้านี้เท่านั้น — อ่านเอกสารต้นทางชนิดละหนึ่ง query */
async function enrich(rows: (StockMovementFields & { _id: ObjectId })[]): Promise<StockHistoryRow[]> {
  const idsOf = (type: StockMovementSourceType) => [...new Set(rows.filter((r) => r.sourceType === type && r.sourceId).map((r) => r.sourceId as string))];
  const mrIds = idsOf("material_requisition");
  const rrIds = idsOf("receiving_report");
  const prIds = idsOf("purchase_request");
  const srIds = idsOf("store_receipt");
  const userIds = [...new Set(rows.map((r) => r.createdBy).filter((id) => ObjectId.isValid(id)))];

  const [mrs, rrs, prs, srs, users] = await Promise.all([
    mrIds.length ? materialRequisitionsCollection().then((c) => c.find({ _id: { $in: mrIds } }).toArray()) : [],
    rrIds.length ? receivingReportsCollection().then((c) => c.find({ _id: { $in: rrIds } }).toArray()) : [],
    prIds.length ? purchaseRequestsCollection().then((c) => c.find({ _id: { $in: prIds } }).toArray()) : [],
    srIds.length ? storeReceiptsCollection().then((c) => c.find({ _id: { $in: srIds } }).toArray()) : [],
    userIds.length ? usersCollection().then((c) => c.find({ _id: { $in: userIds.map((id) => new ObjectId(id)) } }, { projection: { fullName: 1 } }).toArray()) : [],
  ]);

  const links = new Map<string, StockMovementLink>();
  for (const m of mrs) {
    const doc = m as unknown as Record<string, unknown>;
    links.set(String(m._id), {
      jobCode: str(doc.jobCode) || undefined,
      jobOrderCode: str(doc.jobOrderCode) || undefined,
      productionOrderId: str(doc.productionOrderId) || undefined,
      customerName: str(doc.customerName) || undefined,
      ownerDepartment: str(doc.ownerDepartment) || "project",
      code: str(doc.issueCode) || undefined,
      reference: str(doc.storeReference) || undefined,
    });
  }
  for (const r of rrs) {
    links.set(String(r._id), {
      purchaseOrderNumber: r.purchaseOrderNumber || undefined,
      vendorName: r.vendorName || undefined,
      jobCode: r.jobCode || undefined,
      code: r.receiveCode ?? String(r._id).split("-")[0],
    });
  }
  for (const p of prs) links.set(String(p._id), { jobCode: p.jobCode || undefined, code: p.requestCode ?? String(p._id).split("-")[0] });
  for (const s of srs) {
    links.set(String(s._id), {
      jobCode: s.jobCode || undefined, customerName: s.customerName || undefined, code: s.receiptCode,
      reference: s.sourceRequisitionNumber || s.reference || undefined,
    });
  }
  const nameById = new Map(users.map((u) => [String(u._id), (u as unknown as { fullName?: string }).fullName ?? ""]));

  return rows.map((r) => ({
    ...withStringId(r),
    createdByName: nameById.get(r.createdBy) ?? "",
    link: (r.sourceId && links.get(r.sourceId)) || {},
  }));
}

export async function handleStockHistory(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
  await requirePermission(req, "stock:view");
  const q = req.query ?? {};

  const clauses: Filter<StockMovementFields>[] = [];
  const kind = str(q.kind);
  if (kind) {
    if (!KINDS.includes(kind as StockMovementKind)) throw new HttpError(400, "ประเภทความเคลื่อนไหวไม่ถูกต้อง");
    clauses.push({ kind: kind as StockMovementKind });
  }
  const sourceType = str(q.sourceType);
  if (sourceType) {
    if (!SOURCE_TYPES.includes(sourceType as StockMovementSourceType)) throw new HttpError(400, "แหล่งที่มาไม่ถูกต้อง");
    clauses.push({ sourceType: sourceType as StockMovementSourceType });
  }
  const productId = str(q.productId);
  if (productId) clauses.push({ productId });
  const departmentId = str(q.departmentId);
  if (departmentId) clauses.push({ departmentId });
  const from = str(q.from);
  const to = str(q.to);
  if (from) clauses.push({ createdAt: { $gte: bangkokDayStartIso(from) } });
  if (to) clauses.push({ createdAt: { $lt: nextDay(bangkokDayStartIso(to)) } });

  const text = str(q.q);
  if (text) {
    const rx = new RegExp(escapeRegExp(text), "i");
    const sourceIds = await sourceIdsMatching(rx);
    clauses.push({
      $or: [
        { productCode: rx }, { productName: rx }, { sourceLabel: rx }, { reason: rx },
        { departmentName: rx }, { teamName: rx },
        ...(sourceIds.length ? [{ sourceId: { $in: sourceIds } }] : []),
      ],
    });
  }
  const filter: Filter<StockMovementFields> = clauses.length ? { $and: clauses } : {};

  const skipRaw = Number.parseInt(str(q.skip), 10);
  const limitRaw = Number.parseInt(str(q.limit), 10);
  const skip = Number.isFinite(skipRaw) && skipRaw > 0 ? skipRaw : 0;
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, MAX_PAGE) : DEFAULT_PAGE;

  const movements = await stockMovementsCollection();
  const [rows, total, grouped] = await Promise.all([
    movements.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).toArray(),
    movements.countDocuments(filter),
    movements.aggregate<{ _id: StockMovementKind; count: number; amount: number }>([
      { $match: filter },
      { $group: { _id: "$kind", count: { $sum: 1 }, amount: { $sum: { $abs: { $ifNull: ["$amount", 0] } } } } },
    ]).toArray(),
  ]);

  const summary: StockHistorySummaryRow[] = KINDS.map((k) => {
    const g = grouped.find((x) => x._id === k);
    return { kind: k, count: g?.count ?? 0, amount: Math.round((g?.amount ?? 0) * 100) / 100 };
  });
  res.status(200).json({ movements: await enrich(rows), total, summary });
}
