import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withErrorHandling, HttpError } from "../_lib/http.js";
import { requirePermission } from "../_lib/auth.js";
import {
  customersCollection, leadsCollection, quotesCollection, productsCollection, categoriesCollection,
  auditLogCollection, notificationsCollection, withStringId, type QuoteFields,
} from "../_lib/collections.js";
import { roleHasPermission } from "../../src/lib/roles.js";
import type { ApprovalHistoryEntry } from "../../src/lib/quotes.js";

const WON_STATUS = "ปิดการขายสำเร็จ";
const LOST_STATUS = "เสียโอกาส";
const CANCELLED_STATUS = "ยกเลิก";
const PENDING_APPROVAL_STATUS = "รออนุมัติ";
const TERMINAL_STATUSES = new Set([WON_STATUS, LOST_STATUS, CANCELLED_STATUS]);
/** Display order — matches QuoteList.tsx's `statuses` array. */
const PIPELINE_ORDER = [
  "ร่าง", "รออนุมัติ", "อนุมัติแล้ว", "ส่งให้ลูกค้าแล้ว",
  "ลูกค้ายอมรับ", "ปิดการขายสำเร็จ", "ลูกค้าปฏิเสธ", "เสียโอกาส", "ยกเลิก",
];
/**
 * True predecessor per `workflowTransitions` in api/_lib/quoteWorkflow.ts (the "from" side of the
 * action that reaches this status) — NOT simply "the previous array entry above," since the
 * workflow branches (ส่งให้ลูกค้าแล้ว leads to either ลูกค้ายอมรับ or ลูกค้าปฏิเสธ, not a single
 * line). "เสียโอกาส" and "ปิดการขายสำเร็จ" are siblings, not sequential — array-adjacency would
 * wrongly compute เสียโอกาส's conversion "from" ปิดการขายสำเร็จ. ยกเลิก has three possible
 * predecessors (ร่าง/รออนุมัติ/อนุมัติแล้ว), so it has no single meaningful one — left null.
 */
const PIPELINE_PREDECESSOR: Record<string, string | null> = {
  "ร่าง": null,
  "รออนุมัติ": "ร่าง",
  "อนุมัติแล้ว": "รออนุมัติ",
  "ส่งให้ลูกค้าแล้ว": "อนุมัติแล้ว",
  "ลูกค้ายอมรับ": "ส่งให้ลูกค้าแล้ว",
  "ปิดการขายสำเร็จ": "ลูกค้ายอมรับ",
  "ลูกค้าปฏิเสธ": "ส่งให้ลูกค้าแล้ว",
  "เสียโอกาส": "ลูกค้าปฏิเสธ",
  "ยกเลิก": null,
};
const MONTHS_BACK = 12;
const TOP_N = 10;
const ACTIVITY_LIMIT = 30;

type QuoteCalcDoc = Pick<
  QuoteFields,
  "status" | "amount" | "client" | "salesperson" | "jobTypeCode" | "jobTypeName" |
  "isPotentialOpportunity" | "followUpDate" | "issueDate" | "expiryDate" | "approvalHistory"
> & { _id: string };

/**
 * Thailand is UTC+7, no DST. Vercel's Node runtime has no guaranteed local timezone (typically
 * UTC), and `issueDate`/`expiryDate`/`followUpDate` are Thailand-local business-date strings —
 * so "today"/month-boundary math here must not use the server's ambient local `Date` getters
 * (wrong timezone) or mix a local constructor with `.toISOString()` (shifts the boundary by a
 * day for any positive-UTC-offset zone). Fix: shift by the fixed offset once, then always read
 * back via UTC getters/`Date.UTC` only — correct regardless of the server's actual configured
 * timezone.
 */
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

function bangkokNow(): Date {
  return new Date(Date.now() + BANGKOK_OFFSET_MS);
}
function todayIsoDate(): string {
  return bangkokNow().toISOString().slice(0, 10);
}

function queryString(req: VercelRequest, key: string): string {
  const v = req.query[key];
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

/** Builds the last N "YYYY-MM" keys ending at the current Bangkok calendar month, oldest first — used to zero-fill months with no real quotes so the chart never renders blank. */
function lastNMonthKeys(n: number): string[] {
  const now = bangkokNow();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - i, 1));
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}

