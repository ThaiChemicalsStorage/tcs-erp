/**
 * Cost Control (แผนก BD) — added 2026-08-28.
 *
 * รวบรวมต้นทุนทุกบรรทัดของงานไว้ในเอกสารเดียว ทำก่อนใบเสนอราคาออก
 *
 * ⚠️ **ตอนสร้างโมดูลนี้คิดกำไรให้ด้วย** (ต้นทุน + ค่าดำเนินการ/Bubble/Entertainment เทียบราคาขาย
 * ออกมาเป็นกำไรและคิดเป็น%) — เจ้าของสั่งถอดออกทั้งหมดเมื่อ 2026-08-31 แล้วสั่งเพิ่มให้เอาแม้แต่
 * ยอดต้นทุนรวมออกด้วย · **ตอนนี้เอกสารนี้ไม่รวมยอดที่ไหนเลย** มีแต่ต้นทุนรายบรรทัดในตาราง
 *
 * **This module closes a gap the repo had been carrying since 2026-08-20.** Both the Project and
 * the Production specs open with "เมื่อได้รับ Scope of Work, **Cost Control** แล้ว …", and five
 * separate places in `docs/` recorded that it could not be built because nobody had said what Cost
 * Control *was*. The answer turned out to be: an Excel sheet the company already fills in by hand.
 *
 * **The structure below is transcribed from a real filled-in workbook**, not designed —
 * `PQ202608-222-SC-SK - บริษัท โรงงานแปรรูปขยะชุมชนวังไผ่.xlsx`, sheet `COST CONTROL-SC`. That file
 * lives under `reference/` and is gitignored, so the field list here (and the parser in
 * `costControlImport.ts`) is the durable record of the form's shape. Treat it as the source of
 * truth rather than expecting to re-open the spreadsheet.
 *
 * Numbering is `CC-{พ.ศ.}-{NNNN}`, Buddhist year, matching PR/PO/MR/JO.
 *
 * **ไม่มียอดรวมที่ไหนเลย ไม่ว่าจะเก็บไว้หรือคำนวณตอนแสดงผล** — เหลือแค่ `lineTotalCost()`
 * (จำนวน × ต้นทุน) ซึ่งเป็นช่องหนึ่งในตารางรายการตามฟอร์มจริง ไม่ใช่ยอดของทั้งใบ
 */

import { apiFetch, writeQuery, type WriteOptions } from "./apiClient.js";

/** ร่าง → รออนุมัติ → อนุมัติ — the shared engine in `api/_lib/documentApproval.ts`. */
export type CostControlStatus = "Draft" | "PendingApproval" | "Final";

/**
 * Three row kinds, stored rather than inferred.
 *
 * The real sheet distinguishes them only by which cells happen to be filled — a group heading is a
 * row with text and no numbers, a sub-line is a row with numbers but no sequence number. Guessing
 * that back at render time works until someone types a group heading that happens to have a cost,
 * so the kind is recorded once at import and kept.
 */
export type CostControlLineKind = "group" | "item" | "sub";

export interface CostControlLine {
  id: string;
  kind: CostControlLineKind;
  /** ลำดับที่ — only meaningful on `item` rows; "" on groups and sub-lines. */
  seq: string;
  /** รายละเอียด */
  description: string;
  /** Model */
  model: string;
  /** supplier name — free text (e.g. "TCS", "Kruger"). There is no vendor master yet. */
  supplierName: string;
  /** จำนวน — null = ไม่ระบุ (group headings never have one) */
  qty: number | null;
  /** หน่วย (Lot / Set / Cu.m. / Job …) */
  unit: string;
  /** ต้นทุน ต่อหน่วย — null = ไม่ระบุ */
  unitCost: number | null;
}

export interface CostControl {
  id: string;
  /** เลขที่เอกสาร — แก้เองได้ ตั้งต้นเท่ากับ `id` */
  documentNumber: string;
  /** Job Name — ชื่อลูกค้า/โครงการ ตามหัวใบจริง */
  jobName: string;
  /** Work type (เช่น "Wet Scrubber 2 System") */
  workType: string;
  /** Job order — เลขที่งานต้นทาง เช่น "PQ202608-222-SC-SK" · **ข้อความล้วน** พิมพ์เองหรือแกะมาจากหัวชีต */
  jobOrder: string;
  /**
   * Scope of Work ต้นทาง — `""` ถ้าเป็นใบเดี่ยว (เพิ่ม 2026-08-31)
   *
   * **นี่คือ FK จริง ต่างจาก `jobOrder` ข้างบนที่เป็นข้อความล้วน** และมันคือสิ่งที่ทำให้ Cost Control
   * "ไปพร้อมกับ" Scope of Work ตอนกดส่งแจ้งเตือนผู้รับเอกสาร — คนที่ถูกเลือกเป็นผู้รับของ Scope ใบนั้น
   * จะเห็นใบนี้ในรายการของตัวเองและเปิดอ่าน/พิมพ์ได้ แต่แก้ไม่ได้ (ดู `api/_lib/costControlHandler.ts`)
   *
   * ผูกกี่ใบต่อหนึ่ง Scope ก็ได้ **ไม่มี unique index** ตามที่เจ้าของสั่ง ("ปกติใบเดียว แต่ไม่บังคับ") —
   * ธรรมเนียมเดียวกับ `scopeOfWorkId` ของใบส่งมอบสินค้าและโครงการ
   */
  scopeOfWorkId: string;
  /** Date บนหัวใบ (YYYY-MM-DD) */
  docDate: string;

