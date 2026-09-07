import type { DashboardStats, DashboardVatMode, DashboardQuoteRow } from "../../lib/dashboard";

/**
 * ตัวสร้างแถวของรายงานแดชบอร์ด — **แหล่งเดียว** ที่ทั้งไฟล์ Excel (`xlsxExport.ts`) และ CSV (`csvExport.ts`)
 * ใช้ร่วมกัน (2026-09-07) · ก่อนหน้านี้สองไฟล์นั้นเขียนแถวซ้ำกันเองจนข้อมูลเริ่มไม่ตรง (CSV มี Total Leads
 * แต่ Excel ไม่มี) ตอนนี้สองไฟล์เป็นแค่ตัวเรนเดอร์ของแถวจากที่นี่
 *
 * ทุก cell ระบุ **ชนิด** ไว้ด้วย ตัวเรนเดอร์ Excel จะได้ตั้งรูปแบบตัวเลขให้ถูก (เงินคั่นหลักพัน เปอร์เซ็นต์
 * เป็น % จริง) และให้ Excel รวมยอดได้ ไม่ใช่ตัวหนังสือที่ดูเหมือนตัวเลข · เปอร์เซ็นต์เก็บเป็น 0–100 ตามที่
 * เซิร์ฟเวอร์ส่งมา ตัวเรนเดอร์ Excel เป็นคนแปลงเป็นเศษส่วนเอง
 *
 * ป้ายเป็นภาษาไทยคงที่ (ไม่ผูก i18n) เหมือนใบพิมพ์ทุกใบในระบบ — ไฟล์นี้ถูกส่งต่อให้ผู้บริหารที่ไม่ได้เปิดแอป
 * ภาษาอังกฤษอยู่แล้ว และป้ายที่เปลี่ยนตามภาษาผู้กดจะทำให้ไฟล์สองชุดจากคนสองคนเทียบกันไม่ได้
 */

export type CellKind = "text" | "int" | "money" | "percent" | "days" | "date";
export interface ReportCell { v: string | number | null; kind: CellKind }
export type ReportRow = ReportCell[];
export interface ReportSheet { name: string; rows: ReportRow[] }

export const text = (v: string): ReportCell => ({ v, kind: "text" });
export const int = (v: number): ReportCell => ({ v, kind: "int" });
export const money = (v: number): ReportCell => ({ v, kind: "money" });
/** รับ 0–100 หรือ null (= ไม่มีข้อมูล แสดง "—") */
export const pct = (v: number | null): ReportCell => ({ v, kind: "percent" });
export const days = (v: number | null): ReportCell => ({ v, kind: "days" });
export const date = (v: string): ReportCell => ({ v: v || null, kind: "date" });
const BLANK: ReportRow = [];
const title = (s: string): ReportRow => [text(s)];
const header = (...labels: string[]): ReportRow => labels.map(text);

export interface ReportFilters { from: string; to: string; salesperson: string; department: string; vatMode: DashboardVatMode }

interface Ctx {
  vat: string;
  stats: DashboardStats;
  filters: ReportFilters;
}

const SCOPE_LABEL: Record<DashboardStats["visibilityScope"], string> = {
  own: "เฉพาะของตัวเอง",
  team: "เฉพาะทีมของตัวเอง",
  department: "เฉพาะแผนกของตัวเอง",
  all: "ทั้งบริษัท",
};

const share = (part: number, whole: number): number | null => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);

