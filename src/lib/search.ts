import { apiFetch } from "./apiClient.js";

export interface SearchQuotationResult {
  id: string;
  client: string;
  project: string;
  status: string;
  salesperson: string;
  issueDate: string;
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

export interface SearchTemplateResult {
  id: string;
  templateCode: string;
  templateName: string;
  jobTypeCode: string;
  jobTypeName: string;
  description: string;
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

export interface SearchResults {
  quotations: SearchQuotationResult[];
  customers: SearchCustomerResult[];
  products: SearchProductResult[];
  templates: SearchTemplateResult[];
  scopeOfWorks: SearchScopeOfWorkResult[];
  pages: SearchPageResult[];
  users: SearchUserResult[];
}

// ค้นหาข้อมูลทั้งหมดในระบบตามคำค้น (ใบเสนอราคา ลูกค้า สินค้า ฯลฯ) พร้อมกรองตามสิทธิ์ผู้ใช้
// Searches across all record types (quotations, customers, products, etc.) filtered by user permissions
export async function fetchGlobalSearch(query: string, signal?: AbortSignal): Promise<SearchResults> {
  return apiFetch<SearchResults>(`/search?q=${encodeURIComponent(query)}`, { signal });
}
