import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withErrorHandling, HttpError } from "../_lib/http.js";
import { requirePermission } from "../_lib/auth.js";
import {
  customersCollection, leadsCollection, quotesCollection, productsCollection, categoriesCollection,
  auditLogCollection, notificationsCollection, usersCollection, jobTypesCollection, scopeOfWorksCollection,
  deliveryOrdersCollection,
  withStringId, type QuoteFields,
} from "../_lib/collections.js";
import { roleHasPermission } from "../../src/lib/roles.js";
import { DOCUMENT_RECIPIENT_DEPARTMENTS } from "../../src/lib/documentRequirements.js";
import type { ApprovalHistoryEntry } from "../../src/lib/quotes.js";
import { computeQuoteAmountBeforeVat } from "../_lib/quoteAmounts.js";
import { dedupeQuotesByRevisionChain } from "../_lib/quoteRevisions.js";

const WON_STATUS = "ปิดการขายสำเร็จ";
const LOST_STATUS = "เสียโอกาส";
const CANCELLED_STATUS = "ยกเลิก";
const PENDING_APPROVAL_STATUS = "รออนุมัติ";
const CUSTOMER_REJECTED_STATUS = "ลูกค้าปฏิเสธ";
/** State-machine-final statuses — no outgoing `workflowTransitions` entry reaches anywhere from these (see api/_lib/quoteWorkflow.ts). Used for pipeline/state-machine logic, not "is this still a genuinely open opportunity" checks — see CLOSED_STATUSES for that. */
const TERMINAL_STATUSES = new Set([WON_STATUS, LOST_STATUS, CANCELLED_STATUS]);
/**
 * "Not a genuinely open sales opportunity anymore" — TERMINAL_STATUSES plus Customer Rejected.
 * เสียโอกาส (Lost) is customer-rejected-and-formally-closed-out; ลูกค้าปฏิเสธ (Customer Rejected)
 * itself is the step just before that close-out and can *only* transition to Lost from here (see
 * `workflowTransitions`) — it can never become Won again, so treating it as "still active/open"
 * (as an earlier version of this file did, via TERMINAL_STATUSES alone) let already-rejected
 * quotes count as Active Jobs and as open forecast/expected-revenue pipeline. Found by the
 * 2026-07-10 Codex review. Deliberately a *different* set from TERMINAL_STATUSES rather than
 * folding Customer Rejected into it, since PIPELINE_PREDECESSOR/pipeline-stage logic genuinely
 * does still need to treat Customer Rejected as its own live pipeline stage, not a terminal one.
 */
const CLOSED_STATUSES = new Set([...TERMINAL_STATUSES, CUSTOMER_REJECTED_STATUS]);
/**
 * "Closed without success, and not already its own row" — Customer Rejected, Cancelled. Won is a
 * success and Active statuses are still in play, so neither belongs here. **Lost (เสียโอกาส) is
 * deliberately excluded**, even though it's also "closed without success" — 2026-07-13, fixing a
 * Codex-flagged bug where `เสียโอกาส` counted in *both* the Lose row and the Non-Active row of
 * `QuotationStatusSummary`'s donut/table, so the 4 rows' counts summed to more than `docs.length`
 * and their percentages (each row ÷ the 4-row sum) didn't add up to 100% — a real correctness bug
 * for an executive-facing summary, not just a documentation nit. With Lost excluded here, Won +
 * Lost + Active + Non-Active are a true partition of every quote status (see the exhaustive check
 * in `nonActiveDocs` below) — every quote counts in exactly one of the four rows now.
 */
const NON_ACTIVE_OUTCOME_STATUSES = new Set([CUSTOMER_REJECTED_STATUS, CANCELLED_STATUS]);
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

/**
 * P'Keng/P'Kee business requirement (2026-07-14), reworked the same day per a follow-up
 * requirement to compute from an authoritative source rather than back-deriving from the persisted
 * VAT-included total: every Dashboard monetary total must be reported pre-tax. `Quote` has no
 * stored pre-tax/subtotal field — only `amount` (VAT-included) is persisted — so the before-VAT
 * figure is recomputed directly from each quote's own `lines`/`discount` via the shared
 * `computeQuoteAmountBeforeVat()` (`api/_lib/quoteAmounts.ts`, also used by `quoteValidation.ts` to
 * derive the persisted `amount` on create/edit) rather than dividing `amount` back down by a fixed
 * VAT rate. Every quote has carried real `lines`/`discount` data since the 2026-07-08 rewrite (see
 * CHANGELOG.md), so this is always computable — an empty `lines` array correctly yields `0`.
 */

/**
 * `ensureIndexes()` in api/_lib/collections.ts only ever runs from the one-time Setup Wizard
 * bootstrap (`api/handlers/auth.ts`), which is permanently unreachable on an already-provisioned
 * deployment — so indexes added there after go-live never actually get created in production. Same
 * defensive-idempotent-createIndex pattern already used by `seedJobTypesIfEmpty()` (see
 * api/_lib/systemSeed.ts), scoped to once per warm serverless instance rather than every request.
 */
let quoteAnalyticsIndexesEnsured = false;
async function ensureQuoteAnalyticsIndexes(
  quotes: Awaited<ReturnType<typeof quotesCollection>>,
  auditLog: Awaited<ReturnType<typeof auditLogCollection>>,
): Promise<void> {
  if (quoteAnalyticsIndexesEnsured) return;
  await Promise.all([
    quotes.createIndex({ isPotentialOpportunity: 1 }),
    quotes.createIndex({ client: 1 }),
    // Compound indexes added per the 2026-07-10 Codex review's Medium finding — the single-field
    // indexes on salesperson/status/issueDate/followUpDate/isPotentialOpportunity each individually
    // exist, but every real Dashboard query combines two or more of them, which a single-field
    // index can't serve efficiently on its own.
    quotes.createIndex({ salesperson: 1, issueDate: 1 }),
    quotes.createIndex({ status: 1, issueDate: 1 }),
    quotes.createIndex({ followUpDate: 1, status: 1 }),
    quotes.createIndex({ isPotentialOpportunity: 1, status: 1, expiryDate: 1 }),
    // Supports the newly filter-aware Activity Timeline query above (userName + createdAt range).
    auditLog.createIndex({ userName: 1, createdAt: -1 }),
    // Supports the salesActivity query (2026-07-13, P'Keng/P'Kee pass: expanded from 2 to 5
    // ACTIVITY_ACTIONS values, and commonly runs with "All Sales" selected — i.e. filtered by
    // `action` alone, with no `userName` for the {userName,createdAt} index above to serve).
    auditLog.createIndex({ action: 1, createdAt: -1 }),
  ]);
  quoteAnalyticsIndexesEnsured = true;
}

type QuoteCalcDoc = Pick<
  QuoteFields,
  "status" | "client" | "salesperson" | "jobTypeCode" | "jobTypeName" |
  "isPotentialOpportunity" | "followUpDate" | "issueDate" | "expiryDate" | "approvalHistory" | "interest" |
  "lines" | "discount"
> & { _id: string; amount: number };

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

/** UTC instant range covering the Bangkok-local calendar day(s) `[from, to]` — for filtering real UTC timestamp fields (e.g. audit_log's `createdAt`) by the same Bangkok-local date-range preset used everywhere else, unlike `issueDate`/etc. which are already plain Bangkok-local date strings needing no conversion. */
function bangkokDayBoundsUtc(from: string, to: string): { $gte?: string; $lt?: string } {
  const range: { $gte?: string; $lt?: string } = {};
  if (from) range.$gte = new Date(new Date(`${from}T00:00:00Z`).getTime() - BANGKOK_OFFSET_MS).toISOString();
  if (to) range.$lt = new Date(new Date(`${to}T00:00:00Z`).getTime() - BANGKOK_OFFSET_MS + 86400000).toISOString();
  return range;
}