// ── ชีตที่ 1: สรุปภาพรวม ─────────────────────────────────────────────────────────────────────
function summarySheet({ stats, filters, vat }: Ctx): ReportRow[] {
  const k = stats.kpis;
  const f = stats.forecast;
  return [
    title("Thai Chemicals Storage ERP — รายงานแดชบอร์ด"),
    [text("สร้างเมื่อ"), text(new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }))],
    [text("ช่วงวันที่"), text(`${filters.from || "ตั้งแต่ต้น"} ถึง ${filters.to || "วันนี้"}`)],
    [text("พนักงานขาย"), text(filters.salesperson === "all" ? "ทั้งหมด" : filters.salesperson)],
    [text("แผนก"), text(filters.department === "all" ? "ทั้งหมด" : filters.department)],
    [text("มูลค่าเงิน"), text(vat)],
    [text("ขอบเขตข้อมูล"), text(SCOPE_LABEL[stats.visibilityScope])],
    BLANK,
    title("ปริมาณ"),
    [text("ใบเสนอราคาทั้งหมด"), int(k.totalQuotations)],
    [text("ปิดการขายสำเร็จ (ใบ)"), int(k.wonDeals)],
    [text("เสียโอกาส (ใบ)"), int(k.lostDeals)],
    [text("ยังเปิดอยู่ (ใบ)"), int(k.activeQuotations)],
    [text("ไม่เคลื่อนไหว (ยกเลิก/ปฏิเสธ/หมดอายุ)"), int(k.nonActiveQuotations)],
    [text("หมดอายุแล้วยังไม่ปิด (ใบ)"), int(k.expiredQuotations)],
    [text("รออนุมัติ (ใบ)"), int(k.pendingApprovals)],
    [text("ติดตามงานเกินกำหนด"), int(k.overdueFollowups)],
    [text("ลูกค้าใหม่"), int(k.newCustomers)],
    [text("ลูกค้าซื้อซ้ำ"), int(k.repeatCustomers)],
    [text("ลูกค้าทั้งหมดในทะเบียน"), int(k.totalCustomers)],
    [text("ลีดทั้งหมด"), int(k.totalLeads)],
    [text("สินค้าทั้งหมดในทะเบียน"), int(k.totalProducts)],
    BLANK,
    title(`มูลค่า (${vat})`),
    [text("มูลค่าใบเสนอราคาทั้งหมด"), money(k.totalQuotationValue)],
    [text("ยอดปิดการขาย"), money(k.closedSales)],
    [text("ยอดคาดหวัง (ติ๊กโอกาสขาย)"), money(k.expectedSales)],
    [text("มูลค่าที่เสียโอกาส"), money(k.lostValue)],
    [text("มูลค่าที่ยังเปิดอยู่"), money(k.activeQuotationsValue)],
    [text("มูลค่าที่ไม่เคลื่อนไหว"), money(k.nonActiveQuotationsValue)],
    [text("ขนาดดีลเฉลี่ย (ใบที่ปิดได้)"), money(k.averageDealSize)],
    [text("คาดการณ์ยอดปิดเดือนนี้"), money(f.thisMonth)],
    [text("คาดการณ์ยอดปิดไตรมาสนี้"), money(f.thisQuarter)],
    [text("คาดการณ์ยอดปิดปีนี้"), money(f.thisYear)],
    BLANK,
    title("อัตรา"),
    [text("อัตราชนะ (ชนะ ÷ ชนะ+แพ้)"), pct(k.winRate)],
    [text("อัตราแพ้"), pct(k.loseRate)],
    [text("อัตราแปลง (ชนะ ÷ ใบทั้งหมด)"), pct(k.conversionRate)],
    [text("อัตราชนะย้อนหลัง 12 เดือน (ทั้งบริษัท)"), pct(f.historicalWinRate)],
    [text("สัดส่วนลูกค้าซื้อซ้ำ"), pct(stats.customerAnalytics.repeatCustomerPercentage)],
    BLANK,
    title("เวลา (วัน)"),
    [text("เวลาอนุมัติเฉลี่ย"), days(k.averageApprovalTime)],
    [text("เวลาปิดการขายเฉลี่ย"), days(k.averageClosingTime)],
  ];
}

