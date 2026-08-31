/**
 * Job Order (FM-PJ-01 Rev.01) — added 2026-08-18, Stage 2 (data layer only). Reproduces the printed
 * structure of public/reference/FM-PJ-01__Rev1.pdf — sent to Production when a Project item isn't in
 * the store catalog but can be fabricated in-house.
 *
 * Line items are free-typed (unlike Material Requisition's fixed catalog) since fabrication work
 * varies per job. The "ขอบเขตงาน (Scope of work)" section is a flat 23-item checklist reusing
 * ChecklistGroup/ChecklistOption from documentRequirements.ts (the same shape Scope of Work uses) —
 * several options need an associated fill-in value (micron figures, BAR/TON values, free text), which
 * is what ChecklistOption.value/value2 are for. ONE flat group with no heading, because that is
 * literally what the paper form is — confirmed 2026-08-31 against the real blank form and three
 * filled examples; see buildJobOrderChecklistGroups() for the transcribed layout.
 */

import { apiFetch, writeQuery, type WriteOptions } from "./apiClient.js";
import type { DocumentAttachment } from "./documentAttachments.js";
import { uploadDocumentAttachment, deleteDocumentAttachment, fileToBase64 } from "./documentAttachments.js";
import type { ChecklistGroup, ChecklistOption } from "./documentRequirements.js";

export type { ChecklistGroup, ChecklistOption };

export type JobOrderStatus = "Draft" | "PendingApproval" | "Final";

export interface JobOrderLine {
  id: string;
  description: string;
  quantity: number | null;
  unit: string;
  remark: string;
  /**
   * บรรทัดรายละเอียดย่อยใต้รายการหลัก — รูปแบบเดียวกับ ProductionOrderLine/PurchaseRequestLine
   * เพิ่ม 2026-08-27 พร้อมกับการติ๊กเลือกหลายรายการ: สเปกของ ProjectItem ถูกคัดลอกมาลงตรงนี้
   * ถ้าไม่มีฟิลด์นี้ สเปกจะหายเงียบ ๆ ตอนสร้างเอกสาร
   */
  subDetails: string[];
  /**
   * บรรทัดต่อของรายการก่อนหน้า — **ไม่กินเลขลำดับ แต่ยังมีจำนวน/หน่วยของตัวเอง**
   *
   * ต่างจาก `subDetails` ตรงที่ subDetails เป็นข้อความล้วน ๆ ใต้คำอธิบายเท่านั้น ฟอร์มกระดาษจริง
   * ทั้งสองใบมีแถวแบบนี้อยู่จริง และก่อน 2026-08-31 ระบบเก็บไม่ได้เลย:
   *   FM-PJ-01  "1 | Flexible Joint" (ไม่มีจำนวน) แล้วตามด้วย "Ø 650 | 15 | PCS" ที่ไม่มีเลขลำดับ
   *   FM-PD-02  "3 | หน้าแปลน 20A | 2 ตัว" แล้ว "หน้าแปลน 50A | 3 ตัว" ที่ไม่มีเลขลำดับ
   *
   * optional และ default เป็น false — เอกสารเก่าทุกใบอ่านออกมาเหมือนเดิมทุกประการ ไม่ต้อง migrate
   */
  isContinuation?: boolean;
}

export interface JobOrder {
  /** Human-readable business id (e.g. "JO-2569-0001"), intended to be stored directly as _id once
   * the API layer mints it (Stage 3) — same convention as service_reports' SR-{year}-{seq}. */
  id: string;
  projectId: string;
  scopeOfWorkId: string;
  /** "รหัสงาน" */
  jobCode: string;
  /** "ชื่อลูกค้า" — the PDF labels this "Job name," snapshot from the Project/Scope of Work. */
  customerName: string;
  /** "จากหน่วยงาน" */
  fromSite: string;
  /** "ถึงหน่วยงาน" */
  toSite: string;
  /** "วันเริ่มดำเนินการ" */
  startDate: string;
  /** "วันดำเนินการแล้วเสร็จ" */
  finishDate: string;
  lines: JobOrderLine[];
  /** "ขอบเขตงาน (Scope of work)" — see buildJobOrderChecklistGroups() below. */
  scopeChecklist: ChecklistGroup[];
  /** "รายละเอียดอื่นๆ (Out of Scope)" */
  outOfScope: string;
  status: JobOrderStatus;
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
   * ไฟล์แนบ (แบบ, รูป, PO ของลูกค้า) — ฝ่ายโครงการขอไว้ 2026-08-27 ("สามารถแนบไฟล์ในใบสั่งงาน")
   *
   * จัดการผ่าน route เฉพาะของมันเท่านั้น **ไม่ใช่ฟิลด์ที่ PATCH ได้** เพื่อไม่ให้หน้าจอที่ถือข้อมูลเก่า
   * เขียนทับ array นี้จนไฟล์ที่คนอื่นเพิ่งแนบหายไป (กติกาเดียวกับ Scope of Work)
   * เอกสารก่อน 2026-08-27 ไม่มีฟิลด์นี้ — อ่านออกมาเป็น [] เสมอ
   */
  attachments: DocumentAttachment[];
  /** "ผู้ร้องขอ" */
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
  /** "ผู้รับเอกสาร" — Production acknowledging receipt. */
  documentRecipientBy: string;
  documentRecipientAt: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  isDeleted: boolean;
}

