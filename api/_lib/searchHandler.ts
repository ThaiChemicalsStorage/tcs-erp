import type { VercelRequest, VercelResponse } from "@vercel/node";
import { HttpError } from "./http.js";
import { requireUser, type AuthContext } from "./auth.js";
import {
  quotesCollection, customersCollection, productsCollection, categoriesCollection,
  usersCollection, rolesCollection, quotationTemplatesCollection, scopeOfWorksCollection, withStringId, type QuoteFields,
} from "./collections.js";
import { roleHasPermission, isNavHiddenForRole } from "../../src/lib/roles.js";
import type { Permission } from "../../src/lib/permissions.js";
import { computeQuoteAmountBeforeVat } from "./quoteAmounts.js";
import { buildOwnershipClause } from "./visibility.js";
import {
  LIMIT_ALL, LIMIT_FILTERED, MIN_QUERY_LENGTH, MAX_QUERY_LENGTH,
  escapeRegExp, containsRegex, startsWithRegex, detectDocNumberFamily,
} from "./searchShared.js";
import {
  searchDeliveryOrders, searchServiceReports, searchProjects, searchMaterialRequisitions,
  searchJobOrders, searchPurchaseRequests, searchPurchaseOrders, searchGoodsReceipts, searchBillReceipts, searchProductionOrders, searchProductRequests,
  searchArDocuments, searchByDocNumber, scopeOfWorkOwnership,
  type SearchDocumentResult,
} from "./searchDocuments.js";

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

/**
 * Limits, the query-length bounds, and the regex helpers now live in `searchShared.ts` so
 * `searchDocuments.ts` can use them too without an import cycle. The 2026-07-14 Codex review's
 * `MAX_QUERY_LENGTH` rationale is recorded there.
 *
 * **2026-08-28**: the flat 5-per-category cap became `LIMIT_ALL` (3) / `LIMIT_FILTERED` (20).
 * Search went from 7 categories to 16, and 16 × 5 is ~80 rows of scrolling for someone who just
 * wanted one document — 3 keeps the unfiltered panel scannable, and the type-filter chips are the
 * explicit way to ask for more of one kind.
 */

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

/**
 * Every category, in the order the UI renders them: the document chain first, roughly in the order
 * work moves through the company (quotation → scope → delivery, then the project/production and
 * accounting branches), then master data, then menu shortcuts last. A person searching an ERP is
 * almost always after a document, so documents get the top of the panel.
 *
 * `SearchDocumentResult` is one shared shape across all 9 document categories — see
 * `searchDocuments.ts` for why.
 */
export interface SearchResults {
  quotations: SearchQuotationResult[];
  scopeOfWorks: SearchScopeOfWorkResult[];
  deliveryOrders: SearchDocumentResult[];
  serviceReports: SearchDocumentResult[];
  projects: SearchDocumentResult[];
  materialRequisitions: SearchDocumentResult[];
  jobOrders: SearchDocumentResult[];
  purchaseRequests: SearchDocumentResult[];
  purchaseOrders: SearchDocumentResult[];
  goodsReceipts: SearchDocumentResult[];
  billReceipts: SearchDocumentResult[];
  productionOrders: SearchDocumentResult[];
  arDocuments: SearchDocumentResult[];
  productRequests: SearchDocumentResult[];
  customers: SearchCustomerResult[];
  products: SearchProductResult[];
  templates: SearchTemplateResult[];
  users: SearchUserResult[];
  pages: SearchPageResult[];
  /**
   * The document-number fast path's single hit, pinned above every group and pre-selected by the
   * client so Enter opens it immediately. `null` whenever the query does not look like a document
   * number, or the number does not resolve to something this caller may see.
   */
  exact: ExactMatch | null;
}

/** A pinned document-number hit. `category` names which `SearchResults` group it belongs to. */
export interface ExactMatch {
  category: SearchCategory;
  quotation?: SearchQuotationResult;
  document?: SearchDocumentResult;
}

/** Every key of `SearchResults` that carries results — the vocabulary `?types=` accepts. */
export type SearchCategory =
  | "quotations" | "scopeOfWorks" | "deliveryOrders" | "serviceReports" | "projects"
  | "materialRequisitions" | "jobOrders" | "purchaseRequests" | "purchaseOrders" | "goodsReceipts" | "billReceipts" | "productionOrders"
  | "arDocuments" | "productRequests" | "customers" | "products" | "templates"
  | "users" | "pages";