// ── ชีตที่ 2: สถานะใบเสนอราคา ─────────────────────────────────────────────────────────────────
function statusSheet({ stats, vat }: Ctx): ReportRow[] {
  const k = stats.kpis;
  const partition: [string, number, number][] = [
    ["ปิดการขายสำเร็จ", k.wonDeals, k.closedSales],
    ["เสียโอกาส", k.lostDeals, k.lostValue],
    ["ยังเปิดอยู่", k.activeQuotations, k.activeQuotationsValue],
    ["ไม่เคลื่อนไหว (ยกเลิก/ปฏิเสธ/หมดอายุ)", k.nonActiveQuotations, k.nonActiveQuotationsValue],
  ];
  const countSum = partition.reduce((s, [, c]) => s + c, 0);
  const valueSum = partition.reduce((s, [, , v]) => s + v, 0);
  const pipelineCount = stats.pipeline.reduce((s, p) => s + p.count, 0);
  const pipelineValue = stats.pipeline.reduce((s, p) => s + p.totalValue, 0);
  const ib = stats.interestBreakdown;
  const interestTotal = ib.interested + ib.notInterested + ib.notEvaluated;
  return [
    title("ผลลัพธ์รวม — ทุกใบอยู่ในกลุ่มเดียวเท่านั้น รวมกันได้ 100%"),
    header("กลุ่ม", "จำนวน (ใบ)", "% ของจำนวน", `มูลค่า (${vat})`, "% ของมูลค่า"),
    ...partition.map(([label, c, v]): ReportRow => [text(label), int(c), pct(share(c, countSum)), money(v), pct(share(v, valueSum))]),
    [text("รวม"), int(countSum), pct(countSum > 0 ? 100 : null), money(valueSum), pct(valueSum > 0 ? 100 : null)],
    BLANK,
    title("ตามสถานะปัจจุบัน (pipeline)"),
    header("สถานะ", "จำนวน (ใบ)", "% ของจำนวน", `มูลค่า (${vat})`, "% ของมูลค่า", "% เทียบขั้นก่อนหน้า"),
    ...stats.pipeline.map((p): ReportRow => [
      text(p.stage), int(p.count), pct(share(p.count, pipelineCount)), money(p.totalValue), pct(share(p.totalValue, pipelineValue)), pct(p.conversionFromPrevious),
    ]),
    [text("รวม"), int(pipelineCount), pct(pipelineCount > 0 ? 100 : null), money(pipelineValue), pct(pipelineValue > 0 ? 100 : null), pct(null)],
    BLANK,
    title("ความสนใจของลูกค้า"),
    header("ความสนใจ", "จำนวน (ใบ)", "% ของจำนวน"),
    [text("น่าสนใจ"), int(ib.interested), pct(share(ib.interested, interestTotal))],
    [text("ไม่น่าสนใจ"), int(ib.notInterested), pct(share(ib.notInterested, interestTotal))],
    [text("ยังไม่ประเมิน"), int(ib.notEvaluated), pct(share(ib.notEvaluated, interestTotal))],
  ];
}

// ── ชีตที่ 3: รายเซลล์ ───────────────────────────────────────────────────────────────────────
function salesSheet({ stats, vat }: Ctx): ReportRow[] {
  const rows = stats.salesPerformance;
  const totalCount = rows.reduce((s, r) => s + r.quotationCount, 0);
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalValue = rows.reduce((s, r) => s + r.totalValue, 0);
  const totalExpected = rows.reduce((s, r) => s + r.expectedRevenue, 0);
  const totalWon = rows.reduce((s, r) => s + r.won, 0);
  const totalLost = rows.reduce((s, r) => s + r.lost, 0);
  const totalPending = rows.reduce((s, r) => s + r.pending, 0);
  return [
    title(`ผลงานรายพนักงานขาย (มูลค่า ${vat})`),
    header(
      "พนักงานขาย", "ใบทั้งหมด", "% ของใบทั้งหมด", "ชนะ", "แพ้", "รออนุมัติ", "อัตราแปลง (ชนะ÷ใบ)",
      "ยอดปิดการขาย", "% ของยอดปิดรวม", "มูลค่าใบทั้งหมด", "ยอดคาดหวัง", "% ของยอดคาดหวังรวม",
      "ขนาดดีลเฉลี่ย", "เวลาปิดเฉลี่ย (วัน)",
    ),
    ...rows.map((r): ReportRow => [
      text(r.salesperson), int(r.quotationCount), pct(share(r.quotationCount, totalCount)), int(r.won), int(r.lost), int(r.pending), pct(r.conversionRate),
      money(r.revenue), pct(share(r.revenue, totalRevenue)), money(r.totalValue), money(r.expectedRevenue), pct(share(r.expectedRevenue, totalExpected)),
      money(r.avgDealSize), days(r.avgClosingTime),
    ]),
    [
      text("รวม"), int(totalCount), pct(totalCount > 0 ? 100 : null), int(totalWon), int(totalLost), int(totalPending), pct(share(totalWon, totalCount)),
      money(totalRevenue), pct(totalRevenue > 0 ? 100 : null), money(totalValue), money(totalExpected), pct(totalExpected > 0 ? 100 : null),
      money(totalWon > 0 ? totalRevenue / totalWon : 0), days(null),
    ],
  ];
}

