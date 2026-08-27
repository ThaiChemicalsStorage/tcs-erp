/**
 * Job Order (FM-PJ-01 Rev.01) — added 2026-08-18, Stage 2 (data layer only). Reproduces the printed
 * structure of public/reference/FM-PJ-01__Rev1.pdf — sent to Production when a Project item isn't in
 * the store catalog but can be fabricated in-house.
 *
 * Line items are free-typed (unlike Material Requisition's fixed catalog) since fabrication work
 * varies per job. The "ขอบเขตงาน (Scope of work)" section is a flat 23-item checklist reusing
 * ChecklistGroup/ChecklistOption from documentRequirements.ts (the same shape Scope of Work uses) —
 * several options need an associated fill-in value (micron figures, BAR/TON values, free text), which
 * is what ChecklistOption.value (added alongside this file) is for. Deliberately ONE flat group, not
 * split into the PDF's two visual columns — the source form gives those columns no explicit title/
 * business meaning of their own, so inventing one would be adding structure the source doesn't have.
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

export async function createJobOrder(projectId: string, itemId: string): Promise<JobOrder> {
  const { jobOrder } = await apiFetch<{ jobOrder: JobOrder }>("/job-orders", {
    method: "POST", body: JSON.stringify({ projectId, itemId }),
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

export async function logJobOrderPrinted(id: string): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/job-orders/${encodeURIComponent(id)}/print`, { method: "POST" });
}
export async function deleteJobOrder(id: string): Promise<void> {
  await apiFetch<void>(`/job-orders/${encodeURIComponent(id)}`, { method: "DELETE" });
}
// สร้างรายการเปล่าสำหรับตารางที่พิมพ์เองอิสระ (ไม่ผูกกับแคตตาล็อก)
// Builds a blank free-typed line (not catalog-linked, unlike Material Requisition's lines)
export function blankJobOrderLine(): JobOrderLine {
  return { id: `joline-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, description: "", quantity: null, unit: "", remark: "" };
}

/** Builds the default "ขอบเขตงาน (Scope of work)" checklist, in the reference PDF's own reading
 * order (left column top-to-bottom, then right column top-to-bottom). Every option starts unchecked
 * with a blank value — nothing is pre-selected, same "don't guess" convention Scope of Work's own
 * default-checklist builder follows. */
/**
 * เช็คลิสต์ขอบเขตงานของ FM-PJ-01 — **แบ่งเป็นหลายหัวข้อตั้งแต่ 2026-08-27** ตามที่ฝ่ายโครงการขอ
 * ("ติ๊กเลือกได้ว่าจะเอาตัวไหน แบบหลายหัวข้อ") เดิมเป็นกลุ่มเดียว 23 ตัวเลือกเรียงยาว
 *
 * ⚠️ **`key` ของทุกตัวเลือกคงเดิมทุกตัว** — `withJobOrderChecklistGroups()` ด้านล่างใช้ key จับคู่
 * ย้ายค่าที่ติ๊กไว้แล้วเข้ากลุ่มใหม่ ใบสั่งงานเก่าจึงไม่เสียข้อมูล ห้ามเปลี่ยน key เด็ดขาด
 *
 * ⚠️ **การจัดกลุ่มเป็นการอนุมานจากความหมายของแต่ละหัวข้อ ไม่ได้อ่านจากฟอร์มกระดาษจริง**
 * (`reference/` ถูก gitignore ไว้) ลำดับและชื่อหัวข้อควรถูกตรวจกับฟอร์มจริงอีกครั้ง — ดู TODO.md
 */
export function buildJobOrderChecklistGroups(): ChecklistGroup[] {
  const opt = (key: string, label: string, hasValue = false): ChecklistOption =>
    hasValue
      ? { key, label, checked: false, value: "", details: [] }
      : { key, label, checked: false, details: [] };
  return [
    {
      key: "scopeOfWork",
      title: "แบบและการคำนวณ (Design & Drawing)",
      selectionType: "multiple",
      options: [
        opt("designAndCalculationSheet", "DESIGN AND CALCULATION SHEET"),
        opt("fabricationDrawing", "FABRICATION DRAWING"),
        opt("shopDetailAndCuttingPlan", "SHOP DETAIL AND CUTTING PLAN"),
      ],
    },
    {
      key: "scopeMaterialFabrication",
      title: "วัสดุและงานผลิต (Material & Fabrication)",
      selectionType: "multiple",
      options: [
        opt("rawMaterialSupply", "RAW MATERIAL SUPPLY"),
        opt("shopFabricationAndConsumable", "SHOP FABRICATION AND CONSUMABLE"),
        opt("hotDipGalvanized", "HOT DIP GALVANIZED"),
      ],
    },
    {
      key: "scopeInspectionTesting",
      title: "การตรวจสอบและทดสอบ (Inspection & Testing)",
      selectionType: "multiple",
      options: [
        opt("ptOrMt", "PT OR MT"),
        opt("rt10", "RT 10%"),
        opt("hydroTest", "HYDRO-TEST", true),
        opt("pneumaticTest", "PNEUMATIC TEST", true),
      ],
    },
    {
      key: "scopePainting",
      title: "งานสี (Painting)",
      selectionType: "multiple",
      options: [
        opt("sandblastingSa", "SANDBLASTING SA", true),
        opt("paintingSystem", "PAINTING SYSTEM", true),
        opt("primerCoat", "PRIMER COAT", true),
        opt("intermediateCoat", "INTERMIDIATE COAT", true),
        opt("finishedCoat", "FINISHED COAT", true),
      ],
    },
    {
      key: "scopeSiteWork",
      title: "ขนส่งและงานหน้างาน (Transport & Site)",
      selectionType: "multiple",
      options: [
        opt("wrapping", "WRAPPING"),
        opt("transportation", "TRANSPORTATION"),
        opt("siteInstallation", "SITE INSTALLATION"),
        opt("excavation", "EXCAVATION"),
        opt("scaffolding", "SCAFFOLDING"),
        opt("mobileCrane", "MOBILE CRANE", true),
        opt("manpowerSupply", "MANPOWER SUPPLY"),
      ],
    },
    {
      key: "scopeOther",
      title: "อื่น ๆ (Other)",
      selectionType: "multiple",
      options: [opt("other", "OTHER", true)],
    },
  ];
}

/**
 * จัดกลุ่มเช็คลิสต์ของเอกสารเดิมให้เข้ากับโครงสร้างหัวข้อปัจจุบัน โดย**คงค่าที่ติ๊กไว้แล้วทุกตัว**
 *
 * จับคู่ด้วย `ChecklistOption.key` ไม่ใช่ตำแหน่งหรือกลุ่ม — ใบสั่งงานที่บันทึกไว้ก่อน 2026-08-27
 * มีกลุ่มเดียวชื่อ `scopeOfWork` ที่บรรจุ 23 ตัวเลือก ฟังก์ชันนี้จะกระจายมันเข้าหัวข้อใหม่ให้เอง
 * โดยที่ `checked`/`value`/`details` เดิมติดไปด้วย ทำงานตอนอ่านทุกครั้ง ไม่ต้อง migrate ฐานข้อมูล
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
