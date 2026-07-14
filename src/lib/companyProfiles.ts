import { apiFetch } from "./apiClient.js";

export interface BankAccount {
  id: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  branch: string;
  isDefault: boolean;
}

/**
 * A Company Profile is an administrator-managed business-identity record — company
 * name/logo/address/tax ID/bank accounts/terms — not a customer, not a user account, not a
 * separate website. Added 2026-07-13, originally intended to let the company issue quotations
 * under more than one registered entity/branch. **This module manages the master-data records
 * themselves only (add/edit/view/activate/archive/set default) — it is NOT connected to the
 * Quotation form.** A 2026-07-13 pass briefly wired a "pick which profile issues this quote"
 * selector into Quotation; that was built against a misunderstanding of the actual requirement
 * (this ERP only ever has one issuer company) and was fully reverted 2026-07-14. Quotations select
 * a saved **Customer** instead — see `src/pages/quotation/CustomerSelector.tsx`,
 * `Quote.customerId`/`customerSnapshot` in `quotes.tsx`, and `src/lib/customers.ts`. See
 * docs/MODULES/CompanyProfiles.md "Correction (2026-07-14)" for the full writeup.
 */
export interface CompanyProfile {
  id: string;
  companyCode: string;
  companyNameTh: string;
  companyNameEn: string;
  displayName: string;
  logoDataUrl: string;
  addressTh: string;
  addressEn: string;
  taxId: string;
  branchName: string;
  branchCode: string;
  phone: string;
  fax: string;
  email: string;
  website: string;
  bankAccounts: BankAccount[];
  quotationPrefix: string;
  quotationNumberFormat: string;
  quotationTerms: string;
  quotationFooter: string;
  stampDataUrl: string;
  signatureLabel: string;
  /** Exactly one active, non-archived profile should be default at a time — enforced server-side, see api/handlers/company-profiles.ts. */
  isDefault: boolean;
  isActive: boolean;
  /** Soft-delete/archive flag — distinct from `isActive`. Archived profiles are hidden from the list by default (like Product.archived) and can never be set as default. */
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

export interface CompanyProfileDraft {
  companyCode: string;
  companyNameTh: string;
  companyNameEn: string;
  displayName: string;
  logoDataUrl: string;
  addressTh: string;
  addressEn: string;
  taxId: string;
  branchName: string;
  branchCode: string;
  phone: string;
  fax: string;
  email: string;
  website: string;
  bankAccounts: BankAccount[];
  quotationPrefix: string;
  quotationNumberFormat: string;
  quotationTerms: string;
  quotationFooter: string;
  stampDataUrl: string;
  signatureLabel: string;
  isActive: boolean;
}

export const emptyCompanyProfileDraft: CompanyProfileDraft = {
  companyCode: "",
  companyNameTh: "",
  companyNameEn: "",
  displayName: "",
  logoDataUrl: "",
  addressTh: "",
  addressEn: "",
  taxId: "",
  branchName: "",
  branchCode: "",
  phone: "",
  fax: "",
  email: "",
  website: "",
  bankAccounts: [],
  quotationPrefix: "",
  quotationNumberFormat: "",
  quotationTerms: "",
  quotationFooter: "",
  stampDataUrl: "",
  signatureLabel: "",
  isActive: true,
};

export function newBankAccountId(): string {
  return `bank-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export async function fetchCompanyProfiles(): Promise<CompanyProfile[]> {
  const { companyProfiles } = await apiFetch<{ companyProfiles: CompanyProfile[] }>("/company-profiles");
  return companyProfiles;
}
export async function fetchCompanyProfile(id: string): Promise<CompanyProfile> {
  const { companyProfile } = await apiFetch<{ companyProfile: CompanyProfile }>(`/company-profiles/${id}`);
  return companyProfile;
}
export async function createCompanyProfile(draft: CompanyProfileDraft): Promise<CompanyProfile> {
  const { companyProfile } = await apiFetch<{ companyProfile: CompanyProfile }>("/company-profiles", {
    method: "POST",
    body: JSON.stringify(draft),
  });
  return companyProfile;
}
export async function updateCompanyProfile(id: string, fields: Partial<CompanyProfileDraft>): Promise<CompanyProfile> {
  const { companyProfile } = await apiFetch<{ companyProfile: CompanyProfile }>(`/company-profiles/${id}`, {
    method: "PATCH",
    body: JSON.stringify(fields),
  });
  return companyProfile;
}
export async function setCompanyProfileArchived(id: string, isDeleted: boolean): Promise<CompanyProfile> {
  const { companyProfile } = await apiFetch<{ companyProfile: CompanyProfile }>(`/company-profiles/${id}/archive`, {
    method: "POST",
    body: JSON.stringify({ isDeleted }),
  });
  return companyProfile;
}
export async function setDefaultCompanyProfile(id: string): Promise<CompanyProfile> {
  const { companyProfile } = await apiFetch<{ companyProfile: CompanyProfile }>(`/company-profiles/${id}/set-default`, {
    method: "POST",
  });
  return companyProfile;
}
