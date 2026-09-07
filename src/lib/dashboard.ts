import { apiFetch } from "./apiClient.js";
import type { AuditLogEntry } from "./auditLog.js";

export interface DashboardKpis {
  totalCustomers: number;
  totalLeads: number;
  totalProducts: number;
  totalQuotations: number;
  totalQuotationValue: number;
  closedSales: number;
  expectedSales: number;
  wonDeals: number;
  lostDeals: number;
  lostValue: number;
  averageDealSize: number;
  winRate: number;
  loseRate: number;
  conversionRate: number;
  averageApprovalTime: number | null;
  averageClosingTime: number | null;
  activeQuotations: number;
  activeQuotationsValue: number;
  expiredQuotations: number;
  nonActiveQuotations: number;
  nonActiveQuotationsValue: number;
  pendingApprovals: number;
  overdueFollowups: number;
  newCustomers: number;
  repeatCustomers: number;
}

export interface PipelineStage {
  stage: string;
  count: number;
  totalValue: number;
  conversionFromPrevious: number | null;
}

export interface SalesPerformanceEntry {
  salesperson: string;
  quotationCount: number;
  won: number;
  lost: number;
  pending: number;
  revenue: number;
  totalValue: number;
  expectedRevenue: number;
  conversionRate: number;
  avgClosingTime: number | null;
  avgDealSize: number;
}

export interface CustomerStat {
  client: string;
  revenue: number;
  totalValue: number;
  quotationCount: number;
  wonCount: number;
  lastQuotationDate: string;
}

export interface CustomerAnalytics {
  topByRevenue: CustomerStat[];
  topByQuotationCount: CustomerStat[];
  topByWonCount: CustomerStat[];
  topByRepeat: CustomerStat[];
  repeatCustomerPercentage: number;
}

export interface JobTypeStat {
  jobTypeCode: string;
  jobTypeName: string;
  revenue: number;
  totalValue: number;
  count: number;
  won: number;
  winRate: number;
  avgDealSize: number;
}

export interface RevenuePeriod {
  period: string;
  revenue: number;
}

export interface RevenueTrend {
  weekly: RevenuePeriod[];
  monthly: RevenuePeriod[];
  quarterly: RevenuePeriod[];
  yearly: RevenuePeriod[];
}

export interface SalesActivityPeriod {
  period: string;
  created: number;
  edited: number;
  statusChanged: number;
  approvalRequested: number;
  approvalCompleted: number;
}

export interface SalesActivityBySalespersonRow {
  period: string;
  salesperson: string;
  created: number;
  edited: number;
}

export interface SalesActivityTrend {
  weekly: SalesActivityPeriod[];
  monthly: SalesActivityPeriod[];
  quarterly: SalesActivityPeriod[];
  yearly: SalesActivityPeriod[];
  bySalesperson: {
    weekly: SalesActivityBySalespersonRow[];
    monthly: SalesActivityBySalespersonRow[];
    quarterly: SalesActivityBySalespersonRow[];
    yearly: SalesActivityBySalespersonRow[];
  };
}

export interface Forecast {
  thisMonth: number;
  thisQuarter: number;
  thisYear: number;
  historicalWinRate: number;
}

export interface FollowUpSummary {
  id: string;
  client: string;
  salesperson: string;
  followUpDate: string;
  amount: number;
}

export interface FollowUps {
  today: FollowUpSummary[];
  overdue: FollowUpSummary[];
  upcoming: FollowUpSummary[];
}

export interface PendingApprovalItem {
  id: string;
  client: string;
  salesperson: string;
  amount: number;
  submittedDate: string | null;
  status: string;
}

export interface ApprovalDashboard {
  pendingApprovals: number;
  approvedToday: number;
  rejectedToday: number;
  averageApprovalTime: number | null;
  canReject: boolean;
  pendingList: PendingApprovalItem[];
}

export interface NotificationSummary {
  unreadCount: number;
  byType: Record<string, number>;
}

export interface ScopeOfWorkSummary {
  total: number;
  draft: number;
  pending: number;
  final: number;
  noPo: number;
}

export interface DeliveryOrderSummary {
  total: number;
  draft: number;
  pending: number;
  final: number;
}

export interface ServiceSummary {
  total: number;
  draft: number;
  completed: number;
  cancelled: number;
  thisMonth: number;
}

export type DashboardVatMode = "pre" | "post";

export interface InterestBreakdown {
  interested: number;
  notInterested: number;
  notEvaluated: number;
}

// ── ส่วนที่เพิ่มสำหรับไฟล์ Excel แบบละเอียด (2026-09-07) ───────────────────────────────────────

/** หนึ่งช่องในเมทริกซ์ เซลล์ × สถานะ */
export interface StatusBySalespersonCell { status: string; count: number; value: number }
export interface StatusBySalespersonRow {
  salesperson: string;
  total: { count: number; value: number };
  /** เติมศูนย์ครบทุกสถานะตามลำดับ pipeline เสมอ */
  cells: StatusBySalespersonCell[];
}

