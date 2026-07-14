import { apiFetch } from "./apiClient.js";

export interface Company {
  name: string;
  address: string;
  phone: string;
  email: string;
  taxId: string;
  logoDataUrl: string;
  stampDataUrl: string;
  vatRate: number;
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  bankBranch: string;
  termsAndConditions: string;
  updatedAt: string;
  updatedBy: string;
}

export const defaultCompany: Company = {
  name: "บริษัท ไทย เคมิคอลส์ สโตเรจ จำกัด",
  address: "[ที่อยู่บริษัท]",
  phone: "[เบอร์โทรศัพท์]",
  email: "info@tcs-erp.co.th",
  taxId: "[เลขประจำตัวผู้เสียภาษี]",
  logoDataUrl: "",
  stampDataUrl: "",
  vatRate: 7,
  bankName: "",
  bankAccountName: "",
  bankAccountNumber: "",
  bankBranch: "",
  termsAndConditions: "",
  updatedAt: "",
  updatedBy: "",
};

/**
 * The shape `QuoteDocument.tsx`/`PrintDocument.tsx` render into the quotation document header —
 * always built directly from the single `Company` singleton above (this app only ever issues
 * quotations under one company identity, there is no per-quote issuer selection). Renamed from
 * `IssuerCompanyDisplay` and moved out of `companyProfiles.ts` (2026-07-14, Codex review Medium
 * fix) — that name/location was a leftover from a brief, incorrect 2026-07-13 "pick which saved
 * Company Profile issues this quote" feature, since reverted (see MODULES/CompanyProfiles.md
 * "Correction"); keeping "Issuer"-branded types next to the live Company Profiles module risked
 * someone mistaking this single-company header shape for a still-supported multi-issuer feature.
 */
export interface CompanyHeaderInfo {
  name: string;
  nameEn: string;
  logoDataUrl: string;
  address: string;
  phone: string;
  fax: string;
  email: string;
  website: string;
  taxId: string;
  branchName: string;
  branchCode: string;
  stampDataUrl: string;
}

export async function fetchCompany(): Promise<Company> {
  const { company } = await apiFetch<{ company: Company }>("/company");
  return company;
}
export async function saveCompany(company: Company): Promise<Company> {
  const { company: updated } = await apiFetch<{ company: Company }>("/company", { method: "PUT", body: JSON.stringify(company) });
  return updated;
}
