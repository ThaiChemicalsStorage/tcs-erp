/**
 * "มีอะไรใหม่" (What's New) panel content — added 2026-07-23 per direct user request for an
 * in-app update log. A plain hand-maintained list, not database-backed: these are short,
 * end-user-facing announcements (not the technical changelog in docs/CHANGELOG.md), so they're
 * authored directly in Thai and kept here like any other seed/persisted business content (see
 * CLAUDE.md's i18n rule on persisted content vs. app chrome). Add a new entry to the TOP of
 * WHATS_NEW_ENTRIES whenever a feature genuinely worth telling users about ships — not every
 * internal fix or refactor belongs here.
 *
 * "Seen" state is a per-user client-side UI preference, not business data — stored in
 * `localStorage`, same convention as `tour.ts`'s guided-tour completion tracking.
 */

export interface WhatsNewEntry {
  id: string;
  date: string; // yyyy-mm-dd
  title: string;
  bullets: string[];
}

// Newest first.
export const WHATS_NEW_ENTRIES: WhatsNewEntry[] = [
  {
    id: "2026-07-23-revision-note",
    date: "2026-07-23",
    title: "สรุปการแก้ไขอัตโนมัติสำหรับใบที่แก้ไข (Revision Note)",
    bullets: [
      "ใบเสนอราคาและ Scope of Work ที่ถูกกด 'แก้ไข' (Rewrite) จะมีปุ่ม 'สร้างสรุปการแก้ไขอัตโนมัติ' ให้ระบบช่วยตรวจและสรุปว่าแก้ตรงไหนไปบ้างเป็นข้อความให้อัตโนมัติ",
      "ข้อความที่สร้างให้แก้ไข เพิ่มเติม หรือลบทิ้งแล้วพิมพ์เองได้ตามต้องการ ระบบจะไม่เขียนทับสิ่งที่พิมพ์ไว้เองจนกว่าจะกดปุ่มสร้างสรุปซ้ำอีกครั้ง",
    ],
  },
  {
    id: "2026-07-23-doc-recipients",
    date: "2026-07-23",
    title: "ส่งเอกสาร Scope of Work ทางอีเมลถึงผู้รับจริงในแต่ละแผนก",
    bullets: [
      "เลือกผู้รับเอกสารของแต่ละแผนกได้จริง (อ้างอิงจากแผนกที่ตั้งไว้ตอนสร้างพนักงาน) แล้วกด 'ส่งอีเมลแจ้งผู้รับเอกสาร' เพื่อส่งอีเมลแจ้งได้ทันที",
      "ผู้ที่ถูกเลือกเป็นผู้รับจะได้รับการแจ้งเตือนในระบบ (กระดิ่งแจ้งเตือน) และเห็นเอกสารในหน้า Scope of Work ของตัวเองด้วย แม้จะไม่ใช่คนสร้างเอกสารนั้น",
    ],
  },
  {
    id: "2026-07-23-viewall",
    date: "2026-07-23",
    title: "สิทธิ์ดู Scope of Work ของผู้อื่น",
    bullets: [
      "เพิ่มสิทธิ์ 'ดู Scope of Work ของผู้อื่น' เหมือนกับใบเสนอราคา ผู้ที่ไม่มีสิทธิ์นี้จะเห็นเฉพาะรายการที่ตัวเองสร้างเท่านั้นในหน้ารายการและผลการค้นหา",
    ],
  },
  {
    id: "2026-07-23-payment-conditions",
    date: "2026-07-23",
    title: "เงื่อนไขการชำระเงินแบบยืดหยุ่น",
    bullets: [
      "กำหนดงวดชำระเงินของ Scope of Work ได้หลายงวดตามต้องการ พร้อมเลือกวิธีชำระ Cash/Credit และจำนวนวันเครดิตแยกแต่ละงวด",
      "มีตัวเลือกสำเร็จรูป 3 แบบ (40/60, 30/70, Credit 100%) ให้เลือกใช้ด่วน และยังแก้ไข/เพิ่ม/ลบงวดเองได้เสมอ",
    ],
  },
  {
    id: "2026-07-23-dashboard-sow",
    date: "2026-07-23",
    title: "จำนวน Scope of Work บนหน้า Dashboard",
    bullets: ["หน้า Dashboard แสดงจำนวนเอกสาร Scope of Work ทั้งหมด แยกฉบับร่าง/ฉบับสมบูรณ์ ให้แล้ว"],
  },
  {
    id: "2026-07-22-scope-of-work-page",
    date: "2026-07-22",
    title: "หน้า Scope of Work แยกต่างหาก และปุ่มแก้ไข (Rewrite)",
    bullets: [
      "เพิ่มเมนู 'Scope of Work' แยกต่างหากในแถบด้านข้าง สำหรับเปิดดูรายการ Scope of Work ทั้งหมดโดยไม่ต้องเข้าผ่านใบเสนอราคา",
      "เพิ่มปุ่ม 'แก้ไข' (Rewrite) สำหรับสร้างฉบับแก้ไขใหม่จากใบเดิม ใช้ได้ทั้งใบเสนอราคาและ Scope of Work พร้อมตัวกรองพนักงานขายในหน้ารายการ",
    ],
  },
];

const STORAGE_KEY = "tcs_erp_whats_new_last_seen_id_by_user";

function readLastSeenMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function hasUnseenWhatsNew(userId: string): boolean {
  if (WHATS_NEW_ENTRIES.length === 0) return false;
  return readLastSeenMap()[userId] !== WHATS_NEW_ENTRIES[0].id;
}

export function markWhatsNewSeen(userId: string): void {
  if (WHATS_NEW_ENTRIES.length === 0) return;
  try {
    const map = readLastSeenMap();
    map[userId] = WHATS_NEW_ENTRIES[0].id;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Storage unavailable (private browsing, quota) — the badge will just reappear next
    // sign-in, a harmless degradation, not a functional failure.
  }
}
