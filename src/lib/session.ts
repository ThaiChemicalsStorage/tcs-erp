import { apiFetch, ApiError } from "./apiClient.js";
import type { User } from "./users";

export interface SessionInfo {
  user: User | null;
  needsSetup: boolean;
}

export interface SetupFields {
  employeeId: string;
  fullName: string;
  username: string;
  email: string;
  password: string;
}

export async function fetchSession(): Promise<SessionInfo> {
  return apiFetch<SessionInfo>("/auth/session");
}

export async function setupSuperAdmin(fields: SetupFields): Promise<User> {
  const { user } = await apiFetch<{ user: User }>("/auth/setup", { method: "POST", body: JSON.stringify(fields) });
  return user;
}

/** Returns an error message on failure, or null on success. */
export async function login(identifier: string, password: string): Promise<{ user: User | null; error: string | null }> {
  try {
    const { user } = await apiFetch<{ user: User }>("/auth/login", { method: "POST", body: JSON.stringify({ identifier, password }) });
    return { user, error: null };
  } catch (err) {
    if (err instanceof ApiError) return { user: null, error: err.message };
    return { user: null, error: "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" };
  }
}

export async function logout(): Promise<void> {
  await apiFetch<void>("/auth/logout", { method: "POST" });
}