/**
 * หนึ่งใบสั่งงานครอบคลุมได้หลายรายการ (ฝ่ายโครงการขอไว้ 2026-08-27) — รายการที่ติ๊ก
 * จะถูกคัดลอกมาเป็นรายการดำเนินงานในเอกสารให้เลย พร้อมสเปคเป็นบรรทัดย่อย
 */
export async function createJobOrder(projectId: string, itemIds: string | string[]): Promise<JobOrder> {
  const ids = Array.isArray(itemIds) ? itemIds : [itemIds];
  const { jobOrder } = await apiFetch<{ jobOrder: JobOrder }>("/job-orders", {
    method: "POST", body: JSON.stringify({ projectId, itemIds: ids }),
  });
  return jobOrder;
}

/** Stage 3 addition — lightweight shape for list views, same convention as DeliveryOrderSummary. */
export interface JobOrderSummary {
  id: string;
  projectId: string;
  scopeOfWorkId: string;
  jobCode: string;
  status: JobOrderStatus;
  updatedAt: string;
}

// Stage 5 additions — full wrapper set alongside the Job Order document page.
export async function fetchJobOrdersByProject(projectId: string): Promise<JobOrderSummary[]> {
  const { jobOrders } = await apiFetch<{ jobOrders: JobOrderSummary[] }>(`/job-orders?projectId=${encodeURIComponent(projectId)}`);
  return jobOrders;
}
export async function fetchAllJobOrders(): Promise<JobOrderSummary[]> {
  const { jobOrders } = await apiFetch<{ jobOrders: JobOrderSummary[] }>("/job-orders");
  return jobOrders;
}
export async function fetchJobOrder(id: string): Promise<JobOrder> {
  const { jobOrder } = await apiFetch<{ jobOrder: JobOrder }>(`/job-orders/${encodeURIComponent(id)}`);
  return jobOrder;
}
export type JobOrderUpdateFields = Partial<Omit<JobOrder, "id" | "createdAt" | "createdBy" | "isDeleted">>;
export async function updateJobOrder(id: string, fields: JobOrderUpdateFields, options?: WriteOptions): Promise<JobOrder> {
  const { jobOrder } = await apiFetch<{ jobOrder: JobOrder }>(`/job-orders/${encodeURIComponent(id)}${writeQuery(options)}`, { method: "PATCH", body: JSON.stringify(fields) });
  return jobOrder;
}
export async function finalizeJobOrder(id: string): Promise<JobOrder> {
  const { jobOrder } = await apiFetch<{ jobOrder: JobOrder }>(`/job-orders/${encodeURIComponent(id)}/finalize`, { method: "POST" });
  return jobOrder;
}
/**
 * แนบไฟล์ / ลบไฟล์แนบ — route แยก ไม่ผ่าน PATCH โดยตั้งใจ เพื่อไม่ให้หน้าจอที่ถือข้อมูลเก่า
 * เขียนทับ array จนไฟล์ที่คนอื่นเพิ่งแนบหาย (กติกาเดียวกับ Scope of Work)
 */
export async function uploadJobOrderAttachment(id: string, file: File): Promise<JobOrder> {
  const { jobOrder } = await uploadDocumentAttachment<{ jobOrder: JobOrder }>("job-orders", id, {
    fileName: file.name,
    contentType: file.type || "application/octet-stream",
    dataBase64: await fileToBase64(file),
  });
  return jobOrder;
}
export async function deleteJobOrderAttachment(id: string, attachmentId: string): Promise<JobOrder> {
  const { jobOrder } = await deleteDocumentAttachment<{ jobOrder: JobOrder }>("job-orders", id, attachmentId);
  return jobOrder;
}

