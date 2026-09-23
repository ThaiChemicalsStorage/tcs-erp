import type { ApiRequest, ApiResponse } from "./httpTypes.js";
import { HttpError } from "./http.js";
import { requireUser, type AuthContext } from "./auth.js";
import {
  quotesCollection, scopeOfWorksCollection, deliveryOrdersCollection,
  materialRequisitionsCollection, jobOrdersCollection, purchaseRequestsCollection,
  purchaseOrdersCollection, productionOrdersCollection, costControlsCollection,
  productRequestsCollection, storeReceiptsCollection,
} from "./collections.js";
import { roleHasPermission } from "../../src/lib/roles.js";
import type { Permission } from "../../src/lib/permissions.js";
import type { PendingApprovalKind, PendingApprovalItem } from "../../src/lib/pendingApprovals.js";

/**
 * หน้ารวม "เอกสารรออนุมัติ" ทุกแผนก (2026-08-31) — เจ้าของขอไว้ 2026-08-28:
 * *"เพิ่มหน้าเอกสารรออนุมัติทุกอย่าง เพราะแบบเฮดคนนึงต้องอนุมัติหลายแผนก"*
 *
 * **กล่องนี้ตอบคำถามว่า "อะไรรอ*ฉัน*อยู่" ไม่ใช่ "อะไรรออนุมัติในระบบ"** — แต่ละหมวดจึงเปิดด้วย
 * **สิทธิ์อนุมัติ** ของเอกสารนั้น (`*:finalize` / `quotations:approve` / `productRequest:review`)
 * ไม่ใช่สิทธิ์ดู คนที่ดูใบได้แต่กดอนุมัติไม่ได้ ไม่ควรเห็นรายการที่ตัวเองทำอะไรไม่ได้ในกล่องงานเข้า
 *
 * **สถานะ "รออนุมัติ" ในระบบนี้มีสามคำ ไม่ใช่คำเดียว** เพราะสามโมดูลถูกสร้างคนละช่วงเวลา:
 *   - `"PendingApproval"` — เอกสาร 8 ใบ (6 ใบบนเครื่องอนุมัติร่วม + Scope of Work + ใบส่งมอบ)
 *   - `"รออนุมัติ"`        — ใบเสนอราคา ซึ่งเก็บสถานะเป็นภาษาไทย
 *   - `"Pending"`         — คำขอเพิ่มสินค้า
 * การรวมคำพวกนี้ให้เป็นคำเดียวคือการ migrate ข้อมูลทั้งระบบ จึงแปลที่ชั้นนี้แทน — หน้าจอเห็นคำเดียว
 *
 * ลอกรูปแบบ fan-out มาจาก `searchDocuments.ts` ตรง ๆ: ฟังก์ชันต่อ collection + ตัวห่อที่กันสิทธิ์
 * และกัน error รายหมวด (หมวดหนึ่งพังต้องไม่ทำให้ทั้งหน้าว่าง) และใช้ผลลัพธ์รูปเดียวกันทุกหมวด
 * เพื่อให้หน้าจอ render แถวแบบเดียว
 *
 * ⚠️ **9 ใน 10 หมวดไม่มีฟิลด์ `submittedAt`** — ไม่มีเอกสารใบไหนบันทึกเวลาที่กดส่งขออนุมัติ
 * `waitingSince` ของหมวดพวกนั้นจึงเป็น `updatedAt` ซึ่ง**ใกล้เคียง**เพราะการกดส่งเป็นการเขียน
 * ครั้งล่าสุดของใบที่รออยู่ แต่จะเพี้ยนถ้าเอกสารถูกแก้หลังส่ง (ซึ่งส่วนใหญ่ล็อกไว้แล้วตอนรออนุมัติ)
 * ข้อยกเว้นคือ**ใบเสนอราคา** ที่เก็บ `approvalHistory` ไว้ จึงรู้เวลากดส่งจริง
 * การเก็บเวลาส่งจริงของอีก 9 หมวด ต้องเพิ่มฟิลด์ที่เครื่องอนุมัติร่วมเขียนตอน submit — จดไว้ใน TODO.md แล้ว
 */

