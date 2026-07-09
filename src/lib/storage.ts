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

export async function fetchCompany(): Promise<Company> {
  const { company } = await apiFetch<{ company: Company }>("/company");
  return company;
}
export async function saveCompany(company: Company): Promise<Company> {
  const { company: updated } = await apiFetch<{ company: Company }>("/company", { method: "PUT", body: JSON.stringify(company) });
  return updated;
}