  lines: CostControlLine[];

  // เคยมีบล็อกสรุป 1-5 อยู่ตรงนี้ (ค่าดำเนินการ + %, Bubble + %, Entertainment, ราคาขาย) พร้อมกำไร
  // และคิดเป็น% ที่คำนวณจากมัน — **ถอดออกทั้งชุด 2026-08-31** ตามที่เจ้าของสั่ง
  // เอกสารเก่าที่มีค่าเหล่านี้อยู่ในฐานข้อมูลไม่ได้ถูกลบทิ้ง แค่ไม่มีใครอ่านมันอีกแล้ว
  // (ธรรมเนียมเดียวกับตอนถอด Company Profiles และใบตรวจรับ — ลบโค้ด ไม่ลบข้อมูล)

  remarks: string;
  submittedBy: string;
  approvedBy: string;

  /** ไฟล์ที่โยนเข้ามาสร้างใบนี้ — "" ถ้าไม่ได้มาจากไฟล์ */
  sourceFileName: string;
  /** ISO timestamp ตอนนำเข้า — "" ถ้าไม่ได้มาจากไฟล์ */
  importedAt: string;

  status: CostControlStatus;
  approvedByUserId: string;
  approvedAt: string;
  rejectionComment: string;
  revisionNote: string;

  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  isDeleted: boolean;
}

export interface CostControlSummary {
  id: string;
  documentNumber: string;
  jobName: string;
  jobOrder: string;
  scopeOfWorkId: string;
  workType: string;
  docDate: string;
  status: CostControlStatus;
  updatedAt: string;
}

export function blankCostControlLine(id: string, kind: CostControlLineKind = "item"): CostControlLine {
  return { id, kind, seq: "", description: "", model: "", supplierName: "", qty: null, unit: "", unitCost: null };
}

/** ต้นทุนรวมของบรรทัดเดียว — จำนวน × ต้นทุน · หัวกลุ่มไม่มีต้นทุน */
export function lineTotalCost(line: CostControlLine): number {
  if (line.kind === "group") return 0;
  return (line.qty ?? 0) * (line.unitCost ?? 0);
}

// เอกสารนี้ **ไม่มีการรวมยอดใด ๆ ทั้งสิ้น** (2026-08-31)
//
// เดิมมี `costControlTotals()` ที่คิดค่าดำเนินการ/Bubble/Entertainment/ราคาขาย/กำไร/คิดเป็น% แล้ว
// ถูกลดเหลือ `costControlTotalCost()` ที่คิดแค่ยอดต้นทุนรวม แล้วเจ้าของสั่งให้เอายอดนั้นออกอีกที
// ("ทำไมยังมีต้นทุนรวมอยู่ เอาออกไปด้วย") — เหลือแค่ `lineTotalCost()` ที่คิด จำนวน × ต้นทุน
// ของแต่ละบรรทัด ซึ่งเป็นช่องหนึ่งในตารางรายการ ไม่ใช่ยอดของทั้งใบ

// ── API ──────────────────────────────────────────────────────────────────────

export async function fetchAllCostControls(): Promise<CostControlSummary[]> {
  const { costControls } = await apiFetch<{ costControls: CostControlSummary[] }>("/cost-controls");
  return costControls;
}

export async function fetchCostControl(id: string): Promise<CostControl> {
  const { costControl } = await apiFetch<{ costControl: CostControl }>(`/cost-controls/${encodeURIComponent(id)}`);
  return costControl;
}

/** ข้อมูลที่หน้า preview ยืนยันแล้ว — ส่งเป็น JSON ที่แกะจากไฟล์ฝั่งเบราว์เซอร์แล้ว ไม่ได้อัปโหลดไฟล์ดิบ */
export interface CostControlCreateFields {
  jobName: string;
  workType: string;
  jobOrder: string;
  docDate: string;
  lines: CostControlLine[];
  sourceFileName: string;
  /** ผูกกับ Scope of Work ตั้งแต่ตอนสร้าง — ไม่ส่งมาก็ได้ แปลว่าเป็นใบเดี่ยว */
  scopeOfWorkId?: string;
}