const ALL_CATEGORIES: SearchCategory[] = [
  "quotations", "scopeOfWorks", "deliveryOrders", "serviceReports", "projects",
  "materialRequisitions", "jobOrders", "purchaseRequests", "purchaseOrders", "goodsReceipts", "billReceipts", "productionOrders",
  "arDocuments", "productRequests", "customers", "products", "templates", "users", "pages",
];

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

  // 2026-08-28: this list had covered 11 of App.tsx's 30 nav keys since 2026-07-14 — every module
  // built after that date was unreachable by name. The rest, in sidebar order. Each reuses its own
  // nav item's permission from App.tsx's `navItems`, never an invented stricter one.
  { id: "quotationTemplates", titleTh: "Template ใบเสนอราคา", titleEn: "Quotation Templates", navKey: "quotationTemplates", permission: "quotationTemplates:view", aliases: ["template ใบเสนอราคา", "quotation templates", "template", "เทมเพลต"] },
  { id: "scopeOfWork", titleTh: "Scope of Work", titleEn: "Scope of Work", navKey: "scopeOfWork", permission: "scopeOfWork:view", aliases: ["scope of work", "scope", "สโคป", "ขอบเขตงาน"] },
  { id: "deliveryOrder", titleTh: "ใบส่งมอบสินค้า", titleEn: "Delivery Orders", navKey: "deliveryOrder", permission: "deliveryOrder:view", aliases: ["ใบส่งมอบสินค้า", "ใบส่งมอบ", "ใบส่งมอบงาน", "delivery order", "delivery"] },
  { id: "service", titleTh: "รายงานบริการ", titleEn: "Service Reports", navKey: "service", permission: "service:view", aliases: ["รายงานบริการ", "บริการ", "service report", "service"] },
  { id: "serviceTemplates", titleTh: "Template รายงานบริการ", titleEn: "Service Templates", navKey: "serviceTemplates", permission: "serviceTemplates:view", aliases: ["template รายงานบริการ", "service templates", "เทมเพลตบริการ"] },
  { id: "accountingDashboard", titleTh: "แดชบอร์ดบัญชี", titleEn: "Accounting Dashboard", navKey: "accountingDashboard", permission: "ar:view", aliases: ["แดชบอร์ดบัญชี", "accounting dashboard", "ภาพรวมบัญชี"] },
  { id: "accounting", titleTh: "วางบิลตามงาน", titleEn: "Billing by Job", navKey: "accounting", permission: "ar:view", aliases: ["วางบิลตามงาน", "วางบิล", "billing", "บัญชี", "accounting"] },
  { id: "arDeposit", titleTh: "ใบรับเงินมัดจำ/ใบกำกับภาษี", titleEn: "Deposit Receipt / Tax Invoice", navKey: "arDeposit", permission: "ar:view", aliases: ["ใบรับเงินมัดจำ", "มัดจำ", "deposit", "ar"] },
  { id: "arBilling", titleTh: "ใบแจ้งหนี้/ใบวางบิล", titleEn: "Invoice / Billing Note", navKey: "arBilling", permission: "ar:view", aliases: ["ใบแจ้งหนี้", "ใบวางบิล", "invoice", "billing note", "bi"] },
  { id: "arReceipt", titleTh: "ใบเสร็จรับเงิน", titleEn: "Receipts", navKey: "arReceipt", permission: "ar:view", aliases: ["ใบเสร็จรับเงิน", "ใบเสร็จ", "receipt", "re"] },
  { id: "arTaxInvoice", titleTh: "ใบกำกับภาษี/ใบส่งสินค้า", titleEn: "Tax Invoice / Delivery Note", navKey: "arTaxInvoice", permission: "ar:view", aliases: ["ใบกำกับภาษี", "ใบส่งสินค้า", "tax invoice", "iv"] },
  { id: "arMonthly", titleTh: "สรุปเอกสารประจำเดือน", titleEn: "Monthly Document Summary", navKey: "arMonthly", permission: "ar:view", aliases: ["สรุปเอกสารประจำเดือน", "สรุปประจำเดือน", "monthly summary", "monthly"] },
  { id: "project", titleTh: "โครงการ", titleEn: "Projects", navKey: "project", permission: "project:view", aliases: ["โครงการ", "project", "projects"] },
  { id: "materialRequisition", titleTh: "ใบเบิกและคืนวัสดุ", titleEn: "Material Requisitions", navKey: "materialRequisition", permission: "materialRequisition:view", aliases: ["ใบเบิกและคืนวัสดุ", "ใบเบิกของ", "ใบเบิก", "ใบคืนวัสดุ", "material requisition"] },
  { id: "jobOrder", titleTh: "ใบสั่งงาน", titleEn: "Job Orders", navKey: "jobOrder", permission: "jobOrder:view", aliases: ["ใบสั่งงาน", "job order"] },
  { id: "purchaseRequest", titleTh: "ใบขอซื้อ", titleEn: "Purchase Requests", navKey: "purchaseRequest", permission: "purchaseRequest:view", aliases: ["ใบขอซื้อ", "ขอซื้อ", "purchase request", "pr"] },
  { id: "productionOrder", titleTh: "ใบสั่งผลิต", titleEn: "Production Orders", navKey: "productionOrder", permission: "productionOrder:view", aliases: ["ใบสั่งผลิต", "ใบส่งผลิต", "production order", "ผลิต"] },
  { id: "productionRequisition", titleTh: "ใบเบิกและคืนวัสดุ (ฝ่ายผลิต)", titleEn: "Material Requisitions (Production)", navKey: "productionRequisition", permission: "materialRequisition:view", aliases: ["ใบเบิกและคืนวัสดุ ฝ่ายผลิต", "ใบเบิกของ ฝ่ายผลิต", "material requisition production"] },
  { id: "productionPurchase", titleTh: "ใบขอซื้อ (ฝ่ายผลิต)", titleEn: "Purchase Requests (Production)", navKey: "productionPurchase", permission: "purchaseRequest:view", aliases: ["ใบขอซื้อ ฝ่ายผลิต", "purchase request production"] },
  { id: "stock", titleTh: "สต๊อกสินค้า", titleEn: "Stock", navKey: "stock", permission: "stock:view", aliases: ["สต๊อกสินค้า", "สต๊อก", "stock", "คลัง"] },
  { id: "productRequest", titleTh: "คำขอเพิ่มสินค้า", titleEn: "Product Requests", navKey: "productRequest", permission: "productRequest:view", aliases: ["คำขอเพิ่มสินค้า", "ขอเพิ่มสินค้า", "product request", "ขอรหัสสินค้า"] },
  { id: "departments", titleTh: "แผนกและทีม", titleEn: "Departments and Teams", navKey: "departments", permission: "departments:manage", aliases: ["แผนกและทีม", "แผนก", "ทีม", "departments", "teams"] },
];

