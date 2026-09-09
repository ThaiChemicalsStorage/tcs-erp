import { apiFetch, writeQuery, type WriteOptions } from "./apiClient.js";
import { newId } from "./products.js";
import type { Product } from "./products.js";

/**
 * Material Requisition & Return (FM-ST-04 Rev.02) — added 2026-08-18 (Stage 2 data layer, Stage 3
 * API, Stage 4 first UI).
 * Reproduces the printed structure of public/reference/FM-ST-04_-_Rev.02_1.pdf through _4.pdf — a
 * fixed catalog of store items (chemicals/resins, consumables, nuts & bolts, other) with per-line
 * withdrawal/return tracking. See docs/MODULES/Product.md's Products-catalog-reuse discussion (in
 * conversation, Stage 1) — lines reference an existing src/lib/products.ts Product by id rather than
 * a duplicate parallel catalog; see api/_lib/materialCatalogSeedData.ts for the real seeded items.
 *
 * Unlike the paper form (one printed row per every possible catalog item), a digital requisition only
 * ever contains the lines actually requested — add/remove, same convention as ScopeOfWorkItem.
 *
 * jobOrderId (below) links a requisition back to this module's own JobOrder when the materials are
 * for an in-house fabrication job — confirmed 2026-08-18 that "ใบส่งผลิต" in TODO.md's coordination
 * note is an earlier name for today's Job Order (FM-PJ-01), not a separate document.
 */

export type MaterialRequisitionStatus = "Draft" | "PendingApproval" | "Final";

/** Matches the 4 category groupings the reference PDF's catalog is printed under. */
export type MaterialRequisitionCategory = "chemical" | "consumable" | "hardware" | "other";

export interface MaterialRequisitionLine {
  id: string;
  /** -> Product.id. Never live-referenced after creation — code/name/unit below are a frozen
   * snapshot, same convention as QuoteLine/ScopeOfWorkItem. */
  productId: string;
  productCode: string;
  productName: string;
  unit: string;
  category: MaterialRequisitionCategory;
  /** "เบิกของ" — the originally planned/requested quantity. */
  plannedQty: number | null;
  /**
   * "เบิกครั้งที่1" / "เบิกครั้งที่2" — จำนวนที่**สโตร์จ่ายจริง** (2026-09-03: เจ้าของเลือกให้ตัดสต๊อก
   * ตอนสโตร์จ่ายของ ไม่ใช่ตอนอนุมัติ) เขียนได้ทาง `POST /:id/issue` เท่านั้น ใบ Final เท่านั้น
   * ผู้จัดทำแก้ไม่ได้ · จ่ายบางส่วนได้ ส่วนที่เหลือ = "ค้างเบิก" (`outstandingQtyOf()`)
   */
  withdrawal1Qty: number | null;
  withdrawal2Qty: number | null;
  /** "คืนของ" — leftover material returned via this same line, after issuance. Exempt from the
   * Final-status lock at the API layer (Stage 3) — same "follow-up fields survive Final" pattern
   * Scope of Work's PO-chasing fields use — since the paper form's own footer has separate
   * returner/receiver-of-return signatures implying the return happens after the document is done. */
  returnQty: number | null;
  /** "ใช้จริง" — actual quantity used, for reconciliation. */
  actualUsedQty: number | null;
}

/** หนึ่งบรรทัดในหนึ่งรอบการจ่าย — `qty` > 0 เสมอ บรรทัดที่ไม่ได้จ่ายรอบนี้ไม่ถูกเก็บ */
export interface MaterialIssueBatchLine {
  lineId: string;
  qty: number;
}

/**
 * หนึ่งรอบการจ่ายของโดยสโตร์ (2026-09-07) — โครงเดียวกับ `ReceivingBatch` ของใบรับสินค้า
 *
 * ต่อท้ายอย่างเดียว แก้รอบเก่าไม่ได้ ยกเลิกได้เฉพาะรอบล่าสุด ตัวเลขของรอบก่อนหน้าจึงถูกรักษาไว้เสมอ
 * ตามที่เจ้าของสั่ง 2026-09-07 (*"เซฟตัวเลขเก่าแต่เพิ่มตัวเลขใหม่ขึ้นมาในการเบิกครั้งถัดไป"*) และ
 * สต๊อกถูกตัดตามจำนวนของรอบนั้นรอบเดียว ไม่ได้คิดจากยอดรวมที่พิมพ์ทับกันได้แบบก่อนหน้านี้
 *
 * `postedAt`/`postedBy`/`stockMovementIds` เซิร์ฟเวอร์เขียนเท่านั้น เก็บไว้เพื่อย้อนกลับและตรวจสอบ
 * `charge*Name` เป็น snapshot ของแผนก/ทีม/ประเภทงาน ณ รอบนั้น เพราะรอบถัดไปอาจจ่ายให้ทีมอื่น
 */
