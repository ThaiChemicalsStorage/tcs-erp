import { apiFetch, writeQuery, type WriteOptions } from "./apiClient.js";
import type { DocumentAttachment } from "./documentAttachments.js";
import { uploadDocumentAttachment, deleteDocumentAttachment, fileToBase64 } from "./documentAttachments.js";

/**
 * Purchase Request (form FMPU05 Rev.02, printed footer reads "FM-PU-05") — added 2026-08-18.
 * Reproduces the printed structure of public/reference/-ED6908027.pdf (a real filled example) — sent
 * to Procurement when a Project item isn't in the store catalog and can't be made in-house (incl.
 * outsourced work). The real example's header is explicitly labeled "(ฝ่ายโครงการ)" —
 * "(Project department)" — confirming this is requested BY Project, and its remark field carried the
 * job code (e.g. "PQ202605-120-SC-SK"), confirming the job-code tie shown here.
 */

export type PurchaseRequestStatus = "Draft" | "PendingApproval" | "Final";

export interface PurchaseRequestLine {
  id: string;
  /** -> Product.id. Optional — the real example line (RM-1915) *was* a catalog code shared with
   * Material Requisition's item master, but a PR line can also be a one-off item with no catalog
   * entry, so this stays optional unlike MaterialRequisitionLine.productId. */
  productId: string;
  productCode: string;
  /** "รายละเอียด" — free-typed if productId is unset. */
  description: string;
  unit: string;
  /** "คลัง คงเหลือ" — informational only, manually typed. No live-inventory integration this stage
   * (confirmed — see Stage 2 decisions in conversation, 2026-08-18); revisit once/if a real
   * Inventory/Warehouse module exists (docs/CLAUDE.md's long-term charter). */
  warehouseRemainingQty: string;
  /** "จำนวนขอซื้อ" */
  qtyRequested: number | null;
  /** "วันต้องการ" */
  neededByDate: string;
  /** "แผนก" — cost-center/department code printed on the real example (e.g. "G120"). */
  departmentCode: string;
  /** free-typed cost-center reference, distinct from departmentCode — kept separate since the real
   * example only showed one code column; split out defensively in case Purchasing tracks both a
   * requesting-department code and a distinct cost/job code. Revisit once a real filled multi-line PR
   * is available to confirm whether this is actually a second, distinct field. */
  costCode: string;
  /**
   * บรรทัดรายละเอียดย่อยใต้รายการหลัก — พิมพ์เยื้องเข้ามาใต้คำอธิบาย (ฝ่ายโครงการขอไว้ 2026-08-27:
   * "ใบขอซื้อสามารถเพิ่มรายละเอียดย่อย") ใช้รูปแบบเดียวกับ ProductionOrderLine.subDetails ทุกประการ
   * คือ string[] ธรรมดา ไม่ใช่ SubDetail[] แบบใบเสนอราคา เพราะที่นี่ไม่ต้องลากสลับลำดับ
   * บรรทัดว่างถูกตัดทิ้งฝั่งเซิร์ฟเวอร์ เอกสารเก่าที่ไม่มีฟิลด์นี้อ่านออกมาเป็น [] เสมอ
   */
  subDetails: string[];
  /**
   * ⚠️ **`estimatedCost` (ราคาประเมิน) ถูกถอดออกเมื่อ 2026-09-21** ตามคำสั่งเจ้าของ *"ราคาประเมิน
   * ในใบ PR เอาออก"* — ราคาเป็นเรื่องของฝ่ายจัดซื้อ คนขอซื้อไม่ใช่คนตั้งราคา และใบจริง FM-PU-05
   * ก็เว้นคอลัมน์นั้นไว้ให้จัดซื้อเขียนเอง (ดู `PurchaseRequestPrintDocument.tsx`)
   *
   * ใบสั่งซื้อเคยรับค่านี้ไปเป็น `unitPrice` ตอนสร้าง ตอนนี้เริ่มที่ราคาว่างเสมอ
   * (`purchaseOrderHandler.ts` `handleCreate()`)
   *
   * **ค่าเก่าที่บันทึกไว้แล้วยังอยู่ในฐานข้อมูล ไม่ได้ลบ ไม่ได้ทำ migration** — แค่ไม่มีใครอ่านอีก
   * ใบไหนถูกบันทึกทับหลังวันนั้น `sanitizeLines()` จะประกอบบรรทัดใหม่โดยไม่มีฟิลด์นี้ ค่าจึงหลุดไปเอง
   * ทีละใบ ตั้งใจให้เป็นแบบนั้น ไม่ได้ไล่ลบย้อนหลัง (ดู docs/DATABASE.md)
   */
  /**
   * ผลการเช็คของของสโตร์ต่อบรรทัด (2026-09-09) — `"stock"` = มีของในคลัง สโตร์จ่ายให้เลย
   * `"purchase"` = ไม่มี ส่งต่อฝ่ายจัดซื้อ · `""`/ไม่มีค่า = ยังไม่ได้เช็ค
   *
   * ใบสั่งซื้อจะลอกไปเฉพาะบรรทัดที่ **ไม่ใช่** `"stock"` เพราะของนั้นออกจากคลังไปแล้ว ไม่ต้องซื้อซ้ำ
   */
  storeDecision?: "" | "stock" | "purchase";
  /** ยอดคงเหลือที่สโตร์เห็น ณ ตอนเช็ค — เก็บเป็นหลักฐานว่าตัดสินใจจากตัวเลขอะไร ต่างจาก
   *  `warehouseRemainingQty` ซึ่งเป็นช่องบนฟอร์มที่ผู้ขอพิมพ์เองตอนเขียนใบ */
  storeAvailableQty?: number | null;
}