async function searchQuotations(query: string, ctx: AuthContext, limit: number): Promise<SearchQuotationResult[]> {
  const quotes = await quotesCollection();
  const rx = containsRegex(query);
  // Same scoping as `GET /api/quotes` — a caller must never discover through search a quotation the
  // list page hides from them (2026-07-22, per direct user request).
  //
  // **2026-08-28, corrected**: this was a hand-rolled binary own-vs-`viewAll` clause, while the list
  // route has used the 4-tier `buildOwnershipClause()` cascade since 2026-08-14. The gap was
  // one-directional and user-visible — a Sales team lead with `quotations:viewTeam` saw a
  // teammate's quotation on the list page but got nothing for it in search. Calling the shared
  // helper closes that; it opens no access the list route did not already grant.
  const ownershipMatch = await buildOwnershipClause(ctx, "quotations", "createdByUserId");
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
        client: 1, customerSnapshot: 1, project: 1, status: 1, salesperson: 1, issueDate: 1, lines: 1, discount: 1, discountMode: 1,
      },
      sort: { issueDate: -1 },
      limit,
    },
  ).toArray() as unknown as (Pick<QuoteFields, "client" | "customerSnapshot" | "project" | "status" | "salesperson" | "issueDate" | "lines" | "discount" | "discountMode"> & { _id: string })[];

  return docs.map((q) => ({
    id: q._id,
    client: q.customerSnapshot?.companyName || q.client,
    project: q.project,
    status: q.status,
    salesperson: q.salesperson,
    issueDate: q.issueDate,
    amount: computeQuoteAmountBeforeVat(q.lines ?? [], q.discount ?? 0, q.discountMode),
  }));
}