export interface MaterialIssueBatch {
  id: string;
  /** ลำดับรอบ เริ่มที่ 1 — รอบที่ 1 ลงช่อง "เบิกครั้งที่1" บนใบพิมพ์ รอบที่ 2 ขึ้นไปรวมกันในช่อง "เบิกครั้งที่2" */
  seq: number;
  issuedDate: string;
  lines: MaterialIssueBatchLine[];
  /** ชื่อผู้จ่ายที่พิมพ์บนใบ — ข้อความอิสระ ไม่ใช่ผู้ใช้ในระบบ */
  issuedBy: string;
  remark: string;
  chargeDepartmentName: string;
  chargeTeamName: string;
  chargeWorkTypeName: string;
  postedAt: string;
  postedBy: string;
  postedByName: string;
  stockMovementIds: string[];
}

export interface MaterialRequisition {
  /** Human-readable business id (`MR-{YYYYMM}-{NNNN}` since 2026-09-03 — older rows carry
   * `MR-{พ.ศ.}-{NNNN}` or `{SC}-MR{n}`), stored directly as `_id` — same convention as
   * service_reports. Never changes; the number people read is `documentNumber` below. */
  id: string;
  /**
   * เลขที่บนฟอร์ม (2026-09-03) — เจ้าของสั่ง *"ใบเบิกสามารถกรอกเองได้แต่ยังให้รันเลขปกติ"* · ค่าตั้งต้น
   * = `id` (ฝ่ายโครงการ) หรือ `{เลขใบสั่งผลิต}-MR{n}` (ฝ่ายผลิต — คำสั่ง 2026-09-02 ย้ายมาอยู่ที่นี่)
   * แก้ได้ตอน Draft ห้ามซ้ำ · optional เพราะใบเก่าไม่มี อ่านออกมาเป็น `id` เสมอ (normalize ตอนอ่าน)
   */
  documentNumber?: string;
  /**
   * "ตัดของแผนกไหน ทีมไหน" (2026-09-03) — แผนก/ทีมที่รับของไป ใช้ทั้งตอนตัดและตอนคืน ประทับลงบัญชี
   * เดินสะพัดของสต๊อกทุกแถว · ชื่อเก็บเป็น snapshot ให้ใบพิมพ์และรายงานอ่านได้ไม่ต้อง join
   * ค่าตั้งต้น = แผนก/ทีมของคนสร้างใบ · ว่างได้
   */
  chargeDepartmentId?: string;
  chargeDepartmentName?: string;
  chargeTeamId?: string;
  chargeTeamName?: string;
  /**
   * "ตัดเข้างาน" — ประเภทงานที่ของถูกตัดให้ (งานเหล็ก / งานโรงงาน / งานผลิต …) เจ้าของสั่ง 2026-09-03
   * ค่ามาจากทะเบียนรหัส `kind: "workType"` (src/lib/codeRegister.ts) แต่พิมพ์เองได้ถ้ายังไม่มีในทะเบียน
   */
  chargeWorkTypeCode?: string;
  chargeWorkTypeName?: string;
  projectId: string;
  /**
   * แผนกเจ้าของเอกสาร — ฝ่ายโครงการกับฝ่ายผลิตใช้เอกสารชนิดเดียวกันแต่ต่างคนต่างเห็นของตัวเอง
   * (ยืนยันกับเจ้าของ 2026-08-20). optional เพราะเอกสารที่บันทึกก่อนหน้านั้นไม่มีฟิลด์นี้ — อ่านแล้ว
   * normalize เป็น "project" เสมอ ไม่ได้ทำ migration
   */
  ownerDepartment?: "project" | "production";
  /** ใบสั่งผลิตต้นทาง — มีค่าเฉพาะเอกสารของฝ่ายผลิต (ฝั่งโครงการใช้ projectId แทน) */
  productionOrderId?: string;
  scopeOfWorkId: string;
  /** "รหัสงาน" — snapshot of Project.scopeNumber / ScopeOfWork.scopeNumber. */
  jobCode: string;
  /** "ชื่อลูกค้า" */
  customerName: string;
  /** "เลขที่ใบสั่งผลิต" — an optional, nullable FK to this module's own JobOrder (confirmed
   * 2026-08-18: "ใบส่งผลิต/Production Order" in TODO.md's coordination note was an earlier name for
   * today's Job Order, FM-PJ-01 — same document, renamed over time, not a separate concept).
   * `null` = no Job Order behind this requisition — many requisitions pull straight from store
   * stock with no fabrication job at all, so this must never be required. `jobOrderCode` is a
   * denormalized snapshot for display, same convention ScopeOfWork.scopeNumber-style snapshots use
   * elsewhere — kept in sync whenever jobOrderId is set, "" when it's null. */
  jobOrderId: string | null;
  jobOrderCode: string;
  /** "ชื่อสินค้า" — the product/job being fabricated, not a MaterialRequisitionLine item. */
  productName: string;
  /** "ชื่อพนักงานดูแล" */
  responsibleEmployee: string;
  /** "วันที่เริ่มผลิต" */
  productionStartDate: string;
  lines: MaterialRequisitionLine[];
  /**
   * รอบการจ่ายของทั้งหมด เรียงตามลำดับที่จ่ายจริง (2026-09-07) — **แหล่งความจริงของยอดที่จ่ายไปแล้ว**
   * ช่อง `withdrawal1Qty`/`withdrawal2Qty` ของแต่ละบรรทัดคำนวณจากตรงนี้ (`withdrawalsFromBatches`)
   * เอกสารก่อน 2026-09-07 ไม่มีฟิลด์นี้ อ่านออกมาเป็น `[]` แล้วแปลงยอดเดิมเป็นรอบย้อนหลังตอนแสดงผล
   * (`legacyIssueBatchesOf`) และเขียนลงฐานข้อมูลจริงตอนจ่ายรอบถัดไป — ไม่ได้ทำ migration
   */
  issues: MaterialIssueBatch[];
  status: MaterialRequisitionStatus;
  /**
   * หมายเหตุการแก้ไข — พิมพ์เอง อธิบายว่าฉบับนี้ต่างจากฉบับก่อนตรงไหน (ฝ่ายผลิตขอไว้ 2026-08-27:
   * "ใบเบิกของมี Rewrite แล้วสามารถทำหมายเหตุการแก้ไขได้เหมือนใน scope และสามารถดูในใบปริ้นได้") **แสดงบนใบพิมพ์ด้วย** ต่างจาก revisionNote ของใบเสนอราคา/Scope of Work
   * ที่เป็นข้อมูลภายในและไม่เคยถูกพิมพ์เลย
   *
   * ไม่สืบทอดมาจากฉบับก่อนตอนกด Rewrite — เริ่มว่างเสมอ ตรงกับพฤติกรรมของ Scope of Work
   * เอกสารเก่าที่ไม่มีฟิลด์นี้อ่านออกมาเป็น "" (normalize ตอนอ่าน ไม่ได้ทำ migration)
   */
  revisionNote: string;

