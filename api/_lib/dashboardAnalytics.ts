import { workflowTransitions } from "./quoteWorkflow.js";
import type { StageProbability, ClosingProbability, StatusBySalespersonRow } from "../../src/lib/dashboard.js";

/**
 * ตัวคำนวณล้วนของแดชบอร์ดที่เพิ่ม 2026-09-07 สำหรับไฟล์ Excel แบบละเอียด — แยกออกจาก
 * `api/dashboard/index.ts` (1,100+ บรรทัด อ่านฐานข้อมูลปนกับคำนวณ) เพื่อให้เทสต์ยิงตรง ๆ ได้โดยไม่ต้อง
 * seed MongoDB ทั้งก้อน (idiom เดียวกับ `deductionsFor()` ในใบเบิก)
 *
 * **โอกาสปิดการขาย** — เจ้าของเลือกให้ *"คิดจากสถิติจริงให้อัตโนมัติ"* แทนการเพิ่มช่อง % ให้เซลล์กรอก
 * นิยาม: ประชากรคือใบที่**ปิดไปแล้ว** (ชนะ/แพ้/ลูกค้าปฏิเสธ/ยกเลิก) ในหน้าต่างย้อนหลัง 12 เดือน ทั้งบริษัท
 * (ข้อยกเว้นเดียวกับ forecast baseline: ตัวอย่างต่อเซลล์เล็กเกินจะกลายเป็นสัญญาณรบกวน) · สำหรับขั้นเปิด S
 * แต่ละขั้น `P(ชนะ | เคยถึง S)` = ใบที่เคยถึง S แล้วชนะ ÷ ใบที่เคยถึง S · ขั้นที่ตัวอย่างน้อยกว่า
 * `MIN_STAGE_SAMPLE` ตอบ `null` = "ข้อมูลไม่พอ" ไม่ใช่ 0% ซึ่งจะโกหกว่าไม่มีทางปิดได้
 */

export const OPEN_STAGES = ["ร่าง", "รออนุมัติ", "อนุมัติแล้ว", "ส่งให้ลูกค้าแล้ว", "ลูกค้ายอมรับ"] as const;
export type OpenStage = (typeof OPEN_STAGES)[number];
/** ต่ำกว่านี้ไม่กล้าบอกเปอร์เซ็นต์ — ตัวเลขที่รอไว้ให้ธุรกิจยืนยัน (ดู docs/TODO.md) */
export const MIN_STAGE_SAMPLE = 5;

const WON_STATUS = "ปิดการขายสำเร็จ";
const LOST_STATUS = "เสียโอกาส";
const CUSTOMER_REJECTED_STATUS = "ลูกค้าปฏิเสธ";
const STAGE_INDEX = new Map<string, number>(OPEN_STAGES.map((s, i) => [s, i]));

export interface OutcomeDoc {
  _id: string;
  status: string;
  approvalHistory?: { action: string; createdAt: string }[];
}

/**
 * ขั้นเปิดทั้งหมดที่ใบเคยผ่าน อนุมานจากสองแหล่งรวมกัน:
 *   1. ลำดับสถานะปลายทาง — ชนะ = ผ่านครบ 5 ขั้น · แพ้/ลูกค้าปฏิเสธ = ผ่าน 4 ขั้นแรก (ไม่รวม "ลูกค้ายอมรับ"
 *      เพราะแพ้แตกแขนงออกจาก "ส่งให้ลูกค้าแล้ว" ดู workflowTransitions)
 *   2. `approvalHistory` — ทุก `to` ของ action ที่เกิดขึ้นจริง ตัวนี้เป็นตัวเดียวที่บอกได้ว่าใบ "ยกเลิก"
 *      ไปไกลถึงขั้นไหนก่อนยกเลิก (ยกเลิกจากร่าง ≠ ยกเลิกหลังอนุมัติ) · ใบเก่าที่ไม่มีประวัติจะได้แค่ข้อ 1
 * ทุกใบผ่าน "ร่าง" เสมอ
 */
