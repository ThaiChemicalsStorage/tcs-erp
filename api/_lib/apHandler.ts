import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ObjectId } from "mongodb";
import { HttpError, getPathSegments } from "./http.js";
import { requireUser, requirePermission } from "./auth.js";
import { apEntriesCollection, auditLogCollection, toObjectId, withStringId } from "./collections.js";
import { nowIso } from "../../src/lib/products.js";
import { sanitizeShortText } from "./quoteValidation.js";
import type { ApEntry, ApRegisterSummary, ApVendorSummaryRow } from "../../src/lib/apEntries.js";

/**
 * ทะเบียนเจ้าหนี้ + ทะเบียนภาษีซื้อ API — added 2026-09-03 กับใบรับสินค้าของแผนกสโตร์
 *
 * **อ่านอย่างเดียวเป็นหลัก** ไม่มี route สร้างหนี้ด้วยมือโดยตั้งใจ — ทุกแถวเกิดจาก
 * `POST /api/receiving-reports/:id/receipts` เท่านั้น ถ้าเปิดให้บัญชีพิมพ์หนี้เองได้ ทะเบียนกับ
 * สต๊อกจะเดินคนละทางทันที และไม่มีทางรู้ว่ายอดไหนคือของจริง
 *
 * บัญชีแก้ได้อย่างเดียวคือ **สถานะจ่าย/ยังไม่จ่าย** พร้อมเลขอ้างอิงการจ่าย ยอดเงินแก้ไม่ได้ —
 * ยอดผิดต้องไปยกเลิกรอบการรับที่ใบรับสินค้า ซึ่งย้อนทั้งสต๊อกและหนี้ให้พร้อมกัน
 */

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function toClient(doc: { _id: ObjectId } & Record<string, unknown>): ApEntry {
  return withStringId(doc) as unknown as ApEntry;
}

function readMonth(req: VercelRequest, required: boolean): string {
  const month = typeof req.query.month === "string" ? req.query.month.trim() : "";
  if (!month) {
    if (required) throw new HttpError(400, "กรุณาระบุเดือน (YYYY-MM)");
    return "";
  }
  if (!MONTH_PATTERN.test(month)) throw new HttpError(400, "เดือนต้องอยู่ในรูปแบบ YYYY-MM");
  return month;
}

/**
 * กรองเดือนจาก `invoiceDate` (วันที่ใบกำกับ) ไม่ใช่วันที่ตั้งหนี้ — รายงานภาษีซื้อยึดเดือนของ
 * ใบกำกับภาษีเสมอ ใบกำกับลงวันที่สิ้นเดือนแต่มาถึงเราต้นเดือนถัดไปเป็นเรื่องปกติ
 *
 * เทียบเป็นช่วง `>= "YYYY-MM-01"` และ `< เดือนถัดไป` แทนการใช้ regex กับค่าจากผู้ใช้ — ใช้ index
 * ปกติได้ และไม่ต้องกังวลเรื่อง regex ที่หลุดมาจาก query string
 */
function monthRange(month: string): { $gte: string; $lt: string } {
  const [y, m] = month.split("-").map(Number);
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  return { $gte: `${month}-01`, $lt: `${String(nextY).padStart(4, "0")}-${String(nextM).padStart(2, "0")}-01` };
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
  await requirePermission(req, "ap:view");
  const month = readMonth(req, false);
  const vendor = typeof req.query.vendor === "string" ? req.query.vendor.trim() : "";
  const status = req.query.status === "Paid" || req.query.status === "Unpaid" ? req.query.status : "";

  const apEntries = await apEntriesCollection();
  const docs = await apEntries
    .find({
      ...(month ? { invoiceDate: monthRange(month) } : {}),
      ...(vendor ? { vendorName: vendor } : {}),
      ...(status ? { status } : {}),
    })
    .sort({ invoiceDate: 1, postedAt: 1 })
    .toArray();
  res.status(200).json({ apEntries: docs.map(toClient) });
}