  preparedBy: string;
  preparedAt: string;
  approvedBy: string;
  /** ผู้กดอนุมัติจริงในระบบ — เซิร์ฟเวอร์เขียนเท่านั้น แยกจาก `approvedBy`/`approvedAt` ซึ่งเป็นช่อง
   *  บนฟอร์มที่เจ้าหน้าที่พิมพ์/แก้เองได้ optional เพราะเอกสารที่บันทึกก่อน 2026-08-20 ไม่มีฟิลด์นี้
   *  — normalize ตอนอ่านด้วย withApprovalDefaults() ไม่ได้ทำ migration */
  approvedByUserId?: string;
  /** เหตุผลที่ผู้อนุมัติตีกลับ ล้างทุกครั้งที่ส่งขออนุมัติใหม่ */
  rejectionComment?: string;
  approvedAt: string;
  /** "แผนกสโตร์" sign-off. */
  storeDeptBy: string;
  storeDeptAt: string;
  /** "แผนกต้นทุน" sign-off. */
  costDeptBy: string;
  costDeptAt: string;
  /** "ผู้คืน" — one signature for the whole return event (return quantity itself is per-line above). */
  returnedBy: string;
  /** "ผู้รับคืน" */
  returnReceivedBy: string;
  returnedAt: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  isDeleted: boolean;
}

