import { describe, it, expect } from "vitest";
import type { DashboardStats } from "../src/lib/dashboard";
import { buildWorkbookSheets, buildCsvSections, type ReportCell, type ReportRow } from "../src/pages/dashboard/reportRows";
import { buildDashboardCsv } from "../src/pages/dashboard/csvExport";

/**
 * ตัวสร้างแถวของไฟล์ Excel/CSV แดชบอร์ด (2026-09-07) — ตรึงกติกาที่พลาดแล้วไฟล์ยังเปิดได้แต่ผิด:
 * ชื่อชีตต้องผ่านกติกาของ Excel · เปอร์เซ็นต์ส่วนแบ่งต้องรวมได้ 100 · CSV ต้องเป็นชุดย่อยของ Excel
 * (เคย drift กันมาแล้ว) · ไม่มี `quotations` ต้องได้ชีตกันพัง ไม่ใช่ crash
 */

const cust = (client: string, n: number) => ({ client, revenue: n * 100, totalValue: n * 150, quotationCount: n, wonCount: 1, lastQuotationDate: "2026-09-01" });

function fixture(overrides: Partial<DashboardStats> = {}): DashboardStats {
  const cells = (a: number, b: number) => ([
    { status: "ร่าง", count: a, value: a * 100 }, { status: "รออนุมัติ", count: 0, value: 0 }, { status: "อนุมัติแล้ว", count: 0, value: 0 },
    { status: "ส่งให้ลูกค้าแล้ว", count: 0, value: 0 }, { status: "ลูกค้ายอมรับ", count: 0, value: 0 }, { status: "ปิดการขายสำเร็จ", count: b, value: b * 1000 },
    { status: "ลูกค้าปฏิเสธ", count: 0, value: 0 }, { status: "เสียโอกาส", count: 0, value: 0 }, { status: "ยกเลิก", count: 0, value: 0 },
  ]);
  return {
    hasAnyData: true,
    kpis: {
      totalCustomers: 3, totalLeads: 0, totalProducts: 9, totalQuotations: 6, totalQuotationValue: 6000,
      closedSales: 3000, expectedSales: 2000, wonDeals: 3, lostDeals: 1, lostValue: 500, averageDealSize: 1000,
      winRate: 75, loseRate: 25, conversionRate: 50, averageApprovalTime: 1.5, averageClosingTime: null,
      activeQuotations: 1, activeQuotationsValue: 1500, expiredQuotations: 1, nonActiveQuotations: 1, nonActiveQuotationsValue: 1000,
      pendingApprovals: 0, overdueFollowups: 1, newCustomers: 2, repeatCustomers: 1,
    },
    interestBreakdown: { interested: 3, notInterested: 1, notEvaluated: 2 },
    revenueByMonth: [],
    revenueTrend: { weekly: [{ period: "2026-W36", revenue: 100 }], monthly: [{ period: "2026-09", revenue: 3000 }], quarterly: [], yearly: [] },
    categoryBreakdown: [],
    monthlyClosingRate: [{ month: "2026-09", winRate: 75 }],
    pipeline: [{ stage: "ร่าง", count: 2, totalValue: 200, conversionFromPrevious: null }, { stage: "ปิดการขายสำเร็จ", count: 3, totalValue: 3000, conversionFromPrevious: 60 }],
    salesPerformance: [
      { salesperson: "เอ", quotationCount: 4, won: 2, lost: 1, pending: 0, revenue: 2000, totalValue: 4000, expectedRevenue: 1500, conversionRate: 50, avgClosingTime: 3, avgDealSize: 1000 },
      { salesperson: "บี", quotationCount: 2, won: 1, lost: 0, pending: 0, revenue: 1000, totalValue: 2000, expectedRevenue: 500, conversionRate: 50, avgClosingTime: null, avgDealSize: 1000 },
    ],
    customerAnalytics: { topByRevenue: [cust("X", 3)], topByQuotationCount: [cust("X", 3)], topByWonCount: [cust("Y", 1)], topByRepeat: [cust("X", 3)], repeatCustomerPercentage: 33.3 },
    jobTypeAnalytics: [{ jobTypeCode: "LI", jobTypeName: "FRP Lining", revenue: 3000, totalValue: 6000, count: 6, won: 3, winRate: 50, avgDealSize: 1000 }],
    forecast: { thisMonth: 100, thisQuarter: 200, thisYear: 300, historicalWinRate: 40 },
    followUps: { today: [], overdue: [{ id: "Q1", client: "X", salesperson: "เอ", followUpDate: "2026-09-01", amount: 500 }], upcoming: [] },
    activityTimeline: null, salesActivity: null, approvalDashboard: null, scopeOfWork: null, deliveryOrder: null, serviceSummary: null,
    ownDataOnly: false, visibilityScope: "all",
    notificationSummary: { unreadCount: 0, byType: {} },
    availableSalespeople: ["เอ", "บี"], availableDepartments: [],
    filters: { from: "2026-09-01", to: "2026-09-07", salesperson: "all", department: "all", vatMode: "pre" },
    statusBySalesperson: [{ salesperson: "เอ", total: { count: 4, value: 2200 }, cells: cells(2, 2) }, { salesperson: "บี", total: { count: 1, value: 1000 }, cells: cells(0, 1) }],
    closingProbability: {
      windowFrom: "2025-10-01", windowTo: "2026-09-07", minSampleSize: 5, closedSampleSize: 12, historicalWinRate: 40,
      stages: [
        { stage: "ร่าง", sampleSize: 12, wonCount: 5, probability: 41.7, source: "stage", appliedProbability: 41.7, openCount: 1, openValue: 1000, weightedValue: 417 },
        { stage: "รออนุมัติ", sampleSize: 2, wonCount: 1, probability: null, source: "fallback", appliedProbability: 40, openCount: 0, openValue: 0, weightedValue: 0 },
      ],
      totalOpenCount: 1, totalOpenValue: 1000, totalWeightedValue: 417,
      bySalesperson: [{ salesperson: "เอ", openCount: 1, openValue: 1000, weightedValue: 417 }],
    },
    quotations: [{
      id: "Q1", issueDate: "2026-09-01", client: "X", project: "", salesperson: "เอ", status: "ร่าง", jobTypeCode: "LI", jobTypeName: "FRP Lining",
      amount: 1000, isPotentialOpportunity: true, interest: "น่าสนใจ", expiryDate: "2026-10-01", followUpDate: "", daysOpen: 6, isExpired: false, isOpen: true,
      stageProbability: 41.7, weightedValue: 417,
    }],
    ...overrides,
  };
}

