import { newId, nowIso } from "./products";

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

const AUDIT_LOG_KEY = "tcs_erp_audit_log";

export function loadAuditLog(): AuditLogEntry[] {
  try {
    const raw = localStorage.getItem(AUDIT_LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function saveAuditLog(entries: AuditLogEntry[]) {
  localStorage.setItem(AUDIT_LOG_KEY, JSON.stringify(entries));
}

/**
 * Append-only: reads the current log fresh from localStorage, appends, and writes back — so
 * callers never need a stale in-memory copy and can never accidentally truncate/edit history.
 */
export function logAudit(entry: {
  userId: string;
  userName: string;
  roleName: string;
  module: string;
  action: string;
  details?: string;
}): AuditLogEntry[] {
  const entries = loadAuditLog();
  const next: AuditLogEntry[] = [
    {
      id: newId("audit"),
      userId: entry.userId,
      userName: entry.userName,
      roleName: entry.roleName,
      module: entry.module,
      action: entry.action,
      details: entry.details ?? "",
      createdAt: nowIso(),
    },
    ...entries,
  ];
  saveAuditLog(next);
  return next;
}
