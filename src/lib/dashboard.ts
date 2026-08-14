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
  notificationSummary: NotificationSummary;
  availableSalespeople: string[];
  availableDepartments: string[];
  filters: { from: string; to: string; salesperson: string; department: string; vatMode: DashboardVatMode };
}

export interface DashboardFilters {
  from?: string;
  to?: string;
  salesperson?: string;
  department?: string;
  vatMode?: DashboardVatMode;
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
  const qs = params.toString();
  return apiFetch<DashboardStats>(`/dashboard${qs ? `?${qs}` : ""}`);
}