/**
 * โอกาสปิดของขั้นเปิดหนึ่งขั้น — `probability` มาจากสถิติจริง 12 เดือน (null = ตัวอย่างไม่พอ) ส่วน
 * `appliedProbability` คือค่าที่ใช้ถ่วงน้ำหนักจริง (ค่าของขั้น หรืออัตราชนะรวมของบริษัทเมื่อ `source` = fallback)
 */
export interface StageProbability {
  stage: string;
  sampleSize: number;
  wonCount: number;
  probability: number | null;
  source: "stage" | "fallback";
  appliedProbability: number;
  openCount: number;
  openValue: number;
  weightedValue: number;
}
export interface ClosingProbability {
  windowFrom: string;
  windowTo: string;
  minSampleSize: number;
  closedSampleSize: number;
  historicalWinRate: number;
  stages: StageProbability[];
  totalOpenCount: number;
  totalOpenValue: number;
  totalWeightedValue: number;
  bySalesperson: { salesperson: string; openCount: number; openValue: number; weightedValue: number }[];
}

/** หนึ่งแถวต่อใบเสนอราคาในชีต "รายการใบเสนอราคา" — ส่งมาเฉพาะเมื่อขอ `includeQuotations` */
export interface DashboardQuoteRow {
  id: string;
  issueDate: string;
  client: string;
  project: string;
  salesperson: string;
  status: string;
  jobTypeCode: string;
  jobTypeName: string;
  amount: number;
  isPotentialOpportunity: boolean;
  interest: string;
  expiryDate: string;
  followUpDate: string;
  daysOpen: number | null;
  isExpired: boolean;
  isOpen: boolean;
  stageProbability: number | null;
  weightedValue: number | null;
}

export interface DashboardStats {
  hasAnyData: boolean;
  kpis: DashboardKpis;
  interestBreakdown: InterestBreakdown;
  revenueByMonth: { month: string; revenue: number }[];
  revenueTrend: RevenueTrend;
  categoryBreakdown: { categoryId: string; categoryName: string; count: number; percentage: number }[];
  monthlyClosingRate: { month: string; winRate: number | null }[];
  pipeline: PipelineStage[];
  salesPerformance: SalesPerformanceEntry[];
  customerAnalytics: CustomerAnalytics;
  jobTypeAnalytics: JobTypeStat[];
  forecast: Forecast;
  followUps: FollowUps;
  activityTimeline: AuditLogEntry[] | null;
  salesActivity: SalesActivityTrend | null;
  approvalDashboard: ApprovalDashboard | null;
  scopeOfWork: ScopeOfWorkSummary | null;
  deliveryOrder: DeliveryOrderSummary | null;
  serviceSummary: ServiceSummary | null;
  ownDataOnly: boolean;
  /** 2026-08-14 — which visibility tier `ownDataOnly` resolved to; drives which banner text/filter
   * behavior the Dashboard shows (own vs team vs department vs company-wide). */
  visibilityScope: "own" | "team" | "department" | "all";
  notificationSummary: NotificationSummary;
  availableSalespeople: string[];
  availableDepartments: string[];
  filters: { from: string; to: string; salesperson: string; department: string; vatMode: DashboardVatMode };
  /** 2026-09-07 — ตอบเสมอ ใช้ในชีต "รายเซลล์ x สถานะ" */
  statusBySalesperson: StatusBySalespersonRow[];
  /** 2026-09-07 — ตอบเสมอ ใช้ในชีต "โอกาสปิดการขาย" */
  closingProbability: ClosingProbability;
  /** 2026-09-07 — ตอบเฉพาะเมื่อขอ `?include=quotations` (ปุ่มส่งออก Excel) หน้าจอปกติไม่โหลด */
  quotations?: DashboardQuoteRow[];
}

export interface DashboardFilters {
  from?: string;
  to?: string;
  salesperson?: string;
  department?: string;
  vatMode?: DashboardVatMode;
  /** ขอรายการใบเสนอราคาทีละใบมาด้วย — ใช้ตอนส่งออก Excel เท่านั้น */
  includeQuotations?: boolean;
}

// ดึงข้อมูลสถิติแดชบอร์ดจากเซิร์ฟเวอร์ ตามตัวกรองวันที่/พนักงานขาย/แผนก/โหมดภาษีมูลค่าเพิ่มที่ระบุ
// Fetches dashboard stats from the server, filtered by date range/salesperson/department/VAT mode
export async function fetchDashboardStats(filters?: DashboardFilters): Promise<DashboardStats> {
  const params = new URLSearchParams();
  if (filters?.from) params.set("from", filters.from);
  if (filters?.to) params.set("to", filters.to);
  if (filters?.salesperson && filters.salesperson !== "all") params.set("salesperson", filters.salesperson);
  if (filters?.department && filters.department !== "all") params.set("department", filters.department);
  if (filters?.vatMode === "post") params.set("vat", "post");
  if (filters?.includeQuotations) params.set("include", "quotations");
  const qs = params.toString();
  return apiFetch<DashboardStats>(`/dashboard${qs ? `?${qs}` : ""}`);
}