export function reachedStages(doc: OutcomeDoc): Set<string> {
  const reached = new Set<string>(["ร่าง"]);
  const upTo = (stage: OpenStage) => {
    const idx = STAGE_INDEX.get(stage) ?? 0;
    for (let i = 0; i <= idx; i += 1) reached.add(OPEN_STAGES[i]);
  };
  if (doc.status === WON_STATUS) upTo("ลูกค้ายอมรับ");
  else if (doc.status === LOST_STATUS || doc.status === CUSTOMER_REJECTED_STATUS) upTo("ส่งให้ลูกค้าแล้ว");
  else if (STAGE_INDEX.has(doc.status)) upTo(doc.status as OpenStage);
  for (const entry of doc.approvalHistory ?? []) {
    const transition = workflowTransitions[entry.action as keyof typeof workflowTransitions];
    if (transition && STAGE_INDEX.has(transition.to)) upTo(transition.to as OpenStage);
  }
  return reached;
}

export interface StageStat {
  stage: string;
  sampleSize: number;
  wonCount: number;
  /** 0–100 ปัดทศนิยมหนึ่งตำแหน่ง · null = ตัวอย่างไม่พอ */
  probability: number | null;
}

/** P(ชนะ | เคยถึงขั้น S) ต่อขั้นเปิด จากใบที่ปิดแล้ว */
export function computeStageProbabilities(closed: OutcomeDoc[], minSample = MIN_STAGE_SAMPLE): StageStat[] {
  const reachedByDoc = closed.map((d) => ({ won: d.status === WON_STATUS, reached: reachedStages(d) }));
  return OPEN_STAGES.map((stage) => {
    const sample = reachedByDoc.filter((r) => r.reached.has(stage));
    const wonCount = sample.filter((r) => r.won).length;
    const sampleSize = sample.length;
    return {
      stage,
      sampleSize,
      wonCount,
      probability: sampleSize >= minSample ? Math.round((wonCount / sampleSize) * 1000) / 10 : null,
    };
  });
}

export interface OpenDoc {
  _id: string;
  status: string;
  salesperson: string;
  amount: number;
}

/**
 * pipeline ถ่วงน้ำหนัก — ใบที่ยังเปิดอยู่ทุกใบ × โอกาสของขั้นที่มันอยู่ · ขั้นที่ตัวอย่างไม่พอใช้อัตราชนะรวม
 * ของบริษัทแทน (`fallbackRate` 0–100 = `forecast.historicalWinRate`) และติดป้าย `source: "fallback"` ให้เห็นในชีต
 */
export function computeWeightedPipeline(
  open: OpenDoc[],
  stageStats: StageStat[],
  fallbackRate: number,
): Pick<ClosingProbability, "stages" | "totalOpenCount" | "totalOpenValue" | "totalWeightedValue" | "bySalesperson"> {
  const statByStage = new Map(stageStats.map((s) => [s.stage, s]));
  const appliedFor = (stage: string): { applied: number; source: StageProbability["source"] } => {
    const stat = statByStage.get(stage);
    if (stat && stat.probability !== null) return { applied: stat.probability, source: "stage" };
    return { applied: fallbackRate, source: "fallback" };
  };

  const stages: StageProbability[] = OPEN_STAGES.map((stage) => {
    const stat = statByStage.get(stage) ?? { stage, sampleSize: 0, wonCount: 0, probability: null };
    const { applied, source } = appliedFor(stage);
    const mine = open.filter((q) => q.status === stage);
    const openValue = mine.reduce((s, q) => s + q.amount, 0);
    return {
      stage,
      sampleSize: stat.sampleSize,
      wonCount: stat.wonCount,
      probability: stat.probability,
      source,
      appliedProbability: applied,
      openCount: mine.length,
      openValue,
      weightedValue: Math.round(openValue * applied) / 100,
    };
  });

  const bySalespersonMap = new Map<string, { openCount: number; openValue: number; weightedValue: number }>();
  for (const q of open) {
    if (!STAGE_INDEX.has(q.status)) continue;
    const name = q.salesperson.trim() || "(ไม่ระบุ)";
    const row = bySalespersonMap.get(name) ?? { openCount: 0, openValue: 0, weightedValue: 0 };
    row.openCount += 1;
    row.openValue += q.amount;
    row.weightedValue += (q.amount * appliedFor(q.status).applied) / 100;
    bySalespersonMap.set(name, row);
  }
  const bySalesperson = [...bySalespersonMap]
    .map(([salesperson, r]) => ({ salesperson, openCount: r.openCount, openValue: r.openValue, weightedValue: Math.round(r.weightedValue * 100) / 100 }))
    .sort((a, b) => b.weightedValue - a.weightedValue);

  return {
    stages,
    totalOpenCount: stages.reduce((s, st) => s + st.openCount, 0),
    totalOpenValue: stages.reduce((s, st) => s + st.openValue, 0),
    totalWeightedValue: Math.round(stages.reduce((s, st) => s + st.weightedValue, 0) * 100) / 100,
    bySalesperson,
  };
}

