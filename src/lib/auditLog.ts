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
  relatedQuoteId?: string;
  relatedCustomerName?: string;
  relatedCompanyProfileId?: string;
  relatedCompanyProfileName?: string;
  relatedTemplateId?: string;
  relatedTemplateName?: string;
  relatedJobTypeCode?: string;
  relatedScopeId?: string;
  relatedScopeNumber?: string;
}

// ดึงรายการบันทึกการใช้งาน (audit log) ทั้งหมดจากเซิร์ฟเวอร์
// Fetches the full audit log entry list from the server
export async function fetchAuditLog(): Promise<AuditLogEntry[]> {
  const { entries } = await apiFetch<{ entries: AuditLogEntry[] }>("/audit-log");
  return entries;
}

// บันทึกเหตุการณ์ใหม่ลงในบันทึกการใช้งาน (ผู้ใช้/บทบาทมาจากเซสชันฝั่งเซิร์ฟเวอร์เสมอ)
// Writes a new audit log entry (user/role always come from the server session)
export async function logAudit(entry: { module: string; action: string; details?: string }): Promise<AuditLogEntry> {
  const { entry: created } = await apiFetch<{ entry: AuditLogEntry }>("/audit-log", {
    method: "POST",
    body: JSON.stringify(entry),
  });
  return created;
}