/**
 * สร้างฉบับแก้ไขใหม่ (`-R{n}`) — ลิงก์ในโครงการ **ทุกรายการ** ถูกย้ายมาชี้ฉบับใหม่ให้อัตโนมัติ
 * ไฟล์แนบไม่สืบทอด เพราะสำเนาจะชี้ไฟล์ก้อนเดียวกันแล้วลบทีเดียวพังทั้งสองฉบับ
 */
export async function rewriteJobOrder(id: string): Promise<JobOrder> {
  const { jobOrder } = await apiFetch<{ jobOrder: JobOrder }>(`/job-orders/${encodeURIComponent(id)}/rewrite`, { method: "POST" });
  return jobOrder;
}

export async function logJobOrderPrinted(id: string): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/job-orders/${encodeURIComponent(id)}/print`, { method: "POST" });
}
export async function deleteJobOrder(id: string): Promise<void> {
  await apiFetch<void>(`/job-orders/${encodeURIComponent(id)}`, { method: "DELETE" });
}
// สร้างรายการเปล่าสำหรับตารางที่พิมพ์เองอิสระ (ไม่ผูกกับแคตตาล็อก)
// Builds a blank free-typed line (not catalog-linked, unlike Material Requisition's lines)
export function blankJobOrderLine(isContinuation = false): JobOrderLine {
  return { id: `joline-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, isContinuation, description: "", subDetails: [], quantity: null, unit: "", remark: "" };
}

/**
 * เช็คลิสต์ "ขอบเขตงาน (Scope of work)" ของ FM-PJ-01 — **กลุ่มเดียว 23 ตัวเลือก ไม่มีหัวข้อย่อย**
 *
 * ระหว่าง 2026-08-27 ถึง 2026-08-31 เคยถูกแตกเป็น 6 หัวข้อ (แบบและการคำนวณ / วัสดุและงานผลิต /
 * การตรวจสอบและทดสอบ / งานสี / ขนส่งและงานหน้างาน / อื่น ๆ) ซึ่งตอนนั้นเขียนกำกับไว้เองว่าเป็น
 * **การอนุมานจากความหมาย ไม่ได้อ่านจากฟอร์มกระดาษจริง** 2026-08-31 เจ้าของส่งฟอร์มจริงมาให้
 * (`reference/company/FM-PJ-01 ใบสั่งงาน Rev1 (1).pdf` เปล่า + `(3).xlsx` ที่กรอกแล้ว 3 ใบ)
 * ปรากฏว่ากระดาษเป็นรายการเรียงยาวสองคอลัมน์ ไม่มีหัวข้อย่อยแม้แต่หัวข้อเดียว จึงยุบกลับตามกระดาษ
 *
 * `reference/` ถูก gitignore ไว้ ผังด้านล่างนี้จึงเป็น**บันทึกถาวรของฟอร์ม** แบบเดียวกับที่
 * `productionOrder.ts` ทำไว้ ลำดับบนกระดาษคือ:
 *
 * | ซ้าย (11 ข้อ)                   | ขวา (12 ข้อ)                              |
 * |---------------------------------|-------------------------------------------|
 * | DESIGN AND CALCULATION SHEET    | PAINTING SYSTEM : ______                  |
 * | FABRICATION DRAWING             | SANDBLASTING SA : ______                  |
 * | SHOP DETAIL AND CUTTING PLAN    | PRIMER COAT : ______ / ______ MICRON      |
 * | RAW MATERIAL SUPPLY             | INTERMIDIATE COAT : ______ / ______ MICRON|
 * | SHOP FABRICATION AND CONSUMABLE | FINISHED COAT : ______ / ______ MICRON    |
 * | PT OR MT                        | HOT DIP GALVANIZED                        |
 * | RT 10%                          | WRAPPING                                  |
 * | HYDRO - TEST ……… BAR            | TRANSPORTATION                            |
 * | PNEUMATIC TEST ……… BAR          | SITE INSTALLATION                         |
 * | MANPOWER SUPPLY                 | EXCAVATION                                |
 * | MOBILE CRANE ……… TON            | SCAFFOLDING                               |
 * |                                 | OTHER ______                              |
 *
 * `SCOPE_COLUMN_SPLIT` ด้านล่างคือจุดตัดระหว่างสองคอลัมน์ — ใบพิมพ์ใช้ค่านี้แบ่งคอลัมน์
 * ห้ามเรียงลำดับ `options` ใหม่โดยไม่ขยับค่านี้ตาม ไม่งั้นใบพิมพ์จะแบ่งคอลัมน์ผิดจากกระดาษ
 *
 * "INTERMIDIATE" กับ "Finshed Date" บนหัวเอกสารสะกดผิดบนกระดาษจริง — พิมพ์ตามกระดาษโดยตั้งใจ
 *
 * ⚠️ **`key` ของทุกตัวเลือกคงเดิมทุกตัว** — `withJobOrderChecklistGroups()` ใช้ key จับคู่ค่าที่
 * ติ๊กไว้แล้วของเอกสารเก่า ทั้งใบที่บันทึกตอนเป็นกลุ่มเดียว (ก่อน 2026-08-27) และใบที่บันทึกตอนเป็น
 * 6 หัวข้อ (2026-08-27 ถึง 2026-08-31) จึงอ่านกลับมาได้ครบทั้งคู่ ห้ามเปลี่ยน key เด็ดขาด
 * — มี `tests/jobOrderChecklist.test.ts` คุมทั้งสองทิศทางอยู่
 */

