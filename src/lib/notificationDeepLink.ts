/**
 * ลิงก์จากปุ่มในข้อความ LINE (2026-10-08, Tuhmo #50) — `https://…/?n=<id แจ้งเตือน>`
 *
 * เอกสารที่เปิดอยู่ไม่ได้อยู่ใน URL ของแอปโดยตั้งใจ (docs/ARCHITECTURE.md) ปุ่มจึงชี้ "แจ้งเตือน" แทน แล้วแอปพาไปเอกสาร
 * ด้วยทางเดียวกับการกดแจ้งเตือนในกระดิ่ง · พอใช้แล้วต้องลบ `n` ออกจาก URL ไม่งั้นกดรีเฟรชจะเด้งกลับไปเอกสารเดิมซ้ำ
 */

const PARAM = "n";

/** id แจ้งเตือนจาก query string · ไม่มีหรือรูปไม่ใช่ ObjectId = null */
export function readNotificationDeepLink(search: string): string | null {
  const id = new URLSearchParams(search).get(PARAM)?.trim() ?? "";
  return /^[0-9a-f]{24}$/i.test(id) ? id : null;
}

/** URL เดิมโดยตัด `n` ออก (คงพารามิเตอร์อื่นและ #hash ไว้) — ใช้กับ `history.replaceState` */
export function withoutNotificationDeepLink(href: string): string {
  const url = new URL(href);
  url.searchParams.delete(PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
}
