/**
 * Shared "document requirements" checklist-group model (added 2026-07-16, required-field
 * validation pass) — the printed checkbox/radio groups ("Safety", "ขนส่ง", "Logo", ฯลฯ) that both
 * Quotation and Scope of Work carry under their "ข้อกำหนดเอกสารและการส่งมอบ" section. Lives here
 * (not in scopeOfWork.ts, where `ChecklistGroup`/`ChecklistOption` were originally defined) so
 * Quotation can depend on the type/validation without depending on the Scope-of-Work domain module
 * — `src/lib/scopeOfWork.ts` re-exports both types for backward compatibility with existing
 * imports. See docs/MODULES/ScopeOfWork.md and docs/MODULES/Quotation.md.
 *
 * Pure, framework-agnostic TS (no JSX, no browser globals) — safe to value-import from both the
 * Vite frontend bundle and the Node serverless API bundle (api/_lib/*.ts), same convention as
 * src/lib/scopeOfWork.ts already followed. See that file's own header comment for why this
 * matters (quotes.tsx's module-scope JSX is the thing that must never be value-imported server-side).
 */

export interface ChecklistOption {
  key: string;
  label: string;
  checked: boolean;
}

/**
 * The real internal departments a Scope of Work's "เอกสารส่งถึง" (Documents Sent To) checklist can
 * route paperwork to — added 2026-07-23, per direct user request to actually link this checklist to
 * real people instead of being a plain printed-form checkbox list. Single source of truth for BOTH
 * the `documentsToSend` checklist group's option list below AND the `department` dropdown on the
 * User create/edit form (`src/pages/admin/UserManagementPage.tsx`) — a user's `department` must
 * match one of these labels exactly for `ScopeOfWorkDocument.tsx`'s recipient picker to find them
 * (see "Document Recipients" in docs/MODULES/ScopeOfWork.md). Deliberately literal English business
 * terms, not translated via `t()` — this is persisted business data (the actual department name),
 * not app UI chrome, same rule already applied to Company default values/audit log text (see
 * docs/CLAUDE.md's i18n section).
 */
export const DOCUMENT_RECIPIENT_DEPARTMENTS: { key: string; label: string }[] = [
  { key: "purchase", label: "Purchase" },
  { key: "project", label: "Project" },
  { key: "factory", label: "Factory" },
  { key: "technic", label: "Technic" },
  { key: "service", label: "Service" },
  { key: "accounting", label: "Accounting" },
];

export interface ChecklistGroup {
  key: string;
  title: string;
  selectionType: "single" | "multiple";
  options: ChecklistOption[];
  note?: string;
}

/**
 * The 8 mandatory groups named by the business requirement — every other group a Job Type's
 * default checklist may include (e.g. `torRequirement`, `testReportType`/`testReportLevel`) stays
 * optional. Keyed by the same `ChecklistGroup.key` values `buildDefaultChecklistGroups()`
 * (api/_lib/documentRequirements.ts) already generates for Scope of Work, reused as-is for
 * Quotation's own checklistGroups — one shared key set, not two parallel naming schemes.
 */
export const MANDATORY_CHECKLIST_GROUP_KEYS = [
  "safety",
  "transportation",
  "logo",
  "billingConditions",
  "documentsToSend",
  "namePlate",
  "deliveryDocFormat",
  "pj2",
] as const;

/** Thai label used in "กรุณาเลือก {label}"-style validation messages — matches the user-facing
 * terms named in the business requirement (ขนส่ง, Nameplate, ปจ.2, ฯลฯ), not necessarily the same
 * string as the group's on-screen `title` (which may carry extra PDF-derived wording). */
export const CHECKLIST_GROUP_THAI_LABELS: Record<string, string> = {
  safety: "Safety",
  transportation: "ขนส่ง",
  logo: "Logo",
  billingConditions: "เงื่อนไขการวางบิล",
  documentsToSend: "เอกสารส่งถึง",
  namePlate: "Nameplate",
  deliveryDocFormat: "เงื่อนไขการส่งมอบงาน",
  pj2: "ปจ.2",
};

/**
 * Option keys within a mandatory group whose selection makes that group's free-text `note` field
 * required ("อื่น ๆ" / "Etc. (โปรดระบุ)" style options) — see "Conditional Required Rules" in the
 * validation spec. A group not listed here has no "other"-style option, so its `note` is never
 * required. `logo`'s existing "etc" option already covers Logo's "อื่น ๆ" case; `safety`/
 * `transportation`/`namePlate`/`documentsToSend` gain a new "other" option (see
 * `buildDefaultChecklistGroups()`) specifically so this conditional rule has something to attach to.
 * `safety` also lists `"tor"` — the business requirement's Safety section explicitly says "If TOR
 * or Other is selected, require a reference/detail field," not just Other. Every group listed here
 * must also initialize `note: ""` in `buildDefaultChecklistGroups()` below (2026-07-16, Codex review
 * High Priority fix — `ChecklistGroupCard` only renders its detail input when `note !== undefined`,
 * so a group missing that initialization made this rule impossible to satisfy from the normal UI
 * even though the server-side check already existed).
 */
