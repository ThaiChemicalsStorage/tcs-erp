import type { VercelRequest, VercelResponse } from "@vercel/node";
import { HttpError } from "./http.js";
import { requireUser, type AuthContext } from "./auth.js";
import {
  quotesCollection, customersCollection, productsCollection, categoriesCollection,
  usersCollection, rolesCollection, quotationTemplatesCollection, scopeOfWorksCollection, withStringId, type QuoteFields,
} from "./collections.js";
import { roleHasPermission } from "../../src/lib/roles.js";
import type { Permission } from "../../src/lib/permissions.js";
import { computeQuoteAmountBeforeVat } from "./quoteAmounts.js";
import { ALL_RECIPIENT_KEYS } from "../../src/lib/documentRequirements.js";

/**
 * Global Search (added 2026-07-14) — powers the top navigation search box. Entry point:
 * `api/handlers/customers.ts` dispatches `/api/search` here on the raw pathname, sharing that
 * function file rather than getting its own (Vercel Hobby's 12-function cap is fully used — see
 * docs/ARCHITECTURE.md), the same established pattern that file itself used to share with the
 * now-removed `company-profiles.ts`.
 *
 * Every category is independently RBAC-filtered server-side (`roleHasPermission()`) — a category
 * the caller lacks permission for simply comes back as an empty array, identical in shape to a
 * genuine zero-result search, so the response itself never signals "you're not allowed to see
 * this" vs. "there's nothing here." Hiding a result in the UI is never sufficient on its own; the
 * actual data never leaves the server for an unauthorized caller in the first place.
 */

const RESULT_LIMIT = 5;
const MIN_QUERY_LENGTH = 2;
/**
 * 2026-07-14, Codex review High Priority fix: this endpoint builds a case-insensitive unanchored
 * `$regex` `$or` across several fields on 4 collections per request — cheap at a couple dozen
 * characters, but with no upper bound an authenticated caller could submit an arbitrarily long
 * term and force needlessly expensive scans (a real performance/availability concern, not a
 * regex-injection one — `escapeRegExp()` already prevents that). 100 covers every legitimate
 * search term this ERP has (the longest realistic input is a full company name/address, well
 * under this), while still being short enough to bound the cost of a single request. Must stay in
 * sync with the client-side `maxLength` on the search `<input>` in `GlobalSearch.tsx` — that's
 * defense-in-depth (a native browser constraint a modified client could bypass), this is the real
 * enforcement.
 */
const MAX_QUERY_LENGTH = 100;

/**
 * `ensureIndexes()` in api/_lib/collections.ts only ever runs from the one-time Setup Wizard
 * bootstrap, permanently unreachable on an already-provisioned deployment — same gap documented
 * at `ensureQuoteAnalyticsIndexes()` in api/dashboard/index.ts, same defensive-idempotent fix here,
 * scoped once per warm serverless instance. Every index below is a plain non-unique single-field
 * index, chosen to be a safe no-op if it happens to already exist with identical options (from
 * `ensureIndexes()` actually having run, or from another ensure-function in this codebase already
 * covering the same field) — MongoDB only rejects a `createIndex()` call when the *options* differ
 * for an existing index on the same key, not when it's a harmless exact duplicate.
 *
 * Deliberately does NOT redeclare `users.email`/`username`/`employeeId` — `ensureIndexes()`
 * declares those as `unique: true`, and a plain non-unique redeclaration of the same key pattern
 * would throw `IndexOptionsConflict` if that unique index actually exists in this deployment.
 * `customersCollection()`'s `isDeleted`/`isActive`/`companyName` and `productsCollection()`'s
 * `categoryId`/`archived` are already covered by `ensureCustomerIndexes()`
 * (api/_lib/customersHandler.ts) and `ensureIndexes()` respectively — redeclared here anyway
 * where cheap/harmless, skipped where it would just be pure duplication.
 */
