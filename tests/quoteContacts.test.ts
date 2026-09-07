import { describe, it, expect } from "vitest";
import {
  quoteContactsOf, normalizeContacts, primaryContactFields, contactLine, isBlankContact, blankContact,
  MAX_QUOTE_CONTACTS, type QuoteContact,
} from "../src/lib/quoteContacts";

/**
 * ผู้ติดต่อหลายคนในใบเสนอราคา (2026-09-07) — ตรึงกติกา "สามช่องเดิมเป็นกระจกของ contacts[0]" และการอ่าน
 * ใบเก่าที่ไม่มี `contacts` เลย พลาดตรงนี้แล้ว Scope of Work / AR / ค้นหา ที่อ่านสามช่องเดิมจะเห็นคนละคน
 * กับที่พิมพ์บนใบ โดยไม่มีอะไรฟ้อง
 */

const c = (name: string, extra: Partial<QuoteContact> = {}): QuoteContact => ({ id: `id-${name}`, name, position: "", phone: "", email: "", ...extra });

describe("quoteContactsOf — อ่านใบเก่าและใบใหม่ให้เป็นรายชื่อเดียวกัน", () => {
  it("ใบเก่าที่มีแค่สามช่องเดิม → ผู้ติดต่อคนเดียวจากสามช่องนั้น", () => {
    const list = quoteContactsOf({ contactName: "คุณเอ", contactPhone: "081", contactEmail: "a@x.com" });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: "คุณเอ", phone: "081", email: "a@x.com", position: "" });
  });

  it("ใบเก่าที่สามช่องว่างหมด → ไม่มีผู้ติดต่อ", () => {
    expect(quoteContactsOf({ contactName: "", contactPhone: "", contactEmail: "" })).toEqual([]);
    expect(quoteContactsOf({ contactName: "  ", contactPhone: "", contactEmail: "" })).toEqual([]);
  });

  it("มี contacts → ใช้ contacts ไม่สนสามช่องเดิม", () => {
    const list = quoteContactsOf({ contactName: "เก่า", contactPhone: "", contactEmail: "", contacts: [c("ใหม่"), c("สอง")] });
    expect(list.map((x) => x.name)).toEqual(["ใหม่", "สอง"]);
  });

  it("contacts เป็น array ว่างถือว่าไม่มี → ถอยไปใช้สามช่องเดิม", () => {
    const list = quoteContactsOf({ contactName: "เก่า", contactPhone: "", contactEmail: "", contacts: [] });
    expect(list.map((x) => x.name)).toEqual(["เก่า"]);
  });
});

describe("normalizeContacts", () => {
  it("ตัดช่องว่าง ทิ้งแถวว่างทั้งแถว และคง id", () => {
    const list = normalizeContacts([c(" คุณบี ", { phone: " 02 " }), blankContact(), c("", { email: "  " })]);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: "id- คุณบี ", name: "คุณบี", phone: "02" });
  });

  it("ตัดให้ไม่เกินเพดาน", () => {
    const many = Array.from({ length: MAX_QUOTE_CONTACTS + 3 }, (_, i) => c(`p${i}`));
    expect(normalizeContacts(many)).toHaveLength(MAX_QUOTE_CONTACTS);
  });

  it("แถวที่มีแค่ตำแหน่งไม่ถือว่าว่าง", () => {
    expect(isBlankContact(c("", { position: "ผู้จัดการ" }))).toBe(false);
    expect(normalizeContacts([c("", { position: "ผู้จัดการ" })])).toHaveLength(1);
  });
});

describe("primaryContactFields — สามช่องเดิมต้องเท่ากับคนแรกเสมอ", () => {
  it("คนแรกลงสามช่อง", () => {
    expect(primaryContactFields([c("หนึ่ง", { phone: "1", email: "1@x" }), c("สอง", { phone: "2" })]))
      .toEqual({ contactName: "หนึ่ง", contactPhone: "1", contactEmail: "1@x" });
  });
  it("ไม่มีใครเลย → ว่างทั้งสาม", () => {
    expect(primaryContactFields([])).toEqual({ contactName: "", contactPhone: "", contactEmail: "" });
  });
});

describe("contactLine — บรรทัดย่อบนใบพิมพ์", () => {
  it("ต่อ ชื่อ (ตำแหน่ง) · เบอร์ · อีเมล", () => {
    expect(contactLine(c("คุณซี", { position: "จัดซื้อ", phone: "089", email: "c@x.com" }))).toBe("คุณซี (จัดซื้อ) · 089 · c@x.com");
  });
  it("ส่วนที่ว่างหายไป ไม่เหลือจุดคั่นค้าง", () => {
    expect(contactLine(c("คุณดี", { email: "d@x.com" }))).toBe("คุณดี · d@x.com");
    expect(contactLine(c("", { phone: "090" }))).toBe("090");
    expect(contactLine(blankContact())).toBe("");
  });
});
