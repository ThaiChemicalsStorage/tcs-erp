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
};

const COMPANY_KEY = "tcs_erp_company";

export function loadCompany(): Company {
  try {
    const raw = localStorage.getItem(COMPANY_KEY);
    return raw ? { ...defaultCompany, ...JSON.parse(raw) } : defaultCompany;
  } catch {
    return defaultCompany;
  }
}
export function saveCompany(company: Company) {
  localStorage.setItem(COMPANY_KEY, JSON.stringify(company));
}
