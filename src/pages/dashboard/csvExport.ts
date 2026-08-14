import type { DashboardStats, DashboardVatMode } from "../../lib/dashboard";

// ครอบค่าเป็นเซลล์ CSV ที่ถูกต้อง (ใส่เครื่องหมายคำพูดถ้ามีจุลภาคหรือขึ้นบรรทัดใหม่)
// Escapes a value into a valid CSV cell (quotes it if it contains a comma or newline)
function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
// รวมเซลล์หลายค่าเป็นหนึ่งแถว CSV
// Joins multiple cells into one CSV row
function csvRow(cells: (string | number)[]): string {
  return cells.map(csvCell).join(",");
}

// สร้างไฟล์ CSV สรุปรายงานแดชบอร์ดจากข้อมูลที่กรองไว้แล้วบนหน้าจอ
// Builds a dashboard report CSV from the already-filtered stats currently on screen
export function buildDashboardCsv(stats: DashboardStats, filters: { from: string; to: string; salesperson: string; department: string; vatMode: DashboardVatMode }): string {
  const lines: string[] = [];
  const vatLabel = filters.vatMode === "post" ? "incl. VAT 7%" : "Before VAT";
  const vatNote = filters.vatMode === "post" ? "post-tax / incl. VAT 7%" : "pre-tax / before VAT";
  lines.push(csvRow(["Thai Chemicals Storage ERP — Dashboard Export"]));
  lines.push(csvRow(["Generated at", new Date().toISOString()]));
  lines.push(csvRow(["Date from", filters.from || "(all time)"]));
  lines.push(csvRow(["Date to", filters.to || "(today)"]));
  lines.push(csvRow(["Salesperson filter", filters.salesperson]));
  lines.push(csvRow(["Department filter", filters.department]));
  lines.push("");

  lines.push(csvRow([`KPIs (all monetary values are ${vatNote})`]));
  const k = stats.kpis;
  const kpiRows: [string, number | string][] = [
    ["Total Quotations", k.totalQuotations],
    [`Total Quotation Value (${vatLabel})`, k.totalQuotationValue],
    [`Closed Sales (${vatLabel})`, k.closedSales],
    [`Expected Sales (${vatLabel})`, k.expectedSales],
    ["Won Jobs", k.wonDeals],
    ["Lost Jobs", k.lostDeals],
    ["Active Jobs", k.activeQuotations],
    ["Non-Active Jobs", k.nonActiveQuotations],
    ["Expired Jobs", k.expiredQuotations],
    ["Win Rate (%)", k.winRate],
    ["Lose Rate (%)", k.loseRate],
    ["Conversion Rate (%)", k.conversionRate],
    [`Average Deal Size (${vatLabel})`, k.averageDealSize],
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

  lines.push(csvRow([`Sales Performance (monetary values ${vatNote})`]));
  lines.push(csvRow(["Salesperson", "Jobs", `Total Value (${vatLabel})`, `Closed Sales (${vatLabel})`, `Expected Revenue (${vatLabel})`, "Won", "Lost", "Pending", "Conversion Rate (%)", `Avg. Deal Size (${vatLabel})`, "Avg. Closing Time (days)"]));
  for (const s of stats.salesPerformance) {
    lines.push(csvRow([s.salesperson, s.quotationCount, s.totalValue, s.revenue, s.expectedRevenue, s.won, s.lost, s.pending, s.conversionRate, s.avgDealSize, s.avgClosingTime ?? ""]));
  }
  lines.push("");

  lines.push(csvRow([`Top Customers (by revenue, ${vatNote})`]));
  lines.push(csvRow(["Customer", "Quotations", `Total Value (${vatLabel})`, `Won Value (${vatLabel})`, "Last Quotation Date"]));
  for (const c of stats.customerAnalytics.topByRevenue) {
    lines.push(csvRow([c.client, c.quotationCount, c.totalValue, c.revenue, c.lastQuotationDate || ""]));
  }
  lines.push("");

  lines.push(csvRow([`Job Type Analytics (monetary values ${vatNote})`]));
  lines.push(csvRow(["Code", "Job Type", "Jobs", `Total Value (${vatLabel})`, `Won Value (${vatLabel})`, "Win Rate (%)", `Avg. Deal Size (${vatLabel})`]));
  for (const j of stats.jobTypeAnalytics) {
    lines.push(csvRow([j.jobTypeCode, j.jobTypeName, j.count, j.totalValue, j.revenue, j.winRate, j.avgDealSize]));
  }

  return lines.join("\r\n");
}

// ดาวน์โหลดสตริง CSV เป็นไฟล์ในเบราว์เซอร์ (ใส่ BOM เพื่อให้ Excel อ่านภาษาไทยถูกต้อง)
// Triggers a browser download of a CSV string (with a BOM so Excel reads Thai text correctly)
export function downloadCsv(filename: string, csv: string): void {
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
