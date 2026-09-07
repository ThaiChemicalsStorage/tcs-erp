import { describe, it, expect } from "vitest";
import {
  reachedStages, computeStageProbabilities, computeWeightedPipeline, computeStatusBySalesperson,
  closingDateOf, daysBetweenIso, OPEN_STAGES, MIN_STAGE_SAMPLE,
} from "../api/_lib/dashboardAnalytics";

/**
 * โอกาสปิดการขายจากสถิติจริง + เมทริกซ์เซลล์×สถานะ (2026-09-07) — ตัวเลขที่ลงไฟล์ Excel ให้ผู้บริหารดู
 * พลาดตรงนี้แล้วไม่มีอะไรฟ้อง เพราะเปอร์เซ็นต์ที่ผิดก็ยังเป็นเปอร์เซ็นต์ที่ดูน่าเชื่อ
 */

const h = (...actions: string[]) => actions.map((action, i) => ({ action, createdAt: `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00Z` }));
const won = (id: string) => ({ _id: id, status: "ปิดการขายสำเร็จ", approvalHistory: h("submitted", "approved", "sent_to_customer", "customer_accepted", "marked_won") });
const lost = (id: string) => ({ _id: id, status: "เสียโอกาส", approvalHistory: h("submitted", "approved", "sent_to_customer", "customer_rejected", "marked_lost") });

describe("reachedStages — ใบเคยผ่านขั้นไหนบ้าง", () => {
  it("ชนะ = ผ่านครบ 5 ขั้นเปิด", () => {
    expect([...reachedStages(won("a"))]).toEqual([...OPEN_STAGES]);
  });
  it("แพ้ = ผ่าน 4 ขั้น ไม่รวม 'ลูกค้ายอมรับ' (แพ้แตกแขนงจาก 'ส่งให้ลูกค้าแล้ว')", () => {
    const r = reachedStages(lost("b"));
    expect(r.has("ส่งให้ลูกค้าแล้ว")).toBe(true);
    expect(r.has("ลูกค้ายอมรับ")).toBe(false);
  });
  it("ยกเลิกจากร่าง = ผ่านแค่ 'ร่าง' · ยกเลิกหลังอนุมัติ = ผ่าน 3 ขั้น (อ่านจากประวัติ)", () => {
    expect([...reachedStages({ _id: "c", status: "ยกเลิก", approvalHistory: h("cancelled") })]).toEqual(["ร่าง"]);
    expect([...reachedStages({ _id: "d", status: "ยกเลิก", approvalHistory: h("submitted", "approved", "cancelled") })])
      .toEqual(["ร่าง", "รออนุมัติ", "อนุมัติแล้ว"]);
  });
  it("ใบเก่าไม่มีประวัติ → ใช้ลำดับสถานะปลายทางอย่างเดียว ไม่พัง", () => {
    expect([...reachedStages({ _id: "e", status: "ปิดการขายสำเร็จ" })]).toEqual([...OPEN_STAGES]);
    expect([...reachedStages({ _id: "f", status: "ยกเลิก" })]).toEqual(["ร่าง"]);
  });
});

describe("computeStageProbabilities", () => {
  it("ตัวอย่างพอ → เปอร์เซ็นต์จริง · 'ลูกค้ายอมรับ' มีแต่ใบชนะผ่าน = 100%", () => {
    const closed = [won("1"), won("2"), won("3"), won("4"), won("5"), lost("6"), lost("7"), lost("8"), lost("9"), lost("10")];
    const stats = computeStageProbabilities(closed);
    const byStage = Object.fromEntries(stats.map((s) => [s.stage, s]));
    expect(byStage["ร่าง"]).toMatchObject({ sampleSize: 10, wonCount: 5, probability: 50 });
    expect(byStage["ส่งให้ลูกค้าแล้ว"]).toMatchObject({ sampleSize: 10, wonCount: 5, probability: 50 });
    expect(byStage["ลูกค้ายอมรับ"]).toMatchObject({ sampleSize: 5, wonCount: 5, probability: 100 });
  });
  it(`ตัวอย่างต่ำกว่า ${MIN_STAGE_SAMPLE} → null ไม่ใช่ 0%`, () => {
    const stats = computeStageProbabilities([won("1"), lost("2"), lost("3")]);
    expect(stats.every((s) => s.probability === null)).toBe(true);
    expect(stats.find((s) => s.stage === "ร่าง")).toMatchObject({ sampleSize: 3, wonCount: 1 });
  });
  it("ไม่มีใบปิดเลย → ทุกขั้น null ตัวอย่าง 0", () => {
    expect(computeStageProbabilities([]).every((s) => s.probability === null && s.sampleSize === 0)).toBe(true);
  });
});