let searchIndexesEnsured = false;
async function ensureSearchIndexes(
  quotes: Awaited<ReturnType<typeof quotesCollection>>,
  customers: Awaited<ReturnType<typeof customersCollection>>,
  products: Awaited<ReturnType<typeof productsCollection>>,
  users: Awaited<ReturnType<typeof usersCollection>>,
  scopeOfWorks: Awaited<ReturnType<typeof scopeOfWorksCollection>>,
): Promise<void> {
  if (searchIndexesEnsured) return;
  await Promise.all([
    quotes.createIndex({ customerId: 1 }),
    quotes.createIndex({ jobTypeCode: 1 }),
    customers.createIndex({ contactName: 1 }),
    customers.createIndex({ phone: 1 }),
    customers.createIndex({ email: 1 }),
    customers.createIndex({ taxId: 1 }),
    products.createIndex({ code: 1 }),
    products.createIndex({ name: 1 }),
    products.createIndex({ categoryId: 1 }),
    products.createIndex({ archived: 1 }),
    users.createIndex({ fullName: 1 }),
    users.createIndex({ department: 1 }),
    users.createIndex({ position: 1 }),
    users.createIndex({ roleKey: 1 }),
    // Scope of Work (added 2026-07-15) — jobTypeCode/quotationId/status/isDeleted already indexed
    // by ensureIndexes() in collections.ts; this adds only the ones that's missing for search.
    scopeOfWorks.createIndex({ "customerSnapshot.companyName": 1 }),
    scopeOfWorks.createIndex({ customerPoNumber: 1 }),
  ]);
  searchIndexesEnsured = true;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Case-insensitive, unanchored (substring) match — safe against regex injection via `escapeRegExp`. */
function containsRegex(query: string): { $regex: string; $options: string } {
  return { $regex: escapeRegExp(query), $options: "i" };
}

export interface SearchQuotationResult {
  id: string;
  client: string;
  project: string;
  status: string;
  salesperson: string;
  issueDate: string;
  /** Before-VAT amount — same shared `computeQuoteAmountBeforeVat()` rule the Dashboard uses, never the VAT-included `Quote.amount`. */
  amount: number;
}

export interface SearchCustomerResult {
  id: string;
  companyName: string;
  contactName: string;
  phone: string;
  email: string;
  taxId: string;
}

export interface SearchProductResult {
  id: string;
  name: string;
  code: string;
  categoryName: string;
  unit: string;
  archived: boolean;
}

export interface SearchPageResult {
  id: string;
  titleTh: string;
  titleEn: string;
  navKey: string;
  action?: "create" | "categories";
}

export interface SearchUserResult {
  id: string;
  fullName: string;
  email: string;
  employeeId: string;
  department: string;
  position: string;
  roleName: string;
  status: string;
}

/** "Template ใบเสนอราคา" result group (added 2026-07-14) — see docs/MODULES/QuotationTemplates.md
 * "Global Search Integration." Only `templateCode`/`templateName`/`jobTypeCode`/`jobTypeName`/
 * `description` are projected — `sections`/`internalNotes` never leave the server for this
 * endpoint, so an internal review comment buried in a template can never surface in search
 * results even indirectly. */
export interface SearchTemplateResult {
  id: string;
  templateCode: string;
  templateName: string;
  jobTypeCode: string;
  jobTypeName: string;
  description: string;
}

/** "Scope of Work" result group (added 2026-07-15, Codex review High Priority fix) — see
 * docs/MODULES/ScopeOfWork.md. Searchable by exactly the 6 keys the review named: scope number,
 * quotation number, customer, Job Type, PO, and status. */
export interface SearchScopeOfWorkResult {
  id: string;
  scopeNumber: string;
  quotationId: string;
  quotationNumber: string;
  customerName: string;
  jobTypeCode: string;
  jobTypeName: string;
  status: string;
}

export interface SearchResults {
  quotations: SearchQuotationResult[];
  customers: SearchCustomerResult[];
  products: SearchProductResult[];
  templates: SearchTemplateResult[];
  scopeOfWorks: SearchScopeOfWorkResult[];
  pages: SearchPageResult[];
  users: SearchUserResult[];
}

/**
 * Static — not MongoDB-backed, this ERP's page/menu list is small, fixed, and part of the
 * application itself, not business data. `permission: null` means always accessible (Settings/
 * Profile, same as `App.tsx`'s own `activeNavAllowed` check for the "settings" nav key).
 * `navKey` values are plain strings matching `App.tsx`'s `NavKey` union — duplicated here rather
 * than imported, since `App.tsx` is a large JSX component that must never be imported into the
 * API bundle (see docs/CLAUDE.md's standing rule on `src/lib/*` value imports reaching `api/`).
 *
 * Deliberately excludes a "Notifications" page entry (present in some early requirement drafts)
 * — this app has no dedicated Notifications page, only the header bell's dropdown panel, and
 * inventing a fake nav target would violate the "no fake results" requirement. "Create
 * Quotation"/"Add Customer"/"Product Categories" reuse each page's own real permission gate
 * (`quotations:view`/`customers:create`/`products:view`) rather than an invented stricter one —
 * see docs/UI_GUIDELINES.md "Global Search" for why (Quotation/Products have no button-level
 * create permission gating today, a pre-existing documented gap, not something this feature
 * should silently paper over with a permission the actual page doesn't enforce).
 */
const SEARCHABLE_PAGES: {
  id: string; titleTh: string; titleEn: string; navKey: string;
  action?: "create" | "categories"; permission: Permission | null;
  aliases: string[];
}[] = [
  { id: "dashboard", titleTh: "แดชบอร์ด", titleEn: "Dashboard", navKey: "dashboard", permission: "dashboard:view", aliases: ["แดชบอร์ด", "dashboard", "ภาพรวม", "overview"] },
  { id: "quotations", titleTh: "ใบเสนอราคา", titleEn: "Quotations", navKey: "quotations", permission: "quotations:view", aliases: ["ใบเสนอราคา", "quotations", "quotation"] },
  { id: "quotations-create", titleTh: "สร้างใบเสนอราคา", titleEn: "Create Quotation", navKey: "quotations", action: "create", permission: "quotations:view", aliases: ["สร้างใบเสนอราคา", "create quotation", "new quotation", "สร้างใบเสนอ"] },
  { id: "customers", titleTh: "ลูกค้า", titleEn: "Customers", navKey: "customers", permission: "customers:view", aliases: ["ลูกค้า", "customers", "customer"] },
  { id: "customers-create", titleTh: "เพิ่มลูกค้า", titleEn: "Add Customer", navKey: "customers", action: "create", permission: "customers:create", aliases: ["เพิ่มลูกค้า", "add customer", "new customer", "สร้างลูกค้า"] },
  { id: "products", titleTh: "คลังสินค้า", titleEn: "Products", navKey: "products", permission: "products:view", aliases: ["คลังสินค้า", "products", "product", "สินค้า"] },
  { id: "products-categories", titleTh: "หมวดหมู่สินค้า", titleEn: "Product Categories", navKey: "products", action: "categories", permission: "products:view", aliases: ["หมวดหมู่สินค้า", "product categories", "categories", "หมวดหมู่"] },
  { id: "users", titleTh: "จัดการผู้ใช้งาน", titleEn: "User Management", navKey: "users", permission: "users:manage", aliases: ["จัดการผู้ใช้งาน", "user management", "users", "ผู้ใช้งาน"] },
  { id: "roles", titleTh: "บทบาทและสิทธิ์", titleEn: "Roles and Permissions", navKey: "roles", permission: "roles:manage", aliases: ["บทบาทและสิทธิ์", "roles and permissions", "roles", "บทบาท", "สิทธิ์"] },
  { id: "auditLog", titleTh: "บันทึกการใช้งาน", titleEn: "Audit Logs", navKey: "auditLog", permission: "auditLog:view", aliases: ["บันทึกการใช้งาน", "audit logs", "audit log", "ประวัติการใช้งาน"] },
  { id: "settings", titleTh: "โปรไฟล์", titleEn: "Profile", navKey: "settings", permission: null, aliases: ["โปรไฟล์", "profile", "settings", "การตั้งค่า"] },
];

async function searchQuotations(query: string, ctx: AuthContext): Promise<SearchQuotationResult[]> {
  const quotes = await quotesCollection();
  const rx = containsRegex(query);
  // Same own-quotes-only scoping as `GET /api/quotes` (2026-07-22, per direct user request) — a
  // caller without `quotations:viewAll` must not be able to discover another user's quotation
  // through Global Search, which would otherwise bypass the list-page restriction entirely.
  const ownershipMatch = roleHasPermission(ctx.role, "quotations:viewAll")
    ? {}
    : { $or: [{ createdByUserId: ctx.user.id }, { createdByUserId: "" }] };
  const docs = await quotes.find(
    {
      ...ownershipMatch,
      $and: [{
        $or: [
          { _id: rx }, { client: rx }, { "customerSnapshot.companyName": rx }, { contactName: rx },
          { project: rx }, { poRef: rx }, { salesperson: rx }, { jobTypeCode: rx }, { jobTypeName: rx },
          { status: rx }, { remarks: rx },
        ],
      }],
    },
    {
      projection: {
        client: 1, customerSnapshot: 1, project: 1, status: 1, salesperson: 1, issueDate: 1, lines: 1, discount: 1,
      },
      sort: { issueDate: -1 },
      limit: RESULT_LIMIT,
    },
  ).toArray() as unknown as (Pick<QuoteFields, "client" | "customerSnapshot" | "project" | "status" | "salesperson" | "issueDate" | "lines" | "discount"> & { _id: string })[];

  return docs.map((q) => ({
    id: q._id,
    client: q.customerSnapshot?.companyName || q.client,
    project: q.project,
    status: q.status,
    salesperson: q.salesperson,
    issueDate: q.issueDate,
    amount: computeQuoteAmountBeforeVat(q.lines ?? [], q.discount ?? 0),
  }));
}

async function searchCustomers(query: string): Promise<SearchCustomerResult[]> {
  const customers = await customersCollection();
  const rx = containsRegex(query);
  const docs = await customers.find(
    {
      isDeleted: false,
      $or: [{ companyName: rx }, { contactName: rx }, { phone: rx }, { email: rx }, { taxId: rx }, { address: rx }, { projectName: rx }],
    },
    { projection: { companyName: 1, contactName: 1, phone: 1, email: 1, taxId: 1 }, sort: { companyName: 1 }, limit: RESULT_LIMIT },
  ).toArray();
  return docs.map((c) => {
    const { id, companyName, contactName, phone, email, taxId } = withStringId(c);
    return { id, companyName, contactName, phone, email, taxId };
  });
}

async function searchProducts(query: string): Promise<SearchProductResult[]> {
  const [products, categories] = await Promise.all([productsCollection(), categoriesCollection()]);
  const rx = containsRegex(query);
  // Category-name matches join to their products via categoryId — fetching all categories is
  // cheap (a handful of rows) and doubles as the display-name lookup below, so no second query.
  const categoryDocs = await categories.find({}, { projection: { name: 1 } }).toArray();
  const categoryNameById = new Map(categoryDocs.map((c) => [c._id.toString(), c.name]));
  const matchingCategoryIds = categoryDocs.filter((c) => new RegExp(escapeRegExp(query), "i").test(c.name)).map((c) => c._id.toString());

  const docs = await products.find(
    {
      archived: false,
      $or: [{ code: rx }, { name: rx }, { description: rx }, { specifications: rx }, { unit: rx }, { categoryId: { $in: matchingCategoryIds } }],
    },
    { projection: { code: 1, name: 1, categoryId: 1, unit: 1, archived: 1 }, sort: { name: 1 }, limit: RESULT_LIMIT },
  ).toArray();
  return docs.map((p) => {
    const { id, code, name, categoryId, unit, archived } = withStringId(p);
    return { id, code, name, categoryName: categoryNameById.get(categoryId) ?? "ไม่ระบุหมวดหมู่", unit, archived };
  });
}

async function searchUsers(query: string): Promise<SearchUserResult[]> {
  const [users, roles] = await Promise.all([usersCollection(), rolesCollection()]);
  const rx = containsRegex(query);
  const roleDocs = await roles.find({}, { projection: { key: 1, name: 1 } }).toArray();
  const roleNameByKey = new Map(roleDocs.map((r) => [r.key, r.name]));
  const matchingRoleKeys = roleDocs.filter((r) => new RegExp(escapeRegExp(query), "i").test(r.name)).map((r) => r.key);

  const docs = await users.find(
    {
      $or: [
        { fullName: rx }, { email: rx }, { employeeId: rx }, { department: rx }, { position: rx },
        { username: rx }, { roleKey: { $in: matchingRoleKeys } },
      ],
    },
    { projection: { fullName: 1, email: 1, employeeId: 1, department: 1, position: 1, roleKey: 1, status: 1 }, sort: { fullName: 1 }, limit: RESULT_LIMIT },
  ).toArray();
  return docs.map((u) => {
    const { id, fullName, email, employeeId, department, position, roleKey, status } = withStringId(u);
    return { id, fullName, email, employeeId, department, position, roleName: roleNameByKey.get(roleKey) ?? roleKey, status };
  });
}

async function searchScopeOfWorks(query: string, ctx: AuthContext): Promise<SearchScopeOfWorkResult[]> {
  const scopeOfWorks = await scopeOfWorksCollection();
  const rx = containsRegex(query);
  // Same own-records-only scoping as the standalone Scope of Work list page (2026-07-23, per direct
  // user request mirroring `searchQuotations()`'s identical `quotations:viewAll` treatment above) —
  // a caller without `scopeOfWork:viewAll` must not be able to discover another user's Scope of Work
  // through Global Search, which would otherwise bypass the list page's restriction entirely.
  // **Same-day second pass**: also matches when the caller is a picked document recipient (see
  // "Document Recipients"), mirroring the identical addition to the list page's own query.
  const recipientMatch = ALL_RECIPIENT_KEYS.map((key) => ({ [`documentRecipients.${key}`]: ctx.user.id }));
  const ownershipMatch = roleHasPermission(ctx.role, "scopeOfWork:viewAll")
    ? {}
    : { $or: [{ createdBy: ctx.user.id }, { createdBy: "" }, ...recipientMatch] };
  const docs = await scopeOfWorks.find(
    {
      isDeleted: false,
      ...ownershipMatch,
      $and: [{
        $or: [
          { scopeNumber: rx }, { quotationId: rx }, { quotationNumber: rx },
          { "customerSnapshot.companyName": rx }, { jobTypeCode: rx }, { jobTypeName: rx },
          { customerPoNumber: rx }, { status: rx },
        ],
      }],
    },
    {
      projection: { scopeNumber: 1, quotationId: 1, quotationNumber: 1, customerSnapshot: 1, jobTypeCode: 1, jobTypeName: 1, status: 1 },
      sort: { updatedAt: -1 },
      limit: RESULT_LIMIT,
    },
  ).toArray();
  return docs.map((d) => {
    const { id, scopeNumber, quotationId, quotationNumber, customerSnapshot, jobTypeCode, jobTypeName, status } = withStringId(d);
    return { id, scopeNumber, quotationId, quotationNumber, customerName: customerSnapshot.companyName, jobTypeCode, jobTypeName, status };
  });
}

async function searchTemplates(query: string): Promise<SearchTemplateResult[]> {
  const templates = await quotationTemplatesCollection();
  const rx = containsRegex(query);
  const docs = await templates.find(
    {
      isDeleted: false,
      // Only active templates are ever offered as a new-quotation starting point — a deactivated
      // template shouldn't show up as something a Sales user can pick from search either.
      isActive: true,
      $or: [{ templateCode: rx }, { templateName: rx }, { jobTypeCode: rx }, { jobTypeName: rx }, { description: rx }],
    },
    {
      projection: { templateCode: 1, templateName: 1, jobTypeCode: 1, jobTypeName: 1, description: 1 },
      sort: { templateName: 1 },
      limit: RESULT_LIMIT,
    },
  ).toArray();
  return docs.map((d) => {
    const { id, templateCode, templateName, jobTypeCode, jobTypeName, description } = withStringId(d);
    return { id, templateCode, templateName, jobTypeCode, jobTypeName, description };
  });
}

function searchPages(query: string, ctx: AuthContext): SearchPageResult[] {
  const q = query.toLowerCase();
  return SEARCHABLE_PAGES
    .filter((p) => p.permission === null || roleHasPermission(ctx.role, p.permission))
    .filter((p) => p.aliases.some((a) => a.toLowerCase().includes(q)))
    .slice(0, RESULT_LIMIT)
    .map(({ id, titleTh, titleEn, navKey, action }) => ({ id, titleTh, titleEn, navKey, action }));
}

export async function handleSearch(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
  const ctx = await requireUser(req);

  const rawQuery = req.query.q;
  const query = (Array.isArray(rawQuery) ? rawQuery[0] ?? "" : rawQuery ?? "").trim();
  if (query.length < MIN_QUERY_LENGTH) {
    throw new HttpError(400, `กรุณาพิมพ์อย่างน้อย ${MIN_QUERY_LENGTH} ตัวอักษร`);
  }
  if (query.length > MAX_QUERY_LENGTH) {
    throw new HttpError(400, `คำค้นหายาวเกินไป (สูงสุด ${MAX_QUERY_LENGTH} ตัวอักษร)`);
  }

  const [quotes, customers, products, users, scopeOfWorks] = await Promise.all([
    quotesCollection(), customersCollection(), productsCollection(), usersCollection(), scopeOfWorksCollection(),
  ]);
  // Index creation is incidental infrastructure, not data this response depends on — a transient
  // failure here must not 500 the whole search (same reasoning as the Dashboard's
  // ensureQuoteAnalyticsIndexes try/catch, see api/dashboard/index.ts).
  try {
    await ensureSearchIndexes(quotes, customers, products, users, scopeOfWorks);
  } catch (err) {
    console.error("[search] ensureSearchIndexes failed", err);
  }

  const [quotationResults, customerResults, productResults, templateResults, scopeOfWorkResults, userResults] = await Promise.all([
    roleHasPermission(ctx.role, "quotations:view") ? searchQuotations(query, ctx) : Promise.resolve([]),
    roleHasPermission(ctx.role, "customers:view") ? searchCustomers(query) : Promise.resolve([]),
    roleHasPermission(ctx.role, "products:view") ? searchProducts(query) : Promise.resolve([]),
    // Same read gate as browsing templates while creating a quotation (quotationTemplatesHandler.ts)
    // — a Sales user with only quotations:create, no quotationTemplates:manage, can still find them.
    (roleHasPermission(ctx.role, "quotations:create") || roleHasPermission(ctx.role, "quotationTemplates:manage"))
      ? searchTemplates(query) : Promise.resolve([]),
    // Scope of Work (added 2026-07-15, Codex review High Priority fix — see docs/MODULES/ScopeOfWork.md).
    roleHasPermission(ctx.role, "scopeOfWork:view") ? searchScopeOfWorks(query, ctx) : Promise.resolve([]),
    roleHasPermission(ctx.role, "users:manage") ? searchUsers(query) : Promise.resolve([]),
  ]);
  const pages = searchPages(query, ctx);

  const results: SearchResults = {
    quotations: quotationResults, customers: customerResults, products: productResults,
    templates: templateResults, scopeOfWorks: scopeOfWorkResults, pages, users: userResults,
  };
  res.status(200).json(results);
}