// ── ชีตที่ 4: รายเซลล์ x สถานะ ──────────────────────────────────────────────────────────────
function salesByStatusSheet({ stats, vat }: Ctx): ReportRow[] {
  const rows = stats.statusBySalesperson;
  const statuses = rows[0]?.cells.map((c) => c.status) ?? stats.pipeline.map((p) => p.stage);
  const block = (label: string, pick: (c: { count: number; value: number }) => number, cell: (n: number) => ReportCell): ReportRow[] => {
    const totals = statuses.map((s) => rows.reduce((sum, r) => sum + pick(r.cells.find((c) => c.status === s) ?? { count: 0, value: 0 }), 0));
    return [
      title(label),
      header("พนักงานขาย", ...statuses, "รวม"),
      ...rows.map((r): ReportRow => [text(r.salesperson), ...r.cells.map((c) => cell(pick(c))), cell(pick(r.total))]),
      [text("รวม"), ...totals.map(cell), cell(totals.reduce((a, b) => a + b, 0))],
    ];
  };
  return [
    ...block("จำนวนใบ ตามสถานะ", (c) => c.count, int),
    BLANK,
    ...block(`มูลค่า (${vat}) ตามสถานะ`, (c) => c.value, money),
  ];
}

// ── ชีตที่ 5: โอกาสปิดการขาย ─────────────────────────────────────────────────────────────────
function closingSheet({ stats, vat }: Ctx): ReportRow[] {
  const cp = stats.closingProbability;
  const f = stats.forecast;
  const sourceLabel = (s: "stage" | "fallback") => (s === "stage" ? "สถิติของขั้นนี้" : "อัตราชนะรวมบริษัท (ข้อมูลขั้นไม่พอ)");
  return [
    title("โอกาสปิดการขาย — คิดจากใบที่ปิดไปแล้วจริงในช่วง 12 เดือน ทั้งบริษัท"),
    [text("ช่วงข้อมูลที่ใช้คิด"), text(`${cp.windowFrom} ถึง ${cp.windowTo}`)],
    [text("จำนวนใบที่ปิดแล้วในช่วง"), int(cp.closedSampleSize)],
    [text("ตัวอย่างขั้นต่ำต่อขั้นก่อนจะบอกเปอร์เซ็นต์"), int(cp.minSampleSize)],
    [text("อัตราชนะรวมบริษัท (ใช้แทนเมื่อข้อมูลขั้นไม่พอ)"), pct(cp.historicalWinRate)],
    BLANK,
    title("โอกาสปิดของแต่ละขั้น และมูลค่าถ่วงน้ำหนักของใบที่ยังเปิดอยู่"),
    header(
      "ขั้น", "ใบที่เคยผ่านขั้นนี้", "ในนั้นปิดได้", "โอกาสปิด (สถิติ)", "โอกาสที่ใช้คำนวณ", "ที่มาของค่า",
      "ใบที่เปิดอยู่ตอนนี้", `มูลค่าที่เปิดอยู่ (${vat})`, `มูลค่าถ่วงน้ำหนัก (${vat})`,
    ),
    ...cp.stages.map((s): ReportRow => [
      text(s.stage), int(s.sampleSize), int(s.wonCount),
      s.probability === null ? text("ข้อมูลไม่พอ") : pct(s.probability),
      pct(s.appliedProbability), text(sourceLabel(s.source)),
      int(s.openCount), money(s.openValue), money(s.weightedValue),
    ]),
    [text("รวม"), int(cp.closedSampleSize), int(cp.stages[cp.stages.length - 1]?.wonCount ?? 0), text(""), pct(share(cp.totalWeightedValue, cp.totalOpenValue)), text("เฉลี่ยถ่วงน้ำหนัก"), int(cp.totalOpenCount), money(cp.totalOpenValue), money(cp.totalWeightedValue)],
    BLANK,
    title("มูลค่าถ่วงน้ำหนักรายพนักงานขาย"),
    header("พนักงานขาย", "ใบที่เปิดอยู่", `มูลค่าที่เปิดอยู่ (${vat})`, `มูลค่าถ่วงน้ำหนัก (${vat})`, "โอกาสเฉลี่ย"),
    ...cp.bySalesperson.map((r): ReportRow => [text(r.salesperson), int(r.openCount), money(r.openValue), money(r.weightedValue), pct(share(r.weightedValue, r.openValue))]),
    BLANK,
    title(`คาดการณ์ยอดปิด (ใบที่ติ๊กโอกาสขายและยังไม่หมดอายุ × อัตราชนะรวม ${vat})`),
    [text("เดือนนี้"), money(f.thisMonth)],
    [text("ไตรมาสนี้"), money(f.thisQuarter)],
    [text("ปีนี้"), money(f.thisYear)],
  ];
}