/**
 * หนึ่งรอบที่สโตร์จ่ายของตามใบขอซื้อ (2026-09-09) — โครงเดียวกับ `MaterialIssueBatch` ของใบเบิกทุกประการ
 * ต่อท้ายอย่างเดียว แก้รอบเก่าไม่ได้ ยกเลิกได้เฉพาะรอบล่าสุด
 *
 * เจ้าของเลือกทางนี้เมื่อถูกถาม 2026-09-09 (จ่ายบนใบขอซื้อเลย) แทนการให้สโตร์ไปสร้างใบเบิกอีกใบจาก
 * รายการที่มีของ — เร็วกว่าสำหรับคนใช้งาน แลกกับการที่ของออกจากคลังผ่านเอกสารชนิดที่สองซึ่งไม่มีใบพิมพ์
 * และไม่มีช่องคืนของ (บันทึกเป็นข้อจำกัดไว้ใน docs/MODULES/Purchasing.md)
 */
export interface PurchaseRequestIssueBatch {
  id: string;
  /** ลำดับรอบ เริ่มที่ 1 */
  seq: number;
  issuedDate: string;
  lines: { lineId: string; qty: number }[];
  /** ชื่อผู้จ่ายที่พิมพ์เอง — ไม่ใช่ผู้ใช้ในระบบ */
  issuedBy: string;
  remark: string;
  postedAt: string;
  postedBy: string;
  postedByName: string;
  stockMovementIds: string[];
}

/**
 * ขั้นของสโตร์หลังใบขอซื้อได้รับอนุมัติ (2026-09-09) — ไหลงานที่เจ้าของสั่ง:
 * สร้างใบ → หัวหน้าฝ่ายอนุมัติ → **สโตร์เช็คของ** → มีของ = จ่ายจบ / ไม่มี = ส่งต่อจัดซื้อ
 *
 * - `"pending"` = อนุมัติแล้ว รอสโตร์เช็คของ (ออกใบสั่งซื้อยังไม่ได้)
 * - `"forwarded"` = สโตร์เช็คแล้วของไม่ครบ ส่งต่อจัดซื้อ (ออกใบสั่งซื้อได้)
 * - `"closed"` = ของมีครบและสโตร์จ่ายครบแล้ว ไม่ต้องซื้อ
 *
 * **ไม่มีค่า = ใบก่อน 2026-09-09** ซึ่งวิ่งตรงไปจัดซื้อตั้งแต่อนุมัติ — ด่านออกใบสั่งซื้อจึงปล่อยผ่าน
 * ใบที่ไม่มีฟิลด์นี้ ไม่ได้ทำ migration (แนวเดียวกับทุกฟิลด์ที่เพิ่มทีหลังในระบบนี้)
 *
 * เก็บเป็นฟิลด์ของใบขอซื้อเอง **ไม่ใช่สถานะที่ 4** — `ApprovableStatus` ใน
 * `api/_lib/documentApproval.ts` ใช้ร่วมกัน 6 เอกสาร การเพิ่มค่าเข้าไปคือการแก้ทุกเอกสาร ทุกแถบสถานะ
 * กล่องรออนุมัติ และเทสต์อีก 6 ไฟล์ เพื่อขั้นที่มีอยู่ในใบขอซื้อใบเดียว
 */
export type PurchaseRequestStoreStage = "pending" | "forwarded" | "closed";

