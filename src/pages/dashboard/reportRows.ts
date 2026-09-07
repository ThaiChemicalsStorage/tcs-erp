import type { DashboardStats, DashboardVatMode, DashboardQuoteRow } from "../../lib/dashboard";

/**
 * ตัวสร้างแถวของรายงานแดชบอร์ด — **แหล่งเดียว** ที่ทั้งไฟล์ Excel (`xlsxExport.ts`) และ CSV (`csvExport.ts`)
 * ใช้ร่วมกัน (2026-09-07) · ก่อนหน้านี้สองไฟล์นั้นเขียนแถวซ้ำกันเองจนข้อมูลเริ่มไม่ตรง (CSV มี Total Leads
 * แต่ Excel ไม่มี) ตอนนี้สองไฟล์เป็นแค่ตัวเรนเดอร์ของแถวจากที่นี่
 *
 * ทุก cell ระบุ **ชนิดข้อมูล** (`kind`) และทุกแถวระบุ **บทบาท** (`role`) ตัวเรนเดอร์ Excel จึงจัดรูปแบบได้
 * โดยไม่ต้องเดาจากเนื้อหา: หัวตารางเป็นแถบสีน้ำเงินตัวหนา แถวรวมเป็นแถบทอง ตัวเลขเป็นตัวเลขจริงพร้อม
 * รูปแบบ (เงินคั่นหลักพัน เปอร์เซ็นต์เป็น % จริง) ให้ Excel รวมยอดได้ · CSV ไม่สนใจ `role` ทิ้งไปเฉย ๆ
 *
 * เปอร์เซ็นต์เก็บเป็น 0–100 ตามที่เซิร์ฟเวอร์ส่งมา ตัวเรนเดอร์ Excel เป็นคนหารร้อยเอง
 *
 * ป้ายเป็นภาษาไทยคงที่ (ไม่ผูก i18n) เหมือนใบพิมพ์ทุกใบในระบบ — ไฟล์นี้ถูกส่งต่อให้ผู้บริหารที่ไม่ได้เปิดแอป
 * ภาษาอังกฤษอยู่แล้ว และป้ายที่เปลี่ยนตามภาษาผู้กดจะทำให้ไฟล์สองชุดจากคนสองคนเทียบกันไม่ได้
 */

export type CellKind = "text" | "int" | "money" | "percent" | "days" | "date";
export interface ReportCell { v: string | number | null; kind: CellKind }

/**
 * บทบาทของแถว — ตัวกำหนดหน้าตาใน Excel
 *  - `title` ชื่อรายงานบนสุดของชีต · `section` หัวข้อย่อยกลางชีต · `meta` บรรทัดคู่ ป้าย/ค่า ของหัวรายงาน
 *  - `header` หัวตาราง (แถบน้ำเงิน ตัวหนา ตรึงไว้ได้) · `data` แถวข้อมูล · `total` แถวรวม (แถบทอง ตัวหนา)
 *  - `blank` บรรทัดคั่น
 */
export type RowRole = "title" | "section" | "meta" | "header" | "data" | "total" | "blank";
export interface ReportRow { role: RowRole; cells: ReportCell[] }
export interface ReportSheet { name: string; rows: ReportRow[] }

export const text = (v: string): ReportCell => ({ v, kind: "text" });
export const int = (v: number): ReportCell => ({ v, kind: "int" });
export const money = (v: number): ReportCell => ({ v, kind: "money" });
/** รับ 0–100 หรือ null (= ไม่มีข้อมูล แสดง "—") */
export const pct = (v: number | null): ReportCell => ({ v, kind: "percent" });
export const days = (v: number | null): ReportCell => ({ v, kind: "days" });
export const date = (v: string): ReportCell => ({ v: v || null, kind: "date" });