const findRow = (rows: ReportRow[], first: string) => rows.find((r) => r.cells[0]?.v === first)?.cells;
const numAt = (row: ReportCell[] | undefined, i: number) => (typeof row?.[i]?.v === "number" ? (row![i].v as number) : NaN);
const rolesOf = (rows: ReportRow[]) => [...new Set(rows.map((r) => r.role))];

describe("buildWorkbookSheets", () => {
  it("มี 10 ชีต ชื่อไม่เกิน 31 ตัว และไม่มีอักขระต้องห้ามของ Excel", () => {
    const sheets = buildWorkbookSheets(fixture(), fixture().filters);
    expect(sheets).toHaveLength(10);
    for (const s of sheets) {
      expect(s.name.length).toBeLessThanOrEqual(31);
      expect(s.name).not.toMatch(/[[\]:*?/\\]/);
      expect(s.rows.length).toBeGreaterThan(0);
    }
    expect(sheets.map((s) => s.name)).toEqual(["สรุปภาพรวม", "สถานะใบเสนอราคา", "รายเซลล์", "รายเซลล์ x สถานะ", "โอกาสปิดการขาย", "รายการใบเสนอราคา", "ลูกค้า", "ประเภทงาน", "แนวโน้ม", "ติดตามงาน"]);
  });

  it("รายเซลล์: ส่วนแบ่ง % ของแต่ละคนรวมกันได้ 100 และแถวรวมตรงกับผลรวม", () => {
    const rows = buildWorkbookSheets(fixture(), fixture().filters)[2].rows;
    const a = findRow(rows, "เอ")!;
    const b = findRow(rows, "บี")!;
    const total = findRow(rows, "รวม")!;
    expect(numAt(a, 2) + numAt(b, 2)).toBeCloseTo(100, 1); // % ของใบทั้งหมด
    expect(numAt(a, 8) + numAt(b, 8)).toBeCloseTo(100, 1); // % ของยอดปิดรวม
    expect(numAt(total, 1)).toBe(6);
    expect(numAt(total, 7)).toBe(3000);
    expect(a[2].kind).toBe("percent");
    expect(a[7].kind).toBe("money");
  });

  it("สถานะใบเสนอราคา: กลุ่มผลลัพธ์รวมได้ 100% ทั้งจำนวนและมูลค่า", () => {
    const rows = buildWorkbookSheets(fixture(), fixture().filters)[1].rows;
    const groups = ["ปิดการขายสำเร็จ", "เสียโอกาส", "ยังเปิดอยู่", "ไม่เคลื่อนไหว (ยกเลิก/ปฏิเสธ/หมดอายุ)"].map((g) => findRow(rows, g)!);
    // ปัดทศนิยมหนึ่งตำแหน่งต่อแถวแล้วบวกกัน คลาดได้ไม่เกิน ±0.5 (เช่น 16.7 × 3 + 50 = 100.1)
    expect(groups.reduce((s, r) => s + numAt(r, 2), 0)).toBeCloseTo(100, 0);
    expect(groups.reduce((s, r) => s + numAt(r, 4), 0)).toBeCloseTo(100, 0);
  });

  it("โอกาสปิดการขาย: ขั้นที่ข้อมูลไม่พอบอกว่า 'ข้อมูลไม่พอ' ไม่ใช่ 0%", () => {
    const rows = buildWorkbookSheets(fixture(), fixture().filters)[4].rows;
    const pending = findRow(rows, "รออนุมัติ")!;
    expect(pending[3]).toEqual({ v: "ข้อมูลไม่พอ", kind: "text" });
    expect(pending[4]).toEqual({ v: 40, kind: "percent" });
    const draft = findRow(rows, "ร่าง")!;
    expect(draft[3]).toEqual({ v: 41.7, kind: "percent" });
  });

  it("รายเซลล์ x สถานะ: หัวคอลัมน์ครบ 9 สถานะ + รวม และแถวรวมบวกถูก", () => {
    const rows = buildWorkbookSheets(fixture(), fixture().filters)[3].rows;
    expect(rows[1].cells).toHaveLength(11);
    const total = findRow(rows, "รวม")!;
    expect(numAt(total, 1)).toBe(2); // ร่าง: เอ 2 + บี 0
    expect(numAt(total, 6)).toBe(3); // ปิดการขายสำเร็จ: 2 + 1
    expect(numAt(total, 10)).toBe(5);
  });

  it("ไม่มี quotations → ชีตรายการมีแถวบอกให้ส่งออกใหม่ ไม่ crash", () => {
    const sheet = buildWorkbookSheets(fixture({ quotations: undefined }), fixture().filters)[5];
    expect(sheet.rows).toHaveLength(2);
    expect(String(sheet.rows[1].cells[0].v)).toContain("ไม่ได้โหลด");
  });

  it("ทุกแถวมี role ที่ตัวเรนเดอร์ Excel รู้จัก และชีตตารางเดียวมีหัวตารางเดียว", () => {
    const known = new Set(["title", "section", "meta", "header", "data", "total", "blank"]);
    const sheets = buildWorkbookSheets(fixture(), fixture().filters);
    for (const s of sheets) for (const r of s.rows) expect(known.has(r.role), `${s.name}: ${r.role}`).toBe(true);
    // สามชีตนี้เป็นตารางเดียวยาว ๆ จึงต้องมีหัวตารางแถวเดียว (ตัวเรนเดอร์ใส่ฟิลเตอร์+ตรึงหัวจากเงื่อนไขนี้)
    for (const name of ["รายเซลล์", "รายการใบเสนอราคา", "ประเภทงาน"]) {
      const rows = sheets.find((s) => s.name === name)!.rows;
      expect(rows.filter((r) => r.role === "header"), name).toHaveLength(1);
      expect(rows[0].role, name).toBe("header");
    }
    // ชีตสรุปมีหลายบล็อก จึงต้องมีหัวตารางมากกว่าหนึ่ง (ห้ามใส่ฟิลเตอร์)
    expect(rolesOf(sheets[0].rows)).toContain("meta");
    expect(sheets[0].rows.filter((r) => r.role === "header").length).toBeGreaterThan(1);
  });

  it("ทุกอย่างว่าง → ทุกชีตยังมีหัวตาราง ไม่โยน", () => {
    const empty = fixture({
      salesPerformance: [], statusBySalesperson: [], pipeline: [], jobTypeAnalytics: [], quotations: [],
      customerAnalytics: { topByRevenue: [], topByQuotationCount: [], topByWonCount: [], topByRepeat: [], repeatCustomerPercentage: 0 },
      followUps: { today: [], overdue: [], upcoming: [] },
      closingProbability: { ...fixture().closingProbability, stages: [], bySalesperson: [], totalOpenCount: 0, totalOpenValue: 0, totalWeightedValue: 0 },
    });
    expect(() => buildWorkbookSheets(empty, empty.filters)).not.toThrow();
  });
});

describe("CSV เป็นชุดย่อยของ Excel", () => {
  it("มี 4 ส่วน และ KPI มี 'ลีดทั้งหมด' เหมือน Excel (จุดที่เคย drift)", () => {
    const sections = buildCsvSections(fixture(), fixture().filters);
    expect(sections.map((s) => s.name)).toEqual(["สรุปภาพรวม", "รายเซลล์", "ลูกค้า", "ประเภทงาน"]);
    const csv = buildDashboardCsv(fixture(), fixture().filters);
    expect(csv).toContain("ลีดทั้งหมด,0");
    expect(csv).toContain("## รายเซลล์");
    // เปอร์เซ็นต์ใน CSV คงเป็น 0–100 ไม่ใช่เศษส่วน
    expect(csv).toContain("อัตราชนะ (ชนะ ÷ ชนะ+แพ้),75");
  });
});