/**
 * ขั้นของฝ่ายจัดซื้อบนใบขอซื้อ (2026-09-21) — เจ้าของแจ้งว่าใบที่อนุมัติแล้ว *"เป็น final แล้วทำอะไร
 * ไม่ได้เลย"* และสั่งว่าเมื่อใบมาถึงจัดซื้อต้อง *"เป็น draft ที่สามารถแก้ข้อมูลได้แล้วให้จัดซื้อแก้ไข
 * และอนุมัติ มันมีช่องเซ็นของจัดซื้อ"*
 *
 * - `"review"` = ใบมาถึงจัดซื้อแล้ว แก้ได้ทุกช่องเหมือนฉบับร่าง (ผ่านสิทธิ์ `purchaseRequest:editApproved`)
 * - `"approved"` = จัดซื้ออนุมัติแล้ว ลงชื่อในช่อง "ฝ่ายจัดซื้อ" และ**ล็อกทั้งใบ** · เป็นด่านของการเปิดใบสั่งซื้อ
 *
 * **ไม่มีค่า = ใบก่อน 2026-09-21** ด่านล็อกจึงต้องเช็ค `=== "approved"` ตรง ๆ **ห้ามเช็คว่า "ไม่ใช่ review"**
 * ไม่งั้นใบเก่าทุกใบจะถูกล็อกทันทีในวันที่ deploy · ด่านเปิดใบสั่งซื้อเขียนเป็น `!== "review"` ด้วยเหตุผล
 * กลับกัน คือให้ใบเก่าที่ไม่มีค่าผ่านไปได้เหมือนเดิม
 *
 * **เป็นฟิลด์ของเอกสาร ไม่ใช่สถานะที่ 4** ด้วยเหตุผลเดียวกับ `PurchaseRequestStoreStage` ทุกประการ —
 * `ApprovableStatus` ใน `api/_lib/documentApproval.ts` ใช้ร่วมกัน 6 เอกสาร · และต้อง**แยกขาดจาก**
 * `storeStage` ด้วย เพราะ `nextStoreStage()` คำนวณค่าใหม่จากผลติ๊กทุกบรรทัดทุกครั้งที่สโตร์กดเช็คของ
 * ถ้าเอามาปนกัน การเช็คของซ้ำจะรีเซ็ตขั้นของจัดซื้อทิ้ง
 */
export type PurchaseRequestPurchasingStage = "review" | "approved";