async function searchCustomers(query: string, limit: number): Promise<SearchCustomerResult[]> {
  const customers = await customersCollection();
  const rx = containsRegex(query);
  const docs = await customers.find(
    {
      isDeleted: false,
      $or: [{ companyName: rx }, { contactName: rx }, { phone: rx }, { email: rx }, { taxId: rx }, { address: rx }, { projectName: rx }],
    },
    { projection: { companyName: 1, contactName: 1, phone: 1, email: 1, taxId: 1 }, sort: { companyName: 1 }, limit },
  ).toArray();
  return docs.map((c) => {
    const { id, companyName, contactName, phone, email, taxId } = withStringId(c);
    return { id, companyName, contactName, phone, email, taxId };
  });
}

async function searchProducts(query: string, limit: number): Promise<SearchProductResult[]> {
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
    { projection: { code: 1, name: 1, categoryId: 1, unit: 1, archived: 1 }, sort: { name: 1 }, limit },
  ).toArray();
  return docs.map((p) => {
    const { id, code, name, categoryId, unit, archived } = withStringId(p);
    return { id, code, name, categoryName: categoryNameById.get(categoryId) ?? "ไม่ระบุหมวดหมู่", unit, archived };
  });
}

async function searchUsers(query: string, limit: number): Promise<SearchUserResult[]> {
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
    { projection: { fullName: 1, email: 1, employeeId: 1, department: 1, position: 1, roleKey: 1, status: 1 }, sort: { fullName: 1 }, limit },
  ).toArray();
  return docs.map((u) => {
    const { id, fullName, email, employeeId, department, position, roleKey, status } = withStringId(u);
    return { id, fullName, email, employeeId, department, position, roleName: roleNameByKey.get(roleKey) ?? roleKey, status };
  });
}

async function searchScopeOfWorks(query: string, ctx: AuthContext, limit: number): Promise<SearchScopeOfWorkResult[]> {
  const scopeOfWorks = await scopeOfWorksCollection();
  const rx = containsRegex(query);
  // Same scoping as the standalone Scope of Work list page, including the document-recipient
  // matches (2026-07-23) and, since 2026-08-28, the same 4-tier cascade — see
  // `scopeOfWorkOwnership()` in searchDocuments.ts for the full note.
  const ownershipMatch = await scopeOfWorkOwnership(ctx);
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
      limit,
    },
  ).toArray();
  return docs.map((d) => {
    const { id, scopeNumber, quotationId, quotationNumber, customerSnapshot, jobTypeCode, jobTypeName, status } = withStringId(d);
    return { id, scopeNumber, quotationId, quotationNumber, customerName: customerSnapshot.companyName, jobTypeCode, jobTypeName, status };
  });
}

async function searchTemplates(query: string, limit: number): Promise<SearchTemplateResult[]> {
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
      limit,
    },
  ).toArray();
  return docs.map((d) => {
    const { id, templateCode, templateName, jobTypeCode, jobTypeName, description } = withStringId(d);
    return { id, templateCode, templateName, jobTypeCode, jobTypeName, description };
  });
}

function searchPages(query: string, ctx: AuthContext, limit: number): SearchPageResult[] {
  const q = query.toLowerCase();
  return SEARCHABLE_PAGES
    .filter((p) => p.permission === null || roleHasPermission(ctx.role, p.permission))
    // Same per-role nav hiding the sidebar applies (2026-08-07) — offering a page here that the
    // role has no sidebar entry for would immediately undo the hiding. Presentation only: this
    // filters *menu shortcuts*, never business results, and the underlying permission is untouched
    // (a Service Engineer still reads customers through the report editor's CustomerSelector).
    .filter((p) => !isNavHiddenForRole(ctx.role, p.navKey))
    .filter((p) => p.aliases.some((a) => a.toLowerCase().includes(q)))
    .slice(0, limit)
    .map(({ id, titleTh, titleEn, navKey, action }) => ({ id, titleTh, titleEn, navKey, action }));
}

