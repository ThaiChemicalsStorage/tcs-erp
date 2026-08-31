export interface ChecklistOption {
  key: string;
  label: string;
  checked: boolean;
  /** Optional fill-in text/number for an option that isn't a pure yes/no toggle (e.g. Job Order's
   * "HYDRO-TEST ___ BAR" / "PRIMER COAT: ___ / ___ MICRON" lines) — added for Job Order (2026-08-18,
   * Project module Stage 2), backward-compatible since it's optional and Scope of Work's existing
   * options never set it. */
  value?: string;
  /**
   * ช่องกรอกที่ **สอง** ของตัวเลือกเดียวกัน — ฟอร์ม FM-PJ-01 ตัวจริงมีสามบรรทัดที่เว้นช่องไว้สองช่อง
   * ("PRIMER COAT : ______ / ______ MICRON" คือชื่อสี แล้วตามด้วยความหนา) ก่อนหน้านี้มีช่องเดียว
   * ความหนาจึงต้องพิมพ์ปนไปกับชื่อสี — ยืนยันกับฟอร์มกระดาษตัวจริงเมื่อ 2026-08-31
   *
   * optional และเป็นการเพิ่มล้วน ๆ เหมือนตอนเพิ่ม `value` เมื่อ 2026-08-18: ตัวเลือกที่ไม่ได้ตั้งค่านี้
   * จะไม่มีช่องที่สองโผล่มาทั้งบนหน้าจอและบนใบพิมพ์
   */
  value2?: string;
  /**
   * หน่วยที่พิมพ์ต่อท้าย `value` บนกระดาษ ("BAR" ของ HYDRO - TEST, "TON" ของ MOBILE CRANE)
   * เป็น**ข้อความที่พิมพ์อยู่บนฟอร์มอยู่แล้ว** ไม่ใช่สิ่งที่ผู้ใช้กรอก จึงถูกสร้างใหม่จากโค้ดทุกครั้ง
   * ที่อ่านเอกสาร (ดู withJobOrderChecklistGroups()) และไม่เคยถูกอ่านกลับมาจากฐานข้อมูล
   */
  unit?: string;
  /** หน่วยที่พิมพ์ต่อท้าย `value2` — ตอนนี้มีแต่ "MICRON" ของบรรทัดงานสีสามบรรทัด */
  unit2?: string;
  /**
   * บรรทัดรายละเอียดย่อยใต้ตัวเลือกที่ติ๊กไว้ (ฝ่ายโครงการขอไว้ 2026-08-27:
   * "ติ๊กเลือกได้ว่าจะเอาตัวไหน แบบหลายหัวข้อและสามารถเพิ่มเติมรายละเอียดย่อยได้")
   *
   * optional และเป็นการ**เพิ่มล้วน ๆ** — Scope of Work ไม่ได้ตั้งค่านี้เลย ChecklistGroupCard จึงไม่
   * เรนเดอร์อะไรเพิ่มให้ ตรงตามแบบเดียวกับตอนเพิ่ม `value` เมื่อ 2026-08-18
   * ต่างจาก `value` ตรงที่เป็นรายการหลายบรรทัด และแสดงเฉพาะเมื่อตัวเลือกถูกติ๊กแล้วเท่านั้น
   */
  details?: string[];
}

/** Extra `documentRecipients` key for recipients picked freely from the whole staff directory,
 * independent of the `documentsToSend` checklist departments (added 2026-08-07 — "ผู้รับเพิ่มเติม").
 * Deliberately NOT `"other"`: that key already exists as a `documentsToSend` checklist option with
 * its own note-required validation (see OTHER_OPTION_KEYS), and the two must stay orthogonal. */
export const ADDITIONAL_RECIPIENT_KEY = "additional";
export const ADDITIONAL_RECIPIENT_LABEL = "ผู้รับเพิ่มเติม";