export interface PurchaseRequest {
  /** Human-readable business id (e.g. "PR-2569-0001"), intended to be stored directly as _id once
   * the API layer mints it (Stage 3) — a clean new prefix, NOT the real example's legacy "ED" scheme
   * (source/meaning of "ED" unconfirmed — see Stage 1 open questions in conversation). */
  id: string;
  projectId: string;
  /**
   * แผนกเจ้าของเอกสาร — ฝ่ายโครงการกับฝ่ายผลิตใช้เอกสารชนิดเดียวกันแต่ต่างคนต่างเห็นของตัวเอง
   * (ยืนยันกับเจ้าของ 2026-08-20). optional เพราะเอกสารที่บันทึกก่อนหน้านั้นไม่มีฟิลด์นี้ — อ่านแล้ว
   * normalize เป็น "project" เสมอ ไม่ได้ทำ migration
   */
  ownerDepartment?: "project" | "production" | "general";
  /** ใบสั่งผลิตต้นทาง — มีค่าเฉพาะเอกสารของฝ่ายผลิต (ฝั่งโครงการใช้ projectId แทน) */
  productionOrderId?: string;
  scopeOfWorkId: string;
  /** "หมายเหตุ" on the real example carried the job code (e.g. "PQ202605-120-SC-SK") — modeled here
   * as a real field rather than free-text remark. */
  jobCode: string;
  /**
   * ⚠️ **ผู้จำหน่าย / โทร.ผู้จำหน่าย / เครดิต / ขนส่งโดย ถูกถอดออกเมื่อ 2026-08-31**
   *
   * เจ้าของสั่งไว้ 2026-08-28: *"ใบขอซื้อไม่ต้องมีผู้จำหน่าย เครดิต ขนส่งโดย"* — และใบจริงที่
   * กรอกแล้ว (`ED6908038.pdf`) ก็ยืนยัน: ช่องพวกนั้นมีอยู่บนกระดาษแต่**เว้นว่างไว้ทั้งหมด**
   * เพราะคนขอซื้อไม่ใช่คนกรอก ฝ่ายจัดซื้อกรอกทีหลังตอนออกใบสั่งซื้อ
   *
   * ตอนนี้ใบสั่งซื้อจึงเลือกผู้ขายเองจาก**ทะเบียนผู้ขาย** (`src/lib/vendors.ts`) แทนที่จะรับช่วง
   * มาจากใบขอซื้อ ดู `purchaseOrderHandler.ts` `handleCreate()` ที่เลิกก๊อปสามช่องนั้นแล้ว
   *
   * ค่าที่เอกสารเก่าเคยบันทึกไว้ยัง**อยู่ในฐานข้อมูล**เฉย ๆ ไม่ได้ลบ แค่ไม่มีใครอ่านอีกแล้ว —
   * ถ้าภายหลังกลับลำ ข้อมูลยังกู้ได้ (ไม่ได้ทำ migration ลบทิ้ง โดยตั้งใจ)
   */
  /** "วันที่" บนหัวเอกสาร — วันที่ของใบขอซื้อเอง คนละอันกับ `requestedAt` ซึ่งเป็นวันที่ผู้ขอเซ็น */
  issueDate: string;
  /** "ติดต่อ" — ชื่อผู้ประสานงานที่ปลายทางส่งของ */
  deliveryContact: string;
  /** "โทร." ใต้สถานที่ส่งของ */
  deliveryPhone: string;
  /** กล่อง "หมายเหตุ" ใต้ตาราง — คนละอันกับ `jobCode` ซึ่งอยู่ตรงป้าย "หมายเหตุ" บนหัวเอกสาร */
  headerRemark: string;
  /** "วันที่รับของ" */
  neededByDate: string;
  /** "สถานที่ส่งของ" */
  deliveryLocation: string;
  lines: PurchaseRequestLine[];
  status: PurchaseRequestStatus;
  /** ขั้นของสโตร์หลังอนุมัติ — ดู `PurchaseRequestStoreStage` · ไม่มีค่า = ใบก่อน 2026-09-09 */
  storeStage?: PurchaseRequestStoreStage;
  /** ขั้นของฝ่ายจัดซื้อ — ดู `PurchaseRequestPurchasingStage` · ไม่มีค่า = ใบก่อน 2026-09-21 */
  purchasingStage?: PurchaseRequestPurchasingStage;
  /**
   * ผู้กดอนุมัติของฝ่ายจัดซื้อจริงในระบบ — เซิร์ฟเวอร์เขียนเท่านั้น แยกจาก `purchasingDeptBy` ซึ่งเป็น
   * ช่องข้อความบนฟอร์มที่เจ้าหน้าที่พิมพ์เองได้ (กติกาเดียวกับ `approvedByUserId`)
   *
   * ทำให้ช่อง "ฝ่ายจัดซื้อ" บนใบพิมพ์มีลายเซ็นจริงได้เป็นครั้งแรก — ก่อนหน้านี้คอลัมน์นั้นส่ง `userId`
   * ไม่ได้เพราะระบบไม่เคยรู้ว่าใครเป็นคนอนุมัติฝั่งจัดซื้อ
   */
  purchasingApprovedByUserId?: string;
  /** ผู้เช็คของของสโตร์ + วันที่ + หมายเหตุ (เช่น ของหมด สั่งเพิ่ม) */
  storeReviewedBy?: string;
  storeReviewedByName?: string;
  storeReviewedAt?: string;
  storeRemark?: string;
  /** รอบการจ่ายของโดยสโตร์ — ต่อท้ายอย่างเดียว ยกเลิกได้เฉพาะรอบล่าสุด */
  storeIssues?: PurchaseRequestIssueBatch[];
  /**
   * ประวัติการแก้ไขหลังอนุมัติโดยฝ่ายจัดซื้อ (2026-09-09) — เจ้าของสั่งว่าจัดซื้อต้องแก้ใบที่อนุมัติแล้วได้
   * เพราะชื่อหรือยี่ห้อตอนซื้ออาจไม่ตรงกับที่พิมพ์ไว้ในใบ · การแก้จึงไม่เงียบ: ทุกครั้งที่บันทึกจะต่อท้าย
   * แถวนี้ พร้อมเขียน audit log และแจ้งผู้สร้างใบ
   */
  purchasingEdits?: { at: string; byUserId: string; byName: string; note: string }[];
  /**
   * หมายเหตุการแก้ไข — พิมพ์เอง อธิบายว่าฉบับนี้ต่างจากฉบับก่อนตรงไหน และ **แสดงบนใบพิมพ์ด้วย**
   * (ฝ่ายผลิตขอไว้ 2026-08-27 ว่า "สามารถดูในใบปริ้นได้" — ต่างจาก revisionNote ของใบเสนอราคา/
   * Scope of Work ที่เป็นข้อมูลภายในและไม่เคยถูกพิมพ์)
   *
   * ไม่สืบทอดมาจากฉบับก่อนตอนกด Rewrite — เริ่มว่างเสมอ ตรงกับพฤติกรรมของ Scope of Work
   * เอกสารเก่าที่ไม่มีฟิลด์นี้อ่านออกมาเป็น "" (normalize ตอนอ่าน ไม่ได้ทำ migration)
   */
  revisionNote: string;
  /**
   * ไฟล์แนบ — เจ้าของสั่ง 2026-09-02 ("ใบขอซื้อสามารถทำให้แนบไฟล์ได้ด้วย") ใช้ระบบแนบไฟล์กลาง
   * ตัวเดียวกับใบสั่งงาน (`document_attachment_files`) ไม่ได้สร้างชุดที่สี่
   *
   * จัดการผ่าน route เฉพาะของมันเท่านั้น **ไม่ใช่ฟิลด์ที่ PATCH ได้** เพื่อไม่ให้หน้าจอที่ถือข้อมูลเก่า
   * เขียนทับ array นี้จนไฟล์ที่คนอื่นเพิ่งแนบหายไป (กติกาเดียวกับใบสั่งงานและ Scope of Work)
   * เอกสารก่อน 2026-09-02 ไม่มีฟิลด์นี้ — อ่านออกมาเป็น [] เสมอ
   */
  attachments: DocumentAttachment[];
  /** "ผู้ขอซื้อ" */
  requestedBy: string;
  requestedAt: string;
  /** "ผู้อนุมัติ" */
  approvedBy: string;
  /** ผู้กดอนุมัติจริงในระบบ — เซิร์ฟเวอร์เขียนเท่านั้น แยกจาก `approvedBy`/`approvedAt` ซึ่งเป็นช่อง
   *  บนฟอร์มที่เจ้าหน้าที่พิมพ์/แก้เองได้ optional เพราะเอกสารที่บันทึกก่อน 2026-08-20 ไม่มีฟิลด์นี้
   *  — normalize ตอนอ่านด้วย withApprovalDefaults() ไม่ได้ทำ migration */
  approvedByUserId?: string;
  /** เหตุผลที่ผู้อนุมัติตีกลับ ล้างทุกครั้งที่ส่งขออนุมัติใหม่ */
  rejectionComment?: string;
  approvedAt: string;
  /** "ฝ่ายจัดซื้อ" */
  purchasingDeptBy: string;
  purchasingDeptAt: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  isDeleted: boolean;
}

