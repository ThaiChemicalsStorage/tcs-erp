const SESSION_KEY = "tcs_erp_session";

export function loadSession(): string | null {
  return localStorage.getItem(SESSION_KEY);
}
export function saveSession(userId: string) {
  localStorage.setItem(SESSION_KEY, userId);
}
export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}