/** Stage 3 addition — lightweight shape for the by-project list, same convention as
 * DeliveryOrderSummary. */
export interface MaterialRequisitionSummary {
  id: string;
  /** เลขที่บนฟอร์ม — เท่ากับ `id` เมื่อไม่ได้พิมพ์ทับ */
  documentNumber: string;
  chargeDepartmentName: string;
  chargeTeamName: string;
  chargeWorkTypeName: string;
  /** ใบอนุมัติแล้วที่สโตร์ยังจ่ายไม่ครบ — ป้าย "ค้างเบิก" ในหน้ารายการ */
  hasOutstanding: boolean;
  projectId: string;
  scopeOfWorkId: string;
  jobCode: string;
  /**
   * ใบสั่งผลิตต้นทาง — โชว์เป็นคอลัมน์ในหน้ารายการ (เจ้าของขอ 2026-09-02 "ให้ขึ้นโชว์ด้วย")
   *
   * ตั้งแต่ 2026-09-02 เลขใบเบิกของฝ่ายผลิต**อิงจากเลขใบสั่งผลิตอยู่แล้ว** แต่ใบที่ออกก่อนหน้านั้น
   * ยังเป็น `MR-{พ.ศ.}-{ลำดับ}` ซึ่งอ่านไม่ออกว่ามาจากงานไหน คอลัมน์นี้จึงตอบให้ทั้งใบเก่าและใบใหม่
   * `""` = ใบของฝ่ายโครงการ ซึ่งไม่มีใบสั่งผลิตต้นทาง
   */
  productionOrderId?: string;
  status: MaterialRequisitionStatus;
  updatedAt: string;
}

/** Must stay in sync with `MATERIAL_CATEGORY_SEEDS` in api/_lib/materialCatalogSeedData.ts (a
 * server-only file that can't be imported into the frontend bundle) — the 4 real `ProductCategory`
 * names the material catalog is seeded under, used to filter `ProductPickerModal`'s product list
 * down to just this module's catalog rather than every sales-facing product too. */
export const MATERIAL_CATEGORY_TO_KEY: Record<string, MaterialRequisitionCategory> = {
  "เคมี/เรซิ่น": "chemical",
  "วัสดุสิ้นเปลือง": "consumable",
  "น็อตและสกรู": "hardware",
  "อื่นๆ (คลัง)": "other",
};
export const MATERIAL_CATEGORY_NAMES: string[] = Object.keys(MATERIAL_CATEGORY_TO_KEY);
export function resolveMaterialCategoryKey(categoryName: string): MaterialRequisitionCategory {
  return MATERIAL_CATEGORY_TO_KEY[categoryName] ?? "other";
}

// ── จ่ายจริง / ค้างเบิก (2026-09-03) — ฟังก์ชันล้วน ใช้ร่วมกันทั้งหน้าจอ ใบพิมพ์ และ API ─────────
/** จำนวนที่สโตร์จ่ายไปแล้ว = เบิกครั้งที่ 1 + ครั้งที่ 2 */
export function issuedQtyOf(line: Pick<MaterialRequisitionLine, "withdrawal1Qty" | "withdrawal2Qty">): number {
  return (line.withdrawal1Qty ?? 0) + (line.withdrawal2Qty ?? 0);
}
/** ค้างเบิก = ขอ − จ่ายแล้ว (ไม่ติดลบ — จ่ายเกินที่ขอไม่ได้อยู่แล้ว server กันไว้) */
export function outstandingQtyOf(line: Pick<MaterialRequisitionLine, "plannedQty" | "withdrawal1Qty" | "withdrawal2Qty">): number {
  return Math.max(0, (line.plannedQty ?? 0) - issuedQtyOf(line));
}
/** ใบที่ยังมีของค้างจ่ายอย่างน้อยหนึ่งบรรทัด (เฉพาะใบที่อนุมัติแล้วเท่านั้นที่มีความหมาย) */
export function requisitionHasOutstanding(doc: Pick<MaterialRequisition, "status" | "lines">): boolean {
  return doc.status === "Final" && doc.lines.some((l) => outstandingQtyOf(l) > 0);
}
/** ของที่ทีมยังถืออยู่จากบรรทัดนี้ = จ่ายแล้ว − คืนแล้ว */
export function netHeldQtyOf(line: Pick<MaterialRequisitionLine, "withdrawal1Qty" | "withdrawal2Qty" | "returnQty">): number {
  return Math.max(0, issuedQtyOf(line) - (line.returnQty ?? 0));
}

