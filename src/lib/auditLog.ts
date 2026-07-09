import { apiFetch } from "./apiClient.js";

export interface AuditLogEntry {
  id: string;
  userId: string;
  userName: string;
  roleName: string;
  module: string;
  action: string;
  details: string;
  createdAt: string;
}

export async function fetchAuditLog(): Promise<AuditLogEntry[]> {
  const { entries } = await apiFetch<{ entries: AuditLogEntry[] }>("/audit-log");
  return entries;
}

/**
 * Server-side: userId/userName/roleName are always taken from the authenticated session, never
 * from this payload — so a client can only describe what happened, not claim to be someone else.
 */
export async function logAudit(entry: { module: string; action: string; details?: string }): Promise<AuditLogEntry> {
  const { entry: created } = await apiFetch<{ entry: AuditLogEntry }>("/audit-log", {
    method: "POST",
    body: JSON.stringify(entry),
  });
  return created;
}
