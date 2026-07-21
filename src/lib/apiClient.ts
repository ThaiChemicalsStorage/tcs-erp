export class ApiError extends Error {
  status: number;
  /** Machine-readable error code from the server, e.g. "DOCUMENT_INCOMPLETE" — see HttpError in
   * api/_lib/http.ts. Undefined for every error response that doesn't set one. */
  code?: string;
  /** Structured, field-level validation detail (fieldErrors/groupErrors) attached by the server's
   * required-field validators (validateQuotationForFinalization/Print, ScopeOfWork equivalents) —
   * lets the UI highlight exactly what's missing instead of only showing the message as a toast.
   * Undefined for any other error. */
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

/**
 * Deliberately NOT importing from "./i18n" here: apiClient.ts is transitively value-imported into
 * the API serverless bundle (roles.ts -> apiClient.ts, and roles.ts is imported by api/_lib/auth.ts
 * for roleHasPermission/findRole on every authenticated request). i18n.tsx is a JSX/React module not
 * compiled into the Node function output, so importing it here previously broke every authenticated
 * route in production (ERR_MODULE_NOT_FOUND at runtime). Keep this file's own tiny bilingual lookup
 * instead of depending on the shared dictionary.
 */
function currentLangIsEnglish(): boolean {
  return typeof window !== "undefined" && window.localStorage.getItem("tcs_erp_lang") === "en";
}

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
      /* response had no JSON body */
    }
    // requireUser() in api/_lib/auth.ts throws this exact literal string for a missing/expired/
    // invalid session cookie on every *authenticated* route — translate it into a real, actionable
    // message instead of leaking raw English server text. Matched by exact content, not by status
    // code alone: a wrong-password login attempt is also a 401, but carries its own already-correct,
    // already-Thai message ("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง") that must pass through unchanged.
    if (message === "Not authenticated") {
      message = currentLangIsEnglish() ? "Your session has expired — please sign in again" : "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่";
    }
    throw new ApiError(res.status, message, { code, fieldErrors, groupErrors });
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
