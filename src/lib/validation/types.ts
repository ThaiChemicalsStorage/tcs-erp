/**
 * Shared validation-result shape for the Quotation/Scope of Work required-field validators (added
 * 2026-07-16). Framework-agnostic (no JSX/browser globals) — safe to value-import from both the
 * Vite frontend bundle and the Node serverless API bundle, same convention as
 * src/lib/documentRequirements.ts.
 */
export interface ValidationResult {
  valid: boolean;
  /** dotted-path field key (e.g. "customerSnapshot.companyName", "lines.1042") -> Thai error message. */
  fieldErrors: Record<string, string>;
  /** section name (currently only "documentRequirements") -> list of Thai messages, one per invalid mandatory checklist group. */
  groupErrors: Record<string, string[]>;
  /** Total count of individual problems (fieldErrors + all groupErrors entries) — feeds the "กรุณากรอกข้อมูลที่จำเป็นให้ครบ N รายการ" summary. */
  missingCount: number;
}

/**
 * Overlays a `422 DOCUMENT_INCOMPLETE` response's `fieldErrors`/`groupErrors` (`ApiError.fieldErrors`/
 * `.groupErrors`, `src/lib/apiClient.ts`) onto the live client-side validation result — added
 * 2026-07-16, Codex review Medium Priority fix: a server-side rejection (a race against a just-saved
 * change, or any case the client-side check didn't happen to catch) was previously surfaced only as
 * a toast, never reflected in the inline field/group errors or the summary. Server errors are
 * additive (never removed until the next successful client-side recompute already agrees), so a
 * field the client already flags stays flagged either way.
 */
export function mergeServerValidationErrors(
  base: ValidationResult,
  server: { fieldErrors: Record<string, string>; groupErrors: Record<string, string[]> } | null,
): ValidationResult {
  if (!server) return base;
  const fieldErrors = { ...base.fieldErrors, ...server.fieldErrors };
  const groupErrors: Record<string, string[]> = { ...base.groupErrors };
  for (const [key, messages] of Object.entries(server.groupErrors)) {
    groupErrors[key] = Array.from(new Set([...(groupErrors[key] ?? []), ...messages]));
  }
  const missingCount = Object.keys(fieldErrors).length + Object.values(groupErrors).reduce((n, arr) => n + arr.length, 0);
  return { valid: missingCount === 0, fieldErrors, groupErrors, missingCount };
}