// ── ชีตที่ 6: รายการใบเสนอราคา ────────────────────────────────────────────────────────────────
function quotationsSheet({ stats, vat }: Ctx): ReportRow[] {
  const rows: DashboardQuoteRow[] | undefined = stats.quotations;
  const head = header(
    "เลขที่", "วันที่ออก", "ลูกค้า", "โครงการ", "พนักงานขาย", "สถานะ", "รหัสประเภทงาน", "ประเภทงาน",
    `มูลค่า (${vat})`, "ติ๊กโอกาสขาย", "ความสนใจ", "วันหมดอายุ", "วันติดตาม", "เปิดมาแล้ว (วัน)", "ยังเปิดอยู่", "หมดอายุ",
    "โอกาสปิด", `มูลค่าถ่วงน้ำหนัก (${vat})`,
  );
  if (!rows) return [head, [text("ไม่ได้โหลดรายการใบเสนอราคา — ส่งออกใหม่อีกครั้ง")]];
  return [
    head,
    ...rows.map((q): ReportRow => [
      text(q.id), date(q.issueDate), text(q.client), text(q.project), text(q.salesperson), text(q.status), text(q.jobTypeCode), text(q.jobTypeName),
      money(q.amount), text(q.isPotentialOpportunity ? "ใช่" : ""), text(q.interest), date(q.expiryDate), date(q.followUpDate), days(q.daysOpen),
      text(q.isOpen ? "ใช่" : ""), text(q.isExpired ? "ใช่" : ""),
      pct(q.stageProbability), q.weightedValue === null ? text("") : money(q.weightedValue),
    ]),
  ];
}

// ── ชีตที่ 7: ลูกค้า ─────────────────────────────────────────────────────────────────────────
function customersSheet({ stats, vat }: Ctx): ReportRow[] {
  const ca = stats.customerAnalytics;
  const list = (label: string, items: typeof ca.topByRevenue): ReportRow[] => [
    title(label),
    header("ลูกค้า", "ใบทั้งหมด", "ชนะ", `มูลค่าใบทั้งหมด (${vat})`, `ยอดปิดการขาย (${vat})`, "ใบล่าสุด"),
    ...items.map((c): ReportRow => [text(c.client), int(c.quotationCount), int(c.wonCount), money(c.totalValue), money(c.revenue), date(c.lastQuotationDate)]),
  ];
  return [
    [text("สัดส่วนลูกค้าซื้อซ้ำ"), pct(ca.repeatCustomerPercentage)],
    BLANK,
    ...list("ลูกค้าที่ทำยอดปิดสูงสุด", ca.topByRevenue),
    BLANK,
    ...list("ลูกค้าที่ออกใบเสนอราคามากที่สุด", ca.topByQuotationCount),
    BLANK,
    ...list("ลูกค้าที่ปิดการขายได้มากที่สุด", ca.topByWonCount),
    BLANK,
    ...list("ลูกค้าซื้อซ้ำ", ca.topByRepeat),
  ];
}

// ── ชีตที่ 8: ประเภทงาน ──────────────────────────────────────────────────────────────────────
function jobTypesSheet({ stats, vat }: Ctx): ReportRow[] {
  const rows = stats.jobTypeAnalytics;
  const totalCount = rows.reduce((s, j) => s + j.count, 0);
  const totalRevenue = rows.reduce((s, j) => s + j.revenue, 0);
  return [
    header("รหัส", "ประเภทงาน", "ใบทั้งหมด", "% ของใบทั้งหมด", "ชนะ", "อัตราชนะ", `มูลค่าใบทั้งหมด (${vat})`, `ยอดปิดการขาย (${vat})`, "% ของยอดปิดรวม", `ขนาดดีลเฉลี่ย (${vat})`),
    ...rows.map((j): ReportRow => [
      text(j.jobTypeCode), text(j.jobTypeName), int(j.count), pct(share(j.count, totalCount)), int(j.won), pct(j.winRate),
      money(j.totalValue), money(j.revenue), pct(share(j.revenue, totalRevenue)), money(j.avgDealSize),
    ]),
  ];
}

