export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
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
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* response had no JSON body */
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
