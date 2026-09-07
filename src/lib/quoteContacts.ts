/**
 * ผู้ติดต่อหลายคนในใบเสนอราคา (2026-09-07) — เจ้าของสั่ง *"ใบเสนอราคาสามารถเพิ่มผู้ติดต่อได้"* และเลือกให้
 * **พิมพ์เพิ่มในใบเสนอราคาเท่านั้น** ไม่แตะทะเบียนลูกค้า (ซึ่งยังมีผู้ติดต่อหลักคนเดียวเหมือนเดิม)
 *
 * ไฟล์นี้**ไม่ import อะไรเลย**โดยตั้งใจ — เซิร์ฟเวอร์ (`api/handlers/quotes.ts`) ต้อง import ตรงเพื่อคิด
 * "กระจก" ของสามช่องเดิม ถ้าไปอยู่ใน `quotes.ts` จะลาก `apiClient.ts` เข้า Node ไปด้วย
 * เหมือนเหตุผลที่ `quoteMath.ts` แยกออกมาก่อนหน้านี้
 *
 * กติกากระจก: `Quote.contactName/contactPhone/contactEmail` (สามช่องเดิม) **ยังอยู่และเท่ากับ `contacts[0]`
 * เสมอ** เซิร์ฟเวอร์เป็นคนเขียน — Scope of Work, AR, ค้นหา, ใบพิมพ์เดิม และด่านตรวจก่อนอนุมัติ อ่านสามช่องนั้น
 * อยู่แล้วจึงไม่ต้องแก้สักบรรทัด ส่วนใบที่บันทึกก่อนวันนี้ไม่มี `contacts` เลย — `quoteContactsOf()` แปลง
 * สามช่องเดิมเป็นผู้ติดต่อคนเดียวตอนอ่าน ไม่ได้ทำ migration
 */

export interface QuoteContact {
  id: string;
  name: string;
  /** ตำแหน่ง/บทบาท เช่น "ผู้จัดการฝ่ายจัดซื้อ" — ช่องใหม่ ไม่มีในสามช่องเดิม จึงไม่มีอะไรให้กระจก */
  position: string;
  phone: string;
  email: string;
}

/** สามช่องเดิมบน `Quote` ที่ยังเป็นกระจกของผู้ติดต่อหลัก */
export interface LegacyContactFields {
  contactName: string;
  contactPhone: string;
  contactEmail: string;
}

/** เพดานต่อใบ — พอสำหรับงานจริง และกันบล็อกผู้ซื้อบนใบพิมพ์ (ซึ่งซ้ำทุกหน้าใน thead) สูงจนดันเนื้อหา */
export const MAX_QUOTE_CONTACTS = 10;

export function newContactId(): string {
  return `ct-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function blankContact(): QuoteContact {
  return { id: newContactId(), name: "", position: "", phone: "", email: "" };
}

export function isBlankContact(c: QuoteContact): boolean {
  return !c.name.trim() && !c.position.trim() && !c.phone.trim() && !c.email.trim();
}

/** ตัดช่องว่างหัวท้าย ทิ้งแถวที่ว่างทั้งแถว และตัดให้ไม่เกินเพดาน — ใช้ทั้งตอนส่งขึ้นเซิร์ฟเวอร์และตอนพิมพ์ */
export function normalizeContacts(list: readonly QuoteContact[]): QuoteContact[] {
  return list
    .map((c) => ({ id: c.id, name: c.name.trim(), position: c.position.trim(), phone: c.phone.trim(), email: c.email.trim() }))
    .filter((c) => !isBlankContact(c))
    .slice(0, MAX_QUOTE_CONTACTS);
}

/**
 * รายชื่อผู้ติดต่อที่ควรแสดง — มี `contacts` ใช้เลย · ใบเก่าที่ไม่มีแต่สามช่องเดิมมีค่า → คืนคนเดียวจากสามช่อง
 * นั้น (id คงที่ เพื่อให้เทียบก่อน/หลังใน revision diff ได้) · ไม่มีอะไรเลย → `[]`
 */
export function quoteContactsOf(q: LegacyContactFields & { contacts?: QuoteContact[] }): QuoteContact[] {
  if (q.contacts && q.contacts.length > 0) return q.contacts;
  const legacy: QuoteContact = { id: "legacy", name: q.contactName ?? "", position: "", phone: q.contactPhone ?? "", email: q.contactEmail ?? "" };
  return isBlankContact(legacy) ? [] : [legacy];
}

/** สามช่องเดิมที่ต้องเขียนลงใบ ให้เท่ากับผู้ติดต่อคนแรก — ว่างทั้งสามเมื่อไม่มีใครเลย */
export function primaryContactFields(list: readonly QuoteContact[]): LegacyContactFields {
  const first = list[0];
  return {
    contactName: first?.name ?? "",
    contactPhone: first?.phone ?? "",
    contactEmail: first?.email ?? "",
  };
}

/** บรรทัดย่อสำหรับใบพิมพ์และหมายเหตุการแก้ไข: `ชื่อ (ตำแหน่ง) · เบอร์ · อีเมล` ตัดส่วนที่ว่างออก */
export function contactLine(c: QuoteContact): string {
  const name = c.position.trim() ? `${c.name.trim()} (${c.position.trim()})` : c.name.trim();
  return [name, c.phone.trim(), c.email.trim()].filter(Boolean).join(" · ");
}