// ── ชีตที่ 9: แนวโน้ม ───────────────────────────────────────────────────────────────────────
function trendSheet({ stats, vat }: Ctx): ReportRow[] {
  const closing = new Map(stats.monthlyClosingRate.map((m) => [m.month, m.winRate]));
  const block = (label: string, periods: { period: string; revenue: number }[], withRate: boolean): ReportRow[] => [
    title(label),
    header("ช่วง", `ยอดปิดการขาย (${vat})`, ...(withRate ? ["อัตราชนะ"] : [])),
    ...periods.map((p): ReportRow => [text(p.period), money(p.revenue), ...(withRate ? [pct(closing.get(p.period) ?? null)] : [])]),
  ];
  return [
    ...block("รายเดือน (12 เดือนล่าสุด)", stats.revenueTrend.monthly, true),
    BLANK,
    ...block("รายสัปดาห์ (12 สัปดาห์ล่าสุด)", stats.revenueTrend.weekly, false),
    BLANK,
    ...block("รายไตรมาส", stats.revenueTrend.quarterly, false),
    BLANK,
    ...block("รายปี", stats.revenueTrend.yearly, false),
  ];
}

// ── ชีตที่ 10: ติดตามงาน ────────────────────────────────────────────────────────────────────
function followUpSheet({ stats, vat }: Ctx): ReportRow[] {
  const fu = stats.followUps;
  const block = (label: string, items: typeof fu.today): ReportRow[] => [
    title(`${label} (${items.length})`),
    header("เลขที่", "ลูกค้า", "พนักงานขาย", "วันติดตาม", `มูลค่า (${vat})`),
    ...items.map((i): ReportRow => [text(i.id), text(i.client), text(i.salesperson), date(i.followUpDate), money(i.amount)]),
  ];
  return [
    ...block("เกินกำหนด", fu.overdue),
    BLANK,
    ...block("วันนี้", fu.today),
    BLANK,
    ...block("ถัดไป", fu.upcoming),
  ];
}

export const vatLabelOf = (mode: DashboardVatMode): string => (mode === "post" ? "รวม VAT 7%" : "ก่อน VAT");

/** ชีตทั้งหมดของไฟล์ Excel ตามลำดับ — ชื่อชีตต้อง ≤ 31 ตัวอักษรและไม่มี []:*?/\ ตามกติกาของ Excel */
export function buildWorkbookSheets(stats: DashboardStats, filters: ReportFilters): ReportSheet[] {
  const ctx: Ctx = { stats, filters, vat: vatLabelOf(filters.vatMode) };
  return [
    { name: "สรุปภาพรวม", rows: summarySheet(ctx) },
    { name: "สถานะใบเสนอราคา", rows: statusSheet(ctx) },
    { name: "รายเซลล์", rows: salesSheet(ctx) },
    { name: "รายเซลล์ x สถานะ", rows: salesByStatusSheet(ctx) },
    { name: "โอกาสปิดการขาย", rows: closingSheet(ctx) },
    { name: "รายการใบเสนอราคา", rows: quotationsSheet(ctx) },
    { name: "ลูกค้า", rows: customersSheet(ctx) },
    { name: "ประเภทงาน", rows: jobTypesSheet(ctx) },
    { name: "แนวโน้ม", rows: trendSheet(ctx) },
    { name: "ติดตามงาน", rows: followUpSheet(ctx) },
  ];
}

/** ชุดย่อยสำหรับ CSV (ไฟล์เดียว ไม่มีแท็บ) — เท่ากับที่ CSV เคยมี บวก Total Leads ให้ตรงกับ Excel */
export function buildCsvSections(stats: DashboardStats, filters: ReportFilters): ReportSheet[] {
  const ctx: Ctx = { stats, filters, vat: vatLabelOf(filters.vatMode) };
  return [
    { name: "สรุปภาพรวม", rows: summarySheet(ctx) },
    { name: "รายเซลล์", rows: salesSheet(ctx) },
    { name: "ลูกค้า", rows: customersSheet(ctx) },
    { name: "ประเภทงาน", rows: jobTypesSheet(ctx) },
  ];
}