/** สถานะที่นับว่า "รออนุมัติ" ของแต่ละกลุ่มเอกสาร */
const PENDING_SHARED = "PendingApproval";
const PENDING_QUOTATION = "รออนุมัติ";
const PENDING_PRODUCT_REQUEST = "Pending";

function isoOf(doc: { updatedAt?: unknown; createdAt?: unknown }): string {
  const raw = doc.updatedAt ?? doc.createdAt ?? "";
  if (raw instanceof Date) return raw.toISOString();
  return typeof raw === "string" ? raw : "";
}

/**
 * เอกสารที่รออนุมัติแสดง**ทุกใบที่ผู้อนุมัติกดได้** ไม่กรองด้วยความเป็นเจ้าของ
 *
 * ต่างจาก `searchDocuments.ts` โดยตั้งใจ: ที่นั่นการค้นต้องไม่โผล่ใบที่หน้ารายการซ่อนไว้ แต่ที่นี่
 * ผู้ใช้ถือสิทธิ์**อนุมัติ**ใบชนิดนั้นอยู่แล้ว ซึ่งเป็นสิทธิ์ที่แรงกว่า "ดูของคนอื่น" — และถ้ากรองด้วย
 * `createdBy` กล่องนี้จะแสดงเฉพาะใบที่ผู้อนุมัติเขียนเอง ซึ่งตรงข้ามกับสิ่งที่เจ้าของขอมาทั้งหมด
 */
const notDeleted = { isDeleted: false } as const;
const SORT_OLDEST_FIRST = { updatedAt: 1 } as const;

/** จำนวนสูงสุดต่อหมวด — กันหน้าจอระเบิดถ้าวันหนึ่งมีใบค้างเป็นพัน */
const PER_KIND_LIMIT = 100;

/**
 * เงื่อนไข "รออนุมัติ" ของแต่ละกลุ่ม — ที่เดียว ใช้ทั้งตอนดึงรายการ (`collectPendingApprovals`) และตอนนับ
 * (`countPendingApprovals` ของแดชบอร์ด 2026-09-14) เพื่อให้ตัวเลขบนแดชบอร์ดไม่มีทางต่างจากกล่องงานเข้า
 */
const SHARED_PENDING_FILTER = { ...notDeleted, status: PENDING_SHARED } as const;
const PRODUCT_REQUEST_PENDING_FILTER = { ...notDeleted, status: PENDING_PRODUCT_REQUEST } as const;
/**
 * **ใบเสนอราคาไม่มีฟิลด์ `isDeleted` เลย** (ดูคอมเมนต์ใน api/dashboard/index.ts — ไม่มีการลบแบบ soft
 * delete สำหรับใบเสนอราคา) · เดิมใช้ `isDeleted: false` เหมือนหมวดอื่น ซึ่งไม่ตรงกับเอกสารที่ไม่มีฟิลด์นั้น
 * ใบเสนอราคาที่รออนุมัติจริงจึงไม่เคยขึ้นในกล่องนี้ (มีแต่ในเทสต์ที่ใส่ `isDeleted: false` ไว้เอง)
 * แก้ 2026-09-14 เป็น `$ne: true` — ยังกันใบที่อาจถูกทำเครื่องหมายลบในอนาคตได้เหมือนเดิม
 */
const QUOTATION_PENDING_FILTER = { isDeleted: { $ne: true }, status: PENDING_QUOTATION } as const;

/**
 * ใบเสนอราคา — หมวดเดียวที่รู้**เวลาที่กดส่งขออนุมัติจริง** เพราะมันเก็บ `approvalHistory` ไว้
 * รายการ `submitted` ล่าสุดคือเวลาที่ต้องการพอดี ไม่ต้องเดาจาก `updatedAt` เหมือนอีก 9 หมวด
 * (และใบเสนอราคาไม่มี `updatedAt` ให้เดาด้วยซ้ำ)
 */