/** จำนวนตัวเลือกในคอลัมน์ซ้ายของฟอร์มจริง — ที่เหลือคือคอลัมน์ขวา */
export const SCOPE_COLUMN_SPLIT = 11;

export function buildJobOrderChecklistGroups(): ChecklistGroup[] {
  // opt(key, label)                     ช่องติ๊กเปล่า ๆ
  // opt(key, label, { unit })           มีช่องกรอกหนึ่งช่อง (หน่วยพิมพ์ต่อท้าย ถ้ามี)
  // opt(key, label, { unit, unit2 })    มีช่องกรอกสองช่อง เช่นบรรทัดงานสี
  const opt = (
    key: string,
    label: string,
    fill?: { unit?: string; unit2?: string },
  ): ChecklistOption => {
    if (!fill) return { key, label, checked: false, details: [] };
    const base: ChecklistOption = { key, label, checked: false, value: "", details: [] };
    if (fill.unit) base.unit = fill.unit;
    if (fill.unit2 !== undefined) { base.value2 = ""; base.unit2 = fill.unit2; }
    return base;
  };
  return [
    {
      key: "scopeOfWork",
      // ไม่มีหัวข้อบนกระดาษ — ChecklistGroupCard ซ่อนแถบหัวข้อเมื่อ title ว่าง
      title: "",
      selectionType: "multiple",
      options: [
        // ── คอลัมน์ซ้าย (11 ข้อ) ────────────────────────────────────────────
        opt("designAndCalculationSheet", "DESIGN AND CALCULATION SHEET"),
        opt("fabricationDrawing", "FABRICATION DRAWING"),
        opt("shopDetailAndCuttingPlan", "SHOP DETAIL AND CUTTING PLAN"),
        opt("rawMaterialSupply", "RAW MATERIAL SUPPLY"),
        opt("shopFabricationAndConsumable", "SHOP FABRICATION AND CONSUMABLE"),
        opt("ptOrMt", "PT OR MT"),
        opt("rt10", "RT 10%"),
        opt("hydroTest", "HYDRO - TEST", { unit: "BAR" }),
        opt("pneumaticTest", "PNEUMATIC TEST", { unit: "BAR" }),
        opt("manpowerSupply", "MANPOWER SUPPLY"),
        opt("mobileCrane", "MOBILE CRANE", { unit: "TON" }),
        // ── คอลัมน์ขวา (12 ข้อ) ─────────────────────────────────────────────
        opt("paintingSystem", "PAINTING SYSTEM", {}),
        opt("sandblastingSa", "SANDBLASTING SA", {}),
        opt("primerCoat", "PRIMER COAT", { unit2: "MICRON" }),
        opt("intermediateCoat", "INTERMIDIATE COAT", { unit2: "MICRON" }),
        opt("finishedCoat", "FINISHED COAT", { unit2: "MICRON" }),
        opt("hotDipGalvanized", "HOT DIP GALVANIZED"),
        opt("wrapping", "WRAPPING"),
        opt("transportation", "TRANSPORTATION"),
        opt("siteInstallation", "SITE INSTALLATION"),
        opt("excavation", "EXCAVATION"),
        opt("scaffolding", "SCAFFOLDING"),
        opt("other", "OTHER", {}),
      ],
    },
  ];
}

