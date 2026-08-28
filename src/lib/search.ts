import { apiFetch } from "./apiClient.js";

/**
 * Client mirror of `api/_lib/searchHandler.ts`'s response contract. Duplicated deliberately rather
 * than imported: `api/` is a separate Node-target build (`tsconfig.api.json`) and the two sides are
 * kept in sync by hand, the same convention every other domain lib in `src/lib/` follows.
 */

export interface SearchQuotationResult {
  id: string;
  client: string;
  project: string;
  status: string;
  salesperson: string;
  issueDate: string;
  amount: number;
}

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
 * One shape shared by all 12 business-document categories (9 added 2026-08-28, then ใบสั่งซื้อ /
 * ใบตรวจรับสินค้า / ใบรับวางบิล with the Purchasing module the same day). Every document in the
 * system answers the same four questions — its number, whose job it is, what it descends from, and
 * what state it is in — so the panel renders one row component for all of them, and a thirteenth
 * document type is a searcher function plus a label.
 */
export interface SearchDocumentResult {
  id: string;
  /** เลขที่เอกสาร — "" for the types that genuinely have none (Delivery Order, Project). */
  docNumber: string;
  /** ลูกค้า หรือ ผู้ขาย */
  party: string;
  /** งานต้นทาง — the Scope of Work / job code / quotation this descends from. */
  lineage: string;
  status: string;
  date: string;
  /** ใบเบิกของ/ใบขอซื้อ — picks which of the two sidebar pages the result opens. */
  ownerDepartment?: "project" | "production" | "general";
  /** เอกสารบัญชี — picks which of the four accounting pages the result opens. */
  docType?: "AR" | "BI" | "RE" | "IV";
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

export interface SearchTemplateResult {
  id: string;
  templateCode: string;
  templateName: string;
  jobTypeCode: string;
  jobTypeName: string;
  description: string;
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

export interface SearchPageResult {
  id: string;
  titleTh: string;
  titleEn: string;
  navKey: string;
  action?: "create" | "categories";
}

/** The 9 categories backed by `SearchDocumentResult`. */
export type DocumentCategory =
  | "deliveryOrders" | "serviceReports" | "projects" | "materialRequisitions"
  | "jobOrders" | "purchaseRequests" | "productionOrders" | "arDocuments" | "productRequests"
  | "purchaseOrders" | "costControls";

export type SearchCategory =
  | "quotations" | "scopeOfWorks" | DocumentCategory
  | "customers" | "products" | "templates" | "users" | "pages";

/**
 * Render order, and the order arrow keys walk. Documents first, roughly following how work moves
 * through the company, because someone searching an ERP is nearly always after a document; master
 * data and menu shortcuts sit below them.
 */
export const SEARCH_CATEGORY_ORDER: SearchCategory[] = [
  "quotations", "scopeOfWorks", "deliveryOrders", "serviceReports", "projects",
  "materialRequisitions", "jobOrders", "purchaseRequests", "purchaseOrders", "costControls", "productionOrders",
  "arDocuments", "productRequests", "customers", "products", "templates", "users", "pages",
];

export const DOCUMENT_CATEGORIES: DocumentCategory[] = [
  "deliveryOrders", "serviceReports", "projects", "materialRequisitions",
  "jobOrders", "purchaseRequests", "purchaseOrders", "costControls", "productionOrders", "arDocuments", "productRequests",
];

export function isDocumentCategory(c: SearchCategory): c is DocumentCategory {
  return (DOCUMENT_CATEGORIES as SearchCategory[]).includes(c);
}

/** The document-number fast path's single pinned hit. */
export interface ExactMatch {
  category: SearchCategory;
  quotation?: SearchQuotationResult;
  document?: SearchDocumentResult;
}

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
  costControls: SearchDocumentResult[];
  productionOrders: SearchDocumentResult[];
  arDocuments: SearchDocumentResult[];
  productRequests: SearchDocumentResult[];
  customers: SearchCustomerResult[];
  products: SearchProductResult[];
  templates: SearchTemplateResult[];
  users: SearchUserResult[];
  pages: SearchPageResult[];
  exact: ExactMatch | null;
}

/**
 * One selected result, discriminated by its category. `App.tsx` switches on this exhaustively to
 * pick the right `navigateTo*` — a single `onOpenResult` prop instead of the 18 separate callbacks
 * one-per-type would have required, matching how `NotificationBell` already hands over a single
 * `onNavigate`.
 */
export type SearchHit =
  | { category: "quotations"; data: SearchQuotationResult }
  | { category: "scopeOfWorks"; data: SearchScopeOfWorkResult }
  | { category: DocumentCategory; data: SearchDocumentResult }
  | { category: "customers"; data: SearchCustomerResult }
  | { category: "products"; data: SearchProductResult }
  | { category: "templates"; data: SearchTemplateResult }
  | { category: "users"; data: SearchUserResult }
  | { category: "pages"; data: SearchPageResult };

/** i18n key for each category's group heading and filter chip. */
export const SEARCH_CATEGORY_LABEL_KEY: Record<SearchCategory, string> = {
  quotations: "search.group.quotations",
  scopeOfWorks: "search.group.scopeOfWorks",
  deliveryOrders: "search.group.deliveryOrders",
  serviceReports: "search.group.serviceReports",
  projects: "search.group.projects",
  materialRequisitions: "search.group.materialRequisitions",
  jobOrders: "search.group.jobOrders",
  purchaseRequests: "search.group.purchaseRequests",
  purchaseOrders: "search.group.purchaseOrders",
  costControls: "search.group.costControls",
  productionOrders: "search.group.productionOrders",
  arDocuments: "search.group.arDocuments",
  productRequests: "search.group.productRequests",
  customers: "search.group.customers",
  products: "search.group.products",
  templates: "search.group.templates",
  users: "search.group.users",
  pages: "search.group.pages",
};

/** How many results a category holds, without caring which shape it holds. */
export function countIn(results: SearchResults, category: SearchCategory): number {
  return (results[category] as unknown[]).length;
}

// ค้นหาข้อมูลทั้งหมดในระบบตามคำค้น (ใบเสนอราคา เอกสารทุกชนิด ลูกค้า สินค้า ฯลฯ) พร้อมกรองตามสิทธิ์ผู้ใช้
// Searches every record type, filtered server-side by the caller's permissions. `types` narrows to
// specific categories, which is also how the panel's filter chips ask for a fuller page of one kind.
export async function fetchGlobalSearch(
  query: string, signal?: AbortSignal, types?: SearchCategory[],
): Promise<SearchResults> {
  const typeParam = types && types.length > 0 ? `&types=${encodeURIComponent(types.join(","))}` : "";
  return apiFetch<SearchResults>(`/search?q=${encodeURIComponent(query)}${typeParam}`, { signal });
}

/* ------------------------------------------------------------------ *
 * เอกสารที่เปิดล่าสุด — recently opened documents
 * ------------------------------------------------------------------ */

const RECENT_KEY_PREFIX = "tcs_erp_recent_docs_";
const RECENT_LIMIT = 8;

/**
 * A pointer to something the user opened from search, kept so the panel has something useful to
 * show before a single character is typed.
 *
 * **Only a pointer.** `label` is the document number (or the name, for master data) and nothing
 * else — no customer names, no amounts, no status. Business data belongs on the server behind a
 * permission check, and this is unencrypted `localStorage` on a shared office machine. Re-opening a
 * recent entry goes through the same navigation and the same server-side gates as any other result.
 */
export interface RecentDoc {
  category: SearchCategory;
  id: string;
  label: string;
  /** Carried through so a recent ใบเบิกของ/ใบขอซื้อ or accounting document reopens the right page. */
  ownerDepartment?: "project" | "production" | "general";
  docType?: "AR" | "BI" | "RE" | "IV";
}

function recentKey(userId: string): string {
  return `${RECENT_KEY_PREFIX}${userId}`;
}

export function loadRecentDocs(userId: string): RecentDoc[] {
  if (!userId) return [];
  try {
    const raw = window.localStorage.getItem(recentKey(userId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((d): d is RecentDoc =>
      !!d && typeof d === "object"
      && typeof (d as RecentDoc).id === "string"
      && typeof (d as RecentDoc).label === "string"
      && typeof (d as RecentDoc).category === "string",
    ).slice(0, RECENT_LIMIT);
  } catch {
    // A quota error, private-mode restriction, or hand-edited garbage must never break the panel.
    return [];
  }
}

/** Records an opened result, newest first, de-duplicated on (category, id). */
export function rememberRecentDoc(userId: string, entry: RecentDoc): void {
  if (!userId || !entry.label) return;
  try {
    const next = [entry, ...loadRecentDocs(userId).filter((d) => !(d.id === entry.id && d.category === entry.category))]
      .slice(0, RECENT_LIMIT);
    window.localStorage.setItem(recentKey(userId), JSON.stringify(next));
  } catch {
    // Storage being unavailable is not worth surfacing — the feature is a convenience.
  }
}