/**
 * ใบที่ผูกกับ Scope of Work ใบหนึ่ง — ใช้ตรวจว่ามีอยู่แล้วหรือยัง ก่อนจะกดสร้างซ้ำ
 * **ตั้งใจไม่กรองตามคนสร้างฝั่งเซิร์ฟเวอร์** ด้วยเหตุผลเดียวกับรายการใบส่งมอบสินค้า:
 * การเช็คว่ามีอยู่แล้วไหมต้องไม่ซ่อนใบของเพื่อนร่วมงานจนคนกดสร้างซ้ำ
 */
export async function fetchCostControlsByScope(scopeOfWorkId: string): Promise<CostControlSummary[]> {
  const { costControls } = await apiFetch<{ costControls: CostControlSummary[] }>(
    `/cost-controls?scopeOfWorkId=${encodeURIComponent(scopeOfWorkId)}`,
  );
  return costControls;
}

/** เปิดใบเปล่าที่ผูกกับ Scope of Work ใบนี้ — หัวใบ (ชื่องาน/เลขที่งาน/ประเภทงาน) เซิร์ฟเวอร์เติมให้จาก Scope */
export async function createCostControlFromScope(scopeOfWorkId: string): Promise<CostControl> {
  const { costControl } = await apiFetch<{ costControl: CostControl }>("/cost-controls", {
    method: "POST", body: JSON.stringify({ scopeOfWorkId }),
  });
  return costControl;
}

/**
 * เปิดใบเปล่าแล้วกรอกเองทั้งใบ — เพิ่ม 2026-08-28 ตามที่เจ้าของสั่งเพิ่มระหว่างทำ
 * ("cost control ไม่ต้องโยนไฟล์ก็สร้างเองได้ด้วยดิ") เซิร์ฟเวอร์รับ payload ว่างอยู่แล้ว
 * เพราะทุกฟิลด์ของใบนี้เป็น optional ตั้งแต่แรก
 */
export async function createBlankCostControl(): Promise<CostControl> {
  const { costControl } = await apiFetch<{ costControl: CostControl }>("/cost-controls", {
    method: "POST", body: JSON.stringify({}),
  });
  return costControl;
}

export async function createCostControl(fields: CostControlCreateFields): Promise<CostControl> {
  const { costControl } = await apiFetch<{ costControl: CostControl }>("/cost-controls", {
    method: "POST", body: JSON.stringify(fields),
  });
  return costControl;
}

export type CostControlUpdateFields = Partial<Omit<CostControl, "id" | "createdAt" | "createdBy" | "isDeleted">>;

export async function updateCostControl(id: string, fields: CostControlUpdateFields, options?: WriteOptions): Promise<CostControl> {
  const { costControl } = await apiFetch<{ costControl: CostControl }>(
    `/cost-controls/${encodeURIComponent(id)}${writeQuery(options)}`,
    { method: "PATCH", body: JSON.stringify(fields) },
  );
  return costControl;
}

export async function deleteCostControl(id: string): Promise<void> {
  await apiFetch(`/cost-controls/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/** สร้างฉบับแก้ไขใหม่ (`-R{n}`) จากใบที่อนุมัติแล้ว — หมายเหตุการแก้ไขเริ่มว่างเสมอ */
export async function rewriteCostControl(id: string): Promise<CostControl> {
  const { costControl } = await apiFetch<{ costControl: CostControl }>(`/cost-controls/${encodeURIComponent(id)}/rewrite`, { method: "POST" });
  return costControl;
}

export async function logCostControlPrinted(id: string): Promise<void> {
  await apiFetch(`/cost-controls/${encodeURIComponent(id)}/print`, { method: "POST" });
}

// ── ขั้นตอนอนุมัติ — ใช้ documentApproval.ts ร่วมกับเอกสารอื่น ──────────────────────────────────
export async function submitCostControlApproval(id: string): Promise<CostControl> {
  const { costControl } = await apiFetch<{ costControl: CostControl }>(`/cost-controls/${encodeURIComponent(id)}/submit-approval`, { method: "POST" });
  return costControl;
}
export async function approveCostControl(id: string): Promise<CostControl> {
  const { costControl } = await apiFetch<{ costControl: CostControl }>(`/cost-controls/${encodeURIComponent(id)}/approve`, { method: "POST" });
  return costControl;
}
export async function rejectCostControl(id: string, comment: string): Promise<CostControl> {
  const { costControl } = await apiFetch<{ costControl: CostControl }>(`/cost-controls/${encodeURIComponent(id)}/reject`, {
    method: "POST", body: JSON.stringify({ comment }),
  });
  return costControl;
}
export async function withdrawCostControlApproval(id: string): Promise<CostControl> {
  const { costControl } = await apiFetch<{ costControl: CostControl }>(`/cost-controls/${encodeURIComponent(id)}/withdraw-approval`, { method: "POST" });
  return costControl;
}