export const OTHER_OPTION_KEYS: Record<string, string[]> = {
  safety: ["tor", "other"],
  transportation: ["other"],
  logo: ["etc"],
  namePlate: ["other"],
  documentsToSend: ["other"],
};

export interface ChecklistValidationResult {
  valid: boolean;
  /** groupKey -> Thai error message, only for mandatory groups missing a selection or a required "other" detail. */
  groupErrors: Record<string, string>;
}

function isBlank(v: string | undefined): boolean {
  return !v || v.trim() === "";
}

/**
 * Every mandatory group (see `MANDATORY_CHECKLIST_GROUP_KEYS`) must have at least one checked
 * option; if the checked option is an "other"-style one (see `OTHER_OPTION_KEYS`), the group's
 * `note` must also be non-blank. A group entirely absent from `groups` (e.g. an old record saved
 * before a group existed) is treated the same as "no option checked" — never silently valid.
 * Whitespace-only `note` counts as blank, per the "whitespace-only values are invalid" rule.
 */
export function validateChecklistGroups(groups: ChecklistGroup[]): ChecklistValidationResult {
  const byKey = new Map(groups.map((g) => [g.key, g]));
  const groupErrors: Record<string, string> = {};
  for (const key of MANDATORY_CHECKLIST_GROUP_KEYS) {
    const label = CHECKLIST_GROUP_THAI_LABELS[key] ?? key;
    const group = byKey.get(key);
    const checkedOptions = group?.options.filter((o) => o.checked) ?? [];
    if (checkedOptions.length === 0) {
      groupErrors[key] = `กรุณาเลือก ${label}`;
      continue;
    }
    const otherKeys = OTHER_OPTION_KEYS[key];
    if (otherKeys && checkedOptions.some((o) => otherKeys.includes(o.key)) && isBlank(group?.note)) {
      groupErrors[key] = `กรุณาระบุรายละเอียด ${label}`;
    }
  }
  return { valid: Object.keys(groupErrors).length === 0, groupErrors };
}

/**
 * Server-authoritative default checklist-group structure, generated from a Job Type code — shared
 * (not server-only) since both the API (Quotation/Scope of Work creation) and the frontend (a
 * brand-new, not-yet-saved Quotation/Scope of Work form) need the exact same starting structure.
 * Reproduces the printed checkbox/radio groups from the reference Scope of Work PDF; every group
 * applies to every Job Type (LI/TA/SC/BF/future codes) — only the Test Report type's suggested
 * default varies. Every option starts unchecked except the two explicitly named-in-spec
 * suggestions — nothing here is ever forced/mandatory to a specific value, only mandatory to have
 * *some* valid selection (see `validateChecklistGroups` above).
 */
export function buildDefaultChecklistGroups(jobTypeCode: string): ChecklistGroup[] {
  const opt = (key: string, label: string, checked = false): ChecklistOption => ({ key, label, checked });
  return [
    {
      key: "safety", title: "Safety", selectionType: "single", note: "",
      options: [opt("100", "100%"), opt("general", "ทั่วไป"), opt("tor", "TOR / Requirement from customer"), opt("other", "อื่น ๆ")],
    },
    { key: "torRequirement", title: "TOR, Requirement from customer", selectionType: "multiple", options: [opt("tor", "TOR, Requirement from customer")] },
    {
      key: "documentsToSend", title: "เอกสารส่งถึง", selectionType: "multiple", note: "",
      // Generated from DOCUMENT_RECIPIENT_DEPARTMENTS (added 2026-07-23) rather than listed
      // separately here, so a department can never exist on the User form's dropdown without also
      // being a selectable routing option here (or vice versa) — see that constant's doc comment.
      options: [...DOCUMENT_RECIPIENT_DEPARTMENTS.map((d) => opt(d.key, d.label)), opt("other", "อื่น ๆ")],
    },
    { key: "pj2", title: "เอกสาร ปจ.2", selectionType: "single", options: [opt("has", "มี ปจ.2"), opt("none", "ไม่มี ปจ.2")] },
    {
      key: "transportation", title: "งานขนส่ง", selectionType: "single", note: "",
      options: [opt("has", "มีขนส่ง"), opt("none", "ไม่มีขนส่ง"), opt("ems", "EMS"), opt("other", "อื่น ๆ")],
    },
    {
      key: "logo", title: "Logo", selectionType: "single", note: "",
      options: [opt("huma", "มี — HUMA"), opt("greensphere", "มี — Greensphere"), opt("etc", "มี — Etc. (โปรดระบุ)"), opt("none", "ไม่มี")],
    },
    {
      key: "namePlate", title: "Name plate", selectionType: "single", note: "",
      options: [opt("aluminium", "มี — Aluminium"), opt("sticker", "มี — Sticker"), opt("sus", "มี — SUS"), opt("none", "ไม่มี"), opt("other", "อื่น ๆ")],
    },
    {
      // Job-Type-driven suggested default (per spec's explicit LI/TA examples only) — SC/BF/other
      // codes get no suggestion, structure only. Always editable afterward.
      key: "testReportType", title: "Test Report — ประเภท", selectionType: "single",
      options: [
        opt("frpTank", "FRP Tank", jobTypeCode === "TA"),
        opt("frpLining", "FRP Lining", jobTypeCode === "LI"),
        opt("pm", "PM"),
      ],
    },
    { key: "testReportLevel", title: "Test Report — ระดับรายงาน", selectionType: "single", options: [opt("full", "Report full option"), opt("normal", "Report normal option")] },
    { key: "billingConditions", title: "เงื่อนไขการวางบิล (สัญญา)", selectionType: "single", options: [opt("has", "มี"), opt("none", "ไม่มี")] },
    {
      key: "deliveryDocFormat", title: "เงื่อนไขการส่งมอบงาน", selectionType: "single",
      options: [opt("companyForm", "แบบฟอร์มบริษัท"), opt("customerForm", "แบบฟอร์มลูกค้า (แนบไฟล์)")],
    },
  ];
}

