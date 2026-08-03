export interface ValidationResult {
  valid: boolean;
  fieldErrors: Record<string, string>;
  groupErrors: Record<string, string[]>;
  missingCount: number;
}

// รวม fieldErrors/groupErrors จากการตอบกลับ 422 ของเซิร์ฟเวอร์เข้ากับผลตรวจสอบฝั่งไคลเอนต์
// Merges a server 422 response's fieldErrors/groupErrors into the client-side validation result.
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