async function quotations(): Promise<PendingApprovalItem[]> {
  const col = await quotesCollection();
  const docs = await col.find(QUOTATION_PENDING_FILTER as never, { limit: PER_KIND_LIMIT }).toArray();
  return docs.map((d) => {
    const submitted = [...(d.approvalHistory ?? [])].reverse().find((h) => h.action === "submitted");
    return {
      kind: "quotation" as const,
      id: d._id.toString(),
      docNumber: d._id.toString(),
      party: d.customerSnapshot?.companyName || d.client || "",
      lineage: d.project ?? "",
      submittedBy: d.salesperson ?? "",
      waitingSince: submitted?.createdAt || d.issueDate || d.date || "",
    };
  });
}

async function scopeOfWorks(): Promise<PendingApprovalItem[]> {
  const col = await scopeOfWorksCollection();
  const docs = await col.find(SHARED_PENDING_FILTER as never, { sort: SORT_OLDEST_FIRST, limit: PER_KIND_LIMIT }).toArray();
  return docs.map((d) => ({
    kind: "scopeOfWork" as const,
    id: d._id.toString(),
    docNumber: d.scopeNumber ?? "",
    party: d.customerSnapshot?.companyName ?? "",
    lineage: d.quotationId ?? "",
    submittedBy: "",
    waitingSince: isoOf(d),
  }));
}

async function deliveryOrders(): Promise<PendingApprovalItem[]> {
  const col = await deliveryOrdersCollection();
  const docs = await col.find(SHARED_PENDING_FILTER as never, { sort: SORT_OLDEST_FIRST, limit: PER_KIND_LIMIT }).toArray();
  return docs.map((d) => ({
    kind: "deliveryOrder" as const,
    id: d._id.toString(),
    docNumber: d.scopeNumber ?? "",
    party: d.customerCompanyName ?? "",
    lineage: d.quotationId ?? "",
    submittedBy: "",
    waitingSince: isoOf(d),
  }));
}

async function materialRequisitions(): Promise<PendingApprovalItem[]> {
  const col = await materialRequisitionsCollection();
  const docs = await col.find(SHARED_PENDING_FILTER as never, { sort: SORT_OLDEST_FIRST, limit: PER_KIND_LIMIT }).toArray();
  return docs.map((d) => ({
    kind: "materialRequisition" as const,
    id: d._id.toString(),
    docNumber: d._id.toString(),
    party: d.customerName ?? "",
    lineage: d.jobCode ?? "",
    submittedBy: d.responsibleEmployee ?? "",
    waitingSince: isoOf(d),
    // เอกสารเก่าไม่มีฟิลด์นี้ ถือเป็นของฝ่ายโครงการ — ตรงกับ handler ของหน้ารายการ
    ownerDepartment: d.ownerDepartment === "production" ? ("production" as const) : d.ownerDepartment === "store" ? ("store" as const) : ("project" as const),
  }));
}

/** ใบรับคืน/รับเข้าคลังของสโตร์ (2026-09-23) — อนุมัติด้วยสิทธิ์เดียวกับใบเบิก */
async function storeReceipts(): Promise<PendingApprovalItem[]> {
  const col = await storeReceiptsCollection();
  const docs = await col.find(SHARED_PENDING_FILTER as never, { sort: SORT_OLDEST_FIRST, limit: PER_KIND_LIMIT }).toArray();
  return docs.map((d) => ({
    kind: "storeReceipt" as const,
    id: d._id.toString(),
    docNumber: d.documentNumber || d._id.toString(),
    party: d.customerName ?? "",
    lineage: d.jobCode || d.sourceRequisitionNumber || d.reference || "",
    submittedBy: d.preparedBy ?? "",
    waitingSince: isoOf(d),
  }));
}

async function jobOrders(): Promise<PendingApprovalItem[]> {
  const col = await jobOrdersCollection();
  const docs = await col.find(SHARED_PENDING_FILTER as never, { sort: SORT_OLDEST_FIRST, limit: PER_KIND_LIMIT }).toArray();
  return docs.map((d) => ({
    kind: "jobOrder" as const,
    id: d._id.toString(),
    docNumber: d._id.toString(),
    party: d.customerName ?? "",
    lineage: d.jobCode ?? "",
    submittedBy: "",
    waitingSince: isoOf(d),
  }));
}

