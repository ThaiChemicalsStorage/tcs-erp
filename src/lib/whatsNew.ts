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
    id: "2026-07-24-sow-attachments",
    date: "2026-07-24",
    title: "แนบไฟล์กับ Scope of Work ได้แล้ว",
    bullets: [
      "แนบไฟล์เพิ่มเติม (เช่น PO ลูกค้า, Drawing) ได้ในการ์ด 'ผู้รับเอกสาร' ของหน้า Scope of Work — สูงสุด 10 ไฟล์ ไฟล์ละไม่เกิน 3 MB",
      "ไฟล์ที่แนบจะถูกส่งเป็นลิงก์ในอีเมลถึงผู้รับเอกสารโดยอัตโนมัติ ผู้รับกดเปิดไฟล์จากอีเมลได้ทันที",
      "ตัวไฟล์ถูกเก็บในที่เก็บไฟล์แยกต่างหาก ไม่กินพื้นที่ฐานข้อมูลของระบบ",
    ],
  },
  {
    id: "2026-07-24-user-manual",
    date: "2026-07-24",
    title: "คู่มือการใช้งานระบบ (PDF)",
    bullets: [
      "มีคู่มือการใช้งานระบบฉบับเต็มเป็นไฟล์ PDF แล้ว ครอบคลุมทุกเมนูตั้งแต่เข้าสู่ระบบ ใบเสนอราคา Scope of Work ใบส่งมอบสินค้า ไปจนถึงส่วนผู้ดูแลระบบ พร้อมคำถามพบบ่อย",
      "กดปุ่มสีทอง 'คู่มือการใช้งาน' ที่แถบด้านบนของทุกหน้าเพื่อเปิดอ่านได้ทันที",
    ],
  },
  {
    id: "2026-07-24-delivery-order-print",
    date: "2026-07-24",
    title: "ใบส่งมอบสินค้า: พิมพ์แยกใบต่องวด และแบบฟอร์มพิมพ์โฉมใหม่ตามฟอร์มบริษัท",
    bullets: [
      "แต่ละงวดชำระเงินมีปุ่ม 'พิมพ์ใบส่งมอบงวดนี้' ของตัวเอง — พิมพ์ออกมาเป็นเอกสารอิสระ 1 ใบต่อ 1 งวด แสดงเฉพาะเลขที่ วันที่ รายการสินค้า และ Remark ของงวดนั้นเท่านั้น (งวดมัดจำ/Down Payment ไม่มีใบส่งมอบ)",
      "แบบฟอร์มพิมพ์ถูกออกแบบใหม่ทั้งหมดให้ตรงกับฟอร์มจริงของบริษัท (FM-SL-05) — หัวกระดาษโลโก้พร้อมข้อมูลบริษัทภาษาอังกฤษ ตารางรายการเส้นขอบสีดำ ช่องลายเซ็นผู้ตรวจรับ/ผู้ส่ง ครบตามต้นฉบับ",
      "ลิงก์เว็บไซต์และวันที่ที่เบราว์เซอร์เคยแทรกที่ขอบกระดาษตอนพิมพ์ ถูกเอาออกให้อัตโนมัติแล้ว ไม่ต้องไปปิดตั้งค่าเองอีก",
    ],
  },
  {
    id: "2026-07-23-delivery-order",
    date: "2026-07-23",
    title: "โมดูลใหม่: ใบส่งมอบสินค้าและบริการ (Delivery Order)",
    bullets: [
      "สร้างใบส่งมอบสินค้าได้จากหน้า Scope of Work (ปุ่ม 'สร้างใบส่งมอบสินค้า') — ข้อมูลลูกค้าและรายการสินค้าถูกดึงมาให้อัตโนมัติ",
      "ติ๊กเลือกได้ว่างวดไหนส่งมอบสินค้าตัวไหนบ้าง พร้อมกรอกเลขที่/วันที่/Remark แยกแต่ละงวด",
      "มีเมนู 'ใบส่งมอบสินค้า' แยกในแถบด้านข้างสำหรับเปิดดูรายการทั้งหมด เหมือน Scope of Work และใบเสนอราคา",
    ],
  },
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