/**
 * หนึ่งใบขอซื้อครอบคลุมได้หลายรายการในโครงการ — เหตุผลเดียวกับ `createMaterialRequisition()`
 * รับ id เดี่ยวได้ด้วย เพราะปุ่มในหน้าโครงการยังสร้างทีละรายการ
 */
/**
 * แนบไฟล์ / ลบไฟล์แนบ — route แยก ไม่ผ่าน PATCH โดยตั้งใจ ด้วยเหตุผลเดียวกับใบสั่งงาน
 */
export async function uploadPurchaseRequestAttachment(id: string, file: File): Promise<PurchaseRequest> {
  const { purchaseRequest } = await uploadDocumentAttachment<{ purchaseRequest: PurchaseRequest }>("purchase-requests", id, {
    fileName: file.name,
    contentType: file.type || "application/octet-stream",
    dataBase64: await fileToBase64(file),
  });
  return purchaseRequest;
}
export async function deletePurchaseRequestAttachment(id: string, attachmentId: string): Promise<PurchaseRequest> {
  const { purchaseRequest } = await deleteDocumentAttachment<{ purchaseRequest: PurchaseRequest }>("purchase-requests", id, attachmentId);
  return purchaseRequest;
}

export async function createPurchaseRequest(projectId: string, itemIds: string | string[]): Promise<PurchaseRequest> {
  const ids = Array.isArray(itemIds) ? itemIds : [itemIds];
  const { purchaseRequest } = await apiFetch<{ purchaseRequest: PurchaseRequest }>("/purchase-requests", {
    method: "POST", body: JSON.stringify({ projectId, itemIds: ids }),
  });
  return purchaseRequest;
}

/** Stage 3 addition — lightweight shape for list views, same convention as DeliveryOrderSummary. */
export interface PurchaseRequestSummary {
  id: string;
  /** แผนกเจ้าของ — ใช้เฉพาะกล่องงานเข้าของจัดซื้อ ที่เห็นใบของทุกฝ่ายรวมกัน (2026-08-28) */
  ownerDepartment?: "project" | "production" | "general";
  projectId: string;
  scopeOfWorkId: string;
  jobCode: string;
  status: PurchaseRequestStatus;
  /** ขั้นของสโตร์ — ป้าย "รอสโตร์ / รอจัดซื้อ / จ่ายจากสต๊อก" ในหน้ารายการ (2026-09-09) */
  storeStage?: PurchaseRequestStoreStage;
  /** ขั้นของจัดซื้อ — ป้าย "จัดซื้ออนุมัติแล้ว" ในหน้ารายการ (2026-09-21) */
  purchasingStage?: PurchaseRequestPurchasingStage;
  updatedAt: string;
}