async function purchaseRequests(): Promise<PendingApprovalItem[]> {
  const col = await purchaseRequestsCollection();
  const docs = await col.find(SHARED_PENDING_FILTER as never, { sort: SORT_OLDEST_FIRST, limit: PER_KIND_LIMIT }).toArray();
  return docs.map((d) => ({
    kind: "purchaseRequest" as const,
    id: d._id.toString(),
    docNumber: d._id.toString(),
    party: d.requestedBy ?? "",
    lineage: d.jobCode ?? "",
    submittedBy: d.requestedBy ?? "",
    waitingSince: isoOf(d),
    ownerDepartment: d.ownerDepartment === "production" ? ("production" as const)
      : d.ownerDepartment === "general" ? ("general" as const) : ("project" as const),
  }));
}

async function purchaseOrders(): Promise<PendingApprovalItem[]> {
  const col = await purchaseOrdersCollection();
  const docs = await col.find(SHARED_PENDING_FILTER as never, { sort: SORT_OLDEST_FIRST, limit: PER_KIND_LIMIT }).toArray();
  return docs.map((d) => ({
    kind: "purchaseOrder" as const,
    id: d._id.toString(),
    docNumber: d.documentNumber || d._id.toString(),
    party: d.vendorName ?? "",
    lineage: d.jobCode || d.purchaseRequestId || "",
    submittedBy: d.orderedBy ?? "",
    waitingSince: isoOf(d),
  }));
}

async function productionOrders(): Promise<PendingApprovalItem[]> {
  const col = await productionOrdersCollection();
  const docs = await col.find(SHARED_PENDING_FILTER as never, { sort: SORT_OLDEST_FIRST, limit: PER_KIND_LIMIT }).toArray();
  return docs.map((d) => ({
    kind: "productionOrder" as const,
    id: d._id.toString(),
    docNumber: d.documentNumber || d._id.toString(),
    party: d.customerCompanyName ?? "",
    lineage: d.jobCode ?? "",
    submittedBy: d.supervisorName ?? "",
    waitingSince: isoOf(d),
  }));
}

async function costControls(): Promise<PendingApprovalItem[]> {
  const col = await costControlsCollection();
  const docs = await col.find(SHARED_PENDING_FILTER as never, { sort: SORT_OLDEST_FIRST, limit: PER_KIND_LIMIT }).toArray();
  return docs.map((d) => ({
    kind: "costControl" as const,
    id: d._id.toString(),
    docNumber: d.documentNumber || d._id.toString(),
    party: d.jobName ?? "",
    lineage: d.jobOrder ?? "",
    submittedBy: d.submittedBy ?? "",
    waitingSince: isoOf(d),
  }));
}

async function productRequests(): Promise<PendingApprovalItem[]> {
  const col = await productRequestsCollection();
  const docs = await col.find(PRODUCT_REQUEST_PENDING_FILTER as never, { sort: SORT_OLDEST_FIRST, limit: PER_KIND_LIMIT }).toArray();
  return docs.map((d) => ({
    kind: "productRequest" as const,
    // คำขอได้รหัสสินค้าก็ต่อเมื่ออนุมัติแล้ว ใบที่รออยู่จึงไม่มีเลขที่เสมอ — ชื่อสินค้าเป็นตัวระบุแทน
    docNumber: "",
    id: d._id.toString(),
    party: d.name ?? "",
    lineage: "",
    submittedBy: d.requestedByName ?? "",
    waitingSince: isoOf(d),
  }));
}

/** นับใบที่ตรงเงื่อนไข — ไม่มีเพดาน 100 ใบแบบรายการ */
const countWhere = (collection: () => Promise<{ countDocuments(filter: never): Promise<number> }>, filter: object) =>
  async () => (await collection()).countDocuments(filter as never);