/** Parses `?types=a,b,c` into the set of categories to run. Empty/absent/unrecognised = everything. */
function parseTypes(raw: string | string[] | undefined): SearchCategory[] {
  const value = Array.isArray(raw) ? raw[0] ?? "" : raw ?? "";
  const asked = value.split(",").map((s) => s.trim()).filter(Boolean);
  const valid = asked.filter((s): s is SearchCategory => (ALL_CATEGORIES as string[]).includes(s));
  return valid.length > 0 ? valid : ALL_CATEGORIES;
}

/**
 * Runs one category, or returns `[]` — for any of three reasons that are deliberately
 * indistinguishable to the client: the caller lacks the permission, the caller narrowed to other
 * types, or the query itself threw.
 *
 * That last case is the 2026-08-28 addition. Search now touches 16 collections in one request, so
 * "one category's query failed" must degrade to an empty group rather than 500 the whole panel and
 * leave someone unable to find anything — the same per-section resilience `api/dashboard/index.ts`
 * adopted on 2026-07-14 for the same reason.
 */
async function runCategory<T>(
  category: SearchCategory, wanted: SearchCategory[], allowed: boolean, run: () => Promise<T[]>,
): Promise<T[]> {
  if (!allowed || !wanted.includes(category)) return [];
  try {
    return await run();
  } catch (err) {
    console.error(`[search] category "${category}" failed`, err);
    return [];
  }
}

/**
 * The quotation half of the document-number fast path. Lives here rather than in
 * `searchDocuments.ts` because a quotation result carries a computed before-VAT amount, and
 * `computeQuoteAmountBeforeVat()` is this file's dependency.
 */
async function quotationByNumber(query: string, ctx: AuthContext): Promise<SearchQuotationResult | null> {
  const quotes = await quotesCollection();
  const ownershipMatch = await buildOwnershipClause(ctx, "quotations", "createdByUserId");
  const docs = await quotes.find(
    { ...ownershipMatch, _id: startsWithRegex(query) } as never,
    { limit: 1 },
  ).toArray() as unknown as (QuoteFields & { _id: string })[];
  if (docs.length === 0) return null;
  const q = docs[0];
  return {
    id: q._id,
    client: q.customerSnapshot?.companyName || q.client,
    project: q.project,
    status: q.status,
    salesperson: q.salesperson,
    issueDate: q.issueDate,
    amount: computeQuoteAmountBeforeVat(q.lines ?? [], q.discount ?? 0, q.discountMode),
  };
}

/** Maps a `DOC_NUMBER_PREFIXES` family onto the permission and result group it belongs to. */
const FAST_PATH_GATES: Record<string, { permission: Permission; category: SearchCategory }> = {
  quotation: { permission: "quotations:view", category: "quotations" },
  serviceReport: { permission: "service:view", category: "serviceReports" },
  materialRequisition: { permission: "materialRequisition:view", category: "materialRequisitions" },
  jobOrder: { permission: "jobOrder:view", category: "jobOrders" },
  purchaseRequest: { permission: "purchaseRequest:view", category: "purchaseRequests" },
  purchaseOrder: { permission: "purchaseOrder:view", category: "purchaseOrders" },
  goodsReceipt: { permission: "goodsReceipt:view", category: "goodsReceipts" },
  billReceipt: { permission: "billReceipt:view", category: "billReceipts" },
  productionOrder: { permission: "productionOrder:view", category: "productionOrders" },
  arDocument: { permission: "ar:view", category: "arDocuments" },
};

/**
 * Resolves a query that looks like a document number to the one document it names, so the client
 * can pin it above every group and pre-select it. Never throws: a failure here degrades to "no
 * pinned match" and the ordinary substring groups still answer the query.
 */
