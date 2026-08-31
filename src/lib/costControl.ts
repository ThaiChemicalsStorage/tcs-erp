/**
 * Cost Control (แผนก BD) — added 2026-08-28.
 *
 * The document that decides whether a job is worth taking: every cost line the estimate produced,
 * totalled, marked up, and compared against the intended selling price. It is the last thing that
 * happens before a quotation goes out and the first thing anyone asks for when a job turns out to
 * have lost money.
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
 * **No total is ever stored.** `costControlTotals()` derives every figure from the lines and the
 * five markup fields at render time, the same rule `Quote.amount` and `purchaseOrderSubtotal()`
 * follow — a stored total is a total that can disagree with its own lines.
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
  /** Job order — เลขที่งานต้นทาง เช่น "PQ202608-222-SC-SK" เก็บเป็นข้อความ ไม่ผูก FK กับ Scope of Work */
  jobOrder: string;
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
  workType: string;
  docDate: string;
  status: CostControlStatus;
  /** ราคาต้นทุนรวม — เซิร์ฟเวอร์คำนวณให้หน้ารายการ ไม่ได้เก็บในฐานข้อมูล */
  totalCost: number;
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

/**
 * ราคาต้นทุนรวมทั้งใบ — คำนวณตอนแสดงผลเสมอ ไม่เก็บลงฐานข้อมูล
 *
 * **เคยมี `costControlTotals()` ที่คืนค่าดำเนินการ/Bubble/Entertainment/ราคาขาย/กำไร/คิดเป็น% ด้วย
 * ถูกถอดออกทั้งชุดเมื่อ 2026-08-31** ตามที่เจ้าของสั่ง ("เอาออก" ชี้ที่บล็อกสรุปท้ายใบพิมพ์) —
 * เอกสารนี้เหลือหน้าที่เดียวคือรวบรวมต้นทุนของงาน ส่วนการคิดกำไรไม่อยู่ในระบบอีกต่อไป
 */
export function costControlTotalCost(lines: CostControlLine[]): number {
  return lines.reduce((sum, l) => sum + lineTotalCost(l), 0);
}

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