/** หมวด → สิทธิ์ที่ทำให้ "อนุมัติได้" + ตัวดึงข้อมูล + ตัวนับ (เงื่อนไขเดียวกัน) */
const KINDS: { kind: PendingApprovalKind; permission: Permission; run: () => Promise<PendingApprovalItem[]>; count: () => Promise<number> }[] = [
  { kind: "quotation", permission: "quotations:approve", run: quotations, count: countWhere(quotesCollection, QUOTATION_PENDING_FILTER) },
  { kind: "scopeOfWork", permission: "scopeOfWork:finalize", run: scopeOfWorks, count: countWhere(scopeOfWorksCollection, SHARED_PENDING_FILTER) },
  { kind: "deliveryOrder", permission: "deliveryOrder:finalize", run: deliveryOrders, count: countWhere(deliveryOrdersCollection, SHARED_PENDING_FILTER) },
  { kind: "materialRequisition", permission: "materialRequisition:finalize", run: materialRequisitions, count: countWhere(materialRequisitionsCollection, SHARED_PENDING_FILTER) },
  { kind: "storeReceipt", permission: "materialRequisition:finalize", run: storeReceipts, count: countWhere(storeReceiptsCollection, SHARED_PENDING_FILTER) },
  { kind: "jobOrder", permission: "jobOrder:finalize", run: jobOrders, count: countWhere(jobOrdersCollection, SHARED_PENDING_FILTER) },
  { kind: "purchaseRequest", permission: "purchaseRequest:finalize", run: purchaseRequests, count: countWhere(purchaseRequestsCollection, SHARED_PENDING_FILTER) },
  { kind: "purchaseOrder", permission: "purchaseOrder:finalize", run: purchaseOrders, count: countWhere(purchaseOrdersCollection, SHARED_PENDING_FILTER) },
  { kind: "productionOrder", permission: "productionOrder:finalize", run: productionOrders, count: countWhere(productionOrdersCollection, SHARED_PENDING_FILTER) },
  { kind: "costControl", permission: "costControl:finalize", run: costControls, count: countWhere(costControlsCollection, SHARED_PENDING_FILTER) },
  { kind: "productRequest", permission: "productRequest:review", run: productRequests, count: countWhere(productRequestsCollection, PRODUCT_REQUEST_PENDING_FILTER) },
];

/**
 * จำนวนใบรออนุมัติต่อหมวด เฉพาะหมวดที่ผู้ใช้อนุมัติได้ (2026-09-14 — แท็บภาพรวมของแดชบอร์ด)
 *
 * กติกาสิทธิ์และเงื่อนไข "รออนุมัติ" เดียวกับ `collectPendingApprovals` ทุกข้อ · หมวดที่นับพังถูกตัดออก
 * เงียบ ๆ แบบเดียวกับ `runKind` แทนที่จะทำให้ทั้งกล่องหาย
 */
export async function countPendingApprovals(ctx: AuthContext): Promise<{ kind: PendingApprovalKind; count: number }[]> {
  const rows = await Promise.all(
    KINDS.filter((k) => roleHasPermission(ctx.role, k.permission)).map(async (k) => {
      try {
        return { kind: k.kind, count: await k.count() };
      } catch (err) {
        console.error(`[pending-approvals] count "${k.kind}" failed`, err);
        return null;
      }
    }),
  );
  return rows.filter((r): r is { kind: PendingApprovalKind; count: number } => r !== null);
}

/** หมวดหนึ่งพังต้องไม่ทำให้ทั้งหน้าว่าง — แนวเดียวกับ `runCategory` ของ Global Search */
async function runKind(
  kind: PendingApprovalKind, allowed: boolean, run: () => Promise<PendingApprovalItem[]>,
): Promise<PendingApprovalItem[]> {
  if (!allowed) return [];
  try {
    return await run();
  } catch (err) {
    console.error(`[pending-approvals] kind "${kind}" failed`, err);
    return [];
  }
}

export async function collectPendingApprovals(ctx: AuthContext): Promise<PendingApprovalItem[]> {
  const groups = await Promise.all(
    KINDS.map((k) => runKind(k.kind, roleHasPermission(ctx.role, k.permission), k.run)),
  );
  // เก่าสุดขึ้นก่อน — ใบที่รอมานานที่สุดคือใบที่ควรได้รับการตัดสินใจก่อน
  return groups.flat().sort((a, b) => a.waitingSince.localeCompare(b.waitingSince));
}

export async function handlePendingApprovals(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
  // ไม่มีสิทธิ์เฉพาะของหน้านี้ — ใครมีสิทธิ์อนุมัติอะไรก็เห็นอันนั้น ไม่มีเลยก็ได้รายการว่าง
  const ctx = await requireUser(req);
  res.status(200).json({ items: await collectPendingApprovals(ctx) });
}