// ── รอบการจ่าย (2026-09-07) — ฟังก์ชันล้วน ใช้ร่วมกันทั้งหน้าจอ ใบพิมพ์ และ API ────────────────

/** จำนวนที่จ่ายให้บรรทัดหนึ่งในรอบเหล่านี้รวมกัน */
export function batchIssuedQtyOf(batches: MaterialIssueBatch[], lineId: string): number {
  return batches.reduce((sum, b) => sum + b.lines.reduce((s, l) => s + (l.lineId === lineId ? l.qty : 0), 0), 0);
}

/**
 * ยอดสองช่องบนฟอร์มกระดาษที่คิดจากรอบการจ่าย — รอบที่ 1 ลงช่องแรก รอบที่ 2 ขึ้นไป**รวมกัน**ในช่องที่สอง
 *
 * ฟอร์ม FM-ST-04 มีแค่สองช่อง แต่ของจริงจ่ายกี่รอบก็ได้ ใบพิมพ์จึงยุบรอบท้าย ๆ เข้าด้วยกัน
 * ส่วนประวัติเต็มอยู่ใน `issues` และหน้าจอแสดงทีละรอบ
 */
export function withdrawalsFromBatches(batches: MaterialIssueBatch[], lineId: string): { withdrawal1Qty: number | null; withdrawal2Qty: number | null } {
  const first = batchIssuedQtyOf(batches.filter((b) => b.seq <= 1), lineId);
  const rest = batchIssuedQtyOf(batches.filter((b) => b.seq > 1), lineId);
  return { withdrawal1Qty: first > 0 ? first : null, withdrawal2Qty: rest > 0 ? rest : null };
}

/**
 * ใบที่จ่ายไปแล้วก่อน 2026-09-07 มีแต่ยอดในสองช่อง ไม่มีรายการรอบ — แปลงกลับเป็นรอบย้อนหลังหนึ่งรอบ
 * ต่อหนึ่งช่องที่มีตัวเลข เพื่อให้หน้าจอ ใบพิมพ์ และการจ่ายรอบถัดไปเห็นข้อมูลชุดเดียวกันหมด
 *
 * `seq` ตรงกับหมายเลขช่องเดิม (ไม่ใช่ลำดับที่นับใหม่) ยอดที่คิดกลับออกมาจึงเท่าของเดิมเป๊ะทุกกรณี
 * รวมถึงใบแปลกที่กรอกแต่ช่องที่สอง · วันที่/ผู้จ่ายมาจากช่องเซ็นของแผนกสโตร์ซึ่งเป็นข้อมูลเดียวที่มี
 */
export function legacyIssueBatchesOf(
  doc: Pick<MaterialRequisition, "lines" | "storeDeptBy" | "storeDeptAt" | "updatedAt">,
): MaterialIssueBatch[] {
  const out: MaterialIssueBatch[] = [];
  (["withdrawal1Qty", "withdrawal2Qty"] as const).forEach((field, idx) => {
    const lines = doc.lines
      .filter((l) => (l[field] ?? 0) > 0)
      .map((l) => ({ lineId: l.id, qty: l[field] as number }));
    if (lines.length === 0) return;
    out.push({
      id: `mrissue-legacy${idx + 1}`,
      seq: idx + 1,
      issuedDate: doc.storeDeptAt || "",
      lines,
      issuedBy: doc.storeDeptBy || "",
      remark: "",
      chargeDepartmentName: "", chargeTeamName: "", chargeWorkTypeName: "",
      postedAt: doc.updatedAt, postedBy: "", postedByName: doc.storeDeptBy || "",
      stockMovementIds: [],
    });
  });
  return out;
}

