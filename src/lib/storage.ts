export interface Company {
  name: string;
  address: string;
  phone: string;
  email: string;
  taxId: string;
  logoDataUrl: string;
  stampDataUrl: string;
}

export interface UserProfile {
  name: string;
  email: string;
  role: string;
}

export const defaultCompany: Company = {
  name: "บริษัท ไทย เคมิคอลส์ สโตเรจ จำกัด",
  address: "[ที่อยู่บริษัท]",
  phone: "[เบอร์โทรศัพท์]",
  email: "info@tcs-erp.co.th",
  taxId: "[เลขประจำตัวผู้เสียภาษี]",
  logoDataUrl: "",
  stampDataUrl: "",
};

export const defaultUser: UserProfile = {
  name: "นภา ลาเรนต์",
  email: "napa@tcs-erp.co.th",
  role: "CFO · ปฏิบัติการทั่วโลก",
};

const AUTH_KEY = "tcs_erp_auth";
const COMPANY_KEY = "tcs_erp_company";
const USER_KEY = "tcs_erp_user";

export function loadAuthed(): boolean {
  return localStorage.getItem(AUTH_KEY) === "1";
}
export function saveAuthed(authed: boolean) {
  if (authed) localStorage.setItem(AUTH_KEY, "1");
  else localStorage.removeItem(AUTH_KEY);
}

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

export function loadUser(): UserProfile {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? { ...defaultUser, ...JSON.parse(raw) } : defaultUser;
  } catch {
    return defaultUser;
  }
}
export function saveUser(user: UserProfile) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}