async function findExactMatch(query: string, ctx: AuthContext): Promise<ExactMatch | null> {
  const family = detectDocNumberFamily(query);
  if (!family) return null;
  const gate = FAST_PATH_GATES[family];
  if (!gate || !roleHasPermission(ctx.role, gate.permission)) return null;
  try {
    if (family === "quotation") {
      const quotation = await quotationByNumber(query, ctx);
      return quotation ? { category: "quotations", quotation } : null;
    }
    const hit = await searchByDocNumber(family, query, ctx);
    return hit ? { category: gate.category, document: hit.result } : null;
  } catch (err) {
    console.error("[search] fast path failed", err);
    return null;
  }
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

  // Narrowing to specific types is how the panel's filter chips ask for more of one kind, so a
  // narrowed request returns a browsable page of results instead of the 3-row teaser.
  const wanted = parseTypes(req.query.types);
  const limit = wanted.length === ALL_CATEGORIES.length ? LIMIT_ALL : LIMIT_FILTERED;

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

  const has = (p: Permission) => roleHasPermission(ctx.role, p);

  const [
    quotations, scopeOfWorkResults, deliveryOrders, serviceReports, projects,
    materialRequisitions, jobOrders, purchaseRequests, purchaseOrders, goodsReceipts, billReceipts, productionOrders, arDocuments,
    productRequests, customerResults, productResults, templateResults, userResults, exact,
  ] = await Promise.all([
    runCategory("quotations", wanted, has("quotations:view"), () => searchQuotations(query, ctx, limit)),
    // Scope of Work (added 2026-07-15, Codex review High Priority fix — see docs/MODULES/ScopeOfWork.md).
    runCategory("scopeOfWorks", wanted, has("scopeOfWork:view"), () => searchScopeOfWorks(query, ctx, limit)),
    // The 9 document categories below were added 2026-08-28 ("ค้นหาได้ทุกเอกสาร") — see searchDocuments.ts.
    runCategory("deliveryOrders", wanted, has("deliveryOrder:view"), () => searchDeliveryOrders(query, ctx, limit)),
    runCategory("serviceReports", wanted, has("service:view"), () => searchServiceReports(query, ctx, limit)),
    runCategory("projects", wanted, has("project:view"), () => searchProjects(query, ctx, limit)),
    runCategory("materialRequisitions", wanted, has("materialRequisition:view"), () => searchMaterialRequisitions(query, ctx, limit)),
    runCategory("jobOrders", wanted, has("jobOrder:view"), () => searchJobOrders(query, ctx, limit)),
    runCategory("purchaseRequests", wanted, has("purchaseRequest:view"), () => searchPurchaseRequests(query, ctx, limit)),
    runCategory("purchaseOrders", wanted, has("purchaseOrder:view"), () => searchPurchaseOrders(query, ctx, limit)),
    runCategory("goodsReceipts", wanted, has("goodsReceipt:view"), () => searchGoodsReceipts(query, ctx, limit)),
    runCategory("billReceipts", wanted, has("billReceipt:view"), () => searchBillReceipts(query, ctx, limit)),
    runCategory("productionOrders", wanted, has("productionOrder:view"), () => searchProductionOrders(query, ctx, limit)),
    runCategory("arDocuments", wanted, has("ar:view"), () => searchArDocuments(query, limit)),
    runCategory("productRequests", wanted, has("productRequest:view"), () => searchProductRequests(query, ctx, limit)),
    runCategory("customers", wanted, has("customers:view"), () => searchCustomers(query, limit)),
    runCategory("products", wanted, has("products:view"), () => searchProducts(query, limit)),
    // Same read gate as browsing templates while creating a quotation (quotationTemplatesHandler.ts)
    // — a Sales user with only quotations:create, no quotationTemplates:manage, can still find them.
    runCategory("templates", wanted, has("quotations:create") || has("quotationTemplates:manage"), () => searchTemplates(query, limit)),
    runCategory("users", wanted, has("users:manage"), () => searchUsers(query, limit)),
    findExactMatch(query, ctx),
  ]);
  const pages = wanted.includes("pages") ? searchPages(query, ctx, limit) : [];

  const results: SearchResults = {
    quotations, scopeOfWorks: scopeOfWorkResults, deliveryOrders, serviceReports, projects,
    materialRequisitions, jobOrders, purchaseRequests, purchaseOrders, goodsReceipts, billReceipts, productionOrders, arDocuments,
    productRequests, customers: customerResults, products: productResults,
    templates: templateResults, users: userResults, pages, exact,
  };
  res.status(200).json(results);
}