/** Null (not 0) for an empty input — callers must not conflate "no data yet" with a genuine zero-day/zero-percent average. */
function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10;
}

function msToDays(ms: number): number {
  return Math.round((ms / 86400000) * 10) / 10;
}

/** First entry matching `action`, in chronological order (approvalHistory is append-only, already chronological). */
function firstEntry(history: ApprovalHistoryEntry[], action: ApprovalHistoryEntry["action"]): ApprovalHistoryEntry | undefined {
  return history.find((e) => e.action === action);
}
function lastEntry(history: ApprovalHistoryEntry[], action: ApprovalHistoryEntry["action"]): ApprovalHistoryEntry | undefined {
  return [...history].reverse().find((e) => e.action === action);
}

function approvalDurationDays(doc: QuoteCalcDoc): number | null {
  const submitted = firstEntry(doc.approvalHistory, "submitted");
  const approved = firstEntry(doc.approvalHistory, "approved");
  if (!submitted || !approved) return null;
  return msToDays(new Date(approved.createdAt).getTime() - new Date(submitted.createdAt).getTime());
}
function closingDurationDays(doc: QuoteCalcDoc): number | null {
  const won = lastEntry(doc.approvalHistory, "marked_won");
  if (!won) return null;
  const start = doc.approvalHistory[0]?.createdAt ?? doc.issueDate;
  if (!start) return null;
  return msToDays(new Date(won.createdAt).getTime() - new Date(start).getTime());
}

