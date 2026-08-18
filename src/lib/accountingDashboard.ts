import { apiFetch } from "./apiClient.js";
import type { ArDocumentType, ArBillingStatus } from "./accounting.js";
import type { TranslationKey } from "./i18n.js";

/**
 * Accounting Dashboard (added 2026-08-18) — a detail view scoped entirely to Accounts Receivable
 * data, separate from the main cross-module Dashboard (`src/lib/dashboard.ts`). See
 * `api/_lib/arHandler.ts`'s `handleDashboard()` for the full "what's period-filtered vs. current-
 * state-snapshot" design note — mirrored here in each field's doc comment so the UI can label
 * sections honestly (see docs/UI_GUIDELINES.md "Filter Honesty").
 */

export interface ArDashboardFilters {
  /** Inclusive ISO date (YYYY-MM-DD). Defaults server-side to the 1st of the current month. */
  from?: string;
  /** Inclusive ISO date (YYYY-MM-DD). Defaults server-side to today. */
  to?: string;
  /** Matches `ScopeOfWork.quotationSalesperson` — unlike `from`/`to`, applies to EVERY section
   * (including the current-state ones), since it's an ownership filter, not a time window. */
  salesperson?: string;
}

export interface ArDashboardKpis {
  /** AR+IV net total issued within `filters` (period-scoped). */
  issuedNet: number;
  issuedCount: number;
  /** VAT portion of the above (period-scoped). */
  vatAmount: number;
  /** Every issued AR/IV with no active receipt yet — current state, NOT period-scoped. */
  outstandingNet: number;
  outstandingCount: number;
  /** Scope of Work count with no issued AR (deposit) document at all — current state. */
  depositNotBilledJobs: number;
  /** Documents cancelled within `filters` (period-scoped). */
  cancelledCount: number;
}

export interface ArDashboardTrendPoint {
  /** "YYYY-MM" */
  month: string;
  /** Thai short label, e.g. "ส.ค. 69" */
  label: string;
  netTotal: number;
  count: number;
}

export interface ArDashboardDocTypeStat {
  docType: ArDocumentType;
  count: number;
  netTotal: number;
}

export interface ArDashboardBillingFunnelStat {
  status: ArBillingStatus;
  count: number;
}

export type ArAgingBucketKey = "notDue" | "d1_30" | "d31_60" | "d61_90" | "d90plus";

export interface ArAgingBucket {
  key: ArAgingBucketKey;
  label: string;
  count: number;
  amount: number;
}

export interface ArAgingInvoice {
  id: string;
  docNo: string;
  docType: "AR" | "IV";
  scopeOfWorkId: string;
  scopeNumber: string;
  customerName: string;
  dueDate: string;
  daysOverdue: number;
  amount: number;
  bucketKey: ArAgingBucketKey;
}

export interface ArDashboardTopCustomer {
  customerName: string;
  count: number;
  netTotal: number;
  /** Current outstanding balance for this customer — NOT period-scoped. */
  outstandingNet: number;
}

export interface ArDashboardStats {
  hasAnyData: boolean;
  filters: { from: string; to: string; salesperson: string };
  availableSalespeople: string[];
  kpis: ArDashboardKpis;
  /** Always the trailing 12 months ending on `filters.to` — unaffected by `filters.from`. */
  trend: ArDashboardTrendPoint[];
  docTypeBreakdown: ArDashboardDocTypeStat[];
  /** Current state across every opened billing milestone — unaffected by `filters`. */
  billingFunnel: ArDashboardBillingFunnelStat[];
  aging: { buckets: ArAgingBucket[]; invoices: ArAgingInvoice[] };
  topCustomers: ArDashboardTopCustomer[];
}

export async function fetchArDashboardStats(filters?: ArDashboardFilters): Promise<ArDashboardStats> {
  const params = new URLSearchParams();
  if (filters?.from) params.set("from", filters.from);
  if (filters?.to) params.set("to", filters.to);
  if (filters?.salesperson) params.set("salesperson", filters.salesperson);
  const qs = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<ArDashboardStats>(`/ar-dashboard${qs}`);
}

export const AGING_BUCKET_COLORS: Record<ArAgingBucketKey, string> = {
  notDue: "#5a7299",
  d1_30: "#c9a84c",
  d31_60: "#e08a3c",
  d61_90: "#d3672f",
  d90plus: "#c23f3f",
};

/** i18n key equivalent of each bucket's `label` field — the server (`handleDashboard()` in
 * `api/_lib/arHandler.ts`) sends `label` as a plain Thai string alongside `key`; the UI should
 * render `t(AGING_BUCKET_LABEL_KEY[bucket.key])` instead of `bucket.label` directly, so this chart
 * translates with the rest of the app. Added 2026-08-18. */
export const AGING_BUCKET_LABEL_KEY: Record<ArAgingBucketKey, TranslationKey> = {
  notDue: "accounting.agingBucket.notDue",
  d1_30: "accounting.agingBucket.d1_30",
  d31_60: "accounting.agingBucket.d31_60",
  d61_90: "accounting.agingBucket.d61_90",
  d90plus: "accounting.agingBucket.d90plus",
};