/** "Store" added 2026-08-18 (Project module Stage 2) — the Material Requisition reference PDF
 * (FM-ST-04) has a distinct "แผนกสโตร์" (Store dept) sign-off, separate from Factory/Production.
 * ASSUMPTION, not confirmed against real org structure yet — flagged for owner sign-off; if Store
 * turns out to just be a function within Factory, this entry should be removed rather than kept as
 * dead org-chart data. */
export const DOCUMENT_RECIPIENT_DEPARTMENTS: { key: string; label: string }[] = [
  { key: "purchase", label: "Purchase" },
  { key: "project", label: "Project" },
  { key: "factory", label: "Factory" },
  { key: "store", label: "Store" },
  { key: "technic", label: "Technic" },
  { key: "service", label: "Service" },
  { key: "accounting", label: "Accounting" },
];

/** Every key `documentRecipients` may carry — the 6 department keys + the free-pick `additional`
 * key. The server-side recipient-visibility filters must build their `$or` from THIS list, or a
 * person picked only under "ผู้รับเพิ่มเติม" could get the bell notification yet be unable to find
 * the record in the app. Four call sites today: the Scope of Work list
 * (`api/_lib/scopeOfWorkHandler.ts`), Global Search (`api/_lib/searchDocuments.ts`), the dashboard
 * counts (`api/dashboard/index.ts`), and — since 2026-08-31 — `recipientScopeOfWorkIds()` in
 * `api/_lib/visibility.ts`, which is what lets a Scope's recipients see the **Cost Control** linked
 * to it ("Scope of work เวลาที่จะส่งไปให้คนอื่น มันจะมาพร้อมกับ Cost control ด้วย"). */
export const ALL_RECIPIENT_KEYS: string[] = [...DOCUMENT_RECIPIENT_DEPARTMENTS.map((d) => d.key), ADDITIONAL_RECIPIENT_KEY];

export interface ChecklistGroup {
  key: string;
  title: string;
  selectionType: "single" | "multiple";
  options: ChecklistOption[];
  note?: string;
}

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

export const OTHER_OPTION_KEYS: Record<string, string[]> = {
  safety: ["tor", "other"],
  transportation: ["other"],
  logo: ["etc"],
  namePlate: ["other"],
  documentsToSend: ["other"],
};

export interface ChecklistValidationResult {
  valid: boolean;
  groupErrors: Record<string, string>;
}

function isBlank(v: string | undefined): boolean {
  return !v || v.trim() === "";
}

// ตรวจสอบว่าทุกกลุ่มเช็คลิสต์ที่บังคับมีการเลือกอย่างน้อยหนึ่งตัวเลือก และกรอกรายละเอียดเมื่อเลือก "อื่น ๆ"
// Validates that every mandatory checklist group has a selection, and a note when an "other" option is checked
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

// สร้างโครงสร้างกลุ่มเช็คลิสต์เริ่มต้นตามประเภทงาน สำหรับใบเสนอราคา/Scope of Work ที่สร้างใหม่
// Builds the default checklist-group structure for a given Job Type code
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

// เติมกลุ่มเช็คลิสต์ที่ยังขาดให้เอกสารเก่า และจัดเรียงตัวเลือกให้ตรงกับลำดับมาตรฐานปัจจุบัน โดยไม่แตะค่าที่เลือกไว้เดิม
// Backfills missing checklist groups/options onto an older document and reorders to the current canonical order, without touching existing selections
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
    const existingOptionsByKey = new Map(next.options.map((o) => [o.key, o]));
    const reordered = def.options.map((defOpt) => existingOptionsByKey.get(defOpt.key) ?? { ...defOpt });
    const extraOptions = next.options.filter((o) => !def.options.some((defOpt) => defOpt.key === o.key));
    next = { ...next, options: [...reordered, ...extraOptions] };
    return next;
  });
  const missing = defaults.filter((g) => !existingKeys.has(g.key));
  return [...patched, ...missing];
}