/**
 * ขอบเขตของรายการใบขอซื้อ — สามค่าแรกคือ "แผนกเจ้าของเอกสาร" ที่เก็บจริงในฐานข้อมูล
 * ส่วน `"all"` เป็นมุมมองอย่างเดียว ไม่เคยถูกบันทึก ใช้กับกล่องงานเข้าของฝ่ายจัดซื้อ
 * ที่ต้องเห็นใบของทุกฝ่ายรวมกันเพื่อออกใบสั่งซื้อต่อ (2026-08-28)
 */
export type PurchaseRequestScope = "project" | "production" | "general" | "all";

// Stage 5 additions — full wrapper set alongside the Purchase Request document page.
export async function fetchPurchaseRequestsByProject(projectId: string): Promise<PurchaseRequestSummary[]> {
  const { purchaseRequests } = await apiFetch<{ purchaseRequests: PurchaseRequestSummary[] }>(`/purchase-requests?projectId=${encodeURIComponent(projectId)}`);
  return purchaseRequests;
}
export async function fetchAllPurchaseRequests(
  ownerDepartment: PurchaseRequestScope = "project",
  /** กล่องงานเข้าตามขั้นของสโตร์ (2026-09-09) — ดู `PurchaseRequestStoreStage` */
  storeStage?: "pending" | "forwarded",
): Promise<PurchaseRequestSummary[]> {
  const query = `?ownerDepartment=${ownerDepartment}${storeStage ? `&storeStage=${storeStage}` : ""}`;
  const { purchaseRequests } = await apiFetch<{ purchaseRequests: PurchaseRequestSummary[] }>(`/purchase-requests${query}`);
  return purchaseRequests;
}

/**
 * สร้างใบเปล่าโดยไม่มีเอกสารต้นทาง — สำหรับฝ่ายที่ไม่ได้ทำงานผ่านโครงการหรือใบสั่งผลิต
 * (สโตร์ เซอร์วิส บัญชี บุคคล จัดซื้อเอง) ตามผังกระบวนการจัดซื้อที่เจ้าของส่งมา 2026-08-28
 * ใบที่ได้มี `ownerDepartment: "general"` และผู้ใช้พิมพ์รายการเองทั้งใบ
 */
export async function createStandalonePurchaseRequest(): Promise<PurchaseRequest> {
  const { purchaseRequest } = await apiFetch<{ purchaseRequest: PurchaseRequest }>("/purchase-requests", {
    method: "POST", body: JSON.stringify({}),
  });
  return purchaseRequest;
}

/** สร้างจากใบสั่งผลิต — เอกสารฝั่งฝ่ายผลิต (ฝั่งโครงการใช้ createPurchaseRequest(projectId, itemId)) */
export async function createPurchaseRequestFromProductionOrder(productionOrderId: string): Promise<PurchaseRequest> {
  const { purchaseRequest } = await apiFetch<{ purchaseRequest: PurchaseRequest }>("/purchase-requests", {
    method: "POST", body: JSON.stringify({ productionOrderId }),
  });
  return purchaseRequest;
}
export async function fetchPurchaseRequest(id: string): Promise<PurchaseRequest> {
  const { purchaseRequest } = await apiFetch<{ purchaseRequest: PurchaseRequest }>(`/purchase-requests/${encodeURIComponent(id)}`);
  return purchaseRequest;
}
/** เปิดใบพร้อมยอดคงเหลือของสินค้าในใบ — ใช้โดยการ์ดสโตร์เช็คของ/จ่ายของ */
export async function fetchPurchaseRequestWithStock(id: string): Promise<PurchaseRequestWithStock> {
  return unwrapWithStock(await apiFetch<PurchaseRequestStockResponse>(`/purchase-requests/${encodeURIComponent(id)}`));
}
export type PurchaseRequestUpdateFields = Partial<Omit<PurchaseRequest, "id" | "createdAt" | "createdBy" | "isDeleted">> & {
  /**
   * หมายเหตุของฝ่ายจัดซื้อตอนแก้ใบที่อนุมัติแล้ว (2026-09-09) — **ไม่ใช่ฟิลด์ที่เก็บตรง ๆ บนใบ**
   * เซิร์ฟเวอร์เอาไปต่อท้าย `purchasingEdits` พร้อมชื่อคนแก้และเวลา ส่งมาในโหมดอื่นจะถูกมองข้าม
   */
  purchasingEditNote?: string;
};
export async function updatePurchaseRequest(id: string, fields: PurchaseRequestUpdateFields, options?: WriteOptions): Promise<PurchaseRequest> {
  const { purchaseRequest } = await apiFetch<{ purchaseRequest: PurchaseRequest }>(`/purchase-requests/${encodeURIComponent(id)}${writeQuery(options)}`, { method: "PATCH", body: JSON.stringify(fields) });
  return purchaseRequest;
}
export async function finalizePurchaseRequest(id: string): Promise<PurchaseRequest> {
  const { purchaseRequest } = await apiFetch<{ purchaseRequest: PurchaseRequest }>(`/purchase-requests/${encodeURIComponent(id)}/finalize`, { method: "POST" });
  return purchaseRequest;
}
/** สร้างฉบับแก้ไขใหม่ (`-R{n}`) — ลิงก์ในโครงการถูกย้ายมาชี้ฉบับใหม่ให้อัตโนมัติ */
export async function rewritePurchaseRequest(id: string): Promise<PurchaseRequest> {
  const { purchaseRequest } = await apiFetch<{ purchaseRequest: PurchaseRequest }>(`/purchase-requests/${encodeURIComponent(id)}/rewrite`, { method: "POST" });
  return purchaseRequest;
}