/** รอบการจ่ายที่ควรแสดง — ของจริงถ้ามี ไม่มีก็แปลงจากยอดเดิมของใบเก่าให้ */
export function issueBatchesOf(
  doc: Pick<MaterialRequisition, "issues" | "lines" | "storeDeptBy" | "storeDeptAt" | "updatedAt">,
): MaterialIssueBatch[] {
  return doc.issues?.length ? doc.issues : legacyIssueBatchesOf(doc);
}

// สร้างรายการเปล่าจากสินค้าที่เลือกในแคตตาล็อก
// Builds a new line from a product picked in the catalog
export function blankMaterialRequisitionLine(product: Product, categoryName: string): MaterialRequisitionLine {
  return {
    id: newId("mrline"),
    productId: product.id, productCode: product.code, productName: product.name, unit: product.unit,
    category: resolveMaterialCategoryKey(categoryName),
    plannedQty: null, withdrawal1Qty: null, withdrawal2Qty: null, returnQty: null, actualUsedQty: null,
  };
}

export async function fetchMaterialRequisitionsByProject(projectId: string): Promise<MaterialRequisitionSummary[]> {
  const { materialRequisitions } = await apiFetch<{ materialRequisitions: MaterialRequisitionSummary[] }>(`/material-requisitions?projectId=${encodeURIComponent(projectId)}`);
  return materialRequisitions;
}
// ดึงรายการใบเบิกและใบคืนวัสดุทั้งหมดในระบบ สำหรับหน้ารายการแบบแยกต่างหาก (ไม่ผูกกับโครงการใดโครงการหนึ่ง)
// Fetches every Material Requisition company-wide, for the standalone management page's list
export async function fetchAllMaterialRequisitions(ownerDepartment: "project" | "production" = "project"): Promise<MaterialRequisitionSummary[]> {
  const { materialRequisitions } = await apiFetch<{ materialRequisitions: MaterialRequisitionSummary[] }>(`/material-requisitions?ownerDepartment=${ownerDepartment}`);
  return materialRequisitions;
}

/** สร้างจากใบสั่งผลิต — เอกสารฝั่งฝ่ายผลิต (ฝั่งโครงการใช้ createMaterialRequisition(projectId, itemId)) */
export async function createMaterialRequisitionFromProductionOrder(productionOrderId: string): Promise<MaterialRequisition> {
  const { materialRequisition } = await apiFetch<{ materialRequisition: MaterialRequisition }>("/material-requisitions", {
    method: "POST", body: JSON.stringify({ productionOrderId }),
  });
  return materialRequisition;
}
/**
 * ใบเบิกพร้อมยอดคงเหลือปัจจุบันของทุกสินค้าในใบ (`stockByProduct`, key = productId) — server อ่านให้
 * ในคำขอเดียว หน้าเอกสารจึงโชว์ "คงเหลือในสต๊อก" ต่อบรรทัดได้โดยไม่ต้องดึงสินค้าทั้งคลัง
 */
export async function fetchMaterialRequisition(id: string): Promise<MaterialRequisitionWithStock> {
  const res = await apiFetch<{ materialRequisition: MaterialRequisition; stockByProduct?: Record<string, number>; costByProduct?: Record<string, ProductCostBasis> }>(`/material-requisitions/${encodeURIComponent(id)}`);
  return { materialRequisition: res.materialRequisition, stockByProduct: res.stockByProduct ?? {}, costByProduct: res.costByProduct ?? {} };
}
/**
 * ต้นทุนต่อหน่วยของสินค้าในใบ — `lastCost` คือ**ราคาซื้อล่าสุด** ที่เจ้าของเลือกให้ใช้ตอนรับของคืน
 * (2026-09-09) และ `avgCost` คือถัวเฉลี่ยที่ยังเป็นฐานของ "มูลค่าสต๊อก" ตามเดิม · 0 = ยังไม่เคยมีค่า
 */
export interface ProductCostBasis {
  avgCost: number;
  lastCost: number;
}