describe("computeWeightedPipeline", () => {
  const stats = [
    { stage: "ร่าง", sampleSize: 10, wonCount: 2, probability: 20 },
    { stage: "รออนุมัติ", sampleSize: 2, wonCount: 1, probability: null },
    { stage: "อนุมัติแล้ว", sampleSize: 8, wonCount: 4, probability: 50 },
    { stage: "ส่งให้ลูกค้าแล้ว", sampleSize: 6, wonCount: 4, probability: 66.7 },
    { stage: "ลูกค้ายอมรับ", sampleSize: 5, wonCount: 5, probability: 100 },
  ];
  const open = [
    { _id: "a", status: "ร่าง", salesperson: "เอ", amount: 1000 },
    { _id: "b", status: "รออนุมัติ", salesperson: "เอ", amount: 1000 },
    { _id: "c", status: "ลูกค้ายอมรับ", salesperson: "บี", amount: 500 },
    { _id: "d", status: "ปิดการขายสำเร็จ", salesperson: "บี", amount: 999 }, // ไม่ใช่ขั้นเปิด ต้องถูกข้าม
  ];

  it("ใช้ค่าของขั้นเมื่อมี ใช้อัตราชนะรวมเมื่อไม่มี และติดป้ายที่มา", () => {
    const r = computeWeightedPipeline(open, stats, 40);
    const draft = r.stages.find((s) => s.stage === "ร่าง")!;
    const pending = r.stages.find((s) => s.stage === "รออนุมัติ")!;
    expect(draft).toMatchObject({ source: "stage", appliedProbability: 20, openCount: 1, openValue: 1000, weightedValue: 200 });
    expect(pending).toMatchObject({ source: "fallback", appliedProbability: 40, probability: null, openValue: 1000, weightedValue: 400 });
    expect(r.totalOpenCount).toBe(3);
    expect(r.totalOpenValue).toBe(2500);
    expect(r.totalWeightedValue).toBe(200 + 400 + 500);
  });
  it("รวมรายเซลล์ เรียงตามมูลค่าถ่วงน้ำหนัก", () => {
    const r = computeWeightedPipeline(open, stats, 40);
    expect(r.bySalesperson).toEqual([
      { salesperson: "เอ", openCount: 2, openValue: 2000, weightedValue: 600 },
      { salesperson: "บี", openCount: 1, openValue: 500, weightedValue: 500 },
    ]);
  });
});

describe("computeStatusBySalesperson", () => {
  const order = ["ร่าง", "รออนุมัติ", "ปิดการขายสำเร็จ"];
  it("เติมศูนย์ครบทุกสถานะ เรียงตามมูลค่า ชื่อว่างเป็น (ไม่ระบุ)", () => {
    const rows = computeStatusBySalesperson([
      { salesperson: "เอ", status: "ร่าง", amount: 100 },
      { salesperson: "เอ", status: "ปิดการขายสำเร็จ", amount: 900 },
      { salesperson: "  ", status: "รออนุมัติ", amount: 5000 },
    ], order);
    expect(rows.map((r) => r.salesperson)).toEqual(["(ไม่ระบุ)", "เอ"]);
    expect(rows[1].cells).toEqual([
      { status: "ร่าง", count: 1, value: 100 },
      { status: "รออนุมัติ", count: 0, value: 0 },
      { status: "ปิดการขายสำเร็จ", count: 1, value: 900 },
    ]);
    expect(rows[1].total).toEqual({ count: 2, value: 1000 });
  });
  it("ไม่มีข้อมูล → รายการว่าง", () => {
    expect(computeStatusBySalesperson([], order)).toEqual([]);
  });
});

describe("closingDateOf / daysBetweenIso", () => {
  it("วันที่ปิดคือ action ปิดใบตัวสุดท้าย · ไม่มีก็ null", () => {
    expect(closingDateOf(h("submitted", "approved", "sent_to_customer", "customer_accepted", "marked_won"))).toBe("2026-01-05");
    expect(closingDateOf(h("submitted", "approved"))).toBeNull();
    expect(closingDateOf(undefined)).toBeNull();
  });
  it("นับวันตรง ๆ และไม่พังกับค่าว่าง", () => {
    expect(daysBetweenIso("2026-01-01", "2026-01-11")).toBe(10);
    expect(daysBetweenIso("", "2026-01-11")).toBeNull();
    expect(daysBetweenIso("not-a-date", "2026-01-11")).toBeNull();
  });
});