/** For a Quotation/Scope of Work record that predates `checklistGroups` (or predates a group added
 * to the builder since) — fills in any group the current builder generates but the stored document
 * doesn't have yet, appended as freshly-built (unchecked) groups; existing groups/checked state are
 * left untouched. Never removes a group the document already has, even one the current builder no
 * longer generates. See "Existing Document Compatibility": old records must load and display
 * missing requirements as incomplete, never crash or silently invent a selection.
 *
 * Also backfills a missing `note: ""` onto an existing group whose current builder definition has
 * one but the stored group predates it (2026-07-16, Codex review High Priority fix — `safety`/
 * `transportation`/`namePlate`/`documentsToSend` gained a `note` field for the "TOR/Other requires
 * detail" rule after some records were already created; without this, `ChecklistGroupCard` would
 * never render the detail input for those older records, making the requirement impossible to
 * satisfy from the UI). Never touches `checked` state or an already-present `note` value — this
 * only adds the empty input itself, never an answer. */
export function withDefaultChecklistGroups(existing: ChecklistGroup[] | undefined, jobTypeCode: string): ChecklistGroup[] {
  const groups = existing ?? [];
  const defaults = buildDefaultChecklistGroups(jobTypeCode);
  const defaultsByKey = new Map(defaults.map((g) => [g.key, g]));
  const existingKeys = new Set(groups.map((g) => g.key));
  const patched = groups.map((g) => {
    const def = defaultsByKey.get(g.key);
    if (!def) return g;
    let next = g;
    if (def.note !== undefined && next.note === undefined) next = { ...next, note: "" };
    // Backfill any option the current builder generates that this stored group predates, AND
    // reorder every option to match the builder's own canonical order — added 2026-07-23 when
    // `documentsToSend` gained a 6th "accounting" option (see DOCUMENT_RECIPIENT_DEPARTMENTS
    // above). **Reworked the same day** after a direct user report: the first version only
    // appended a missing option at the very end of the existing list, which put a newly-backfilled
    // "accounting" AFTER "อื่น ๆ" on any pre-2026-07-23 record — "other" is supposed to always be
    // the last option, immediately before the free-text note box, and a client-facing reorder is a
    // real bug, not a "minor cosmetic difference" as the original version of this comment claimed.
    // Rebuilds `options` by walking the builder's own order and looking up each key's existing
    // entry (preserving its `checked` state) or falling back to a fresh unchecked default —
    // guarantees canonical order for every record, old or new, not just newly-created ones. Any
    // option the stored group has that the current builder no longer generates (e.g. a since-
    // removed choice) is preserved, appended after — never silently dropped, per this function's
    // existing "never removes data" contract.
    const existingOptionsByKey = new Map(next.options.map((o) => [o.key, o]));
    const reordered = def.options.map((defOpt) => existingOptionsByKey.get(defOpt.key) ?? { ...defOpt });
    const extraOptions = next.options.filter((o) => !def.options.some((defOpt) => defOpt.key === o.key));
    next = { ...next, options: [...reordered, ...extraOptions] };
    return next;
  });
  const missing = defaults.filter((g) => !existingKeys.has(g.key));
  return [...patched, ...missing];
}