const rowTitle = (s: string): ReportRow => ({ role: "title", cells: [text(s)] });
const rowSection = (s: string): ReportRow => ({ role: "section", cells: [text(s)] });
const rowMeta = (label: string, value: string): ReportRow => ({ role: "meta", cells: [text(label), text(value)] });
const rowHeader = (...labels: string[]): ReportRow => ({ role: "header", cells: labels.map(text) });
const rowData = (...cells: ReportCell[]): ReportRow => ({ role: "data", cells });
const rowTotal = (...cells: ReportCell[]): ReportRow => ({ role: "total", cells });
const BLANK: ReportRow = { role: "blank", cells: [] };
/** บรรทัด ป้าย/ค่า ของบล็อก KPI — เป็นแถวข้อมูลปกติ แค่มีสองคอลัมน์ */
const kpi = (label: string, value: ReportCell): ReportRow => rowData(text(label), value);

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
    rowTitle("Thai Chemicals Storage ERP — รายงานแดชบอร์ด"),
    rowMeta("สร้างเมื่อ", new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })),
    rowMeta("ช่วงวันที่", `${filters.from || "ตั้งแต่ต้น"} ถึง ${filters.to || "วันนี้"}`),
    rowMeta("พนักงานขาย", filters.salesperson === "all" ? "ทั้งหมด" : filters.salesperson),
    rowMeta("แผนก", filters.department === "all" ? "ทั้งหมด" : filters.department),
    rowMeta("มูลค่าเงิน", vat),
    rowMeta("ขอบเขตข้อมูล", SCOPE_LABEL[stats.visibilityScope]),
    BLANK,
    rowSection("ปริมาณ"),
    rowHeader("รายการ", "จำนวน"),
    kpi("ใบเสนอราคาทั้งหมด", int(k.totalQuotations)),
    kpi("ปิดการขายสำเร็จ (ใบ)", int(k.wonDeals)),
    kpi("เสียโอกาส (ใบ)", int(k.lostDeals)),
    kpi("ยังเปิดอยู่ (ใบ)", int(k.activeQuotations)),
    kpi("ไม่เคลื่อนไหว (ยกเลิก/ปฏิเสธ/หมดอายุ)", int(k.nonActiveQuotations)),
    kpi("หมดอายุแล้วยังไม่ปิด (ใบ)", int(k.expiredQuotations)),
    kpi("รออนุมัติ (ใบ)", int(k.pendingApprovals)),
    kpi("ติดตามงานเกินกำหนด", int(k.overdueFollowups)),
    kpi("ลูกค้าใหม่", int(k.newCustomers)),
    kpi("ลูกค้าซื้อซ้ำ", int(k.repeatCustomers)),
    kpi("ลูกค้าทั้งหมดในทะเบียน", int(k.totalCustomers)),
    kpi("ลีดทั้งหมด", int(k.totalLeads)),
    kpi("สินค้าทั้งหมดในทะเบียน", int(k.totalProducts)),
    BLANK,
    rowSection(`มูลค่า (${vat})`),
    rowHeader("รายการ", "จำนวนเงิน"),
    kpi("มูลค่าใบเสนอราคาทั้งหมด", money(k.totalQuotationValue)),
    kpi("ยอดปิดการขาย", money(k.closedSales)),
    kpi("ยอดคาดหวัง (ติ๊กโอกาสขาย)", money(k.expectedSales)),
    kpi("มูลค่าที่เสียโอกาส", money(k.lostValue)),
    kpi("มูลค่าที่ยังเปิดอยู่", money(k.activeQuotationsValue)),
    kpi("มูลค่าที่ไม่เคลื่อนไหว", money(k.nonActiveQuotationsValue)),
    kpi("ขนาดดีลเฉลี่ย (ใบที่ปิดได้)", money(k.averageDealSize)),
    kpi("คาดการณ์ยอดปิดเดือนนี้", money(f.thisMonth)),
    kpi("คาดการณ์ยอดปิดไตรมาสนี้", money(f.thisQuarter)),
    kpi("คาดการณ์ยอดปิดปีนี้", money(f.thisYear)),
    BLANK,
    rowSection("อัตรา"),
    rowHeader("รายการ", "อัตรา"),
    kpi("อัตราชนะ (ชนะ ÷ ชนะ+แพ้)", pct(k.winRate)),
    kpi("อัตราแพ้", pct(k.loseRate)),
    kpi("อัตราแปลง (ชนะ ÷ ใบทั้งหมด)", pct(k.conversionRate)),
    kpi("อัตราชนะย้อนหลัง 12 เดือน (ทั้งบริษัท)", pct(f.historicalWinRate)),
    kpi("สัดส่วนลูกค้าซื้อซ้ำ", pct(stats.customerAnalytics.repeatCustomerPercentage)),
    BLANK,
    rowSection("เวลา (วัน)"),
    rowHeader("รายการ", "จำนวนวัน"),
    kpi("เวลาอนุมัติเฉลี่ย", days(k.averageApprovalTime)),
    kpi("เวลาปิดการขายเฉลี่ย", days(k.averageClosingTime)),
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
    rowTitle("ผลลัพธ์รวม — ทุกใบอยู่ในกลุ่มเดียวเท่านั้น รวมกันได้ 100%"),
    rowHeader("กลุ่ม", "จำนวน (ใบ)", "% ของจำนวน", `มูลค่า (${vat})`, "% ของมูลค่า"),
    ...partition.map(([label, c, v]) => rowData(text(label), int(c), pct(share(c, countSum)), money(v), pct(share(v, valueSum)))),
    rowTotal(text("รวม"), int(countSum), pct(countSum > 0 ? 100 : null), money(valueSum), pct(valueSum > 0 ? 100 : null)),
    BLANK,
    rowSection("ตามสถานะปัจจุบัน (pipeline)"),
    rowHeader("สถานะ", "จำนวน (ใบ)", "% ของจำนวน", `มูลค่า (${vat})`, "% ของมูลค่า", "% เทียบขั้นก่อนหน้า"),
    ...stats.pipeline.map((p) => rowData(
      text(p.stage), int(p.count), pct(share(p.count, pipelineCount)), money(p.totalValue), pct(share(p.totalValue, pipelineValue)), pct(p.conversionFromPrevious),
    )),
    rowTotal(text("รวม"), int(pipelineCount), pct(pipelineCount > 0 ? 100 : null), money(pipelineValue), pct(pipelineValue > 0 ? 100 : null), pct(null)),
    BLANK,
    rowSection("ความสนใจของลูกค้า"),
    rowHeader("ความสนใจ", "จำนวน (ใบ)", "% ของจำนวน"),
    rowData(text("น่าสนใจ"), int(ib.interested), pct(share(ib.interested, interestTotal))),
    rowData(text("ไม่น่าสนใจ"), int(ib.notInterested), pct(share(ib.notInterested, interestTotal))),
    rowData(text("ยังไม่ประเมิน"), int(ib.notEvaluated), pct(share(ib.notEvaluated, interestTotal))),
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
    rowHeader(
      "พนักงานขาย", "ใบทั้งหมด", "% ของใบทั้งหมด", "ชนะ", "แพ้", "รออนุมัติ", "อัตราแปลง (ชนะ÷ใบ)",
      `ยอดปิดการขาย (${vat})`, "% ของยอดปิดรวม", `มูลค่าใบทั้งหมด (${vat})`, `ยอดคาดหวัง (${vat})`, "% ของยอดคาดหวังรวม",
      `ขนาดดีลเฉลี่ย (${vat})`, "เวลาปิดเฉลี่ย (วัน)",
    ),
    ...rows.map((r) => rowData(
      text(r.salesperson), int(r.quotationCount), pct(share(r.quotationCount, totalCount)), int(r.won), int(r.lost), int(r.pending), pct(r.conversionRate),
      money(r.revenue), pct(share(r.revenue, totalRevenue)), money(r.totalValue), money(r.expectedRevenue), pct(share(r.expectedRevenue, totalExpected)),
      money(r.avgDealSize), days(r.avgClosingTime),
    )),
    rowTotal(
      text("รวม"), int(totalCount), pct(totalCount > 0 ? 100 : null), int(totalWon), int(totalLost), int(totalPending), pct(share(totalWon, totalCount)),
      money(totalRevenue), pct(totalRevenue > 0 ? 100 : null), money(totalValue), money(totalExpected), pct(totalExpected > 0 ? 100 : null),
      money(totalWon > 0 ? totalRevenue / totalWon : 0), days(null),
    ),
  ];
}

