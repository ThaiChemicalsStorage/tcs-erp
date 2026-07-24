import type { DashboardStats } from "../../lib/dashboard";

/**
 * Dashboard report export as a real multi-sheet Excel workbook (added 2026-07-24, direct user
 * request — CSV alone was the 2026-07-10 stopgap, see csvExport.ts). Same principle as the CSV:
 * built client-side from the already-fetched, already-filtered `DashboardStats` on screen, so no
 * new permission or server round trip — and the monthly report the user asked for is exactly this
 * export with the "เดือนนี้"/"เดือนที่แล้ว" filter preset applied (the period lands in the header
 * block and the filename). Reuses the `xlsx` package already shipped for Template workbook
 * parsing, loaded via dynamic import so the ~400 KB library is fetched only on the first click,
 * not in the Dashboard bundle.
 */
type Cell = string | number;

function kpiRows(stats: DashboardStats): Cell[][] {
  const k = stats.kpis;
  return [
    ["Total Quotations", k.totalQuotations],
    ["Total Quotation Value (Before VAT)", k.totalQuotationValue],
    ["Closed Sales (Before VAT)", k.closedSales],
    ["Expected Sales (Before VAT)", k.expectedSales],
    ["Won Jobs", k.wonDeals],
    ["Lost Jobs", k.lostDeals],
    ["Active Jobs", k.activeQuotations],
    ["Non-Active Jobs", k.nonActiveQuotations],
    ["Expired Jobs", k.expiredQuotations],
    ["Win Rate (%)", k.winRate],
    ["Lose Rate (%)", k.loseRate],
    ["Conversion Rate (%)", k.conversionRate],
    ["Average Deal Size (Before VAT)", k.averageDealSize],
    ["Average Closing Time (days)", k.averageClosingTime ?? ""],
    ["Average Approval Time (days)", k.averageApprovalTime ?? ""],
    ["Total Customers", k.totalCustomers],
    ["Total Products", k.totalProducts],
    ["Pending Approvals", k.pendingApprovals],
    ["Overdue Follow-ups", k.overdueFollowups],
    ["New Customers", k.newCustomers],
    ["Repeat Customers", k.repeatCustomers],
  ];
}

export async function exportDashboardXlsx(
  stats: DashboardStats,
  filters: { from: string; to: string; salesperson: string; department: string },
  filename: string,
): Promise<void> {
  const XLSX = await import("xlsx");

  const summary: Cell[][] = [
    ["Thai Chemicals Storage ERP — Dashboard Report"],
    ["Generated at", new Date().toISOString()],
    ["Date from", filters.from || "(all time)"],
    ["Date to", filters.to || "(today)"],
    ["Salesperson filter", filters.salesperson],
    ["Department filter", filters.department],
    ...(stats.ownDataOnly ? [["Scope", "Own data only (caller lacks viewAll)"] as Cell[]] : []),
    [],
    ["KPIs (all monetary values are pre-tax / before VAT)"],
    ...kpiRows(stats),
  ];

  const salesPerformance: Cell[][] = [
    ["Salesperson", "Jobs", "Total Value (Before VAT)", "Closed Sales (Before VAT)", "Expected Revenue (Before VAT)", "Won", "Lost", "Pending", "Conversion Rate (%)", "Avg. Deal Size (Before VAT)", "Avg. Closing Time (days)"],
    ...stats.salesPerformance.map((s): Cell[] => [s.salesperson, s.quotationCount, s.totalValue, s.revenue, s.expectedRevenue, s.won, s.lost, s.pending, s.conversionRate, s.avgDealSize, s.avgClosingTime ?? ""]),
  ];

  const topCustomers: Cell[][] = [
    ["Customer", "Quotations", "Total Value (Before VAT)", "Won Value (Before VAT)", "Last Quotation Date"],
    ...stats.customerAnalytics.topByRevenue.map((c): Cell[] => [c.client, c.quotationCount, c.totalValue, c.revenue, c.lastQuotationDate || ""]),
  ];

  const jobTypes: Cell[][] = [
    ["Code", "Job Type", "Jobs", "Total Value (Before VAT)", "Won Value (Before VAT)", "Win Rate (%)", "Avg. Deal Size (Before VAT)"],
    ...stats.jobTypeAnalytics.map((j): Cell[] => [j.jobTypeCode, j.jobTypeName, j.count, j.totalValue, j.revenue, j.winRate, j.avgDealSize]),
  ];

  const pipeline: Cell[][] = [
    ["Stage", "Count", "Total Value (Before VAT)", "Conversion From Previous (%)"],
    ...stats.pipeline.map((p): Cell[] => [p.stage, p.count, p.totalValue, p.conversionFromPrevious ?? ""]),
  ];

  const monthlyTrend: Cell[][] = [
    ["Month", "Revenue (Before VAT)", "Win Rate (%)"],
    ...stats.revenueTrend.monthly.map((m): Cell[] => {
      const closing = stats.monthlyClosingRate.find((c) => c.month === m.period);
      return [m.period, m.revenue, closing?.winRate ?? ""];
    }),
  ];

  const wb = XLSX.utils.book_new();
  const sheets: [string, Cell[][]][] = [
    ["Summary - KPIs", summary],
    ["Sales Performance", salesPerformance],
    ["Top Customers", topCustomers],
    ["Job Types", jobTypes],
    ["Pipeline", pipeline],
    ["Monthly Trend", monthlyTrend],
  ];
  for (const [name, rows] of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    // Column widths sized to the widest cell (capped) — Excel's default 8.43 chars truncates
    // every Thai company name and most English headers.
    const colCount = Math.max(...rows.map((r) => r.length));
    ws["!cols"] = Array.from({ length: colCount }, (_, i) => ({
      wch: Math.min(45, Math.max(12, ...rows.map((r) => String(r[i] ?? "").length + 2))),
    }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  XLSX.writeFile(wb, filename);
}