/** ราคาที่จะลงบัญชีเมื่อของกลับเข้าคลัง — ตรงกับ `returnUnitCostOf()` ฝั่งเซิร์ฟเวอร์ */
export function returnUnitCostOf(basis: ProductCostBasis | undefined): number {
  if (!basis) return 0;
  return basis.lastCost > 0 ? basis.lastCost : basis.avgCost;
}

/** ผลลัพธ์ของทุก route ที่ขยับสต๊อก — ยอดคงเหลือใหม่มาพร้อมเอกสาร หน้าจอจึงไม่ต้องยิงซ้ำ */
export interface MaterialRequisitionWithStock {
  materialRequisition: MaterialRequisition;
  stockByProduct: Record<string, number>;
  costByProduct: Record<string, ProductCostBasis>;
}

/**
 * สโตร์จ่ายของหนึ่งรอบ (2026-09-07) — ต่อท้าย `issues` หนึ่งรอบ แล้วตัดสต๊อกตามจำนวนของรอบนั้น
 *
 * ยอดของรอบก่อน ๆ ไม่ถูกแตะเลย ต่างจาก `/issue` เดิมที่รับยอดรวมสองช่องแล้วตัดตามส่วนต่าง ซึ่งพิมพ์
 * ทับรอบเก่าได้ · ใบ Final เท่านั้น ต้องมีสิทธิ์ `stock:adjust` (คนจ่ายของคือสโตร์ ไม่ใช่เจ้าของใบ)
 */
export async function postMaterialIssueBatch(
  id: string,
  batch: {
    lines: { lineId: string; qty: number }[];
    issuedDate?: string;
    issuedBy?: string;
    remark?: string;
    chargeDepartmentId?: string;
    chargeTeamId?: string;
    chargeWorkTypeCode?: string;
    chargeWorkTypeName?: string;
  },
): Promise<MaterialRequisitionWithStock> {
  const res = await apiFetch<{ materialRequisition: MaterialRequisition; stockByProduct?: Record<string, number>; costByProduct?: Record<string, ProductCostBasis> }>(`/material-requisitions/${encodeURIComponent(id)}/issues`, {
    method: "POST", body: JSON.stringify(batch),
  });
  return { materialRequisition: res.materialRequisition, stockByProduct: res.stockByProduct ?? {}, costByProduct: res.costByProduct ?? {} };
}

/** ยกเลิกรอบการจ่าย**ล่าสุด** — ของกลับเข้าคลังทั้งรอบ (รอบที่ทีมคืนของไปแล้วบางส่วนยกเลิกไม่ได้) */
export async function cancelMaterialIssueBatch(id: string, batchId: string): Promise<MaterialRequisitionWithStock> {
  const res = await apiFetch<{ materialRequisition: MaterialRequisition; stockByProduct?: Record<string, number>; costByProduct?: Record<string, ProductCostBasis> }>(
    `/material-requisitions/${encodeURIComponent(id)}/issues/${encodeURIComponent(batchId)}`,
    { method: "DELETE" },
  );
  return { materialRequisition: res.materialRequisition, stockByProduct: res.stockByProduct ?? {}, costByProduct: res.costByProduct ?? {} };
}
/**
 * หนึ่งใบเบิกครอบคลุมได้หลายรายการในโครงการ (เจ้าของสั่ง 2026-09-02 "ให้เหมือนกับผลิต" — ฝ่ายผลิต
 * ออกใบเดียวต่อหนึ่งใบสั่งผลิตอยู่แล้ว) รับ id เดี่ยวได้ด้วย เพราะปุ่มในหน้าโครงการยังสร้างทีละรายการ
 */
