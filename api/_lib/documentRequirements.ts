import { HttpError } from "./http.js";
import { sanitizeShortText } from "./quoteValidation.js";
import type { ChecklistGroup, ChecklistOption } from "../../src/lib/documentRequirements.js";

export { buildDefaultChecklistGroups, withDefaultChecklistGroups } from "../../src/lib/documentRequirements.js";

/**
 * Server-only "document requirements" checklist-group sanitizer — shared by Quotation and Scope of
 * Work (added 2026-07-16, required-field validation pass; originally lived only in
 * scopeOfWorkHandler.ts). The default-structure builder itself (`buildDefaultChecklistGroups`,
 * re-exported above) is pure data with no server-only dependency, so it lives in the shared
 * src/lib/documentRequirements.ts where the frontend can also use it for a brand-new, not-yet-saved
 * document's initial state — only this untrusted-input sanitizer needs `HttpError`/Node-only code.
 */
const MAX_CHECKLIST_NOTE = 500;

/**
 * Validates an incoming `checklistGroups` payload against the record's own already-persisted
 * groups — a group/option is only ever recognized by matching `key` against what the server itself
 * generated at creation (`buildDefaultChecklistGroups`), so a client can toggle `checked`/set a
 * group's free-text `note`, but can never inject a new group, rename a label, or change a group's
 * `selectionType`. For a `"single"` group, if more than one option arrives checked, only the first
 * (in the server's own option order) is kept — a defensive clamp, not a hard rejection.
 */
export function sanitizeChecklistGroups(raw: unknown, existing: ChecklistGroup[]): ChecklistGroup[] {
  if (!Array.isArray(raw)) throw new HttpError(400, "รูปแบบเช็คลิสต์ไม่ถูกต้อง");
  const incomingByKey = new Map<string, Record<string, unknown>>();
  for (const g of raw) {
    if (typeof g === "object" && g !== null && typeof (g as Record<string, unknown>).key === "string") {
      incomingByKey.set((g as Record<string, unknown>).key as string, g as Record<string, unknown>);
    }
  }
  return existing.map((group) => {
    const incoming = incomingByKey.get(group.key);
    if (!incoming) return group;
    const incomingOptions = Array.isArray(incoming.options) ? incoming.options : [];
    const checkedByKey = new Map<string, boolean>();
    for (const o of incomingOptions) {
      if (typeof o === "object" && o !== null && typeof (o as Record<string, unknown>).key === "string") {
        checkedByKey.set((o as Record<string, unknown>).key as string, (o as Record<string, unknown>).checked === true);
      }
    }
    let options: ChecklistOption[] = group.options.map((opt) => ({ ...opt, checked: checkedByKey.get(opt.key) ?? false }));
    if (group.selectionType === "single") {
      let seenChecked = false;
      options = options.map((opt) => {
        if (!opt.checked) return opt;
        if (seenChecked) return { ...opt, checked: false };
        seenChecked = true;
        return opt;
      });
    }
    const note = typeof incoming.note === "string" ? sanitizeShortText(incoming.note.slice(0, MAX_CHECKLIST_NOTE), `หมายเหตุของ ${group.title}`) : group.note;
    return { ...group, options, ...(group.note !== undefined || note !== undefined ? { note: note ?? "" } : {}) };
  });
}
