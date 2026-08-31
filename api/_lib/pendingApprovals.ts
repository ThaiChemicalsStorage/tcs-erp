import type { VercelRequest, VercelResponse } from "@vercel/node";
import { HttpError } from "./http.js";
import { requireUser, type AuthContext } from "./auth.js";
import {
  quotesCollection, scopeOfWorksCollection, deliveryOrdersCollection,
  materialRequisitionsCollection, jobOrdersCollection, purchaseRequestsCollection,
  purchaseOrdersCollection, productionOrdersCollection, costControlsCollection,
  productRequestsCollection,
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
 * ใบเสนอราคา — หมวดเดียวที่รู้**เวลาที่กดส่งขออนุมัติจริง** เพราะมันเก็บ `approvalHistory` ไว้
 * รายการ `submitted` ล่าสุดคือเวลาที่ต้องการพอดี ไม่ต้องเดาจาก `updatedAt` เหมือนอีก 9 หมวด
 * (และใบเสนอราคาไม่มี `updatedAt` ให้เดาด้วยซ้ำ)
 */
async function quotations(): Promise<PendingApprovalItem[]> {
  const col = await quotesCollection();
  const docs = await col.find({ ...notDeleted, status: PENDING_QUOTATION } as never, { limit: PER_KIND_LIMIT }).toArray();
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
  const docs = await col.find({ ...notDeleted, status: PENDING_SHARED } as never, { sort: SORT_OLDEST_FIRST, limit: PER_KIND_LIMIT }).toArray();
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
  const docs = await col.find({ ...notDeleted, status: PENDING_SHARED } as never, { sort: SORT_OLDEST_FIRST, limit: PER_KIND_LIMIT }).toArray();
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
  const docs = await col.find({ ...notDeleted, status: PENDING_SHARED } as never, { sort: SORT_OLDEST_FIRST, limit: PER_KIND_LIMIT }).toArray();
  return docs.map((d) => ({
    kind: "materialRequisition" as const,
    id: d._id.toString(),
    docNumber: d._id.toString(),
    party: d.customerName ?? "",
    lineage: d.jobCode ?? "",
    submittedBy: d.responsibleEmployee ?? "",
    waitingSince: isoOf(d),
    // เอกสารเก่าไม่มีฟิลด์นี้ ถือเป็นของฝ่ายโครงการ — ตรงกับ handler ของหน้ารายการ
    ownerDepartment: d.ownerDepartment === "production" ? ("production" as const) : ("project" as const),
  }));
}

async function jobOrders(): Promise<PendingApprovalItem[]> {
  const col = await jobOrdersCollection();
  const docs = await col.find({ ...notDeleted, status: PENDING_SHARED } as never, { sort: SORT_OLDEST_FIRST, limit: PER_KIND_LIMIT }).toArray();
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
  const docs = await col.find({ ...notDeleted, status: PENDING_SHARED } as never, { sort: SORT_OLDEST_FIRST, limit: PER_KIND_LIMIT }).toArray();
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
  const docs = await col.find({ ...notDeleted, status: PENDING_SHARED } as never, { sort: SORT_OLDEST_FIRST, limit: PER_KIND_LIMIT }).toArray();
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
  const docs = await col.find({ ...notDeleted, status: PENDING_SHARED } as never, { sort: SORT_OLDEST_FIRST, limit: PER_KIND_LIMIT }).toArray();
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
  const docs = await col.find({ ...notDeleted, status: PENDING_SHARED } as never, { sort: SORT_OLDEST_FIRST, limit: PER_KIND_LIMIT }).toArray();
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
  const docs = await col.find({ ...notDeleted, status: PENDING_PRODUCT_REQUEST } as never, { sort: SORT_OLDEST_FIRST, limit: PER_KIND_LIMIT }).toArray();
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

/** หมวด → สิทธิ์ที่ทำให้ "อนุมัติได้" + ตัวดึงข้อมูล */
const KINDS: { kind: PendingApprovalKind; permission: Permission; run: () => Promise<PendingApprovalItem[]> }[] = [
  { kind: "quotation", permission: "quotations:approve", run: quotations },
  { kind: "scopeOfWork", permission: "scopeOfWork:finalize", run: scopeOfWorks },
  { kind: "deliveryOrder", permission: "deliveryOrder:finalize", run: deliveryOrders },
  { kind: "materialRequisition", permission: "materialRequisition:finalize", run: materialRequisitions },
  { kind: "jobOrder", permission: "jobOrder:finalize", run: jobOrders },
  { kind: "purchaseRequest", permission: "purchaseRequest:finalize", run: purchaseRequests },
  { kind: "purchaseOrder", permission: "purchaseOrder:finalize", run: purchaseOrders },
  { kind: "productionOrder", permission: "productionOrder:finalize", run: productionOrders },
  { kind: "costControl", permission: "costControl:finalize", run: costControls },
  { kind: "productRequest", permission: "productRequest:review", run: productRequests },
];

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

export async function handlePendingApprovals(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
  // ไม่มีสิทธิ์เฉพาะของหน้านี้ — ใครมีสิทธิ์อนุมัติอะไรก็เห็นอันนั้น ไม่มีเลยก็ได้รายการว่าง
  const ctx = await requireUser(req);
  res.status(200).json({ items: await collectPendingApprovals(ctx) });
}
