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
  /** Quotation number (same value as `Quote.id`) this entry relates to — only present on
   * quote-workflow entries written by `writeQuoteAuditEntry()` (api/handlers/quotes.ts), added
   * 2026-07-13 so the Dashboard's Recent Activities list can render/link to it as a real field
   * instead of parsing it out of `details`. Absent on older entries and on entries from other
   * modules (Users, Roles, Settings, Login/Logout). */
  relatedQuoteId?: string;
  /** Customer/client name this entry relates to — same provenance/caveats as `relatedQuoteId`. */
  relatedCustomerName?: string;
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