export async function logPurchaseRequestPrinted(id: string): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/purchase-requests/${encodeURIComponent(id)}/print`, { method: "POST" });
}
export async function deletePurchaseRequest(id: string): Promise<void> {
  await apiFetch<void>(`/purchase-requests/${encodeURIComponent(id)}`, { method: "DELETE" });
}
/** รอบการจ่ายของสโตร์ทั้งหมด เรียงตามลำดับ — ใบเก่าที่ไม่มีฟิลด์นี้อ่านเป็น [] */
export function storeIssueBatchesOf(doc: PurchaseRequest): PurchaseRequestIssueBatch[] {
  return [...(doc.storeIssues ?? [])].sort((a, b) => a.seq - b.seq);
}
/** จำนวนที่สโตร์จ่ายไปแล้วของบรรทัดหนึ่ง */
export function storeIssuedQtyOf(doc: PurchaseRequest, lineId: string): number {
  return storeIssueBatchesOf(doc)
    .flatMap((b) => b.lines)
    .filter((l) => l.lineId === lineId)
    .reduce((sum, l) => sum + l.qty, 0);
}
/** ยังต้องจ่ายอีกเท่าไรของบรรทัดที่สโตร์บอกว่ามีของ */
export function storeOutstandingQtyOf(doc: PurchaseRequest, line: PurchaseRequestLine): number {
  return Math.max(0, (line.qtyRequested ?? 0) - storeIssuedQtyOf(doc, line.id));
}

// ── ขั้นสโตร์เช็คของ / จ่ายของ (2026-09-09) ────────────────────────────────────────────────
/** ใบขอซื้อพร้อมยอดคงเหลือปัจจุบันของสินค้าในใบ — แนวเดียวกับใบเบิก (`MaterialRequisitionWithStock`) */
export interface PurchaseRequestWithStock {
  purchaseRequest: PurchaseRequest;
  stockByProduct: Record<string, number>;
}
interface PurchaseRequestStockResponse {
  purchaseRequest: PurchaseRequest;
  stockByProduct?: Record<string, number>;
}
function unwrapWithStock(res: PurchaseRequestStockResponse): PurchaseRequestWithStock {
  return { purchaseRequest: res.purchaseRequest, stockByProduct: res.stockByProduct ?? {} };
}

/** บันทึกผลการเช็คของ — บรรทัดไหนมีของ บรรทัดไหนต้องซื้อ · มีบรรทัดต้องซื้อ = ส่งต่อจัดซื้อทันที */
export async function reviewPurchaseRequestStock(
  id: string,
  body: { lines: { lineId: string; decision: "stock" | "purchase"; availableQty?: number | null }[]; remark?: string },
): Promise<PurchaseRequestWithStock> {
  return unwrapWithStock(await apiFetch<PurchaseRequestStockResponse>(`/purchase-requests/${encodeURIComponent(id)}/store-review`, {
    method: "POST", body: JSON.stringify(body),
  }));
}
/** สโตร์จ่ายของหนึ่งรอบตามใบขอซื้อ — ตัดสต๊อกตามจำนวนของรอบนั้น จ่ายบางส่วนได้ */
export async function postPurchaseRequestIssue(
  id: string,
  batch: { lines: { lineId: string; qty: number }[]; issuedDate?: string; issuedBy?: string; remark?: string },
): Promise<PurchaseRequestWithStock> {
  return unwrapWithStock(await apiFetch<PurchaseRequestStockResponse>(`/purchase-requests/${encodeURIComponent(id)}/store-issues`, {
    method: "POST", body: JSON.stringify(batch),
  }));
}
/** ยกเลิกรอบการจ่าย**ล่าสุด** — ของทั้งรอบกลับเข้าคลัง */
export async function cancelPurchaseRequestIssue(id: string, batchId: string): Promise<PurchaseRequestWithStock> {
  return unwrapWithStock(await apiFetch<PurchaseRequestStockResponse>(
    `/purchase-requests/${encodeURIComponent(id)}/store-issues/${encodeURIComponent(batchId)}`,
    { method: "DELETE" },
  ));
}

// ── ขั้นของฝ่ายจัดซื้อ (2026-09-21) ────────────────────────────────────────────────────────
/**
 * จัดซื้ออนุมัติใบขอซื้อ — ลงชื่อในช่อง "ฝ่ายจัดซื้อ" แล้วล็อกทั้งใบ · เป็นด่านของการเปิดใบสั่งซื้อ
 *
 * ใช้สิทธิ์เดิม `purchaseRequest:editApproved` ไม่มีสิทธิ์ใหม่ — สิทธิ์นั้นแปลว่า "บทบาทฝ่ายจัดซื้อ" อยู่แล้ว
 */
export async function purchasingApprovePurchaseRequest(id: string): Promise<PurchaseRequest> {
  const { purchaseRequest } = await apiFetch<{ purchaseRequest: PurchaseRequest }>(
    `/purchase-requests/${encodeURIComponent(id)}/purchasing-approve`, { method: "POST" });
  return purchaseRequest;
}
/** ถอนการอนุมัติของจัดซื้อ — ปุ่มแก้พลาดมือลั่น ไม่ต้อง Rewrite ทั้งใบ · ทำไม่ได้ถ้าเปิดใบสั่งซื้อไปแล้ว */
export async function purchasingReopenPurchaseRequest(id: string): Promise<PurchaseRequest> {
  const { purchaseRequest } = await apiFetch<{ purchaseRequest: PurchaseRequest }>(
    `/purchase-requests/${encodeURIComponent(id)}/purchasing-reopen`, { method: "POST" });
  return purchaseRequest;
}

// สร้างรายการเปล่า อาจผูกกับสินค้าในแคตตาล็อกหรือพิมพ์เองอิสระก็ได้
// Builds a blank line — may optionally be linked to a catalog Product, or stay free-typed
export function blankPurchaseRequestLine(product?: { id: string; code: string; name: string; unit: string }): PurchaseRequestLine {
  const newId = `prline-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  if (product) {
    return { id: newId, subDetails: [], productId: product.id, productCode: product.code, description: product.name, unit: product.unit, warehouseRemainingQty: "", qtyRequested: null, neededByDate: "", departmentCode: "", costCode: "" };
  }
  return { id: newId, subDetails: [], productId: "", productCode: "", description: "", unit: "", warehouseRemainingQty: "", qtyRequested: null, neededByDate: "", departmentCode: "", costCode: "" };
}

