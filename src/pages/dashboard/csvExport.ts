import type { DashboardStats } from "../../lib/dashboard";

/**
 * Dashboard report export — added per the 2026-07-10 Codex review's High-priority finding that no
 * Dashboard export existed at all. Client-side CSV built from the already-fetched, already-filtered
 * `DashboardStats` the user is currently looking at (same `dashboard:view`-gated data already on
 * screen — generating a CSV from data the caller is already authorized to see doesn't need a new
 * permission or a server round trip). PDF/Excel export remain explicitly deferred — see TODO.md.
 */
function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function csvRow(cells: (string | number)[]): string {
  return cells.map(csvCell).join(",");
}

export function buildDashboardCsv(stats: DashboardStats, filters: { from: string; to: string; salesperson: string; department: string }): string {
  const lines: string[] = [];
  lines.push(csvRow(["Thai Chemicals Storage ERP — Dashboard Export"]));
  lines.push(csvRow(["Generated at", new Date().toISOString()]));
  lines.push(csvRow(["Date from", filters.from || "(all time)"]));
  lines.push(csvRow(["Date to", filters.to || "(today)"]));
  lines.push(csvRow(["Salesperson filter", filters.salesperson]));
  lines.push(csvRow(["Department filter", filters.department]));
  lines.push("");

  lines.push(csvRow(["KPIs (all monetary values are pre-tax / before VAT)"]));
  const k = stats.kpis;
  const kpiRows: [string, number | string][] = [
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
    ["Total Leads", k.totalLeads],
    ["Total Products", k.totalProducts],
    ["Pending Approvals", k.pendingApprovals],
    ["Overdue Follow-ups", k.overdueFollowups],
    ["New Customers", k.newCustomers],
    ["Repeat Customers", k.repeatCustomers],
  ];
  for (const [label, value] of kpiRows) lines.push(csvRow([label, value]));
  lines.push("");

  lines.push(csvRow(["Sales Performance (monetary values before VAT)"]));
  lines.push(csvRow(["Salesperson", "Jobs", "Total Value (Before VAT)", "Closed Sales (Before VAT)", "Expected Revenue (Before VAT)", "Won", "Lost", "Pending", "Conversion Rate (%)", "Avg. Deal Size (Before VAT)", "Avg. Closing Time (days)"]));
  for (const s of stats.salesPerformance) {
    lines.push(csvRow([s.salesperson, s.quotationCount, s.totalValue, s.revenue, s.expectedRevenue, s.won, s.lost, s.pending, s.conversionRate, s.avgDealSize, s.avgClosingTime ?? ""]));
  }
  lines.push("");

  lines.push(csvRow(["Top Customers (by revenue, before VAT)"]));
  lines.push(csvRow(["Customer", "Quotations", "Total Value (Before VAT)", "Won Value (Before VAT)", "Last Quotation Date"]));
  for (const c of stats.customerAnalytics.topByRevenue) {
    lines.push(csvRow([c.client, c.quotationCount, c.totalValue, c.revenue, c.lastQuotationDate || ""]));
  }
  lines.push("");

  lines.push(csvRow(["Job Type Analytics (monetary values before VAT)"]));
  lines.push(csvRow(["Code", "Job Type", "Jobs", "Total Value (Before VAT)", "Won Value (Before VAT)", "Win Rate (%)", "Avg. Deal Size (Before VAT)"]));
  for (const j of stats.jobTypeAnalytics) {
    lines.push(csvRow([j.jobTypeCode, j.jobTypeName, j.count, j.totalValue, j.revenue, j.winRate, j.avgDealSize]));
  }

  return lines.join("\r\n");
}

export function downloadCsv(filename: string, csv: string): void {
  // Leading BOM so Excel (still the most common opener for a plain .csv on Windows) detects UTF-8
  // instead of misreading Thai text as the system's legacy codepage. Built via fromCharCode rather
  // than a literal/escaped character in source, which trips eslint's no-irregular-whitespace rule.
  const bom = String.fromCharCode(0xfeff);
  const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
