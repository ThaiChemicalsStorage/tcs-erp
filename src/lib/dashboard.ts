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
  averageDealSize: number;
  winRate: number;
  loseRate: number;
  conversionRate: number;
  /** Days, average of (approved timestamp - submitted timestamp) across quotes that reached "approved". */
  averageApprovalTime: number;
  /** Days, average of (marked-won timestamp - first approval-history entry) across won quotes. */
  averageClosingTime: number;
  activeQuotations: number;
  expiredQuotations: number;
  overdueFollowups: number;
  /** Distinct `client` free-text values whose only quote is this one — see Dashboard docs for the free-text-matching caveat. */
  newCustomers: number;
  repeatCustomers: number;
}

export interface PipelineStage {
  stage: string;
  count: number;
  totalValue: number;
  /** Percentage of the previous stage's count, or null for the first stage. */
  conversionFromPrevious: number | null;
}

export interface SalesPerformanceEntry {
  salesperson: string;
  quotationCount: number;
  won: number;
  lost: number;
  pending: number;
  revenue: number;
  expectedRevenue: number;
  conversionRate: number;
  avgClosingTime: number;
  avgDealSize: number;
}

export interface CustomerStat {
  client: string;
  revenue: number;
  quotationCount: number;
  wonCount: number;
}

export interface CustomerAnalytics {
  topByRevenue: CustomerStat[];
  topByQuotationCount: CustomerStat[];
  topByWonCount: CustomerStat[];
  repeatCustomerPercentage: number;
}

export interface JobTypeStat {
  jobTypeCode: string;
  jobTypeName: string;
  revenue: number;
  count: number;
  won: number;
  winRate: number;
  avgDealSize: number;
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

export interface ApprovalDashboard {
  pendingApprovals: number;
  approvedToday: number;
  rejectedToday: number;
  averageApprovalTime: number;
}

export interface NotificationSummary {
  unreadCount: number;
  byType: Record<string, number>;
}

export interface DashboardStats {
  kpis: DashboardKpis;
  revenueByMonth: { month: string; revenue: number }[];
  categoryBreakdown: { categoryId: string; categoryName: string; count: number; percentage: number }[];
  monthlyClosingRate: { month: string; winRate: number }[];
  pipeline: PipelineStage[];
  salesPerformance: SalesPerformanceEntry[];
  customerAnalytics: CustomerAnalytics;
  jobTypeAnalytics: JobTypeStat[];
  forecast: Forecast;
  followUps: FollowUps;
  /** Null when the caller lacks auditLog:view — the frontend hides the Activity Timeline section entirely in that case. */
  activityTimeline: AuditLogEntry[] | null;
  /** Null when the caller lacks quotations:approve — the frontend hides the Approval Dashboard section entirely in that case. */
  approvalDashboard: ApprovalDashboard | null;
  notificationSummary: NotificationSummary;
  availableSalespeople: string[];
  filters: { from: string; to: string; salesperson: string };
}

export interface DashboardFilters {
  from?: string;
  to?: string;
  salesperson?: string;
}

export async function fetchDashboardStats(filters?: DashboardFilters): Promise<DashboardStats> {
  const params = new URLSearchParams();
  if (filters?.from) params.set("from", filters.from);
  if (filters?.to) params.set("to", filters.to);
  if (filters?.salesperson && filters.salesperson !== "all") params.set("salesperson", filters.salesperson);
  const qs = params.toString();
  return apiFetch<DashboardStats>(`/dashboard${qs ? `?${qs}` : ""}`);
}
