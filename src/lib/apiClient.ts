export class ApiError extends Error {
  status: number;
  code?: string;
  fieldErrors?: Record<string, string>;
  groupErrors?: Record<string, string[]>;
  constructor(status: number, message: string, extra?: { code?: string; fieldErrors?: Record<string, string>; groupErrors?: Record<string, string[]> }) {
    super(message);
    this.status = status;
    this.code = extra?.code;
    this.fieldErrors = extra?.fieldErrors;
    this.groupErrors = extra?.groupErrors;
  }
}

// ตรวจสอบว่าผู้ใช้ตั้งค่าภาษาอังกฤษไว้หรือไม่ (อ่านจาก localStorage โดยตรง)
// Checks whether the user's chosen language is English (reads localStorage directly)
function currentLangIsEnglish(): boolean {
  return typeof window !== "undefined" && window.localStorage.getItem("tcs_erp_lang") === "en";
}

// เรียก API ของระบบ แปลง error response เป็น ApiError พร้อมข้อความภาษาที่เหมาะสม
// Calls the app's API and converts a failed response into an ApiError with a localized message
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    credentials: "include",
  });
  if (!res.ok) {
    let message = currentLangIsEnglish() ? `Request failed (${res.status})` : `คำขอไม่สำเร็จ (${res.status})`;
    let code: string | undefined;
    let fieldErrors: Record<string, string> | undefined;
    let groupErrors: Record<string, string[]> | undefined;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
      if (typeof body?.code === "string") code = body.code;
      if (body?.fieldErrors && typeof body.fieldErrors === "object") fieldErrors = body.fieldErrors;
      if (body?.groupErrors && typeof body.groupErrors === "object") groupErrors = body.groupErrors;
    } catch {
      // response had no JSON body
    }
    if (message === "Not authenticated") {
      message = currentLangIsEnglish() ? "Your session has expired — please sign in again" : "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่";
    }
    throw new ApiError(res.status, message, { code, fieldErrors, groupErrors });
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