// ── ขั้นตอนอนุมัติ (ร่าง → รออนุมัติ → อนุมัติ) เพิ่ม 2026-08-20 ──────────────────────────────
// รูปแบบเดียวกับ Scope of Work ทุกประการ ดู api/_lib/documentApproval.ts
/** ส่งขออนุมัติ — ผู้ที่แก้เอกสารได้เป็นผู้ส่ง */
export async function submitPurchaseRequestApproval(id: string): Promise<PurchaseRequest> {
  const { purchaseRequest } = await apiFetch<{ purchaseRequest: PurchaseRequest }>(`/purchase-requests/${encodeURIComponent(id)}/submit-approval`, { method: "POST" });
  return purchaseRequest;
}
/** อนุมัติ — ต้องมีสิทธิ์ :finalize */
export async function approvePurchaseRequest(id: string): Promise<PurchaseRequest> {
  const { purchaseRequest } = await apiFetch<{ purchaseRequest: PurchaseRequest }>(`/purchase-requests/${encodeURIComponent(id)}/approve`, { method: "POST" });
  return purchaseRequest;
}
/** ไม่อนุมัติ (ตีกลับเป็นฉบับร่าง) — ต้องระบุเหตุผล */
export async function rejectPurchaseRequest(id: string, comment: string): Promise<PurchaseRequest> {
  const { purchaseRequest } = await apiFetch<{ purchaseRequest: PurchaseRequest }>(`/purchase-requests/${encodeURIComponent(id)}/reject`, {
    method: "POST", body: JSON.stringify({ comment }),
  });
  return purchaseRequest;
}
/** ถอนการขออนุมัติกลับมาแก้เอง */
export async function withdrawPurchaseRequestApproval(id: string): Promise<PurchaseRequest> {
  const { purchaseRequest } = await apiFetch<{ purchaseRequest: PurchaseRequest }>(`/purchase-requests/${encodeURIComponent(id)}/withdraw-approval`, { method: "POST" });
  return purchaseRequest;
}
