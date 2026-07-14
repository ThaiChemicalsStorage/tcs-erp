import { apiFetch } from "./apiClient.js";

/** Mirrors `SearchQuotationResult` in api/_lib/searchHandler.ts. */
export interface SearchQuotationResult {
  id: string;
  client: string;
  project: string;
  status: string;
  salesperson: string;
  issueDate: string;
  /** Before-VAT amount — same shared rule the Dashboard uses (`computeQuoteAmountBeforeVat`), never the VAT-included grand total. */
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

/** `navKey` matches `App.tsx`'s `NavKey` union at runtime — kept as a plain `string` here (not
 * imported, since `App.tsx` is not a module other files should import from) and cast at the one
 * call site that consumes it (`GlobalSearch.tsx`). */
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

export interface SearchResults {
  quotations: SearchQuotationResult[];
  customers: SearchCustomerResult[];
  products: SearchProductResult[];
  pages: SearchPageResult[];
  users: SearchUserResult[];
}

/**
 * Global Search (added 2026-07-14) — `GET /api/search?q=`, backed by `api/_lib/searchHandler.ts`.
 * Every category is already RBAC-filtered server-side; an unauthorized category simply comes back
 * as an empty array, indistinguishable from a genuine zero-result search — nothing further to
 * check here. Pass `signal` (an `AbortController`'s) so a caller can cancel a stale in-flight
 * request when the query changes again before the previous one resolves.
 */
export async function fetchGlobalSearch(query: string, signal?: AbortSignal): Promise<SearchResults> {
  return apiFetch<SearchResults>(`/search?q=${encodeURIComponent(query)}`, { signal });
}
