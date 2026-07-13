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
 * A Company Profile is the official business identity used on quotation documents — company
 * name/logo/address/tax ID/bank accounts/terms — not a customer, not a user account, not a
 * separate website. Added 2026-07-13 to let the company issue quotations under more than one
 * registered entity/branch. This module manages the master-data records themselves
 * (add/edit/view/activate/archive/set default); the Quotation form's `IssuerCompanySelector`
 * (`src/pages/quotation/IssuerCompanySelector.tsx`, wired the same day) is what actually lets a
 * user pick one when issuing a quote — see `Quote.issuerCompanyId`/`issuerCompanySnapshot` in
 * `quotes.tsx` and `resolveIssuerCompanyUpdate()` in `api/handlers/quotes.ts`.
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

/**
 * The frozen-at-issue-time copy of a `CompanyProfile` stored on `Quote.issuerCompanySnapshot`
 * (`src/lib/quotes.tsx`) — defined here, once, so both files reference the same shape instead of
 * `quotes.tsx` inlining its own duplicate object literal type. Added 2026-07-13 (Quotation
 * integration pass). Server-derived only — see `resolveIssuerCompanyUpdate()` in
 * `api/handlers/quotes.ts`; nothing on the client ever constructs one of these directly.
 */
export interface IssuerCompanySnapshot {
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
  quotationTerms: string;
  quotationFooter: string;
  stampDataUrl: string;
}

/**
 * A common shape for rendering "who is issuing this document" regardless of source — a live
 * `CompanyProfile` (while a Draft quote's selector is being changed), a frozen
 * `IssuerCompanySnapshot` (an already-saved quote, so editing the profile later can't silently
 * change what a customer already received), or the legacy single-company `Company` singleton
 * (the fallback for a quote that predates this feature, or when no company profile has been set
 * up yet). `QuoteDocument.tsx`/`PrintDocument.tsx` render this one shape, never the three source
 * types directly, so the header/print logic doesn't need to branch on which source it came from.
 */
export interface IssuerCompanyDisplay {
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

export function issuerDisplayFromProfile(p: CompanyProfile): IssuerCompanyDisplay {
  return {
    name: p.displayName || p.companyNameTh,
    nameEn: p.companyNameEn,
    logoDataUrl: p.logoDataUrl,
    address: p.addressTh,
    phone: p.phone,
    fax: p.fax,
    email: p.email,
    website: p.website,
    taxId: p.taxId,
    branchName: p.branchName,
    branchCode: p.branchCode,
    stampDataUrl: p.stampDataUrl,
  };
}

export function issuerDisplayFromSnapshot(s: IssuerCompanySnapshot): IssuerCompanyDisplay {
  return {
    name: s.displayName || s.companyNameTh,
    nameEn: s.companyNameEn,
    logoDataUrl: s.logoDataUrl,
    address: s.addressTh,
    phone: s.phone,
    fax: s.fax,
    email: s.email,
    website: s.website,
    taxId: s.taxId,
    branchName: s.branchName,
    branchCode: s.branchCode,
    stampDataUrl: s.stampDataUrl,
  };
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