function periodEnd(kind: "month" | "quarter" | "year"): string {
  const now = bangkokNow();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  let endDate: Date;
  if (kind === "month") endDate = new Date(Date.UTC(y, m + 1, 0));
  else if (kind === "quarter") endDate = new Date(Date.UTC(y, m - (m % 3) + 3, 0));
  else endDate = new Date(Date.UTC(y, 11, 31));
  return endDate.toISOString().slice(0, 10);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await withErrorHandling(res, async () => {
    if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
    const ctx = await requirePermission(req, "dashboard:view");

    const from = queryString(req, "from");
    const to = queryString(req, "to");
    const salespersonFilter = queryString(req, "salesperson");
    const today = todayIsoDate();

    const dateMatch: Record<string, unknown> = {};
    if (from || to) {
      const range: Record<string, string> = {};
      if (from) range.$gte = from;
      if (to) range.$lte = to;
      dateMatch.issueDate = range;
    }
    const fullMatch: Record<string, unknown> = { ...dateMatch };
    if (salespersonFilter && salespersonFilter !== "all") fullMatch.salesperson = salespersonFilter;
    /**
     * Salesperson-only, deliberately WITHOUT the date-range filter — for the two trailing-12-month
     * trend series (revenueByMonth, monthlyClosingRate). Applying `from`/`to` to a "last 12
     * months" trend chart would collapse it to whatever narrow window the KPI filter picked (e.g.
     * a single day for the "Today" preset), defeating the point of a trend chart. Same rationale
     * already applied to the follow-ups query below.
     */
    const salespersonOnlyMatch: Record<string, unknown> = {};
    if (salespersonFilter && salespersonFilter !== "all") salespersonOnlyMatch.salesperson = salespersonFilter;

    const [customers, leads, quotes, products, categories] = await Promise.all([
      customersCollection(), leadsCollection(), quotesCollection(), productsCollection(), categoriesCollection(),
    ]);

    const projection = {
      status: 1, amount: 1, client: 1, salesperson: 1, jobTypeCode: 1, jobTypeName: 1,
      isPotentialOpportunity: 1, followUpDate: 1, issueDate: 1, expiryDate: 1, approvalHistory: 1,
    } as const;

    const [
      totalCustomers, totalLeads, totalProducts, totalQuotationsAllTime,
      revenueByMonthAgg, productsByCategoryAgg, categoryDocs,
      docsRaw, allClientCountsAgg, followUpDocsRaw, historicalOutcomeAgg, monthlyOutcomeAgg,
    ] = await Promise.all([
      customers.countDocuments({ deletedAt: null }),
      leads.countDocuments({ deletedAt: null }),
      products.countDocuments({ archived: false }),
      // Deliberately unfiltered (no date/salesperson match) — this is what decides whether the page
      // shows "no business data yet" at all, which must stay true regardless of the current filter
      // selection. `kpis.totalQuotations` below is correctly filter-scoped for its own KPI card;
      // conflating the two previously meant an empty-result filter (e.g. "Today" on a quiet day)
      // could hide the entire dashboard behind the empty state even with years of real history.
      quotes.estimatedDocumentCount(),
      quotes.aggregate<{ _id: string; revenue: number }>([
        { $match: { ...salespersonOnlyMatch, status: WON_STATUS, issueDate: { $regex: /^\d{4}-\d{2}-\d{2}$/ } } },
        { $group: { _id: { $substr: ["$issueDate", 0, 7] }, revenue: { $sum: "$amount" } } },
      ]).toArray(),
      products.aggregate<{ _id: string; count: number }>([
        { $match: { archived: false } },
        { $group: { _id: "$categoryId", count: { $sum: 1 } } },
      ]).toArray(),
      categories.find({}).toArray(),
      quotes.find(fullMatch, { projection }).toArray() as unknown as Promise<QuoteCalcDoc[]>,
      quotes.aggregate<{ _id: string; count: number }>([{ $group: { _id: "$client", count: { $sum: 1 } } }]).toArray(),
      // Follow-ups ignore the date-range filter (they're about upcoming action items, not when the quote was issued) but still respect the salesperson filter.
      quotes.find(
        salespersonOnlyMatch,
        { projection: { status: 1, client: 1, salesperson: 1, followUpDate: 1, amount: 1 } },
      ).toArray(),
      // Deliberately company-wide only (no salesperson filter) — the forecast's weighting baseline is a
      // trailing-12-month win rate meant to be a stable, low-noise reference; narrowing it to one
      // salesperson's own (much smaller) win/loss sample would make the forecast noisier, not more accurate.
      quotes.aggregate<{ _id: string; count: number }>([
        { $match: { status: { $in: [WON_STATUS, LOST_STATUS] }, issueDate: { $gte: lastNMonthKeys(MONTHS_BACK)[0] } } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]).toArray(),
      quotes.aggregate<{ _id: { month: string; status: string }; count: number }>([
        { $match: { ...salespersonOnlyMatch, status: { $in: [WON_STATUS, LOST_STATUS] }, issueDate: { $regex: /^\d{4}-\d{2}-\d{2}$/ } } },
        { $group: { _id: { month: { $substr: ["$issueDate", 0, 7] }, status: "$status" }, count: { $sum: 1 } } },
      ]).toArray(),
    ]);

    // MongoDB enforces no schema — a doc predating a field (legacy/seed data) or written outside
    // this app's own API could have `client`/`salesperson` missing entirely, and `.trim()`ing
    // `undefined` throughout this file would 500 the whole dashboard for every user over one bad
    // document. Normalize once here rather than defensively guarding every call site below.
    const docs = (docsRaw as QuoteCalcDoc[]).map((q) => ({ ...q, client: q.client ?? "", salesperson: q.salesperson ?? "" }));

    // ── KPIs ──────────────────────────────────────────────────────────────
    const totalQuotations = docs.length;
    const totalQuotationValue = docs.reduce((s, q) => s + q.amount, 0);
    const wonDocs = docs.filter((q) => q.status === WON_STATUS);
    const lostDocs = docs.filter((q) => q.status === LOST_STATUS);
    const wonDeals = wonDocs.length;
    const lostDeals = lostDocs.length;
    const closedSales = wonDocs.reduce((s, q) => s + q.amount, 0);
    const expectedSales = docs
      .filter((q) => q.isPotentialOpportunity && !TERMINAL_STATUSES.has(q.status))
      .reduce((s, q) => s + q.amount, 0);
    const averageDealSize = wonDeals > 0 ? closedSales / wonDeals : 0;
    const winRate = wonDeals + lostDeals > 0 ? (wonDeals / (wonDeals + lostDeals)) * 100 : 0;
    const loseRate = wonDeals + lostDeals > 0 ? (lostDeals / (wonDeals + lostDeals)) * 100 : 0;
    const conversionRate = totalQuotations > 0 ? (wonDeals / totalQuotations) * 100 : 0;
    const approvalDurations = docs.map(approvalDurationDays).filter((v): v is number => v !== null);
    const closingDurations = docs.map(closingDurationDays).filter((v): v is number => v !== null);
    const averageApprovalTime = avg(approvalDurations);
    const averageClosingTime = avg(closingDurations);
    const activeQuotations = docs.filter((q) => !TERMINAL_STATUSES.has(q.status)).length;
    const expiredQuotations = docs.filter((q) => !TERMINAL_STATUSES.has(q.status) && q.expiryDate && q.expiryDate < today).length;
    // overdueFollowups is derived from `followUps.overdue` below (not recomputed from `docs`) so the KPI
    // card and the Follow-Up Reminders panel can never disagree — they deliberately share the same
    // date-filter-agnostic source, since a follow-up reminder shouldn't disappear just because the
    // quote it's on falls outside the currently-selected reporting date range.

    const totalQuoteCountByClient = new Map(allClientCountsAgg.map((c) => [c._id, c.count]));
    const clientsInFilteredSet = new Set(docs.filter((q) => q.client.trim()).map((q) => q.client));
    let newCustomers = 0;
    let repeatCustomers = 0;
    for (const client of clientsInFilteredSet) {
      if ((totalQuoteCountByClient.get(client) ?? 0) > 1) repeatCustomers++;
      else newCustomers++;
    }

    // ── Pipeline ──────────────────────────────────────────────────────────
    const pipelineCounts = new Map<string, { count: number; totalValue: number }>();
    for (const q of docs) {
      const entry = pipelineCounts.get(q.status) ?? { count: 0, totalValue: 0 };
      entry.count += 1;
      entry.totalValue += q.amount;
      pipelineCounts.set(q.status, entry);
    }
    const pipeline = PIPELINE_ORDER.map((stage) => {
      const { count, totalValue } = pipelineCounts.get(stage) ?? { count: 0, totalValue: 0 };
      const prevStage = PIPELINE_PREDECESSOR[stage];
      const prevCount = prevStage ? (pipelineCounts.get(prevStage)?.count ?? 0) : 0;
      const conversionFromPrevious = prevStage && prevCount > 0 ? Math.round((count / prevCount) * 1000) / 10 : null;
      return { stage, count, totalValue, conversionFromPrevious };
    });

    // ── Sales performance (also powers the Executive Ranking on the frontend) ──
    const salespersonNames = [...new Set(docs.filter((q) => q.salesperson.trim()).map((q) => q.salesperson))];
    const salesPerformance = salespersonNames.map((salesperson) => {
      const mine = docs.filter((q) => q.salesperson === salesperson);
      const mineWon = mine.filter((q) => q.status === WON_STATUS);
      const mineLost = mine.filter((q) => q.status === LOST_STATUS);
      const revenue = mineWon.reduce((s, q) => s + q.amount, 0);
      const expectedRevenue = mine
        .filter((q) => q.isPotentialOpportunity && !TERMINAL_STATUSES.has(q.status))
        .reduce((s, q) => s + q.amount, 0);
      const closingDays = mineWon.map(closingDurationDays).filter((v): v is number => v !== null);
      return {
        salesperson,
        quotationCount: mine.length,
        won: mineWon.length,
        lost: mineLost.length,
        pending: mine.filter((q) => q.status === PENDING_APPROVAL_STATUS).length,
        revenue,
        expectedRevenue,
        conversionRate: mine.length > 0 ? Math.round((mineWon.length / mine.length) * 1000) / 10 : 0,
        avgClosingTime: avg(closingDays),
        avgDealSize: mineWon.length > 0 ? revenue / mineWon.length : 0,
      };
    }).sort((a, b) => b.revenue - a.revenue);

    // ── Customer analytics ───────────────────────────────────────────────
    const customerStats = [...clientsInFilteredSet].map((client) => {
      const mine = docs.filter((q) => q.client === client);
      const mineWon = mine.filter((q) => q.status === WON_STATUS);
      return { client, revenue: mineWon.reduce((s, q) => s + q.amount, 0), quotationCount: mine.length, wonCount: mineWon.length };
    });
    const customerAnalytics = {
      topByRevenue: [...customerStats].sort((a, b) => b.revenue - a.revenue).slice(0, TOP_N),
      topByQuotationCount: [...customerStats].sort((a, b) => b.quotationCount - a.quotationCount).slice(0, TOP_N),
      topByWonCount: [...customerStats].sort((a, b) => b.wonCount - a.wonCount).slice(0, TOP_N),
      repeatCustomerPercentage: newCustomers + repeatCustomers > 0 ? Math.round((repeatCustomers / (newCustomers + repeatCustomers)) * 1000) / 10 : 0,
    };

    // ── Job type analytics ───────────────────────────────────────────────
    const jobTypeCodes = [...new Set(docs.filter((q) => q.jobTypeCode).map((q) => q.jobTypeCode))];
    const jobTypeAnalytics = jobTypeCodes.map((jobTypeCode) => {
      const mine = docs.filter((q) => q.jobTypeCode === jobTypeCode);
      const mineWon = mine.filter((q) => q.status === WON_STATUS);
      const revenue = mineWon.reduce((s, q) => s + q.amount, 0);
      return {
        jobTypeCode,
        jobTypeName: mine[0]?.jobTypeName ?? jobTypeCode,
        revenue,
        count: mine.length,
        won: mineWon.length,
        winRate: mine.length > 0 ? Math.round((mineWon.length / mine.length) * 1000) / 10 : 0,
        avgDealSize: mineWon.length > 0 ? revenue / mineWon.length : 0,
      };
    }).sort((a, b) => b.revenue - a.revenue);

    // ── Forecast — live weighted estimate, not stored ────────────────────
    const wonLast12 = historicalOutcomeAgg.find((o) => o._id === WON_STATUS)?.count ?? 0;
    const lostLast12 = historicalOutcomeAgg.find((o) => o._id === LOST_STATUS)?.count ?? 0;
    const historicalWinRate = wonLast12 + lostLast12 > 0 ? wonLast12 / (wonLast12 + lostLast12) : 0;
    const openOpportunities = docs.filter((q) => q.isPotentialOpportunity && !TERMINAL_STATUSES.has(q.status) && q.expiryDate);
    const forecastFor = (kind: "month" | "quarter" | "year") => {
      const end = periodEnd(kind);
      return Math.round(
        openOpportunities
          .filter((q) => q.expiryDate >= today && q.expiryDate <= end)
          .reduce((s, q) => s + q.amount, 0) * historicalWinRate,
      );
    };
    const forecast = {
      thisMonth: forecastFor("month"),
      thisQuarter: forecastFor("quarter"),
      thisYear: forecastFor("year"),
      historicalWinRate: Math.round(historicalWinRate * 1000) / 10,
    };

    // ── Follow-ups ────────────────────────────────────────────────────────
    const followUpDocs = (followUpDocsRaw as Array<Pick<QuoteFields, "status" | "client" | "salesperson" | "followUpDate" | "amount"> & { _id: string }>)
      .filter((q) => q.followUpDate && !TERMINAL_STATUSES.has(q.status));
    const toFollowUpSummary = (q: (typeof followUpDocs)[number]) => ({
      id: q._id, client: q.client, salesperson: q.salesperson, followUpDate: q.followUpDate, amount: q.amount,
    });
    const followUps = {
      today: followUpDocs.filter((q) => q.followUpDate === today).map(toFollowUpSummary),
      overdue: followUpDocs.filter((q) => q.followUpDate < today).map(toFollowUpSummary),
      upcoming: followUpDocs.filter((q) => q.followUpDate > today).map(toFollowUpSummary),
    };

    // ── Activity timeline — only for callers who can already see the audit log ──
    let activityTimeline: ReturnType<typeof withStringId>[] | null = null;
    if (roleHasPermission(ctx.role, "auditLog:view")) {
      const auditLog = await auditLogCollection();
      const entries = await auditLog.find({}).sort({ createdAt: -1 }).limit(ACTIVITY_LIMIT).toArray();
      activityTimeline = entries.map(withStringId);
    }

    // ── Approval dashboard — only for callers who can already approve quotations ──
    let approvalDashboard: {
      pendingApprovals: number; approvedToday: number; rejectedToday: number; averageApprovalTime: number | null;
    } | null = null;
    if (roleHasPermission(ctx.role, "quotations:approve")) {
      const approvedToday = docs.filter((q) => lastEntry(q.approvalHistory, "approved")?.createdAt.startsWith(today)).length;
      const rejectedToday = docs.filter((q) => lastEntry(q.approvalHistory, "rejected")?.createdAt.startsWith(today)).length;
      approvalDashboard = {
        pendingApprovals: docs.filter((q) => q.status === PENDING_APPROVAL_STATUS).length,
        approvedToday, rejectedToday, averageApprovalTime,
      };
    }

    // ── Notification summary — per-caller, same scoping as GET /api/notifications ──
    // Also parallelized with the two independent queries below it (previously three sequential
    // awaits in a row, none of which depend on each other or on anything computed above).
    const notifications = await notificationsCollection();
    const [myNotifications, availableSalespeopleRaw] = await Promise.all([
      // Only `read` docs' `.type` field is ever read below — no need to fetch full Notification
      // documents (title/description/module/relatedQuoteId) just to count them by type.
      notifications.find({ recipientUserId: ctx.user.id, read: false }, { projection: { type: 1 } }).toArray(),
      // Available salespeople (for the filter dropdown) — respects the date filter only.
      quotes.distinct("salesperson", dateMatch),
    ]);
    const notificationsByType: Record<string, number> = {};
    for (const n of myNotifications) notificationsByType[n.type] = (notificationsByType[n.type] ?? 0) + 1;
    // unreadCount is exactly myNotifications.length (same filter) — no separate countDocuments round trip.
    const notificationSummary = { unreadCount: myNotifications.length, byType: notificationsByType };
    const availableSalespeople = availableSalespeopleRaw.filter((s): s is string => !!s && s.trim() !== "").sort();

    // ── Monthly closing rate — win rate per calendar month, trailing 12 months ──
    const monthlyOutcomeMap = new Map<string, { won: number; lost: number }>();
    for (const o of monthlyOutcomeAgg) {
      const entry = monthlyOutcomeMap.get(o._id.month) ?? { won: 0, lost: 0 };
      if (o._id.status === WON_STATUS) entry.won += o.count; else entry.lost += o.count;
      monthlyOutcomeMap.set(o._id.month, entry);
    }
    const monthlyClosingRate = lastNMonthKeys(MONTHS_BACK).map((month) => {
      const { won, lost } = monthlyOutcomeMap.get(month) ?? { won: 0, lost: 0 };
      // null (not 0) when there were no won/lost deals that month — a real 0% win rate (deals that
      // all lost) must render as a visible flat line, not be hidden behind the chart's empty state.
      return { month, winRate: won + lost > 0 ? Math.round((won / (won + lost)) * 1000) / 10 : null };
    });

    // ── Legacy sections (unchanged shape, still needed by the existing revenue/category widgets) ──
    const revenueByMonthMap = new Map(revenueByMonthAgg.map((r) => [r._id, r.revenue]));
    const revenueByMonth = lastNMonthKeys(MONTHS_BACK).map((month) => ({ month, revenue: revenueByMonthMap.get(month) ?? 0 }));
    const categoryNameById = new Map(categoryDocs.map((c) => [c._id.toString(), c.name]));
    const totalCategorizedProducts = productsByCategoryAgg.reduce((sum, c) => sum + c.count, 0);
    const categoryBreakdown = productsByCategoryAgg
      .map((c) => ({
        categoryId: c._id,
        categoryName: categoryNameById.get(c._id) ?? "ไม่ระบุหมวดหมู่",
        count: c.count,
        percentage: totalCategorizedProducts > 0 ? Math.round((c.count / totalCategorizedProducts) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.count - a.count);

    res.status(200).json({
      hasAnyData: totalQuotationsAllTime > 0 || totalProducts > 0,
      kpis: {
        totalCustomers, totalLeads, totalProducts,
        totalQuotations, totalQuotationValue, closedSales, expectedSales,
        wonDeals, lostDeals, averageDealSize, winRate, loseRate, conversionRate,
        averageApprovalTime, averageClosingTime, activeQuotations, expiredQuotations,
        overdueFollowups: followUps.overdue.length,
        newCustomers, repeatCustomers,
      },
      revenueByMonth,
      categoryBreakdown,
      monthlyClosingRate,
      pipeline,
      salesPerformance,
      customerAnalytics,
      jobTypeAnalytics,
      forecast,
      followUps,
      activityTimeline,
      approvalDashboard,
      notificationSummary,
      availableSalespeople,
      filters: { from, to, salesperson: salespersonFilter || "all" },
    });
  });
}