function queryString(req: VercelRequest, key: string): string {
  const v = req.query[key];
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

/** Builds the last N "YYYY-MM" keys ending at `anchor`'s Bangkok calendar month (default: today), oldest first — used to zero-fill months with no real quotes so the chart never renders blank. */
function lastNMonthKeys(n: number, anchor?: Date): string[] {
  const now = anchor ?? bangkokNow();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - i, 1));
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}

/** ISO week key "YYYY-Www" for a Bangkok-local calendar date (Date.UTC-based, Monday-start ISO week). */
function isoWeekKey(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
function quarterKey(y: number, m: number): string {
  return `${y}-Q${Math.floor(m / 3) + 1}`;
}
/** Builds the last N ISO-week keys ending at `anchor`'s Bangkok week, oldest first. */
function lastNWeekKeys(n: number, anchor: Date): string[] {
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate() - i * 7));
    keys.push(isoWeekKey(d));
  }
  return keys;
}
/** Builds the last N "YYYY-Qn" keys ending at `anchor`'s Bangkok quarter, oldest first. */
function lastNQuarterKeys(n: number, anchor: Date): string[] {
  const y = anchor.getUTCFullYear();
  const startQuarterIndex = y * 4 + Math.floor(anchor.getUTCMonth() / 3);
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const qi = startQuarterIndex - i;
    keys.push(quarterKey(Math.floor(qi / 4), (((qi % 4) + 4) % 4) * 3));
  }
  return keys;
}
/** Builds the last N "YYYY" keys ending at `anchor`'s Bangkok year, oldest first. */
function lastNYearKeys(n: number, anchor: Date): string[] {
  const y = anchor.getUTCFullYear();
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) keys.push(String(y - i));
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
/**
 * Days between quotation creation and its terminal Won *or* Lost outcome — per the Dashboard
 * spec's "Average time between quotation creation and Won/Lost status," not Won-only. A quote
 * can only reach one of the two, so `marked_won`/`marked_lost` are mutually exclusive per doc.
 */