/** โอกาสปิดของขั้นที่ใบหนึ่งอยู่ — ค่าที่ใช้จริงในการถ่วงน้ำหนัก (0–100) หรือ null เมื่อใบไม่ได้อยู่ขั้นเปิด */
export function appliedProbabilityFor(stages: StageProbability[], status: string): number | null {
  const stat = stages.find((s) => s.stage === status);
  return stat ? stat.appliedProbability : null;
}

/**
 * เมทริกซ์ เซลล์ × สถานะ (จำนวน + มูลค่า) — เติมศูนย์ให้ครบทุกสถานะตาม `statusOrder` เพื่อให้ชีตมีคอลัมน์
 * คงที่ · ชื่อว่างรวมเป็น "(ไม่ระบุ)" · เรียงตามมูลค่ารวมมากไปน้อย
 */
export function computeStatusBySalesperson(
  docs: { salesperson: string; status: string; amount: number }[],
  statusOrder: readonly string[],
): StatusBySalespersonRow[] {
  const rows = new Map<string, Map<string, { count: number; value: number }>>();
  for (const q of docs) {
    const name = q.salesperson.trim() || "(ไม่ระบุ)";
    const cells = rows.get(name) ?? new Map(statusOrder.map((s) => [s, { count: 0, value: 0 }]));
    const cell = cells.get(q.status) ?? { count: 0, value: 0 };
    cell.count += 1;
    cell.value += q.amount;
    cells.set(q.status, cell);
    rows.set(name, cells);
  }
  return [...rows]
    .map(([salesperson, cells]) => {
      const ordered = statusOrder.map((status) => ({ status, ...(cells.get(status) ?? { count: 0, value: 0 }) }));
      return {
        salesperson,
        cells: ordered,
        total: {
          count: ordered.reduce((s, c) => s + c.count, 0),
          value: ordered.reduce((s, c) => s + c.value, 0),
        },
      };
    })
    .sort((a, b) => b.total.value - a.total.value);
}

/** วันที่ปิดใบ (YYYY-MM-DD) จาก action สุดท้ายที่ปิดใบ — null ถ้ายังไม่ปิดหรือไม่มีประวัติ */
export function closingDateOf(history: { action: string; createdAt: string }[] | undefined): string | null {
  const closers = new Set(["marked_won", "marked_lost", "cancelled", "customer_rejected"]);
  const last = [...(history ?? [])].reverse().find((e) => closers.has(e.action));
  return last ? last.createdAt.slice(0, 10) : null;
}

/** จำนวนวันระหว่างสองวันที่ ISO (ปัดทศนิยมหนึ่งตำแหน่ง) — null เมื่อวันไหนว่างหรืออ่านไม่ออก */
export function daysBetweenIso(a: string, b: string): number | null {
  if (!a || !b) return null;
  const ta = Date.parse(`${a.slice(0, 10)}T00:00:00Z`);
  const tb = Date.parse(`${b.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return null;
  return Math.round(((tb - ta) / 86_400_000) * 10) / 10;
}