/**
 * อ่านเช็คลิสต์ของเอกสารเดิมเข้าโครงสร้างปัจจุบัน โดย**คงค่าที่ติ๊กไว้แล้วทุกตัว**
 *
 * จับคู่ด้วย `ChecklistOption.key` ไม่ใช่ตำแหน่งหรือกลุ่ม จึงรับได้ทั้งสามรูปแบบที่เคยถูกบันทึกลง
 * ฐานข้อมูล: กลุ่มเดียว 23 ตัวเลือก (ก่อน 2026-08-27), 6 หัวข้อ (2026-08-27 ถึง 2026-08-31)
 * และกลุ่มเดียวไม่มีหัวข้อตามฟอร์มจริง (ตั้งแต่ 2026-08-31) — ทำงานตอนอ่านทุกครั้ง ไม่ต้อง migrate
 *
 * ป้าย/หน่วย/การแบ่งกลุ่มถูกสร้างใหม่จาก `buildJobOrderChecklistGroups()` เสมอ มีแต่สิ่งที่ผู้ใช้
 * กรอกเอง (`checked`/`value`/`value2`/`details`) ที่ถูกยกมาจากเอกสารเดิม
 *
 * ตัวเลือกแปลกปลอมที่ไม่มีในโครงสร้างปัจจุบันจะถูกยกไปไว้ท้ายกลุ่มสุดท้าย แทนที่จะถูกทิ้งเงียบ ๆ
 * (แนวเดียวกับ `withDefaultChecklistGroups()` ของ Scope of Work)
 */
export function withJobOrderChecklistGroups(existing: ChecklistGroup[] | undefined): ChecklistGroup[] {
  const defaults = buildJobOrderChecklistGroups();
  const savedByOptionKey = new Map<string, ChecklistOption>();
  for (const g of existing ?? []) for (const o of g.options) savedByOptionKey.set(o.key, o);

  const known = new Set<string>();
  const groups = defaults.map((g) => ({
    ...g,
    options: g.options.map((defOpt) => {
      known.add(defOpt.key);
      const saved = savedByOptionKey.get(defOpt.key);
      if (!saved) return defOpt;
      return {
        ...defOpt,
        checked: saved.checked,
        ...(defOpt.value !== undefined ? { value: saved.value ?? "" } : {}),
        ...(defOpt.value2 !== undefined ? { value2: saved.value2 ?? "" } : {}),
        details: saved.details ?? [],
      };
    }),
  }));

  const orphans = [...savedByOptionKey.values()].filter((o) => !known.has(o.key));
  if (orphans.length > 0) {
    const last = groups[groups.length - 1];
    groups[groups.length - 1] = { ...last, options: [...last.options, ...orphans.map((o) => ({ ...o, details: o.details ?? [] }))] };
  }
  return groups;
}

// ── ขั้นตอนอนุมัติ (ร่าง → รออนุมัติ → อนุมัติ) เพิ่ม 2026-08-20 ──────────────────────────────
// รูปแบบเดียวกับ Scope of Work ทุกประการ ดู api/_lib/documentApproval.ts
/** ส่งขออนุมัติ — ผู้ที่แก้เอกสารได้เป็นผู้ส่ง */
export async function submitJobOrderApproval(id: string): Promise<JobOrder> {
  const { jobOrder } = await apiFetch<{ jobOrder: JobOrder }>(`/job-orders/${encodeURIComponent(id)}/submit-approval`, { method: "POST" });
  return jobOrder;
}
/** อนุมัติ — ต้องมีสิทธิ์ :finalize */
export async function approveJobOrder(id: string): Promise<JobOrder> {
  const { jobOrder } = await apiFetch<{ jobOrder: JobOrder }>(`/job-orders/${encodeURIComponent(id)}/approve`, { method: "POST" });
  return jobOrder;
}
/** ไม่อนุมัติ (ตีกลับเป็นฉบับร่าง) — ต้องระบุเหตุผล */
export async function rejectJobOrder(id: string, comment: string): Promise<JobOrder> {
  const { jobOrder } = await apiFetch<{ jobOrder: JobOrder }>(`/job-orders/${encodeURIComponent(id)}/reject`, {
    method: "POST", body: JSON.stringify({ comment }),
  });
  return jobOrder;
}
/** ถอนการขออนุมัติกลับมาแก้เอง */
export async function withdrawJobOrderApproval(id: string): Promise<JobOrder> {
  const { jobOrder } = await apiFetch<{ jobOrder: JobOrder }>(`/job-orders/${encodeURIComponent(id)}/withdraw-approval`, { method: "POST" });
  return jobOrder;
}