// ── ชีตที่ 4: รายเซลล์ x สถานะ ──────────────────────────────────────────────────────────────
function salesByStatusSheet({ stats, vat }: Ctx): ReportRow[] {
  const rows = stats.statusBySalesperson;
  const statuses = rows[0]?.cells.map((c) => c.status) ?? stats.pipeline.map((p) => p.stage);
  const block = (label: string, pick: (c: { count: number; value: number }) => number, cell: (n: number) => ReportCell): ReportRow[] => {
    const totals = statuses.map((s) => rows.reduce((sum, r) => sum + pick(r.cells.find((c) => c.status === s) ?? { count: 0, value: 0 }), 0));
    return [
      rowSection(label),
      rowHeader("พนักงานขาย", ...statuses, "รวม"),
      ...rows.map((r) => rowData(text(r.salesperson), ...r.cells.map((c) => cell(pick(c))), cell(pick(r.total)))),
      rowTotal(text("รวม"), ...totals.map(cell), cell(totals.reduce((a, b) => a + b, 0))),
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
    rowTitle("โอกาสปิดการขาย — คิดจากใบที่ปิดไปแล้วจริงในช่วง 12 เดือน ทั้งบริษัท"),
    rowMeta("ช่วงข้อมูลที่ใช้คิด", `${cp.windowFrom} ถึง ${cp.windowTo}`),
    { role: "meta", cells: [text("จำนวนใบที่ปิดแล้วในช่วง"), int(cp.closedSampleSize)] },
    { role: "meta", cells: [text("ตัวอย่างขั้นต่ำต่อขั้นก่อนจะบอกเปอร์เซ็นต์"), int(cp.minSampleSize)] },
    { role: "meta", cells: [text("อัตราชนะรวมบริษัท (ใช้แทนเมื่อข้อมูลขั้นไม่พอ)"), pct(cp.historicalWinRate)] },
    BLANK,
    rowSection("โอกาสปิดของแต่ละขั้น และมูลค่าถ่วงน้ำหนักของใบที่ยังเปิดอยู่"),
    rowHeader(
      "ขั้น", "ใบที่เคยผ่านขั้นนี้", "ในนั้นปิดได้", "โอกาสปิด (สถิติ)", "โอกาสที่ใช้คำนวณ", "ที่มาของค่า",
      "ใบที่เปิดอยู่ตอนนี้", `มูลค่าที่เปิดอยู่ (${vat})`, `มูลค่าถ่วงน้ำหนัก (${vat})`,
    ),
    ...cp.stages.map((s) => rowData(
      text(s.stage), int(s.sampleSize), int(s.wonCount),
      s.probability === null ? text("ข้อมูลไม่พอ") : pct(s.probability),
      pct(s.appliedProbability), text(sourceLabel(s.source)),
      int(s.openCount), money(s.openValue), money(s.weightedValue),
    )),
    rowTotal(
      text("รวม"), int(cp.closedSampleSize), int(cp.stages[cp.stages.length - 1]?.wonCount ?? 0), text(""),
      pct(share(cp.totalWeightedValue, cp.totalOpenValue)), text("เฉลี่ยถ่วงน้ำหนัก"),
      int(cp.totalOpenCount), money(cp.totalOpenValue), money(cp.totalWeightedValue),
    ),
    BLANK,
    rowSection("มูลค่าถ่วงน้ำหนักรายพนักงานขาย"),
    rowHeader("พนักงานขาย", "ใบที่เปิดอยู่", `มูลค่าที่เปิดอยู่ (${vat})`, `มูลค่าถ่วงน้ำหนัก (${vat})`, "โอกาสเฉลี่ย"),
    ...cp.bySalesperson.map((r) => rowData(text(r.salesperson), int(r.openCount), money(r.openValue), money(r.weightedValue), pct(share(r.weightedValue, r.openValue)))),
    BLANK,
    rowSection(`คาดการณ์ยอดปิด (ใบที่ติ๊กโอกาสขายและยังไม่หมดอายุ × อัตราชนะรวม ${vat})`),
    rowHeader("ช่วง", "จำนวนเงิน"),
    rowData(text("เดือนนี้"), money(f.thisMonth)),
    rowData(text("ไตรมาสนี้"), money(f.thisQuarter)),
    rowData(text("ปีนี้"), money(f.thisYear)),
  ];
}

// ── ชีตที่ 6: รายการใบเสนอราคา ────────────────────────────────────────────────────────────────
function quotationsSheet({ stats, vat }: Ctx): ReportRow[] {
  const rows: DashboardQuoteRow[] | undefined = stats.quotations;
  const head = rowHeader(
    "เลขที่", "วันที่ออก", "ลูกค้า", "โครงการ", "พนักงานขาย", "สถานะ", "รหัสประเภทงาน", "ประเภทงาน",
    `มูลค่า (${vat})`, "ติ๊กโอกาสขาย", "ความสนใจ", "วันหมดอายุ", "วันติดตาม", "เปิดมาแล้ว (วัน)", "ยังเปิดอยู่", "หมดอายุ",
    "โอกาสปิด", `มูลค่าถ่วงน้ำหนัก (${vat})`,
  );
  if (!rows) return [head, rowData(text("ไม่ได้โหลดรายการใบเสนอราคา — ส่งออกใหม่อีกครั้ง"))];
  return [
    head,
    ...rows.map((q) => rowData(
      text(q.id), date(q.issueDate), text(q.client), text(q.project), text(q.salesperson), text(q.status), text(q.jobTypeCode), text(q.jobTypeName),
      money(q.amount), text(q.isPotentialOpportunity ? "ใช่" : ""), text(q.interest), date(q.expiryDate), date(q.followUpDate), days(q.daysOpen),
      text(q.isOpen ? "ใช่" : ""), text(q.isExpired ? "ใช่" : ""),
      pct(q.stageProbability), q.weightedValue === null ? text("") : money(q.weightedValue),
    )),
  ];
}

// ── ชีตที่ 7: ลูกค้า ─────────────────────────────────────────────────────────────────────────
function customersSheet({ stats, vat }: Ctx): ReportRow[] {
  const ca = stats.customerAnalytics;
  const list = (label: string, items: typeof ca.topByRevenue): ReportRow[] => [
    rowSection(label),
    rowHeader("ลูกค้า", "ใบทั้งหมด", "ชนะ", `มูลค่าใบทั้งหมด (${vat})`, `ยอดปิดการขาย (${vat})`, "ใบล่าสุด"),
    ...items.map((c) => rowData(text(c.client), int(c.quotationCount), int(c.wonCount), money(c.totalValue), money(c.revenue), date(c.lastQuotationDate))),
  ];
  return [
    { role: "meta", cells: [text("สัดส่วนลูกค้าซื้อซ้ำ"), pct(ca.repeatCustomerPercentage)] },
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
    rowHeader("รหัส", "ประเภทงาน", "ใบทั้งหมด", "% ของใบทั้งหมด", "ชนะ", "อัตราชนะ", `มูลค่าใบทั้งหมด (${vat})`, `ยอดปิดการขาย (${vat})`, "% ของยอดปิดรวม", `ขนาดดีลเฉลี่ย (${vat})`),
    ...rows.map((j) => rowData(
      text(j.jobTypeCode), text(j.jobTypeName), int(j.count), pct(share(j.count, totalCount)), int(j.won), pct(j.winRate),
      money(j.totalValue), money(j.revenue), pct(share(j.revenue, totalRevenue)), money(j.avgDealSize),
    )),
  ];
}

// ── ชีตที่ 9: แนวโน้ม ───────────────────────────────────────────────────────────────────────
function trendSheet({ stats, vat }: Ctx): ReportRow[] {
  const closing = new Map(stats.monthlyClosingRate.map((m) => [m.month, m.winRate]));
  const block = (label: string, periods: { period: string; revenue: number }[], withRate: boolean): ReportRow[] => [
    rowSection(label),
    rowHeader("ช่วง", `ยอดปิดการขาย (${vat})`, ...(withRate ? ["อัตราชนะ"] : [])),
    ...periods.map((p) => rowData(text(p.period), money(p.revenue), ...(withRate ? [pct(closing.get(p.period) ?? null)] : []))),
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
    rowSection(`${label} (${items.length})`),
    rowHeader("เลขที่", "ลูกค้า", "พนักงานขาย", "วันติดตาม", `มูลค่า (${vat})`),
    ...items.map((i) => rowData(text(i.id), text(i.client), text(i.salesperson), date(i.followUpDate), money(i.amount))),
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
