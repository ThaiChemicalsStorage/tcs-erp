import { apiFetch } from "./apiClient.js";

export interface Company {
  name: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  facebookName: string;
  lineId: string;
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
  website: "",
  facebookName: "",
  lineId: "",
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

export interface CompanyHeaderInfo {
  name: string;
  nameEn: string;
  logoDataUrl: string;
  address: string;
  phone: string;
  fax: string;
  email: string;
  website: string;
  facebookName: string;
  lineId: string;
  taxId: string;
  branchName: string;
  branchCode: string;
  stampDataUrl: string;
}

// ดึงข้อมูลโปรไฟล์บริษัทจากเซิร์ฟเวอร์
// Fetches the company profile from the server.
export async function fetchCompany(): Promise<Company> {
  const { company } = await apiFetch<{ company: Company }>("/company");
  return company;
}
// บันทึกข้อมูลโปรไฟล์บริษัทไปยังเซิร์ฟเวอร์
// Saves the company profile to the server.
export async function saveCompany(company: Company): Promise<Company> {
  const { company: updated } = await apiFetch<{ company: Company }>("/company", { method: "PUT", body: JSON.stringify(company) });
  return updated;
}