function closingDurationDays(doc: QuoteCalcDoc): number | null {
  const outcome = lastEntry(doc.approvalHistory, "marked_won") ?? lastEntry(doc.approvalHistory, "marked_lost");
  if (!outcome) return null;
  const start = doc.approvalHistory[0]?.createdAt ?? doc.issueDate;
  if (!start) return null;
  return msToDays(new Date(outcome.createdAt).getTime() - new Date(start).getTime());
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
    const departmentFilter = queryString(req, "department");
    const today = todayIsoDate();

    const [customers, leads, quotes, products, categories, users, jobTypes, auditLog] = await Promise.all([
      customersCollection(), leadsCollection(), quotesCollection(), productsCollection(), categoriesCollection(),
      usersCollection(), jobTypesCollection(), auditLogCollection(),
    ]);
    // Index creation is incidental infrastructure, not data the response depends on — a transient
    // failure here (e.g. a conflicting index option on a warm instance) must not 500 the whole
    // dashboard. 2026-07-14, Codex review High Priority fix (see docs/CODEX_REVIEW_REPORT.md).
    try {
      await ensureQuoteAnalyticsIndexes(quotes, auditLog);
    } catch (err) {
      console.error("[dashboard] ensureQuoteAnalyticsIndexes failed", err);
    }

    // `User.department` is free text (no real Department entity yet — see DATABASE.md), joined here
    // to `Quote.salesperson` by exact name match, the same free-text-matching convention already
    // used for client/customer analytics. A department filter resolves to "these salesperson names."
    const allUsers = await users.find({}, { projection: { fullName: 1, department: 1 } }).toArray();
    const availableDepartments = [...new Set(allUsers.map((u) => u.department).filter((d): d is string => !!d && d.trim() !== ""))].sort();
    const salespeopleInDepartment = departmentFilter && departmentFilter !== "all"
      ? new Set(allUsers.filter((u) => u.department === departmentFilter).map((u) => u.fullName))
      : null;

    // No `isDeleted`/soft-delete predicate is applied to any quote query below — deliberately, not
    // an oversight. An independent 2026-07-14 Codex review flagged the *absence* of one as a High
    // Priority risk ("unsafe if archived/imported quotations obtain isDeleted: true"), but also
    // confirmed no such field exists on `Quote`/`QuoteFields` today (grep confirms: neither the
    // type in src/lib/quotes.tsx nor api/_lib/collections.ts defines one; quotations are removed
    // from "active" only via the `ยกเลิก`/Cancelled status, not a soft-delete flag). Filtering on a
    // field that can never be set today would be dead code implying a deletion feature that
    // doesn't exist — the review's own suggested alternative resolution ("formally update the
    // approved business requirement... until [a real field is added]") is what's applied here: this
    // comment is that formal acknowledgment. If a real soft-delete field is ever added to `Quote`,
    // every quote query in this file (`fullMatch`, `salespersonOnlyMatch`, the won-revenue/
    // follow-up/client-count/distinct-salesperson queries below) must be updated together.
    const dateMatch: Record<string, unknown> = {};
    if (from || to) {
      const range: Record<string, string> = {};
      if (from) range.$gte = from;
      if (to) range.$lte = to;
      dateMatch.issueDate = range;
    }
    // ── Own-data-only scoping (2026-07-24, direct user decision) ─────────────────────────────────
    // A caller without `quotations:viewAll` sees the whole Dashboard computed from only their own
    // quotes — the exact same ownership predicate `GET /api/quotes` uses for its list (own
    // `createdByUserId`, plus ownerless legacy/seed quotes). Previously the Dashboard showed
    // company-wide aggregates to every `dashboard:view` holder, which leaked colleagues'
    // totals/rankings to roles the list pages deliberately restrict. Injected into `dateMatch`
    // BEFORE `fullMatch` spreads it (so both inherit it), and into `salespersonOnlyMatch` below.
    // Two queries deliberately stay company-wide (see their own comments): the new-vs-repeat client
    // classification (a client is a repeat customer of the COMPANY; only the caller's own clients
    // are ever displayed) and the forecast's trailing-12-month win-rate baseline (a stable
    // ratio, not per-quote data). `approvalDashboard` also stays unscoped — an approver must see
    // everyone's pending quotes to do their job, and it has its own `quotations:approve` gate.
    const ownDataOnly = !roleHasPermission(ctx.role, "quotations:viewAll");
    const ownQuoteClause = { $or: [{ createdByUserId: ctx.user.id }, { createdByUserId: "" }] };
    if (ownDataOnly) Object.assign(dateMatch, ownQuoteClause);
    const fullMatch: Record<string, unknown> = { ...dateMatch };
    if (salespersonFilter && salespersonFilter !== "all") fullMatch.salesperson = salespersonFilter;
    if (salespeopleInDepartment) {
      const deptCond = { salesperson: { $in: [...salespeopleInDepartment] } };
      if (fullMatch.salesperson) {
        // A specific salesperson is also selected — AND both conditions explicitly rather than
        // letting the second `salesperson` key silently clobber the first.
        fullMatch.$and = [{ salesperson: fullMatch.salesperson }, deptCond];
        delete fullMatch.salesperson;
      } else {
        Object.assign(fullMatch, deptCond);
      }
    }
    /**
     * Salesperson/department-only, deliberately WITHOUT the date-range filter — for the trend
     * series (revenueTrend, monthlyClosingRate, forecast). These render a rolling window ending at
     * `to` (or today) rather than being bounded by `from` too — collapsing a 12-point trend chart
     * to a single day (e.g. the "Today" preset) would defeat the point of a trend chart. The window's
     * *end* still moves with the date filter, so the filter is never purely cosmetic here — see
     * MODULES/Dashboard.md for the documented rationale.
     */
    const salespersonOnlyMatch: Record<string, unknown> = {};
    if (ownDataOnly) Object.assign(salespersonOnlyMatch, ownQuoteClause);
    if (salespersonFilter && salespersonFilter !== "all") salespersonOnlyMatch.salesperson = salespersonFilter;
    if (salespeopleInDepartment) {
      const deptCond = { salesperson: { $in: [...salespeopleInDepartment] } };
      if (salespersonOnlyMatch.salesperson) {
        salespersonOnlyMatch.$and = [{ salesperson: salespersonOnlyMatch.salesperson }, deptCond];
        delete salespersonOnlyMatch.salesperson;
      } else {
        Object.assign(salespersonOnlyMatch, deptCond);
      }
    }
    const trendAnchor = to ? new Date(`${to}T00:00:00Z`) : bangkokNow();

    const projection = {
      status: 1, client: 1, salesperson: 1, jobTypeCode: 1, jobTypeName: 1,
      isPotentialOpportunity: 1, followUpDate: 1, issueDate: 1, expiryDate: 1, approvalHistory: 1, interest: 1,
      lines: 1, discount: 1,
    } as const;

    const [
      totalCustomers, totalLeads, totalProducts, totalQuotationsAllTime,
      revenueTrendDocsRaw, productsByCategoryAgg, categoryDocs,
      docsRaw, allClientDocsRaw, followUpDocsRaw, historicalOutcomeDocsRaw, monthlyOutcomeDocsRaw,
      activeJobTypes,
    ] = await Promise.all([
      // Total Customers/Leads/Products, and `categoryBreakdown` below, are deliberately company-wide,
      // all-time catalog/entity counts — NOT scoped by the date-range/salesperson/department filter.
      // Flagged by the 2026-07-10 Codex review as an inconsistency against "every widget respects
      // the filter"; the considered conclusion is that these are catalog metrics, not sales-activity
      // metrics — a product or a CRM customer record doesn't have a meaningful "issued on this date
      // by this salesperson" dimension to filter by (products aren't owned by a salesperson at all;
      // Customer/Lead counts will be 0 until that module ships regardless). Documented explicitly
      // here and in MODULES/Dashboard.md rather than forcing a filter that wouldn't mean anything.
      customers.countDocuments({ isDeleted: false }),
      leads.countDocuments({ deletedAt: null }),
      products.countDocuments({ archived: false }),
      // Deliberately unfiltered (no date/salesperson match) — this is what decides whether the page
      // shows "no business data yet" at all, which must stay true regardless of the current filter
      // selection. `kpis.totalQuotations` below is correctly filter-scoped for its own KPI card;
      // conflating the two previously meant an empty-result filter (e.g. "Today" on a quiet day)
      // could hide the entire dashboard behind the empty state even with years of real history.
      // Left as a raw, un-deduped count on purpose — every revision of a rewritten quotation is
      // still a real document proving "there is data," so double-counting a rewrite chain here is
      // harmless (this feeds only a `> 0` boolean gate, never a displayed number — see `hasAnyData`).
      quotes.estimatedDocumentCount(),
      // Raw (status, issueDate, lines, discount) for every quote in scope — bucketed in JS into
      // week/month/quarter/year Won-revenue series below. **No `status: WON_STATUS` filter at the
      // Mongo level anymore** (2026-07-22, Rewrite double-counting fix) — a rewrite chain's status
      // must be resolved from its LATEST revision only (see `dedupeQuotesByRevisionChain()`), which
      // requires fetching every status for a chain, not just the ones already known to be Won; the
      // WON_STATUS filter is applied in JS below, after dedup.
      quotes.find(
        { ...salespersonOnlyMatch, issueDate: { $regex: /^\d{4}-\d{2}-\d{2}$/ } },
        { projection: { status: 1, issueDate: 1, lines: 1, discount: 1 } },
      ).toArray(),
      products.aggregate<{ _id: string; count: number }>([
        { $match: { archived: false } },
        { $group: { _id: "$categoryId", count: { $sum: 1 } } },
      ]).toArray(),
      categories.find({}).toArray(),
      quotes.find(fullMatch, { projection }).toArray() as unknown as Promise<QuoteCalcDoc[]>,
      // Raw (client) for every quote company-wide — used only to classify each client in the
      // filtered set as new-vs-repeat (see `totalQuoteCountByClient` below). Was a `$group` count
      // aggregate; now a raw fetch (2026-07-22, Rewrite double-counting fix) so a rewrite chain can
      // be deduped to one entry before counting — otherwise a client whose only real quotation had
      // been rewritten twice would show 3 "quotes" and be misclassified as a repeat customer.
      quotes.find({}, { projection: { client: 1 } }).toArray() as unknown as Promise<Array<{ _id: string; client?: string }>>,
      // Follow-ups respect the full date-range + salesperson/department filter, same as every other
      // widget — a follow-up tied to a quote issued outside the selected reporting window is excluded,
      // consistent with "the date filter must affect every widget" (see MODULES/Dashboard.md).
      quotes.find(
        fullMatch,
        { projection: { status: 1, client: 1, salesperson: 1, followUpDate: 1, lines: 1, discount: 1 } },
      ).toArray(),
      // Deliberately company-wide only (no salesperson filter) — the forecast's weighting baseline is a
      // trailing-12-month win rate meant to be a stable, low-noise reference; narrowing it to one
      // salesperson's own (much smaller) win/loss sample would make the forecast noisier, not more accurate.
      // **No `status` filter at the Mongo level anymore** (2026-07-22, same Rewrite fix as above) —
      // every status in the window must be fetched so a chain's latest revision can be resolved
      // before counting it as Won/Lost; the status filter moves to JS, after dedup.
      quotes.find(
        { issueDate: { $gte: lastNMonthKeys(MONTHS_BACK, trendAnchor)[0] } },
        { projection: { status: 1, issueDate: 1 } },
      ).toArray(),
      // Same fix as the two above — was `$group`-ed by {month, status} in Mongo; now a raw fetch so
      // `dedupeQuotesByRevisionChain()` can run first, then the month+status grouping happens in JS.
      quotes.find(
        { ...salespersonOnlyMatch, issueDate: { $regex: /^\d{4}-\d{2}-\d{2}$/ } },
        { projection: { status: 1, issueDate: 1 } },
      ).toArray(),
      jobTypes.find({ isActive: true }, { projection: { code: 1, name: 1 } }).toArray(),
    ]);

    // MongoDB enforces no schema — a doc predating a field (legacy/seed data) or written outside
    // this app's own API could have `client`/`salesperson` missing entirely, and `.trim()`ing
    // `undefined` throughout this file would 500 the whole dashboard for every user over one bad
    // document. Normalize once here rather than defensively guarding every call site below.
    // `amount` here is the before-VAT figure, computed from `lines`/`discount` via
    // `computeQuoteAmountBeforeVat()` (see the file-level comment above) — every money metric below
    // (KPIs, pipeline, salesPerformance, customerAnalytics, jobTypeAnalytics, forecast,
    // approvalDashboard's pendingList) derives from `docs`, so converting once here instead of at
    // each individual `.reduce()`/`.filter()` call site is both simpler and impossible for any one
    // of them to accidentally miss.
    //
    // **2026-07-22, Rewrite double-counting fix**: also collapsed to one entry per revision chain
    // here, via `dedupeQuotesByRevisionChain()` — a "Rewrite/แก้ไข" (`handleRewrite()` in
    // api/handlers/quotes.ts) creates a brand-new quote document per revision (`{root}-R{n}`), so
    // without this every KPI/pipeline/salesPerformance/customerAnalytics/jobTypeAnalytics/forecast
    // widget below counted a rewritten quotation once per revision instead of once. Every one of
    // those widgets derives from `docs`, so deduping here — once — fixes all of them at once,
    // consistently, using each chain's LATEST revision (never the superseded original, never a sum
    // across revisions), per explicit 2026-07-22 business decision.
    const docs = dedupeQuotesByRevisionChain(
      (docsRaw as QuoteCalcDoc[]).map((q) => ({ ...q, client: q.client ?? "", salesperson: q.salesperson ?? "", amount: computeQuoteAmountBeforeVat(q.lines ?? [], q.discount ?? 0) })),
    );

    // Data-quality telemetry (2026-07-14, Codex review Medium finding): a doc with `lines` entirely
    // *absent* (not just an empty array — a genuinely new Draft with no items yet legitimately has
    // `lines: []` and is not a data-quality issue) computes to a `$0` pre-tax value above, same as a
    // real zero-value quote — silently, since crashing or falling back to the VAT-included `amount`
    // are both worse (see the file-level comment above). Every quote has carried a real `lines`
    // array since the 2026-07-08 rewrite, so this should never fire in practice — but "should never"
    // isn't "cannot," and a prior draft of this documentation over-claimed the latter (Codex review
    // flagged it). A `console.warn` here is grep-able in Vercel function logs without adding a new
    // response field/UI surface for what is expected to be a null set. See MODULES/Dashboard.md
    // "Pre-Tax Amount Rule" for the full data-quality note.
    const missingLinesCount = (docsRaw as QuoteCalcDoc[]).filter((q) => q.lines == null).length;
    if (missingLinesCount > 0) {
      console.warn(`[dashboard] ${missingLinesCount} quote(s) in the filtered set have no "lines" field at all (not just empty) — reporting $0 pre-tax value for each instead of crashing or using the VAT-included amount. See docs/MODULES/Dashboard.md "Pre-Tax Amount Rule."`);
    }

    // ── KPIs ──────────────────────────────────────────────────────────────
    const totalQuotations = docs.length;
    const totalQuotationValue = docs.reduce((s, q) => s + q.amount, 0);
    const wonDocs = docs.filter((q) => q.status === WON_STATUS);
    const lostDocs = docs.filter((q) => q.status === LOST_STATUS);
    const wonDeals = wonDocs.length;
    const lostDeals = lostDocs.length;
    const closedSales = wonDocs.reduce((s, q) => s + q.amount, 0);
    // Expected Sales — literally "sum of quotations where Potential Opportunity = true," per the
    // documented business rule, with no additional status filtering. An earlier version excluded
    // TERMINAL_STATUSES, which both deviated from the literal rule and (since Customer Rejected
    // wasn't in that set) still let already-rejected quotes count — flagged by the 2026-07-10
    // Codex review. A quote marked Won/Lost while still flagged `isPotentialOpportunity` will
    // therefore also count here in addition to Closed Sales/etc. — an intentional, literal reading
    // of the spec, not an oversight; see MODULES/Dashboard.md.
    // **Strict `=== true`, not truthy** (2026-07-14, Codex-review Medium fix) — the server's own
    // write path always validates/coerces this to a real boolean (`sanitizeBoolean()` in
    // quoteValidation.ts), but MongoDB itself enforces no schema, so a legacy/externally-imported
    // document with a stray truthy non-boolean (e.g. the string `"false"`, which is truthy in JS)
    // would otherwise be silently counted as a potential opportunity.
    const expectedSales = docs
      .filter((q) => q.isPotentialOpportunity === true)
      .reduce((s, q) => s + q.amount, 0);
    const averageDealSize = wonDeals > 0 ? closedSales / wonDeals : 0;
    const winRate = wonDeals + lostDeals > 0 ? (wonDeals / (wonDeals + lostDeals)) * 100 : 0;
    const loseRate = wonDeals + lostDeals > 0 ? (lostDeals / (wonDeals + lostDeals)) * 100 : 0;
    const conversionRate = totalQuotations > 0 ? (wonDeals / totalQuotations) * 100 : 0;
    const approvalDurations = docs.map(approvalDurationDays).filter((v): v is number => v !== null);
    const closingDurations = docs.map(closingDurationDays).filter((v): v is number => v !== null);
    const averageApprovalTime = avg(approvalDurations);
    const averageClosingTime = avg(closingDurations);
    // Active Jobs: still genuinely in play — draft/pending/approved/sent/accepted *and not past its
    // own expiry date*. An expired-but-unclosed quote isn't really "active" anymore even though its
    // status hasn't changed, so it's carved out here and counted under Non-Active Jobs instead.
    const isExpired = (q: QuoteCalcDoc) => !CLOSED_STATUSES.has(q.status) && !!q.expiryDate && q.expiryDate < today;
    const activeDocs = docs.filter((q) => !CLOSED_STATUSES.has(q.status) && !isExpired(q));
    const activeQuotations = activeDocs.length;
    const expiredQuotations = docs.filter(isExpired).length;
    // Non-Active Jobs: cancelled, rejected, or expired-without-closing — Won and Lost each have
    // their own row (see NON_ACTIVE_OUTCOME_STATUSES above for why Lost isn't folded in here too),
    // and still-active-and-unexpired quotes don't belong here either. Exhaustive check: every
    // QuoteStatus is exactly one of {the 5 Active-eligible statuses, Won, Lost, Customer Rejected,
    // Cancelled} — Active claims the 5 minus any that are expired, Won/Lost claim their own status,
    // and this line claims Customer Rejected + Cancelled + the expired remainder — so Won + Lost +
    // Active + Non-Active always sums to exactly `docs.length`, a true partition, not an overlap.
    const nonActiveDocs = docs.filter((q) => NON_ACTIVE_OUTCOME_STATUSES.has(q.status) || isExpired(q));
    const nonActiveQuotations = nonActiveDocs.length;
    // Value sums for the Quotation Status Summary panel — deliberately reuse the *exact* same
    // `activeDocs`/`nonActiveDocs`/`lostDocs` predicates as the counts above (2026-07-13, fixing a
    // Codex-flagged population mismatch: the panel used to derive its value column by summing
    // `pipeline` per-stage totals grouped by raw status, which doesn't carve out expired-but-
    // unclosed quotes the way the KPI counts do — so a row could show an Active *count* that
    // excludes expired quotes next to an Active *value* that still includes them). Won's value is
    // `closedSales` (already computed above, same predicate as `wonDeals`) — no separate field.
    const lostValue = lostDocs.reduce((s, q) => s + q.amount, 0);
    const activeQuotationsValue = activeDocs.reduce((s, q) => s + q.amount, 0);
    const nonActiveQuotationsValue = nonActiveDocs.reduce((s, q) => s + q.amount, 0);
    const pendingApprovals = docs.filter((q) => q.status === PENDING_APPROVAL_STATUS).length;
    // overdueFollowups is derived from `followUps.overdue` below (not recomputed from `docs`) — the KPI
    // card and the Follow-Up Reminders panel share the exact same filtered follow-up set so they can
    // never disagree.

    // Customer Interest breakdown — moved server-side and computed from the filtered `docs` set
    // (2026-07-10 Codex review: `DashboardPage.tsx` previously computed this from the app-wide,
    // entirely unfiltered `quotes` prop, silently ignoring every Dashboard filter).
    const interestBreakdown = {
      interested: docs.filter((q) => q.interest === "น่าสนใจ").length,
      notInterested: docs.filter((q) => q.interest === "ไม่น่าสนใจ").length,
      notEvaluated: docs.filter((q) => q.interest !== "น่าสนใจ" && q.interest !== "ไม่น่าสนใจ").length,
    };

    // Deduped by revision chain before grouping by client (2026-07-22, Rewrite double-counting
    // fix) — otherwise a client whose one real quotation had been rewritten twice would show 3
    // "quotes" here and be misclassified as a repeat customer below.
    const totalQuoteCountByClient = new Map<string, number>();
    for (const d of dedupeQuotesByRevisionChain(allClientDocsRaw as Array<{ _id: string; client?: string }>)) {
      const client = d.client ?? "";
      totalQuoteCountByClient.set(client, (totalQuoteCountByClient.get(client) ?? 0) + 1);
    }
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
      const totalValue = mine.reduce((s, q) => s + q.amount, 0);
      // Same literal `isPotentialOpportunity === true`-only predicate as the Expected Sales KPI —
      // see the comment there. Kept as one shared rule rather than a per-widget variant.
      const expectedRevenue = mine
        .filter((q) => q.isPotentialOpportunity === true)
        .reduce((s, q) => s + q.amount, 0);
      const closingDays = mine.map(closingDurationDays).filter((v): v is number => v !== null);
      return {
        salesperson,
        quotationCount: mine.length,
        won: mineWon.length,
        lost: mineLost.length,
        pending: mine.filter((q) => q.status === PENDING_APPROVAL_STATUS).length,
        revenue,
        totalValue,
        expectedRevenue,
        conversionRate: mine.length > 0 ? Math.round((mineWon.length / mine.length) * 1000) / 10 : 0,
        avgClosingTime: avg(closingDays),
        avgDealSize: mineWon.length > 0 ? revenue / mineWon.length : 0,
      };
    }).sort((a, b) => b.revenue - a.revenue);

    // ── Customer analytics ───────────────────────────────────────────────
    // `revenue` here means Won Value specifically (kept for backward-compat with existing consumers);
    // `totalValue` is the full quotation value regardless of outcome — the Dashboard spec requires
    // both as distinct Top Customers columns, not just the won subset.
    const customerStats = [...clientsInFilteredSet].map((client) => {
      const mine = docs.filter((q) => q.client === client);
      const mineWon = mine.filter((q) => q.status === WON_STATUS);
      const lastQuotationDate = mine.reduce((max, q) => (q.issueDate > max ? q.issueDate : max), "");
      return {
        client,
        revenue: mineWon.reduce((s, q) => s + q.amount, 0),
        totalValue: mine.reduce((s, q) => s + q.amount, 0),
        quotationCount: mine.length,
        wonCount: mineWon.length,
        lastQuotationDate,
      };
    });
    const customerAnalytics = {
      topByRevenue: [...customerStats].sort((a, b) => b.revenue - a.revenue).slice(0, TOP_N),
      topByQuotationCount: [...customerStats].sort((a, b) => b.quotationCount - a.quotationCount).slice(0, TOP_N),
      topByWonCount: [...customerStats].sort((a, b) => b.wonCount - a.wonCount).slice(0, TOP_N),
      // "Repeat quotations" ranking per the spec's Top Customers section — customers with more than
      // one quotation in the filtered set, ranked by how many.
      topByRepeat: [...customerStats].filter((c) => c.quotationCount > 1).sort((a, b) => b.quotationCount - a.quotationCount).slice(0, TOP_N),
      repeatCustomerPercentage: newCustomers + repeatCustomers > 0 ? Math.round((repeatCustomers / (newCustomers + repeatCustomers)) * 1000) / 10 : 0,
    };

    // ── Job type analytics ───────────────────────────────────────────────
    // Zero-filled against the full active job-type master list (not just codes present in the
    // filtered doc set) so a job type with no quotes this period still shows as a real zero row
    // instead of silently disappearing from the chart/table. Any code on a real quote that isn't in
    // the (active-only) master list — e.g. a since-deactivated job type, or legacy unclassified data
    // — is still appended so historical quotes are never dropped from the analytics.
    const masterJobTypeCodes = new Set(activeJobTypes.map((j) => j.code));
    const extraJobTypeCodes = [...new Set(docs.filter((q) => q.jobTypeCode && !masterJobTypeCodes.has(q.jobTypeCode)).map((q) => q.jobTypeCode))];
    const jobTypeEntries = [...activeJobTypes.map((j) => ({ code: j.code, name: j.name })), ...extraJobTypeCodes.map((code) => ({ code, name: code }))];
    const jobTypeAnalytics = jobTypeEntries.map(({ code: jobTypeCode, name: masterName }) => {
      const mine = docs.filter((q) => q.jobTypeCode === jobTypeCode);
      const mineWon = mine.filter((q) => q.status === WON_STATUS);
      const revenue = mineWon.reduce((s, q) => s + q.amount, 0);
      return {
        jobTypeCode,
        jobTypeName: mine[0]?.jobTypeName ?? masterName,
        revenue,
        totalValue: mine.reduce((s, q) => s + q.amount, 0),
        count: mine.length,
        won: mineWon.length,
        winRate: mine.length > 0 ? Math.round((mineWon.length / mine.length) * 1000) / 10 : 0,
        avgDealSize: mineWon.length > 0 ? revenue / mineWon.length : 0,
      };
    }).sort((a, b) => b.revenue - a.revenue);

    // ── Forecast — live weighted estimate, not stored ────────────────────
    // Deduped by revision chain (2026-07-22, Rewrite double-counting fix) before counting Won/Lost —
    // a chain's outcome is whatever its LATEST revision's status is, not every revision's status
    // summed (e.g. a Won original superseded by a still-open rewrite must no longer count as Won).
    const historicalOutcomeDocs = dedupeQuotesByRevisionChain(historicalOutcomeDocsRaw as Array<{ _id: string; status: string; issueDate: string }>);
    const wonLast12 = historicalOutcomeDocs.filter((d) => d.status === WON_STATUS).length;
    const lostLast12 = historicalOutcomeDocs.filter((d) => d.status === LOST_STATUS).length;
    const historicalWinRate = wonLast12 + lostLast12 > 0 ? wonLast12 / (wonLast12 + lostLast12) : 0;
    // Forecast is a genuinely different concept from the Expected Sales KPI (which is intentionally
    // status-agnostic, see above) — this projects revenue from opportunities that could *still*
    // close, so an already-closed-out quote (Won/Lost/Cancelled/Customer Rejected) never belongs
    // here regardless of its `isPotentialOpportunity` flag.
    const openOpportunities = docs.filter((q) => q.isPotentialOpportunity === true && !CLOSED_STATUSES.has(q.status) && q.expiryDate);
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
    // Deduped by revision chain (2026-07-22, Rewrite double-counting fix) — otherwise a rewritten
    // quotation with a follow-up date could surface as two separate reminders (one per revision)
    // instead of one, using whichever revision is actually current.
    const followUpDocs = dedupeQuotesByRevisionChain(followUpDocsRaw as Array<Pick<QuoteFields, "status" | "client" | "salesperson" | "followUpDate" | "lines" | "discount"> & { _id: string }>)
      .filter((q) => q.followUpDate && !TERMINAL_STATUSES.has(q.status));
    const toFollowUpSummary = (q: (typeof followUpDocs)[number]) => ({
      id: q._id, client: q.client, salesperson: q.salesperson, followUpDate: q.followUpDate, amount: computeQuoteAmountBeforeVat(q.lines ?? [], q.discount ?? 0),
    });
    const followUps = {
      today: followUpDocs.filter((q) => q.followUpDate === today).map(toFollowUpSummary),
      overdue: followUpDocs.filter((q) => q.followUpDate < today).map(toFollowUpSummary),
      upcoming: followUpDocs.filter((q) => q.followUpDate > today).map(toFollowUpSummary),
    };

    // ── Activity timeline — only for callers who can already see the audit log ──
    // Respects the date-range + salesperson/department filter (added 2026-07-10, second review
    // pass — the 2026-07-10 Codex review flagged this as ignoring every Dashboard filter). Matched
    // against `userName` — the actor's identity — using the same free-text-join convention as
    // `Quote.salesperson`/`User.department` elsewhere in this file (see the caveat comment above).
    // Not every audit entry is a quote-related action (RBAC/user-management events also land here),
    // so a salesperson/department filter does legitimately narrow this to "things that person did,"
    // not just "their quotes" — a reasonable, consistent interpretation of "activity" filtering.
    // 2026-07-14, Codex review High Priority fix: this query previously ran inside the same failure
    // domain as the rest of the response — a rejected auditLog read here (e.g. a transient index/
    // connection issue) took down KPIs, pipeline, and every other section along with it. Isolated so
    // a failure here degrades to "section hidden" (activityTimeline stays null, same as a caller who
    // lacks auditLog:view — the frontend already treats both identically) instead of blanking the
    // whole dashboard. See docs/CODEX_REVIEW_REPORT.md "Claude Fix Status."
    let activityTimeline: ReturnType<typeof withStringId>[] | null = null;
    if (roleHasPermission(ctx.role, "auditLog:view")) {
      try {
        const auditMatch: Record<string, unknown> = {};
        if (from || to) auditMatch.createdAt = bangkokDayBoundsUtc(from, to);
        if (salespersonFilter && salespersonFilter !== "all") auditMatch.userName = salespersonFilter;
        if (salespeopleInDepartment) {
          const deptCond = { userName: { $in: [...salespeopleInDepartment] } };
          if (auditMatch.userName) {
            auditMatch.$and = [{ userName: auditMatch.userName }, deptCond];
            delete auditMatch.userName;
          } else {
            Object.assign(auditMatch, deptCond);
          }
        }
        const entries = await auditLog.find(auditMatch).sort({ createdAt: -1 }).limit(ACTIVITY_LIMIT).toArray();
        activityTimeline = entries.map(withStringId);
      } catch (err) {
        console.error("[dashboard] activityTimeline query failed", err);
        activityTimeline = null;
      }
    }

    // ── Sales activity analytics — 5 quotation event categories, week/month/quarter/year ──
    // **Gated only by `dashboard:view`** (the whole route's own permission), NOT `auditLog:view` —
    // fixed 2026-07-14 per an independent Codex review's Critical finding: this is the business-
    // required "Sales Activity Analytics" section (P'Keng/P'Kee spec), and every default role with
    // `dashboard:view` (Sales User, Approver 1/2, Viewer — see src/lib/roles.ts) previously saw
    // this required section silently vanish because none of them hold `auditLog:view`. The
    // aggregate counts here (created/edited/status-changed/etc. per period) are a coarse rollup,
    // not the raw audit-log rows themselves — `activityTimeline` below (the actual "Recent Activity
    // Details" audit-log feed, with full entry detail text) correctly stays `auditLog:view`-gated;
    // only this aggregate section's gate was wrong.
    //
    // Respects the date-range filter's `from`/`to` as of 2026-07-14 (same Codex review's High
    // Priority finding — this used to be an unconditional full-history scan regardless of the
    // selected date range, so e.g. picking "Today" still showed a full rolling 12-week trend built
    // from all-time data). Bounded the same way `activityTimeline` already was, via
    // `bangkokDayBoundsUtc(from, to)` on `createdAt`. The window-length/zero-fill logic below
    // (last 12 weeks/12 months/8 quarters/5 years ending at `trendAnchor`) is unchanged — periods
    // outside the selected `from`/`to` now correctly zero-fill for real, instead of the caption
    // merely claiming they're excluded while the query silently still counted them. The frontend's
    // caption (`SalesActivityAnalytics.tsx`) reflects whether a date filter is actually applied.
    //
    // 5 categories, not just Created/Edited (2026-07-13 review): every quote-workflow
    // audit action `writeQuoteAuditEntry()` (api/handlers/quotes.ts) can write is bucketed —
    // "Quotation Submitted"/"Quotation Approved" map to their own named categories (Approval
    // Requested/Completed) since those are workflow milestones distinct from a content edit;
    // "Quotation Rejected" and the generic "Status Changed" (every other workflow transition —
    // Sent to Customer, Customer Accepted/Rejected, Won, Lost, Cancelled) both bucket into
    // `statusChanged` since they're all "the quote's status field changed," not a content edit.
    const ACTIVITY_ACTIONS = [
      "Quotation Created", "Quotation Updated",
      "Quotation Submitted", "Quotation Approved", "Quotation Rejected", "Status Changed",
    ] as const;
    type ActivityCategory = "created" | "edited" | "statusChanged" | "approvalRequested" | "approvalCompleted";
    const categoryForAction = (action: string): ActivityCategory => {
      if (action === "Quotation Created") return "created";
      if (action === "Quotation Updated") return "edited";
      if (action === "Quotation Submitted") return "approvalRequested";
      if (action === "Quotation Approved") return "approvalCompleted";
      return "statusChanged"; // "Quotation Rejected" + the generic "Status Changed"
    };
    const zeroActivity = (): Record<ActivityCategory, number> =>
      ({ created: 0, edited: 0, statusChanged: 0, approvalRequested: 0, approvalCompleted: 0 });
    type BySalespersonRow = { period: string; salesperson: string; created: number; edited: number };
    const activityMatch: Record<string, unknown> = { action: { $in: [...ACTIVITY_ACTIONS] } };
    if (from || to) activityMatch.createdAt = bangkokDayBoundsUtc(from, to);
    // Own-data-only callers see only their own sales activity — audit entries are keyed by
    // `userName` (fullName), not user id, so this joins on the same name convention the
    // salesperson filter itself uses. Forced regardless of the salesperson/department filter
    // (which the UI hides for these callers anyway).
    if (ownDataOnly) activityMatch.userName = ctx.user.fullName;
    else if (salespersonFilter && salespersonFilter !== "all") activityMatch.userName = salespersonFilter;
    if (salespeopleInDepartment) {
      const deptCond = { userName: { $in: [...salespeopleInDepartment] } };
      if (activityMatch.userName) {
        activityMatch.$and = [{ userName: activityMatch.userName }, deptCond];
        delete activityMatch.userName;
      } else {
        Object.assign(activityMatch, deptCond);
      }
    }
    // Non-nullable in intent — every `dashboard:view` caller gets this now (see comment above) —
    // but kept a real `| null` and wrapped in try/catch (2026-07-14, Codex review High Priority
    // fix): a rejected auditLog query here previously took the entire dashboard response down with
    // it. On failure this section degrades to hidden (frontend already guards with `salesActivity
    // &&`), same as `activityTimeline` above, instead of blanking KPIs/pipeline/every other section.
    type SalesActivityResult = {
      weekly: ({ period: string } & Record<ActivityCategory, number>)[];
      monthly: ({ period: string } & Record<ActivityCategory, number>)[];
      quarterly: ({ period: string } & Record<ActivityCategory, number>)[];
      yearly: ({ period: string } & Record<ActivityCategory, number>)[];
      // Per-salesperson breakdown (2026-07-13, P'Keng/P'Kee business requirement) — deliberately
      // just Created/Edited (the 2 activity types the requirement names), not all 5 categories the
      // chart above tracks. Only non-zero rows are included (a salesperson with zero activity in a
      // given period doesn't get a row) — zero-filling this would be a combinatorial explosion of
      // empty rows across every period × every salesperson who ever appears in the audit log.
      bySalesperson: {
        weekly: BySalespersonRow[]; monthly: BySalespersonRow[]; quarterly: BySalespersonRow[]; yearly: BySalespersonRow[];
      };
    };
    let salesActivity: SalesActivityResult | null;
    try {
      const activityDocs = await auditLog.find(activityMatch, { projection: { action: 1, createdAt: 1, userName: 1 } }).toArray();
      const bucket = <T extends string>(keyFn: (d: Date) => T) => {
        const map = new Map<T, Record<ActivityCategory, number>>();
        for (const d of activityDocs) {
          const key = keyFn(new Date(d.createdAt));
          const entry = map.get(key) ?? zeroActivity();
          entry[categoryForAction(d.action)] += 1;
          map.set(key, entry);
        }
        return map;
      };
      const bucketBySalesperson = <T extends string>(keyFn: (d: Date) => T) => {
        // Keyed by (period, salesperson) via a nested Map, not a joined/split string - Thai full
        // names routinely contain a space (e.g. "somchai thanakon"), which would silently corrupt
        // a naive period-space-salesperson-then-split round trip.
        const map = new Map<string, Map<string, { created: number; edited: number }>>();
        for (const d of activityDocs) {
          const category = categoryForAction(d.action);
          if (category !== "created" && category !== "edited") continue;
          const period: string = keyFn(new Date(d.createdAt));
          const salesperson = d.userName || "-";
          const byPerson = map.get(period) ?? new Map<string, { created: number; edited: number }>();
          const entry = byPerson.get(salesperson) ?? { created: 0, edited: 0 };
          entry[category] += 1;
          byPerson.set(salesperson, entry);
          map.set(period, byPerson);
        }
        return [...map.entries()]
          .flatMap(([period, byPerson]) => [...byPerson.entries()].map(([salesperson, counts]) => ({ period, salesperson, ...counts })))
          .sort((a, b) => (a.period === b.period ? (b.created + b.edited) - (a.created + a.edited) : b.period.localeCompare(a.period)));
      };
      const weekMap = bucket((d) => isoWeekKey(d) as string);
      const monthMap = bucket((d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
      const quarterMap = bucket((d) => quarterKey(d.getUTCFullYear(), d.getUTCMonth()));
      const yearMap = bucket((d) => String(d.getUTCFullYear()));
      const zeroFill = <T extends string>(keys: T[], map: Map<T, Record<ActivityCategory, number>>) =>
        keys.map((period) => ({ period, ...(map.get(period) ?? zeroActivity()) }));
      const weekKeys = new Set(lastNWeekKeys(12, trendAnchor));
      const monthKeys = new Set(lastNMonthKeys(MONTHS_BACK, trendAnchor));
      const quarterKeys = new Set(lastNQuarterKeys(8, trendAnchor));
      const yearKeys = new Set(lastNYearKeys(5, trendAnchor));
      salesActivity = {
        weekly: zeroFill(lastNWeekKeys(12, trendAnchor), weekMap),
        monthly: zeroFill(lastNMonthKeys(MONTHS_BACK, trendAnchor), monthMap),
        quarterly: zeroFill(lastNQuarterKeys(8, trendAnchor), quarterMap),
        yearly: zeroFill(lastNYearKeys(5, trendAnchor), yearMap),
        bySalesperson: {
          weekly: bucketBySalesperson((d) => isoWeekKey(d) as string).filter((r) => weekKeys.has(r.period)),
          monthly: bucketBySalesperson((d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`).filter((r) => monthKeys.has(r.period)),
          quarterly: bucketBySalesperson((d) => quarterKey(d.getUTCFullYear(), d.getUTCMonth())).filter((r) => quarterKeys.has(r.period)),
          yearly: bucketBySalesperson((d) => String(d.getUTCFullYear())).filter((r) => yearKeys.has(r.period)),
        },
      };
    } catch (err) {
      console.error("[dashboard] salesActivity query failed", err);
      salesActivity = null;
    }

    // ── Approval dashboard — only for callers who can already approve quotations ──
    // The detailed, actionable pending-approvals list (with id/client/amount/salesperson/submitted
    // date, plus Approve/Reject affordance) is gated the same way — Approve/Reject buttons render
    // only for `quotations:approve`/`quotations:reject`, but the whole list requires `:approve` to be
    // visible at all, matching how every other permission-gated Dashboard section already behaves.
    let approvalDashboard: {
      pendingApprovals: number; approvedToday: number; rejectedToday: number; averageApprovalTime: number | null;
      canReject: boolean;
      pendingList: { id: string; client: string; salesperson: string; amount: number; submittedDate: string | null; status: string }[];
    } | null = null;
    // In-memory over the already-fetched `docs` (no further I/O), so failure here is unlikely — but
    // wrapped anyway (2026-07-14, Codex review High Priority fix) for the same reason as the two
    // sections above: this section is genuinely optional (permission-gated, already null for most
    // roles) and must not be able to take KPIs/pipeline/every other section down with it.
    if (roleHasPermission(ctx.role, "quotations:approve")) {
      try {
        const approvedToday = docs.filter((q) => lastEntry(q.approvalHistory, "approved")?.createdAt.startsWith(today)).length;
        const rejectedToday = docs.filter((q) => lastEntry(q.approvalHistory, "rejected")?.createdAt.startsWith(today)).length;
        const pendingDocs = docs.filter((q) => q.status === PENDING_APPROVAL_STATUS);
        approvalDashboard = {
          pendingApprovals: pendingDocs.length,
          approvedToday, rejectedToday, averageApprovalTime,
          canReject: roleHasPermission(ctx.role, "quotations:reject"),
          pendingList: pendingDocs
            .map((q) => ({
              id: q._id, client: q.client, salesperson: q.salesperson, amount: q.amount,
              submittedDate: firstEntry(q.approvalHistory, "submitted")?.createdAt ?? null,
              status: q.status,
            }))
            .sort((a, b) => (a.submittedDate ?? "").localeCompare(b.submittedDate ?? "")),
        };
      } catch (err) {
        console.error("[dashboard] approvalDashboard computation failed", err);
        approvalDashboard = null;
      }
    }

    // ── Scope of Work summary — only for callers who can already see Scope of Work ──
    // Company-wide, all-time count (isDeleted: false, same predicate `fetchAllScopeOfWorks()` uses)
    // — deliberately unfiltered by the date-range/salesperson/department filter, same conclusion as
    // Total Customers/Products above: a Scope of Work document doesn't carry its own issueDate/
    // salesperson (it inherits a quotation's), so joining it back to the filtered quote set just to
    // honor the filter isn't worth the extra query for what's meant to be a simple "how many SOW
    // documents exist" count.
    // Own-data-only counterpart for the two document-count cards below: without the module's own
    // `viewAll`, the counts cover exactly the records the caller's standalone list page would show
    // them — same predicates as `handleList` in scopeOfWorkHandler.ts / deliveryOrderHandler.ts
    // (own `createdBy`, ownerless legacy records, and — for Scope of Work only — records naming
    // the caller as a document recipient).
    const scopeRecipientMatch = DOCUMENT_RECIPIENT_DEPARTMENTS.map((d) => ({ [`documentRecipients.${d.key}`]: ctx.user.id }));
    const ownScopeClause = roleHasPermission(ctx.role, "scopeOfWork:viewAll")
      ? {}
      : { $or: [{ createdBy: ctx.user.id }, { createdBy: "" }, ...scopeRecipientMatch] };
    let scopeOfWork: { total: number; draft: number; final: number } | null = null;
    if (roleHasPermission(ctx.role, "scopeOfWork:view")) {
      try {
        const scopeOfWorks = await scopeOfWorksCollection();
        const [total, draft, final] = await Promise.all([
          scopeOfWorks.countDocuments({ isDeleted: false, ...ownScopeClause }),
          scopeOfWorks.countDocuments({ isDeleted: false, status: "Draft", ...ownScopeClause }),
          scopeOfWorks.countDocuments({ isDeleted: false, status: "Final", ...ownScopeClause }),
        ]);
        scopeOfWork = { total, draft, final };
      } catch (err) {
        console.error("[dashboard] scopeOfWork query failed", err);
        scopeOfWork = null;
      }
    }

    // ── Delivery Order summary — same shape/rules as the Scope of Work summary above (2026-07-24,
    // direct user request to bring the newer modules' data onto the Dashboard). Company-wide,
    // all-time, deliberately unfiltered for the same reason: a Delivery Order inherits its
    // quotation context via the Scope of Work, so it has no salesperson/issue-date of its own to
    // filter by. ──
    const ownDeliveryClause = roleHasPermission(ctx.role, "deliveryOrder:viewAll")
      ? {}
      : { $or: [{ createdBy: ctx.user.id }, { createdBy: "" }] };
    let deliveryOrder: { total: number; draft: number; final: number } | null = null;
    if (roleHasPermission(ctx.role, "deliveryOrder:view")) {
      try {
        const deliveryOrders = await deliveryOrdersCollection();
        const [total, draft, final] = await Promise.all([
          deliveryOrders.countDocuments({ isDeleted: false, ...ownDeliveryClause }),
          deliveryOrders.countDocuments({ isDeleted: false, status: "Draft", ...ownDeliveryClause }),
          deliveryOrders.countDocuments({ isDeleted: false, status: "Final", ...ownDeliveryClause }),
        ]);
        deliveryOrder = { total, draft, final };
      } catch (err) {
        console.error("[dashboard] deliveryOrder query failed", err);
        deliveryOrder = null;
      }
    }

    // ── Notification summary — per-caller, same scoping as GET /api/notifications ──
    // Deliberately unfiltered by date-range/salesperson/department, same conclusion as Total
    // Customers/Products above: this is a personal, always-current operational widget ("my own
    // unread notifications right now"), not a business report — filtering someone's own live inbox
    // by a sales reporting date range doesn't correspond to anything the widget actually shows.
    // Flagged by the 2026-07-10 Codex review; documented explicitly rather than silently unfiltered.
    // Also parallelized with the two independent queries below it (previously three sequential
    // awaits in a row, none of which depend on each other or on anything computed above).
    // Isolated (2026-07-14, Codex review High Priority fix): a personal unread-count widget and a
    // filter-dropdown source list, neither of which is business data the rest of the response
    // depends on — a failure here degrades to "0 unread"/"no extra salesperson options" instead of
    // taking KPIs/pipeline/every other section down with it.
    let notificationSummary = { unreadCount: 0, byType: {} as Record<string, number> };
    let availableSalespeople: string[] = [];
    try {
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
      notificationSummary = { unreadCount: myNotifications.length, byType: notificationsByType };
      availableSalespeople = availableSalespeopleRaw.filter((s): s is string => !!s && s.trim() !== "").sort();
    } catch (err) {
      console.error("[dashboard] notificationSummary/availableSalespeople query failed", err);
    }

    // ── Monthly closing rate — win rate per calendar month, trailing 12 months ──
    // Deduped by revision chain (2026-07-22, Rewrite double-counting fix) before grouping by
    // month+status — same reasoning as the forecast's win rate above.
    const monthlyOutcomeMap = new Map<string, { won: number; lost: number }>();
    for (const d of dedupeQuotesByRevisionChain(monthlyOutcomeDocsRaw as Array<{ _id: string; status: string; issueDate: string }>)) {
      if (d.status !== WON_STATUS && d.status !== LOST_STATUS) continue;
      const month = d.issueDate.slice(0, 7);
      const entry = monthlyOutcomeMap.get(month) ?? { won: 0, lost: 0 };
      if (d.status === WON_STATUS) entry.won += 1; else entry.lost += 1;
      monthlyOutcomeMap.set(month, entry);
    }
    const monthlyClosingRate = lastNMonthKeys(MONTHS_BACK, trendAnchor).map((month) => {
      const { won, lost } = monthlyOutcomeMap.get(month) ?? { won: 0, lost: 0 };
      // null (not 0) when there were no won/lost deals that month — a real 0% win rate (deals that
      // all lost) must render as a visible flat line, not be hidden behind the chart's empty state.
      return { month, winRate: won + lost > 0 ? Math.round((won / (won + lost)) * 1000) / 10 : null };
    });

    // ── Revenue trend — weekly/monthly/quarterly/yearly, all bucketed from the same won-quote rows ──
    // Deduped by revision chain, then filtered to Won (2026-07-22, Rewrite double-counting fix) — a
    // chain only contributes revenue here if its LATEST revision is Won; a Won original superseded
    // by a still-open (or since-lost) rewrite must not count, and a chain that only became Won via
    // a later revision must count using that revision's own amount, not the original's.
    const revenueTrendDocs = dedupeQuotesByRevisionChain(revenueTrendDocsRaw as Array<{ _id: string; status: string; issueDate: string; lines: QuoteFields["lines"]; discount: number }>)
      .filter((q) => q.status === WON_STATUS);
    const revenueByWeekMap = new Map<string, number>();
    const revenueByMonthMap = new Map<string, number>();
    const revenueByQuarterMap = new Map<string, number>();
    const revenueByYearMap = new Map<string, number>();
    for (const r of revenueTrendDocs) {
      const [y, m, d] = r.issueDate.split("-").map(Number);
      const date = new Date(Date.UTC(y, m - 1, d));
      const wk = isoWeekKey(date);
      const monthKey = r.issueDate.slice(0, 7);
      const qk = quarterKey(y, m - 1);
      const amt = computeQuoteAmountBeforeVat(r.lines ?? [], r.discount ?? 0);
      revenueByWeekMap.set(wk, (revenueByWeekMap.get(wk) ?? 0) + amt);
      revenueByMonthMap.set(monthKey, (revenueByMonthMap.get(monthKey) ?? 0) + amt);
      revenueByQuarterMap.set(qk, (revenueByQuarterMap.get(qk) ?? 0) + amt);
      revenueByYearMap.set(String(y), (revenueByYearMap.get(String(y)) ?? 0) + amt);
    }
    const revenueTrend = {
      weekly: lastNWeekKeys(12, trendAnchor).map((period) => ({ period, revenue: revenueByWeekMap.get(period) ?? 0 })),
      monthly: lastNMonthKeys(MONTHS_BACK, trendAnchor).map((period) => ({ period, revenue: revenueByMonthMap.get(period) ?? 0 })),
      quarterly: lastNQuarterKeys(8, trendAnchor).map((period) => ({ period, revenue: revenueByQuarterMap.get(period) ?? 0 })),
      yearly: lastNYearKeys(5, trendAnchor).map((period) => ({ period, revenue: revenueByYearMap.get(period) ?? 0 })),
    };

    // ── Legacy shape (unchanged, still needed by the existing monthly-revenue/category widgets) ──
    const revenueByMonth = revenueTrend.monthly.map(({ period, revenue }) => ({ month: period, revenue }));
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
        wonDeals, lostDeals, lostValue, averageDealSize, winRate, loseRate, conversionRate,
        averageApprovalTime, averageClosingTime, activeQuotations, activeQuotationsValue,
        expiredQuotations, nonActiveQuotations, nonActiveQuotationsValue,
        pendingApprovals,
        overdueFollowups: followUps.overdue.length,
        newCustomers, repeatCustomers,
      },
      interestBreakdown,
      revenueByMonth,
      revenueTrend,
      categoryBreakdown,
      monthlyClosingRate,
      pipeline,
      salesPerformance,
      customerAnalytics,
      jobTypeAnalytics,
      forecast,
      followUps,
      activityTimeline,
      salesActivity,
      approvalDashboard,
      scopeOfWork,
      deliveryOrder,
      ownDataOnly,
      notificationSummary,
      availableSalespeople,
      availableDepartments,
      filters: { from, to, salesperson: salespersonFilter || "all", department: departmentFilter || "all" },
    });
  });
}