/** ยอดรวมของเดือน + ยอดค้างต่อผู้ขาย — ท้ายตารางทะเบียนภาษีซื้อ และหัวตารางทะเบียนเจ้าหนี้ */
async function handleSummary(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
  await requirePermission(req, "ap:view");
  const month = readMonth(req, true);

  const apEntries = await apEntriesCollection();
  const docs = await apEntries.find({ invoiceDate: monthRange(month) }).toArray();

  const byVendor = new Map<string, ApVendorSummaryRow>();
  let subtotal = 0;
  let vatAmt = 0;
  let total = 0;
  let unpaidTotal = 0;
  for (const d of docs) {
    subtotal += d.subtotal;
    vatAmt += d.vatAmt;
    total += d.total;
    if (d.status !== "Paid") unpaidTotal += d.total;
    const key = d.vendorName || "(ไม่ระบุผู้ขาย)";
    const row = byVendor.get(key) ?? { vendorName: key, entryCount: 0, unpaidTotal: 0, paidTotal: 0 };
    row.entryCount += 1;
    if (d.status === "Paid") row.paidTotal += d.total;
    else row.unpaidTotal += d.total;
    byVendor.set(key, row);
  }

  const summary: ApRegisterSummary = {
    month,
    subtotal: Math.round(subtotal * 100) / 100,
    vatAmt: Math.round(vatAmt * 100) / 100,
    total: Math.round(total * 100) / 100,
    unpaidTotal: Math.round(unpaidTotal * 100) / 100,
    vendors: [...byVendor.values()].sort((a, b) => b.unpaidTotal - a.unpaidTotal),
  };
  res.status(200).json({ summary });
}

async function handleUpdate(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "PATCH") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "ap:manage");
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (body.status !== "Paid" && body.status !== "Unpaid") throw new HttpError(400, "สถานะไม่ถูกต้อง");
  const paymentRef = sanitizeShortText(body.paymentRef, "เลขที่อ้างอิงการจ่าย");

  const apEntries = await apEntriesCollection();
  const objectId = toObjectId(id);
  const doc = await apEntries.findOne({ _id: objectId });
  if (!doc) throw new HttpError(404, "ไม่พบรายการตั้งหนี้");

  const paid = body.status === "Paid";
  await apEntries.updateOne({ _id: objectId }, {
    $set: {
      status: paid ? "Paid" : "Unpaid",
      // ยกเลิกการจ่าย = ล้างร่องรอยการจ่ายทั้งชุด ไม่ทิ้งวันที่/ผู้จ่ายเก่าไว้ให้อ่านผิดว่ายังจ่ายอยู่
      paidAt: paid ? nowIso() : "",
      paidBy: paid ? ctx.user.id : "",
      paymentRef: paid ? paymentRef : "",
    },
  });

  const auditLog = await auditLogCollection();
  await auditLog.insertOne({
    userId: ctx.user.id, userName: ctx.user.fullName, roleName: ctx.role?.name ?? ctx.user.roleKey,
    module: "ทะเบียนเจ้าหนี้",
    action: paid ? "AP Entry Marked Paid" : "AP Entry Payment Cleared",
    details: `${paid ? "บันทึกจ่าย" : "ยกเลิกการจ่าย"} ${doc.vendorName} ใบกำกับ ${doc.invoiceNumber} ยอด ${doc.total.toLocaleString("en-US")} บาท${paid && paymentRef ? ` (อ้างอิง ${paymentRef})` : ""}`,
    createdAt: nowIso(),
  });

  const updated = await apEntries.findOne({ _id: objectId });
  res.status(200).json({ apEntry: toClient(updated!) });
}

export async function handleApEntries(req: VercelRequest, res: VercelResponse): Promise<void> {
  await requireUser(req);
  const parts = getPathSegments(req, "/api/ap-entries");

  if (parts.length === 0) return handleList(req, res);
  if (parts.length === 1) {
    if (parts[0] === "summary") return handleSummary(req, res);
    return handleUpdate(req, res, parts[0]);
  }
  throw new HttpError(404, "Not found");
}
