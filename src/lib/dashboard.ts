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
  /** Total amount of `lostDeals` — same predicate (`status === LOST_STATUS`) as the count, so this and `closedSales` (Won's value) are always population-consistent with their respective counts. */
  lostValue: number;
  averageDealSize: number;
  winRate: number;
  loseRate: number;
  conversionRate: number;
  /** Days, average of (approved timestamp - submitted timestamp) across quotes that reached "approved". Null when no quote in the filtered set has reached "approved" — distinct from a genuine same-day (0.0) average. */
  averageApprovalTime: number | null;
  /** Days, average of (marked-won timestamp - first approval-history entry) across won quotes. Null when there are no won quotes in the filtered set. */
  averageClosingTime: number | null;
  activeQuotations: number;
  /** Total amount of `activeQuotations` — same exact predicate (not-closed and not expired) as the count, added 2026-07-13 so `QuotationStatusSummary`'s count and value columns always describe the same population (previously the value column approximated from `PipelineStage` per-status totals, which don't carve out expired-but-unclosed quotes the way this count does). */
  activeQuotationsValue: number;
  expiredQuotations: number;
  /** Cancelled, expired, Customer Rejected, or Lost — "closed without success." Won and still-active-unexpired quotes are excluded. */
  nonActiveQuotations: number;
  /** Total amount of `nonActiveQuotations` — same exact predicate as the count, see `activeQuotationsValue`. */
  nonActiveQuotationsValue: number;
  /** Count of quotations currently awaiting approval — visible regardless of `quotations:approve` (unlike the actionable `ApprovalDashboard.pendingList`, this is just a count). */
  pendingApprovals: number;
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
  /** Closed Sales — sum of Won quotations' amount only. */
  revenue: number;
  /** Total Quotation Value — sum of every quotation's amount regardless of outcome. */
  totalValue: number;
  expectedRevenue: number;
  conversionRate: number;
  /** Null when this salesperson has no closed (Won or Lost) deals in the filtered set. */
  avgClosingTime: number | null;
  avgDealSize: number;
}

export interface CustomerStat {
  client: string;
  /** Won Value — sum of this customer's Won quotations' amount only. */
  revenue: number;
  /** Total Value — sum of every quotation's amount regardless of outcome. */
  totalValue: number;
  quotationCount: number;
  wonCount: number;
  /** "" if this customer has no quotations with a set issueDate in the filtered set. */
  lastQuotationDate: string;
}

export interface CustomerAnalytics {
  topByRevenue: CustomerStat[];
  topByQuotationCount: CustomerStat[];
  topByWonCount: CustomerStat[];
  /** Customers with more than one quotation in the filtered set, ranked by quotation count. */
  topByRepeat: CustomerStat[];
  repeatCustomerPercentage: number;
}

export interface JobTypeStat {
  jobTypeCode: string;
  jobTypeName: string;
  /** Won Value — sum of this job type's Won quotations' amount only. */
  revenue: number;
  /** Total Value — sum of every quotation's amount regardless of outcome. */
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

/**
 * 2026-07-13: expanded from {created, edited} to all 5 quotation workflow event categories a
 * Codex review flagged as required — see `categoryForAction()` in `api/dashboard/index.ts` for
 * the exact audit-action → category mapping.
 */
export interface SalesActivityPeriod {
  period: string;
  created: number;
  edited: number;
  statusChanged: number;
  approvalRequested: number;
  approvalCompleted: number;
}

export interface SalesActivityTrend {
  weekly: SalesActivityPeriod[];
  monthly: SalesActivityPeriod[];
  quarterly: SalesActivityPeriod[];
  yearly: SalesActivityPeriod[];
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
  /** Null if this quote's approval-history has no "submitted" entry (legacy data). */
  submittedDate: string | null;
  status: string;
}

export interface ApprovalDashboard {
  pendingApprovals: number;
  approvedToday: number;
  rejectedToday: number;
  averageApprovalTime: number | null;
  /** Whether the caller also has `quotations:reject` (viewing this section already implies `quotations:approve`). */
  canReject: boolean;
  pendingList: PendingApprovalItem[];
}

export interface NotificationSummary {
  unreadCount: number;
  byType: Record<string, number>;
}

export interface InterestBreakdown {
  interested: number;
  notInterested: number;
  notEvaluated: number;
}

export interface DashboardStats {
  /** True if the database has ANY quotations (any filter) or products — unfiltered, independent of `kpis.totalQuotations`. Drives the page-level empty state; a narrow filter matching zero results must not hide a database that actually has data. */
  hasAnyData: boolean;
  kpis: DashboardKpis;
  /** Computed server-side from the same filtered quote set as every other widget — added 2026-07-10 (Codex review fix) so the Customer Interest panel respects the Dashboard filters instead of the app-wide unfiltered quote list. */
  interestBreakdown: InterestBreakdown;
  revenueByMonth: { month: string; revenue: number }[];
  revenueTrend: RevenueTrend;
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
  /** Null when the caller lacks auditLog:view (same gate as activityTimeline, both read audit_log). Quotation Created/Updated counts per period, trailing window ending at the date filter's `to` (or today) — same rolling-window rationale as `revenueTrend`. */
  salesActivity: SalesActivityTrend | null;
  /** Null when the caller lacks quotations:approve — the frontend hides the Approval Dashboard section entirely in that case. */
  approvalDashboard: ApprovalDashboard | null;
  notificationSummary: NotificationSummary;
  availableSalespeople: string[];
  /** Distinct `User.department` free-text values across all users — see Dashboard docs for the free-text-matching caveat (no real Department entity yet). */
  availableDepartments: string[];
  filters: { from: string; to: string; salesperson: string; department: string };
}

export interface DashboardFilters {
  from?: string;
  to?: string;
  salesperson?: string;
  department?: string;
}

export async function fetchDashboardStats(filters?: DashboardFilters): Promise<DashboardStats> {
  const params = new URLSearchParams();
  if (filters?.from) params.set("from", filters.from);
  if (filters?.to) params.set("to", filters.to);
  if (filters?.salesperson && filters.salesperson !== "all") params.set("salesperson", filters.salesperson);
  if (filters?.department && filters.department !== "all") params.set("department", filters.department);
  const qs = params.toString();
  return apiFetch<DashboardStats>(`/dashboard${qs ? `?${qs}` : ""}`);
}
