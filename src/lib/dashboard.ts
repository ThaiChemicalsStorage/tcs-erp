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
  /** Days, average of (approved timestamp - submitted timestamp) across quotes that reached "approved". Null when no quote in the filtered set has reached "approved" — distinct from a genuine same-day (0.0) average. */
  averageApprovalTime: number | null;
  /** Days, average of (marked-won timestamp - first approval-history entry) across won quotes. Null when there are no won quotes in the filtered set. */
  averageClosingTime: number | null;
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
  /** Null when this salesperson has no won deals in the filtered set. */
  avgClosingTime: number | null;
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
  averageApprovalTime: number | null;
}

export interface NotificationSummary {
  unreadCount: number;
  byType: Record<string, number>;
}

export interface DashboardStats {
  /** True if the database has ANY quotations (any filter) or products — unfiltered, independent of `kpis.totalQuotations`. Drives the page-level empty state; a narrow filter matching zero results must not hide a database that actually has data. */
  hasAnyData: boolean;
  kpis: DashboardKpis;
  revenueByMonth: { month: string; revenue: number }[];
  categoryBreakdown: { categoryId: string; categoryName: string; count: number; percentage: number }[];
  /** winRate is null for a month with no won/lost deals — distinct from a genuine 0% (deals that all lost). */
  monthlyClosingRate: { month: string; winRate: number | null }[];
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