export async function createMaterialRequisition(projectId: string, itemIds: string | string[]): Promise<MaterialRequisition> {
  const ids = Array.isArray(itemIds) ? itemIds : [itemIds];
  const { materialRequisition } = await apiFetch<{ materialRequisition: MaterialRequisition }>("/material-requisitions", {
    method: "POST", body: JSON.stringify({ projectId, itemIds: ids }),
  });
  return materialRequisition;
}
export type MaterialRequisitionUpdateFields = Partial<Omit<MaterialRequisition, "id" | "createdAt" | "createdBy" | "isDeleted">>;
export async function updateMaterialRequisition(id: string, fields: MaterialRequisitionUpdateFields, options?: WriteOptions): Promise<MaterialRequisition> {
  const { materialRequisition } = await apiFetch<{ materialRequisition: MaterialRequisition }>(`/material-requisitions/${encodeURIComponent(id)}${writeQuery(options)}`, {
    method: "PATCH", body: JSON.stringify(fields),
  });
  return materialRequisition;
}
// บันทึกการคืนวัสดุ (แก้ไขได้แม้เอกสารจะเป็นสถานะ Final แล้ว)
// Records a material return — stays editable even once the document is Final
export async function recordMaterialRequisitionReturn(
  id: string,
  fields: {
    lines: { id: string; returnQty: number | null }[];
    returnedBy?: string; returnReceivedBy?: string;
    /** แผนก/ทีม/ประเภทงานที่คืนจาก — ปกติเท่ากับที่ตัดให้ แก้ได้ */
    chargeDepartmentId?: string; chargeTeamId?: string; chargeWorkTypeCode?: string; chargeWorkTypeName?: string;
  },
): Promise<MaterialRequisition> {
  const { materialRequisition } = await apiFetch<{ materialRequisition: MaterialRequisition }>(`/material-requisitions/${encodeURIComponent(id)}/return`, {
    method: "POST", body: JSON.stringify(fields),
  });
  return materialRequisition;
}
export async function finalizeMaterialRequisition(id: string): Promise<MaterialRequisition> {
  const { materialRequisition } = await apiFetch<{ materialRequisition: MaterialRequisition }>(`/material-requisitions/${encodeURIComponent(id)}/finalize`, { method: "POST" });
  return materialRequisition;
}
/** สร้างฉบับแก้ไขใหม่ (`-R{n}`) — ลิงก์ในโครงการถูกย้ายมาชี้ฉบับใหม่ให้อัตโนมัติ */
export async function rewriteMaterialRequisition(id: string): Promise<MaterialRequisition> {
  const { materialRequisition } = await apiFetch<{ materialRequisition: MaterialRequisition }>(`/material-requisitions/${encodeURIComponent(id)}/rewrite`, { method: "POST" });
  return materialRequisition;
}

export async function logMaterialRequisitionPrinted(id: string): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/material-requisitions/${encodeURIComponent(id)}/print`, { method: "POST" });
}
export async function deleteMaterialRequisition(id: string): Promise<void> {
  await apiFetch<void>(`/material-requisitions/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// ── ขั้นตอนอนุมัติ (ร่าง → รออนุมัติ → อนุมัติ) เพิ่ม 2026-08-20 ──────────────────────────────
// รูปแบบเดียวกับ Scope of Work ทุกประการ ดู api/_lib/documentApproval.ts
/** ส่งขออนุมัติ — ผู้ที่แก้เอกสารได้เป็นผู้ส่ง */
export async function submitMaterialRequisitionApproval(id: string): Promise<MaterialRequisition> {
  const { materialRequisition } = await apiFetch<{ materialRequisition: MaterialRequisition }>(`/material-requisitions/${encodeURIComponent(id)}/submit-approval`, { method: "POST" });
  return materialRequisition;
}
/** อนุมัติ — ต้องมีสิทธิ์ :finalize */
export async function approveMaterialRequisition(id: string): Promise<MaterialRequisition> {
  const { materialRequisition } = await apiFetch<{ materialRequisition: MaterialRequisition }>(`/material-requisitions/${encodeURIComponent(id)}/approve`, { method: "POST" });
  return materialRequisition;
}
/** ไม่อนุมัติ (ตีกลับเป็นฉบับร่าง) — ต้องระบุเหตุผล */
export async function rejectMaterialRequisition(id: string, comment: string): Promise<MaterialRequisition> {
  const { materialRequisition } = await apiFetch<{ materialRequisition: MaterialRequisition }>(`/material-requisitions/${encodeURIComponent(id)}/reject`, {
    method: "POST", body: JSON.stringify({ comment }),
  });
  return materialRequisition;
}
/** ถอนการขออนุมัติกลับมาแก้เอง */
export async function withdrawMaterialRequisitionApproval(id: string): Promise<MaterialRequisition> {
  const { materialRequisition } = await apiFetch<{ materialRequisition: MaterialRequisition }>(`/material-requisitions/${encodeURIComponent(id)}/withdraw-approval`, { method: "POST" });
  return materialRequisition;
}
