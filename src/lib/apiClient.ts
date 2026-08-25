export class ApiError extends Error {
  status: number;
  code?: string;
  fieldErrors?: Record<string, string>;
  groupErrors?: Record<string, string[]>;
  // Optional item-path-keyed map (e.g. Service Report checklist paths "section.group.item") for
  // callers that need to highlight the exact failing control, not just a flat message list —
  // groupErrors stays a plain string[] (shared ValidationResult shape with every other module).
  checklistItemErrors?: Record<string, string>;
  constructor(status: number, message: string, extra?: { code?: string; fieldErrors?: Record<string, string>; groupErrors?: Record<string, string[]>; checklistItemErrors?: Record<string, string> }) {
    super(message);
    this.status = status;
    this.code = extra?.code;
    this.fieldErrors = extra?.fieldErrors;
    this.groupErrors = extra?.groupErrors;
    this.checklistItemErrors = extra?.checklistItemErrors;
  }
}

/** ตัวเลือกที่ทุกฟังก์ชัน update ของโมดูลเอกสารรับได้ เพื่อบอกว่าคำขอนี้มาจากการบันทึกอัตโนมัติ */
export interface WriteOptions {
  autoSave?: boolean;
}

/**
 * ต่อ `?autoSave=1` ให้คำขอที่มาจากการบันทึกอัตโนมัติ (เพิ่ม 2026-08-25)
 *
 * Marks a write as coming from the background auto-save rather than a person pressing Save. The
 * server reads it via `isAutoSaveRequest()` (api/_lib/http.ts) and reacts identically in every
 * respect except two: no audit-log entry, and draft documents only. Kept here, in the one module
 * every domain lib already imports, so the flag can never be spelled differently in two places.
 */
export function writeQuery(options?: WriteOptions): string {
  return options?.autoSave ? "?autoSave=1" : "";
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
    let checklistItemErrors: Record<string, string> | undefined;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
      if (typeof body?.code === "string") code = body.code;
      if (body?.fieldErrors && typeof body.fieldErrors === "object") fieldErrors = body.fieldErrors;
      if (body?.groupErrors && typeof body.groupErrors === "object") groupErrors = body.groupErrors;
      if (body?.checklistItemErrors && typeof body.checklistItemErrors === "object") checklistItemErrors = body.checklistItemErrors;
    } catch {
      // response had no JSON body
    }
    if (message === "Not authenticated") {
      message = currentLangIsEnglish() ? "Your session has expired — please sign in again" : "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่";
    }
    throw new ApiError(res.status, message, { code, fieldErrors, groupErrors, checklistItemErrors });
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
